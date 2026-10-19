import { appDB } from './AppDatabase.ts';
import type { CachedReplayRecord } from './schema.ts';

const SEED_VERSION_KEY = 'apex_racing_seeded_v4_3laps';

/**
 * 리포지토리 정적 시드 리플레이(/data/seed-replays.json, 50개 * 3랩)를 로컬 IndexedDB에 안전하게 초기화
 * - 3랩 미만인 구버전 리플레이 데이터 자동 정리 (사용자 요청: 3랩이 표시되지 않는 데이터 제거)
 * - 3랩 풀 데이터 50개 자동 시딩
 */
export async function initSeedReplays(): Promise<void> {
  try {
    const isSeeded = localStorage.getItem(SEED_VERSION_KEY);

    // 1. 기존 IndexedDB에서 3랩 미만인 구버전 리플레이 탐색 및 영구 삭제 정리
    const existingReplays = await appDB.listReplays();
    for (const r of existingReplays) {
      const lastTick = r.ticks?.[r.ticks.length - 1];
      const isLessThan3Laps = (r.metadata?.totalLaps || 1) < 3 || (lastTick?.lap || 1) < 3 || (lastTick?.timeMs || 0) < 130000;
      if (isLessThan3Laps) {
        await appDB.deleteReplay(r.matchCode);
      }
    }

    // 이미 v4 3랩 시딩이 완료되었고 데이터가 충분하면 조기 반환
    if (isSeeded === 'true') {
      const currentReplays = await appDB.listReplays();
      if (currentReplays.length >= 40) {
        return;
      }
    }

    // 2. 최신 50개 3랩 시드 데이터 로드
    const response = await fetch('./data/seed-replays.json');
    if (!response.ok) {
      console.warn('[SeedService] Failed to fetch seed replays:', response.status);
      return;
    }

    const seedRecords = (await response.json()) as CachedReplayRecord[];
    if (Array.isArray(seedRecords) && seedRecords.length > 0) {
      for (const rec of seedRecords) {
        if (rec.matchCode && rec.ticks && rec.metadata) {
          await appDB.saveReplay(rec.matchCode, rec.ticks, rec.metadata);
        }
      }
      localStorage.setItem(SEED_VERSION_KEY, 'true');
      console.log(`[SeedService] Initialized ${seedRecords.length} 3-lap default replays into IndexedDB.`);
    }
  } catch (err) {
    console.warn('[SeedService] Seed initialization error:', err);
  }
}
