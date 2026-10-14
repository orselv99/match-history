import * as THREE from 'three';
import { CircuitTrack } from '../game/CircuitTrack.ts';
import { Vehicle } from '../game/Vehicle.ts';
import { InputManager } from './InputManager.ts';
import { AudioManager } from './AudioManager.ts';
import { LapTimer } from '../game/LapTimer.ts';
import { ReplayRecorder } from '../replay/ReplayRecorder.ts';
import { ReplayPlayer } from '../replay/ReplayPlayer.ts';
import { ReplayCodec } from '../replay/ReplayCodec.ts';
import { MatchSummaryMetadata } from '../replay/ReplayTypes.ts';
import { AICarManager } from '../game/AICarManager.ts';
import { SkidMarkManager } from '../game/SkidMarkManager.ts';
import { CollisionManager } from '../game/CollisionManager.ts';
import { EnvironmentManager, TimeOfDay, WeatherType } from '../game/EnvironmentManager.ts';
import { MinimapRenderer } from '../game/MinimapRenderer.ts';
import { CameraController } from './CameraController.ts';

export type GameMode = 'TITLE' | 'DRIVING' | 'REPLAY' | 'DEMO';
export type RaceState = 'READY' | 'COUNTDOWN' | 'RUNNING' | 'FINISHED';

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
  gameMode: GameMode;
  raceState: RaceState;
  countdownText?: string;
  countdownVisible: boolean;
  replayTimeStr?: string;
}

/**
 * 레이싱 게임 메인 엔진 (Scene, Camera, Renderer, Game Loop)
 */
export class Game {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;

  public track: CircuitTrack;
  public playerVehicle: Vehicle;
  public replayPlayer: ReplayPlayer;
  public aiManager: AICarManager;
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

  // 카메라 & 환경 전담 매니저
  public cameraController!: CameraController;
  public environmentManager!: EnvironmentManager;

  // 좌/우 백미러 카메라 및 렌더링 상태
  private leftMirrorCamera: THREE.PerspectiveCamera;
  private rightMirrorCamera: THREE.PerspectiveCamera;
  private shouldRenderMirrors: boolean = false;

  // 게임 세션 설정 메타데이터
  public currentDriverName: string = 'Apex Hunter';
  public currentTrackId: string = 'circuit_monaco';
  public currentWeatherId: string = 'clear';

  // 콜백
  public onFinishCallback?: (metadata: MatchSummaryMetadata) => void;
  public onStateUpdate?: (state: GameUIState) => void;

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
    this.track = new CircuitTrack();
    this.scene.add(this.track.group);

    this.playerVehicle = new Vehicle(false);
    this.scene.add(this.playerVehicle.mesh);

    this.replayPlayer = new ReplayPlayer();
    this.scene.add(this.replayPlayer.ghostVehicle.mesh);

    this.aiManager = new AICarManager(this.track);
    this.scene.add(this.aiManager.group);

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

    this.clock = new THREE.Clock();

    // 초기 환경 설정 (맑은 정오)
    this.setEnvironment('noon', 'clear');

    // 초기 모드 설정 (로비 씬 대기)
    this.setMode('TITLE');

    // 키보드/클릭 이벤트 시 오디오 활성화 및 레이스 시작
    window.addEventListener('click', (e) => {
      this.audio.init();
      if (this.isPaused) return;
      const target = e.target as HTMLElement;
      if (target?.closest('.modal-overlay') || target?.closest('.title-scene-overlay') || target?.closest('.interactive')) {
        return;
      }
      if (this.mode === 'DRIVING' && this.raceState === 'READY') {
        this.startCountdown();
      }
    });

    window.addEventListener('keydown', (e) => {
      this.audio.init();
      if (this.isPaused) return;
      if (this.mode === 'DRIVING' && this.raceState === 'READY' && e.code !== 'KeyR' && e.code !== 'KeyO' && e.code !== 'Escape') {
        this.startCountdown();
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
      this.track?.roadMaterial,
      this.playerVehicle,
      this.aiManager,
      this.audio
    );
  }

  public setWeather(weatherId: 'clear' | 'sunset' | 'night' | 'rain'): void {
    this.environmentManager.setWeather(
      weatherId,
      this.track?.roadMaterial,
      this.playerVehicle,
      this.aiManager,
      this.audio
    );
  }

  public toggleHeadlights(): boolean {
    const next = !this.playerVehicle.headlightsEnabled;
    this.playerVehicle.setHeadlights(next);
    if (this.mode === 'DEMO' && this.aiManager.agents[0]) {
      this.aiManager.agents[0].vehicle.setHeadlights(next);
    }
    return next;
  }

  /**
   * 선택된 서킷(Monaco, Silverstone, Nürburgring)을 인게임에 실시간 적용 및 재배치
   */
  public loadTrack(trackId: string): void {
    this.currentTrackId = trackId;
    this.track.loadTrack(trackId);
    this.resetCarToStart();
    this.drawMinimap();
  }

  public resetCarToStart(): void {
    // 플레이어 차량을 스타팅 그리드 1번 슬롯(Pole Position, Y: 0.055m 노면 밀착)에 정렬!
    const gridPos = this.track.getGridPosition(0);
    this.playerVehicle.reset(gridPos.position, gridPos.heading);

    // 주행 모드일 경우 라이벌 AI 차량들도 1, 2, 3번 슬롯에 정렬
    if (this.mode === 'DRIVING') {
      this.aiManager.resetToGrids(true);
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

  public startCountdown(): void {
    if (this.raceState !== 'READY') return;
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
        this.resetCarToStart();
      }
    }

    // 카운트다운 타이머 처리
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

    // 미니맵 드로잉
    this.drawMinimap();

    // 렌더링 (메인 뷰포트 + 좌/우 백미러 시저 렌더링)
    this.renderer.setViewport(0, 0, this.renderer.domElement.width, this.renderer.domElement.height);
    this.renderer.render(this.scene, this.camera);
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

    // 트랙 이탈 감지 (오프로드 마찰 저항)
    const distFromCenter = this.track.getDistanceFromCenter(this.playerVehicle.position);
    const isOffroad = distFromCenter > (this.track.trackWidth / 2 + 1.2);

    // 레이스 시작 전에는 스로틀 입력 락 (엔진 공회전 RPM만 가능)
    const activeThrottle = isRunning ? this.input.throttle : 0;
    const activeBrake = isRunning ? this.input.brake : 0;
    const activeSteer = isRunning ? this.input.steer : 0;

    // 차량 물리 업데이트
    this.playerVehicle.update(
      delta,
      activeThrottle,
      activeBrake,
      activeSteer,
      this.input.handbrake,
      isOffroad
    );

    // 라이벌 AI 차량 업데이트 (3대 그리드 경쟁)
    this.aiManager.update(delta, isRunning);

    // 활성 차량 수집 (플레이어 + 라이벌 AI)
    const activeCars = [
      this.playerVehicle,
      ...this.aiManager.agents.filter(a => a.vehicle.mesh.visible).map(a => a.vehicle)
    ];

    // 차량 간 충돌 감지 및 물리적 반발력 해결 (탄성 반발, 토크, 스파크, 충돌음)
    this.collisionManager.update(delta, activeCars, this.playerVehicle);

    // 드리프트 스키드마크(검은 고무 자국) 및 타이어 연기 업데이트
    this.skidMarkManager.update(delta, activeCars);

    // 비 날씨 파티클 업데이트
    this.environmentManager.updateRain(delta, this.playerVehicle.position);

    if (isRunning) {
      // 랩 타이머 & 체크포인트 판정
      this.lapTimer.update(
        deltaMs,
        this.playerVehicle.position,
        this.track.checkpoints,
        (cpId) => this.audio.playCheckpointBeep()
      );

      // 30Hz 주행 리플레이 데이터 레코딩
      this.recorder.update(
        deltaMs,
        this.playerVehicle,
        this.lapTimer.currentLap,
        this.input.steer,
        this.input.throttle,
        this.input.brake
      );

      // 완주 판정 시
      if (this.lapTimer.isFinished && this.recorder.getTickCount() > 0) {
        this.raceState = 'FINISHED';
        this.handleFinish(this.playerVehicle, 'driver_kr_01', 'Apex Hunter');
      }
    }

    // 사운드 업데이트
    if (this.raceState === 'FINISHED') {
      this.audio.pauseEngine();
    } else {
      this.audio.update(this.playerVehicle.getSpeedKmh(), this.playerVehicle.isDrifting, this.input.throttle);
    }

    // 카메라 추적 (체이스 카메라 & 충돌 쉐이크)
    this.cameraController.updateChase(delta, this.playerVehicle);

    // 후방 추격 차량 감지 및 백미러 업데이트
    this.updateRearviewMirrors(this.playerVehicle);

    // UI 상태 갱신
    this.emitUIState();
  }

  private updateDemo(delta: number, deltaMs: number): void {
    const isRunning = this.raceState === 'RUNNING';
    this.aiManager.update(delta, isRunning);

    // 처음에 설정한 플레이어 차량(슬롯 0)을 타겟으로 고정 추적
    const playerAgent = this.aiManager.agents[0];
    const targetVehicle = playerAgent ? playerAgent.vehicle : this.playerVehicle;
    const activeCars = this.aiManager.agents.filter(a => a.vehicle.mesh.visible).map(a => a.vehicle);

    // AI 차량 간 충돌 감지 및 물리 반응
    this.collisionManager.update(delta, activeCars);

    // 드리프트 스키드마크 및 연기 업데이트
    this.skidMarkManager.update(delta, activeCars);

    // 비 날씨 파티클 업데이트 (플레이어 차량 기준)
    this.environmentManager.updateRain(delta, targetVehicle.position);

    // 데모 중 주행 리플레이 데이터 레코딩 및 플레이어 차량 랩 타이머 갱신
    if (isRunning && playerAgent) {
      this.lapTimer.update(
        deltaMs,
        targetVehicle.position,
        this.track.checkpoints,
        (cpId) => this.audio.playCheckpointBeep()
      );

      this.recorder.update(
        deltaMs,
        targetVehicle,
        playerAgent.currentLap,
        0, 0.9, 0
      );

      // 플레이어 차량 또는 AI 전체 완주 판정
      if ((playerAgent.isFinished || this.aiManager.isAllFinished || this.lapTimer.isFinished) && this.raceState === 'RUNNING') {
        this.raceState = 'FINISHED';
        this.handleFinish(targetVehicle, 'player_demo', playerAgent.name);
      }
    }

    // 처음 설정한 플레이어 차량을 일관되게 고정 추적 (순위가 바뀌어도 카메라 전환 없음)
    this.cameraController.updateChase(delta, targetVehicle);

    // 후방 추격 차량 감지 및 백미러 업데이트
    this.updateRearviewMirrors(targetVehicle);

    // 오디오 사운드 업데이트
    if (this.raceState === 'FINISHED') {
      this.audio.pauseEngine();
    } else {
      this.audio.update(targetVehicle.getSpeedKmh(), false, isRunning ? 0.9 : 0.0);
    }

    this.emitUIState();
  }

  private updateReplay(delta: number, deltaMs: number): void {
    this.deactivateMirrors();
    this.replayPlayer.update(deltaMs);
    this.cameraController.updateChase(delta, this.replayPlayer.ghostVehicle);
    this.emitUIState();
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

    const totalTimeMs = ticks.length > 0 ? ticks[ticks.length - 1].timeMs : 0;
    const bestLapMs = this.lapTimer.bestLapMs !== Infinity ? this.lapTimer.bestLapMs : Math.round(totalTimeMs / 3);
    const lapTimesMs = this.lapTimer.lapHistory.length > 0 ? this.lapTimer.lapHistory.map(l => l.timeMs) : [Math.round(totalTimeMs / 3), Math.round(totalTimeMs / 3), Math.round(totalTimeMs / 3)];
    const sectorTimesMs = this.lapTimer.lapHistory.length > 0 ? this.lapTimer.lapHistory.map(l => l.sectorsMs) : [[22000, 24000, 23000]];

    const topSpeedKmh = Math.max(...ticks.map(t => t.speedKmh), 150);
    const avgSpeedKmh = Number((ticks.reduce((acc, t) => acc + t.speedKmh, 0) / (ticks.length || 1)).toFixed(1));

    const metadata: MatchSummaryMetadata = {
      matchCode: `RACE-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      userId,
      userNickname: this.currentDriverName || nickname,
      trackId: this.currentTrackId,
      vehicleId: this.playerVehicle.currentModelId,
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
      compressionRatioPercent: benchmark.reductionVsJsonPercent
    };

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
  }

  public resume(): void {
    this.isPaused = false;
    this.audio.resumeBgm();
  }

  public restartRace(): void {
    this.isPaused = false;
    this.audio.resumeBgm();
    if (this.mode === 'DEMO') {
      this.setMode('DEMO');
    } else {
      this.resetCarToStart();
      this.recorder.clear();
      this.raceState = 'READY';
      this.countdownTimer = 3.0;
      this.lastBeepNumber = -1;
      this.startCountdown();
    }
  }

  public setMode(mode: GameMode): void {
    this.isPaused = false;
    this.mode = mode;

    if (mode === 'TITLE') {
      this.audio.pauseEngine();
      this.audio.playLobbyBgm();
      this.playerVehicle.mesh.visible = true;
      this.resetCarToStart();
      this.replayPlayer.pause();
      this.aiManager.deactivate();
      this.raceState = 'READY';
      this.countdownTimer = 3.0;
      this.lastBeepNumber = -1;
      this.titleCameraAngle = 0;
    } else if (mode === 'REPLAY') {
      this.audio.pauseEngine();
      this.audio.playInGameBgm();
      this.playerVehicle.mesh.visible = false;
      this.aiManager.deactivate();
      this.replayPlayer.play();
      this.raceState = 'RUNNING';
    } else if (mode === 'DEMO') {
      this.audio.playInGameBgm();
      this.playerVehicle.mesh.visible = false;
      this.replayPlayer.pause();
      // 슬롯 0을 위저드에서 설정한 플레이어 차량 스펙 및 컬러로 동기화
      this.aiManager.setSlotConfig(
        0,
        this.playerVehicle.currentModelId as any,
        this.playerVehicle.bodyColorHex,
        this.currentDriverName || 'Apex Hunter'
      );
      this.aiManager.activate(false); // 4대 차량 전체 그리드 정렬
      if (this.aiManager.agents[0]) {
        this.aiManager.agents[0].vehicle.setHeadlights(this.playerVehicle.headlightsEnabled);
      }
      this.skidMarkManager.reset();
      this.collisionManager.reset();
      this.lapTimer.reset();
      this.raceState = 'READY';
      this.countdownTimer = 3.0;
      this.lastBeepNumber = -1;
      this.recorder.clear();
      // 데모 선택 시 자동으로 카운트다운 시작
      this.startCountdown();
    } else { // DRIVING
      this.audio.playInGameBgm();
      this.playerVehicle.mesh.visible = true;
      this.replayPlayer.pause();
      this.aiManager.activate(true); // 라이벌 AI 3대 (슬롯 1, 2, 3) 활성화
      this.resetCarToStart();
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
      const playerAgent = this.aiManager.agents[0];
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
      isDrifting: this.mode === 'DRIVING' ? this.playerVehicle.isDrifting : false,
      gameMode: this.mode,
      raceState: this.raceState,
      countdownText,
      countdownVisible,
      replayTimeStr: this.mode === 'REPLAY' ? `${this.formatTime(this.replayPlayer.currentTimeMs)} / ${this.formatTime(this.replayPlayer.totalDurationMs)}` : undefined
    });
  }

  private drawMinimap(): void {
    let targetVehicle = this.playerVehicle;
    if (this.mode === 'DEMO') {
      targetVehicle = this.aiManager.agents[0]?.vehicle || this.playerVehicle;
    } else if (this.mode === 'REPLAY') {
      targetVehicle = this.replayPlayer.ghostVehicle;
    }

    MinimapRenderer.draw({
      canvas: this.minimapCanvas,
      ctx: this.minimapCtx,
      track: this.track,
      targetVehicle,
      aiManager: this.aiManager,
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
    let hasCarBehind = false;

    // 라이벌 차량 목록 확인 (현재 타겟 차량 제외)
    const opponents = this.aiManager.agents
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

      // 후방 60m 이내 및 트랙 도로 폭 반경(좌우 12m 이내)에 위치한 후방 차량만 백미러 유효 감지
      if (fwdProj < 1.0 && fwdProj > -60.0 && Math.abs(latProj) < 12.0) {
        hasCarBehind = true;

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

    this.shouldRenderMirrors = hasCarBehind;

    if (!hasCarBehind) {
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

    // 3D 백미러 카메라 위치 및 시선 각도 설정
    const mirrorHeight = targetPos.y + 0.82;
    const mirrorFore = 0.25;
    const mirrorSpan = 0.98;

    // 좌측 미러 카메라: 차량 좌측에 위치(-right), 좌측 뒤편을 향하며 바깥쪽으로 약 10도 펼침
    const leftCamPos = new THREE.Vector3(
      targetPos.x - rightX * mirrorSpan + fwdX * mirrorFore,
      mirrorHeight,
      targetPos.z - rightZ * mirrorSpan + fwdZ * mirrorFore
    );
    const leftLookTarget = new THREE.Vector3(
      leftCamPos.x - fwdX * 25.0 - rightX * 4.5,
      mirrorHeight - 0.2,
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
      mirrorHeight - 0.2,
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
