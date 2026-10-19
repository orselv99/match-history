import { appDB } from './AppDatabase.ts';
import type { CachedReplayRecord } from './schema.ts';

const SEED_VERSION_KEY = 'apex_racing_seeded_v1';

/**
 * 리포지토리 정적 시드 리플레이(/data/seed-replays.json)를 로컬 IndexedDB에 안전하게 1회 초기화
 * - 페이지 초기화/새로고침 시 사용자 데이터 소실 방지
 * - 이미 초기화되었거나 기존 주행 데이터가 존재하는 경우 절대 덮어쓰거나 재주입하지 않음
 */
export async function initSeedReplays(): Promise<void> {
  try {
    const isSeeded = localStorage.getItem(SEED_VERSION_KEY);
    const existingReplays = await appDB.listReplays();

    // 이미 시딩 플래그가 있거나, 기존에 저장된 리플레이가 있다면 머지/재주입 건너뜀 (사용자 기록 보호)
    if (isSeeded === 'true' || existingReplays.length > 0) {
      if (isSeeded !== 'true') {
        localStorage.setItem(SEED_VERSION_KEY, 'true');
      }
      return;
    }

    // IndexedDB가 완전히 비어있는 최초 1회만 정적 시드 데이터 로드
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
