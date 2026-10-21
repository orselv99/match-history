import * as THREE from 'three';
import { Circuit } from '../../game/Circuit.ts';
import { type CircuitId } from '../../data/circuits.ts';
import { Vehicle } from '../../game/Vehicle.ts';
import { OpponentManager } from '../../game/OpponentManager.ts';
import { SkidMarkManager } from '../../game/SkidMarkManager.ts';
import { CollisionManager } from '../../game/CollisionManager.ts';
import { EnvironmentManager, TimeOfDay, WeatherType } from '../../game/EnvironmentManager.ts';
import { LapTimer } from '../../game/LapTimer.ts';
import { ReplayRecorder } from '../../replay/ReplayRecorder.ts';
import { ReplayPlayer } from '../../replay/ReplayPlayer.ts';
import { ReplayCodec } from '../../replay/ReplayCodec.ts';
import { AudioManager } from '../AudioManager.ts';
import { CameraController } from '../CameraController.ts';
import { StartCutsceneController } from '../StartCutsceneController.ts';
import { StandingsManager } from '../StandingsManager.ts';
import { graphicsSettingsManager } from '../GraphicsSettingsManager.ts';
import { MatchSummaryMetadata, RaceResultEntry } from '../../replay/ReplayTypes.ts';
import type { GameMode, RaceState } from '../../types/game.ts';

export interface RaceLifecycleDependencies {
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
  clearSpeedFX: () => void;
  getMode: () => GameMode;
  setMode: (mode: GameMode) => void;
  onFinish?: (metadata: MatchSummaryMetadata) => void;
}

/**
 * 경기 세션 생명주기 및 모드 상태 머신 전담 관리자
 * - 레이스 상태 (READY, START_CUTSCENE, COUNTDOWN, RUNNING, FINISHED, PAUSED) 전이
 * - 갠트리 3구 신호등 시퀀싱 & 카운트다운 비프 사운드
 * - 완주 판정, 4인 드라이버 전적 순위 산출 및 리플레이 벤치마크 메타데이터 집계
 */
export class RaceLifecycleManager {
  private deps: RaceLifecycleDependencies;

  public get mode(): GameMode {
    return this.deps.getMode();
  }
  public set mode(m: GameMode) {
    this.deps.setMode(m);
  }

  public raceState: RaceState = 'READY';
  public isPaused: boolean = false;
  public playerGridSlot: number = 0;

  public currentDriverName: string = 'Apex Hunter';
  public currentCircuitId: CircuitId = 'circuit_monaco';
  public currentTimeOfDay: TimeOfDay = 'noon';
  public currentWeather: WeatherType = 'clear';
  public currentReplayMetadata?: MatchSummaryMetadata | null;

  public countdownTimer: number = 3.0;
  public lastBeepNumber: number = -1;
  public gantryGoTimer: number = 0;

  public offroadTimer: number = 0;
  public offroadHintShown: boolean = false;

  constructor(deps: RaceLifecycleDependencies) {
    this.deps = deps;
  }

  public setDriverName(name: string): void {
    this.currentDriverName = name;
  }

  public setEnvironment(timeOfDay: TimeOfDay, weather: WeatherType): void {
    this.currentTimeOfDay = timeOfDay;
    this.currentWeather = weather;

    const circuit = this.deps.getCircuit();
    const env = this.deps.getEnvironmentManager();
    env.setEnvironment(
      timeOfDay,
      weather,
      circuit?.roadMaterial,
      this.deps.getPlayerVehicle(),
      this.deps.getOpponentManager(),
      this.deps.getAudio()
    );
    circuit?.setNightMode(timeOfDay === 'night');
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

  public getVehicleForSlot(slotIndex: number): Vehicle | null {
    if (this.mode === 'DRIVING') {
      if (slotIndex === this.playerGridSlot) return this.deps.getPlayerVehicle();
      const opp = this.deps.getOpponentManager().getAgentForSlot(slotIndex);
      return opp?.vehicle || null;
    } else {
      return this.deps.getOpponentManager().agents[slotIndex]?.vehicle || (slotIndex === 0 ? this.deps.getPlayerVehicle() : null);
    }
  }

  public resetVehicleToStart(slotIndex?: number): void {
    if (slotIndex !== undefined) {
      this.playerGridSlot = slotIndex;
    } else if (this.mode === 'DRIVING') {
      this.playerGridSlot = Math.floor(Math.random() * 4);
    } else {
      this.playerGridSlot = 0;
    }

    const circuit = this.deps.getCircuit();
    const playerVehicle = this.deps.getPlayerVehicle();
    const oppMgr = this.deps.getOpponentManager();

    const gridPos = circuit.getGridPosition(this.playerGridSlot);
    playerVehicle.reset(gridPos.position, gridPos.heading);

    if (this.mode === 'DRIVING') {
      oppMgr.resetToGrids(true, this.playerGridSlot, this.currentDriverName || 'Apex Hunter');
    }

    this.deps.getSkidMarkManager().reset();
    this.deps.getCollisionManager().reset();
    this.deps.getStandingsManager().reset();

    this.gantryGoTimer = 0;
    circuit.setGantryLights(0);
    this.deps.getLapTimer().reset();
    this.deps.getRecorder().clear();
    this.deps.getAudio().pauseEngine();

    if (this.mode !== 'TITLE' && this.mode !== 'DEMO') {
      this.mode = 'DRIVING';
    }
    this.raceState = 'READY';
    this.countdownTimer = 3.0;
    this.lastBeepNumber = -1;

    this.deps.getReplayPlayer().pause();
  }

  public startRace(withCutscene: boolean = true): void {
    if (withCutscene) {
      this.setupStartCutscene();
    } else {
      this.resetVehicleToStart();
      this.startCountdown();
    }
  }

  public setupStartCutscene(): void {
    this.raceState = 'START_CUTSCENE';
    const recorder = this.deps.getRecorder();
    recorder.stop();
    recorder.clear();

    const circuit = this.deps.getCircuit();
    const playerVehicle = this.deps.getPlayerVehicle();
    const oppMgr = this.deps.getOpponentManager();

    if (this.mode === 'DRIVING') {
      this.playerGridSlot = Math.floor(Math.random() * 4);
      const gridPos = circuit.getGridPosition(this.playerGridSlot);
      playerVehicle.reset(gridPos.position, gridPos.heading);
      oppMgr.resetToGrids(true, this.playerGridSlot, this.currentDriverName || 'Apex Hunter');
    } else {
      this.playerGridSlot = 0;
      oppMgr.resetToGrids(false, 0, this.currentDriverName || 'Apex Hunter');
    }

    this.deps.getStartCutsceneController().setup(
      (i) => this.getVehicleForSlot(i),
      this.mode === 'DRIVING'
    );
  }

  public skipStartCutscene(): void {
    if (this.raceState !== 'START_CUTSCENE') return;
    this.deps.getStartCutsceneController().skip((i) => this.getVehicleForSlot(i));
    this.startCountdown();
  }

  public startCountdown(force: boolean = false): void {
    if (!force && (this.raceState === 'COUNTDOWN' || this.raceState === 'RUNNING')) return;
    this.deps.getStandingsManager().reset();
    this.gantryGoTimer = 0;
    this.deps.getCircuit().setGantryLights(0);
    this.raceState = 'COUNTDOWN';
    this.countdownTimer = 3.0;
    this.lastBeepNumber = -1;
  }

  public updateCountdown(delta: number): void {
    this.countdownTimer -= delta;
    const currentNumber = Math.ceil(this.countdownTimer);

    if (currentNumber > 0 && currentNumber <= 3 && currentNumber !== this.lastBeepNumber) {
      this.lastBeepNumber = currentNumber;
      this.deps.getAudio().playCountdownBeep(false);

      const activeRedCount = 4 - currentNumber;
      this.deps.getCircuit().setGantryLights(activeRedCount, false);
    }

    if (this.countdownTimer <= 0) {
      this.deps.getAudio().playCountdownBeep(true);
      this.raceState = 'RUNNING';

      this.deps.getCircuit().setGantryLights(3, true);
      this.gantryGoTimer = 1.2;

      if (this.mode === 'REPLAY') {
        this.deps.getReplayPlayer().play();
      } else {
        this.deps.getLapTimer().start();
        this.deps.getRecorder().start();
      }
    }
  }

  public updateGantryTimer(delta: number): void {
    if (this.gantryGoTimer > 0) {
      this.gantryGoTimer -= delta;
      if (this.gantryGoTimer <= 0) {
        this.deps.getCircuit().setGantryLights(0);
      }
    }
  }

  public pause(): void {
    if (this.mode !== 'DRIVING' && this.mode !== 'DEMO' && this.mode !== 'REPLAY') return;
    this.isPaused = true;
    this.updateWeatherScreenFX();
    this.deps.getAudio().pauseEngine();
    this.deps.getAudio().pauseBgm();
    if (this.mode === 'REPLAY') {
      this.deps.getReplayPlayer().pause();
    }
  }

  public resume(): void {
    this.isPaused = false;
    this.updateWeatherScreenFX();
    this.deps.getAudio().resumeBgm();
    if (this.mode === 'REPLAY') {
      this.deps.getReplayPlayer().play();
    }
  }

  public restartRace(): void {
    this.isPaused = false;
    this.deps.getAudio().resumeBgm();
    if (this.mode === 'DEMO') {
      this.setMode('DEMO');
    } else {
      this.resetVehicleToStart();
      this.deps.getRecorder().clear();
      this.startRace(true);
    }
  }

  public setMode(mode: GameMode): void {
    this.deps.setMode(mode);
  }

  public computeRaceResults(): RaceResultEntry[] {
    const rawList: { name: string; timeMs: number; isPlayer: boolean; color?: string }[] = [];
    const lapTimer = this.deps.getLapTimer();
    const circuit = this.deps.getCircuit();
    const opponentManager = this.deps.getOpponentManager();
    const playerVehicle = this.deps.getPlayerVehicle();

    const totalLaps = lapTimer.totalLaps;
    const circuitLen = circuit.circuitCurve.getLength();

    if (this.mode === 'DRIVING') {
      const playerTimeMs = Math.round(lapTimer.totalTimeMs);
      rawList.push({
        name: this.currentDriverName || 'Apex Hunter',
        timeMs: playerTimeMs,
        isPlayer: true,
        color: playerVehicle.color,
      });

      for (let i = 1; i < opponentManager.agents.length; i++) {
        const agent = opponentManager.agents[i];
        if (!agent) continue;
        let opponentTimeMs: number;
        if (agent.isFinished && agent.finishTimeMs) {
          opponentTimeMs = Math.round(agent.finishTimeMs);
        } else {
          const remainingLaps = Math.max(0, totalLaps - agent.currentLap);
          const remainingDist = remainingLaps * circuitLen + Math.max(0, 1.0 - agent.t) * circuitLen;
          const speedMs = Math.max(25.0, agent.speedMs || agent.baseSpeedMs);
          const estRemainingMs = (remainingDist / speedMs) * 1000;
          opponentTimeMs = Math.round(Math.max(playerTimeMs + 650, opponentManager.raceTimeMs + estRemainingMs));
        }

        rawList.push({
          name: agent.driverName,
          timeMs: opponentTimeMs,
          isPlayer: false,
          color: agent.color,
        });
      }
    } else {
      for (let i = 0; i < opponentManager.agents.length; i++) {
        const agent = opponentManager.agents[i];
        if (!agent) continue;
        let opponentTimeMs: number;
        if (agent.isFinished && agent.finishTimeMs) {
          opponentTimeMs = Math.round(agent.finishTimeMs);
        } else {
          const remainingLaps = Math.max(0, totalLaps - agent.currentLap);
          const remainingDist = remainingLaps * circuitLen + Math.max(0, 1.0 - agent.t) * circuitLen;
          const speedMs = Math.max(25.0, agent.speedMs || agent.baseSpeedMs);
          const estRemainingMs = (remainingDist / speedMs) * 1000;
          opponentTimeMs = Math.round(opponentManager.raceTimeMs + estRemainingMs);
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

  public async handleFinish(targetVehicle: Vehicle, userId: string, nickname: string): Promise<void> {
    this.updateWeatherScreenFX();
    const recorder = this.deps.getRecorder();
    recorder.stop();

    const audio = this.deps.getAudio();
    audio.pauseEngine();
    audio.duckBgm(true, 0.2);
    audio.playFinishFanfare();
    setTimeout(() => {
      audio.duckBgm(false);
    }, 2200);

    const ticks = recorder.getTicks();
    const benchmark = await ReplayCodec.benchmark(ticks);
    const raceResults = this.computeRaceResults();

    const lapTimer = this.deps.getLapTimer();
    const playerVehicle = this.deps.getPlayerVehicle();
    const opponentManager = this.deps.getOpponentManager();
    const cameraController = this.deps.getCameraController();

    const totalTimeMs = ticks.length > 0 ? ticks[ticks.length - 1].timeMs : 0;
    const bestLapMs = lapTimer.bestLapMs !== Infinity ? lapTimer.bestLapMs : Math.round(totalTimeMs / 3);
    const lapTimesMs = lapTimer.lapHistory.length > 0 ? lapTimer.lapHistory.map(l => l.timeMs) : [Math.round(totalTimeMs / 3), Math.round(totalTimeMs / 3), Math.round(totalTimeMs / 3)];
    let bestLapNum = 1;
    if (lapTimer.lapHistory.length > 0) {
      let minMs = Infinity;
      lapTimer.lapHistory.forEach(l => {
        if (l.timeMs < minMs) {
          minMs = l.timeMs;
          bestLapNum = l.lap;
        }
      });
    }
    const sectorTimesMs = lapTimer.lapHistory.length > 0 ? lapTimer.lapHistory.map(l => l.sectorsMs) : [[22000, 24000, 23000]];

    const topSpeedKmh = Math.max(...ticks.map(t => t.speedKmh), 150);
    const avgSpeedKmh = Number((ticks.reduce((acc, t) => acc + t.speedKmh, 0) / (ticks.length || 1)).toFixed(1));

    const opponentConfigs = [
      { vehicleModelId: opponentManager.agents[1]?.vehicle.currentVehicleModelId, color: opponentManager.agents[1]?.color, driverName: opponentManager.agents[1]?.driverName },
      { vehicleModelId: opponentManager.agents[2]?.vehicle.currentVehicleModelId, color: opponentManager.agents[2]?.color, driverName: opponentManager.agents[2]?.driverName },
      { vehicleModelId: opponentManager.agents[3]?.vehicle.currentVehicleModelId, color: opponentManager.agents[3]?.color, driverName: opponentManager.agents[3]?.driverName },
    ];

    const metadata: MatchSummaryMetadata = {
      matchCode: `RACE-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      userId,
      driverName: this.currentDriverName || nickname,
      circuitId: this.currentCircuitId,
      vehicleModelId: playerVehicle.currentVehicleModelId,
      color: playerVehicle.color,
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
      viewMode: cameraController.viewMode,
    };

    this.currentReplayMetadata = metadata;
    this.deps.getReplayPlayer().loadReplay(ticks);

    if (this.deps.onFinish) {
      this.deps.onFinish(metadata);
    }
  }

  public handleReplayFinish(): void {
    this.raceState = 'FINISHED';
    this.updateWeatherScreenFX();
    this.deps.clearSpeedFX();

    const replayPlayer = this.deps.getReplayPlayer();
    replayPlayer.pause();

    const audio = this.deps.getAudio();
    audio.playFinishFanfare();
    audio.duckBgm(true, 0.2);
    setTimeout(() => {
      audio.duckBgm(false);
    }, 2200);

    const leadVehicle = replayPlayer.ghostVehicle;
    this.deps.getCameraController().snapFinishCutscene(leadVehicle);

    if (this.deps.onFinish && this.currentReplayMetadata) {
      this.deps.onFinish(this.currentReplayMetadata);
    }
  }

  public formatTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const millis = Math.floor(ms % 1000);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
  }
}
