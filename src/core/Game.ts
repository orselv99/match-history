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

export type GameMode = 'DRIVING' | 'REPLAY' | 'DEMO';
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
  public input: InputManager;
  public audio: AudioManager;
  public lapTimer: LapTimer;
  public recorder: ReplayRecorder;

  public mode: GameMode = 'DRIVING';
  public raceState: RaceState = 'READY';

  private clock: THREE.Clock;
  private container: HTMLElement;
  private minimapCanvas: HTMLCanvasElement;
  private minimapCtx: CanvasRenderingContext2D | null;

  // 카운트다운 타이머
  private countdownTimer: number = 3.0;
  private lastBeepNumber: number = -1;

  // 카메라 파라미터
  private cameraLookTarget: THREE.Vector3 = new THREE.Vector3();

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

    // 2. 카메라
    this.camera = new THREE.PerspectiveCamera(65, container.clientWidth / container.clientHeight, 0.1, 1000);

    // 3. 렌더러
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    // 4. 조명
    this.setupLighting();

    // 5. 모듈 초기화
    this.track = new CircuitTrack();
    this.scene.add(this.track.group);

    this.playerVehicle = new Vehicle(false);
    this.scene.add(this.playerVehicle.mesh);

    this.replayPlayer = new ReplayPlayer();
    this.scene.add(this.replayPlayer.ghostVehicle.mesh);

    this.aiManager = new AICarManager(this.track);
    this.scene.add(this.aiManager.group);

    this.input = new InputManager();
    this.audio = new AudioManager();
    this.lapTimer = new LapTimer(3); // 3랩 완주
    this.recorder = new ReplayRecorder();

    this.clock = new THREE.Clock();

    // 초기 배치 (스타팅 그리드 1번 슬롯)
    this.resetCarToStart();

    // 리사이즈 이벤트
    window.addEventListener('resize', () => this.onResize());

    // 키보드/클릭 이벤트 시 오디오 활성화 및 카운트다운 시작
    window.addEventListener('click', () => {
      this.audio.init();
      if (this.raceState === 'READY') {
        this.startCountdown();
      }
    });

    window.addEventListener('keydown', (e) => {
      this.audio.init();
      if (this.raceState === 'READY' && e.code !== 'KeyR') {
        this.startCountdown();
      }
    });

    // 메인 루프 가동
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  private setupLighting(): void {
    const ambientLight = new THREE.AmbientLight(0xdbeafe, 0.6);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffedd5, 1.4);
    dirLight.position.set(120, 150, 80);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = 400;
    const d = 120;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    this.scene.add(dirLight);

    const hemiLight = new THREE.HemisphereLight(0x7dd3fc, 0x121316, 0.4);
    this.scene.add(hemiLight);
  }

  public resetCarToStart(): void {
    // 플레이어 차량을 스타팅 그리드 1번 슬롯(Pole Position)에 정렬!
    const gridPos = this.track.getGridPosition(0);
    this.playerVehicle.reset(gridPos.position, gridPos.heading);

    this.lapTimer.reset();
    this.recorder.clear();
    this.mode = 'DRIVING';
    this.raceState = 'READY';
    this.countdownTimer = 3.0;
    this.lastBeepNumber = -1;

    this.replayPlayer.pause();
    this.aiManager.deactivate();
  }

  public startCountdown(): void {
    if (this.raceState !== 'READY') return;
    this.raceState = 'COUNTDOWN';
    this.countdownTimer = 3.0;
    this.lastBeepNumber = -1;
  }

  private animate(): void {
    requestAnimationFrame(this.animate);

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

    // 렌더링
    this.renderer.render(this.scene, this.camera);
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

      if (this.mode === 'DRIVING') {
        this.lapTimer.start();
        this.recorder.start();
      } else if (this.mode === 'DEMO') {
        this.recorder.start();
      }
    }
  }

  private updateDriving(delta: number, deltaMs: number): void {
    this.input.update(delta);

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
    this.audio.update(this.playerVehicle.getSpeedKmh(), this.playerVehicle.isDrifting, this.input.throttle);

    // 카메라 추적 (체이스 카메라)
    this.updateChaseCamera(delta, this.playerVehicle);

    // UI 상태 갱신
    this.emitUIState();
  }

  private updateDemo(delta: number, deltaMs: number): void {
    const isRunning = this.raceState === 'RUNNING';
    this.aiManager.update(delta, isRunning);

    const leader = this.aiManager.getLeaderAgent();

    // 데모 중 주행 리플레이 데이터 레코딩 (선두 AI 차량 주행 데이터 수집)
    if (isRunning) {
      this.recorder.update(
        deltaMs,
        leader.vehicle,
        leader.currentLap,
        0, 0.9, 0
      );

      // 3 Lap 완주 판정
      if (this.aiManager.isAllFinished && this.raceState === 'RUNNING') {
        this.raceState = 'FINISHED';
        this.handleFinish(leader.vehicle, 'ai_champion', leader.name);
      }
    }

    // 1위(선두) AI 차량을 역동적으로 추적
    this.updateChaseCamera(delta, leader.vehicle);

    // 오디오 사운드 업데이트
    this.audio.update(leader.vehicle.getSpeedKmh(), false, isRunning ? 0.9 : 0.0);

    this.emitUIState();
  }

  private updateReplay(delta: number, deltaMs: number): void {
    this.replayPlayer.update(deltaMs);
    this.updateChaseCamera(delta, this.replayPlayer.ghostVehicle);
    this.emitUIState();
  }

  private updateChaseCamera(delta: number, targetVehicle: Vehicle): void {
    const heading = targetVehicle.heading + targetVehicle.slipAngle;
    const sinH = Math.sin(heading);
    const cosH = Math.cos(heading);

    const targetCamPos = new THREE.Vector3(
      targetVehicle.position.x - sinH * 8.5,
      targetVehicle.position.y + 4.2,
      targetVehicle.position.z - cosH * 8.5
    );

    this.camera.position.lerp(targetCamPos, Math.min(1.0, 9.0 * delta));

    this.cameraLookTarget.set(
      targetVehicle.position.x + sinH * 4.0,
      targetVehicle.position.y + 1.2,
      targetVehicle.position.z + cosH * 4.0
    );
    this.camera.lookAt(this.cameraLookTarget);
  }

  private async handleFinish(targetVehicle: Vehicle, userId: string, nickname: string): Promise<void> {
    this.recorder.stop();
    this.audio.playFinishFanfare();

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
      userNickname: nickname,
      trackId: 'circuit_monaco',
      vehicleId: 'gt_turbo',
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

  public setMode(mode: GameMode): void {
    this.mode = mode;

    if (mode === 'REPLAY') {
      this.playerVehicle.mesh.visible = false;
      this.aiManager.deactivate();
      this.replayPlayer.play();
      this.raceState = 'RUNNING';
    } else if (mode === 'DEMO') {
      this.playerVehicle.mesh.visible = false;
      this.replayPlayer.pause();
      this.aiManager.activate(); // 4대 차량 그리드 정렬
      this.raceState = 'READY';
      this.countdownTimer = 3.0;
      this.lastBeepNumber = -1;
      this.recorder.clear();
      // 데모 선택 시 자동으로 카운트다운 시작
      this.startCountdown();
    } else {
      this.resetCarToStart();
    }
  }

  private emitUIState(): void {
    if (!this.onStateUpdate) return;

    let speed = 0;
    let lap = this.lapTimer.currentLap;
    const totalLaps = 3;

    if (this.mode === 'DRIVING') {
      speed = this.playerVehicle.getSpeedKmh();
      lap = this.lapTimer.currentLap;
    } else if (this.mode === 'REPLAY') {
      speed = this.replayPlayer.getCurrentTick()?.speedKmh || 0;
    } else if (this.mode === 'DEMO') {
      const leader = this.aiManager.getLeaderAgent();
      speed = leader.vehicle.getSpeedKmh();
      lap = Math.min(3, leader.currentLap);
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
      currentLapTimeStr: this.formatTime(this.lapTimer.currentLapTimeMs),
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
    if (!this.minimapCtx) return;
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // 배경 (Swiss Technical card 면)
    ctx.fillStyle = '#1a1b20';
    ctx.fillRect(0, 0, w, h);

    // 좌표 스케일 매핑
    const scale = 0.55;
    const offsetX = w / 2 + 10;
    const offsetY = h / 2 + 30;

    // 1. 서킷 트랙 라인
    ctx.beginPath();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#2e323b';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    this.track.trackPoints2D.forEach((p, idx) => {
      const cx = p.x * scale + offsetX;
      const cy = p.z * scale + offsetY;
      if (idx === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.closePath();
    ctx.stroke();

    // 2. 스타트 라인
    const startP = this.track.trackPoints2D[0];
    ctx.fillStyle = '#c45a72';
    ctx.beginPath();
    ctx.arc(startP.x * scale + offsetX, startP.z * scale + offsetY, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // 3. 고스트 카 위치
    if (this.replayPlayer.ghostVehicle.mesh.visible) {
      const gp = this.replayPlayer.ghostVehicle.position;
      ctx.fillStyle = '#7dd3fc';
      ctx.beginPath();
      ctx.arc(gp.x * scale + offsetX, gp.z * scale + offsetY, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. 데모 모드: 4대 AI 차량 닷 렌더링
    if (this.aiManager.isActive) {
      this.aiManager.agents.forEach(agent => {
        const p = agent.vehicle.position;
        ctx.fillStyle = `#${agent.color.toString(16).padStart(6, '0')}`;
        ctx.beginPath();
        ctx.arc(p.x * scale + offsetX, p.z * scale + offsetY, 4.5, 0, Math.PI * 2);
        ctx.fill();
      });
    } else {
      // 5. 플레이어 위치
      const pp = this.playerVehicle.position;
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(pp.x * scale + offsetX, pp.z * scale + offsetY, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private formatTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const millis = Math.floor(ms % 1000);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
  }

  private onResize(): void {
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  }
}
