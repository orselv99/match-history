import * as THREE from 'three';
import { Circuit } from '../game/Circuit.ts';
import { type CircuitId } from '../data/circuits.ts';
import { Vehicle } from '../game/Vehicle.ts';
import { InputManager } from './InputManager.ts';
import { AudioManager } from './AudioManager.ts';
import { LapTimer } from '../game/LapTimer.ts';
import { ReplayRecorder } from '../replay/ReplayRecorder.ts';
import { ReplayPlayer } from '../replay/ReplayPlayer.ts';
import { ReplayCodec } from '../replay/ReplayCodec.ts';
import { MatchSummaryMetadata, RaceResultEntry } from '../replay/ReplayTypes.ts';
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
import { StandingsManager, type RacerProgressCandidate } from './StandingsManager.ts';
import { ModalManager } from '../ui/ModalManager.ts';
import { showToast } from '../ui/Toast.ts';

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
  KeyInputState,
  LeaderboardRacerEntry,
  GameUIState,
} from '../types/game.ts';

/**
 * 레이싱 게임 메인 엔진 (Scene, Camera, Renderer, Game Loop)
 */
export class Game {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;

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

  public mode: GameMode = 'TITLE';
  public raceState: RaceState = 'READY';

  private clock: THREE.Clock;
  private container: HTMLElement;
  private minimapCanvas: HTMLCanvasElement;
  private minimapCtx: CanvasRenderingContext2D | null;

  // 카운트다운 타이머
  private countdownTimer: number = 3.0;
  private lastBeepNumber: number = -1;

  // 카메라, 환경, 컷씬 & 백미러 매니저
  public cameraController!: CameraController;
  public environmentManager!: EnvironmentManager;
  public speedFX: SpeedFX;
  public startCutsceneController!: StartCutsceneController;
  public mirrorRenderer!: MirrorRenderer;

  // 게임 세션 설정 메타데이터
  public currentDriverName: string = 'Apex Hunter';
  public currentCircuitId: CircuitId = 'circuit_monaco';
  public currentTimeOfDay: TimeOfDay = 'noon';
  public currentWeather: WeatherType = 'clear';
  public currentReplayMetadata?: MatchSummaryMetadata | null;
  public showNametagsSetting: boolean = typeof localStorage !== 'undefined'
    ? localStorage.getItem('apex_show_nametags') !== 'false'
    : true;
  private offroadTimer: number = 0;
  private offroadHintShown: boolean = false;

  // 실시간 순위 안정화 매니저
  public standingsManager: StandingsManager = new StandingsManager();
  private lastDelta: number = 0.016;
  private gantryGoTimer: number = 0;

  // 콜백
  public onFinishCallback?: (metadata: MatchSummaryMetadata) => void;
  public onStateUpdate?: (state: GameUIState) => void;
  public onSectorPassed?: (driverName: string, sectorName: string, timeMs: number) => void;

  constructor(container: HTMLElement, minimapCanvas: HTMLCanvasElement) {
    this.container = container;
    this.minimapCanvas = minimapCanvas;
    this.minimapCtx = minimapCanvas.getContext('2d');

    // 1. 씬 생성
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x121316);
    this.scene.fog = new THREE.FogExp2(0x121316, 0.0035);

    const initWidth = Math.max(container.clientWidth || window.innerWidth, 1088);
    const initHeight = Math.max(container.clientHeight || window.innerHeight, 612);

    // 2. 카메라
    this.cameraController = new CameraController(65, initWidth / initHeight, 0.1, 1000);
    this.camera = this.cameraController.camera;

    // 3. 렌더러
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(initWidth, initHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    // 4. 환경 & 조명 매니저 초기화
    this.environmentManager = new EnvironmentManager(this.scene);

    // 5. 모듈 초기화
    this.circuit = new Circuit();
    this.scene.add(this.circuit.group);

    this.playerVehicle = new Vehicle(false);
    this.scene.add(this.playerVehicle.mesh);

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
    this.scene.add(this.replayPlayer.ghostVehicle.mesh);
    this.replayPlayer.opponentVehicles.forEach(v => this.scene.add(v.mesh));

    this.opponentManager = new OpponentManager(this.circuit);
    this.opponentManager.onSectorPassed = (name, sectorName, timeMs) => {
      if (this.onSectorPassed) {
        this.onSectorPassed(name, sectorName, timeMs);
      }
    };
    this.scene.add(this.opponentManager.group);

    // 스키드마크 & 충돌 매니저
    this.skidMarkManager = new SkidMarkManager();
    this.scene.add(this.skidMarkManager.group);

    this.collisionManager = new CollisionManager();
    this.scene.add(this.collisionManager.group);

    // 충돌 리스너: 임팩트 사운드 & 카메라 쉐이크
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


    this.input = new InputManager();
    this.audio = new AudioManager();
    this.lapTimer = new LapTimer(3); // 3랩 완주
    this.recorder = new ReplayRecorder();
    this.speedFX = new SpeedFX(this.renderer, this.scene, this.camera);
    this.mirrorRenderer = new MirrorRenderer(this.renderer);
    this.startCutsceneController = new StartCutsceneController(this.circuit, this.cameraController, this.input);
    this.applyGraphicsSettings(graphicsSettingsManager.getSettings());

    this.clock = new THREE.Clock();

    // 초기 환경 설정 (맑은 정오)
    this.setEnvironment('noon', 'clear');

    // 초기 모드 설정 (로비 씬 대기)
    this.setMode('TITLE');

    // 키보드/클릭 이벤트 시 오디오 활성화 및 레이스 시작 / 컷씬 건너뛰기
    window.addEventListener('click', (e) => {
      this.audio.init();
      if (this.isPaused || ModalManager.hasActiveModal() || this.mode === 'TITLE') return;
      const target = e.target as HTMLElement;
      if (target?.closest('.modal-overlay') || target?.closest('.title-scene-overlay') || target?.closest('.interactive')) {
        return;
      }
      if (this.raceState === 'START_CUTSCENE') {
        this.skipStartCutscene();
        return;
      }
      if (this.mode === 'DRIVING' && this.raceState === 'READY') {
        this.startRace(true);
      }
    });

    window.addEventListener('keydown', (e) => {
      this.audio.init();
      if (this.isPaused || ModalManager.hasActiveModal() || this.mode === 'TITLE') return;
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select') return;

      if (this.raceState === 'START_CUTSCENE' && (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyW' || e.code === 'ArrowUp')) {
        this.skipStartCutscene();
        return;
      }
      if (this.mode === 'DRIVING' && this.raceState === 'READY' && e.code !== 'KeyR' && e.code !== 'KeyO' && e.code !== 'Escape') {
        this.startRace(true);
      }
    });

    // 창 크기 조절 및 전체화면(Fullscreen) 감지 리스너 바인딩
    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('fullscreenchange', this.onResize);
    document.addEventListener('webkitfullscreenchange', this.onResize);

    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(() => {
        this.onResize();
      });
      resizeObserver.observe(this.container);
    }

    // 메인 루프 가동
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  public setEnvironment(
    timeOfDay: TimeOfDay,
    weather: WeatherType
  ): void {
    this.currentTimeOfDay = timeOfDay;
    this.currentWeather = weather;
    this.environmentManager.setEnvironment(
      timeOfDay,
      weather,
      this.circuit?.roadMaterial,
      this.playerVehicle,
      this.opponentManager,
      this.audio
    );
    this.circuit?.setNightMode(timeOfDay === 'night');
    this.updateWeatherScreenFX();
  }

  public updateWeatherScreenFX(): void {
    const isFxEnabled = graphicsSettingsManager.getSettings().weatherFx !== false;
    const overlay = document.getElementById('weather-screen-overlay');
    const leftMirror = document.getElementById('left-mirror-frame');
    const rightMirror = document.getElementById('right-mirror-frame');

    const isLobby = this.mode === 'TITLE';
    const isFinished = this.raceState === 'FINISHED';
    const isRain = isFxEnabled && this.currentWeather === 'rain' && !isLobby;
    const isSnow = isFxEnabled && this.currentWeather === 'snow' && !isLobby;

    if (overlay) {
      overlay.classList.toggle('is-raining', isRain);
      overlay.classList.toggle('is-snowing', isSnow);
      overlay.classList.toggle('is-finished', isFinished);
      overlay.classList.toggle('is-paused', this.isPaused);
    }
    if (leftMirror) {
      leftMirror.classList.toggle('is-raining', isRain);
      leftMirror.classList.toggle('is-snowing', isSnow);
    }
    if (rightMirror) {
      rightMirror.classList.toggle('is-raining', isRain);
      rightMirror.classList.toggle('is-snowing', isSnow);
    }
  }

  public toggleHeadlights(): boolean {
    const next = !this.playerVehicle.headlightsEnabled;
    this.playerVehicle.setHeadlights(next);
    if (this.mode === 'DEMO' && this.opponentManager.agents[0]) {
      this.opponentManager.agents[0].vehicle.setHeadlights(next);
    }
    return next;
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

  public setDriverName(name: string): void {
    this.currentDriverName = name;
  }

  /**
   * 선택된 서킷(Monaco, Monza, Spa-Francorchamps)을 인게임에 실시간 적용 및 재배치
   */
  public loadCircuit(circuitId: CircuitId): void {
    this.currentCircuitId = circuitId;
    this.circuit.loadCircuit(circuitId);
    this.circuit.setNightMode(this.currentTimeOfDay === 'night');
    this.resetVehicleToStart();
    this.drawMinimap();
  }


  public playerGridSlot: number = 0;

  public resetVehicleToStart(slotIndex?: number): void {
    if (slotIndex !== undefined) {
      this.playerGridSlot = slotIndex;
    } else if (this.mode === 'DRIVING') {
      this.playerGridSlot = Math.floor(Math.random() * 4);
    } else {
      this.playerGridSlot = 0;
    }

    // 플레이어 차량을 스타팅 그리드 슬롯(0~3 다양화)에 정렬
    const gridPos = this.circuit.getGridPosition(this.playerGridSlot);
    this.playerVehicle.reset(gridPos.position, gridPos.heading);

    // 주행 모드일 경우 상대 차량들도 나머지 3개 슬롯에 정렬
    if (this.mode === 'DRIVING') {
      this.opponentManager.resetToGrids(true, this.playerGridSlot);
    }

    this.skidMarkManager.reset();
    this.collisionManager.reset();

    this.resetStandings();
    this.gantryGoTimer = 0;
    this.circuit.setGantryLights(0);
    this.lapTimer.reset();
    this.recorder.clear();
    this.audio.pauseEngine();
    if (this.mode !== 'TITLE' && this.mode !== 'DEMO') {
      this.mode = 'DRIVING';
    }
    this.raceState = 'READY';
    this.countdownTimer = 3.0;
    this.lastBeepNumber = -1;

    this.replayPlayer.pause();
  }

  public startRace(withCutscene: boolean = true): void {
    if (withCutscene) {
      this.setupStartCutscene();
    } else {
      this.resetVehicleToStart();
      this.startCountdown();
    }
  }

  /**
   * 슬롯 인덱스(0: Pole, 1: 2nd, 2: 3rd, 3: 4th)에 해당하는 실제 차량 인스턴스 반환
   */
  private getVehicleForSlot(slotIndex: number): Vehicle | null {
    if (this.mode === 'DRIVING') {
      if (slotIndex === this.playerGridSlot) return this.playerVehicle;
      const opp = this.opponentManager.getAgentForSlot(slotIndex);
      return opp?.vehicle || null;
    } else {
      return this.opponentManager.agents[slotIndex]?.vehicle || (slotIndex === 0 ? this.playerVehicle : null);
    }
  }

  public setupStartCutscene(): void {
    this.raceState = 'START_CUTSCENE';
    this.recorder.stop();
    this.recorder.clear();

    if (this.mode === 'DRIVING') {
      this.playerGridSlot = Math.floor(Math.random() * 4);
      const gridPos = this.circuit.getGridPosition(this.playerGridSlot);
      this.playerVehicle.reset(gridPos.position, gridPos.heading);
      this.opponentManager.resetToGrids(true, this.playerGridSlot);
    } else {
      this.playerGridSlot = 0;
      this.opponentManager.resetToGrids(false, 0);
    }

    this.startCutsceneController.setup((i) => this.getVehicleForSlot(i), this.mode === 'DRIVING');
  }

  public updateStartCutscene(delta: number): void {
    const { leadVehicle } = this.startCutsceneController.update(
      delta,
      (i) => this.getVehicleForSlot(i),
      this.mode === 'DRIVING',
      () => this.skipStartCutscene()
    );

    const target = leadVehicle || this.playerVehicle;
    if (this.startCutsceneController.isManualPitDriving) {
      this.environmentManager.update(delta, target.position, target.heading, target.speed);
      this.audio.update(target.getSpeedKmh(), target.isDrifting, this.input.throttle);
    } else {
      this.environmentManager.update(delta, target.position, target.heading, target.speed);
      this.audio.update(target.getSpeedKmh(), false, 0.4);
    }


    this.emitUIState();
  }

  public skipStartCutscene(): void {
    if (this.raceState !== 'START_CUTSCENE') return;
    this.startCutsceneController.skip((i) => this.getVehicleForSlot(i));
    this.startCountdown();
  }

  public startCountdown(force: boolean = false): void {
    if (!force && (this.raceState === 'COUNTDOWN' || this.raceState === 'RUNNING')) return;
    this.resetStandings();
    this.gantryGoTimer = 0;
    this.circuit.setGantryLights(0);
    this.raceState = 'COUNTDOWN';
    this.countdownTimer = 3.0;
    this.lastBeepNumber = -1;
  }

  private animate(): void {
    requestAnimationFrame(this.animate);

    // 로비(TITLE) 화면에서는 2D 오버레이가 전체 화면을 가리고 있으므로
    // 불필요한 GPU 렌더링 및 물리 시뮬레이션을 일체 중단하여 GPU 사용률을 0%로 절전합니다.
    if (this.mode === 'TITLE') {
      return;
    }

    if (this.isPaused || ModalManager.hasActiveModal()) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const delta = Math.min(this.clock.getDelta(), 0.1);
    this.lastDelta = delta;
    const deltaMs = delta * 1000;

    if (this.gantryGoTimer > 0) {
      this.gantryGoTimer -= delta;
      if (this.gantryGoTimer <= 0) {
        this.circuit.setGantryLights(0);
      }
    }

    // R 키 리셋 감지
    if (this.input.consumeReset()) {
      if (this.mode === 'DEMO') {
        this.setMode('DEMO');
      } else {
        this.resetVehicleToStart();
      }
    }

    // 시작 컷씬 또는 카운트다운 타이머 처리
    if (this.raceState === 'START_CUTSCENE') {
      this.updateStartCutscene(delta);
    } else {
      if (this.raceState === 'COUNTDOWN') {
        this.updateCountdown(delta);
      }

      if (this.mode === 'DRIVING') {
        this.updateDriving(delta, deltaMs);
      } else if (this.mode === 'REPLAY') {
        this.updateReplay(delta, deltaMs);
      } else if (this.mode === 'DEMO') {
        this.updateDemo(delta, deltaMs);
      }
    }

    // 포커싱 차량을 제외한 나머지 차량 상단에 이름 표시
    this.updateNameTags();

    // 고속 주행 시각화 효과 (100km/h & 200km/h 속도선 및 방사형 환경 블러)
    // 컷씬(START_CUTSCENE 및 FINISHED) 중에는 속도선을 꺼서 차량 및 배경 시야 완벽 확보
    const focusedVehicle = this.getFocusedVehicle();
    const isCutscene = this.raceState === 'START_CUTSCENE' || this.raceState === 'FINISHED';
    if (this.raceState === 'FINISHED') {
      this.speedFX.clear();
    }
    const currentSpeed = (focusedVehicle && !isCutscene) ? focusedVehicle.getSpeedKmh() : 0;
    this.speedFX.update(delta, currentSpeed, focusedVehicle);

    // 미니맵 드로잉
    this.drawMinimap();

    // 렌더링 (메인 뷰포트 + 좌/우 백미러 시저 렌더링)
    this.renderer.setViewport(0, 0, this.renderer.domElement.width, this.renderer.domElement.height);
    if (this.speedFX.isActive()) {
      this.speedFX.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    this.mirrorRenderer.render(this.scene, this.container);
  }

  private updateCountdown(delta: number): void {
    this.countdownTimer -= delta;

    const currentNumber = Math.ceil(this.countdownTimer);

    if (currentNumber > 0 && currentNumber <= 3 && currentNumber !== this.lastBeepNumber) {
      this.lastBeepNumber = currentNumber;
      this.audio.playCountdownBeep(false); // 3, 2, 1 삐-

      // 3구 스타팅 라이트 연동: 3초(1구 점등) -> 2초(2구 점등) -> 1초(3구 전체 점등)
      const activeRedCount = 4 - currentNumber;
      this.circuit.setGantryLights(activeRedCount, false);
    }

    if (this.countdownTimer <= 0) {
      // GO! 신호음 및 레이스 스타트
      this.audio.playCountdownBeep(true);
      this.raceState = 'RUNNING';

      // 3구 라이트 녹색(Green) 전체 점등 후 1.2초 뒤 자동 소등
      this.circuit.setGantryLights(3, true);
      this.gantryGoTimer = 1.2;

      if (this.mode === 'REPLAY') {
        this.replayPlayer.play();
      } else {
        this.lapTimer.start();
        this.recorder.start();
      }
    }
  }

  private updateDriving(delta: number, deltaMs: number): void {
    this.input.update(delta);

    // 주행 준비 상태에서 가속 키(W / ↑) 입력 시 즉시 카운트다운 시작
    if (this.raceState === 'READY' && this.input.throttle > 0) {
      this.startCountdown();
    }

    const isRunning = this.raceState === 'RUNNING';
    const isFinished = this.raceState === 'FINISHED';

    // 서킷 3D 표면 정보 조회 (고도, 종방향 경사율, 노면 피치 각도, 중심선 이탈 거리)
    const surface = this.circuit.getCircuitSurfaceInfo(this.playerVehicle.position, this.playerVehicle.heading);
    const isOffroad = surface.distFromCenter > (this.circuit.circuitWidth / 2 + 1.2);

    // 레이스 시작 전에는 스로틀 입력 락 (엔진 공회전 RPM만 가능), 완주 시에는 쿨다운 순항
    let activeThrottle = isRunning ? this.input.throttle : 0;
    let activeBrake = isRunning ? this.input.brake : 0;
    let activeSteer = isRunning ? this.input.steer : 0;

    if (isFinished) {
      // 완주 컷씬: 결승선 통과 후 부드럽게 감속하여 결승선 부근에 우아하게 정지
      activeThrottle = 0;
      activeSteer = 0;
      if (this.playerVehicle.speed > 0) {
        this.playerVehicle.speed = Math.max(0, this.playerVehicle.speed - 10.0 * delta);
      }
      activeBrake = this.playerVehicle.speed > 0.2 ? 0.35 : 0;
    }

    // 슬립스트림(Slipstream) 역학 판정: 상대 차량 후미(2.0m ~ 24.0m) 및 횡편차 2.5m 이내 추종 시 공기저항 감소 & +15% 가속 부스트
    let isSlipstreaming = false;
    if (isRunning && this.playerVehicle.speed > 12.0) {
      const sinH = Math.sin(this.playerVehicle.heading);
      const cosH = Math.cos(this.playerVehicle.heading);
      for (const agent of this.opponentManager.agents) {
        if (!agent.vehicle.mesh.visible) continue;
        const dx = agent.vehicle.position.x - this.playerVehicle.position.x;
        const dz = agent.vehicle.position.z - this.playerVehicle.position.z;
        const distFwd = dx * sinH + dz * cosH;
        const distLat = Math.abs(dx * cosH - dz * sinH);
        if (distFwd > 2.0 && distFwd < 24.0 && distLat < 2.5) {
          isSlipstreaming = true;
          break;
        }
      }
    }

    if (isSlipstreaming && activeThrottle > 0) {
      activeThrottle = Math.min(1.25, activeThrottle * 1.15);
    }

    const slipstreamOverlay = document.getElementById('slipstream-overlay');
    if (slipstreamOverlay) {
      slipstreamOverlay.classList.toggle('active', isSlipstreaming);
    }

    // 차량 물리 업데이트 (중력 가감속, 고도 추종, 서스펜션 바운스 반영)
    this.playerVehicle.update(
      delta,
      activeThrottle,
      activeBrake,
      activeSteer,
      isFinished ? false : this.input.handbrake,
      isOffroad,
      surface.groundY,
      surface.slopeSin,
      surface.roadPitch,
      this.currentWeather
    );

    // 언덕 정점 통과 후 착지 또는 급격한 오르막 전환(컴프레션) 시 하부 스파크 및 카메라 충격 연출
    if (this.playerVehicle.lastLandingImpact > 0.3) {
      this.collisionManager.emitBottomingSparks(this.playerVehicle, this.playerVehicle.lastLandingImpact);
      this.cameraController.triggerShake(this.playerVehicle.lastLandingImpact * 0.45);
    }

    // 오프로드 3초 이상 이탈 시 서킷 복귀 안내 토스트 표시
    if (isOffroad && isRunning && !ModalManager.hasActiveModal() && this.mode === 'DRIVING') {
      this.offroadTimer += delta;
      if (this.offroadTimer >= 3.0 && !this.offroadHintShown) {
        this.offroadHintShown = true;
        showToast('⚠️ 서킷 이탈! [R] 키를 누르면 트랙으로 즉시 복귀합니다.', 4000);
      }
    } else {
      this.offroadTimer = 0;
      this.offroadHintShown = false;
    }

    // [R] 키 입력 시 가장 가까운 서킷 노면 중심선으로 안전 복귀
    if (this.input.resetRequested && (isRunning || this.raceState === 'READY')) {
      this.input.resetRequested = false;
      const respawn = this.circuit.getNearestTrackPoint(this.playerVehicle.position);
      this.playerVehicle.reset(respawn.position, respawn.heading);
      this.offroadTimer = 0;
      this.offroadHintShown = false;
      showToast('🔄 트랙 중심선으로 안전 복귀했습니다.', 2200);
    }

    // 상대 차량에 플레이어 위치 실시간 동기화하여 AI가 플레이어를 인지하고 후미 추돌을 회피하도록 연동
    if (this.opponentManager.isRivalsMode) {
      const playerT = this.circuit.getClosestT(this.playerVehicle.position);
      this.opponentManager.syncPlayerState(
        playerT,
        Math.max(0, this.playerVehicle.speed),
        this.lapTimer.currentLap,
        0,
        this.playerVehicle.position
      );
    }

    // 상대 차량 업데이트 (3대 그리드 경쟁 및 완주 후 쿨다운 주행)
    this.opponentManager.update(delta, isRunning || isFinished);

    // 활성 차량 수집 (플레이어 + 상대 차량)
    const activeVehicles = [
      this.playerVehicle,
      ...this.opponentManager.agents.filter(a => a.vehicle.mesh.visible).map(a => a.vehicle)
    ];

    // 차량 간 충돌 감지 및 물리적 반발력 해결 (탄성 반발, 토크, 스파크, 충돌음)
    this.collisionManager.update(delta, activeVehicles, this.playerVehicle);
    this.opponentManager.syncFromPhysics();

    // 드리프트 스키드마크(검은 고무 자국) 및 타이어 연기 업데이트
    this.skidMarkManager.update(delta, activeVehicles);

    // 환경 효과(구름 이동, 비/안개 파티클) 업데이트
    this.environmentManager.update(
      delta,
      this.playerVehicle.position,
      this.playerVehicle.heading,
      this.playerVehicle.speed
    );


    if (isRunning) {
      // 랩 타이머 & 체크포인트 판정
      this.lapTimer.update(
        deltaMs,
        this.playerVehicle.position,
        this.circuit.checkpoints,
        (cpId, sectorTimeMs) => {
          this.audio.playCheckpointBeep();
          const sectorName = cpId === 1 ? 'S1' : cpId === 2 ? 'S2' : '도착선';
          if (this.onSectorPassed) {
            this.onSectorPassed('Player', sectorName, sectorTimeMs);
          }
        }
      );

      // 30Hz 주행 리플레이 데이터 레코딩 (플레이어 및 상대 3대 동시 기록)
      const opponents = [
        this.opponentManager.agents[1]?.vehicle,
        this.opponentManager.agents[2]?.vehicle,
        this.opponentManager.agents[3]?.vehicle,
      ].filter(Boolean) as Vehicle[];

      this.recorder.update(
        deltaMs,
        this.playerVehicle,
        this.lapTimer.currentLap,
        this.input.steer,
        this.input.throttle,
        this.input.brake,
        opponents
      );

      // 완주 판정 시
      if (this.lapTimer.isFinished && this.recorder.getTickCount() > 0) {
        this.raceState = 'FINISHED';
        this.speedFX.clear();
        this.cameraController.snapFinishCutscene(this.playerVehicle);
        this.handleFinish(this.playerVehicle, 'driver_kr_01', 'Apex Hunter');
      }
    }

    // 사운드 업데이트
    if (this.raceState === 'FINISHED') {
      this.audio.pauseEngine();
    } else {
      this.audio.update(this.playerVehicle.getSpeedKmh(), this.playerVehicle.isDrifting, this.input.throttle);
    }

    // 카메라 추적 (체이스 카메라 & 충돌 쉐이크 / 완주 컷씬)
    if (this.raceState === 'FINISHED') {
      const winner = this.lapTimer.isFinished
        ? this.playerVehicle
        : (this.opponentManager.agents.find(a => a.isFinished)?.vehicle || this.playerVehicle);
      this.cameraController.updateFinishCutscene(delta, winner);
    } else {
      this.cameraController.updateChase(delta, this.playerVehicle);
    }

    // 후방 추격 차량 감지 및 백미러 업데이트
    this.updateMirrors(this.playerVehicle);

    // UI 상태 갱신
    this.emitUIState();
  }

  private updateDemo(delta: number, deltaMs: number): void {
    const isRunning = this.raceState === 'RUNNING';
    const isFinished = this.raceState === 'FINISHED';
    this.opponentManager.update(delta, isRunning || isFinished);

    // 처음에 설정한 플레이어 차량(슬롯 0)을 타겟으로 고정 추적
    const playerAgent = this.opponentManager.agents[0];
    const targetVehicle = playerAgent ? playerAgent.vehicle : this.playerVehicle;
    const activeVehicles = this.opponentManager.agents.filter(a => a.vehicle.mesh.visible).map(a => a.vehicle);

    // 상대 차량 간 충돌 감지 및 물리 반응
    this.collisionManager.update(delta, activeVehicles);
    this.opponentManager.syncFromPhysics();

    // 드리프트 스키드마크 및 연기 업데이트
    this.skidMarkManager.update(delta, activeVehicles);

    // 환경 효과(구름 이동, 비/안개 파티클) 업데이트
    this.environmentManager.update(delta, targetVehicle.position, targetVehicle.heading, targetVehicle.speed);


    // 데모 중 주행 리플레이 데이터 레코딩 및 플레이어 차량 랩 타이머 갱신
    if (isRunning && playerAgent) {
      this.lapTimer.update(
        deltaMs,
        targetVehicle.position,
        this.circuit.checkpoints,
        () => this.audio.playCheckpointBeep()
      );

      const opponents = this.opponentManager.agents
        .filter(a => a !== playerAgent && a.vehicle.mesh.visible)
        .map(a => a.vehicle);

      this.recorder.update(
        deltaMs,
        targetVehicle,
        playerAgent.currentLap,
        0, 0.9, 0,
        opponents
      );

      // 플레이어 차량 또는 상대 전체 완주 판정
      if ((playerAgent.isFinished || this.opponentManager.isAllFinished || this.lapTimer.isFinished) && this.raceState === 'RUNNING') {
        this.raceState = 'FINISHED';
        this.speedFX.clear();
        this.cameraController.snapFinishCutscene(targetVehicle);
        this.handleFinish(targetVehicle, 'player_demo', playerAgent.driverName);
      }
    }

    // 완주 컷씬 카메라 (1등 차량을 화면 좌측에 배치) 또는 일반 주행 체이스 카메라
    if (this.raceState === 'FINISHED') {
      const winner = this.opponentManager.agents[0]?.vehicle || targetVehicle;
      this.cameraController.updateFinishCutscene(delta, winner);
    } else {
      // 처음 설정한 플레이어 차량을 일관되게 고정 추적 (순위가 바뀌어도 카메라 전환 없음)
      this.cameraController.updateChase(delta, targetVehicle);
    }

    // 후방 추격 차량 감지 및 백미러 업데이트
    this.updateMirrors(targetVehicle);

    // 오디오 사운드 업데이트
    if (this.raceState === 'FINISHED') {
      this.audio.pauseEngine();
    } else {
      this.audio.update(targetVehicle.getSpeedKmh(), targetVehicle.isDrifting, isRunning ? 0.9 : 0.0);
    }

    this.emitUIState();
  }

  private updateReplay(delta: number, deltaMs: number): void {
    this.mirrorRenderer.deactivate();

    if (this.raceState === 'COUNTDOWN') {
      this.cameraController.updateChase(delta, this.replayPlayer.ghostVehicle);
      this.environmentManager.update(
        delta,
        this.replayPlayer.ghostVehicle.position,
        this.replayPlayer.ghostVehicle.heading,
        this.replayPlayer.ghostVehicle.speed
      );
      this.emitUIState();
      return;
    }

    if (this.raceState === 'FINISHED') {
      // 일반게임과 동일한 도착 컷씬: 결승선 통과 후 부드럽게 감속하여 정지 및 정면 좌측 앵글 연출
      const leadVehicle = this.replayPlayer.ghostVehicle;
      if (leadVehicle.speed > 0) {
        leadVehicle.speed = Math.max(0, leadVehicle.speed - 10.0 * delta);
      }
      const leadSurf = this.circuit.getCircuitSurfaceInfo(leadVehicle.position, leadVehicle.heading);
      leadVehicle.update(delta, 0, 0, 0, false, false, leadSurf.groundY, leadSurf.slopeSin, leadSurf.roadPitch);

      this.replayPlayer.opponentVehicles.forEach(opp => {
        if (opp.mesh.visible) {
          if (opp.speed > 0) {
            opp.speed = Math.max(0, opp.speed - 9.0 * delta);
          }
          const oppSurf = this.circuit.getCircuitSurfaceInfo(opp.position, opp.heading);
          opp.update(delta, 0, 0, 0, false, false, oppSurf.groundY, oppSurf.slopeSin, oppSurf.roadPitch);
        }
      });

      this.cameraController.updateFinishCutscene(delta, leadVehicle);
      this.environmentManager.update(delta, leadVehicle.position, leadVehicle.heading, leadVehicle.speed);
      this.emitUIState();
      return;
    }

    const isPlaying = this.replayPlayer.isPlaying;
    if (isPlaying) {
      this.replayPlayer.update(deltaMs);
    }

    // 활성 리플레이 차량(고스트 + 상대 차량) 스키드마크 및 타이어 연기 효과 갱신
    const activeReplayVehicles = [
      this.replayPlayer.ghostVehicle,
      ...this.replayPlayer.opponentVehicles.filter(v => v.mesh.visible)
    ];
    if (isPlaying) {
      this.skidMarkManager.update(delta, activeReplayVehicles);
      this.collisionManager.updateReplay(delta, activeReplayVehicles, this.replayPlayer.ghostVehicle);
      const ghost = this.replayPlayer.ghostVehicle;
      this.audio.update(ghost.getSpeedKmh(), ghost.isDrifting, ghost.speed > 5 ? 0.85 : 0.2);
    } else {
      this.collisionManager.updateSparks(delta);
      this.audio.pauseEngine();
    }

    this.cameraController.updateChase(delta, this.replayPlayer.ghostVehicle, !isPlaying);
    this.environmentManager.update(
      delta,
      this.replayPlayer.ghostVehicle.position,
      this.replayPlayer.ghostVehicle.heading,
      this.replayPlayer.ghostVehicle.speed
    );
    this.emitUIState();

  }

  public handleReplayFinish(): void {
    this.raceState = 'FINISHED';
    this.updateWeatherScreenFX();
    this.speedFX.clear();
    this.replayPlayer.pause();
    this.audio.playFinishFanfare();
    this.audio.duckBgm(true, 0.2);
    setTimeout(() => {
      this.audio.duckBgm(false);
    }, 2200);

    const leadVehicle = this.replayPlayer.ghostVehicle;
    this.cameraController.snapFinishCutscene(leadVehicle);

    if (this.onFinishCallback && this.currentReplayMetadata) {
      this.onFinishCallback(this.currentReplayMetadata);
    }
  }

  /**
   * 경기 완주 시 출전 드라이버 4인의 최종 순위, 이름, 완주/추정 시간 산출 ('순위, 이름, 시간')
   */
  public computeRaceResults(): RaceResultEntry[] {
    const rawList: { name: string; timeMs: number; isPlayer: boolean; color?: string }[] = [];
    const totalLaps = this.lapTimer.totalLaps;
    const circuitLen = this.circuit.circuitCurve.getLength();

    if (this.mode === 'DRIVING') {
      const playerTimeMs = Math.round(this.lapTimer.totalTimeMs);
      rawList.push({
        name: this.currentDriverName || 'Apex Hunter',
        timeMs: playerTimeMs,
        isPlayer: true,
        color: this.playerVehicle.color,
      });

      for (let i = 1; i < this.opponentManager.agents.length; i++) {
        const agent = this.opponentManager.agents[i];
        if (!agent) continue;
        let opponentTimeMs: number;
        if (agent.isFinished && agent.finishTimeMs) {
          opponentTimeMs = Math.round(agent.finishTimeMs);
        } else {
          // 완주선 통과 전 차량: 남은 거리 및 평균 속도 기반 완주 시간 계산
          const remainingLaps = Math.max(0, totalLaps - agent.currentLap);
          const remainingDist = remainingLaps * circuitLen + Math.max(0, 1.0 - agent.t) * circuitLen;
          const speedMs = Math.max(25.0, agent.speedMs || agent.baseSpeedMs);
          const estRemainingMs = (remainingDist / speedMs) * 1000;
          opponentTimeMs = Math.round(Math.max(playerTimeMs + 650, this.opponentManager.raceTimeMs + estRemainingMs));
        }

        rawList.push({
          name: agent.driverName,
          timeMs: opponentTimeMs,
          isPlayer: false,
          color: agent.color,
        });
      }
    } else {
      for (let i = 0; i < this.opponentManager.agents.length; i++) {
        const agent = this.opponentManager.agents[i];
        if (!agent) continue;
        let opponentTimeMs: number;
        if (agent.isFinished && agent.finishTimeMs) {
          opponentTimeMs = Math.round(agent.finishTimeMs);
        } else {
          const remainingLaps = Math.max(0, totalLaps - agent.currentLap);
          const remainingDist = remainingLaps * circuitLen + Math.max(0, 1.0 - agent.t) * circuitLen;
          const speedMs = Math.max(25.0, agent.speedMs || agent.baseSpeedMs);
          const estRemainingMs = (remainingDist / speedMs) * 1000;
          opponentTimeMs = Math.round(this.opponentManager.raceTimeMs + estRemainingMs);
        }

        rawList.push({
          name: agent.driverName,
          timeMs: opponentTimeMs,
          isPlayer: i === 0,
          color: agent.color,
        });
      }
    }

    rawList.sort((a, b) => a.timeMs - b.timeMs);

    return rawList.map((item, idx) => ({
      rank: idx + 1,
      driverName: item.name,
      timeMs: item.timeMs,
      timeFormatted: this.formatTime(item.timeMs),
      isPlayer: item.isPlayer,
      color: item.color,
    }));
  }

  private async handleFinish(targetVehicle: Vehicle, userId: string, nickname: string): Promise<void> {
    this.updateWeatherScreenFX();
    this.recorder.stop();
    this.audio.pauseEngine();
    this.audio.duckBgm(true, 0.2);
    this.audio.playFinishFanfare();
    setTimeout(() => {
      this.audio.duckBgm(false);
    }, 2200);

    const ticks = this.recorder.getTicks();
    const benchmark = await ReplayCodec.benchmark(ticks);
    const raceResults = this.computeRaceResults();

    const totalTimeMs = ticks.length > 0 ? ticks[ticks.length - 1].timeMs : 0;
    const bestLapMs = this.lapTimer.bestLapMs !== Infinity ? this.lapTimer.bestLapMs : Math.round(totalTimeMs / 3);
    const lapTimesMs = this.lapTimer.lapHistory.length > 0 ? this.lapTimer.lapHistory.map(l => l.timeMs) : [Math.round(totalTimeMs / 3), Math.round(totalTimeMs / 3), Math.round(totalTimeMs / 3)];
    let bestLapNum = 1;
    if (this.lapTimer.lapHistory.length > 0) {
      let minMs = Infinity;
      this.lapTimer.lapHistory.forEach(l => {
        if (l.timeMs < minMs) {
          minMs = l.timeMs;
          bestLapNum = l.lap;
        }
      });
    }
    const sectorTimesMs = this.lapTimer.lapHistory.length > 0 ? this.lapTimer.lapHistory.map(l => l.sectorsMs) : [[22000, 24000, 23000]];

    const topSpeedKmh = Math.max(...ticks.map(t => t.speedKmh), 150);
    const avgSpeedKmh = Number((ticks.reduce((acc, t) => acc + t.speedKmh, 0) / (ticks.length || 1)).toFixed(1));

    const opponentConfigs = [
      { vehicleModelId: this.opponentManager.agents[1]?.vehicle.currentVehicleModelId, color: this.opponentManager.agents[1]?.color, driverName: this.opponentManager.agents[1]?.driverName },
      { vehicleModelId: this.opponentManager.agents[2]?.vehicle.currentVehicleModelId, color: this.opponentManager.agents[2]?.color, driverName: this.opponentManager.agents[2]?.driverName },
      { vehicleModelId: this.opponentManager.agents[3]?.vehicle.currentVehicleModelId, color: this.opponentManager.agents[3]?.color, driverName: this.opponentManager.agents[3]?.driverName },
    ];

    const metadata: MatchSummaryMetadata = {
      matchCode: `RACE-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      userId,
      driverName: this.currentDriverName || nickname,
      circuitId: this.currentCircuitId,
      vehicleModelId: this.playerVehicle.currentVehicleModelId,
      color: this.playerVehicle.color,
      opponentConfigs,
      totalLaps: 3,
      totalTimeMs,
      totalTimeFormatted: this.formatTime(totalTimeMs),
      bestLapMs,
      bestLapFormatted: this.formatTime(bestLapMs),
      bestLapNum,
      lapTimesMs,
      sectorTimesMs,
      topSpeedKmh,
      avgSpeedKmh,
      rank: raceResults.find(r => r.isPlayer)?.rank || 1,
      createdAt: new Date().toISOString(),
      rawJsonBytes: benchmark.rawJsonBytes,
      quantizedBinaryBytes: benchmark.binaryBytes,
      compressedBytes: benchmark.compressedBytes,
      compressionRatioPercent: benchmark.reductionVsJsonPercent,
      raceResults,
      viewMode: this.cameraController.viewMode,
    };

    this.currentReplayMetadata = metadata;

    // 리플레이 플레이어에 데이터 자동 로드
    this.replayPlayer.loadReplay(ticks);

    if (this.onFinishCallback) {
      this.onFinishCallback(metadata);
    }
  }

  public isPaused: boolean = false;

  public pause(): void {
    if (this.mode !== 'DRIVING' && this.mode !== 'DEMO' && this.mode !== 'REPLAY') return;
    this.isPaused = true;
    this.updateWeatherScreenFX();
    this.audio.pauseEngine();
    this.audio.pauseBgm();
    if (this.mode === 'REPLAY') {
      this.replayPlayer.pause();
    }
  }

  public resume(): void {
    this.isPaused = false;
    this.updateWeatherScreenFX();
    this.audio.resumeBgm();
    if (this.mode === 'REPLAY') {
      this.replayPlayer.play();
    }
  }

  public restartRace(): void {
    this.isPaused = false;
    this.audio.resumeBgm();
    if (this.mode === 'DEMO') {
      this.setMode('DEMO');
    } else {
      this.resetVehicleToStart();
      this.recorder.clear();
      this.startRace(true);
    }
  }

  public setMode(mode: GameMode): void {
    this.isPaused = false;
    this.mode = mode;
    this.updateWeatherScreenFX();
    this.speedFX.clear();
    this.cameraController.camera.fov = 65;
    this.cameraController.camera.updateProjectionMatrix();
    document.getElementById('slipstream-overlay')?.classList.remove('active');

    if (mode === 'TITLE') {
      this.audio.pauseEngine();
      this.audio.playLobbyBgm();
      this.playerVehicle.mesh.visible = true;
      this.resetVehicleToStart();
      this.mode = 'TITLE';
      this.replayPlayer.hideGhost();
      this.opponentManager.deactivate();
      this.raceState = 'READY';
      this.countdownTimer = 3.0;
      this.lastBeepNumber = -1;
      this.titleCameraAngle = 0;
      this.offroadTimer = 0;
      this.offroadHintShown = false;
    } else if (mode === 'REPLAY') {
      this.audio.pauseEngine();
      this.audio.playInGameBgm();
      this.playerVehicle.mesh.visible = false;
      this.opponentManager.deactivate();
      this.replayPlayer.ghostVehicle.setVehicleModel(this.playerVehicle.currentVehicleModelId);
      this.replayPlayer.ghostVehicle.setColor(this.playerVehicle.color);

      // 상대 차량 3대의 모델 및 컬러를 리플레이 플레이어에 동기화 (상대 매니저가 활성 상태일 때만)
      if (this.opponentManager.isActive && this.opponentManager.agents[1]?.vehicle.currentVehicleModelId) {
        this.replayPlayer.syncOpponents([
          { vehicleModelId: this.opponentManager.agents[1]?.vehicle.currentVehicleModelId, color: this.opponentManager.agents[1]?.color, driverName: this.opponentManager.agents[1]?.driverName },
          { vehicleModelId: this.opponentManager.agents[2]?.vehicle.currentVehicleModelId, color: this.opponentManager.agents[2]?.color, driverName: this.opponentManager.agents[2]?.driverName },
          { vehicleModelId: this.opponentManager.agents[3]?.vehicle.currentVehicleModelId, color: this.opponentManager.agents[3]?.color, driverName: this.opponentManager.agents[3]?.driverName },
        ]);
      }

      this.skidMarkManager.reset();
      this.collisionManager.reset();
      this.replayPlayer.seek(0);
      this.replayPlayer.pause();
      this.raceState = 'COUNTDOWN';
      this.countdownTimer = 3.0;
      this.lastBeepNumber = -1;
      this.gantryGoTimer = 0;
      this.circuit.setGantryLights(0);
      this.cameraController.snapToTarget(this.replayPlayer.ghostVehicle);
    } else if (mode === 'DEMO') {
      this.audio.playInGameBgm();
      this.playerVehicle.mesh.visible = false;
      this.replayPlayer.hideGhost();
      // 슬롯 0을 위저드에서 설정한 플레이어 차량 스펙 및 컬러로 동기화
      this.opponentManager.setSlotConfig(
        0,
        this.playerVehicle.currentVehicleModelId,
        this.playerVehicle.color
      );
      this.opponentManager.activate(false); // 4대 차량 전체 그리드 정렬
      if (this.opponentManager.agents[0]) {
        this.opponentManager.agents[0].vehicle.setHeadlights(this.playerVehicle.headlightsEnabled);
      }
      this.skidMarkManager.reset();
      this.collisionManager.reset();
      this.lapTimer.reset();
      this.recorder.clear();
      // 데모 선택 시 피트 출차 시작 컷씬 개시
      this.startRace(true);
    } else { // DRIVING
      this.audio.playInGameBgm();
      this.playerVehicle.mesh.visible = true;
      this.replayPlayer.hideGhost();
      this.opponentManager.activate(true); // 상대 3대 (슬롯 1, 2, 3) 활성화
      this.resetVehicleToStart();
      this.raceState = 'READY';
      this.countdownTimer = 3.0;
      this.lastBeepNumber = -1;
    }
  }

  private titleCameraAngle: number = 0;

  private updateTitle(delta: number): void {
    this.mirrorRenderer.deactivate();
    this.titleCameraAngle += delta * 0.2;
    const radius = 8.5;
    const height = 2.8;
    const carPos = this.playerVehicle.position;

    this.camera.position.set(
      carPos.x + Math.sin(this.titleCameraAngle) * radius,
      carPos.y + height,
      carPos.z + Math.cos(this.titleCameraAngle) * radius
    );
    this.camera.lookAt(carPos.x, carPos.y + 0.8, carPos.z);

    this.emitUIState();
  }

  private emitUIState(): void {
    if (!this.onStateUpdate) return;

    let speed = 0;
    let lap = this.lapTimer.currentLap;
    const totalLaps = 3;

    if (this.mode === 'TITLE') {
      speed = 0;
      lap = 1;
    } else if (this.mode === 'DRIVING') {
      speed = this.playerVehicle.getSpeedKmh();
      lap = this.lapTimer.currentLap;
    } else if (this.mode === 'REPLAY') {
      speed = this.replayPlayer.getCurrentTick()?.speedKmh || 0;
    } else if (this.mode === 'DEMO') {
      const playerAgent = this.opponentManager.agents[0];
      if (playerAgent) {
        speed = playerAgent.vehicle.getSpeedKmh();
        lap = Math.min(3, Math.max(playerAgent.currentLap, this.lapTimer.currentLap));
      } else {
        speed = 0;
        lap = 1;
      }
    }

    const rpmRatio = Math.min(1.0, (speed % 55) / 55);
    const gear = speed < 2 ? 'N' : speed < 50 ? '1' : speed < 90 ? '2' : speed < 140 ? '3' : speed < 185 ? '4' : '5';

    // 카운트다운 순수 게임 숫자 표시 (3 > 2 > 1 > GO!)
    let countdownText = '';
    let countdownVisible = false;

    if (this.raceState === 'COUNTDOWN') {
      const num = Math.ceil(this.countdownTimer);
      countdownText = num > 0 ? num.toString() : 'GO!';
      countdownVisible = true;
    } else {
      countdownVisible = false;
    }

    let inputState: KeyInputState;

    if (this.mode === 'DRIVING') {
      inputState = {
        throttle: this.input.throttle > 0.05,
        brake: this.input.brake > 0.05,
        steerLeft: this.input.steer < -0.05,
        steerRight: this.input.steer > 0.05,
        handbrake: this.input.handbrake,
      };
    } else if (this.mode === 'DEMO') {
      // shortcut: 서킷 탄젠트 각도 및 차선 변경량으로 조작 키 추정, 컨트롤러에 가상 입력 축이 통합되면 직접 바인딩
      const playerAgent = this.opponentManager.agents[0];
      if (playerAgent && this.raceState === 'RUNNING') {
        const futureT = (playerAgent.t + 0.02) % 1.0;
        const currTangent = this.circuit.circuitCurve.getTangentAt(playerAgent.t);
        const futureTangent = this.circuit.circuitCurve.getTangentAt(futureT);
        const crossY = currTangent.x * futureTangent.z - currTangent.z * futureTangent.x;
        const laneDelta = playerAgent.targetLaneOffset - playerAgent.laneOffset;
        const steerVal = crossY * 8.0 + laneDelta * 0.4;
        const curveAngle = currTangent.angleTo(futureTangent);

        inputState = {
          throttle: playerAgent.speedMs < playerAgent.maxSpeedMs + 1.0,
          brake: playerAgent.vehicle.isDrifting ? false : (curveAngle > 0.35 && playerAgent.speedMs > 35),
          steerLeft: steerVal < -0.15,
          steerRight: steerVal > 0.15,
          handbrake: playerAgent.vehicle.isDrifting,
        };
      } else {
        inputState = { throttle: false, brake: false, steerLeft: false, steerRight: false, handbrake: false };
      }
    } else if (this.mode === 'REPLAY') {
      const tick = this.replayPlayer.getCurrentTick();
      inputState = {
        throttle: (tick?.throttle || 0) > 0.05,
        brake: (tick?.brake || 0) > 0.05,
        steerLeft: (tick?.steer || 0) < -0.05,
        steerRight: (tick?.steer || 0) > 0.05,
        handbrake: false,
      };
    } else {
      inputState = { throttle: false, brake: false, steerLeft: false, steerRight: false, handbrake: false };
    }

    const focusedVehicle = this.getFocusedVehicle();
    const isDrifting = focusedVehicle ? focusedVehicle.isDrifting : false;
    const driftStamina = focusedVehicle ? focusedVehicle.driftStamina : 100.0;
    const isSpinningOut = focusedVehicle ? focusedVehicle.isSpinningOut : false;

    const standings = this.computeCurrentStandings();
    const playerEntry = standings.find(s => s.isPlayer);
    const currentRank = playerEntry ? playerEntry.rank : 1;
    const totalRacers = standings.length || 4;

    this.onStateUpdate({
      currentRank,
      totalRacers,
      standings,
      speedKmh: Math.round(speed),
      gear,
      rpmRatio,
      currentLap: lap,
      totalLaps,
      currentLapTimeStr: this.mode === 'REPLAY'
        ? this.formatTime(this.replayPlayer.currentTimeMs)
        : this.formatTime(this.lapTimer.currentLapTimeMs),
      bestLapTimeStr: this.lapTimer.bestLapMs !== Infinity ? this.formatTime(this.lapTimer.bestLapMs) : '--:--.---',
      sectorsMs: this.lapTimer.currentSectorTimes,
      isDrifting,
      driftStamina,
      isSpinningOut,
      gameMode: this.mode,
      raceState: this.raceState,
      countdownText,
      countdownVisible,
      replayTimeStr: this.mode === 'REPLAY' ? `${this.formatTime(this.replayPlayer.currentTimeMs)} / ${this.formatTime(this.replayPlayer.totalDurationMs)}` : undefined,
      inputState,
    });
  }

  /**
   * 실시간 현재 주행 순위 및 전체 참가 차량 수 산출
   */
  /**
   * 실시간 현재 순위 및 참가 드라이버 4인의 랭킹 스탠딩 산출
   */
  public resetStandings(): void {
    this.standingsManager.reset();
  }

  /**
   * 실시간 현재 순위 및 참가 드라이버 4인의 랭킹 스탠딩 산출
   * - 경합(BATTLE) 시 잦은 순위 반전 떨림을 방지하기 위한 히스테리시스 & 홀드 메커니즘:
   *   1) 추월 인정 최소 마진: 2.0m 이상 앞서야 추월 카운트 시작 (단순 미세 오차 무시)
   *   2) 추월 지속 시간: 2.0m 이상 앞선 상태가 최소 0.5초 지속되어야 공식 셔플
   *   3) 스왑 쿨다운: 순위 교체 후 동일 페어 간 1.0초 쿨다운 적용
   *   4) 대형 격차(10m 이상 앞섬): 스핀아웃/대형 충돌 시 지연 없이 즉시 반영
   */
  public computeCurrentStandings(delta: number = this.lastDelta): LeaderboardRacerEntry[] {
    const list: { id: string; driverName: string; isPlayer: boolean; color: string; prog: number }[] = [];

    if (this.mode === 'DRIVING') {
      const playerT = this.circuit.getClosestT(this.playerVehicle.position);
      const playerProg = this.lapTimer.hasPassedStartLine ? (this.lapTimer.currentLap - 1) + playerT : playerT - 1.0;
      list.push({
        id: 'player',
        driverName: this.currentDriverName || 'Apex Hunter',
        isPlayer: true,
        color: this.playerVehicle.color || '#38bdf8',
        prog: playerProg,
      });

      for (let i = 1; i < this.opponentManager.agents.length; i++) {
        const a = this.opponentManager.agents[i];
        if (!a || !a.vehicle.mesh.visible) continue;
        const oppProg = a.hasPassedStartLine ? (a.currentLap - 1) + a.t : a.t - 1.0;
        let displayName = a.driverName;
        if (displayName.includes(' // ')) {
          displayName = displayName.split(' // ')[0];
        }
        list.push({
          id: `opp_${a.id || i}`,
          driverName: displayName,
          isPlayer: false,
          color: a.color,
          prog: oppProg,
        });
      }
    } else if (this.mode === 'DEMO') {
      const playerAgent = this.opponentManager.agents[0];
      const playerProg = playerAgent ? (playerAgent.hasPassedStartLine ? (playerAgent.currentLap - 1) + playerAgent.t : playerAgent.t - 1.0) : 0;
      if (playerAgent) {
        list.push({
          id: 'agent_0',
          driverName: playerAgent.driverName.includes(' // ') ? playerAgent.driverName.split(' // ')[0] : playerAgent.driverName,
          isPlayer: true,
          color: playerAgent.color,
          prog: playerProg,
        });
      }
      for (let i = 1; i < this.opponentManager.agents.length; i++) {
        const a = this.opponentManager.agents[i];
        if (!a || !a.vehicle.mesh.visible) continue;
        const oppProg = a.hasPassedStartLine ? (a.currentLap - 1) + a.t : a.t - 1.0;
        list.push({
          id: `agent_${i}`,
          driverName: a.driverName.includes(' // ') ? a.driverName.split(' // ')[0] : a.driverName,
          isPlayer: false,
          color: a.color,
          prog: oppProg,
        });
      }
    } else if (this.mode === 'REPLAY') {
      const ghost = this.replayPlayer.ghostVehicle;
      const ghostT = this.circuit.getClosestT(ghost.position);
      const ghostLap = this.replayPlayer.currentLap;
      const ghostProg = (ghostLap - 1) + ghostT;

      list.push({
        id: 'ghost',
        driverName: this.currentDriverName || this.currentReplayMetadata?.driverName || 'Player',
        isPlayer: true,
        color: ghost.color || '#38bdf8',
        prog: ghostProg,
      });

      this.replayPlayer.opponentVehicles.forEach((opp, idx) => {
        if (!opp.mesh.visible) return;
        const oppT = this.circuit.getClosestT(opp.position);
        let dt = oppT - ghostT;
        while (dt > 0.5) dt -= 1.0;
        while (dt < -0.5) dt += 1.0;
        const oppProg = ghostProg + dt;
        const cfgName = this.currentReplayMetadata?.opponentConfigs?.[idx]?.driverName;
        list.push({
          id: `replay_opp_${idx}`,
          driverName: cfgName || `Rival ${idx + 1}`,
          isPlayer: false,
          color: opp.color || '#f59e0b',
          prog: oppProg,
        });
      });
    }

    return this.standingsManager.update(list, this.circuit, delta);
  }

  public computeCurrentRank(): { rank: number; total: number } {
    const standings = this.computeCurrentStandings();
    const p = standings.find(s => s.isPlayer);
    return { rank: p ? p.rank : 1, total: standings.length || 4 };
  }

  public getFocusedVehicle(): Vehicle | null {
    if (this.mode === 'DEMO') {
      return this.opponentManager.agents[0]?.vehicle || this.playerVehicle;
    }
    if (this.mode === 'REPLAY') {
      return this.replayPlayer.ghostVehicle;
    }
    return this.playerVehicle;
  }

  public setShowNametags(enabled: boolean): void {
    this.showNametagsSetting = enabled;
    try {
      localStorage.setItem('apex_show_nametags', enabled ? 'true' : 'false');
    } catch {}
    this.updateNameTags();
  }

  private updateNameTags(): void {
    const allowNametags = this.showNametagsSetting;
    const focused = this.getFocusedVehicle();

    // 상대 및 리플레이 경쟁 차량들: 카메라가 포커싱 중인 차량을 제외한 나머지 활성 차량 상단에 이름 표시
    if (allowNametags && this.opponentManager.isActive) {
      const agents = this.opponentManager.agents;
      for (let i = 0; i < agents.length; i++) {
        const v = agents[i].vehicle;
        v.setNameTagVisible(v !== focused && v.mesh.visible);
      }
    } else if (allowNametags && this.mode === 'REPLAY') {
      this.replayPlayer.ghostVehicle.setNameTagVisible(false);
      for (let i = 0; i < this.replayPlayer.opponentVehicles.length; i++) {
        const v = this.replayPlayer.opponentVehicles[i];
        v.setNameTagVisible(v !== focused && v.mesh.visible);
      }
    } else {
      const agents = this.opponentManager.agents;
      for (let i = 0; i < agents.length; i++) {
        agents[i].vehicle.setNameTagVisible(false);
      }
      for (let i = 0; i < this.replayPlayer.opponentVehicles.length; i++) {
        this.replayPlayer.opponentVehicles[i].setNameTagVisible(false);
      }
    }
  }

  private drawMinimap(): void {
    const targetVehicle = this.getFocusedVehicle() || this.playerVehicle;

    MinimapRenderer.draw({
      canvas: this.minimapCanvas,
      ctx: this.minimapCtx,
      circuit: this.circuit,
      targetVehicle,
      opponentManager: this.opponentManager,
      replayPlayer: this.replayPlayer,
      mode: this.mode,
    });
  }

  private formatTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const millis = Math.floor(ms % 1000);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
  }

  public onResize(): void {
    const rawWidth = this.container.clientWidth || window.innerWidth;
    const rawHeight = this.container.clientHeight || window.innerHeight;
    const width = Math.max(rawWidth, 1088);
    const height = Math.max(rawHeight, 612);
    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);

    const settings = graphicsSettingsManager.getSettings();
    const targetRatio = settings.resolution === 'HIGH'
      ? Math.min(window.devicePixelRatio || 1, 2.0)
      : settings.resolution === 'MEDIUM'
        ? Math.min(window.devicePixelRatio || 1, 1.25)
        : 1.0;
    this.renderer.setPixelRatio(targetRatio);
    this.speedFX.resize(width, height);

    const isFullscreen = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
    document.documentElement.classList.toggle('is-fullscreen', isFullscreen);
  }


  /**
   * 그래픽 성능 및 퀄리티 옵션 일괄 적용
   */
  public applyGraphicsSettings(settings: GraphicsSettings): void {
    // 1. 렌더링 해상도 스케일 (Pixel Ratio)
    const targetRatio = settings.resolution === 'HIGH'
      ? Math.min(window.devicePixelRatio || 1, 2.0)
      : settings.resolution === 'MEDIUM'
        ? Math.min(window.devicePixelRatio || 1, 1.25)
        : 1.0;
    this.renderer.setPixelRatio(targetRatio);

    // 2. 동적 그림자 퀄리티
    const shadowsEnabled = settings.shadows !== 'OFF';
    this.renderer.shadowMap.enabled = shadowsEnabled;
    this.renderer.shadowMap.needsUpdate = true;
    this.environmentManager?.setShadowQuality(settings.shadows);

    // 3. 방사형 줌 블러 & 고속 효과 (HIGH: 16샘플, MEDIUM: 8샘플, OFF: 비활성화)
    this.speedFX.setQuality(settings.motionBlur);

    // 4. 다이내믹 FOV 왜곡 & 카메라 쉐이크
    this.cameraController.setDynamicFovEnabled(settings.dynamicFov);
    this.cameraController.setShakeMode(settings.cameraShake);

    // 5. 윈드실드/미러 기후 연출 토글
    this.updateWeatherScreenFX();
  }

  /**
   * 후방 추격 차량 감지 및 백미러 업데이트
   */
  private updateMirrors(targetVehicle: Vehicle): void {
    const opponents = this.opponentManager.agents
      .filter((a) => a.vehicle.mesh.visible && a.vehicle !== targetVehicle)
      .map((a) => a.vehicle);

    if (this.mode === 'DEMO' && targetVehicle !== this.playerVehicle && this.playerVehicle.mesh.visible) {
      opponents.push(this.playerVehicle);
    }

    this.mirrorRenderer.update(targetVehicle, opponents, this.mode === 'DRIVING' || this.mode === 'DEMO');
  }
}
