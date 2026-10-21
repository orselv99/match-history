import { BaseModal } from '../BaseModal.ts';
import { appDB } from '../../storage/AppDatabase.ts';
import { initSeedReplays } from '../../storage/ReplaySeedService.ts';
import type { CachedReplayRecord } from '../../storage/schema.ts';
import { showToast } from '../Toast.ts';
import { MatchHistoryTable } from './MatchHistoryTable.ts';
import { MatchHistoryInspector } from './MatchHistoryInspector.ts';
import { HistoryStatsSummary } from './HistoryStatsSummary.ts';

export interface MatchHistoryModalCallbacks {
  onPlayReplay?: (record: CachedReplayRecord) => void;
}

/**
 * 로컬 IndexedDB에 저장된 주행 리플레이 목록 및 전적 컨트롤러 (메인 오케스트레이터)
 * - 상단 요약 통계(총 경기 수, 최고 랩타임, 최고속도) -> HistoryStatsSummary 위임
 * - 테이블 렌더링 및 페이지네이션 -> MatchHistoryTable 위임
 * - 풀-커버 인스펙터 상세 분석 팝업 & 2D 미니맵 -> MatchHistoryInspector 위임
 */
export class MatchHistoryModal extends BaseModal {
  // 메인 리더보드 카드 DOM
  private mainCard: HTMLElement | null;
  private btnClose: HTMLElement | null;
  private tabBtns: NodeListOf<HTMLElement>;
  private searchInput: HTMLInputElement | null;
  private btnSearch: HTMLElement | null;
  private sortSelect: HTMLSelectElement | null;
  private tableTbody: HTMLElement | null;
  private paginationContainer: HTMLElement | null;

  private allRecords: CachedReplayRecord[] = [];

  // 분리된 전담 하위 컴포넌트
  public table: MatchHistoryTable;
  public inspector: MatchHistoryInspector;
  public statsSummary: HistoryStatsSummary;

  private callbacks: MatchHistoryModalCallbacks;

  // 하위 호환 게터
  public get isInspectorViewOpen(): boolean {
    return this.inspector.isOpen;
  }

  constructor(callbacks: MatchHistoryModalCallbacks = {}) {
    super('match-history-modal');
    this.callbacks = callbacks;

    // 메인 리더보드 카드 요소
    this.mainCard = document.getElementById('history-main-card');
    this.btnClose = document.getElementById('history-btn-close');
    this.tabBtns = document.querySelectorAll<HTMLElement>('.history-tab-btn');
    this.searchInput = document.getElementById('history-search-driver') as HTMLInputElement | null;
    this.btnSearch = document.getElementById('history-btn-search');
    this.sortSelect = document.getElementById('history-sort-select') as HTMLSelectElement | null;
    this.tableTbody = document.getElementById('history-table-tbody');
    this.paginationContainer = document.getElementById('history-pagination-container');

    // 1. 하위 컴포넌트 초기화
    this.statsSummary = new HistoryStatsSummary();

    this.table = new MatchHistoryTable({
      tbody: this.tableTbody,
      paginationContainer: this.paginationContainer,
      callbacks: {
        onSelectRecord: (record) => {
          this.openInspector(record.matchCode);
        },
        onPlayReplay: (record) => {
          this.closeEntireModal();
          this.callbacks.onPlayReplay?.(record);
        },
        onDeleteRecord: async (record) => {
          if (confirm(`경기 기록 [${record.matchCode}]를 삭제하시겠습니까?`)) {
            await appDB.deleteReplay(record.matchCode);
            showToast(`🗑 리플레이 [${record.matchCode}] 기록이 삭제되었습니다.`);
            await this.loadAndRender();
          }
        },
      },
    });

    this.inspector = new MatchHistoryInspector({
      onClose: () => {
        this.closeInspector();
      },
      onPlayReplay: (record) => {
        this.closeEntireModal();
        this.callbacks.onPlayReplay?.(record);
      },
    });

    this.bindEvents();
  }

  private bindEvents(): void {
    // 1. 메인 모달 닫기 (✕ 버튼)
    this.btnClose?.addEventListener('click', () => this.closeEntireModal());

    // 2. 서킷 탭 필터링
    this.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const circuit = btn.getAttribute('data-circuit') || 'all';
        this.table.setCircuitFilter(circuit);
        this.table.render();
      });
    });

    // 3. 드라이버 및 매치코드 검색
    const executeSearch = () => {
      const query = this.searchInput?.value || '';
      this.table.setSearchQuery(query);
      this.table.render();
    };

    this.btnSearch?.addEventListener('click', executeSearch);
    this.searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') executeSearch();
    });

    // 4. 정렬 셀렉트 변경
    this.sortSelect?.addEventListener('change', () => {
      const mode = (this.sortSelect?.value as any) || 'best_lap';
      this.table.setSortMode(mode);
      this.table.render();
    });
  }

  public open(): void {
    this.showModal();
    this.closeInspector();
    this.loadAndRender();
  }

  public override close(): void {
    if (this.inspector.isOpen) {
      this.closeInspector();
      return;
    }
    this.closeEntireModal();
  }

  /**
   * 모달을 완전히 닫고 모든 상태 초기화
   */
  public closeEntireModal(): void {
    this.closeInspector();
    this.inspector.stop();
    this.hideModal();
  }

  /**
   * 행 클릭 시 인스펙터 풀-커버 팝업을 열음
   */
  public openInspector(matchCode: string): void {
    const rec = this.allRecords.find(r => r.matchCode === matchCode);
    if (!rec) return;

    this.inspector.open(rec, this.mainCard, this.table);
  }

  /**
   * 인스펙터를 닫고 메인 리더보드 목록 화면으로 복귀
   */
  public closeInspector(): void {
    this.inspector.close(this.mainCard);
  }

  /**
   * IndexedDB에서 최대 100개 리플레이 조회 및 통계/테이블 일괄 갱신
   */
  public async loadAndRender(): Promise<void> {
    try {
      const rawRecords = await appDB.listReplays();
      const validRecords: CachedReplayRecord[] = [];
      for (const r of rawRecords) {
        const lastTick = r.ticks?.[r.ticks.length - 1];
        const isLessThan3Laps = (r.metadata?.totalLaps || 1) < 3 || (lastTick?.lap || 1) < 3 || (lastTick?.timeMs || 0) < 45000;
        if (isLessThan3Laps) {
          await appDB.deleteReplay(r.matchCode);
        } else {
          validRecords.push(r);
        }
      }

      // 3랩 데이터가 40개 미만인 경우 자동으로 최신 시드 데이터 즉시 일괄 동기화
      if (validRecords.length < 40) {
        await initSeedReplays(true);
        const seeded = await appDB.listReplays();
        this.allRecords = seeded;
      } else {
        this.allRecords = validRecords;
      }

      this.statsSummary.update(
        this.allRecords,
        (ms) => this.table.formatTime(ms),
        (s) => this.table.escapeHtml(s)
      );
      this.table.setRecords(this.allRecords);
      this.table.render();
    } catch (e) {
      console.warn('[MatchHistoryModal] loadAndRender failed:', e);
    }
  }
}
