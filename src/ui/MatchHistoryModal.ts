import { BaseModal } from './BaseModal.ts';
import { appDB } from '../storage/AppDatabase.ts';
import { initSeedReplays } from '../storage/ReplaySeedService.ts';
import type { CachedReplayRecord } from '../storage/schema.ts';
import { CIRCUIT_DEFINITIONS, type CircuitId } from '../data/circuits.ts';
import { showToast } from './Toast.ts';
import { MinimapReplayPlayer } from './MinimapReplayPlayer.ts';

export interface MatchHistoryModalCallbacks {
  onPlayReplay?: (record: CachedReplayRecord) => void;
}

/**
 * 로컬 IndexedDB에 저장된 최대 100개 주행 리플레이 목록 및 전적 컨트롤러
 * - 서킷별 필터링 및 검색어(드라이버/코드) 지원 (검색 시 기존 순위 유지)
 * - 테이블 행 클릭 시 리더보드와 동일한 크기로 전환되는 풀-커버 인스펙터 팝업
 * - 2D 트랙 미니맵 리플레이 (수동 재생, 스크러버 탐색, 3D 리플레이 연동)
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

  private statTotal: HTMLElement | null;
  private statBest: HTMLElement | null;
  private statSpeed: HTMLElement | null;

  // 인스펙터 풀-커버 카드 DOM
  private inspectorCard: HTMLElement | null;
  private inspectorBtnClose: HTMLElement | null;
  private inspectorContentBody: HTMLElement | null;

  private allRecords: CachedReplayRecord[] = [];
  private currentCircuitFilter: string = 'all';
  private searchQuery: string = '';
  private sortMode: 'best_lap' | 'recent' | 'top_speed' = 'best_lap';
  private currentPage: number = 1;
  private readonly pageSize: number = 20;
  private paginationContainer: HTMLElement | null = null;

  // 2D 미니맵 플레이어 및 인스펙터 상태
  public isInspectorViewOpen: boolean = false;
  private currentInspectorRecord: CachedReplayRecord | null = null;
  private minimapPlayer: MinimapReplayPlayer = new MinimapReplayPlayer();

  private callbacks: MatchHistoryModalCallbacks;

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

    this.statTotal = document.getElementById('history-stat-total');
    this.statBest = document.getElementById('history-stat-best');
    this.statSpeed = document.getElementById('history-stat-speed');

    // 인스펙터 카드 요소
    this.inspectorCard = document.getElementById('history-inspector-card');
    this.inspectorBtnClose = document.getElementById('inspector-btn-close');
    this.inspectorContentBody = document.getElementById('inspector-content-body');
    this.paginationContainer = document.getElementById('history-pagination-container');

    this.bindEvents();
  }

  private bindEvents(): void {
    // 1. 메인 모달 닫기 (✕ 버튼)
    const closeAll = () => this.closeEntireModal();
    this.btnClose?.addEventListener('click', closeAll);

    // 2. 인스펙터 [✕] 버튼: 뒤로가기(목록으로 복귀)
    this.inspectorBtnClose?.addEventListener('click', () => {
      this.closeInspector();
    });

    // 3. 서킷 탭 필터링
    this.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentCircuitFilter = btn.getAttribute('data-circuit') || 'all';
        this.currentPage = 1;
        this.renderTable();
      });
    });

    // 4. 드라이버 및 매치코드 검색
    const executeSearch = () => {
      this.searchQuery = this.searchInput?.value.trim().toLowerCase() || '';
      this.currentPage = 1;
      this.renderTable();
    };

    this.btnSearch?.addEventListener('click', executeSearch);
    this.searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') executeSearch();
    });

    // 5. 정렬 셀렉트 변경
    this.sortSelect?.addEventListener('change', () => {
      this.sortMode = (this.sortSelect?.value as any) || 'best_lap';
      this.currentPage = 1;
      this.renderTable();
    });

    // 6. 페이지네이션 바 클릭 이벤트 위임
    this.paginationContainer?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const pageBtn = target.closest('.page-btn') as HTMLElement | null;
      if (!pageBtn || pageBtn.hasAttribute('disabled')) return;

      const pageStr = pageBtn.getAttribute('data-page');
      if (pageStr) {
        const page = parseInt(pageStr, 10);
        if (!isNaN(page) && page !== this.currentPage) {
          this.currentPage = page;
          this.renderTable();
          const scrollContainer = this.mainCard?.querySelector('.history-table-container');
          if (scrollContainer) {
            scrollContainer.scrollTop = 0;
          }
        }
      }
    });

    // 9. 테이블 내 클릭 이벤트 위임
    this.tableTbody?.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;

      // 다시보기 재생 버튼 (직접 3D 뷰어 진입)
      const replayBtn = target.closest('.history-replay-btn') as HTMLElement | null;
      if (replayBtn) {
        const matchCode = replayBtn.getAttribute('data-match');
        const record = this.allRecords.find(r => r.matchCode === matchCode);
        if (record && this.callbacks.onPlayReplay) {
          this.closeEntireModal();
          this.callbacks.onPlayReplay(record);
        }
        return;
      }

      // 리플레이 삭제 버튼
      const deleteBtn = target.closest('.history-delete-btn') as HTMLElement | null;
      if (deleteBtn) {
        const matchCode = deleteBtn.getAttribute('data-match');
        if (matchCode) {
          await appDB.deleteReplay(matchCode);
          showToast(`🗑 리플레이 [${matchCode}] 기록이 삭제되었습니다.`);
          await this.loadAndRender();
        }
        return;
      }

      // 데이터 행 클릭 시 인스펙터 풀-커버 팝업 열기
      const dataRow = target.closest('.history-data-row') as HTMLElement | null;
      if (dataRow) {
        const matchCode = dataRow.getAttribute('data-match');
        if (matchCode) {
          this.openInspector(matchCode);
        }
      }
    });

    // 10. 인스펙터 내부 클릭 & 스크러버 이벤트 위임
    this.inspectorCard?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      // 2D 미니맵 배속 토글 버튼 (1.0x -> 2.0x -> 4.0x)
      const speedBtn = target.closest("#inspector-btn-speed") as HTMLElement | null;
      if (speedBtn) {
        this.minimapPlayer.cyclePlaybackSpeed();
        return;
      }

      // 2D 미니맵 재생/일시정지 토글 버튼
      const togglePlayBtn = target.closest('#inspector-btn-play') as HTMLElement | null;
      if (togglePlayBtn) {
        this.minimapPlayer.togglePlayPause();
        return;
      }

      // 2D 미니맵 영역 내 3D 뷰어 재생 버튼
      const minimap3dBtn = target.closest('#inspector-btn-3d') as HTMLElement | null;
      if (minimap3dBtn) {
        if (this.currentInspectorRecord && this.callbacks.onPlayReplay) {
          const rec = this.currentInspectorRecord;
          this.closeEntireModal();
          this.callbacks.onPlayReplay(rec);
        }
      }
    });

    // 미니맵 스크러버 입력 처리
    this.inspectorCard?.addEventListener('input', (e) => {
      const target = e.target as HTMLElement;
      if (target.id === 'inspector-scrubber') {
        const scrubber = target as HTMLInputElement;
        const progress = parseFloat(scrubber.value) / 1000;
        this.minimapPlayer.seekProgress(progress);
      }
    });

    this.inspectorCard?.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).id === 'inspector-scrubber') {
        this.minimapPlayer.setScrubbing(true);
      }
    });

    window.addEventListener('mouseup', () => {
      this.minimapPlayer.setScrubbing(false);
    });

    // 마우스 휠 이벤트 위임: 우측 미니맵 영역 위에서 휠을 굴려도 좌측 메타데이터 목록이 스크롤되도록 지원
    this.inspectorCard?.addEventListener('wheel', (e) => {
      const metaCol = this.inspectorContentBody?.querySelector('.inspector-meta-col') as HTMLElement | null;
      if (metaCol && !metaCol.contains(e.target as Node)) {
        metaCol.scrollTop += e.deltaY;
      }
    }, { passive: true });
  }

  public open(): void {
    this.closeInspector();
    this.showModal();
    this.loadAndRender();
  }

  /**
   * ESC 키 또는 닫기 요청 시:
   * - 인스펙터가 열려있으면 목록으로 먼저 복귀
   * - 목록 화면이면 모달 전체를 닫음
   */
  public override close(): void {
    if (this.isInspectorViewOpen) {
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
    this.minimapPlayer.stop();
    super.close();
  }

  /**
   * 행 클릭 시 전적 리더보드와 동일한 크기로 인스펙터 풀-커버 팝업을 열음
   */
  public openInspector(matchCode: string): void {
    const rec = this.allRecords.find(r => r.matchCode === matchCode);
    if (!rec || !this.inspectorCard || !this.mainCard || !this.inspectorContentBody) return;

    this.currentInspectorRecord = rec;
    this.isInspectorViewOpen = true;

    // 메인 카드 숨기고 인스펙터 카드 표시
    this.mainCard.style.display = 'none';
    this.inspectorCard.style.display = 'flex';

    // 본문 내용 렌더링
    this.inspectorContentBody.innerHTML = this.buildInspectorContentHtml(rec);

    // 2D 미니맵 플레이어 연결 및 첫 프레임 렌더링
    this.minimapPlayer.attach(this.inspectorContentBody, rec);
  }

  /**
   * 인스펙터를 닫고 메인 리더보드 목록 화면으로 복귀
   */
  public closeInspector(): void {
    this.minimapPlayer.stop();
    this.isInspectorViewOpen = false;
    this.currentInspectorRecord = null;

    if (this.inspectorCard) this.inspectorCard.style.display = 'none';
    if (this.mainCard) this.mainCard.style.display = 'flex';
  }

  /**
   * IndexedDB에서 최대 100개 리플레이 조회 및 통계/테이블 일괄 갱신
   * - 3랩 미만인 구버전 리플레이 탐색 시 자동 삭제 및 필터링하여 온전한 3랩 데이터만 표시
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

      // 3랩 데이터가 40개 미만인 경우(초기화 또는 구버전 정리 후 등) 자동으로 최신 시드 데이터 즉시 일괄 동기화
      if (validRecords.length < 40) {
        await initSeedReplays(true);
        const refreshed = await appDB.listReplays();
        this.allRecords = refreshed.filter(r => {
          const lastTick = r.ticks?.[r.ticks.length - 1];
          return (r.metadata?.totalLaps || 1) >= 3 && (lastTick?.lap || 1) >= 3 && (lastTick?.timeMs || 0) >= 45000;
        });
      } else {
        this.allRecords = validRecords;
      }
    } catch (e) {
      console.warn('[MatchHistoryModal] Failed to load replays:', e);
      this.allRecords = [];
    }

    this.currentPage = 1;
    this.updateStats();
    this.renderTable();
  }

  /**
   * 상단 통계 카드 수치 업데이트
   */
  private updateStats(): void {
    const total = this.allRecords.length;

    if (this.statTotal) {
      this.statTotal.textContent = total.toLocaleString();
    }

    // 최고 랩타임 탐색
    if (this.statBest) {
      let minBestMs = Infinity;
      let bestDriver = '';
      for (const r of this.allRecords) {
        const ms = r.metadata?.bestLapMs;
        if (typeof ms === 'number' && ms > 0 && ms < minBestMs) {
          minBestMs = ms;
          bestDriver = r.metadata?.driverName || '';
        }
      }

      if (minBestMs !== Infinity) {
        this.statBest.innerHTML = `${this.formatTime(minBestMs)} <span class="metric-unit">${this.escapeHtml(bestDriver)}</span>`;
      } else {
        this.statBest.innerHTML = `--:--.---`;
      }
    }

    // 최고속 탐색
    if (this.statSpeed) {
      let maxSpeed = 0;
      for (const r of this.allRecords) {
        const spd = r.metadata?.topSpeedKmh;
        if (typeof spd === 'number' && spd > maxSpeed) {
          maxSpeed = spd;
        }
      }
      this.statSpeed.textContent = maxSpeed > 0 ? maxSpeed.toFixed(1) : '0.0';
    }
  }

  /**
   * 필터 및 정렬 조건에 따른 리플레이 목록 렌더링
   * - 검색 시 기존 정렬 순위(rankNum) 보존
   */
  private renderTable(): void {
    if (!this.tableTbody) return;

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
      baseList.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
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
        const driverName = (rec.metadata?.driverName || (rec.metadata as any)?.userNickname || '').toLowerCase();
        const code = (rec.matchCode || '').toLowerCase();
        const circuitTitle = (CIRCUIT_DEFINITIONS[recCircuitId]?.title || '').toLowerCase();
        return driverName.includes(this.searchQuery) || code.includes(this.searchQuery) || circuitTitle.includes(this.searchQuery);
      });
    }

    // 5. 빈 상태 UI
    if (filtered.length === 0) {
      if (this.paginationContainer) this.paginationContainer.innerHTML = "";
      this.tableTbody.innerHTML = `
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
    this.tableTbody.innerHTML = pageItems.map(({ rec, rankNum }) => {
      const meta = rec.metadata;
      // 순위 표시: 1~3등은 메달 이모티콘만 사용, 4등 이상은 000 (3자리 패딩) 고정 표시
      let rankBadgeHtml = `<span class="rank-badge">${rankNum.toString().padStart(3, '0')}</span>`;
      let rankRowClass = '';

      if (this.sortMode === 'best_lap' && rankNum <= 3) {
        const medal = rankNum === 1 ? '🥇' : (rankNum === 2 ? '🥈' : '🥉');
        rankBadgeHtml = `<span class="rank-badge rank-badge-${rankNum} medal-only" title="${rankNum}위">${medal}</span>`;
        rankRowClass = `rank-row-top rank-${rankNum}`;
      }

      const driverName = this.escapeHtml(meta?.driverName || (meta as any)?.userNickname || 'Driver');
      const vehicleBadge = this.getVehicleBadge(meta?.vehicleModelId || (meta as any)?.vehicleId || 'gt_turbo');
      const recCircuitId = meta?.circuitId || 'circuit_monaco';
      const circuitTitle = this.getCircuitTitle(recCircuitId);
      const lapTime = meta?.bestLapMs ? this.formatTime(meta.bestLapMs) : '--:--.---';
      const topSpeed = meta?.topSpeedKmh ? `${meta.topSpeedKmh.toFixed(1)} km/h` : '--.- km/h';
      const dateStr = this.formatDate(rec.savedAt || rec.createdAt);

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
   * 인스펙터 풀-커버 카드 내부 본문 HTML 생성
   */
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

  private buildInspectorContentHtml(rec: CachedReplayRecord): string {
    const meta = rec.metadata;
    const driverName = this.escapeHtml(meta?.driverName || 'Driver');
    const recCircuitId = meta?.circuitId || 'circuit_monaco';
    const circuitTitle = this.getCircuitTitle(recCircuitId);
    const vehicleName = this.getVehicleName(meta?.vehicleModelId || 'gt_turbo');
    const isFirstPerson = meta?.viewMode === 'FIRST_PERSON';
    const playerColor = meta?.color || '#38bdf8';
    const bestLapStr = meta?.bestLapMs ? this.formatTime(meta.bestLapMs) : '--:--.---';
    const totalRaceStr = meta?.totalTimeMs ? this.formatTime(meta.totalTimeMs) : '--:--.---';
    const topSpeedStr = meta?.topSpeedKmh ? `${meta.topSpeedKmh.toFixed(1)} km/h` : '--.- km/h';
    const avgSpeedStr = meta?.avgSpeedKmh ? `${meta.avgSpeedKmh.toFixed(1)} km/h` : '--.- km/h';

    // 베스트 랩 번호 (1, 2, 3...) 및 랩별 전체 섹터 기록 생성 (3 LAP × 3 SECTOR = 9행)
    const bestLapNum = meta?.bestLapNum || (meta?.lapTimesMs && meta?.bestLapMs ? (meta.lapTimesMs.indexOf(meta.bestLapMs) + 1 || 1) : 1);

    const allSectors = meta?.sectorTimesMs && meta.sectorTimesMs.length >= 3
      ? meta.sectorTimesMs
      : [
          meta?.sectorTimesMs?.[0] || [8200, 8400, 8200],
          meta?.sectorTimesMs?.[1] || [8100, 8300, 8400],
          meta?.sectorTimesMs?.[2] || [8300, 8500, 8300],
        ];

    let sectorRowsHtml = "";
    for (let l = 0; l < 3; l++) {
      const lapNum = l + 1;
      const currentLapSectors = allSectors[l] || [0, 0, 0];
      const prevLapSectors = l > 0 ? (allSectors[l - 1] || [0, 0, 0]) : null;

      for (let s = 0; s < 3; s++) {
        const secNum = s + 1;
        const curMs = currentLapSectors[s] || 0;
        const timeStr = curMs > 0 ? this.formatTime(curMs) : "--:--.---";

        let deltaHtml = '<span class="sector-delta-val delta-even text-right">-</span>';
        if (prevLapSectors && curMs > 0 && prevLapSectors[s] > 0) {
          const diffMs = curMs - prevLapSectors[s];
          if (diffMs < 0) {
            deltaHtml = `<span class="sector-delta-val delta-faster text-right">-${(Math.abs(diffMs) / 1000).toFixed(3)}s</span>`;
          } else if (diffMs > 0) {
            deltaHtml = `<span class="sector-delta-val delta-slower text-right">+${(diffMs / 1000).toFixed(3)}s</span>`;
          } else {
            deltaHtml = `<span class="sector-delta-val delta-even text-right">0.000s</span>`;
          }
        }

        const isLapFirst = (s === 0 && l > 0);
        sectorRowsHtml += `
          ${isLapFirst ? '<div class="sector-lap-divider"></div>' : ''}
          <div class="sector-grid-row">
            <span class="sector-tag s${secNum}">LAP ${lapNum} · SEC ${secNum}</span>
            <span class="sector-time-val text-right">${timeStr}</span>
            ${deltaHtml}
          </div>
        `;
      }
    }

    // 1~4위 순위표
    let raceResultsHtml = '';
    if (meta?.raceResults && meta.raceResults.length > 0) {
      raceResultsHtml = meta.raceResults.map(r => `
        <div class="rank-finish-row ${r.isPlayer ? 'player-row' : ''}">
          <div class="rank-badge-wrap">
            <span class="rank-pos-badge ${r.rank === 1 ? 'gold' : r.rank === 2 ? 'silver' : r.rank === 3 ? 'bronze' : 'fourth'}">
              ${r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : ''} P${r.rank}
            </span>
          </div>
          <span class="rank-driver-name ${r.isPlayer ? 'player-driver' : ''}">
            ${this.escapeHtml(r.driverName)}${r.isPlayer ? ' <span class="you-pill">YOU</span>' : ''}
          </span>
          <span class="rank-time-val">${r.timeFormatted}</span>
        </div>
      `).join('');
    } else {
      raceResultsHtml = `
        <div class="rank-finish-row player-row">
          <div class="rank-badge-wrap">
            <span class="rank-pos-badge gold">🥇 P1</span>
          </div>
          <span class="rank-driver-name player-driver">
            ${driverName} <span class="you-pill">YOU</span>
          </span>
          <span class="rank-time-val">${bestLapStr}</span>
        </div>
      `;
    }

    const totalDurationStr = rec.ticks.length > 0 ? this.formatTime(rec.ticks[rec.ticks.length - 1].timeMs) : '--:--.---';

    return `
      <div class="inspector-layout-grid">
        <!-- 좌측: 메타데이터 컬럼 -->
        <div class="inspector-meta-col">
          <!-- 1~3행: 드라이버 Parent Grouping (총 6개의 카드) -->
          <div class="detail-floating-group driver-parent-group">
            <span class="floating-group-title">🪛 드라이버: <strong class="driver-name-highlight">${driverName}</strong></span>
            <div class="detail-meta-grid-2col">
              <!-- 1행: 머신, 서킷 -->
              <div class="detail-floating-card">
                <span class="floating-card-label">머신</span>
                <span class="floating-card-value">${vehicleName}</span>
              </div>
              <div class="detail-floating-card">
                <span class="floating-card-label">서킷</span>
                <span class="floating-card-value circuit-name-val">${this.formatCircuitTitle(circuitTitle)}</span>
              </div>
              <!-- 2행: 베스트 랩타임, 총 레이스 시간 -->
              <div class="detail-floating-card">
                <span class="floating-card-label">베스트 랩타임</span>
                <span class="floating-card-value text-accent-gold">${bestLapStr} <span class="best-lap-num-badge">LAP ${bestLapNum}</span></span>
              </div>
              <div class="detail-floating-card">
                <span class="floating-card-label">총 레이스 시간</span>
                <span class="floating-card-value">${totalRaceStr}</span>
              </div>
              <!-- 3행: 최고속도, 평균속도 -->
              <div class="detail-floating-card">
                <span class="floating-card-label">최고속도</span>
                <span class="floating-card-value">${topSpeedStr}</span>
              </div>
              <div class="detail-floating-card">
                <span class="floating-card-label">평균속도</span>
                <span class="floating-card-value">${avgSpeedStr}</span>
              </div>
            </div>
          </div>

          <!-- 4행: 랩별 섹터 기록 (3 LAP × 3 SECTOR = 9구간) -->
          <div class="detail-floating-group">
            <span class="floating-group-title">⏱ 랩별 섹터 기록</span>
            <div class="sector-record-grid">
              <div class="sector-grid-header">
                <span>구간 (LAP/SEC)</span>
                <span class="text-right">시간</span>
                <span class="text-right">이전 랩 대비</span>
              </div>
              ${sectorRowsHtml}
            </div>
          </div>

          <!-- 5행: 레이스 완주 순위 -->
          <div class="detail-floating-group">
            <span class="floating-group-title">🏆 레이스 완주 순위</span>
            <div class="rank-finish-list">
              ${raceResultsHtml}
            </div>
          </div>

          <!-- 6행: 텔레메트리 리플레이 데이터 정보 -->
          <div class="detail-floating-group">
            <span class="floating-group-title">📊 텔레메트리 & 리플레이 데이터 정보</span>
            <div class="inspector-tech-col-list">
              <div class="tech-row-item">
                <span class="tech-k">샘플링 레이트</span>
                <span class="tech-v">10Hz / Catmull-Rom 3차 보간</span>
              </div>
              <div class="tech-row-item">
                <span class="tech-k">기록 프레임 수</span>
                <span class="tech-v">${rec.ticks.length.toLocaleString()} 틱</span>
              </div>
              <div class="tech-row-item">
                <span class="tech-k">데이터 압축률</span>
                <span class="tech-v text-cyan">95.5% (고정소수점 패킷)</span>
              </div>
              <div class="tech-row-item">
                <span class="tech-k">저장 일시</span>
                <span class="tech-v">${this.formatDate(rec.savedAt || rec.createdAt)}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 우측: 2D 미니맵 컬럼 (우측 가운데 Floating Group) -->
        <div class="inspector-minimap-col detail-floating-group minimap-floating-card">
          <span class="floating-group-title minimap-floating-label">📡 2D 미니맵 레이스 궤적</span>
          <span class="floating-group-title minimap-floating-time" id="inspector-time-display">00:00.000 / ${totalDurationStr}</span>

          <div class="inspector-canvas-wrapper">
            <canvas id="inspector-minimap-canvas" width="440" height="260"></canvas>
          </div>

          <div class="minimap-controls">
            <button type="button" class="minimap-play-btn" id="inspector-btn-play" title="재생 / 일시정지">▶</button>
            <input type="range" class="minimap-scrubber" id="inspector-scrubber" min="0" max="1000" value="0">
            <button type="button" class="inspector-speed-badge" id="inspector-btn-speed" title="재생 배속 변경 (1.0x -> 2.0x -> 4.0x)">${this.minimapPlayer.getSpeed().toFixed(1)}x</button>
          </div>

          <div class="inspector-telemetry-strip">
            <div style="display: flex; gap: 12px; align-items: center;">
              <span style="display: flex; align-items: center; gap: 5px;">
                <span style="display: inline-block; width: 8px; height: 8px; background: ${playerColor}; border: 1px solid #fff; border-radius: 1px;"></span>
                <span style="color: #fff; font-weight: 700;">YOU</span>
              </span>
              <span style="display: flex; align-items: center; gap: 5px;">
                <span style="display: inline-block; width: 8px; height: 8px; background: #f59e0b; border-radius: 1px;"></span>
                <span>AI 3 CARS</span>
              </span>
            </div>
            <div id="inspector-telemetry-info" style="color: #38bdf8; font-weight: 700;">
              0 km/h | LAP 1 / ${meta?.totalLaps || 3}
            </div>
          </div>

          <button type="button" class="minimap-3d-btn inspector-3d-action-btn" id="inspector-btn-3d" data-match="${rec.matchCode}">
            ▶ 3D 뷰어로 전체 리플레이 재생
          </button>
        </div>
      </div>
    `;
  }

  private getVehicleBadge(vehicleModelId: string): string {
    if (vehicleModelId === 'formula_aero') {
      return `<span class="vehicle-badge formula">Formula Aero</span>`;
    } else if (vehicleModelId === 'cyber_speedster') {
      return `<span class="vehicle-badge cyber">Cyber Speedster</span>`;
    } else if (vehicleModelId === 'lm_hypercar') {
      return `<span class="vehicle-badge hyper">Apex Hypercar</span>`;
    }
    return `<span class="vehicle-badge gt">GT-86 Turbo</span>`;
  }

  private getVehicleName(vehicleModelId: string): string {
    if (vehicleModelId === 'formula_aero') return 'Formula Aero';
    if (vehicleModelId === 'cyber_speedster') return 'Cyber Speedster';
    if (vehicleModelId === 'lm_hypercar') return 'Apex Hypercar';
    return 'GT-86 Turbo';
  }

  private formatCircuitTitle(title: string): string {
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

  private getCircuitTitle(circuitId: CircuitId): string {
    const meta = CIRCUIT_DEFINITIONS[circuitId];
    if (meta?.title) return meta.title;
    if (circuitId === 'circuit_monaco') return 'Monaco GP';
    if (circuitId === 'circuit_monza') return 'Monza GP';
    if (circuitId === 'circuit_spa') return 'Spa-Francorchamps';
    if (circuitId === 'circuit_silverstone') return 'Silverstone';
    return circuitId;
  }

  private formatTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
    const s = (totalSec % 60).toString().padStart(2, '0');
    const msec = Math.floor(ms % 1000).toString().padStart(3, '0');
    return `${m}:${s}.${msec}`;
  }

  private formatDate(timestamp: number | string): string {
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

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}