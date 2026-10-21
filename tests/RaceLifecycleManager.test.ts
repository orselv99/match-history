import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { RaceLifecycleManager, type RaceLifecycleDependencies } from '../src/core/lifecycle/RaceLifecycleManager.ts';
import type { Circuit } from '../src/game/Circuit.ts';
import type { Vehicle } from '../src/game/Vehicle.ts';
import type { OpponentManager } from '../src/game/OpponentManager.ts';
import type { LapTimer } from '../src/game/LapTimer.ts';
import type { AudioManager } from '../src/core/AudioManager.ts';
import type { GameMode } from '../src/types/game.ts';

describe('RaceLifecycleManager', () => {
  let lifecycle: RaceLifecycleManager;
  let mockMode: GameMode = 'DRIVING';

  const mockCircuit = {
    setGantryLights: vi.fn(),
    circuitCurve: {
      getLength: () => 1500,
    },
    getGridPosition: () => ({ position: new THREE.Vector3(), heading: 0 }),
  } as unknown as Circuit;

  const mockAudio = {
    playCountdownBeep: vi.fn(),
    pauseEngine: vi.fn(),
    resumeBgm: vi.fn(),
    pauseBgm: vi.fn(),
    duckBgm: vi.fn(),
    playFinishFanfare: vi.fn(),
  } as unknown as AudioManager;

  const mockPlayerVehicle = {
    color: '#ef4444',
    currentVehicleModelId: 'formula_aero',
    reset: vi.fn(),
  } as unknown as Vehicle;

  const mockOpponentManager = {
    agents: [
      { driverName: 'Player', color: '#ef4444', vehicle: mockPlayerVehicle, isFinished: false, currentLap: 1, t: 0.1 },
      { driverName: 'Opponent 1', color: '#38bdf8', isFinished: true, finishTimeMs: 125000, currentLap: 3, t: 1.0 },
      { driverName: 'Opponent 2', color: '#f59e0b', isFinished: true, finishTimeMs: 130000, currentLap: 3, t: 1.0 },
    ],
    resetToGrids: vi.fn(),
  } as unknown as OpponentManager;

  const mockLapTimer = {
    totalLaps: 3,
    totalTimeMs: 122000, // 2:02.000 (1위 플레이어)
    start: vi.fn(),
    reset: vi.fn(),
  } as unknown as LapTimer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMode = 'DRIVING';

    const deps: RaceLifecycleDependencies = {
      getCircuit: () => mockCircuit,
      getPlayerVehicle: () => mockPlayerVehicle,
      getOpponentManager: () => mockOpponentManager,
      getSkidMarkManager: () => ({ reset: vi.fn() } as any),
      getCollisionManager: () => ({ reset: vi.fn() } as any),
      getStandingsManager: () => ({ reset: vi.fn() } as any),
      getLapTimer: () => mockLapTimer,
      getRecorder: () => ({ clear: vi.fn(), start: vi.fn(), stop: vi.fn(), getTicks: () => [] } as any),
      getReplayPlayer: () => ({ pause: vi.fn(), play: vi.fn() } as any),
      getAudio: () => mockAudio,
      getCameraController: () => ({ camera: new THREE.PerspectiveCamera(), snapFinishCutscene: vi.fn() } as any),
      getStartCutsceneController: () => ({ setup: vi.fn(), skip: vi.fn() } as any),
      getEnvironmentManager: () => ({ setEnvironment: vi.fn() } as any),
      clearSpeedFX: vi.fn(),
      getMode: () => mockMode,
      setMode: (m) => { mockMode = m; },
    };

    lifecycle = new RaceLifecycleManager(deps);
  });

  it('startCountdown() 호출 시 COUNTDOWN 상태로 전환되고 신호등이 리셋되어야 한다', () => {
    lifecycle.startCountdown();
    expect(lifecycle.raceState).toBe('COUNTDOWN');
    expect(lifecycle.countdownTimer).toBe(3.0);
    expect(mockCircuit.setGantryLights).toHaveBeenCalledWith(0);
  });

  it('updateCountdown() 경과에 따라 3구 라이트 및 비프 사운드가 순차적으로 트리거되어야 한다', () => {
    lifecycle.startCountdown();

    // 1초 경과 (3초 남음 -> 2.5초): 3비프 및 1구 점등
    lifecycle.updateCountdown(0.5);
    expect(mockAudio.playCountdownBeep).toHaveBeenCalledWith(false);
    expect(mockCircuit.setGantryLights).toHaveBeenCalledWith(1, false);

    // 1초 추가 경과 (1.5초 남음): 2구 점등
    lifecycle.updateCountdown(1.0);
    expect(mockCircuit.setGantryLights).toHaveBeenCalledWith(2, false);

    // 카운트다운 완료 (0초 이하): 녹색 전등, RUNNING 상태 진입, 랩타이머 시작
    lifecycle.updateCountdown(1.6);
    expect(lifecycle.raceState).toBe('RUNNING');
    expect(mockAudio.playCountdownBeep).toHaveBeenCalledWith(true);
    expect(mockCircuit.setGantryLights).toHaveBeenCalledWith(3, true);
    expect(mockLapTimer.start).toHaveBeenCalled();
  });

  it('computeRaceResults()가 전체 완주 시간 순으로 1위부터 순위를 올바르게 정렬해야 한다', () => {
    lifecycle.currentDriverName = 'Apex Master';
    const results = lifecycle.computeRaceResults();

    expect(results.length).toBe(3);
    // 1위: 플레이어 (122,000ms = 02:02.000)
    expect(results[0].rank).toBe(1);
    expect(results[0].isPlayer).toBe(true);
    expect(results[0].driverName).toBe('Apex Master');
    expect(results[0].timeFormatted).toBe('02:02.000');

    // 2위: Opponent 1 (125,000ms = 02:05.000)
    expect(results[1].rank).toBe(2);
    expect(results[1].driverName).toBe('Opponent 1');

    // 3위: Opponent 2 (130,000ms = 02:10.000)
    expect(results[2].rank).toBe(3);
    expect(results[2].driverName).toBe('Opponent 2');
  });

  it('formatTime()이 밀리초를 MM:SS.mmm 형식으로 정확하게 변환해야 한다', () => {
    expect(lifecycle.formatTime(0)).toBe('00:00.000');
    expect(lifecycle.formatTime(15420)).toBe('00:15.420');
    expect(lifecycle.formatTime(83456)).toBe('01:23.456');
    expect(lifecycle.formatTime(125000)).toBe('02:05.000');
  });
});
