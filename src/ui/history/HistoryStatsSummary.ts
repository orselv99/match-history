import type { CachedReplayRecord } from '../../storage/schema.ts';

export interface HistoryStatsSummaryElements {
  statTotal: HTMLElement | null;
  statBest: HTMLElement | null;
  statSpeed: HTMLElement | null;
}

/**
 * 전적 검색 모달 상단 3대 KPI 통계 카드 (총 경기 수, 최고 랩타임 및 달성 드라이버, 최고 시속) 전담 컴포넌트
 */
export class HistoryStatsSummary {
  private statTotal: HTMLElement | null;
  private statBest: HTMLElement | null;
  private statSpeed: HTMLElement | null;

  constructor(elements?: Partial<HistoryStatsSummaryElements>) {
    this.statTotal = elements?.statTotal ?? document.getElementById('history-stat-total');
    this.statBest = elements?.statBest ?? document.getElementById('history-stat-best');
    this.statSpeed = elements?.statSpeed ?? document.getElementById('history-stat-speed');
  }

  public update(
    records: CachedReplayRecord[],
    formatTime: (ms: number) => string,
    escapeHtml: (s: string) => string
  ): void {
    const total = records.length;
    if (this.statTotal) {
      this.statTotal.textContent = total.toLocaleString();
    }

    // 최고 랩타임 탐색
    if (this.statBest) {
      let minBestMs = Infinity;
      let bestDriver = '';
      for (const r of records) {
        const ms = r.metadata?.bestLapMs;
        if (typeof ms === 'number' && ms > 0 && ms < minBestMs) {
          minBestMs = ms;
          bestDriver = r.metadata?.driverName || '';
        }
      }

      if (minBestMs !== Infinity) {
        this.statBest.innerHTML = `${formatTime(minBestMs)} <span class="metric-unit">${escapeHtml(bestDriver)}</span>`;
      } else {
        this.statBest.innerHTML = `--:--.---`;
      }
    }

    // 최고속 탐색
    if (this.statSpeed) {
      let maxSpeed = 0;
      for (const r of records) {
        const spd = r.metadata?.topSpeedKmh;
        if (typeof spd === 'number' && spd > maxSpeed) {
          maxSpeed = spd;
        }
      }
      this.statSpeed.textContent = maxSpeed > 0 ? maxSpeed.toFixed(1) : '0.0';
    }
  }
}
