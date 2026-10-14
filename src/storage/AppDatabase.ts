/**
 * Apex Racing 브라우저 영구 데이터베이스 매니저 (IndexedDB)
 * - 1. 오디오 에셋 캐시 ('audio_cache'): BGM 스트림 바이너리 영구 보관 (CDN 트래픽 $0 및 오프라인 즉시 재생)
 * - 2. 매치 리플레이 캐시 ('replay_cache'): R2에서 수신한 경기 리플레이 압축 바이너리 영구 보관
 * - 브라우저 Storage Persistence API 연동으로 디스크 정리 시 영구 보존
 */

export interface CachedAudioRecord {
  url: string;
  blob: Blob;
  sizeBytes: number;
  cachedAt: number;
  trackId?: string;
}

export interface CachedReplayRecord {
  matchCode: string;
  binary: ArrayBuffer;
  metadata: any;
  createdAt: string;
  savedAt: number;
}

export interface StorageStats {
  audioCount: number;
  audioBytes: number;
  replayCount: number;
  replayBytes: number;
  isPersistent: boolean;
  quotaBytes?: number;
  usageBytes?: number;
}

const DB_NAME = 'ApexRacingDB';
const DB_VERSION = 1;
const STORE_AUDIO = 'audio_cache';
const STORE_REPLAY = 'replay_cache';

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
   * IndexedDB 연결 초기화 및 스키마 마이그레이션
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

        // 1. 오디오 에셋 저장소 (URL 기준 Key)
        if (!db.objectStoreNames.contains(STORE_AUDIO)) {
          const audioStore = db.createObjectStore(STORE_AUDIO, { keyPath: 'url' });
          audioStore.createIndex('by_cachedAt', 'cachedAt', { unique: false });
          audioStore.createIndex('by_trackId', 'trackId', { unique: false });
        }

        // 2. 리플레이 바이너리 저장소 (matchCode 기준 Key)
        if (!db.objectStoreNames.contains(STORE_REPLAY)) {
          const replayStore = db.createObjectStore(STORE_REPLAY, { keyPath: 'matchCode' });
          replayStore.createIndex('by_createdAt', 'createdAt', { unique: false });
          replayStore.createIndex('by_savedAt', 'savedAt', { unique: false });
        }
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
      return new Promise<boolean>((resolve) => {
        const tx = db.transaction(STORE_AUDIO, 'readonly');
        const store = tx.objectStore(STORE_AUDIO);
        const req = store.getKey(url);
        req.onsuccess = () => resolve(req.result !== undefined);
        req.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  }

  /**
   * 로컬 DB에서 오디오 Blob 조회
   */
  public async getAudio(url: string): Promise<CachedAudioRecord | null> {
    try {
      const db = await this.getDB();
      return new Promise<CachedAudioRecord | null>((resolve) => {
        const tx = db.transaction(STORE_AUDIO, 'readonly');
        const store = tx.objectStore(STORE_AUDIO);
        const req = store.get(url);
        req.onsuccess = () => resolve((req.result as CachedAudioRecord) || null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * 오디오 Blob을 로컬 DB에 영구 저장
   */
  public async saveAudio(url: string, blob: Blob, trackId?: string): Promise<void> {
    try {
      const db = await this.getDB();
      const record: CachedAudioRecord = {
        url,
        blob,
        sizeBytes: blob.size,
        cachedAt: Date.now(),
        trackId,
      };

      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_AUDIO, 'readwrite');
        const store = tx.objectStore(STORE_AUDIO);
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('[AppDatabase] Failed to save audio to IndexedDB:', e);
    }
  }

  /**
   * 로컬 오디오 Blob의 ObjectURL 반환 (메모리 재사용 및 즉각 재생)
   */
  public async getAudioBlobUrl(url: string): Promise<string | null> {
    if (this.blobUrlMap.has(url)) {
      return this.blobUrlMap.get(url)!;
    }

    const record = await this.getAudio(url);
    if (!record || !record.blob) return null;

    const objectUrl = URL.createObjectURL(record.blob);
    this.blobUrlMap.set(url, objectUrl);
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
        const tx = db.transaction(STORE_AUDIO, 'readwrite');
        const store = tx.objectStore(STORE_AUDIO);
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('[AppDatabase] Failed to clear audio cache:', e);
    }
  }

  /* =====================================================================
     2. 매치 리플레이(Replay) 바이너리 캐시 API (향후 연동 준비 완료)
     ===================================================================== */

  /**
   * 특정 매치 리플레이가 로컬 DB에 존재하는지 확인
   */
  public async hasReplay(matchCode: string): Promise<boolean> {
    try {
      const db = await this.getDB();
      return new Promise<boolean>((resolve) => {
        const tx = db.transaction(STORE_REPLAY, 'readonly');
        const store = tx.objectStore(STORE_REPLAY);
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
        const tx = db.transaction(STORE_REPLAY, 'readonly');
        const store = tx.objectStore(STORE_REPLAY);
        const req = store.get(matchCode);
        req.onsuccess = () => resolve((req.result as CachedReplayRecord) || null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * CDN에서 수신한 리플레이 압축 바이너리를 로컬 DB에 영구 저장 (차후 조회 시 CDN Egress $0)
   */
  public async saveReplay(matchCode: string, binary: ArrayBuffer, metadata: any): Promise<void> {
    try {
      const db = await this.getDB();
      const record: CachedReplayRecord = {
        matchCode,
        binary,
        metadata,
        createdAt: metadata?.createdAt || new Date().toISOString(),
        savedAt: Date.now(),
      };

      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_REPLAY, 'readwrite');
        const store = tx.objectStore(STORE_REPLAY);
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('[AppDatabase] Failed to save replay to IndexedDB:', e);
    }
  }

  /**
   * 저장된 로컬 리플레이 목록 전체 조회
   */
  public async listReplays(): Promise<CachedReplayRecord[]> {
    try {
      const db = await this.getDB();
      return new Promise<CachedReplayRecord[]>((resolve) => {
        const tx = db.transaction(STORE_REPLAY, 'readonly');
        const store = tx.objectStore(STORE_REPLAY);
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result as CachedReplayRecord[]) || []);
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
    let replayCount = 0;
    let replayBytes = 0;

    try {
      const db = await this.getDB();

      // 오디오 통계 계산
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_AUDIO, 'readonly');
        const store = tx.objectStore(STORE_AUDIO);
        const req = store.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            audioCount++;
            const rec = cursor.value as CachedAudioRecord;
            audioBytes += rec.sizeBytes || 0;
            cursor.continue();
          } else {
            resolve();
          }
        };
        req.onerror = () => resolve();
      });

      // 리플레이 통계 계산
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_REPLAY, 'readonly');
        const store = tx.objectStore(STORE_REPLAY);
        const req = store.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            replayCount++;
            const rec = cursor.value as CachedReplayRecord;
            replayBytes += rec.binary ? rec.binary.byteLength : 0;
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
      replayCount,
      replayBytes,
      isPersistent,
      quotaBytes,
      usageBytes,
    };
  }
}

// 편의 싱글톤 인스턴스 내보내기
export const appDB = AppDatabase.getInstance();
