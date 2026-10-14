import { LOADING_TIPS } from '../data/gameConstants.ts';
import { appDB } from '../storage/AppDatabase.ts';

export class LoadingScreen {
  private overlay: HTMLElement | null;
  private titleEl: HTMLElement | null;
  private taskEl: HTMLElement | null;
  private fillEl: HTMLElement | null;
  private percentEl: HTMLElement | null;
  private tipEl: HTMLElement | null;

  private currentTipIndex: number = 0;
  private currentPercent: number = 0;

  constructor() {
    this.overlay = document.getElementById('loading-overlay');
    this.titleEl = document.getElementById('loading-title');
    this.taskEl = document.getElementById('loading-task');
    this.fillEl = document.getElementById('loading-bar-fill');
    this.percentEl = document.getElementById('loading-percent');
    this.tipEl = document.getElementById('loading-tip-text');
  }

  public show(titleText: string = 'APEX SIMULATION LOADING'): void {
    if (this.titleEl) {
      this.titleEl.textContent = titleText;
    }
    this.pickNextTip();
    this.setImmediateProgress(0, '세션 초기화 준비 중...');
    if (this.overlay) {
      this.overlay.classList.add('active');
    }
  }

  public hide(): void {
    if (this.overlay) {
      this.overlay.classList.remove('active');
    }
  }

  public setImmediateProgress(pct: number, taskDesc: string): void {
    this.currentPercent = Math.max(0, Math.min(100, pct));
    const rounded = Math.round(this.currentPercent);
    if (this.fillEl) {
      this.fillEl.style.width = `${this.currentPercent}%`;
    }
    if (this.percentEl) {
      this.percentEl.textContent = `${rounded}%`;
    }
    if (this.taskEl) {
      this.taskEl.textContent = taskDesc;
    }
  }

  /**
   * 목표 진행율까지 매 프레임 부드럽게 0% -> 1% -> 2% ... 연속 애니메이션 인터폴레이션
   */
  public animateTo(targetPct: number, taskDesc: string, durationMs: number): Promise<void> {
    return new Promise((resolve) => {
      if (this.taskEl) {
        this.taskEl.textContent = taskDesc;
      }

      const startPct = this.currentPercent;
      const endPct = Math.max(0, Math.min(100, targetPct));
      const startTime = performance.now();

      const step = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / durationMs);

        // 부드러운 Ease-out 가속 곡선
        const ease = 1 - Math.pow(1 - progress, 2);
        this.currentPercent = startPct + (endPct - startPct) * ease;

        const rounded = Math.round(this.currentPercent);
        if (this.fillEl) {
          this.fillEl.style.width = `${this.currentPercent.toFixed(1)}%`;
        }
        if (this.percentEl) {
          this.percentEl.textContent = `${rounded}%`;
        }

        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          this.currentPercent = endPct;
          if (this.fillEl) this.fillEl.style.width = `${endPct}%`;
          if (this.percentEl) this.percentEl.textContent = `${Math.round(endPct)}%`;
          resolve();
        }
      };

      requestAnimationFrame(step);
    });
  }

  /**
   * 로컬 DB Cache Hit 시 번쩍이는 플리커링(Flicker)을 원천 차단하고
   * 유려하게 200~240ms 동안 매끄러운 쾌속 Ease-out 애니메이션으로 통과
   */
  public animateFastTrack(startPct: number, endPct: number, taskDesc: string, durationMs: number = 220): Promise<void> {
    return new Promise((resolve) => {
      if (this.taskEl) {
        this.taskEl.textContent = taskDesc;
      }
      const startTime = performance.now();
      const diff = endPct - startPct;

      const step = (now: number) => {
        const elapsed = now - startTime;
        const p = Math.min(1.0, elapsed / durationMs);
        // 부드러운 Cubic Ease-out
        const ease = 1 - Math.pow(1 - p, 3);
        this.currentPercent = startPct + diff * ease;

        const rounded = Math.round(this.currentPercent);
        if (this.fillEl) this.fillEl.style.width = `${this.currentPercent.toFixed(1)}%`;
        if (this.percentEl) this.percentEl.textContent = `${rounded}%`;

        if (p < 1.0) {
          requestAnimationFrame(step);
        } else {
          this.currentPercent = endPct;
          if (this.fillEl) this.fillEl.style.width = `${endPct}%`;
          if (this.percentEl) this.percentEl.textContent = `${Math.round(endPct)}%`;
          resolve();
        }
      };

      requestAnimationFrame(step);
    });
  }

  public pickNextTip(): void {
    if (!this.tipEl || LOADING_TIPS.length === 0) return;
    this.currentTipIndex = Math.floor(Math.random() * LOADING_TIPS.length);
    this.tipEl.textContent = LOADING_TIPS[this.currentTipIndex];
  }

  /**
   * 실제 오디오 에셋을 IndexedDB 캐시 조회 및 스트림 fetch로 다운로드
   * - 1. Cache Hit (로컬 DB 존재): 번쩍이는 플리커링 없이 220ms 쾌속 부드러운 전환
   * - 2. Cache Miss (최초 접속): CDN 스트림 바이트를 수신하여 측정 후 IndexedDB에 영구 저장 (차후 Egress $0)
   */
  public async loadAudioWithProgress(
    url: string,
    startPct: number,
    endPct: number,
    taskPrefix: string,
    minDurationMs: number = 420
  ): Promise<void> {
    // 1. IndexedDB에 이미 존재하는지 비동기 확인
    const isCached = await appDB.hasAudio(url);

    if (isCached) {
      // 🌟 [CACHE HIT // INSTANT LOCAL LOAD]
      // 깜빡 튀어 사라지는 현상을 방지하는 유려한 220ms 패스트트랙 애니메이션
      const cached = await appDB.getAudio(url);
      const sizeMb = cached ? (cached.sizeBytes / (1024 * 1024)).toFixed(1) : '2.1';
      const hitDesc = `⚡ LOCAL DB HIT // ${taskPrefix} (${sizeMb}MB 즉시 추출)`;
      await this.animateFastTrack(startPct, endPct, hitDesc, 220);
      return;
    }

    // 🌟 [CACHE MISS // 최초 1회 CDN 스트림 다운로드 & IndexedDB 영구 저장]
    const startTime = performance.now();
    const chunks: Uint8Array[] = [];
    let realProgress = 0;
    let isDone = false;
    let loadedBytes = 0;
    let totalBytes = 2.2 * 1024 * 1024; // fallback 2.2MB

    // 백그라운드 실제 스트림 다운로드
    fetch(url)
      .then(async (response) => {
        const headerLen = response.headers.get('content-length');
        if (headerLen) {
          totalBytes = parseInt(headerLen, 10);
        }
        const reader = response.body?.getReader();
        if (!reader) {
          realProgress = 1.0;
          isDone = true;
          return;
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loadedBytes += value.length;
          realProgress = Math.min(1.0, loadedBytes / totalBytes);
        }

        // 수신 완료 ➔ IndexedDB에 영구 저장 (차후 조회는 로컬 0ms / 트래픽 0원!)
        const audioBlob = new Blob(chunks as any[], { type: 'audio/ogg' });
        await appDB.saveAudio(url, audioBlob);

        realProgress = 1.0;
        isDone = true;
      })
      .catch(() => {
        realProgress = 1.0;
        isDone = true;
      });

    // RAF 부드러운 보간 애니메이션
    return new Promise((resolve) => {
      const step = (now: number) => {
        const elapsed = now - startTime;
        const timeRatio = Math.min(1.0, elapsed / minDurationMs);

        // 실제 다운로드 진행률과 최소 시간 비율을 조화롭게 결합
        const progressTarget = isDone ? Math.max(realProgress, timeRatio) : Math.min(realProgress, timeRatio);
        const targetPercent = startPct + (endPct - startPct) * progressTarget;

        // 부드러운 Lerp 보간 추종 (초당 60fps 부드러운 수렴)
        this.currentPercent += (targetPercent - this.currentPercent) * 0.18;

        const rounded = Math.round(this.currentPercent);
        if (this.fillEl) {
          this.fillEl.style.width = `${this.currentPercent.toFixed(1)}%`;
        }
        if (this.percentEl) {
          this.percentEl.textContent = `${rounded}%`;
        }
        if (this.taskEl) {
          const mbDesc = loadedBytes > 0
            ? ` [CDN ➔ 로컬 DB 저장 중...] (${(loadedBytes / (1024 * 1024)).toFixed(1)}MB / ${(totalBytes / (1024 * 1024)).toFixed(1)}MB)`
            : ' [CDN 스트림 연결 중...]';
          this.taskEl.textContent = `${taskPrefix}${mbDesc}`;
        }

        if (isDone && elapsed >= minDurationMs && Math.abs(this.currentPercent - endPct) < 0.8) {
          this.currentPercent = endPct;
          if (this.fillEl) this.fillEl.style.width = `${endPct}%`;
          if (this.percentEl) this.percentEl.textContent = `${Math.round(endPct)}%`;
          resolve();
        } else {
          requestAnimationFrame(step);
        }
      };

      requestAnimationFrame(step);
    });
  }

  /**
   * 1. 게임 최초 초기화 시 실행되는 로딩 시퀀스 (Dual-purpose: Initial Boot)
   */
  public async runInitialLoad(): Promise<void> {
    this.show('INITIALIZING MOTORSPORT ENGINE');

    await this.animateTo(18, 'Three.js WebGL 렌더 파이프라인 및 캔버스 준비 중...', 240);
    await this.animateTo(40, 'Catmull-Rom 폐루프 3D 서킷 메시 및 연석 컴파일 중...', 260);
    await this.animateTo(62, '차량 물리 동역학 시뮬레이터 및 스키드마크 버퍼 구성 중...', 260);

    // 실제 로비 BGM 오디오 에셋(silk-drive.ogg, 약 2.1MB) 실제 스트림 다운로드 & 캐시 예열
    const base = (import.meta as any).env?.BASE_URL || './';
    const cleanBase = base.endsWith('/') ? base : `${base}/`;
    const lobbyBgmUrl = `${cleanBase}audio/bgm/lobby/silk-drive.ogg`;
    await this.loadAudioWithProgress(lobbyBgmUrl, 62, 92, '로비 OST 스트림 프리로드 중... [Silk Drive]', 450);

    await this.animateTo(100, '시스템 초기화 완료! 타이틀 메뉴로 진입합니다.', 180);

    await new Promise((r) => setTimeout(r, 180));
    this.hide();
  }

  /**
   * 2. 인게임 진입(레이스 시작) 전 실행되는 로딩 시퀀스 (Dual-purpose: Pre-Race Setup)
   */
  public async runPreRaceLoad(trackTitle: string, vehicleTitle: string): Promise<void> {
    this.show(`PREPARING RACE // ${trackTitle.toUpperCase()}`);

    await this.animateTo(22, `서킷 지오메트리 & 섹터 체크포인트 로드 중... [${trackTitle}]`, 240);
    await this.animateTo(46, `머신 에어로다이내믹스 & 섀시 튜닝 적용 중... [${vehicleTitle}]`, 260);
    await this.animateTo(68, '환경 조명, 비/안개 날씨 파티클 및 노면 반사 컴파일 중...', 260);

    // 실제 인게임 BGM (apex-velocity.ogg, 약 2.3MB) 실제 스트림 다운로드 & 캐시 예열
    const base = (import.meta as any).env?.BASE_URL || './';
    const cleanBase = base.endsWith('/') ? base : `${base}/`;
    const inGameBgmUrl = `${cleanBase}audio/bgm/ingame/apex-velocity.ogg`;
    await this.loadAudioWithProgress(inGameBgmUrl, 68, 94, '인게임 레이스 OST 버퍼링 중... [Apex Velocity]', 450);

    await this.animateTo(100, '그리드 정렬 완료! 레이스 세션으로 이동합니다.', 180);

    await new Promise((r) => setTimeout(r, 180));
    this.hide();
  }
}
