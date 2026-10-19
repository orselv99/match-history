import * as THREE from 'three';
import { BaseModal } from './BaseModal.ts';
import { appDB } from '../storage/AppDatabase.ts';
import type { CachedReplayRecord } from '../storage/schema.ts';
import { CIRCUIT_DEFINITIONS, type CircuitId } from '../data/circuits.ts';
import { showToast } from './Toast.ts';

export interface MatchHistoryModalCallbacks {
  onPlayReplay?: (record: CachedReplayRecord) => void;
}

interface CachedCircuit2D {
  points: Array<{ x: number; z: number }>;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * 로컬 IndexedDB에 저장된 최대 100개 주행 리플레이 목록 및 전적 컨트롤러
 * - 서킷별/시점별 필터링 및 검색어(드라이버/코드) 지원 (검색 시 기존 순위 유지)
 * - 테이블 행 클릭 시 메타데이터 상세 분석 & 2D 미니맵 궤적 리플레이 분할 뷰
 */
export class MatchHistoryModal extends BaseModal {
  private btnClose: HTMLElement | null;
  private btnCloseBottom: HTMLElement | null;
  private tabBtns: NodeListOf<HTMLElement>;
  private searchInput: HTMLInputElement | null;
  private btnSearch: HTMLElement | null;
  private btnRefresh: HTMLElement | null;
  private sortSelect: HTMLSelectElement | null;
  private viewSelect: HTMLSelectElement | null;
  private tableTbody: HTMLElement | null;

  private statTotal: HTMLElement | null;
  private statBest: HTMLElement | null;
  private statSpeed: HTMLElement | null;
  private statCount: HTMLElement | null;

  private allRecords: CachedReplayRecord[] = [];
  private currentCircuitFilter: string = 'all';
  private searchQuery: string = '';
  private sortMode: 'best_lap' | 'recent' | 'top_speed' = 'best_lap';
  private viewModeFilter: 'all' | 'FIRST_PERSON' | 'THIRD_PERSON' = 'all';

  // 2D 미니맵 리플레이 및 행 선택 상태
  private selectedMatchCode: string | null = null;
  private minimapAnimId: number | null = null;
  private minimapRecord: CachedReplayRecord | null = null;
  private minimapCurrentTimeMs: number = 0;
  private minimapIsPlaying: boolean = true;
  private minimapLastTimestamp: number = 0;
  private isScrubbing: boolean = false;
  private circuit2DCache = new Map<string, CachedCircuit2D>();

  private callbacks: MatchHistoryModalCallbacks;

  constructor(callbacks: MatchHistoryModalCallbacks = {}) {
    super('match-history-modal');
    this.callbacks = callbacks;

    this.btnClose = document.getElementById('history-btn-close');
    this.btnCloseBottom = document.getElementById('history-btn-close-bottom');
    this.tabBtns = document.querySelectorAll<HTMLElement>('.history-tab-btn');
    this.searchInput = document.getElementById('history-search-driver') as HTMLInputElement | null;
    this.btnSearch = document.getElementById('history-btn-search');
    this.btnRefresh = document.getElementById('history-btn-refresh');
    this.sortSelect = document.getElementById('history-sort-select') as HTMLSelectElement | null;
    this.viewSelect = document.getElementById('history-view-select') as HTMLSelectElement | null;
    this.tableTbody = document.getElementById('history-table-tbody');

    this.statTotal = document.getElementById('history-stat-total');
    this.statBest = document.getElementById('history-stat-best');
    this.statSpeed = document.getElementById('history-stat-speed');
    this.statCount = document.getElementById('history-stat-count');

    this.bindEvents();
  }

  private bindEvents(): void {
    const close = () => this.close();
    this.btnClose?.addEventListener('click', close);
    this.btnCloseBottom?.addEventListener('click', close);

    // 서킷 탭 필터링
    this.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentCircuitFilter = btn.getAttribute('data-circuit') || 'all';
        this.renderTable();
      });
    });

    // 드라이버 및 매치코드 검색
    const executeSearch = () => {
      this.searchQuery = this.searchInput?.value.trim().toLowerCase() || '';
      this.renderTable();
    };

    this.btnSearch?.addEventListener('click', executeSearch);
    this.searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') executeSearch();
    });

    // 정렬 셀렉트 변경
    this.sortSelect?.addEventListener('change', () => {
      this.sortMode = (this.sortSelect?.value as any) || 'best_lap';
      this.renderTable();
    });

    // 1P/3P 시점 필터 셀렉트 변경
    this.viewSelect?.addEventListener('change', () => {
      this.viewModeFilter = (this.viewSelect?.value as any) || 'all';
      this.renderTable();
    });

    // 새로고침 버튼
    this.btnRefresh?.addEventListener('click', async () => {
      if (this.searchInput) this.searchInput.value = '';
      this.searchQuery = '';
      await this.loadAndRender();
      showToast('🔄 리플레이 목록을 갱신했습니다.');
    });

    // 테이블 내 클릭 이벤트 위임
    this.tableTbody?.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;

      // 1. 다시보기 재생 버튼 (3D 뷰어 진입)
      const replayBtn = target.closest('.history-replay-btn') as HTMLElement | null;
      if (replayBtn) {
        const matchCode = replayBtn.getAttribute('data-match');
        const record = this.allRecords.find(r => r.matchCode === matchCode);
        if (record && this.callbacks.onPlayReplay) {
          this.close();
          this.callbacks.onPlayReplay(record);
        }
        return;
      }

      // 2. 2D 미니맵 패널 내 3D 뷰어 버튼
      const minimap3dBtn = target.closest('.minimap-3d-btn') as HTMLElement | null;
      if (minimap3dBtn) {
        const matchCode = minimap3dBtn.getAttribute('data-match') || this.selectedMatchCode;
        const record = this.allRecords.find(r => r.matchCode === matchCode);
        if (record && this.callbacks.onPlayReplay) {
          this.close();
          this.callbacks.onPlayReplay(record);
        }
        return;
      }

      // 3. 2D 미니맵 재생/일시정지 토글 버튼
      const togglePlayBtn = target.closest('#minimap-btn-toggle') as HTMLElement | null;
      if (togglePlayBtn) {
        this.minimapIsPlaying = !this.minimapIsPlaying;
        togglePlayBtn.textContent = this.minimapIsPlaying ? '⏸' : '▶';
        this.minimapLastTimestamp = performance.now();
        return;
      }

      // 4. 리플레이 삭제 버튼
      const deleteBtn = target.closest('.history-delete-btn') as HTMLElement | null;
      if (deleteBtn) {
        const matchCode = deleteBtn.getAttribute('data-match');
        if (matchCode) {
          if (this.selectedMatchCode === matchCode) {
            this.selectedMatchCode = null;
            this.stopMinimapPlayback();
          }
          await appDB.deleteReplay(matchCode);
          showToast(`🗑 리플레이 [${matchCode}] 기록이 삭제되었습니다.`);
          await this.loadAndRender();
        }
        return;
      }

      // 5. 상세 드로어 내부 클릭 시 닫히지 않도록 방지
      if (target.closest('.history-detail-row')) {
        return;
      }

      // 6. 데이터 행 클릭 시 상세 인스펙터 토글
      const dataRow = target.closest('.history-data-row') as HTMLElement | null;
      if (dataRow) {
        const matchCode = dataRow.getAttribute('data-match');
        if (matchCode) {
          if (this.selectedMatchCode === matchCode) {
            this.selectedMatchCode = null;
            this.stopMinimapPlayback();
          } else {
            this.selectedMatchCode = matchCode;
          }
          this.renderTable();
        }
      }
    });

    // 미니맵 스크러버 입력 처리
    this.tableTbody?.addEventListener('input', (e) => {
      const target = e.target as HTMLElement;
      if (target.id === 'minimap-scrubber') {
        const scrubber = target as HTMLInputElement;
        const progress = parseFloat(scrubber.value) / 1000;
        if (this.minimapRecord && this.minimapRecord.ticks.length > 0) {
          const totalDuration = this.minimapRecord.ticks[this.minimapRecord.ticks.length - 1].timeMs;
          this.minimapCurrentTimeMs = progress * totalDuration;
          this.drawMinimapFrame();
        }
      }
    });

    this.tableTbody?.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).id === 'minimap-scrubber') {
        this.isScrubbing = true;
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.isScrubbing) {
        this.isScrubbing = false;
        this.minimapLastTimestamp = performance.now();
      }
    });
  }

  public open(): void {
    this.showModal();
    this.loadAndRender();
  }

  public override close(): void {
    this.stopMinimapPlayback();
    super.close();
  }

  /**
   * IndexedDB에서 최대 100개 리플레이 조회 및 통계/테이블 일괄 갱신
   */
  public async loadAndRender(): Promise<void> {
    try {
      this.allRecords = await appDB.listReplays();
    } catch (e) {
      console.warn('[MatchHistoryModal] Failed to load replays:', e);
      this.allRecords = [];
    }

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
    if (this.statCount) {
      this.statCount.textContent = `(${total}/100)`;
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
   * - 선택된 행 하단에 메타데이터 및 2D 미니맵 인스펙터 렌더링
   */
  private renderTable(): void {
    if (!this.tableTbody) return;

    // 1. 서킷 및 시점 필터링
    const baseList = this.allRecords.filter(r => {
      const recCircuitId = r.metadata?.circuitId || 'circuit_monaco';
      if (this.currentCircuitFilter !== 'all' && recCircuitId !== this.currentCircuitFilter) {
        return false;
      }
      if (this.viewModeFilter !== 'all') {
        const itemMode = r.metadata?.viewMode || 'THIRD_PERSON';
        if (itemMode !== this.viewModeFilter) {
          return false;
        }
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
      this.stopMinimapPlayback();
      this.tableTbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 36px 16px; color: var(--text-muted); font-family: var(--font-mono); font-size: 12px;">
            <span style="font-size: 22px; display: block; margin-bottom: 8px;">🏁</span>
            일치하는 경기 리플레이가 없습니다.<br>
            <span style="font-size: 11px; opacity: 0.7;">경기를 완주한 후 결과 화면에서 [다시보기]를 누르면 로컬 IndexedDB에 최대 100개까지 자동 보관됩니다.</span>
          </td>
        </tr>
      `;
      return;
    }

    // 6. 테이블 행 생성
    const rowsHtml: string[] = [];

    for (const { rec, rankNum } of filtered) {
      const meta = rec.metadata;
      const isSelected = this.selectedMatchCode === rec.matchCode;

      let rankBadgeHtml = `<span class="rank-badge">${rankNum.toString().padStart(2, '0')}</span>`;
      let rankRowClass = '';

      if (this.sortMode === 'best_lap' && rankNum <= 3) {
        const medal = rankNum === 1 ? '🥇' : (rankNum === 2 ? '🥈' : '🥉');
        rankBadgeHtml = `<span class="rank-badge rank-badge-${rankNum}">${medal} ${rankNum.toString().padStart(2, '0')}</span>`;
        rankRowClass = `rank-row-top rank-${rankNum}`;
      }

      const driverName = this.escapeHtml(meta?.driverName || (meta as any)?.userNickname || 'Driver');
      const vehicleBadge = this.getVehicleBadge(meta?.vehicleModelId || (meta as any)?.vehicleId || 'gt_turbo');
      const isFirstPerson = meta?.viewMode === 'FIRST_PERSON';
      const viewBadge = `<span class="view-mode-badge ${isFirstPerson ? 'badge-1p' : 'badge-3p'}">${isFirstPerson ? '1P' : '3P'}</span>`;
      const recCircuitId = meta?.circuitId || 'circuit_monaco';
      const circuitTitle = this.getCircuitTitle(recCircuitId);
      const lapTime = meta?.bestLapMs ? this.formatTime(meta.bestLapMs) : '--:--.---';
      const topSpeed = meta?.topSpeedKmh ? `${meta.topSpeedKmh.toFixed(1)} km/h` : '--.- km/h';
      const dateStr = this.formatDate(rec.savedAt || rec.createdAt);

      // 메인 데이터 행
      rowsHtml.push(`
        <tr class="history-data-row ${rankRowClass} ${isSelected ? 'selected' : ''}" data-match="${rec.matchCode}" title="클릭하여 상세 기록 및 2D 미니맵 리플레이 확인">
          <td class="col-rank">${rankBadgeHtml}</td>
          <td class="col-driver"><strong class="driver-name-text">${driverName}</strong></td>
          <td class="col-vehicle"><div class="vehicle-view-col-wrap">${vehicleBadge}${viewBadge}</div></td>
          <td class="col-circuit">${circuitTitle}</td>
          <td class="col-lap"><span class="lap-highlight ${rankNum === 1 ? 'gold' : ''}">${lapTime}</span></td>
          <td class="col-speed">${topSpeed}</td>
          <td class="col-date">${dateStr}</td>
          <td class="col-action">
            <div class="history-action-group">
              <button type="button" class="history-replay-btn" data-match="${rec.matchCode}">▶ 다시보기</button>
              <button type="button" class="history-delete-btn" data-match="${rec.matchCode}" title="삭제">✕</button>
            </div>
          </td>
        </tr>
      `);

      // 선택된 행일 경우 하단 상세 인스펙터 삽입
      if (isSelected) {
        rowsHtml.push(this.renderDetailRow(rec));
      }
    }

    this.tableTbody.innerHTML = rowsHtml.join('');

    // 미니맵 재생 시작
    if (this.selectedMatchCode) {
      this.startMinimapPlayback();
    } else {
      this.stopMinimapPlayback();
    }
  }

  /**
   * 행 클릭 시 확장되는 상세 메타데이터 & 2D 미니맵 인스펙터 HTML 생성
   */
  private renderDetailRow(rec: CachedReplayRecord): string {
    const meta = rec.metadata;
    const driverName = this.escapeHtml(meta?.driverName || 'Driver');
    const recCircuitId = meta?.circuitId || 'circuit_monaco';
    const circuitTitle = this.getCircuitTitle(recCircuitId);
    const vehicleName = this.getVehicleName(meta?.vehicleModelId || 'gt_turbo');
    const isFirstPerson = meta?.viewMode === 'FIRST_PERSON';
    const bestLapStr = meta?.bestLapMs ? this.formatTime(meta.bestLapMs) : '--:--.---';
    const totalRaceStr = meta?.totalTimeMs ? this.formatTime(meta.totalTimeMs) : '--:--.---';
    const topSpeedStr = meta?.topSpeedKmh ? `${meta.topSpeedKmh.toFixed(1)} km/h` : '--.- km/h';
    const avgSpeedStr = meta?.avgSpeedKmh ? `${meta.avgSpeedKmh.toFixed(1)} km/h` : '--.- km/h';

    // 베스트 섹터 타임
    const bestSectors = meta?.sectorTimesMs?.[1] || meta?.sectorTimesMs?.[0] || [];
    const s1Str = bestSectors[0] ? this.formatTime(bestSectors[0]) : '--:--.---';
    const s2Str = bestSectors[1] ? this.formatTime(bestSectors[1]) : '--:--.---';
    const s3Str = bestSectors[2] ? this.formatTime(bestSectors[2]) : '--:--.---';

    // 완주 순위
    const finishRank = meta?.raceResults?.find(r => r.isPlayer)?.rank || 1;

    // 1~4위 순위표
    let raceResultsHtml = '';
    if (meta?.raceResults && meta.raceResults.length > 0) {
      raceResultsHtml = meta.raceResults.map(r => `
        <div class="detail-sub-item">
          <span class="detail-sub-k" style="${r.isPlayer ? 'color: var(--accent-spec); font-weight: 700;' : ''}">
            ${r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : '4th'} P${r.rank} ${this.escapeHtml(r.driverName)} ${r.isPlayer ? '(YOU)' : ''}
          </span>
          <span class="detail-sub-v" style="${r.isPlayer ? 'color: var(--accent-spec);' : ''}">${r.timeFormatted}</span>
        </div>
      `).join('');
    } else {
      raceResultsHtml = `
        <div class="detail-sub-item">
          <span class="detail-sub-k" style="color: var(--accent-spec); font-weight: 700;">🥇 P1 ${driverName} (YOU)</span>
          <span class="detail-sub-v" style="color: var(--accent-spec);">${bestLapStr}</span>
        </div>
      `;
    }

    return `
      <tr class="history-detail-row">
        <td colspan="8">
          <div class="history-detail-container">
            <!-- 좌측: 메타데이터 패널 -->
            <div class="detail-meta-panel">
              <div class="detail-header-strip">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="detail-code-badge">${rec.matchCode}</span>
                  <span style="font-size: 11px; color: var(--text-secondary); font-family: var(--font-mono);">${this.formatDate(rec.savedAt || rec.createdAt)}</span>
                </div>
                <span class="detail-rank-badge ${finishRank === 1 ? 'detail-rank-1' : ''}">🏁 완주 결과: P${finishRank} / 4</span>
              </div>

              <div class="detail-meta-grid">
                <div class="detail-cell">
                  <span class="detail-k">드라이버</span>
                  <span class="detail-v" style="color: #fff;">${driverName}</span>
                </div>
                <div class="detail-cell">
                  <span class="detail-k">머신 / 시점</span>
                  <span class="detail-v">${vehicleName} <span class="view-mode-badge ${isFirstPerson ? 'badge-1p' : 'badge-3p'}">${isFirstPerson ? '1P' : '3P'}</span></span>
                </div>
                <div class="detail-cell">
                  <span class="detail-k">서킷</span>
                  <span class="detail-v">${circuitTitle}</span>
                </div>
                <div class="detail-cell">
                  <span class="detail-k">베스트 랩타임</span>
                  <span class="detail-v" style="color: #fbbf24;">${bestLapStr}</span>
                </div>
                <div class="detail-cell">
                  <span class="detail-k">총 경기 시간</span>
                  <span class="detail-v">${totalRaceStr}</span>
                </div>
                <div class="detail-cell">
                  <span class="detail-k">최고 / 평균속도</span>
                  <span class="detail-v">${topSpeedStr} / ${avgSpeedStr}</span>
                </div>
              </div>

              <div class="detail-breakdown-row">
                <!-- 베스트랩 섹터 기록 -->
                <div class="detail-sub-group">
                  <div class="detail-sub-title">⏱ 베스트 랩 섹터 기록</div>
                  <div class="detail-sub-list">
                    <div class="detail-sub-item">
                      <span class="detail-sub-k">SECTOR 1</span>
                      <span class="detail-sub-v">${s1Str}</span>
                    </div>
                    <div class="detail-sub-item">
                      <span class="detail-sub-k">SECTOR 2</span>
                      <span class="detail-sub-v">${s2Str}</span>
                    </div>
                    <div class="detail-sub-item">
                      <span class="detail-sub-k">SECTOR 3</span>
                      <span class="detail-sub-v">${s3Str}</span>
                    </div>
                  </div>
                </div>

                <!-- 1~4위 경기 최종 순위표 -->
                <div class="detail-sub-group">
                  <div class="detail-sub-title">🏆 레이스 완주 순위 (1~4위)</div>
                  <div class="detail-sub-list">
                    ${raceResultsHtml}
                  </div>
                </div>
              </div>
            </div>

            <!-- 우측: 2D 미니맵 리플레이 패널 -->
            <div class="detail-minimap-panel">
              <div class="minimap-header">
                <span class="minimap-title">📡 2D 미니맵 레이스 궤적</span>
                <span class="minimap-time-tag" id="minimap-time-display">00:00.000 / 00:00.000</span>
              </div>
              <div class="minimap-canvas-wrapper">
                <canvas id="history-minimap-canvas" width="320" height="190"></canvas>
              </div>
              <div class="minimap-controls">
                <button type="button" class="minimap-play-btn" id="minimap-btn-toggle" title="재생 / 일시정지">⏸</button>
                <input type="range" class="minimap-scrubber" id="minimap-scrubber" min="0" max="1000" value="0">
                <button type="button" class="minimap-3d-btn" data-match="${rec.matchCode}">3D 뷰어로 보기</button>
              </div>
            </div>
          </div>
        </td>
      </tr>
    `;
  }

  /**
   * 2D 미니맵 렌더링 및 RAF 재생 루프 시작
   */
  private startMinimapPlayback(): void {
    this.stopMinimapPlayback();

    const record = this.allRecords.find(r => r.matchCode === this.selectedMatchCode);
    if (!record || !record.ticks || record.ticks.length === 0) return;

    this.minimapRecord = record;
    this.minimapCurrentTimeMs = 0;
    this.minimapIsPlaying = true;
    this.minimapLastTimestamp = performance.now();

    const loop = () => {
      this.tickMinimap();
      if (this.selectedMatchCode) {
        this.minimapAnimId = requestAnimationFrame(loop);
      }
    };

    this.minimapAnimId = requestAnimationFrame(loop);
  }

  private stopMinimapPlayback(): void {
    if (this.minimapAnimId !== null) {
      cancelAnimationFrame(this.minimapAnimId);
      this.minimapAnimId = null;
    }
  }

  /**
   * 2D 미니맵 프레임 진행 및 캔버스 갱신
   */
  private tickMinimap(): void {
    if (!this.minimapRecord || !this.minimapRecord.ticks || this.minimapRecord.ticks.length === 0) return;

    const ticks = this.minimapRecord.ticks;
    const maxDuration = ticks[ticks.length - 1].timeMs;

    if (this.minimapIsPlaying && !this.isScrubbing) {
      const now = performance.now();
      const dt = now - this.minimapLastTimestamp;
      this.minimapLastTimestamp = now;

      // 1.5배속 재생으로 지루하지 않게 시각화
      this.minimapCurrentTimeMs += dt * 1.5;
      if (this.minimapCurrentTimeMs >= maxDuration) {
        this.minimapCurrentTimeMs = 0;
      }
    } else {
      this.minimapLastTimestamp = performance.now();
    }

    this.drawMinimapFrame();
  }

  /**
   * 2D 미니맵 캔버스 렌더링
   */
  private drawMinimapFrame(): void {
    const canvas = document.getElementById('history-minimap-canvas') as HTMLCanvasElement | null;
    if (!canvas || !this.minimapRecord) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // 1. 배경 클리어
    ctx.fillStyle = '#101319';
    ctx.fillRect(0, 0, w, h);

    // 2. 가이드 그리드 라인
    ctx.strokeStyle = '#181c25';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 36) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 36) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // 3. 서킷 2D 정규화 좌표 가져오기
    const circuitId = this.minimapRecord.metadata?.circuitId || 'circuit_monaco';
    const cData = this.getCircuit2D(circuitId);

    const pad = 24;
    const availW = w - pad * 2;
    const availH = h - pad * 2;
    const rangeX = cData.maxX - cData.minX || 1;
    const rangeZ = cData.maxZ - cData.minZ || 1;
    const scale = Math.min(availW / rangeX, availH / rangeZ);
    const midX = (cData.minX + cData.maxX) / 2;
    const midZ = (cData.minZ + cData.maxZ) / 2;

    const toX = (x: number) => (x - midX) * scale + w / 2;
    const toY = (z: number) => (z - midZ) * scale + h / 2;

    // 4. 서킷 도로 렌더링 (아스팔트 외곽 + 중심선)
    ctx.beginPath();
    ctx.lineWidth = 9;
    ctx.strokeStyle = '#222634';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    cData.points.forEach((p, i) => {
      const cx = toX(p.x);
      const cy = toY(p.z);
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#394152';
    cData.points.forEach((p, i) => {
      const cx = toX(p.x);
      const cy = toY(p.z);
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.closePath();
    ctx.stroke();

    // 스타트 / 피니시 라인
    const startP = cData.points[0];
    const sx = toX(startP.x);
    const sy = toY(startP.z);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '8px monospace';
    ctx.fillText('S/F', sx + 6, sy + 3);

    // 5. 현재 시각의 틱 탐색 (이진 탐색)
    const ticks = this.minimapRecord.ticks;
    const maxDuration = ticks[ticks.length - 1].timeMs;

    let low = 0, high = ticks.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (ticks[mid].timeMs < this.minimapCurrentTimeMs) low = mid + 1;
      else high = mid - 1;
    }
    const idx = Math.min(Math.max(0, low), ticks.length - 1);
    const currentTick = ticks[idx];

    // 6. 라이벌 상대 3대 차량 닷 렌더링
    if (currentTick.opponents) {
      currentTick.opponents.forEach((opp, oppIdx) => {
        const ox = toX(opp.x);
        const oy = toY(opp.z);
        const color = this.minimapRecord?.metadata?.opponentConfigs?.[oppIdx]?.color || '#f59e0b';

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(ox, oy, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }

    // 7. 플레이어 차량 렌더링 (빛나는 닷 + 진행 화살표)
    const px = toX(currentTick.x);
    const py = toY(currentTick.z);
    const playerColor = this.minimapRecord.metadata?.color || '#38bdf8';

    ctx.save();
    ctx.shadowColor = playerColor;
    ctx.shadowBlur = 8;
    ctx.fillStyle = playerColor;
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // 방향 지시 화살표
    const heading = currentTick.yaw;
    const arrowLen = 9;
    const hx = px + Math.sin(heading) * arrowLen;
    const hy = py - Math.cos(heading) * arrowLen;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(hx, hy);
    ctx.stroke();

    // 8. 테크니컬 HUD 텍스트 오버레이
    ctx.fillStyle = '#38bdf8';
    ctx.font = '10px monospace';
    ctx.fillText(`${currentTick.speedKmh.toFixed(0)} km/h`, 10, 16);

    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`LAP ${currentTick.lap || 1}/${this.minimapRecord.metadata?.totalLaps || 1}`, w - 62, 16);

    // 하단 범례
    ctx.fillStyle = playerColor;
    ctx.fillRect(10, h - 14, 6, 6);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '8px monospace';
    ctx.fillText('YOU', 19, h - 8);

    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(45, h - 14, 6, 6);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('AI RIVALS', 54, h - 8);

    // 9. DOM 컨트롤 업데이트
    const timeDisplay = document.getElementById('minimap-time-display');
    if (timeDisplay) {
      timeDisplay.textContent = `${this.formatTime(this.minimapCurrentTimeMs)} / ${this.formatTime(maxDuration)}`;
    }

    const scrubber = document.getElementById('minimap-scrubber') as HTMLInputElement | null;
    if (scrubber && !this.isScrubbing) {
      scrubber.value = String(Math.round((this.minimapCurrentTimeMs / (maxDuration || 1)) * 1000));
    }
  }

  /**
   * 서킷 2D 커브 좌표 및 바운딩 박스 캐싱
   */
  private getCircuit2D(circuitId: CircuitId): CachedCircuit2D {
    if (this.circuit2DCache.has(circuitId)) {
      return this.circuit2DCache.get(circuitId)!;
    }
    const def = CIRCUIT_DEFINITIONS[circuitId] || CIRCUIT_DEFINITIONS.circuit_monaco;
    const curve = new THREE.CatmullRomCurve3(def.controlPoints, true, 'centripetal');
    const threePts = curve.getPoints(140);
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    const points = threePts.map(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
      return { x: p.x, z: p.z };
    });
    const cached: CachedCircuit2D = { points, minX, maxX, minZ, maxZ };
    this.circuit2DCache.set(circuitId, cached);
    return cached;
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
