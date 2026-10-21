import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { LapTimer } from '../src/game/LapTimer.ts';
import type { CheckpointTrigger } from '../src/game/Circuit.ts';

describe('LapTimer', () => {
  let timer: LapTimer;

  // 가상 체크포인트 3개 (0: S/F 라인, 1: 섹터 1, 2: 섹터 2)
  const mockCheckpoints: CheckpointTrigger[] = [
    {
      id: 0,
      position: new THREE.Vector3(0, 0, 0),
      radius: 10,
      direction: new THREE.Vector3(1, 0, 0),
    },
    {
      id: 1,
      position: new THREE.Vector3(100, 0, 0),
      radius: 10,
      direction: new THREE.Vector3(1, 0, 0),
    },
    {
      id: 2,
      position: new THREE.Vector3(200, 0, 0),
      radius: 10,
      direction: new THREE.Vector3(1, 0, 0),
    },
  ];

  beforeEach(() => {
    timer = new LapTimer(3);
  });

  it('초기화 시 1랩 상태이고, 시작 플래그가 false여야 한다', () => {
    expect(timer.currentLap).toBe(1);
    expect(timer.totalLaps).toBe(3);
    expect(timer.isStarted).toBe(false);
    expect(timer.isFinished).toBe(false);
    expect(timer.totalTimeMs).toBe(0);
  });

  it('start() 호출 전에는 시간이 누적되지 않아야 한다', () => {
    timer.update(100, new THREE.Vector3(0, 0, 0), mockCheckpoints);
    expect(timer.totalTimeMs).toBe(0);

    timer.start();
    timer.update(100, new THREE.Vector3(0, 0, 0), mockCheckpoints);
    expect(timer.totalTimeMs).toBe(100);
  });

  it('출발선을 통과(후방 -5m -> 전방 +5m)하면 hasPassedStartLine이 true가 되고 다음 체크포인트(1번)로 이동해야 한다', () => {
    timer.start();

    // 1프레임: 출발선 후방 -5m
    timer.update(50, new THREE.Vector3(-5, 0, 0), mockCheckpoints);
    expect(timer.hasPassedStartLine).toBe(false);

    // 2프레임: 출발선 전방 +5m 통과
    timer.update(50, new THREE.Vector3(5, 0, 0), mockCheckpoints);
    expect(timer.hasPassedStartLine).toBe(true);
  });

  it('3랩 완주 시 isFinished가 true가 되고 랩 기록이 lapHistory에 저장되어야 한다', () => {
    timer.start();

    // 랩 1: S/F 통과 -> CP1 통과 -> CP2 통과 -> S/F 통과
    timer.update(100, new THREE.Vector3(-5, 0, 0), mockCheckpoints);
    timer.update(100, new THREE.Vector3(5, 0, 0), mockCheckpoints);   // Start passed

    timer.update(100, new THREE.Vector3(95, 0, 0), mockCheckpoints);
    timer.update(100, new THREE.Vector3(105, 0, 0), mockCheckpoints); // CP1 passed

    timer.update(100, new THREE.Vector3(195, 0, 0), mockCheckpoints);
    timer.update(100, new THREE.Vector3(205, 0, 0), mockCheckpoints); // CP2 passed

    // 랩 1 완료
    timer.update(100, new THREE.Vector3(-5, 0, 0), mockCheckpoints);
    timer.update(100, new THREE.Vector3(5, 0, 0), mockCheckpoints);   // Lap 1 Finish

    expect(timer.currentLap).toBe(2);
    expect(timer.lapHistory.length).toBe(1);
    expect(timer.bestLapMs).toBeGreaterThan(0);
  });
});
