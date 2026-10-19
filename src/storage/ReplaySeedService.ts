import { appDB } from './AppDatabase.ts';
import type { CachedReplayRecord } from './schema.ts';

const SEED_VERSION_KEY = 'apex_racing_seeded_v2';

/**
 * 리포지토리 정적 시드 리플레이(/data/seed-replays.json, 50개)를 로컬 IndexedDB에 안전하게 1회 초기화
 * - 페이지 초기화/새로고침 시 사용자 데이터 소실 방지
 * - 사용자가 직접 플레이한 데이터가 있는 경우 절대 덮어쓰거나 재주입하지 않음
 */
export async function initSeedReplays(): Promise<void> {
  try {
    const isSeeded = localStorage.getItem(SEED_VERSION_KEY);
    const existingReplays = await appDB.listReplays();

    const hasUserPlayedGames = existingReplays.some(r => !r.matchCode.startsWith('SEED-'));

    // 이미 v2 시딩 완료되었거나, 사용자가 직접 플레이한 게임이 존재하면 머지/재주입 건너뜀 (사용자 기록 철저 보호)
    if (isSeeded === 'true' || (hasUserPlayedGames && existingReplays.length >= 50)) {
      if (isSeeded !== 'true') {
        localStorage.setItem(SEED_VERSION_KEY, 'true');
      }
      return;
    }

    // 신규 접속이거나 이전 구버전 시드(8개 이하)만 있는 경우 50개 시드 데이터 주입
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
      console.log(`[SeedService] Initialized ${seedRecords.length} default replays into IndexedDB.`);
    }
  } catch (err) {
    console.warn('[SeedService] Seed initialization error:', err);
  }
}
