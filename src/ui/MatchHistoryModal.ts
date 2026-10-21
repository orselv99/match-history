import { BaseModal } from './BaseModal.ts';
import { appDB } from '../storage/AppDatabase.ts';
import { initSeedReplays } from '../storage/ReplaySeedService.ts';
import type { CachedReplayRecord } from '../storage/schema.ts';
import { CIRCUIT_DEFINITIONS, type CircuitId } from '../data/circuits.ts';
import { showToast } from './Toast.ts';
import { MinimapReplayPlayer } from './MinimapReplayPlayer.ts';
import { MatchHistoryTable } from './MatchHistoryTable.ts';

export interface MatchHistoryModalCallbacks {
  onPlayReplay?: (record: CachedReplayRecord) => void;
}

/**
 * 로컬 IndexedDB에 저장된 주행 리플레이 목록 및 전적 컨트롤러
 * - 상단 요약 통계(총 경기 수, 최고 랩타임, 최고속도)
 * - 테이블 렌더링 및 페이지네이션을 MatchHistoryTable 컴포넌트로 위임
 * - 2D 트랙 미니맵 렌더링을 MinimapReplayPlayer 컴포넌트로 위임
 * - 풀-커버 인스펙터 상세 분석 팝업 관리
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
  private paginationContainer: HTMLElement | null = null;

  private allRecords: CachedReplayRecord[] = [];

  // 분리된 전담 하위 컴포넌트
  public isInspectorViewOpen: boolean = false;
  private currentInspectorRecord: CachedReplayRecord | null = null;
  private minimapPlayer: MinimapReplayPlayer = new MinimapReplayPlayer();
  private table: MatchHistoryTable;

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

    // MatchHistoryTable 인스턴스 초기화
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
        const circuit = btn.getAttribute('data-circuit') || 'all';
        this.table.setCircuitFilter(circuit);
        this.table.render();
      });
    });

    // 4. 드라이버 및 매치코드 검색
    const executeSearch = () => {
      const query = this.searchInput?.value || '';
      this.table.setSearchQuery(query);
      this.table.render();
    };

    this.btnSearch?.addEventListener('click', executeSearch);
    this.searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') executeSearch();
    });

    // 5. 정렬 셀렉트 변경
    this.sortSelect?.addEventListener('change', () => {
      const mode = (this.sortSelect?.value as any) || 'best_lap';
      this.table.setSortMode(mode);
      this.table.render();
    });

    // 6. 인스펙터 내부 클릭 & 스크러버 이벤트 위임
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
    super.show();
    this.closeInspector();
    this.loadAndRender();
  }

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

      this.updateHeaderStats();
      this.table.setRecords(this.allRecords);
      this.table.render();
    } catch (e) {
      console.warn('[MatchHistoryModal] loadAndRender failed:', e);
    }
  }

  /**
   * 상단 요약 카드(총 경기 수, 최고 랩타임, 최고속도) 통계 갱신
   */
  private updateHeaderStats(): void {
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
        this.statBest.innerHTML = `${this.table.formatTime(minBestMs)} <span class="metric-unit">${this.table.escapeHtml(bestDriver)}</span>`;
      } else {
        this.statBest.innerHTML = `--:--.---`;
      }
    }

    // 최고속 탐색 (topSpeedKmh / maxSpeedKmh 호환)
    if (this.statSpeed) {
      let maxSpeed = 0;
      for (const r of this.allRecords) {
        const spd = r.metadata?.topSpeedKmh ?? (r.metadata as any)?.maxSpeedKmh;
        if (typeof spd === 'number' && spd > maxSpeed) {
          maxSpeed = spd;
        }
      }
      this.statSpeed.textContent = maxSpeed > 0 ? maxSpeed.toFixed(1) : '0.0';
    }
  }

  /**
   * 인스펙터 풀-커버 카드 내부 본문 HTML 생성
   */
  private buildInspectorContentHtml(rec: CachedReplayRecord): string {
    const meta = rec.metadata;
    const driverName = this.table.escapeHtml(meta?.driverName || (meta as any)?.userNickname || 'Driver');
    const recCircuitId = meta?.circuitId || 'circuit_monaco';
    const circuitTitle = this.table.getCircuitTitle(recCircuitId);
    const vehicleName = this.table.getVehicleName(meta?.vehicleModelId || 'gt_turbo');
    const isFirstPerson = meta?.viewMode === 'FIRST_PERSON';
    const playerColor = meta?.color || '#38bdf8';
    const bestLapStr = meta?.bestLapMs ? this.table.formatTime(meta.bestLapMs) : '--:--.---';
    const totalRaceStr = meta?.totalTimeMs ? this.table.formatTime(meta.totalTimeMs) : '--:--.---';
    const spd = meta?.topSpeedKmh ?? (meta as any)?.maxSpeedKmh;
    const topSpeedStr = spd ? `${spd.toFixed(1)} km/h` : '--.- km/h';
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
        const timeStr = curMs > 0 ? this.table.formatTime(curMs) : "--:--.---";

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

    // 1~4위 완주 순위표 (raceResults 또는 opponents 종합)
    let results: any[] = (meta?.raceResults && meta.raceResults.length > 1) ? meta.raceResults : [];
    if (results.length === 0 && (meta as any)?.opponents && (meta as any).opponents.length > 0) {
      const pTimeMs = meta?.totalTimeMs || 0;
      results = [
        {
          rank: (meta as any)?.rank || 1,
          driverName: meta?.driverName || driverName,
          timeMs: pTimeMs,
          timeFormatted: (meta as any).totalTimeFormatted || bestLapStr,
          isPlayer: true,
          color: meta?.color || '#38bdf8',
        },
        ...(meta as any).opponents.map((opp: any) => ({
          rank: 1,
          driverName: opp.driverName,
          timeMs: opp.totalTimeMs || 0,
          timeFormatted: opp.totalTimeFormatted || '--:--.---',
          isPlayer: false,
          color: opp.color,
        }))
      ].sort((a, b) => a.timeMs - b.timeMs).map((item, idx) => ({ ...item, rank: idx + 1 }));
    }

    let raceResultsHtml = '';
    if (results.length > 0) {
      raceResultsHtml = results.map((r: any) => `
        <div class="rank-finish-row ${r.isPlayer ? 'player-row' : ''}">
          <div class="rank-badge-wrap">
            <span class="rank-pos-badge ${r.rank === 1 ? 'gold' : r.rank === 2 ? 'silver' : r.rank === 3 ? 'bronze' : 'fourth'}">
              ${r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : ''} P${r.rank}
            </span>
          </div>
          <span class="rank-driver-name ${r.isPlayer ? 'player-driver' : ''}">
            ${this.table.escapeHtml(r.driverName)}${r.isPlayer ? ' <span class="you-pill">YOU</span>' : ''}
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

    const totalDurationStr = rec.ticks.length > 0 ? this.table.formatTime(rec.ticks[rec.ticks.length - 1].timeMs) : '--:--.---';

    return `
      <div class="inspector-layout-grid">
        <!-- 좌측: 메타데이터 컬럼 -->
        <div class="inspector-meta-col">
          <!-- 1행: 드라이버 프로필 & 경기 식별자 -->
          <div class="detail-floating-group">
            <span class="floating-group-title">👤 드라이버 & 경기 정보</span>
            <div class="detail-floating-grid col-3">
              <div class="detail-floating-card">
                <span class="floating-card-label">드라이버</span>
                <span class="floating-card-value text-cyan">${driverName}</span>
              </div>
              <div class="detail-floating-card">
                <span class="floating-card-label">경기 코드</span>
                <span class="floating-card-value text-accent font-mono">${rec.matchCode}</span>
              </div>
              <div class="detail-floating-card">
                <span class="floating-card-label">시점 모드</span>
                <span class="floating-card-value text-white">${isFirstPerson ? '1인칭 (FPV)' : '3인칭 (TPV)'}</span>
              </div>
            </div>
          </div>

          <!-- 2행: 머신 스펙 & 서킷 위치 -->
          <div class="detail-floating-group">
            <span class="floating-group-title">🏎️ 머신 & 서킷 환경</span>
            <div class="detail-floating-grid col-2">
              <div class="detail-floating-card">
                <span class="floating-card-label">탑승 머신</span>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="display: inline-block; width: 10px; height: 10px; background: ${playerColor}; border: 1px solid rgba(255,255,255,0.4); border-radius: 1px;"></span>
                  <span class="floating-card-value text-white">${vehicleName}</span>
                </div>
              </div>
              <div class="detail-floating-card">
                <span class="floating-card-label">개최 서킷</span>
                <span class="floating-card-value text-gold">${circuitTitle}</span>
              </div>
            </div>
          </div>

          <!-- 3행: 최고 랩타임 & 총 레이스 시간 -->
          <div class="detail-floating-group">
            <span class="floating-group-title">⏱️ 랩타임 & 레이스 기록</span>
            <div class="detail-floating-grid col-2">
              <div class="detail-floating-card highlight-card">
                <span class="floating-card-label">🏆 BEST LAP (LAP ${bestLapNum})</span>
                <span class="floating-card-value text-gold font-mono" style="font-size: 16px;">${bestLapStr}</span>
              </div>
              <div class="detail-floating-card">
                <span class="floating-card-label">총 레이스 시간</span>
                <span class="floating-card-value text-white font-mono" style="font-size: 16px;">${totalRaceStr}</span>
              </div>
            </div>
          </div>

          <!-- 4행: 최고속도, 평균속도 -->
          <div class="detail-floating-group">
            <span class="floating-group-title">⚡ 텔레메트리 속도 통계</span>
            <div class="detail-floating-grid col-2">
              <div class="detail-floating-card">
                <span class="floating-card-label">최고속도</span>
                <span class="floating-card-value text-cyan font-mono" style="font-size: 16px;">${topSpeedStr}</span>
              </div>
              <div class="detail-floating-card">
                <span class="floating-card-label">평균속도</span>
                <span class="floating-card-value text-white font-mono" style="font-size: 16px;">${avgSpeedStr}</span>
              </div>
            </div>
          </div>

          <!-- 5행: 3 랩 × 3 섹터 (총 9행 정밀 분석) -->
          <div class="detail-floating-group">
            <span class="floating-group-title">📊 랩별 섹터(Sector) 세부 타임 스탬프</span>
            <div class="sector-grid-table">
              <div class="sector-grid-header">
                <span>섹터</span>
                <span class="text-right">기록</span>
                <span class="text-right">직전랩 대비</span>
              </div>
              ${sectorRowsHtml}
            </div>
          </div>

          <!-- 6행: 레이스 완주 순위 (1~4위) -->
          <div class="detail-floating-group">
            <span class="floating-group-title">🏁 레이스 완주 순위</span>
            <div class="rank-finish-list">
              ${raceResultsHtml}
            </div>
          </div>

          <!-- 7행: 텔레메트리 레코드 정보 -->
          <div class="detail-floating-group">
            <span class="floating-group-title">💾 텔레메트리 레코드 사양</span>
            <div class="tech-spec-grid">
              <div class="tech-row-item">
                <span class="tech-k">샘플링 레이트</span>
                <span class="tech-v text-white">15 Hz (66.6ms)</span>
              </div>
              <div class="tech-row-item">
                <span class="tech-k">저장 틱 수</span>
                <span class="tech-v font-mono text-cyan">${rec.ticks.length.toLocaleString()} Ticks</span>
              </div>
              <div class="tech-row-item">
                <span class="tech-k">압축 방식</span>
                <span class="tech-v text-cyan">95.5% (양자화 트랙)</span>
              </div>
              <div class="tech-row-item">
                <span class="tech-k">저장 일시</span>
                <span class="tech-v">${this.table.formatDate(rec.savedAt || rec.createdAt)}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 우측: 2D 미니맵 플레이어 -->
        <div class="inspector-minimap-col detail-floating-group minimap-floating-card">
          <span class="floating-group-title minimap-floating-label">🛰️ 2D 미니맵 레이스 뷰</span>
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
}
