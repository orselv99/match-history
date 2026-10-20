import { appDB } from './AppDatabase.ts';
import type { CachedReplayRecord } from './schema.ts';

const SEED_VERSION_KEY = 'apex_racing_seeded_v11_30hz_demo_synced';

/**
 * 리포지토리 정적 시드 리플레이(/data/seed-replays.json, 50개 * 3랩)를 로컬 IndexedDB에 안전하게 초기화
 * - 실제 주행 물리 속도(속도계 = 3D 트랙 실제 이동 속도)와 100% 일치하는 리얼타임 데이터로 자동 갱신
 * - 3랩 미만 구버전 데이터 및 기존 저속 시드 데이터 자동 정리
 * - 3랩 풀 데이터 50개 단일 트랜잭션 초고속 일괄 시딩
 */
export async function initSeedReplays(force: boolean = false): Promise<void> {
  try {
    const isSeeded = localStorage.getItem(SEED_VERSION_KEY);

    // 1. 기존 IndexedDB에서 저속 구버전 SEED 리플레이 및 3랩 미만 리플레이 탐색 및 영구 삭제 정리
    const existingReplays = await appDB.listReplays();
    for (const r of existingReplays) {
      const isOldSeed = r.matchCode.startsWith('SEED-') && isSeeded !== 'true';
      const lastTick = r.ticks?.[r.ticks.length - 1];
      const isLessThan3Laps = (r.metadata?.totalLaps || 1) < 3 || (lastTick?.lap || 1) < 3;
      if (isOldSeed || isLessThan3Laps) {
        await appDB.deleteReplay(r.matchCode);
      }
    }

    // 이미 v6 물리 동기화 시딩이 완료되었고 데이터가 충분하면 조기 반환 (force가 아닐 때)
    if (!force && isSeeded === 'true') {
      const currentReplays = await appDB.listReplays();
      if (currentReplays.length >= 40) {
        return;
      }
    }

    // 2. 최신 물리 동기화 50개 3랩 시드 데이터 로드
    const response = await fetch('./data/seed-replays.json');
    if (!response.ok) {
      console.warn('[SeedService] Failed to fetch seed replays:', response.status);
      return;
    }

    const seedRecords = (await response.json()) as CachedReplayRecord[];
    if (Array.isArray(seedRecords) && seedRecords.length > 0) {
      const validSeeds = seedRecords.filter(rec => rec.matchCode && rec.ticks && rec.metadata);
      await appDB.saveReplaysBulk(validSeeds);
      localStorage.setItem(SEED_VERSION_KEY, 'true');
      console.log(`[SeedService] Initialized ${validSeeds.length} 3-lap default replays into IndexedDB.`);
    }
  } catch (err) {
    console.warn('[SeedService] Seed initialization error:', err);
  }
}
