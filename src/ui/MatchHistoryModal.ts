import { BaseModal } from './BaseModal.ts';
import { appDB } from '../storage/AppDatabase.ts';
import type { CachedReplayRecord } from '../storage/schema.ts';
import { CIRCUIT_DEFINITIONS } from '../data/circuits.ts';
import { showToast } from './Toast.ts';

export interface MatchHistoryModalCallbacks {
  onPlayReplay?: (record: CachedReplayRecord) => void;
}

/**
 * 로컬 IndexedDB에 저장된 최대 30개 주행 리플레이 목록 및 전적 컨트롤러
 */
export class MatchHistoryModal extends BaseModal {
  private btnClose: HTMLElement | null;
  private btnCloseBottom: HTMLElement | null;
  private tabBtns: NodeListOf<HTMLElement>;
  private searchInput: HTMLInputElement | null;
  private btnSearch: HTMLElement | null;
  private btnRefresh: HTMLElement | null;
  private sortSelect: HTMLSelectElement | null;
  private tableTbody: HTMLElement | null;

  private statTotal: HTMLElement | null;
  private statBest: HTMLElement | null;
  private statSpeed: HTMLElement | null;
  private statCount: HTMLElement | null;

  private allRecords: CachedReplayRecord[] = [];
  private currentCircuitFilter: string = 'all';
  private searchQuery: string = '';
  private sortMode: 'best_lap' | 'recent' | 'top_speed' = 'best_lap';

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
        this.currentCircuitFilter = btn.getAttribute('data-circuit') || btn.getAttribute('data-track') || 'all';
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

    // 새로고침 버튼
    this.btnRefresh?.addEventListener('click', async () => {
      if (this.searchInput) this.searchInput.value = '';
      this.searchQuery = '';
      await this.loadAndRender();
      showToast('🔄 리플레이 목록을 갱신했습니다.');
    });

    // 테이블 내 재생 및 삭제 버튼 이벤트 위임
    this.tableTbody?.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;

      // 1. 다시보기 재생 버튼
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

      // 2. 리플레이 삭제 버튼
      const deleteBtn = target.closest('.history-delete-btn') as HTMLElement | null;
      if (deleteBtn) {
        const matchCode = deleteBtn.getAttribute('data-match');
        if (matchCode) {
          await appDB.deleteReplay(matchCode);
          showToast(`🗑 리플레이 [${matchCode}] 기록이 삭제되었습니다.`);
          await this.loadAndRender();
        }
      }
    });
  }

  public open(): void {
    this.showModal();
    this.loadAndRender();
  }

  /**
   * IndexedDB에서 최대 30개 리플레이 조회 및 통계/테이블 일괄 갱신
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
      this.statCount.textContent = `(${total}/30)`;
    }

    // 최고 랩타임 탐색
    if (this.statBest) {
      let minBestMs = Infinity;
      let bestDriver = '';
      for (const r of this.allRecords) {
        const ms = r.metadata?.bestLapMs;
        if (typeof ms === 'number' && ms > 0 && ms < minBestMs) {
          minBestMs = ms;
          bestDriver = r.metadata?.userNickname || '';
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
   */
  private renderTable(): void {
    if (!this.tableTbody) return;

    // 1. 서킷 및 검색어 필터링
    let filtered = this.allRecords.filter(r => {
      const recCircuitId = r.metadata?.circuitId || (r.metadata as any)?.trackId;
      if (this.currentCircuitFilter !== 'all' && recCircuitId !== this.currentCircuitFilter) {
        return false;
      }
      if (this.searchQuery) {
        const nickname = (r.metadata?.userNickname || '').toLowerCase();
        const code = (r.matchCode || '').toLowerCase();
        const circuitTitle = (CIRCUIT_DEFINITIONS[recCircuitId]?.title || '').toLowerCase();
        if (!nickname.includes(this.searchQuery) && !code.includes(this.searchQuery) && !circuitTitle.includes(this.searchQuery)) {
          return false;
        }
      }
      return true;
    });

    // 2. 정렬
    if (this.sortMode === 'best_lap') {
      filtered.sort((a, b) => (a.metadata?.bestLapMs || Infinity) - (b.metadata?.bestLapMs || Infinity));
    } else if (this.sortMode === 'recent') {
      filtered.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    } else if (this.sortMode === 'top_speed') {
      filtered.sort((a, b) => (b.metadata?.topSpeedKmh || 0) - (a.metadata?.topSpeedKmh || 0));
    }

    // 3. 빈 상태 UI
    if (filtered.length === 0) {
      this.tableTbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 36px 16px; color: var(--text-muted); font-family: var(--font-mono); font-size: 12px;">
            <span style="font-size: 22px; display: block; margin-bottom: 8px;">🏁</span>
            저장된 경기 리플레이가 없습니다.<br>
            <span style="font-size: 11px; opacity: 0.7;">경기를 완주한 후 결과 화면에서 [다시보기]를 누르면 로컬 IndexedDB에 최대 30개까지 자동 보관됩니다.</span>
          </td>
        </tr>
      `;
      return;
    }

    // 4. 테이블 행 생성
    this.tableTbody.innerHTML = filtered.map((rec, idx) => {
      const meta = rec.metadata;
      const rankNum = idx + 1;
      let rankBadgeHtml = `<span class="rank-badge">${rankNum.toString().padStart(2, '0')}</span>`;
      let rankRowClass = '';

      if (this.sortMode === 'best_lap' && rankNum <= 3) {
        const medal = rankNum === 1 ? '🥇' : (rankNum === 2 ? '🥈' : '🥉');
        rankBadgeHtml = `<span class="rank-badge rank-badge-${rankNum}">${medal} ${rankNum.toString().padStart(2, '0')}</span>`;
        rankRowClass = `rank-row-top rank-${rankNum}`;
      }

      const driverName = this.escapeHtml(meta?.userNickname || 'Driver');
      const machineBadge = this.getMachineBadge(meta?.vehicleId || 'gt_turbo');
      const recCircuitId = meta?.circuitId || (meta as any)?.trackId || 'circuit_monaco';
      const circuitTitle = this.getCircuitTitle(recCircuitId);
      const lapTime = meta?.bestLapMs ? this.formatTime(meta.bestLapMs) : '--:--.---';
      const topSpeed = meta?.topSpeedKmh ? `${meta.topSpeedKmh.toFixed(1)} km/h` : '--.- km/h';
      const dateStr = this.formatDate(rec.savedAt || rec.createdAt);

      return `
        <tr class="${rankRowClass}">
          <td class="col-rank">${rankBadgeHtml}</td>
          <td class="col-driver"><strong class="driver-name-text">${driverName}</strong></td>
          <td class="col-machine">${machineBadge}</td>
          <td class="col-track">${circuitTitle}</td>
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
      `;
    }).join('');
  }

  private getMachineBadge(vehicleId: string): string {
    if (vehicleId === 'formula_aero') {
      return `<span class="machine-badge formula">Formula Aero</span>`;
    } else if (vehicleId === 'cyber_speedster') {
      return `<span class="machine-badge cyber">Cyber Speedster</span>`;
    }
    return `<span class="machine-badge gt">GT-86 Turbo</span>`;
  }

  private getCircuitTitle(circuitId: string): string {
    const meta = CIRCUIT_DEFINITIONS[circuitId];
    if (meta?.title) return meta.title;
    if (circuitId === 'circuit_monaco') return 'Monaco GP';
    if (circuitId === 'circuit_monza') return 'Monza GP';
    if (circuitId === 'circuit_spa') return 'Spa-Francorchamps';
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
