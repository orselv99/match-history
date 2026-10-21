import * as THREE from 'three';
import { Circuit } from '../game/Circuit.ts';
import { type CircuitId } from '../data/circuits.ts';
import { Vehicle } from '../game/Vehicle.ts';
import { InputManager } from './InputManager.ts';
import { AudioManager } from './AudioManager.ts';
import { LapTimer } from '../game/LapTimer.ts';
import { ReplayRecorder } from '../replay/ReplayRecorder.ts';
import { ReplayPlayer } from '../replay/ReplayPlayer.ts';
import { OpponentManager } from '../game/OpponentManager.ts';
import { SkidMarkManager } from '../game/SkidMarkManager.ts';
import { CollisionManager } from '../game/CollisionManager.ts';
import { EnvironmentManager, TimeOfDay, WeatherType } from '../game/EnvironmentManager.ts';
import { MinimapRenderer } from '../game/MinimapRenderer.ts';
import { CameraController, CameraViewMode } from './CameraController.ts';
import { SpeedFX } from '../game/SpeedFX.ts';
import { GraphicsSettings, graphicsSettingsManager } from './GraphicsSettingsManager.ts';
import { MirrorRenderer } from './MirrorRenderer.ts';
import { StartCutsceneController } from './StartCutsceneController.ts';
import { StandingsManager } from './StandingsManager.ts';
import { ModalManager } from '../ui/ModalManager.ts';
import { showToast } from '../ui/Toast.ts';
import { MatchSummaryMetadata, RaceResultEntry } from '../replay/ReplayTypes.ts';

// Refactored Subsystems
import { RenderEngine } from './engine/RenderEngine.ts';
import { GameLoop } from './engine/GameLoop.ts';
import { GameStateManager } from './lifecycle/GameStateManager.ts';
import { RaceLifecycleManager } from './lifecycle/RaceLifecycleManager.ts';
import { RaceSimulationCoordinator } from './simulation/RaceSimulationCoordinator.ts';
import { NametagRenderer } from './simulation/NametagRenderer.ts';

export type {
  GameMode,
  RaceState,
  KeyInputState,
  LeaderboardRacerEntry,
  GameUIState,
} from '../types/game.ts';
import type {
  GameMode,
  RaceState,
  LeaderboardRacerEntry,
  GameUIState,
} from '../types/game.ts';

/**
 * 레이싱 게임 메인 엔진 파사드 (Facade)
 * - 렌더 엔진(RenderEngine) 및 게임 루프(GameLoop) 통합
 * - 레이스 세션 생명주기(RaceLifecycleManager) 및 시뮬레이션(RaceSimulationCoordinator) 조율
 * - 외부(main.ts, UI 모달)에 대해 100% 하위 호환성을 보장하는 단일 공개 API 제공
 */
export class Game {
  public renderEngine: RenderEngine;
  public gameLoop: GameLoop;
  public stateManager: GameStateManager;
  public lifecycleManager: RaceLifecycleManager;
  public simulationCoordinator: RaceSimulationCoordinator;
  public nametagRenderer: NametagRenderer;

  public circuit: Circuit;
  public playerVehicle: Vehicle;
  public replayPlayer: ReplayPlayer;
  public opponentManager: OpponentManager;
  public skidMarkManager: SkidMarkManager;
  public collisionManager: CollisionManager;
  public input: InputManager;
  public audio: AudioManager;
  public lapTimer: LapTimer;
  public recorder: ReplayRecorder;
  public cameraController: CameraController;
  public environmentManager: EnvironmentManager;
  public mirrorRenderer: MirrorRenderer;
  public startCutsceneController: StartCutsceneController;
  public standingsManager: StandingsManager;

  private minimapCanvas: HTMLCanvasElement;
  private minimapCtx: CanvasRenderingContext2D | null;

  // 이벤트 콜백
  public onFinishCallback?: (metadata: MatchSummaryMetadata) => void;
  public onStateUpdate?: (state: GameUIState) => void;
  public onSectorPassed?: (driverName: string, sectorName: string, timeMs: number) => void;

  constructor(container: HTMLElement, minimapCanvas: HTMLCanvasElement) {
    this.minimapCanvas = minimapCanvas;
    this.minimapCtx = minimapCanvas.getContext('2d');

    // 1. 렌더 엔진 및 카메라 컨트롤러
    this.renderEngine = new RenderEngine(container);
    const initWidth = Math.max(container.clientWidth || window.innerWidth, 1088);
    const initHeight = Math.max(container.clientHeight || window.innerHeight, 612);
    this.cameraController = new CameraController(65, initWidth / initHeight, 0.1, 1000);
    this.renderEngine.camera = this.cameraController.camera;

    // 2. 환경 및 오디오
    this.environmentManager = new EnvironmentManager(this.renderEngine.scene);
    this.audio = new AudioManager();

    // 3. 서킷 및 차량 씬 그래프
    this.circuit = new Circuit();
    this.renderEngine.scene.add(this.circuit.group);

    this.playerVehicle = new Vehicle(false);
    this.renderEngine.scene.add(this.playerVehicle.mesh);

    this.replayPlayer = new ReplayPlayer();
    this.replayPlayer.onPlaybackEnd = () => {
      this.handleReplayFinish();
    };
    this.replayPlayer.onStateChange = (isPlaying) => {
      if (!isPlaying) {
        this.cameraController.resetShake();
        this.audio.pauseEngine();
      }
    };
    this.renderEngine.scene.add(this.replayPlayer.ghostVehicle.mesh);
    this.replayPlayer.opponentVehicles.forEach(v => this.renderEngine.scene.add(v.mesh));

    this.opponentManager = new OpponentManager(this.circuit);
    this.opponentManager.onSectorPassed = (name, sectorName, timeMs) => {
      if (this.onSectorPassed) {
        this.onSectorPassed(name, sectorName, timeMs);
      }
    };
    this.renderEngine.scene.add(this.opponentManager.group);

    // 4. 스키드마크 & 충돌 매니저
    this.skidMarkManager = new SkidMarkManager();
    this.renderEngine.scene.add(this.skidMarkManager.group);

    this.collisionManager = new CollisionManager();
    this.renderEngine.scene.add(this.collisionManager.group);
    this.collisionManager.onCollision = (ev) => {
      if (ev.isPlayerInvolved) {
        this.cameraController.triggerShake(ev.impactSpeed * 0.04);
        this.audio.playCrashImpact(ev.impactSpeed);
      } else {
        const dist = ev.contactPoint.distanceTo(this.playerVehicle.position);
        if (dist < 45.0) {
          this.audio.playCrashImpact(ev.impactSpeed * 0.6);
        }
      }
    };

    // 5. 입력, 타이머, 백미러, 컷씬
    this.input = new InputManager();
    this.lapTimer = new LapTimer(3);
    this.recorder = new ReplayRecorder();
    this.mirrorRenderer = new MirrorRenderer(this.renderEngine.renderer);
    this.startCutsceneController = new StartCutsceneController(this.circuit, this.cameraController, this.input);
    this.standingsManager = new StandingsManager();
    this.nametagRenderer = new NametagRenderer();

    // 6. 경기 생명주기 및 상태 관리자 초기화
    this.lifecycleManager = new RaceLifecycleManager({
      getCircuit: () => this.circuit,
      getPlayerVehicle: () => this.playerVehicle,
      getOpponentManager: () => this.opponentManager,
      getSkidMarkManager: () => this.skidMarkManager,
      getCollisionManager: () => this.collisionManager,
      getStandingsManager: () => this.standingsManager,
      getLapTimer: () => this.lapTimer,
      getRecorder: () => this.recorder,
      getReplayPlayer: () => this.replayPlayer,
      getAudio: () => this.audio,
      getCameraController: () => this.cameraController,
      getStartCutsceneController: () => this.startCutsceneController,
      getEnvironmentManager: () => this.environmentManager,
      clearSpeedFX: () => this.renderEngine.speedFX.clear(),
      getMode: () => this.stateManager.mode,
      setMode: (m) => this.stateManager.setMode(m),
      onFinish: (metadata) => {
        if (this.onFinishCallback) {
          this.onFinishCallback(metadata);
        }
      },
    });

    this.stateManager = new GameStateManager({
      getPlayerVehicle: () => this.playerVehicle,
      getOpponentManager: () => this.opponentManager,
      getReplayPlayer: () => this.replayPlayer,
      getAudio: () => this.audio,
      getCameraController: () => this.cameraController,
      getCircuit: () => this.circuit,
      getSkidMarkManager: () => this.skidMarkManager,
      getCollisionManager: () => this.collisionManager,
      getLapTimer: () => this.lapTimer,
      getRecorder: () => this.recorder,
      getLifecycleManager: () => this.lifecycleManager,
      clearSpeedFX: () => this.renderEngine.speedFX.clear(),
      updateWeatherScreenFX: () => this.lifecycleManager.updateWeatherScreenFX(),
    });

    this.simulationCoordinator = new RaceSimulationCoordinator({
      getCircuit: () => this.circuit,
      getPlayerVehicle: () => this.playerVehicle,
      getOpponentManager: () => this.opponentManager,
      getSkidMarkManager: () => this.skidMarkManager,
      getCollisionManager: () => this.collisionManager,
      getStandingsManager: () => this.standingsManager,
      getLapTimer: () => this.lapTimer,
      getRecorder: () => this.recorder,
      getReplayPlayer: () => this.replayPlayer,
      getAudio: () => this.audio,
      getCameraController: () => this.cameraController,
      getStartCutsceneController: () => this.startCutsceneController,
      getEnvironmentManager: () => this.environmentManager,
      getMirrorRenderer: () => this.mirrorRenderer,
      getSpeedFX: () => this.renderEngine.speedFX,
      getInput: () => this.input,
      getLifecycle: () => this.lifecycleManager,
      onSectorPassed: (name, sectorName, timeMs) => this.onSectorPassed?.(name, sectorName, timeMs),
      onStateUpdate: (state) => this.onStateUpdate?.(state),
    });

    // 7. 그래픽 프리셋 적용 및 환경/모드 초기 세팅
    this.applyGraphicsSettings(graphicsSettingsManager.getSettings());
    this.setEnvironment('noon', 'clear');
    this.setMode('TITLE');

    // 8. 윈도우 인터랙션 이벤트 리스너 등록
    this.bindWindowEvents();

    // 9. 메인 렌더 루프 가동
    this.gameLoop = new GameLoop();
    this.gameLoop.setTickHandler((delta, deltaMs) => this.onTick(delta, deltaMs));
    this.gameLoop.start();
  }

  // --- 기존 코드 100% 호환을 위한 게터/세터 ---
  public get scene(): THREE.Scene { return this.renderEngine.scene; }
  public get camera(): THREE.PerspectiveCamera { return this.cameraController.camera; }
  public get renderer(): THREE.WebGLRenderer { return this.renderEngine.renderer; }
  public get speedFX(): SpeedFX { return this.renderEngine.speedFX; }
  public get container(): HTMLElement { return this.renderEngine.container; }

  public get mode(): GameMode { return this.stateManager.mode; }
  public set mode(m: GameMode) { this.stateManager.mode = m; }

  public get raceState(): RaceState { return this.lifecycleManager.raceState; }
  public set raceState(s: RaceState) { this.lifecycleManager.raceState = s; }

  public get isPaused(): boolean { return this.lifecycleManager.isPaused; }
  public set isPaused(p: boolean) { this.lifecycleManager.isPaused = p; }

  public get playerGridSlot(): number { return this.lifecycleManager.playerGridSlot; }
  public set playerGridSlot(s: number) { this.lifecycleManager.playerGridSlot = s; }

  public get currentDriverName(): string { return this.lifecycleManager.currentDriverName; }
  public set currentDriverName(n: string) { this.lifecycleManager.currentDriverName = n; }

  public get currentCircuitId(): CircuitId { return this.lifecycleManager.currentCircuitId; }
  public set currentCircuitId(c: CircuitId) { this.lifecycleManager.currentCircuitId = c; }

  public get currentTimeOfDay(): TimeOfDay { return this.lifecycleManager.currentTimeOfDay; }
  public set currentTimeOfDay(t: TimeOfDay) { this.lifecycleManager.currentTimeOfDay = t; }

  public get currentWeather(): WeatherType { return this.lifecycleManager.currentWeather; }
  public set currentWeather(w: WeatherType) { this.lifecycleManager.currentWeather = w; }

  public get currentReplayMetadata(): MatchSummaryMetadata | null | undefined { return this.lifecycleManager.currentReplayMetadata; }
  public set currentReplayMetadata(m: MatchSummaryMetadata | null | undefined) { this.lifecycleManager.currentReplayMetadata = m; }

  public get showNametagsSetting(): boolean { return this.nametagRenderer.showNametagsSetting; }
  public set showNametagsSetting(v: boolean) { this.nametagRenderer.showNametagsSetting = v; }

  // --- 공개 API 메소드 (Delegation) ---
  public setDriverName(name: string): void {
    this.lifecycleManager.setDriverName(name);
  }

  public setEnvironment(timeOfDay: TimeOfDay, weather: WeatherType): void {
    this.lifecycleManager.setEnvironment(timeOfDay, weather);
  }

  public updateWeatherScreenFX(): void {
    this.lifecycleManager.updateWeatherScreenFX();
  }

  public toggleCameraView(): CameraViewMode {
    const mode = this.cameraController.toggleViewMode();
    const is1P = mode === 'FIRST_PERSON';
    this.playerVehicle.setFirstPersonView(is1P);
    const btn = document.getElementById('camera-view-label');
    if (btn) {
      btn.textContent = is1P ? '1P' : '3P';
    }
    showToast(is1P ? '🎥 1인칭 본넷 뷰' : '🎥 3인칭 체이스 뷰', 1600);
    return mode;
  }

  public loadCircuit(circuitId: CircuitId): void {
    this.lifecycleManager.currentCircuitId = circuitId;
    this.circuit.loadCircuit(circuitId);
    this.circuit.setNightMode(this.lifecycleManager.currentTimeOfDay === 'night');
    this.resetVehicleToStart();
    this.drawMinimap();
  }

  public resetVehicleToStart(slotIndex?: number): void {
    this.lifecycleManager.resetVehicleToStart(slotIndex);
  }

  public startRace(withCutscene: boolean = true): void {
    this.lifecycleManager.startRace(withCutscene);
  }

  public setupStartCutscene(): void {
    this.lifecycleManager.setupStartCutscene();
  }

  public updateStartCutscene(delta: number): void {
    this.simulationCoordinator.updateStartCutscene(delta);
  }

  public skipStartCutscene(): void {
    this.lifecycleManager.skipStartCutscene();
  }

  public startCountdown(force: boolean = false): void {
    this.lifecycleManager.startCountdown(force);
  }

  public handleReplayFinish(): void {
    this.lifecycleManager.handleReplayFinish();
  }

  public computeRaceResults(): RaceResultEntry[] {
    return this.lifecycleManager.computeRaceResults();
  }

  public pause(): void {
    this.lifecycleManager.pause();
  }

  public resume(): void {
    this.lifecycleManager.resume();
  }

  public restartRace(): void {
    this.lifecycleManager.restartRace();
  }

  public setMode(mode: GameMode): void {
    this.stateManager.setMode(mode);
  }

  public resetStandings(): void {
    this.standingsManager.reset();
  }

  public computeCurrentStandings(delta: number = this.gameLoop.lastDelta): LeaderboardRacerEntry[] {
    return this.simulationCoordinator.computeCurrentStandings(delta);
  }

  public computeCurrentRank(): { rank: number; total: number } {
    const standings = this.computeCurrentStandings();
    const p = standings.find(s => s.isPlayer);
    return { rank: p ? p.rank : 1, total: standings.length || 4 };
  }

  public getFocusedVehicle(): Vehicle | null {
    return this.simulationCoordinator.getFocusedVehicle();
  }

  public setShowNametags(enabled: boolean): void {
    this.nametagRenderer.setShowNametags(enabled);
    this.nametagRenderer.updateNameTags(
      this.getFocusedVehicle(),
      this.opponentManager,
      this.replayPlayer,
      this.lifecycleManager.mode
    );
  }

  public drawMinimap(): void {
    const targetVehicle = this.getFocusedVehicle() || this.playerVehicle;
    MinimapRenderer.draw({
      canvas: this.minimapCanvas,
      ctx: this.minimapCtx,
      circuit: this.circuit,
      targetVehicle,
      opponentManager: this.opponentManager,
      replayPlayer: this.replayPlayer,
      mode: this.lifecycleManager.mode,
    });
  }

  public onResize(): void {
    this.renderEngine.handleResize();
  }

  public applyGraphicsSettings(settings: GraphicsSettings): void {
    this.renderEngine.applyGraphicsSettings(settings);
    this.environmentManager?.setShadowQuality(settings.shadows);
    this.cameraController.setDynamicFovEnabled(settings.dynamicFov);
    this.cameraController.setShakeMode(settings.cameraShake);
    this.updateWeatherScreenFX();
  }

  // --- 메인 프레임 틱 오케스트레이션 ---
  private onTick(delta: number, deltaMs: number): void {
    // 로비(TITLE) 화면에서는 2D 오버레이 절전을 위해 3D 렌더링 생략
    if (this.lifecycleManager.mode === 'TITLE') {
      return;
    }

    if (this.lifecycleManager.isPaused || ModalManager.hasActiveModal()) {
      this.renderEngine.renderer.render(this.renderEngine.scene, this.cameraController.camera);
      return;
    }

    this.lifecycleManager.updateGantryTimer(delta);

    // [R] 키 리셋 감지
    if (this.input.consumeReset()) {
      if (this.lifecycleManager.mode === 'DEMO') {
        this.setMode('DEMO');
      } else {
        this.resetVehicleToStart();
      }
    }

    // 경기 상태별 물리 및 시뮬레이션 디스패치
    if (this.lifecycleManager.raceState === 'START_CUTSCENE') {
      this.simulationCoordinator.updateStartCutscene(delta);
    } else {
      if (this.lifecycleManager.raceState === 'COUNTDOWN') {
        this.lifecycleManager.updateCountdown(delta);
      }

      if (this.lifecycleManager.mode === 'DRIVING') {
        this.simulationCoordinator.updateDriving(delta, deltaMs);
      } else if (this.lifecycleManager.mode === 'REPLAY') {
        this.simulationCoordinator.updateReplay(delta, deltaMs);
      } else if (this.lifecycleManager.mode === 'DEMO') {
        this.simulationCoordinator.updateDemo(delta, deltaMs);
      }
    }

    // 네임태그 갱신
    const focusedVehicle = this.getFocusedVehicle();
    this.nametagRenderer.updateNameTags(
      focusedVehicle,
      this.opponentManager,
      this.replayPlayer,
      this.lifecycleManager.mode
    );

    // 고속 블러 및 속도선 SpeedFX
    const isCutscene = this.lifecycleManager.raceState === 'START_CUTSCENE' || this.lifecycleManager.raceState === 'FINISHED';
    if (this.lifecycleManager.raceState === 'FINISHED') {
      this.renderEngine.speedFX.clear();
    }
    const currentSpeed = (focusedVehicle && !isCutscene) ? focusedVehicle.getSpeedKmh() : 0;
    this.renderEngine.speedFX.update(delta, currentSpeed, focusedVehicle);

    // 미니맵 드로잉
    this.drawMinimap();

    // Three.js 메인 뷰포트 렌더 및 백미러 렌더링
    this.renderEngine.renderFrame();
    this.mirrorRenderer.render(this.renderEngine.scene, this.renderEngine.container);
  }

  // --- 이벤트 바인딩 ---
  private bindWindowEvents(): void {
    window.addEventListener('click', (e) => {
      this.audio.init();
      if (this.lifecycleManager.isPaused || ModalManager.hasActiveModal() || this.lifecycleManager.mode === 'TITLE') return;
      const target = e.target as HTMLElement;
      if (target?.closest('.modal-overlay') || target?.closest('.title-scene-overlay') || target?.closest('.interactive')) {
        return;
      }
      if (this.lifecycleManager.raceState === 'START_CUTSCENE') {
        this.skipStartCutscene();
        return;
      }
      if (this.lifecycleManager.mode === 'DRIVING' && this.lifecycleManager.raceState === 'READY') {
        this.startRace(true);
      }
    });

    window.addEventListener('keydown', (e) => {
      this.audio.init();
      if (this.lifecycleManager.isPaused || ModalManager.hasActiveModal() || this.lifecycleManager.mode === 'TITLE') return;
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select') return;

      if (this.lifecycleManager.raceState === 'START_CUTSCENE' && (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyW' || e.code === 'ArrowUp')) {
        this.skipStartCutscene();
        return;
      }
      if (this.lifecycleManager.mode === 'DRIVING' && this.lifecycleManager.raceState === 'READY' && e.code !== 'KeyR' && e.code !== 'KeyO' && e.code !== 'Escape') {
        this.startRace(true);
      }
    });

    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('fullscreenchange', this.onResize);
    document.addEventListener('webkitfullscreenchange', this.onResize);

    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(() => {
        this.onResize();
      });
      resizeObserver.observe(this.renderEngine.container);
    }
  }
}
