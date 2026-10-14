import { BaseModal } from './BaseModal.ts';

/**
 * 전적 검색 및 글로벌 리더보드 모달 전담 컨트롤러
 */
export class MatchHistoryModal extends BaseModal {
  private btnClose: HTMLElement | null;
  private btnCloseBottom: HTMLElement | null;
  private tabBtns: NodeListOf<HTMLElement>;
  private searchInput: HTMLInputElement | null;
  private btnSearch: HTMLElement | null;
  private btnRefresh: HTMLElement | null;

  constructor() {
    super('match-history-modal');
    this.btnClose = document.getElementById('history-btn-close');
    this.btnCloseBottom = document.getElementById('history-btn-close-bottom');
    this.tabBtns = document.querySelectorAll<HTMLElement>('.history-tab-btn');
    this.searchInput = document.getElementById('history-search-driver') as HTMLInputElement | null;
    this.btnSearch = document.getElementById('history-btn-search');
    this.btnRefresh = document.getElementById('history-btn-refresh');

    this.bindEvents();
  }

  private bindEvents(): void {
    const close = () => this.close();
    this.btnClose?.addEventListener('click', close);
    this.btnCloseBottom?.addEventListener('click', close);

    this.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    const filterRows = () => {
      const q = this.searchInput?.value.trim().toLowerCase() || '';
      const rows = document.querySelectorAll<HTMLElement>('#history-table-tbody tr');
      rows.forEach(r => {
        const text = r.textContent?.toLowerCase() || '';
        r.style.display = (!q || text.includes(q)) ? '' : 'none';
      });
    };

    this.btnSearch?.addEventListener('click', filterRows);
    this.searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') filterRows();
    });

    this.btnRefresh?.addEventListener('click', () => {
      if (this.searchInput) this.searchInput.value = '';
      filterRows();
    });

    const replayBtns = document.querySelectorAll<HTMLElement>('.history-replay-btn');
    replayBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const matchCode = btn.getAttribute('data-match');
        alert(`[Step 3 안내] 리플레이 매치 코드: ${matchCode}\n현재 3단계 UI 프로토타입 상태입니다. 다음 단계에서 실제 R2 압축 바이너리 스트리밍 및 3D 뷰어 재생이 연결됩니다.`);
      });
    });
  }

  public open(): void {
    this.showModal();
  }
}
