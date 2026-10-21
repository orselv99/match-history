import * as THREE from 'three';
import { Circuit } from '../../game/Circuit.ts';
import { Vehicle } from '../../game/Vehicle.ts';
import { OpponentManager } from '../../game/OpponentManager.ts';
import { SkidMarkManager } from '../../game/SkidMarkManager.ts';
import { CollisionManager } from '../../game/CollisionManager.ts';
import { EnvironmentManager } from '../../game/EnvironmentManager.ts';
import { LapTimer } from '../../game/LapTimer.ts';
import { ReplayRecorder } from '../../replay/ReplayRecorder.ts';
import { ReplayPlayer } from '../../replay/ReplayPlayer.ts';
import { AudioManager } from '../AudioManager.ts';
import { CameraController } from '../CameraController.ts';
import { StartCutsceneController } from '../StartCutsceneController.ts';
import { StandingsManager } from '../StandingsManager.ts';
import { MirrorRenderer } from '../MirrorRenderer.ts';
import { SpeedFX } from '../../game/SpeedFX.ts';
import { InputManager } from '../InputManager.ts';
import { RaceLifecycleManager } from '../lifecycle/RaceLifecycleManager.ts';
import { ModalManager } from '../../ui/ModalManager.ts';
import { showToast } from '../../ui/Toast.ts';
import type { GameUIState, KeyInputState, LeaderboardRacerEntry } from '../../types/game.ts';

export interface SimulationDependencies {
  getCircuit: () => Circuit;
  getPlayerVehicle: () => Vehicle;
  getOpponentManager: () => OpponentManager;
  getSkidMarkManager: () => SkidMarkManager;
  getCollisionManager: () => CollisionManager;
  getStandingsManager: () => StandingsManager;
  getLapTimer: () => LapTimer;
  getRecorder: () => ReplayRecorder;
  getReplayPlayer: () => ReplayPlayer;
  getAudio: () => AudioManager;
  getCameraController: () => CameraController;
  getStartCutsceneController: () => StartCutsceneController;
  getEnvironmentManager: () => EnvironmentManager;
  getMirrorRenderer: () => MirrorRenderer;
  getSpeedFX: () => SpeedFX;
  getInput: () => InputManager;
  getLifecycle: () => RaceLifecycleManager;
  onSectorPassed?: (driverName: string, sectorName: string, timeMs: number) => void;
  onStateUpdate?: (state: GameUIState) => void;
}

/**
 * 게임 프레임 단위 물리, AI, 충돌, 스키드마크, 오디오 및 HUD 텔레메트리 연산 코디네이터
 */
export class RaceSimulationCoordinator {
  private deps: SimulationDependencies;
  private titleCameraAngle: number = 0;

  constructor(deps: SimulationDependencies) {
    this.deps = deps;
  }

  public getFocusedVehicle(): Vehicle | null {
    const lifecycle = this.deps.getLifecycle();
    if (lifecycle.mode === 'DEMO') {
      return this.deps.getOpponentManager().agents[0]?.vehicle || this.deps.getPlayerVehicle();
    }
    if (lifecycle.mode === 'REPLAY') {
      return this.deps.getReplayPlayer().ghostVehicle;
    }
    return this.deps.getPlayerVehicle();
  }

  public updateDriving(delta: number, deltaMs: number): void {
    const input = this.deps.getInput();
    const lifecycle = this.deps.getLifecycle();
    const circuit = this.deps.getCircuit();
    const playerVehicle = this.deps.getPlayerVehicle();
    const oppMgr = this.deps.getOpponentManager();
    const collisionMgr = this.deps.getCollisionManager();
    const skidMgr = this.deps.getSkidMarkManager();
    const envMgr = this.deps.getEnvironmentManager();
    const lapTimer = this.deps.getLapTimer();
    const recorder = this.deps.getRecorder();
    const audio = this.deps.getAudio();
    const cameraCtrl = this.deps.getCameraController();

    input.update(delta);

    // 주행 준비 상태에서 가속 키(W / ↑) 입력 시 즉시 카운트다운 시작
    if (lifecycle.raceState === 'READY' && input.throttle > 0) {
      lifecycle.startCountdown();
    }

    const isRunning = lifecycle.raceState === 'RUNNING';
    const isFinished = lifecycle.raceState === 'FINISHED';

    // 서킷 3D 표면 정보 조회 (고도, 종방향 경사율, 노면 피치 각도, 중심선 이탈 거리)
    const surface = circuit.getCircuitSurfaceInfo(playerVehicle.position, playerVehicle.heading);
    const isOffroad = surface.distFromCenter > (circuit.circuitWidth / 2 + 1.2);

    let activeThrottle = isRunning ? input.throttle : 0;
    let activeBrake = isRunning ? input.brake : 0;
    let activeSteer = isRunning ? input.steer : 0;

    if (isFinished) {
      activeThrottle = 0;
      activeSteer = 0;
      if (playerVehicle.speed > 0) {
        playerVehicle.speed = Math.max(0, playerVehicle.speed - 10.0 * delta);
      }
      activeBrake = playerVehicle.speed > 0.2 ? 0.35 : 0;
    }

    // 슬립스트림 역학 판정
    let isSlipstreaming = false;
    if (isRunning && playerVehicle.speed > 12.0) {
      const sinH = Math.sin(playerVehicle.heading);
      const cosH = Math.cos(playerVehicle.heading);
      for (const agent of oppMgr.agents) {
        if (!agent.vehicle.mesh.visible) continue;
        const dx = agent.vehicle.position.x - playerVehicle.position.x;
        const dz = agent.vehicle.position.z - playerVehicle.position.z;
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

    // 차량 물리 업데이트
    playerVehicle.update(
      delta,
      activeThrottle,
      activeBrake,
      activeSteer,
      isFinished ? false : input.handbrake,
      isOffroad,
      surface.groundY,
      surface.slopeSin,
      surface.roadPitch,
      lifecycle.currentWeather
    );

    // 하부 스파크 및 카메라 충격
    if (playerVehicle.lastLandingImpact > 0.3) {
      collisionMgr.emitBottomingSparks(playerVehicle, playerVehicle.lastLandingImpact);
      cameraCtrl.triggerShake(playerVehicle.lastLandingImpact * 0.45);
    }

    // 오프로드 3초 이상 이탈 시 서킷 복귀 안내 토스트 표시
    if (isOffroad && isRunning && !ModalManager.hasActiveModal() && lifecycle.mode === 'DRIVING') {
      lifecycle.offroadTimer += delta;
      if (lifecycle.offroadTimer >= 3.0 && !lifecycle.offroadHintShown) {
        lifecycle.offroadHintShown = true;
        showToast('⚠️ 서킷 이탈! [R] 키를 누르면 트랙으로 즉시 복귀합니다.', 4000);
      }
    } else {
      lifecycle.offroadTimer = 0;
      lifecycle.offroadHintShown = false;
    }

    // [R] 키 입력 시 가장 가까운 서킷 노면 중심선으로 안전 복귀
    if (input.resetRequested && (isRunning || lifecycle.raceState === 'READY')) {
      input.resetRequested = false;
      const respawn = circuit.getNearestTrackPoint(playerVehicle.position);
      playerVehicle.reset(respawn.position, respawn.heading);
      lifecycle.offroadTimer = 0;
      lifecycle.offroadHintShown = false;
      showToast('🔄 트랙 중심선으로 안전 복귀했습니다.', 2200);
    }

    // 상대 차량에 플레이어 위치 실시간 동기화
    if (oppMgr.isRivalsMode) {
      const playerT = circuit.getClosestT(playerVehicle.position);
      oppMgr.syncPlayerState(
        playerT,
        Math.max(0, playerVehicle.speed),
        lapTimer.currentLap,
        0,
        playerVehicle.position
      );
    }

    // 상대 차량 업데이트
    oppMgr.update(delta, isRunning || isFinished);

    // 활성 차량 수집
    const activeVehicles = [
      playerVehicle,
      ...oppMgr.agents.filter(a => a.vehicle.mesh.visible).map(a => a.vehicle)
    ];

    collisionMgr.update(delta, activeVehicles, playerVehicle);
    oppMgr.syncFromPhysics();
    skidMgr.update(delta, activeVehicles);

    envMgr.update(
      delta,
      playerVehicle.position,
      playerVehicle.heading,
      playerVehicle.speed
    );

    if (isRunning) {
      lapTimer.update(
        deltaMs,
        playerVehicle.position,
        circuit.checkpoints,
        (cpId, sectorTimeMs) => {
          audio.playCheckpointBeep();
          const sectorName = cpId === 1 ? 'S1' : cpId === 2 ? 'S2' : '도착선';
          if (this.deps.onSectorPassed) {
            this.deps.onSectorPassed(lifecycle.currentDriverName || 'Apex Hunter', sectorName, sectorTimeMs);
          }
        }
      );

      const opponents = [
        oppMgr.agents[1]?.vehicle,
        oppMgr.agents[2]?.vehicle,
        oppMgr.agents[3]?.vehicle,
      ].filter(Boolean) as Vehicle[];

      recorder.update(
        deltaMs,
        playerVehicle,
        lapTimer.currentLap,
        input.steer,
        input.throttle,
        input.brake,
        opponents
      );

      if (lapTimer.isFinished && recorder.getTickCount() > 0) {
        lifecycle.raceState = 'FINISHED';
        this.deps.getSpeedFX().clear();
        cameraCtrl.snapFinishCutscene(playerVehicle);
        lifecycle.handleFinish(playerVehicle, 'driver_kr_01', 'Apex Hunter');
      }
    }

    if (lifecycle.raceState === 'FINISHED') {
      audio.pauseEngine();
    } else {
      audio.update(playerVehicle.getSpeedKmh(), playerVehicle.isDrifting, input.throttle);
    }

    if (lifecycle.raceState === 'FINISHED') {
      const winner = lapTimer.isFinished
        ? playerVehicle
        : (oppMgr.agents.find(a => a.isFinished)?.vehicle || playerVehicle);
      cameraCtrl.updateFinishCutscene(delta, winner);
    } else {
      cameraCtrl.updateChase(delta, playerVehicle);
    }

    this.updateMirrors(playerVehicle);
    this.emitUIState();
  }

  public updateDemo(delta: number, deltaMs: number): void {
    const lifecycle = this.deps.getLifecycle();
    const oppMgr = this.deps.getOpponentManager();
    const collisionMgr = this.deps.getCollisionManager();
    const skidMgr = this.deps.getSkidMarkManager();
    const envMgr = this.deps.getEnvironmentManager();
    const lapTimer = this.deps.getLapTimer();
    const recorder = this.deps.getRecorder();
    const cameraCtrl = this.deps.getCameraController();
    const audio = this.deps.getAudio();
    const circuit = this.deps.getCircuit();
    const playerVehicle = this.deps.getPlayerVehicle();

    const isRunning = lifecycle.raceState === 'RUNNING';
    const isFinished = lifecycle.raceState === 'FINISHED';
    oppMgr.update(delta, isRunning || isFinished);

    const playerAgent = oppMgr.agents[0];
    const targetVehicle = playerAgent ? playerAgent.vehicle : playerVehicle;
    const activeVehicles = oppMgr.agents.filter(a => a.vehicle.mesh.visible).map(a => a.vehicle);

    collisionMgr.update(delta, activeVehicles);
    oppMgr.syncFromPhysics();
    skidMgr.update(delta, activeVehicles);
    envMgr.update(delta, targetVehicle.position, targetVehicle.heading, targetVehicle.speed);

    if (isRunning && playerAgent) {
      lapTimer.update(
        deltaMs,
        targetVehicle.position,
        circuit.checkpoints,
        () => audio.playCheckpointBeep()
      );

      const opponents = oppMgr.agents
        .filter(a => a !== playerAgent && a.vehicle.mesh.visible)
        .map(a => a.vehicle);

      recorder.update(
        deltaMs,
        targetVehicle,
        playerAgent.currentLap,
        0, 0.9, 0,
        opponents
      );

      if ((playerAgent.isFinished || oppMgr.isAllFinished || lapTimer.isFinished) && lifecycle.raceState === 'RUNNING') {
        lifecycle.raceState = 'FINISHED';
        this.deps.getSpeedFX().clear();
        cameraCtrl.snapFinishCutscene(targetVehicle);
        lifecycle.handleFinish(targetVehicle, 'player_demo', playerAgent.driverName);
      }
    }

    if (lifecycle.raceState === 'FINISHED') {
      const winner = oppMgr.agents[0]?.vehicle || targetVehicle;
      cameraCtrl.updateFinishCutscene(delta, winner);
    } else {
      cameraCtrl.updateChase(delta, targetVehicle);
    }

    this.updateMirrors(targetVehicle);

    if (lifecycle.raceState === 'FINISHED') {
      audio.pauseEngine();
    } else {
      audio.update(targetVehicle.getSpeedKmh(), targetVehicle.isDrifting, isRunning ? 0.9 : 0.0);
    }

    this.emitUIState();
  }

  public updateReplay(delta: number, deltaMs: number): void {
    const lifecycle = this.deps.getLifecycle();
    const replayPlayer = this.deps.getReplayPlayer();
    const cameraCtrl = this.deps.getCameraController();
    const envMgr = this.deps.getEnvironmentManager();
    const circuit = this.deps.getCircuit();
    const skidMgr = this.deps.getSkidMarkManager();
    const collisionMgr = this.deps.getCollisionManager();
    const audio = this.deps.getAudio();

    this.deps.getMirrorRenderer().deactivate();

    if (lifecycle.raceState === 'COUNTDOWN') {
      cameraCtrl.updateChase(delta, replayPlayer.ghostVehicle);
      envMgr.update(
        delta,
        replayPlayer.ghostVehicle.position,
        replayPlayer.ghostVehicle.heading,
        replayPlayer.ghostVehicle.speed
      );
      this.emitUIState();
      return;
    }

    if (lifecycle.raceState === 'FINISHED') {
      const leadVehicle = replayPlayer.ghostVehicle;
      if (leadVehicle.speed > 0) {
        leadVehicle.speed = Math.max(0, leadVehicle.speed - 10.0 * delta);
      }
      const leadSurf = circuit.getCircuitSurfaceInfo(leadVehicle.position, leadVehicle.heading);
      leadVehicle.update(delta, 0, 0, 0, false, false, leadSurf.groundY, leadSurf.slopeSin, leadSurf.roadPitch);

      replayPlayer.opponentVehicles.forEach(opp => {
        if (opp.mesh.visible) {
          if (opp.speed > 0) {
            opp.speed = Math.max(0, opp.speed - 9.0 * delta);
          }
          const oppSurf = circuit.getCircuitSurfaceInfo(opp.position, opp.heading);
          opp.update(delta, 0, 0, 0, false, false, oppSurf.groundY, oppSurf.slopeSin, oppSurf.roadPitch);
        }
      });

      cameraCtrl.updateFinishCutscene(delta, leadVehicle);
      envMgr.update(delta, leadVehicle.position, leadVehicle.heading, leadVehicle.speed);
      this.emitUIState();
      return;
    }

    const isPlaying = replayPlayer.isPlaying;
    if (isPlaying) {
      replayPlayer.update(deltaMs);
    }

    const activeReplayVehicles = [
      replayPlayer.ghostVehicle,
      ...replayPlayer.opponentVehicles.filter(v => v.mesh.visible)
    ];

    if (isPlaying) {
      skidMgr.update(delta, activeReplayVehicles);
      collisionMgr.updateReplay(delta, activeReplayVehicles, replayPlayer.ghostVehicle);
      const ghost = replayPlayer.ghostVehicle;
      audio.update(ghost.getSpeedKmh(), ghost.isDrifting, ghost.speed > 5 ? 0.85 : 0.2);
    } else {
      collisionMgr.updateSparks(delta);
      audio.pauseEngine();
    }

    cameraCtrl.updateChase(delta, replayPlayer.ghostVehicle, !isPlaying);
    envMgr.update(
      delta,
      replayPlayer.ghostVehicle.position,
      replayPlayer.ghostVehicle.heading,
      replayPlayer.ghostVehicle.speed
    );
    this.emitUIState();
  }

  public updateStartCutscene(delta: number): void {
    const lifecycle = this.deps.getLifecycle();
    const cutsceneCtrl = this.deps.getStartCutsceneController();
    const envMgr = this.deps.getEnvironmentManager();
    const audio = this.deps.getAudio();
    const playerVehicle = this.deps.getPlayerVehicle();
    const input = this.deps.getInput();

    const { leadVehicle } = cutsceneCtrl.update(
      delta,
      (i) => lifecycle.getVehicleForSlot(i),
      lifecycle.mode === 'DRIVING',
      () => lifecycle.skipStartCutscene()
    );

    const target = leadVehicle || playerVehicle;
    if (cutsceneCtrl.isManualPitDriving) {
      envMgr.update(delta, target.position, target.heading, target.speed);
      audio.update(target.getSpeedKmh(), target.isDrifting, input.throttle);
    } else {
      envMgr.update(delta, target.position, target.heading, target.speed);
      audio.update(target.getSpeedKmh(), false, 0.4);
    }

    this.emitUIState();
  }

  public updateTitle(delta: number, camera: THREE.PerspectiveCamera): void {
    this.deps.getMirrorRenderer().deactivate();
    this.titleCameraAngle += delta * 0.2;
    const radius = 8.5;
    const height = 2.8;
    const carPos = this.deps.getPlayerVehicle().position;

    camera.position.set(
      carPos.x + Math.sin(this.titleCameraAngle) * radius,
      carPos.y + height,
      carPos.z + Math.cos(this.titleCameraAngle) * radius
    );
    camera.lookAt(carPos.x, carPos.y + 0.8, carPos.z);

    this.emitUIState();
  }

  public computeCurrentStandings(delta: number = 0.016): LeaderboardRacerEntry[] {
    const lifecycle = this.deps.getLifecycle();
    const circuit = this.deps.getCircuit();
    const playerVehicle = this.deps.getPlayerVehicle();
    const oppMgr = this.deps.getOpponentManager();
    const replayPlayer = this.deps.getReplayPlayer();
    const lapTimer = this.deps.getLapTimer();

    const list: { id: string; driverName: string; isPlayer: boolean; color: string; prog: number }[] = [];

    if (lifecycle.mode === 'DRIVING') {
      const playerT = circuit.getClosestT(playerVehicle.position);
      const playerProg = lapTimer.hasPassedStartLine ? (lapTimer.currentLap - 1) + playerT : playerT - 1.0;
      list.push({
        id: 'player',
        driverName: lifecycle.currentDriverName || 'Apex Hunter',
        isPlayer: true,
        color: playerVehicle.color || '#38bdf8',
        prog: playerProg,
      });

      for (let i = 1; i < oppMgr.agents.length; i++) {
        const a = oppMgr.agents[i];
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
    } else if (lifecycle.mode === 'DEMO') {
      const playerAgent = oppMgr.agents[0];
      const playerProg = playerAgent ? (playerAgent.hasPassedStartLine ? (playerAgent.currentLap - 1) + playerAgent.t : playerAgent.t - 1.0) : 0;
      if (playerAgent) {
        let pName = lifecycle.currentDriverName || playerAgent.driverName || 'Apex Hunter';
        if (pName.includes(' // ')) {
          pName = pName.split(' // ')[0];
        }
        list.push({
          id: 'agent_0',
          driverName: pName,
          isPlayer: true,
          color: playerAgent.color,
          prog: playerProg,
        });
      }
      for (let i = 1; i < oppMgr.agents.length; i++) {
        const a = oppMgr.agents[i];
        if (!a || !a.vehicle.mesh.visible) continue;
        const oppProg = a.hasPassedStartLine ? (a.currentLap - 1) + a.t : a.t - 1.0;
        let displayName = a.driverName;
        if (displayName.includes(' // ')) {
          displayName = displayName.split(' // ')[0];
        }
        list.push({
          id: `agent_${i}`,
          driverName: displayName,
          isPlayer: false,
          color: a.color,
          prog: oppProg,
        });
      }
    } else if (lifecycle.mode === 'REPLAY') {
      const ghost = replayPlayer.ghostVehicle;
      const ghostT = circuit.getClosestT(ghost.position);
      const ghostLap = replayPlayer.currentLap;
      const ghostProg = (ghostLap - 1) + ghostT;

      list.push({
        id: 'ghost',
        driverName: lifecycle.currentDriverName || lifecycle.currentReplayMetadata?.driverName || 'Player',
        isPlayer: true,
        color: ghost.color || '#38bdf8',
        prog: ghostProg,
      });

      replayPlayer.opponentVehicles.forEach((opp, idx) => {
        if (!opp.mesh.visible) return;
        const oppT = circuit.getClosestT(opp.position);
        let dt = oppT - ghostT;
        while (dt > 0.5) dt -= 1.0;
        while (dt < -0.5) dt += 1.0;
        const oppProg = ghostProg + dt;
        const cfgName = lifecycle.currentReplayMetadata?.opponentConfigs?.[idx]?.driverName;
        list.push({
          id: `replay_opp_${idx}`,
          driverName: cfgName || `Rival ${idx + 1}`,
          isPlayer: false,
          color: opp.color || '#f59e0b',
          prog: oppProg,
        });
      });
    }

    return this.deps.getStandingsManager().update(list, circuit, delta);
  }

  public emitUIState(): void {
    if (!this.deps.onStateUpdate) return;

    const lifecycle = this.deps.getLifecycle();
    const lapTimer = this.deps.getLapTimer();
    const playerVehicle = this.deps.getPlayerVehicle();
    const replayPlayer = this.deps.getReplayPlayer();
    const oppMgr = this.deps.getOpponentManager();
    const input = this.deps.getInput();

    let speed = 0;
    let lap = lapTimer.currentLap;
    const totalLaps = 3;

    if (lifecycle.mode === 'TITLE') {
      speed = 0;
      lap = 1;
    } else if (lifecycle.mode === 'DRIVING') {
      speed = playerVehicle.getSpeedKmh();
      lap = lapTimer.currentLap;
    } else if (lifecycle.mode === 'REPLAY') {
      speed = replayPlayer.getCurrentTick()?.speedKmh || 0;
    } else if (lifecycle.mode === 'DEMO') {
      const playerAgent = oppMgr.agents[0];
      if (playerAgent) {
        speed = playerAgent.vehicle.getSpeedKmh();
        lap = Math.min(3, Math.max(playerAgent.currentLap, lapTimer.currentLap));
      } else {
        speed = 0;
        lap = 1;
      }
    }

    const rpmRatio = Math.min(1.0, (speed % 55) / 55);
    const gear = speed < 2 ? 'N' : speed < 50 ? '1' : speed < 90 ? '2' : speed < 140 ? '3' : speed < 185 ? '4' : '5';

    let countdownText = '';
    let countdownVisible = false;

    if (lifecycle.raceState === 'COUNTDOWN') {
      const num = Math.ceil(lifecycle.countdownTimer);
      countdownText = num > 0 ? num.toString() : 'GO!';
      countdownVisible = true;
    } else {
      countdownVisible = false;
    }

    let inputState: KeyInputState;

    if (lifecycle.mode === 'DRIVING') {
      inputState = {
        throttle: input.throttle > 0.05,
        brake: input.brake > 0.05,
        steerLeft: input.steer < -0.05,
        steerRight: input.steer > 0.05,
        handbrake: input.handbrake,
      };
    } else if (lifecycle.mode === 'DEMO') {
      const playerAgent = oppMgr.agents[0];
      if (playerAgent && lifecycle.raceState === 'RUNNING') {
        const futureT = (playerAgent.t + 0.02) % 1.0;
        const circuit = this.deps.getCircuit();
        const currTangent = circuit.circuitCurve.getTangentAt(playerAgent.t);
        const futureTangent = circuit.circuitCurve.getTangentAt(futureT);
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
    } else if (lifecycle.mode === 'REPLAY') {
      const tick = replayPlayer.getCurrentTick();
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

    this.deps.onStateUpdate({
      currentRank,
      totalRacers,
      standings,
      speedKmh: Math.round(speed),
      gear,
      rpmRatio,
      currentLap: lap,
      totalLaps,
      currentLapTimeStr: lifecycle.mode === 'REPLAY'
        ? lifecycle.formatTime(replayPlayer.currentTimeMs)
        : lifecycle.formatTime(lapTimer.currentLapTimeMs),
      bestLapTimeStr: lapTimer.bestLapMs !== Infinity ? lifecycle.formatTime(lapTimer.bestLapMs) : '--:--.---',
      sectorsMs: lapTimer.currentSectorTimes,
      isDrifting,
      driftStamina,
      isSpinningOut,
      gameMode: lifecycle.mode,
      raceState: lifecycle.raceState,
      countdownText,
      countdownVisible,
      replayTimeStr: lifecycle.mode === 'REPLAY' ? `${lifecycle.formatTime(replayPlayer.currentTimeMs)} / ${lifecycle.formatTime(replayPlayer.totalDurationMs)}` : undefined,
      inputState,
    });
  }

  public updateMirrors(targetVehicle: Vehicle): void {
    const lifecycle = this.deps.getLifecycle();
    const oppMgr = this.deps.getOpponentManager();
    const playerVehicle = this.deps.getPlayerVehicle();

    const opponents = oppMgr.agents
      .filter((a) => a.vehicle.mesh.visible && a.vehicle !== targetVehicle)
      .map((a) => a.vehicle);

    if (lifecycle.mode === 'DEMO' && targetVehicle !== playerVehicle && playerVehicle.mesh.visible) {
      opponents.push(playerVehicle);
    }

    this.deps.getMirrorRenderer().update(
      targetVehicle,
      opponents,
      lifecycle.mode === 'DRIVING' || lifecycle.mode === 'DEMO'
    );
  }
}
