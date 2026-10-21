import type { CircuitId } from '../../data/circuits.ts';
import { appDB } from '../../storage/AppDatabase.ts';
import { t } from '../../i18n/I18nManager.ts';
import type { CircuitLeaderboardEntry } from './types.ts';
import { FALLBACK_LEADERBOARDS } from './benchmarks.ts';

/**
 * 서킷별 공식/로컬 상위 5위 기록 조회 및 렌더러
 * - 로컬 IndexedDB에 저장된 리플레이 중 베스트랩 상위 5위 조회
 * - 부족분은 서킷별 공식 벤치마크(FALLBACK_LEADERBOARDS)로 보충
 * - 서버/로컬 상태 배지(LIVE / FALLBACK) 표시
 */
export class FinishLeaderboard {
  private tbody: HTMLElement | null;
  private statusTag: HTMLElement | null;

  constructor() {
    this.tbody = document.getElementById('finish-server-top5-tbody');
    this.statusTag = document.getElementById('finish-server-status-tag');
  }

  public async loadCircuitTop5(circuitId: CircuitId): Promise<void> {
    if (!this.tbody) return;

    this.tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 10px;">${t('finish.loading')}</td></tr>`;
    if (this.statusTag) {
      this.statusTag.textContent = 'LOCAL DB...';
      this.statusTag.className = 'finish-status-badge';
    }

    try {
      const allReplays = await appDB.listReplays();
      const circuitReplays = allReplays.filter(
        (r) => r.metadata?.circuitId === circuitId && typeof r.metadata?.bestLapMs === 'number' && r.metadata.bestLapMs > 0
      );

      // 베스트 랩 오름차순 정렬
      circuitReplays.sort((a, b) => (a.metadata.bestLapMs || Infinity) - (b.metadata.bestLapMs || Infinity));

      const records: CircuitLeaderboardEntry[] = [];
      const seenDrivers = new Set<string>();

      for (const r of circuitReplays) {
        const dName = r.metadata.driverName || 'Driver';
        if (!seenDrivers.has(dName)) {
          seenDrivers.add(dName);
          records.push({
            rank: records.length + 1,
            driverName: dName,
            timeFormatted: this.formatMs(r.metadata.bestLapMs),
          });
          if (records.length >= 5) break;
        }
      }

      // 5개 미만인 경우 기본 벤치마크 기록으로 채움
      if (records.length < 5) {
        const fallbackList = FALLBACK_LEADERBOARDS[circuitId] || FALLBACK_LEADERBOARDS['circuit_monaco'] || [];
        for (const fb of fallbackList) {
          if (!seenDrivers.has(fb.driverName)) {
            seenDrivers.add(fb.driverName);
            records.push({
              rank: records.length + 1,
              driverName: fb.driverName,
              timeFormatted: fb.timeFormatted,
            });
            if (records.length >= 5) break;
          }
        }
      }

      this.render(records.slice(0, 5), false);
    } catch {
      const fallbackList = FALLBACK_LEADERBOARDS[circuitId] || FALLBACK_LEADERBOARDS['circuit_monaco'] || [];
      this.render(fallbackList, true);
    }
  }

  public render(records: CircuitLeaderboardEntry[], isFallback: boolean): void {
    if (!this.tbody) return;

    if (this.statusTag) {
      this.statusTag.textContent = isFallback ? t('finish.serverOffline') : t('finish.serverLive');
      this.statusTag.className = `finish-status-badge ${isFallback ? 'fallback' : 'live'}`;
    }

    if (records.length === 0) {
      this.tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 10px;">${t('finish.noRecords')}</td></tr>`;
      return;
    }

    this.tbody.innerHTML = records.map((rec, idx) => {
      const rank = rec.rank || idx + 1;
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
