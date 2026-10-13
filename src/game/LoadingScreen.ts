import { LOADING_TIPS } from '../data/gameConstants.ts';

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

  public pickNextTip(): void {
    if (!this.tipEl || LOADING_TIPS.length === 0) return;
    this.currentTipIndex = Math.floor(Math.random() * LOADING_TIPS.length);
    this.tipEl.textContent = LOADING_TIPS[this.currentTipIndex];
  }

  /**
   * 1. 게임 최초 초기화 시 실행되는 로딩 시퀀스 (Dual-purpose: Initial Boot)
   */
  public async runInitialLoad(): Promise<void> {
    this.show('INITIALIZING MOTORSPORT ENGINE');

    await this.animateTo(18, 'Three.js WebGL 렌더 파이프라인 및 캔버스 준비 중...', 280);
    await this.animateTo(42, 'Catmull-Rom 폐루프 3D 서킷 메시 및 연석 컴파일 중...', 320);
    await this.animateTo(68, '차량 물리 동역학 시뮬레이터 및 스키드마크 버퍼 구성 중...', 340);
    await this.animateTo(88, 'Web Audio API 프로시저럴 사운드 신디사이저 연결 중...', 260);
    await this.animateTo(100, '시스템 초기화 완료! 타이틀 메뉴로 진입합니다.', 220);

    await new Promise((r) => setTimeout(r, 220));
    this.hide();
  }

  /**
   * 2. 인게임 진입(레이스 시작) 전 실행되는 로딩 시퀀스 (Dual-purpose: Pre-Race Setup)
   */
  public async runPreRaceLoad(trackTitle: string, vehicleTitle: string): Promise<void> {
    this.show(`PREPARING RACE // ${trackTitle.toUpperCase()}`);

    await this.animateTo(22, `서킷 지오메트리 & 섹터 체크포인트 로드 중... [${trackTitle}]`, 280);
    await this.animateTo(48, `머신 에어로다이내믹스 & 섀시 튜닝 적용 중... [${vehicleTitle}]`, 320);
    await this.animateTo(74, '환경 조명, 비/안개 날씨 파티클 및 노면 반사 컴파일 중...', 320);
    await this.animateTo(92, '스타팅 그리드 슬롯 정렬 및 라이벌 AI 레이서 배치 중...', 260);
    await this.animateTo(100, '그리드 정렬 완료! 레이스 세션으로 이동합니다.', 220);

    await new Promise((r) => setTimeout(r, 220));
    this.hide();
  }
}
