import { Vehicle } from '../../game/Vehicle.ts';
import { OpponentManager } from '../../game/OpponentManager.ts';
import { ReplayPlayer } from '../../replay/ReplayPlayer.ts';
import { AudioManager } from '../AudioManager.ts';
import { CameraController } from '../CameraController.ts';
import { Circuit } from '../../game/Circuit.ts';
import { SkidMarkManager } from '../../game/SkidMarkManager.ts';
import { CollisionManager } from '../../game/CollisionManager.ts';
import { LapTimer } from '../../game/LapTimer.ts';
import { ReplayRecorder } from '../../replay/ReplayRecorder.ts';
import type { GameMode } from '../../types/game.ts';
import type { RaceLifecycleManager } from './RaceLifecycleManager.ts';

export interface GameStateDependencies {
  getPlayerVehicle: () => Vehicle;
  getOpponentManager: () => OpponentManager;
  getReplayPlayer: () => ReplayPlayer;
  getAudio: () => AudioManager;
  getCameraController: () => CameraController;
  getCircuit: () => Circuit;
  getSkidMarkManager: () => SkidMarkManager;
  getCollisionManager: () => CollisionManager;
  getLapTimer: () => LapTimer;
  getRecorder: () => ReplayRecorder;
  getLifecycleManager: () => RaceLifecycleManager;
  clearSpeedFX: () => void;
  updateWeatherScreenFX: () => void;
}

/**
 * 4대 게임 모드 (TITLE, DRIVING, REPLAY, DEMO) 전이 및 환경 상태 동기화 전담 관리자
 */
export class GameStateManager {
  private deps: GameStateDependencies;
  public mode: GameMode = 'TITLE';

  constructor(deps: GameStateDependencies) {
    this.deps = deps;
  }

  public getMode(): GameMode {
    return this.mode;
  }

  /**
   * 지정된 게임 모드로 전환하고 차량 가시성, BGM, AI 상대 및 리플레이 상태를 일괄 동기화
   */
  public setMode(mode: GameMode): void {
    const lifecycle = this.deps.getLifecycleManager();
    lifecycle.isPaused = false;
    this.mode = mode;

    this.deps.updateWeatherScreenFX();
    this.deps.clearSpeedFX();

    const camera = this.deps.getCameraController().camera;
    camera.fov = 65;
    camera.updateProjectionMatrix();
    document.getElementById('slipstream-overlay')?.classList.remove('active');

    const audio = this.deps.getAudio();
    const playerVehicle = this.deps.getPlayerVehicle();
    const replayPlayer = this.deps.getReplayPlayer();
    const opponentManager = this.deps.getOpponentManager();
    const circuit = this.deps.getCircuit();

    if (mode === 'TITLE') {
      audio.pauseEngine();
      audio.playLobbyBgm();
      playerVehicle.mesh.visible = true;
      lifecycle.resetVehicleToStart();
      this.mode = 'TITLE';
      replayPlayer.hideGhost();
      opponentManager.deactivate();
      lifecycle.raceState = 'READY';
      lifecycle.countdownTimer = 3.0;
      lifecycle.lastBeepNumber = -1;
      lifecycle.offroadTimer = 0;
      lifecycle.offroadHintShown = false;
    } else if (mode === 'REPLAY') {
      audio.pauseEngine();
      audio.playInGameBgm();
      playerVehicle.mesh.visible = false;
      opponentManager.deactivate();
      replayPlayer.ghostVehicle.setVehicleModel(playerVehicle.currentVehicleModelId);
      replayPlayer.ghostVehicle.setColor(playerVehicle.color);

      // 상대 차량 3대의 모델 및 컬러를 리플레이 플레이어에 동기화
      if (opponentManager.isActive && opponentManager.agents[1]?.vehicle.currentVehicleModelId) {
        replayPlayer.syncOpponents([
          { vehicleModelId: opponentManager.agents[1]?.vehicle.currentVehicleModelId, color: opponentManager.agents[1]?.color, driverName: opponentManager.agents[1]?.driverName },
          { vehicleModelId: opponentManager.agents[2]?.vehicle.currentVehicleModelId, color: opponentManager.agents[2]?.color, driverName: opponentManager.agents[2]?.driverName },
          { vehicleModelId: opponentManager.agents[3]?.vehicle.currentVehicleModelId, color: opponentManager.agents[3]?.color, driverName: opponentManager.agents[3]?.driverName },
        ]);
      }

      this.deps.getSkidMarkManager().reset();
      this.deps.getCollisionManager().reset();
      replayPlayer.seek(0);
      replayPlayer.pause();
      lifecycle.raceState = 'COUNTDOWN';
      lifecycle.countdownTimer = 3.0;
      lifecycle.lastBeepNumber = -1;
      lifecycle.gantryGoTimer = 0;
      circuit.setGantryLights(0);
      this.deps.getCameraController().snapToTarget(replayPlayer.ghostVehicle);
    } else if (mode === 'DEMO') {
      audio.playInGameBgm();
      playerVehicle.mesh.visible = false;
      replayPlayer.hideGhost();
      const driverName = lifecycle.currentDriverName || 'Apex Hunter';
      opponentManager.setSlotConfig(0, playerVehicle.currentVehicleModelId, playerVehicle.color, driverName);
      opponentManager.activate(false, 0, driverName);
      if (opponentManager.agents[0]) {
        opponentManager.agents[0].vehicle.setHeadlights(playerVehicle.headlightsEnabled);
      }
      this.deps.getSkidMarkManager().reset();
      this.deps.getCollisionManager().reset();
      this.deps.getLapTimer().reset();
      this.deps.getRecorder().clear();
      lifecycle.startRace(true);
    } else { // DRIVING
      audio.playInGameBgm();
      playerVehicle.mesh.visible = true;
      replayPlayer.hideGhost();
      const driverName = lifecycle.currentDriverName || 'Apex Hunter';
      opponentManager.activate(true, 0, driverName);
      lifecycle.resetVehicleToStart();
      lifecycle.raceState = 'READY';
      lifecycle.countdownTimer = 3.0;
      lifecycle.lastBeepNumber = -1;
    }
  }
}
