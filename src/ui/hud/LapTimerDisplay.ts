/**
 * 서킷 명칭, 랩 카운터 및 랩 타임(현재/최고) 표시 전담 컴포넌트
 */
export class LapTimerDisplay {
  private lapCounter: HTMLElement | null;
  private currentLapTime: HTMLElement | null;
  private bestLapTime: HTMLElement | null;
  private lapCircuitTitle: HTMLElement | null;

  constructor() {
    this.lapCounter = document.getElementById('lap-counter');
    this.currentLapTime = document.getElementById('current-lap-time');
    this.bestLapTime = document.getElementById('best-lap-time');
    this.lapCircuitTitle = document.getElementById('lap-circuit-title');
  }

  public setCircuitTitle(title: string): void {
    if (this.lapCircuitTitle) {
      this.lapCircuitTitle.textContent = title.toUpperCase();
    }
  }

  public update(
    currentLap: number,
    totalLaps: number,
    currentLapTimeStr: string,
    bestLapTimeStr: string
  ): void {
    if (this.lapCounter) {
      const cur = currentLap.toString().padStart(2, '0');
      const tot = totalLaps.toString().padStart(2, '0');
      this.lapCounter.textContent = `LAP ${cur} / ${tot}`;
    }
    if (this.currentLapTime) {
      this.currentLapTime.textContent = currentLapTimeStr;
    }
    if (this.bestLapTime) {
      this.bestLapTime.textContent = bestLapTimeStr;
    }
  }
}
