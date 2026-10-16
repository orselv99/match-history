import { BaseModal } from './BaseModal.ts';
import type { MatchSummaryMetadata, RaceResultEntry } from '../replay/ReplayTypes.ts';
import { t } from '../i18n/I18nManager.ts';

export interface FinishModalCallbacks {
  onReplay: () => void;
  onRestart: () => void;
  onTitle: () => void;
}

export interface CircuitLeaderboardEntry {
  rank: number;
  driverName: string;
  timeFormatted: string;
}

/**
 * 서킷별 공식 벤치마크 역대 상위 5위 기록 (서버 연동 전/오프라인 Fallback)
 */
export const FALLBACK_LEADERBOARDS: Record<string, CircuitLeaderboardEntry[]> = {
  circuit_monaco: [
    { rank: 1, driverName: 'Ayrton_M', timeFormatted: '01:14.260' },
    { rank: 2, driverName: 'Schumacher_M', timeFormatted: '01:14.890' },
    { rank: 3, driverName: 'Leclerc_16', timeFormatted: '01:15.310' },
    { rank: 4, driverName: 'Verstappen_1', timeFormatted: '01:15.780' },
    { rank: 5, driverName: 'Hamilton_44', timeFormatted: '01:16.220' },
  ],
  circuit_monza: [
    { rank: 1, driverName: 'Barrichello_R', timeFormatted: '01:21.046' },
    { rank: 2, driverName: 'Hamilton_44', timeFormatted: '01:21.880' },
    { rank: 3, driverName: 'Raikkonen_K', timeFormatted: '01:22.120' },
    { rank: 4, driverName: 'Verstappen_1', timeFormatted: '01:22.540' },
    { rank: 5, driverName: 'Norris_4', timeFormatted: '01:23.010' },
  ],
  circuit_spa: [
    { rank: 1, driverName: 'Bottas_V', timeFormatted: '01:46.286' },
    { rank: 2, driverName: 'Hamilton_44', timeFormatted: '01:46.950' },
    { rank: 3, driverName: 'Raikkonen_K', timeFormatted: '01:47.410' },
    { rank: 4, driverName: 'Verstappen_1', timeFormatted: '01:47.880' },
    { rank: 5, driverName: 'Russell_63', timeFormatted: '01:48.340' },
  ],
};

/**
 * 경기 완주 인게임 결과 ('순위, 이름, 시간') 및 서킷 TOP 5 랭킹 모달 컨트롤러
 */
export class FinishModal extends BaseModal<MatchSummaryMetadata> {
  private circuitCodeTag: HTMLElement | null;
  private raceResultsTbody: HTMLElement | null;
  private serverTop5Tbody: HTMLElement | null;
  private serverStatusTag: HTMLElement | null;

  private latestMetadata: MatchSummaryMetadata | null = null;

  constructor(callbacks: FinishModalCallbacks) {
    super('finish-modal');

    this.circuitCodeTag = document.getElementById('modal-circuit-code');
    this.raceResultsTbody = document.getElementById('finish-race-results-tbody');
    this.serverTop5Tbody = document.getElementById('finish-server-top5-tbody');
    this.serverStatusTag = document.getElementById('finish-server-status-tag');

    const btnReplay = document.getElementById('modal-btn-replay');
    const btnRestart = document.getElementById('modal-btn-restart');
    const btnTitle = document.getElementById('modal-btn-title');

    btnReplay?.addEventListener('click', () => {
      this.close();
      callbacks.onReplay();
    });

    btnRestart?.addEventListener('click', () => {
      this.close();
      callbacks.onRestart();
    });

    btnTitle?.addEventListener('click', () => {
      this.close();
      callbacks.onTitle();
    });
  }

  public open(metadata?: MatchSummaryMetadata): void {
    if (metadata) {
      this.latestMetadata = metadata;

      if (this.circuitCodeTag) {
        const circuitName = (metadata.circuitId || 'circuit_monaco').replace('circuit_', '').toUpperCase();
        this.circuitCodeTag.textContent = `CIRCUIT // ${circuitName}`;
      }

      // 1. 인게임 레이스 최종 순위 ('순위, 이름, 시간')
      this.renderRaceResults(metadata.raceResults || []);

      // 2. 서버 서킷 상위 5위 랭킹 비동기 조회 (Fallback 지원)
      this.loadServerTop5(metadata.circuitId);
    }

    this.showModal();
  }

  /**
   * 경기 결과 테이블 렌더링 ('순위, 이름, 시간')
   */
  private renderRaceResults(results: RaceResultEntry[]): void {
    if (!this.raceResultsTbody) return;

    if (results.length === 0) {
      this.raceResultsTbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 12px;">${t('finish.noRecords')}</td></tr>`;
      return;
    }

    this.raceResultsTbody.innerHTML = results.map(r => {
      const isPlayer = r.isPlayer;
      const rankClass = r.rank <= 3 ? `finish-rank-${r.rank}` : '';
      const playerBadge = isPlayer ? `<span class="player-tag">YOU</span>` : '';

      return `
        <tr class="${isPlayer ? 'is-player' : ''}">
          <td class="finish-rank-cell ${rankClass}">P${r.rank}</td>
          <td>${this.escapeHtml(r.driverName)}${playerBadge}</td>
          <td class="finish-time-cell">${r.timeFormatted}</td>
        </tr>
      `;
    }).join('');
  }

  /**
   * 서버에서 현재 서킷 기준 상위 5개 기록 조회, 실패 시 fallback 데이터 표시
   */
  private async loadServerTop5(circuitId: string): Promise<void> {
    if (!this.serverTop5Tbody) return;

    this.serverTop5Tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 10px;">${t('finish.loading')}</td></tr>`;
    if (this.serverStatusTag) {
      this.serverStatusTag.textContent = 'CONNECTING...';
      this.serverStatusTag.className = 'finish-status-badge';
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`https://match-history-api.orsel.workers.dev/api/leaderboards/${circuitId}?limit=5`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const serverRecords: CircuitLeaderboardEntry[] = data.slice(0, 5).map((d: any, idx: number) => ({
          rank: idx + 1,
          driverName: d.nickname || d.driverName || `Driver #${idx + 1}`,
          timeFormatted: d.timeFormatted || (typeof d.bestLapMs === 'number' ? this.formatMs(d.bestLapMs) : '--:--.---'),
        }));
        this.renderServerTop5(serverRecords, false);
        return;
      }
    } catch {
      // 서버 미응답 또는 엔드포인트 미구현 시 Fallback으로 부드럽게 전환
    }

    const fallbackList = FALLBACK_LEADERBOARDS[circuitId] || FALLBACK_LEADERBOARDS['circuit_monaco'] || [];
    this.renderServerTop5(fallbackList, true);
  }

  private renderServerTop5(records: CircuitLeaderboardEntry[], isFallback: boolean): void {
    if (!this.serverTop5Tbody) return;

    if (this.serverStatusTag) {
      this.serverStatusTag.textContent = isFallback ? t('finish.serverOffline') : t('finish.serverLive');
      this.serverStatusTag.className = `finish-status-badge ${isFallback ? 'fallback' : 'live'}`;
    }

    if (records.length === 0) {
      this.serverTop5Tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 10px;">${t('finish.noRecords')}</td></tr>`;
      return;
    }

    this.serverTop5Tbody.innerHTML = records.map((rec, idx) => {
      const rank = rec.rank || (idx + 1);
      const rankClass = rank <= 3 ? `finish-rank-${rank}` : '';

      return `
        <tr>
          <td class="finish-rank-cell ${rankClass}">P${rank}</td>
          <td>${this.escapeHtml(rec.driverName)}</td>
          <td class="finish-time-cell">${rec.timeFormatted}</td>
        </tr>
      `;
    }).join('');
  }

  private formatMs(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
    const s = (totalSec % 60).toString().padStart(2, '0');
    const msec = Math.floor(ms % 1000).toString().padStart(3, '0');
    return `${m}:${s}.${msec}`;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
