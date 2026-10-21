import type { CachedReplayRecord } from '../storage/schema.ts';
import { CIRCUIT_DEFINITIONS, type CircuitId } from '../data/circuits.ts';

export interface MatchHistoryTableCallbacks {
  onSelectRecord?: (record: CachedReplayRecord) => void;
  onPlayReplay?: (record: CachedReplayRecord) => void;
  onDeleteRecord?: (record: CachedReplayRecord) => void;
}

export interface MatchHistoryTableOptions {
  tbody: HTMLElement | null;
  paginationContainer: HTMLElement | null;
  callbacks?: MatchHistoryTableCallbacks;
}

/**
 * 전적 검색 및 리더보드 테이블 & 페이지네이션 전담 컴포넌트
 * - 서킷별 필터링, 검색어(드라이버/코드) 필터링, 정렬(베스트랩/최신순/최고속)
 * - 1~3위 메달 이모티콘 및 000 3자리 고정 패딩 순위 표시
 * - 200건 대규모 탐색용 [1][2]...[10] 페이지네이션 컨트롤 바
 */
export class MatchHistoryTable {
  private tbody: HTMLElement | null;
  private paginationContainer: HTMLElement | null;
  private callbacks: MatchHistoryTableCallbacks;

  private allRecords: CachedReplayRecord[] = [];
  private currentCircuitFilter: string = 'all';
  private searchQuery: string = '';
  private sortMode: 'best_lap' | 'recent' | 'top_speed' = 'best_lap';
  private currentPage: number = 1;
  private readonly pageSize: number = 20;

  constructor(options: MatchHistoryTableOptions) {
    this.tbody = options.tbody;
    this.paginationContainer = options.paginationContainer;
    this.callbacks = options.callbacks || {};
    this.bindEvents();
  }

  public setRecords(records: CachedReplayRecord[]): void {
    this.allRecords = records;
  }

  public setCircuitFilter(filter: string): void {
    this.currentCircuitFilter = filter;
    this.currentPage = 1;
  }

  public setSearchQuery(query: string): void {
    this.searchQuery = query.trim().toLowerCase();
    this.currentPage = 1;
  }

  public setSortMode(mode: 'best_lap' | 'recent' | 'top_speed'): void {
    this.sortMode = mode;
    this.currentPage = 1;
  }

  public setPage(page: number): void {
    this.currentPage = Math.max(1, page);
  }

  public getCurrentPage(): number {
    return this.currentPage;
  }

  public getSortMode(): 'best_lap' | 'recent' | 'top_speed' {
    return this.sortMode;
  }

  private bindEvents(): void {
    // 1. 테이블 행 클릭 / 다시보기 버튼 / 삭제 버튼 이벤트 위임
    this.tbody?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      const deleteBtn = target.closest('.history-delete-btn') as HTMLElement | null;
      if (deleteBtn) {
        e.stopPropagation();
        const matchCode = deleteBtn.getAttribute('data-match');
        const record = this.allRecords.find(r => r.matchCode === matchCode);
        if (record && this.callbacks.onDeleteRecord) {
          this.callbacks.onDeleteRecord(record);
        }
        return;
      }

      const replayBtn = target.closest('.history-replay-btn') as HTMLElement | null;
      if (replayBtn) {
        e.stopPropagation();
        const matchCode = replayBtn.getAttribute('data-match');
        const record = this.allRecords.find(r => r.matchCode === matchCode);
        if (record && this.callbacks.onPlayReplay) {
          this.callbacks.onPlayReplay(record);
        }
        return;
      }

      const row = target.closest('.history-data-row') as HTMLElement | null;
      if (row) {
        const matchCode = row.getAttribute('data-match');
        const record = this.allRecords.find(r => r.matchCode === matchCode);
        if (record && this.callbacks.onSelectRecord) {
          this.callbacks.onSelectRecord(record);
        }
      }
    });

    // 2. 페이지네이션 버튼 클릭 이벤트 위임
    this.paginationContainer?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const pageBtn = target.closest('.page-btn') as HTMLElement | null;
      if (!pageBtn) return;

      const pageAttr = pageBtn.getAttribute('data-page');
      if (pageAttr) {
        this.currentPage = parseInt(pageAttr, 10);
        this.render();
      }
    });
  }

  /**
   * 필터 및 정렬 조건에 따른 리플레이 목록 렌더링
   */
  public render(): void {
    if (!this.tbody) return;

    // 1. 서킷 필터링
    const baseList = this.allRecords.filter(r => {
      const recCircuitId = r.metadata?.circuitId || 'circuit_monaco';
      if (this.currentCircuitFilter !== 'all' && recCircuitId !== this.currentCircuitFilter) {
        return false;
      }
      return true;
    });

    // 2. 정렬 모드에 따라 기본 전체 순위 정렬
    if (this.sortMode === 'best_lap') {
      baseList.sort((a, b) => (a.metadata?.bestLapMs || Infinity) - (b.metadata?.bestLapMs || Infinity));
    } else if (this.sortMode === 'recent') {
      baseList.sort((a, b) => {
        const timeB = new Date(b.metadata?.createdAt || b.createdAt || b.savedAt || 0).getTime();
        const timeA = new Date(a.metadata?.createdAt || a.createdAt || a.savedAt || 0).getTime();
        return timeB - timeA;
      });
    } else if (this.sortMode === 'top_speed') {
      baseList.sort((a, b) => (b.metadata?.topSpeedKmh || 0) - (a.metadata?.topSpeedKmh || 0));
    }

    // 3. 각 레코드에 고유 순위(rankNum) 부여 (검색 시 1위로 리셋되는 버그 원천 해결)
    const rankedList = baseList.map((rec, idx) => ({
      rec,
      rankNum: idx + 1,
    }));

    // 4. 검색어 필터링 적용 (원래 순위 rankNum 보존)
    let filtered = rankedList;
    if (this.searchQuery) {
      filtered = rankedList.filter(({ rec }) => {
        const recCircuitId = rec.metadata?.circuitId || 'circuit_monaco';
        const driverName = (rec.metadata?.driverName || '').toLowerCase();
        const code = (rec.matchCode || '').toLowerCase();
        const circuitTitle = (CIRCUIT_DEFINITIONS[recCircuitId]?.title || '').toLowerCase();
        return driverName.includes(this.searchQuery) || code.includes(this.searchQuery) || circuitTitle.includes(this.searchQuery);
      });
    }

    // 5. 빈 상태 UI
    if (filtered.length === 0) {
      if (this.paginationContainer) this.paginationContainer.innerHTML = "";
      this.tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 36px 16px; color: var(--text-muted); font-family: var(--font-mono); font-size: 12px;">
            <span style="font-size: 22px; display: block; margin-bottom: 8px;">🏁</span>
            일치하는 경기 리플레이가 없습니다.<br>
            <span style="font-size: 11px; opacity: 0.7;">경기를 완주한 후 결과 화면에서 [다시보기]를 누르면 로컬 IndexedDB에 자동 보관됩니다.</span>
          </td>
        </tr>
      `;
      return;
    }

    // 6. 페이지네이션 슬라이싱 (페이지당 20건)
    const totalPages = Math.max(1, Math.ceil(filtered.length / this.pageSize));
    if (this.currentPage > totalPages) this.currentPage = totalPages;
    if (this.currentPage < 1) this.currentPage = 1;

    const startIndex = (this.currentPage - 1) * this.pageSize;
    const pageItems = filtered.slice(startIndex, startIndex + this.pageSize);

    // 7. 테이블 행 생성 (가로 스크롤 방지를 위해 다시보기 버튼 텍스트 제거하고 컴팩트 아이콘만 표시)
    this.tbody.innerHTML = pageItems.map(({ rec, rankNum }) => {
      const meta = rec.metadata;
      let rankBadgeHtml = `<span class="rank-badge">${rankNum.toString().padStart(3, '0')}</span>`;
      let rankRowClass = '';

      if (this.sortMode === 'best_lap' && rankNum <= 3) {
        const medal = rankNum === 1 ? '🥇' : (rankNum === 2 ? '🥈' : '🥉');
        rankBadgeHtml = `<span class="rank-badge rank-badge-${rankNum} medal-only" title="${rankNum}위">${medal}</span>`;
        rankRowClass = `rank-row-top rank-${rankNum}`;
      }

      const driverName = this.escapeHtml(meta?.driverName || 'Driver');
      const vehicleBadge = this.getVehicleBadge(meta?.vehicleModelId || 'gt_turbo');
      const recCircuitId = meta?.circuitId || 'circuit_monaco';
      const circuitTitle = this.getCircuitTitle(recCircuitId);
      const lapTime = meta?.bestLapMs ? this.formatTime(meta.bestLapMs) : '--:--.---';
      const topSpeed = meta?.topSpeedKmh ? `${meta.topSpeedKmh.toFixed(1)} km/h` : '--.- km/h';
      const dateStr = this.formatDate(rec.metadata?.createdAt || rec.createdAt || rec.savedAt);

      return `
        <tr class="history-data-row ${rankRowClass}" data-match="${rec.matchCode}" title="클릭하여 상세 기록 및 2D 미니맵 인스펙터 열기">
          <td class="col-rank">${rankBadgeHtml}</td>
          <td class="col-driver"><strong class="driver-name-text">${driverName}</strong></td>
          <td class="col-vehicle">${vehicleBadge}</td>
          <td class="col-circuit">${this.formatCircuitTitle(circuitTitle)}</td>
          <td class="col-lap"><span class="lap-highlight ${rankNum === 1 ? 'gold' : ''}">${lapTime}</span></td>
          <td class="col-speed">${topSpeed}</td>
          <td class="col-date">${dateStr}</td>
          <td class="col-action">
            <div class="history-action-group">
              <button type="button" class="history-replay-btn icon-only" data-match="${rec.matchCode}" title="3D 리플레이 다시보기">▶</button>
              <button type="button" class="history-delete-btn" data-match="${rec.matchCode}" title="삭제">✕</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // 8. 페이지네이션 바 렌더링
    this.renderPagination(totalPages, filtered.length, startIndex, pageItems.length);
  }

  /**
   * 200건 대규모 리더보드 초고속 탐색을 위한 페이지네이션 컨트롤 바 렌더링
   */
  private renderPagination(totalPages: number, totalCount: number, startIndex: number, pageItemCount: number): void {
    if (!this.paginationContainer) return;

    if (totalPages <= 1) {
      this.paginationContainer.innerHTML = `<div class="pagination-info">전체 <strong>${totalCount}</strong>건</div>`;
      return;
    }

    const current = this.currentPage;
    const items: (number | '...')[] = [];

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) items.push(i);
    } else {
      if (current <= 3) {
        items.push(1, 2, 3, 4, '...', totalPages);
      } else if (current >= totalPages - 2) {
        items.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        items.push(1, '...', current - 1, current, current + 1, '...', totalPages);
      }
    }

    let pageButtonsHtml = "";
    for (const it of items) {
      if (it === '...') {
        pageButtonsHtml += `<span class="page-ellipsis">...</span>`;
      } else {
        pageButtonsHtml += `<button type="button" class="page-btn page-num ${it === current ? 'active' : ''}" data-page="${it}">[${it}]</button>`;
      }
    }

    this.paginationContainer.innerHTML = `
      <div class="pagination-info">전체 <strong>${totalCount}</strong>건 중 <strong>${startIndex + 1} - ${startIndex + pageItemCount}</strong></div>
      <div class="pagination-controls">
        <button type="button" class="page-btn page-nav" data-page="1" title="첫 페이지" ${current === 1 ? 'disabled' : ''}>«</button>
        <button type="button" class="page-btn page-nav" data-page="${Math.max(1, current - 1)}" title="이전 페이지" ${current === 1 ? 'disabled' : ''}>‹</button>
        ${pageButtonsHtml}
        <button type="button" class="page-btn page-nav" data-page="${Math.min(totalPages, current + 1)}" title="다음 페이지" ${current === totalPages ? 'disabled' : ''}>›</button>
        <button type="button" class="page-btn page-nav" data-page="${totalPages}" title="마지막 페이지" ${current === totalPages ? 'disabled' : ''}>»</button>
      </div>
    `;
  }

  public getVehicleBadge(vehicleModelId: string): string {
    if (vehicleModelId === 'formula_aero') {
      return `<span class="vehicle-badge formula">Formula Aero</span>`;
    } else if (vehicleModelId === 'cyber_speedster') {
      return `<span class="vehicle-badge cyber">Cyber Speedster</span>`;
    } else if (vehicleModelId === 'lm_hypercar') {
      return `<span class="vehicle-badge hyper">Apex Hypercar</span>`;
    }
    return `<span class="vehicle-badge gt">GT-86 Turbo</span>`;
  }

  public getVehicleName(vehicleModelId: string): string {
    if (vehicleModelId === 'formula_aero') return 'Formula Aero';
    if (vehicleModelId === 'cyber_speedster') return 'Cyber Speedster';
    if (vehicleModelId === 'lm_hypercar') return 'Apex Hypercar';
    return 'GT-86 Turbo';
  }

  public formatCircuitTitle(title: string): string {
    if (!title) return "";
    if (title.length >= 10 && title.includes(" ")) {
      const words = title.split(" ");
      if (words.length === 2) {
        return `${words[0]}<br>${words[1]}`;
      } else if (words.length > 2) {
        const midChar = title.length / 2;
        let bestSpaceIdx = 0;
        let minDiff = Infinity;
        let runningLen = 0;
        for (let i = 0; i < words.length - 1; i++) {
          runningLen += words[i].length + (i > 0 ? 1 : 0);
          const diff = Math.abs(runningLen - midChar);
          if (diff < minDiff) {
            minDiff = diff;
            bestSpaceIdx = i;
          }
        }
        const part1 = words.slice(0, bestSpaceIdx + 1).join(" ");
        const part2 = words.slice(bestSpaceIdx + 1).join(" ");
        return `${part1}<br>${part2}`;
      }
    }
    return title;
  }

  public getCircuitTitle(circuitId: CircuitId): string {
    const meta = CIRCUIT_DEFINITIONS[circuitId];
    if (meta?.title) return meta.title;
    if (circuitId === 'circuit_monaco') return 'Monaco GP';
    if (circuitId === 'circuit_monza') return 'Monza GP';
    if (circuitId === 'circuit_spa') return 'Spa-Francorchamps';
    if (circuitId === 'circuit_silverstone') return 'Silverstone';
    return circuitId;
  }

  public formatTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
    const s = (totalSec % 60).toString().padStart(2, '0');
    const msec = Math.floor(ms % 1000).toString().padStart(3, '0');
    return `${m}:${s}.${msec}`;
  }

  public formatDate(timestamp: number | string | undefined): string {
    if (!timestamp) return '-';
    try {
      const d = new Date(timestamp);
      if (isNaN(d.getTime())) return '-';
      const year = d.getFullYear();
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      const day = d.getDate().toString().padStart(2, '0');
      const hours = d.getHours().toString().padStart(2, '0');
      const mins = d.getMinutes().toString().padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${mins}`;
    } catch {
      return '-';
    }
  }

  public escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
