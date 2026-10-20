import type { LeaderboardRacerEntry } from '../types/game.ts';
import type { Circuit } from '../game/Circuit.ts';

export interface RacerProgressCandidate {
  id: string;
  driverName: string;
  isPlayer: boolean;
  color: string;
  prog: number;
}

/**
 * 실시간 주행 순위 및 경합 안정화 매니저 (Standings Manager)
 * - 경합(BATTLE) 시 잦은 순위 반전 떨림을 방지하기 위한 히스테리시스 & 홀드 메커니즘 전담:
 *   1) 추월 인정 최소 마진: 2.0m 이상 앞서야 추월 대기 카운트 시작
 *   2) 추월 지속 시간: 2.0m 이상 앞선 상태가 최소 0.5초 지속되어야 공식 셔플
 *   3) 스왑 쿨다운: 순위 교체 후 동일 페어 간 1.0초 쿨다운 적용
 *   4) 대형 격차(10m 이상 앞섬): 스핀아웃/대형 충돌 시 지연 없이 즉시 반영
 */
export class StandingsManager {
  private stableStandings: LeaderboardRacerEntry[] = [];
  private overtakePendingTimers: Map<string, number> = new Map();
  private swapCooldownTimers: Map<string, number> = new Map();

  public reset(): void {
    this.stableStandings = [];
    this.overtakePendingTimers.clear();
    this.swapCooldownTimers.clear();
  }

  public update(candidates: RacerProgressCandidate[], circuit: Circuit, delta: number): LeaderboardRacerEntry[] {
    if (candidates.length === 0) {
      return [];
    }

    // 1. 초기 상태이거나 엔트리 목록(ID 세트)이 변경된 경우 생 진행도 기준으로 초기화
    const rawIds = candidates.map(r => r.id).sort().join(',');
    const stableIds = this.stableStandings.map(s => s.id).sort().join(',');

    if (rawIds !== stableIds || this.stableStandings.length === 0) {
      const initialSorted = [...candidates].sort((a, b) => b.prog - a.prog);
      this.stableStandings = initialSorted.map((item, idx) => ({
        id: item.id,
        rank: idx + 1,
        driverName: item.driverName,
        isPlayer: item.isPlayer,
        color: item.color,
      }));
      this.overtakePendingTimers.clear();
      this.swapCooldownTimers.clear();
      return this.stableStandings;
    }

    // 2. 쿨다운 타이머 차감
    for (const [key, cd] of this.swapCooldownTimers.entries()) {
      const nextCd = cd - delta;
      if (nextCd <= 0) {
        this.swapCooldownTimers.delete(key);
      } else {
        this.swapCooldownTimers.set(key, nextCd);
      }
    }

    // 3. 서킷 길이 기반 추월 인정 마진 계산
    const trackLen = circuit?.circuitCurve ? circuit.circuitCurve.getLength() : 1200;
    const leadMarginProg = 2.0 / Math.max(100, trackLen); // 약 2.0m 마진
    const hugeMarginProg = 10.0 / Math.max(100, trackLen); // 약 10.0m 대형 마진

    const rawMap = new Map<string, RacerProgressCandidate>();
    for (const r of candidates) rawMap.set(r.id, r);

    // 4. 순위 버블 평가 (히스테리시스 + 지속 시간 + 쿨다운 검증)
    let changed = true;
    let passes = 0;
    while (changed && passes < this.stableStandings.length) {
      changed = false;
      passes++;
      for (let i = 0; i < this.stableStandings.length - 1; i++) {
        const leader = this.stableStandings[i];
        const chaser = this.stableStandings[i + 1];

        const leaderRaw = rawMap.get(leader.id);
        const chaserRaw = rawMap.get(chaser.id);
        if (!leaderRaw || !chaserRaw) continue;

        const progDiff = chaserRaw.prog - leaderRaw.prog;
        const pairKey = [leader.id, chaser.id].sort().join('<->');
        const overtakeKey = `${chaser.id}->${leader.id}`;

        // 4-1. 대형 마진(10m 이상 앞섬): 스핀아웃/대형 충돌 시 지연 없이 즉시 역전 반영
        if (progDiff > hugeMarginProg) {
          this.stableStandings[i] = chaser;
          this.stableStandings[i + 1] = leader;
          this.overtakePendingTimers.delete(overtakeKey);
          this.swapCooldownTimers.set(pairKey, 1.0);
          changed = true;
          continue;
        }

        // 4-2. 쿨다운 검사
        const inCooldown = this.swapCooldownTimers.has(pairKey);

        // 4-3. 2m 이상 앞섬 && 쿨다운 완료: 지속 시간 누적
        if (progDiff > leadMarginProg && !inCooldown) {
          const currentPending = (this.overtakePendingTimers.get(overtakeKey) || 0) + delta;
          this.overtakePendingTimers.set(overtakeKey, currentPending);

          // 0.5초 이상 유지 시에만 공식 순위 교체(셔플) 인정!
          if (currentPending >= 0.5) {
            this.stableStandings[i] = chaser;
            this.stableStandings[i + 1] = leader;
            this.overtakePendingTimers.delete(overtakeKey);
            this.swapCooldownTimers.set(pairKey, 1.0);
            changed = true;
          }
        } else {
          // 2m 이내 경합 중이거나 뒤처진 경우: 대기 시간 리셋
          this.overtakePendingTimers.delete(overtakeKey);
        }
      }
    }

    // 5. 최종 순위(1~N) 부여 및 최신 메타데이터 갱신
    this.stableStandings = this.stableStandings.map((entry, idx) => {
      const raw = rawMap.get(entry.id);
      return {
        id: entry.id,
        rank: idx + 1,
        driverName: raw ? raw.driverName : entry.driverName,
        isPlayer: raw ? raw.isPlayer : entry.isPlayer,
        color: raw ? raw.color : entry.color,
      };
    });

    return this.stableStandings;
  }

  public getCurrentStandings(): LeaderboardRacerEntry[] {
    return this.stableStandings;
  }

  public getCurrentRank(): { rank: number; total: number } {
    const p = this.stableStandings.find(s => s.isPlayer);
    return { rank: p ? p.rank : 1, total: this.stableStandings.length || 4 };
  }
}
