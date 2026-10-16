import * as THREE from 'three';
import { Circuit } from '../game/Circuit.ts';
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
import { CameraController } from './CameraController.ts';
import { SpeedFX } from '../game/SpeedFX.ts';
import { GraphicsSettings, graphicsSettingsManager } from './GraphicsSettingsManager.ts';

export type GameMode = 'TITLE' | 'DRIVING' | 'REPLAY' | 'DEMO';
export type RaceState = 'READY' | 'START_CUTSCENE' | 'COUNTDOWN' | 'RUNNING' | 'FINISHED';

export interface KeyInputState {
  throttle: boolean;
  brake: boolean;
  steerLeft: boolean;
  steerRight: boolean;
  handbrake: boolean;
}

export interface GameUIState {
  speedKmh: number;
  gear: string;
  rpmRatio: number;
  currentLap: number;
  totalLaps: number;
  currentLapTimeStr: string;
  bestLapTimeStr: string;
  sectorsMs: number[];
  isDrifting: boolean;
  driftStamina: number;
  isSpinningOut: boolean;
  gameMode: GameMode;
  raceState: RaceState;
  countdownText?: string;
  countdownVisible: boolean;
  replayTimeStr?: string;
  inputState?: KeyInputState;
}

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

  // 시작 컷씬 (피트 출차 -> 출발선 정렬 및 직접 운전 지원)
  private startCutsceneTimer: number = 0;
  private readonly startCutsceneDuration: number = 4.2;
  private isManualPitDriving: boolean = false;

  // 카메라 & 환경 전담 매니저
  public cameraController!: CameraController;
  public environmentManager!: EnvironmentManager;
  public speedFX: SpeedFX;

  // 좌/우 백미러 카메라 및 렌더링 상태
  private leftMirrorCamera: THREE.PerspectiveCamera;
  private rightMirrorCamera: THREE.PerspectiveCamera;
  private shouldRenderMirrors: boolean = false;

  // 게임 세션 설정 메타데이터
  public currentDriverName: string = 'Apex Hunter';
  public currentCircuitId: string = 'circuit_monaco';
  public currentWeatherId: string = 'clear';
  public currentReplayMetadata?: MatchSummaryMetadata | null;

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

    // 좌/우 백미러 카메라 (사이드 미러 비율 220:116, FOV 52도)
    this.leftMirrorCamera = new THREE.PerspectiveCamera(52, 220 / 116, 0.2, 140);
    this.rightMirrorCamera = new THREE.PerspectiveCamera(52, 220 / 116, 0.2, 140);

    // 3. 렌더러
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
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
    this.applyGraphicsSettings(graphicsSettingsManager.getSettings());

    this.clock = new THREE.Clock();

    // 초기 환경 설정 (맑은 정오)
    this.setEnvironment('noon', 'clear');

    // 초기 모드 설정 (로비 씬 대기)
    this.setMode('TITLE');

    // 키보드/클릭 이벤트 시 오디오 활성화 및 레이스 시작 / 컷씬 건너뛰기
    window.addEventListener('click', (e) => {
      this.audio.init();
      if (this.isPaused) return;
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
      if (this.isPaused) return;
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
    this.currentWeatherId = weather;
    this.environmentManager.setEnvironment(
      timeOfDay,
      weather,
      this.circuit?.roadMaterial,
      this.playerVehicle,
      this.opponentManager,
      this.audio
    );
  }

  public setWeather(weatherId: 'clear' | 'sunset' | 'night' | 'rain'): void {
    this.environmentManager.setWeather(
      weatherId,
      this.circuit?.roadMaterial,
      this.playerVehicle,
      this.opponentManager,
      this.audio
    );
  }

  public toggleHeadlights(): boolean {
    const next = !this.playerVehicle.headlightsEnabled;
    this.playerVehicle.setHeadlights(next);
    if (this.mode === 'DEMO' && this.opponentManager.agents[0]) {
      this.opponentManager.agents[0].vehicle.setHeadlights(next);
    }
    return next;
  }

  public setDriverName(name: string): void {
    this.currentDriverName = name;
  }

  /**
   * 선택된 서킷(Monaco, Monza, Spa-Francorchamps)을 인게임에 실시간 적용 및 재배치
   */
  public loadCircuit(circuitId: string): void {
    this.currentCircuitId = circuitId;
    this.circuit.loadCircuit(circuitId);
    this.resetVehicleToStart();
    this.drawMinimap();
  }

  public resetVehicleToStart(): void {
    // 플레이어 차량을 스타팅 그리드 1번 슬롯(Pole Position, Y: 0.055m 노면 밀착)에 정렬!
    const gridPos = this.circuit.getGridPosition(0);
    this.playerVehicle.reset(gridPos.position, gridPos.heading);

    // 주행 모드일 경우 상대 차량들도 1, 2, 3번 슬롯에 정렬
    if (this.mode === 'DRIVING') {
      this.opponentManager.resetToGrids(true);
    }

    this.skidMarkManager.reset();
    this.collisionManager.reset();

    this.lapTimer.reset();
    this.recorder.clear();
    this.audio.pauseEngine();
    this.mode = 'DRIVING';
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
      if (slotIndex === 0) return this.playerVehicle;
      return this.opponentManager.agents[slotIndex]?.vehicle || null;
    } else {
      return this.opponentManager.agents[slotIndex]?.vehicle || (slotIndex === 0 ? this.playerVehicle : null);
    }
  }

  /**
   * 4대 레이스 머신 각각의 피트 베이 출차 -> 피트 레인 주행 -> 지정 그리드 슬롯 안착 궤적 연산
   * - 슬롯 0: Pole (X: -2.2, Z: -5.0)
   * - 슬롯 1: 2nd  (X: +2.2, Z: -12.0)
   * - 슬롯 2: 3rd  (X: -2.2, Z: -19.0)
   * - 슬롯 3: 4th  (X: +2.2, Z: -26.0)
   */
  private computePitRolloutState(
    i: number,
    progress: number,
    halfW: number
  ): { x: number; z: number; headingOffset: number; speed: number } {
    const slotX = (i % 2 === 0) ? -2.2 : 2.2;
    const slotZ = -5.0 - i * 7.0; // -5.0, -12.0, -19.0, -26.0 (그리드 브래킷 위치와 100% 일치)
    const startX = -(halfW + 6.8);
    const startZ = -28.0 - i * 8.0; // 피트 가레지 베이 앞 대기열 (-28, -36, -44, -52)
    const mergeZ = -18.0 - (3 - i) * 1.5;

    let curX = -(halfW + 5.5);
    let curZ = slotZ;
    let headingOffset = 0.0;
    let speed = 0.0;

    // 1구간: 피트 베이에서 피트 레인 중앙으로 조향 진입 (0.0 ~ 0.25)
    if (progress < 0.25) {
      const p1 = progress / 0.25;
      const ease1 = p1 * p1;
      curX = THREE.MathUtils.lerp(startX, -(halfW + 5.5), ease1);
      curZ = THREE.MathUtils.lerp(startZ, startZ + 8.0, p1);
      headingOffset = THREE.MathUtils.lerp(0.26, 0.0, ease1);
      speed = 7.0;
    }
    // 2구간: 피트 레인 직선 직진 주행 (0.25 ~ 0.58)
    else if (progress < 0.58) {
      const p2 = (progress - 0.25) / 0.33;
      curX = -(halfW + 5.5);
      curZ = THREE.MathUtils.lerp(startZ + 8.0, mergeZ, p2);
      headingOffset = 0.0;
      speed = 9.0;
    }
    // 3구간: 피트 출구 방호벽 개방 구간을 통해 메인 스트레이트 각 슬롯으로 합류 (0.58 ~ 0.88)
    else if (progress < 0.88) {
      const p3 = (progress - 0.58) / 0.30;
      const ease3 = 0.5 - 0.5 * Math.cos(p3 * Math.PI);
      curX = THREE.MathUtils.lerp(-(halfW + 5.5), slotX, ease3);
      curZ = THREE.MathUtils.lerp(mergeZ, slotZ, ease3);
      headingOffset = Math.sin(p3 * Math.PI) * 0.16;
      speed = THREE.MathUtils.lerp(9.0, 1.5, ease3);
    }
    // 4구간: 각 슬롯 화이트 브래킷 박스 안에 반듯하게 도킹 정차 (0.88 ~ 1.0)
    else {
      curX = slotX;
      curZ = slotZ;
      headingOffset = 0.0;
      speed = 0.0;
    }

    return { x: curX, z: curZ, headingOffset, speed };
  }

  public setupStartCutscene(): void {
    this.raceState = 'START_CUTSCENE';
    this.startCutsceneTimer = 0;
    this.isManualPitDriving = false;
    this.recorder.stop();
    this.recorder.clear();

    const halfW = this.circuit.circuitWidth / 2;

    if (this.mode === 'DRIVING') {
      this.opponentManager.resetToGrids(true);
    } else {
      this.opponentManager.resetToGrids(false);
    }

    // 모든 출전 차량(슬롯 0~3)을 그리드가 아닌 피트 가레지/피트 레인 대기열에 순서대로 배치
    for (let i = 0; i < 4; i++) {
      const v = this.getVehicleForSlot(i);
      if (!v) continue;
      const startState = this.computePitRolloutState(i, 0, halfW);
      const worldPos = this.circuit.getStartStraightWorldPosition(startState.x, startState.z);
      v.reset(worldPos.position, worldPos.heading + startState.headingOffset);
      v.speed = (i === 0 && this.mode === 'DRIVING') ? 4.0 : startState.speed;
    }

    const leadVehicle = this.getVehicleForSlot(0) || this.playerVehicle;
    this.cameraController.updateStartCutscene(0.016, leadVehicle, 0);
  }

  public updateStartCutscene(delta: number): void {
    const halfW = this.circuit.circuitWidth / 2;
    const grid0 = this.circuit.getGridPosition(0);

    // 1. 유저 직접 운전 감지 (W/A/S/D 키 입력 시 피트 출차 직접 운전 모드로 즉시 전환)
    if (this.mode === 'DRIVING') {
      this.input.update(delta);
      if (
        !this.isManualPitDriving &&
        (this.input.throttle > 0 || this.input.brake > 0 || Math.abs(this.input.steer) > 0.05)
      ) {
        this.isManualPitDriving = true;
      }
    }

    this.startCutsceneTimer += delta;
    const progress = Math.min(1.0, this.startCutsceneTimer / this.startCutsceneDuration);

    // 4대 차량 각각 피트 출차 주행 갱신
    for (let i = 0; i < 4; i++) {
      const v = this.getVehicleForSlot(i);
      if (!v) continue;

      if (i === 0 && this.isManualPitDriving) {
        // 플레이어 직접 운전
        this.playerVehicle.update(
          delta,
          this.input.throttle,
          this.input.brake,
          this.input.steer,
          this.input.handbrake,
          false
        );
      } else {
        // 롤아웃 주행 (피트 베이 -> 피트 레인 -> 피트 출구 -> 지정 그리드 슬롯 안착)
        const state = this.computePitRolloutState(i, progress, halfW);
        const world = this.circuit.getStartStraightWorldPosition(state.x, state.z);

        v.position.copy(world.position);
        v.heading = world.heading + state.headingOffset;
        v.mesh.position.copy(v.position);
        v.mesh.rotation.set(0, v.heading, 0);

        // 휠 회전
        const wheelRot = (state.speed / 0.38) * delta;
        v.frontLeftWheel.rotation.x += wheelRot;
        v.frontRightWheel.rotation.x += wheelRot;
        v.rearLeftWheel.rotation.x += wheelRot;
        v.rearRightWheel.rotation.x += wheelRot;

        // 조향 각도
        const steerAngle = -state.headingOffset * 1.5;
        v.frontLeftWheel.rotation.y = steerAngle;
        v.frontRightWheel.rotation.y = steerAngle;
      }
    }

    const leadVehicle = this.getVehicleForSlot(0) || this.playerVehicle;

    if (this.isManualPitDriving) {
      this.cameraController.updateChase(delta, this.playerVehicle);
      this.environmentManager.update(delta, this.playerVehicle.position);
      this.audio.update(this.playerVehicle.getSpeedKmh(), this.playerVehicle.isDrifting, this.input.throttle);
      this.emitUIState();

      // 출발선 1번 그리드 슬롯(폴 포지션) 근처 진입 감지 시 자동 도킹 및 카운트다운 시작
      const distToGrid = this.playerVehicle.position.distanceTo(grid0.position);
      if (distToGrid < 4.2 && this.playerVehicle.speed < 14.0) {
        this.skipStartCutscene();
      }
      return;
    }

    // 자동 컷씬 카메라 추적
    this.cameraController.updateStartCutscene(delta, leadVehicle, progress);

    // 환경 효과 & 오디오 업데이트
    this.environmentManager.update(delta, leadVehicle.position);
    this.audio.update(leadVehicle.getSpeedKmh(), false, 0.4);
    this.emitUIState();

    if (progress >= 1.0) {
      this.skipStartCutscene();
    }
  }

  public skipStartCutscene(): void {
    if (this.raceState !== 'START_CUTSCENE') return;
    this.isManualPitDriving = false;

    // 모든 출전 차량(슬롯 0~3)을 각 그리드 위치에 완벽 정렬
    for (let i = 0; i < 4; i++) {
      const v = this.getVehicleForSlot(i);
      if (!v) continue;
      const grid = this.circuit.getGridPosition(i);
      v.reset(grid.position, grid.heading);
      v.speed = 0;
    }

    const leadVehicle = this.getVehicleForSlot(0) || this.playerVehicle;
    this.cameraController.updateChase(0.016, leadVehicle);
    this.startCountdown();
  }

  public startCountdown(): void {
    if (this.raceState === 'COUNTDOWN' || this.raceState === 'RUNNING') return;
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

    if (this.isPaused) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const delta = Math.min(this.clock.getDelta(), 0.1);
    const deltaMs = delta * 1000;

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
    this.renderMirrors();
  }

  private updateCountdown(delta: number): void {
    this.countdownTimer -= delta;

    const currentNumber = Math.ceil(this.countdownTimer);

    if (currentNumber > 0 && currentNumber <= 3 && currentNumber !== this.lastBeepNumber) {
      this.lastBeepNumber = currentNumber;
      this.audio.playCountdownBeep(false); // 3, 2, 1 삐-
    }

    if (this.countdownTimer <= 0) {
      // GO! 신호음 및 레이스 스타트
      this.audio.playCountdownBeep(true);
      this.raceState = 'RUNNING';

      this.lapTimer.start();
      this.recorder.start();
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
      surface.roadPitch
    );

    // 언덕 정점 통과 후 착지 또는 급격한 오르막 전환(컴프레션) 시 하부 스파크 및 카메라 충격 연출
    if (this.playerVehicle.lastLandingImpact > 0.3) {
      this.collisionManager.emitBottomingSparks(this.playerVehicle, this.playerVehicle.lastLandingImpact);
      this.cameraController.triggerShake(this.playerVehicle.lastLandingImpact * 0.45);
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
    this.environmentManager.update(delta, this.playerVehicle.position);

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
    this.updateRearviewMirrors(this.playerVehicle);

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
    this.environmentManager.update(delta, targetVehicle.position);

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
    this.updateRearviewMirrors(targetVehicle);

    // 오디오 사운드 업데이트
    if (this.raceState === 'FINISHED') {
      this.audio.pauseEngine();
    } else {
      this.audio.update(targetVehicle.getSpeedKmh(), targetVehicle.isDrifting, isRunning ? 0.9 : 0.0);
    }

    this.emitUIState();
  }

  private updateReplay(delta: number, deltaMs: number): void {
    this.deactivateMirrors();

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
      this.environmentManager.update(delta, leadVehicle.position);
      this.emitUIState();
      return;
    }

    this.replayPlayer.update(deltaMs);
    this.cameraController.updateChase(delta, this.replayPlayer.ghostVehicle);
    this.environmentManager.update(delta, this.replayPlayer.ghostVehicle.position);
    this.emitUIState();
  }

  public handleReplayFinish(): void {
    this.raceState = 'FINISHED';
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
      bestLapMs,
      lapTimesMs,
      sectorTimesMs,
      topSpeedKmh,
      avgSpeedKmh,
      createdAt: new Date().toISOString(),
      rawJsonBytes: benchmark.rawJsonBytes,
      quantizedBinaryBytes: benchmark.binaryBytes,
      compressedBytes: benchmark.compressedBytes,
      compressionRatioPercent: benchmark.reductionVsJsonPercent,
      raceResults,
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
    this.audio.pauseEngine();
    this.audio.pauseBgm();
    if (this.mode === 'REPLAY') {
      this.replayPlayer.pause();
    }
  }

  public resume(): void {
    this.isPaused = false;
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
    this.speedFX.clear();
    this.cameraController.camera.fov = 65;
    this.cameraController.camera.updateProjectionMatrix();

    if (mode === 'TITLE') {
      this.audio.pauseEngine();
      this.audio.playLobbyBgm();
      this.playerVehicle.mesh.visible = true;
      this.resetVehicleToStart();
      this.replayPlayer.hideGhost();
      this.opponentManager.deactivate();
      this.raceState = 'READY';
      this.countdownTimer = 3.0;
      this.lastBeepNumber = -1;
      this.titleCameraAngle = 0;
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

      this.replayPlayer.seek(0);
      this.replayPlayer.play();
      this.raceState = 'RUNNING';
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
    this.deactivateMirrors();
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

    this.onStateUpdate({
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

  public getFocusedVehicle(): Vehicle | null {
    if (this.mode === 'DEMO') {
      return this.opponentManager.agents[0]?.vehicle || this.playerVehicle;
    }
    if (this.mode === 'REPLAY') {
      return this.replayPlayer.ghostVehicle;
    }
    return this.playerVehicle;
  }

  private updateNameTags(): void {
    const focused = this.getFocusedVehicle();

    // 상대 및 리플레이 경쟁 차량들: 카메라가 포커싱 중인 차량을 제외한 나머지 활성 차량 상단에 이름 표시
    if (this.opponentManager.isActive) {
      const agents = this.opponentManager.agents;
      for (let i = 0; i < agents.length; i++) {
        const v = agents[i].vehicle;
        v.setNameTagVisible(v !== focused && v.mesh.visible);
      }
    } else if (this.mode === 'REPLAY') {
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
  }

  /**
   * 백미러 비활성화 처리
   */
  private deactivateMirrors(): void {
    if (!this.shouldRenderMirrors) return;
    this.shouldRenderMirrors = false;
    const leftFrame = document.getElementById('left-mirror-frame');
    const rightFrame = document.getElementById('right-mirror-frame');
    if (leftFrame) leftFrame.classList.remove('active', 'danger');
    if (rightFrame) rightFrame.classList.remove('active', 'danger');
  }

  /**
   * 후방 추격 차량 감지 및 좌/우 백미러 카메라/HUD 업데이트
   */
  private updateRearviewMirrors(targetVehicle: Vehicle): void {
    const leftFrame = document.getElementById('left-mirror-frame');
    const rightFrame = document.getElementById('right-mirror-frame');
    const leftDistEl = document.getElementById('left-mirror-dist');
    const rightDistEl = document.getElementById('right-mirror-dist');

    if (!leftFrame || !rightFrame) {
      this.shouldRenderMirrors = false;
      return;
    }

    if (this.mode !== 'DRIVING' && this.mode !== 'DEMO') {
      this.deactivateMirrors();
      return;
    }

    const heading = targetVehicle.heading + targetVehicle.slipAngle;
    const fwdX = Math.sin(heading);
    const fwdZ = Math.cos(heading);
    // 차량의 우측 방향 벡터: Forward (sin h, 0, cos h) x Up (0, 1, 0) = (-cos h, 0, sin h)
    const rightX = -Math.cos(heading);
    const rightZ = Math.sin(heading);

    const targetPos = targetVehicle.position;

    let nearestLeftDist = Infinity;
    let nearestRightDist = Infinity;
    let hasVehicleBehind = false;

    // 상대 차량 목록 확인 (현재 타겟 차량 제외)
    const opponents = this.opponentManager.agents
      .filter((a) => a.vehicle.mesh.visible && a.vehicle !== targetVehicle)
      .map((a) => a.vehicle);

    if (this.mode === 'DEMO' && targetVehicle !== this.playerVehicle && this.playerVehicle.mesh.visible) {
      opponents.push(this.playerVehicle);
    }

    const myRearFore = 2.25;
    const oppFrontFore = 2.25;

    for (const opp of opponents) {
      const dx = opp.position.x - targetPos.x;
      const dz = opp.position.z - targetPos.z;
      const fwdProj = dx * fwdX + dz * fwdZ;     // 양수면 전방, 음수면 후방
      const latProj = dx * rightX + dz * rightZ; // 양수면 우측(+), 음수면 좌측(-)

      // 후방 60m 이내 및 서킷 도로 폭 반경(좌우 12m 이내)에 위치한 후방 차량만 백미러 유효 감지
      if (fwdProj < 1.0 && fwdProj > -60.0 && Math.abs(latProj) < 12.0) {
        hasVehicleBehind = true;

        // 내 차량 후방(범퍼)부터 뒷차량 전방(범퍼)까지의 실제 유효 거리 계산 (접촉 시 0.0m)
        // fwdProj는 음수이므로 -fwdProj는 차량 중심 간 종방향 거리
        const longitudinalDist = Math.max(0, -fwdProj - (myRearFore + oppFrontFore));
        const lateralDist = Math.max(0, Math.abs(latProj) - 1.8);
        const bumperDist = Math.hypot(longitudinalDist, lateralDist);

        // 좌측 미러: 차량의 좌측(latProj <= 0.8) 또는 정후방 차량 감지
        if (latProj <= 0.8) {
          if (bumperDist < nearestLeftDist) nearestLeftDist = bumperDist;
        }
        // 우측 미러: 차량의 우측(latProj >= -0.8) 또는 정후방 차량 감지
        if (latProj >= -0.8) {
          if (bumperDist < nearestRightDist) nearestRightDist = bumperDist;
        }
      }
    }

    this.shouldRenderMirrors = hasVehicleBehind;

    if (!hasVehicleBehind) {
      leftFrame.classList.remove('active', 'danger');
      rightFrame.classList.remove('active', 'danger');
      return;
    }

    // 백미러 UI 활성화
    leftFrame.classList.add('active');
    rightFrame.classList.add('active');

    // 좌측 미러 거리 및 후방 범퍼 10m 이내 위험 경고
    if (nearestLeftDist < Infinity) {
      if (leftDistEl) leftDistEl.textContent = `${nearestLeftDist.toFixed(1)}m`;
      if (nearestLeftDist < 10.0) {
        leftFrame.classList.add('danger');
      } else {
        leftFrame.classList.remove('danger');
      }
    } else {
      if (leftDistEl) leftDistEl.textContent = '--.-m';
      leftFrame.classList.remove('danger');
    }

    // 우측 미러 거리 및 후방 범퍼 10m 이내 위험 경고
    if (nearestRightDist < Infinity) {
      if (rightDistEl) rightDistEl.textContent = `${nearestRightDist.toFixed(1)}m`;
      if (nearestRightDist < 10.0) {
        rightFrame.classList.add('danger');
      } else {
        rightFrame.classList.remove('danger');
      }
    } else {
      if (rightDistEl) rightDistEl.textContent = '--.-m';
      rightFrame.classList.remove('danger');
    }

    // 3D 백미러 카메라 위치 및 시선 각도 설정 (경사로 주행 시 후방 노면 각도에 맞춰 시선 피치 보정)
    const mirrorHeight = targetPos.y + 0.82;
    const mirrorFore = 0.25;
    const mirrorSpan = 0.98;
    const rearSlopeOffset = Math.sin(targetVehicle.pitch) * 25.0;

    // 좌측 미러 카메라: 차량 좌측에 위치(-right), 좌측 뒤편을 향하며 바깥쪽으로 약 10도 펼침
    const leftCamPos = new THREE.Vector3(
      targetPos.x - rightX * mirrorSpan + fwdX * mirrorFore,
      mirrorHeight,
      targetPos.z - rightZ * mirrorSpan + fwdZ * mirrorFore
    );
    const leftLookTarget = new THREE.Vector3(
      leftCamPos.x - fwdX * 25.0 - rightX * 4.5,
      mirrorHeight - 0.2 + rearSlopeOffset,
      leftCamPos.z - fwdZ * 25.0 - rightZ * 4.5
    );
    this.leftMirrorCamera.position.copy(leftCamPos);
    this.leftMirrorCamera.lookAt(leftLookTarget);

    // 우측 미러 카메라: 차량 우측에 위치(+right), 우측 뒤편을 향하며 바깥쪽으로 약 10도 펼침
    const rightCamPos = new THREE.Vector3(
      targetPos.x + rightX * mirrorSpan + fwdX * mirrorFore,
      mirrorHeight,
      targetPos.z + rightZ * mirrorSpan + fwdZ * mirrorFore
    );
    const rightLookTarget = new THREE.Vector3(
      rightCamPos.x - fwdX * 25.0 + rightX * 4.5,
      mirrorHeight - 0.2 + rearSlopeOffset,
      rightCamPos.z - fwdZ * 25.0 + rightZ * 4.5
    );
    this.rightMirrorCamera.position.copy(rightCamPos);
    this.rightMirrorCamera.lookAt(rightLookTarget);
  }

  /**
   * Three.js 하드웨어 가속 뷰포트/시저(Scissor)를 이용한 초고속 백미러 렌더링
   */
  private renderMirrors(): void {
    if (!this.shouldRenderMirrors) return;

    const leftFrame = document.getElementById('left-mirror-frame');
    const rightFrame = document.getElementById('right-mirror-frame');
    if (!leftFrame || !rightFrame) return;

    const leftViewArea = (leftFrame.querySelector('.mirror-view-area') as HTMLElement) || leftFrame;
    const rightViewArea = (rightFrame.querySelector('.mirror-view-area') as HTMLElement) || rightFrame;

    const containerRect = this.container.getBoundingClientRect();
    const leftRect = leftViewArea.getBoundingClientRect();
    const rightRect = rightViewArea.getBoundingClientRect();

    if (leftRect.width <= 0 || leftRect.height <= 0) return;

    const pixelRatio = this.renderer.getPixelRatio();

    this.renderer.setScissorTest(true);

    // 좌측 미러 뷰포트 (WebGL Y좌표는 캔버스 하단 기준)
    const leftX = Math.round((leftRect.left - containerRect.left) * pixelRatio);
    const leftY = Math.round((containerRect.bottom - leftRect.bottom) * pixelRatio);
    const leftW = Math.round(leftRect.width * pixelRatio);
    const leftH = Math.round(leftRect.height * pixelRatio);

    if (leftW > 0 && leftH > 0) {
      this.renderer.setViewport(leftX, leftY, leftW, leftH);
      this.renderer.setScissor(leftX, leftY, leftW, leftH);
      this.renderer.render(this.scene, this.leftMirrorCamera);
    }

    // 우측 미러 뷰포트
    const rightX = Math.round((rightRect.left - containerRect.left) * pixelRatio);
    const rightY = Math.round((containerRect.bottom - rightRect.bottom) * pixelRatio);
    const rightW = Math.round(rightRect.width * pixelRatio);
    const rightH = Math.round(rightRect.height * pixelRatio);

    if (rightW > 0 && rightH > 0) {
      this.renderer.setViewport(rightX, rightY, rightW, rightH);
      this.renderer.setScissor(rightX, rightY, rightW, rightH);
      this.renderer.render(this.scene, this.rightMirrorCamera);
    }

    // 메인 뷰포트 복원 & 시저 테스트 종료
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(
      0,
      0,
      this.renderer.domElement.width,
      this.renderer.domElement.height
    );
  }
}
