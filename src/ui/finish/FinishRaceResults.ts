import type { RaceResultEntry } from '../../replay/ReplayTypes.ts';
import { t } from '../../i18n/I18nManager.ts';

/**
 * 인게임 레이스 최종 완주 결과 테이블 렌더러
 * - 순위 (P1, P2, P3 컬러 배지)
 * - 드라이버 이름 (플레이어 YOU 태그)
 * - 완주 기록 시간
 */
export class FinishRaceResults {
  private tbody: HTMLElement | null;

  constructor() {
    this.tbody = document.getElementById('finish-race-results-tbody');
  }

  public render(results: RaceResultEntry[]): void {
    if (!this.tbody) return;

    if (results.length === 0) {
      this.tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 12px;">${t('finish.noRecords')}</td></tr>`;
      return;
    }

    this.tbody.innerHTML = results.map((r) => {
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

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
