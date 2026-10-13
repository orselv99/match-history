import { LOADING_TIPS } from '../data/gameConstants.ts';

export class LoadingScreen {
  private overlay: HTMLElement | null;
  private titleEl: HTMLElement | null;
  private taskEl: HTMLElement | null;
  private fillEl: HTMLElement | null;
  private percentEl: HTMLElement | null;
  private tipEl: HTMLElement | null;

  private currentTipIndex: number = 0;

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
    this.setProgress(0, '준비 중...');
    if (this.overlay) {
      this.overlay.classList.add('active');
    }
  }

  public hide(): void {
    if (this.overlay) {
      this.overlay.classList.remove('active');
    }
  }

  public setProgress(pct: number, taskDesc: string): void {
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    if (this.fillEl) {
      this.fillEl.style.width = `${clamped}%`;
    }
    if (this.percentEl) {
      this.percentEl.textContent = `${clamped}%`;
    }
    if (this.taskEl) {
      this.taskEl.textContent = taskDesc;
    }
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

    const steps = [
      { pct: 15, delay: 200, task: 'Three.js WebGL 렌더 파이프라인 및 캔버스 준비 중...' },
      { pct: 35, delay: 250, task: 'Catmull-Rom 폐루프 3D 서킷 메시 및 연석 컴파일 중...' },
      { pct: 60, delay: 300, task: '차량 물리 동역학 시뮬레이터 및 스키드마크 버퍼 구성 중...' },
      { pct: 85, delay: 250, task: 'Web Audio API 프로시저럴 사운드 신디사이저 연결 중...' },
      { pct: 100, delay: 200, task: '시스템 초기화 완료! 타이틀 메뉴로 진입합니다.' },
    ];

    for (const step of steps) {
      this.setProgress(step.pct, step.task);
      await new Promise((r) => setTimeout(r, step.delay));
    }

    await new Promise((r) => setTimeout(r, 180));
    this.hide();
  }

  /**
   * 2. 인게임 진입(레이스 시작) 전 실행되는 로딩 시퀀스 (Dual-purpose: Pre-Race Setup)
   */
  public async runPreRaceLoad(trackTitle: string, vehicleTitle: string): Promise<void> {
    this.show(`PREPARING RACE // ${trackTitle.toUpperCase()}`);

    const steps = [
      { pct: 20, delay: 220, task: `서킷 지오메트리 & 섹터 체크포인트 로드 중... [${trackTitle}]` },
      { pct: 45, delay: 260, task: `머신 에어로다이내믹스 & 섀시 튜닝 적용 중... [${vehicleTitle}]` },
      { pct: 70, delay: 260, task: '환경 조명, 비/안개 날씨 파티클 및 노면 반사 컴파일 중...' },
      { pct: 90, delay: 240, task: '스타팅 그리드 슬롯 정렬 및 라이벌 AI 레이서 배치 중...' },
      { pct: 100, delay: 200, task: '그리드 정렬 완료! 레이스 세션으로 이동합니다.' },
    ];

    for (const step of steps) {
      this.setProgress(step.pct, step.task);
      await new Promise((r) => setTimeout(r, step.delay));
    }

    await new Promise((r) => setTimeout(r, 200));
    this.hide();
  }
}
