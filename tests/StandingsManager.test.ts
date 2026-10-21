import { describe, it, expect, beforeEach } from 'vitest';
import { StandingsManager, type RacerProgressCandidate } from '../src/core/StandingsManager.ts';
import type { Circuit } from '../src/game/Circuit.ts';

describe('StandingsManager', () => {
  let manager: StandingsManager;
  const mockCircuit = {
    circuitCurve: {
      getLength: () => 1000, // 1000m 트랙
    },
  } as unknown as Circuit;

  beforeEach(() => {
    manager = new StandingsManager();
  });

  it('초기 주행 후보자 목록을 진행도(prog) 내림차순으로 정렬하여 1위부터 순위를 부여해야 한다', () => {
    const candidates: RacerProgressCandidate[] = [
      { id: 'p2', driverName: 'Driver B', isPlayer: false, color: '#f59e0b', prog: 0.5 },
      { id: 'p1', driverName: 'Driver A', isPlayer: true, color: '#ef4444', prog: 0.8 },
      { id: 'p3', driverName: 'Driver C', isPlayer: false, color: '#38bdf8', prog: 0.2 },
    ];

    const result = manager.update(candidates, mockCircuit, 0.016);
    expect(result.length).toBe(3);
    expect(result[0].id).toBe('p1');
    expect(result[0].rank).toBe(1);
    expect(result[1].id).toBe('p2');
    expect(result[1].rank).toBe(2);
    expect(result[2].id).toBe('p3');
    expect(result[2].rank).toBe(3);
  });

  it('10m 이상의 대형 격차 발생 시(스핀아웃/대형 충돌) 지연 없이 즉시 역전되어야 한다', () => {
    // 1000m 트랙에서 10m = 0.01 prog
    const initCandidates: RacerProgressCandidate[] = [
      { id: 'p1', driverName: 'Driver A', isPlayer: true, color: '#ef4444', prog: 0.50 },
      { id: 'p2', driverName: 'Driver B', isPlayer: false, color: '#f59e0b', prog: 0.40 },
    ];
    manager.update(initCandidates, mockCircuit, 0.016);

    // p2가 p1을 0.015(15m) 앞서서 역전
    const overtakeCandidates: RacerProgressCandidate[] = [
      { id: 'p1', driverName: 'Driver A', isPlayer: true, color: '#ef4444', prog: 0.50 },
      { id: 'p2', driverName: 'Driver B', isPlayer: false, color: '#f59e0b', prog: 0.515 },
    ];

    const updated = manager.update(overtakeCandidates, mockCircuit, 0.016);
    expect(updated[0].id).toBe('p2');
    expect(updated[0].rank).toBe(1);
    expect(updated[1].id).toBe('p1');
    expect(updated[1].rank).toBe(2);
  });

  it('2m 미만의 미세한 격차는 떨림 방지(히스테리시스)를 위해 순위가 바뀌지 않아야 한다', () => {
    // 1000m 트랙에서 1m = 0.001 prog (2m = 0.002 미만)
    const initCandidates: RacerProgressCandidate[] = [
      { id: 'p1', driverName: 'Driver A', isPlayer: true, color: '#ef4444', prog: 0.50 },
      { id: 'p2', driverName: 'Driver B', isPlayer: false, color: '#f59e0b', prog: 0.49 },
    ];
    manager.update(initCandidates, mockCircuit, 0.016);

    // p2가 0.001(1m) 앞서도 순위는 유지
    const microOvertake: RacerProgressCandidate[] = [
      { id: 'p1', driverName: 'Driver A', isPlayer: true, color: '#ef4444', prog: 0.50 },
      { id: 'p2', driverName: 'Driver B', isPlayer: false, color: '#f59e0b', prog: 0.501 },
    ];

    const result = manager.update(microOvertake, mockCircuit, 0.1);
    expect(result[0].id).toBe('p1');
    expect(result[1].id).toBe('p2');
  });

  it('2m 이상 추월 상태가 0.5초 이상 지속되어야 공식 순위가 갱신되어야 한다', () => {
    // 1000m 트랙에서 3m = 0.003 prog (> 2m)
    const initCandidates: RacerProgressCandidate[] = [
      { id: 'p1', driverName: 'Driver A', isPlayer: true, color: '#ef4444', prog: 0.50 },
      { id: 'p2', driverName: 'Driver B', isPlayer: false, color: '#f59e0b', prog: 0.49 },
    ];
    manager.update(initCandidates, mockCircuit, 0.016);

    const overtakeCandidates: RacerProgressCandidate[] = [
      { id: 'p1', driverName: 'Driver A', isPlayer: true, color: '#ef4444', prog: 0.50 },
      { id: 'p2', driverName: 'Driver B', isPlayer: false, color: '#f59e0b', prog: 0.503 },
    ];

    // 0.3초 경과 시점: 아직 역전되지 않음
    let result = manager.update(overtakeCandidates, mockCircuit, 0.3);
    expect(result[0].id).toBe('p1');

    // 추가 0.25초 경과 (누적 0.55초 > 0.5초): 공식 역전 인정
    result = manager.update(overtakeCandidates, mockCircuit, 0.25);
    expect(result[0].id).toBe('p2');
    expect(result[1].id).toBe('p1');
  });
});
