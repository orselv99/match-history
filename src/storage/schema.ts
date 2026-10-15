/**
 * Apex Racing 브라우저 영구 데이터베이스 스키마 및 인터페이스 정의
 * - Database: 'ApexRacingDB'
 * - Store 1: 'audio_cache' (BGM 스트림 바이너리 영구 캐시)
 * - Store 2: 'replay_cache' (매치 리플레이 압축 바이너리 영구 캐시)
 */

export const DB_NAME = 'ApexRacingDB';
export const DB_VERSION = 2; // 스키마 인덱스(by_category) 및 메타데이터 필드 추가

export const STORES = {
  AUDIO: 'audio_cache',
  REPLAY: 'replay_cache',
} as const;

export type AudioCategory = 'lobby' | 'ingame';

/**
 * 에셋 URL 경로를 정규화하여 중복 키나 상대경로 불일치 방지
 * 예: './audio/bgm/...' -> '/audio/bgm/...'
 */
export function normalizeAudioUrl(url: string): string {
  if (!url) return '';
  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return new URL(url).pathname;
    }
  } catch {}
  if (url.startsWith('./')) {
    return '/' + url.slice(2);
  }
  if (!url.startsWith('/')) {
    return '/' + url;
  }
  return url;
}

/**
 * IndexedDB에 영구 보관되는 오디오 에셋 레코드
 */
export interface CachedAudioRecord {
  url: string;                     // Primary Key (예: 'audio/bgm/lobby/silk-drive.ogg')
  trackId: string;                 // 고유 트랙 식별자 (예: 'silk_drive', 'velvet_drive', 'apex_velocity')
  category: AudioCategory;         // 오디오 분류 ('lobby' | 'ingame')
  title: string;                   // 트랙 타이틀 (예: 'Silk Drive', 'Velvet Drive', 'Apex Velocity')
  blob: Blob;                      // 오디오 원본 바이너리 블롭
  sizeBytes: number;               // 파일 크기(bytes)
  cachedAt: number;                // 캐시 저장 타임스탬프 (ms)
}

import type { RawReplayTick, MatchSummaryMetadata } from '../replay/ReplayTypes.ts';

/**
 * IndexedDB에 영구 보관되는 매치 리플레이 레코드 (최대 30개 보관)
 */
export interface CachedReplayRecord {
  matchCode: string;               // Primary Key (예: 'RACE-ABCD')
  ticks: RawReplayTick[];          // 3D 리플레이 틱 데이터 (플레이어 + 라이벌 3대 동시 기록)
  metadata: MatchSummaryMetadata;  // 매치 서머리 메타데이터 (드라이버, 트랙, 랩타임, 순위 등)
  createdAt: string;               // 레이스 완주 ISO 시각
  savedAt: number;                 // 로컬 저장 타임스탬프 (ms)
  binary?: ArrayBuffer;            // (옵션) 압축 바이너리
}

/**
 * 브라우저 저장소 통계 정보
 */
export interface StorageStats {
  audioCount: number;
  audioBytes: number;
  lobbyAudioCount: number;
  inGameAudioCount: number;
  replayCount: number;
  replayBytes: number;
  isPersistent: boolean;
  quotaBytes?: number;
  usageBytes?: number;
}

/**
 * IndexedDB 버전 변경 및 마이그레이션 핸들러
 */
export function upgradeDatabaseSchema(
  db: IDBDatabase,
  oldVersion: number,
  _newVersion: number | null,
  transaction: IDBTransaction | null
): void {
  // 1. 오디오 에셋 저장소 (STORE_AUDIO)
  let audioStore: IDBObjectStore;
  if (!db.objectStoreNames.contains(STORES.AUDIO)) {
    audioStore = db.createObjectStore(STORES.AUDIO, { keyPath: 'url' });
  } else if (transaction) {
    audioStore = transaction.objectStore(STORES.AUDIO);
  } else {
    return;
  }

  if (!audioStore.indexNames.contains('by_cachedAt')) {
    audioStore.createIndex('by_cachedAt', 'cachedAt', { unique: false });
  }
  if (!audioStore.indexNames.contains('by_trackId')) {
    audioStore.createIndex('by_trackId', 'trackId', { unique: false });
  }
  if (!audioStore.indexNames.contains('by_category')) {
    audioStore.createIndex('by_category', 'category', { unique: false });
  }

  // 2. 리플레이 바이너리 저장소 (STORE_REPLAY)
  let replayStore: IDBObjectStore;
  if (!db.objectStoreNames.contains(STORES.REPLAY)) {
    replayStore = db.createObjectStore(STORES.REPLAY, { keyPath: 'matchCode' });
  } else if (transaction) {
    replayStore = transaction.objectStore(STORES.REPLAY);
  } else {
    return;
  }

  if (!replayStore.indexNames.contains('by_createdAt')) {
    replayStore.createIndex('by_createdAt', 'createdAt', { unique: false });
  }
  if (!replayStore.indexNames.contains('by_savedAt')) {
    replayStore.createIndex('by_savedAt', 'savedAt', { unique: false });
  }
}
