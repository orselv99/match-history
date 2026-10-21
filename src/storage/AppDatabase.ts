/**
 * Apex Racing 브라우저 영구 데이터베이스 매니저 (IndexedDB)
 * - schema.ts에 정의된 데이터베이스 스키마 및 마이그레이션 규칙 기반 동작
 * - 1. 오디오 에셋 캐시 ('audio_cache'): BGM 스트림 바이너리 영구 보관 (오프라인 즉시 재생)
 * - 2. 매치 리플레이 캐시 ('replay_cache'): 경기 리플레이 3D 틱 및 압축 바이너리 로컬 영구 보관 (최대 30개 FIFO)
 * - 브라우저 Storage Persistence API 연동으로 디스크 정리 시 영구 보존
 */

import {
  DB_NAME,
  DB_VERSION,
  STORES,
  AudioCategory,
  CachedAudioRecord,
  CachedReplayRecord,
  StorageStats,
  upgradeDatabaseSchema,
  normalizeAudioUrl,
} from './schema.ts';
import type { RawReplayTick, MatchSummaryMetadata } from '../replay/ReplayTypes.ts';

// 외부 호환성을 위해 타입 re-export
export type { AudioCategory, CachedAudioRecord, CachedReplayRecord, StorageStats };

export class AppDatabase {
  private static instance: AppDatabase | null = null;
  private db: IDBDatabase | null = null;
  private isConnecting: Promise<IDBDatabase> | null = null;
  private blobUrlMap: Map<string, string> = new Map();

  private constructor() {}

  public static getInstance(): AppDatabase {
    if (!AppDatabase.instance) {
      AppDatabase.instance = new AppDatabase();
    }
    return AppDatabase.instance;
  }

  /**
   * IndexedDB 연결 초기화 및 schema.ts 마이그레이션 실행
   */
  public async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.isConnecting) return this.isConnecting;

    this.isConnecting = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB is not supported in this environment.'));
        return;
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        upgradeDatabaseSchema(db, event.oldVersion, event.newVersion, request.transaction);
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.isConnecting = null;
        resolve(this.db);
      };

      request.onerror = () => {
        this.isConnecting = null;
        reject(request.error || new Error('Failed to open IndexedDB.'));
      };
    });

    return this.isConnecting;
  }

  /**
   * 브라우저 디스크 영구 보존(Persistent Storage) 권한 요청
   */
  public async requestPersistence(): Promise<boolean> {
    try {
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
        const isPersisted = await navigator.storage.persist();
        return isPersisted;
      }
    } catch (e) {
      console.warn('[AppDatabase] Failed to request persistent storage:', e);
    }
    return false;
  }

  /**
   * 현재 영구 보존 상태 확인
   */
  public async isPersisted(): Promise<boolean> {
    try {
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persisted) {
        return await navigator.storage.persisted();
      }
    } catch (e) {
      // Ignore
    }
    return false;
  }

  /* =====================================================================
     1. 배경음악(BGM) 오디오 캐시 API
     ===================================================================== */

  /**
   * 해당 오디오 URL이 이미 로컬 DB에 존재하는지 확인
   */
  public async hasAudio(url: string): Promise<boolean> {
    try {
      const db = await this.getDB();
      const cleanUrl = normalizeAudioUrl(url);
      return new Promise<boolean>((resolve) => {
        const tx = db.transaction(STORES.AUDIO, 'readonly');
        const store = tx.objectStore(STORES.AUDIO);
        const req = store.getKey(cleanUrl);
        req.onsuccess = () => resolve(req.result !== undefined);
        req.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  }

  /**
   * 로컬 DB에서 오디오 Blob 및 메타데이터 조회
   */
  public async getAudio(url: string): Promise<CachedAudioRecord | null> {
    try {
      const db = await this.getDB();
      const cleanUrl = normalizeAudioUrl(url);
      return new Promise<CachedAudioRecord | null>((resolve) => {
        const tx = db.transaction(STORES.AUDIO, 'readonly');
        const store = tx.objectStore(STORES.AUDIO);
        const req = store.get(cleanUrl);
        req.onsuccess = () => resolve((req.result as CachedAudioRecord) || null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * 오디오 Blob을 카테고리(lobby/ingame) 및 trackId, title과 함께 로컬 DB에 영구 저장
   */
  public async saveAudio(
    url: string,
    blob: Blob,
    trackId: string,
    category: AudioCategory = 'lobby',
    title: string = ''
  ): Promise<void> {
    try {
      const db = await this.getDB();
      const cleanUrl = normalizeAudioUrl(url);
      const record: CachedAudioRecord = {
        url: cleanUrl,
        trackId: trackId || 'unknown_track',
        category,
        title: title || trackId,
        blob,
        sizeBytes: blob.size,
        cachedAt: Date.now(),
      };

      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORES.AUDIO, 'readwrite');
        const store = tx.objectStore(STORES.AUDIO);
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('[AppDatabase] Failed to save audio to IndexedDB:', e);
    }
  }

  /**
   * 카테고리별(lobby 또는 ingame) 저장된 오디오 목록 조회
   */
  public async getAudioByCategory(category: AudioCategory): Promise<CachedAudioRecord[]> {
    try {
      const db = await this.getDB();
      return new Promise<CachedAudioRecord[]>((resolve) => {
        const tx = db.transaction(STORES.AUDIO, 'readonly');
        const store = tx.objectStore(STORES.AUDIO);
        const index = store.index('by_category');
        const req = index.getAll(category);
        req.onsuccess = () => resolve((req.result as CachedAudioRecord[]) || []);
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  /**
   * 로컬 오디오 Blob의 ObjectURL 반환 (메모리 재사용 및 0ms 즉각 재생)
   */
  public async getAudioBlobUrl(url: string): Promise<string | null> {
    const cleanUrl = normalizeAudioUrl(url);
    if (this.blobUrlMap.has(cleanUrl)) {
      return this.blobUrlMap.get(cleanUrl)!;
    }

    const record = await this.getAudio(cleanUrl);
    if (!record || !record.blob) return null;

    const objectUrl = URL.createObjectURL(record.blob);
    this.blobUrlMap.set(cleanUrl, objectUrl);
    return objectUrl;
  }

  /**
   * 로컬 오디오 캐시 전체 삭제
   */
  public async clearAudioCache(): Promise<void> {
    try {
      // 생성된 모든 Blob URL 해제
      this.blobUrlMap.forEach((blobUrl) => {
        try {
          URL.revokeObjectURL(blobUrl);
        } catch {}
      });
      this.blobUrlMap.clear();

      const db = await this.getDB();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORES.AUDIO, 'readwrite');
        const store = tx.objectStore(STORES.AUDIO);
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('[AppDatabase] Failed to clear audio cache:', e);
    }
  }

  /**
   * 경기 리플레이 캐시 전체 삭제
   */
  public async clearReplayCache(): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORES.REPLAY, 'readwrite');
        const store = tx.objectStore(STORES.REPLAY);
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('[AppDatabase] Failed to clear replay cache:', e);
    }
  }

  /* =====================================================================
     2. 매치 리플레이(Replay) 바이너리 캐시 API (차후 리플레이 기능 완벽 준비)
     ===================================================================== */

  /**
   * 특정 매치 리플레이가 로컬 DB에 존재하는지 확인
   */
  public async hasReplay(matchCode: string): Promise<boolean> {
    try {
      const db = await this.getDB();
      return new Promise<boolean>((resolve) => {
        const tx = db.transaction(STORES.REPLAY, 'readonly');
        const store = tx.objectStore(STORES.REPLAY);
        const req = store.getKey(matchCode);
        req.onsuccess = () => resolve(req.result !== undefined);
        req.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  }

  /**
   * 로컬 DB에서 리플레이 바이너리 및 메타데이터 추출 (Cache Hit 시 1~5ms 반환)
   */
  public async getReplay(matchCode: string): Promise<CachedReplayRecord | null> {
    try {
      const db = await this.getDB();
      return new Promise<CachedReplayRecord | null>((resolve) => {
        const tx = db.transaction(STORES.REPLAY, 'readonly');
        const store = tx.objectStore(STORES.REPLAY);
        const req = store.get(matchCode);
        req.onsuccess = () => resolve((req.result as CachedReplayRecord) || null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * 경기 리플레이를 로컬 IndexedDB에 영구 저장 (최대 30개 제한, 초과 시 가장 오래된 것 삭제)
   */
  public async saveReplay(
    matchCode: string,
    ticks: RawReplayTick[],
    metadata: MatchSummaryMetadata,
    binary?: ArrayBuffer
  ): Promise<{ totalCount: number; saved: boolean }> {
    try {
      const db = await this.getDB();
      const record: CachedReplayRecord = {
        matchCode,
        ticks,
        metadata,
        createdAt: metadata?.createdAt || new Date().toISOString(),
        savedAt: Date.now(),
        binary,
      };

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORES.REPLAY, 'readwrite');
        const store = tx.objectStore(STORES.REPLAY);
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });

      // 최대 300개 보관 제한 (오래된 순 FIFO 삭제)
      const all = await this.listReplays();
      const MAX_REPLAYS = 300;
      if (all.length > MAX_REPLAYS) {
        // savedAt 오름차순 정렬 (가장 오래된 것부터)
        all.sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0));
        const excess = all.length - MAX_REPLAYS;
        const deleteTx = db.transaction(STORES.REPLAY, 'readwrite');
        const delStore = deleteTx.objectStore(STORES.REPLAY);
        for (let i = 0; i < excess; i++) {
          delStore.delete(all[i].matchCode);
        }
        await new Promise<void>((resolve) => {
          deleteTx.oncomplete = () => resolve();
          deleteTx.onerror = () => resolve();
        });
      }

      const totalCount = Math.min(all.length, MAX_REPLAYS);
      return { totalCount, saved: true };
    } catch (e) {
      console.warn('[AppDatabase] Failed to save replay to IndexedDB:', e);
      return { totalCount: 0, saved: false };
    }
  }

  /**
   * 여러 리플레이 레코드를 단일 트랜잭션으로 초고속 일괄 저장 (시드 데이터 로딩 전용)
   */
  public async saveReplaysBulk(records: CachedReplayRecord[]): Promise<number> {
    try {
      const db = await this.getDB();
      return new Promise<number>((resolve, reject) => {
        const tx = db.transaction(STORES.REPLAY, 'readwrite');
        const store = tx.objectStore(STORES.REPLAY);
        for (const rec of records) {
          store.put(rec);
        }
        tx.oncomplete = () => resolve(records.length);
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('[AppDatabase] Failed bulk saving replays:', e);
      return 0;
    }
  }

  /**
   * 특정 리플레이 삭제
   */
  public async deleteReplay(matchCode: string): Promise<boolean> {
    try {
      const db = await this.getDB();
      return new Promise<boolean>((resolve) => {
        const tx = db.transaction(STORES.REPLAY, 'readwrite');
        const store = tx.objectStore(STORES.REPLAY);
        const req = store.delete(matchCode);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  }

  /**
   * 저장된 로컬 리플레이 목록 전체 조회 (최신 저장순 정렬)
   */
  public async listReplays(): Promise<CachedReplayRecord[]> {
    try {
      const db = await this.getDB();
      return new Promise<CachedReplayRecord[]>((resolve) => {
        const tx = db.transaction(STORES.REPLAY, 'readonly');
        const store = tx.objectStore(STORES.REPLAY);
        const req = store.getAll();
        req.onsuccess = () => {
          const list = (req.result as CachedReplayRecord[]) || [];
          list.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
          resolve(list);
        };
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  /* =====================================================================
     3. 통합 통계 및 디스크 사용량 분석
     ===================================================================== */

  public async getStats(): Promise<StorageStats> {
    let audioCount = 0;
    let audioBytes = 0;
    let lobbyAudioCount = 0;
    let inGameAudioCount = 0;
    let replayCount = 0;
    let replayBytes = 0;

    try {
      const db = await this.getDB();

      // 오디오 통계 계산 (카테고리별 분기 집계)
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORES.AUDIO, 'readonly');
        const store = tx.objectStore(STORES.AUDIO);
        const req = store.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            audioCount++;
            const rec = cursor.value as CachedAudioRecord;
            audioBytes += rec.sizeBytes || 0;
            if (rec.category === 'lobby') {
              lobbyAudioCount++;
            } else if (rec.category === 'ingame') {
              inGameAudioCount++;
            }
            cursor.continue();
          } else {
            resolve();
          }
        };
        req.onerror = () => resolve();
      });

      // 리플레이 통계 계산
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORES.REPLAY, 'readonly');
        const store = tx.objectStore(STORES.REPLAY);
        const req = store.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            replayCount++;
            const rec = cursor.value as CachedReplayRecord;
            replayBytes += rec.ticks ? rec.ticks.length * 20 : (rec.binary ? rec.binary.byteLength : 0);
            cursor.continue();
          } else {
            resolve();
          }
        };
        req.onerror = () => resolve();
      });
    } catch (e) {
      // Ignore
    }

    const isPersistent = await this.isPersisted();
    let quotaBytes: number | undefined;
    let usageBytes: number | undefined;

    try {
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        quotaBytes = est.quota;
        usageBytes = est.usage;
      }
    } catch {}

    return {
      audioCount,
      audioBytes,
      lobbyAudioCount,
      inGameAudioCount,
      replayCount,
      replayBytes,
      isPersistent,
      quotaBytes,
      usageBytes,
    };
  }

  public async debugDump(): Promise<any> {
    const db = await this.getDB();
    const result: any = { store: [], by_cachedAt: [], by_trackId: [], by_category: [] };
    const tx = db.transaction(STORES.AUDIO, 'readonly');
    const store = tx.objectStore(STORES.AUDIO);

    await new Promise<void>((resolve) => {
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          result.store.push({ key: cursor.key, primaryKey: cursor.primaryKey, value: { ...cursor.value, blob: '[Blob]' } });
          cursor.continue();
        } else resolve();
      };
      req.onerror = () => resolve();
    });

    const indexCachedAt = store.index('by_cachedAt');
    await new Promise<void>((resolve) => {
      const req = indexCachedAt.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          result.by_cachedAt.push({ key: cursor.key, primaryKey: cursor.primaryKey, title: cursor.value?.title });
          cursor.continue();
        } else resolve();
      };
      req.onerror = () => resolve();
    });

    const indexTrackId = store.index('by_trackId');
    await new Promise<void>((resolve) => {
      const req = indexTrackId.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          result.by_trackId.push({ key: cursor.key, primaryKey: cursor.primaryKey, title: cursor.value?.title });
          cursor.continue();
        } else resolve();
      };
      req.onerror = () => resolve();
    });

    const indexCategory = store.index('by_category');
    await new Promise<void>((resolve) => {
      const req = indexCategory.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          result.by_category.push({ key: cursor.key, primaryKey: cursor.primaryKey, title: cursor.value?.title });
          cursor.continue();
        } else resolve();
      };
      req.onerror = () => resolve();
    });

    return result;
  }
}

// 편의 싱글톤 인스턴스 내보내기
export const appDB = AppDatabase.getInstance();
