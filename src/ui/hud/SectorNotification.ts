/**
 * 서킷 정보 카드 상단에 섹터/도착선 통과 텍스트 알림 표시 전담 컴포넌트
 * - 순수 텍스트, 통과 순서대로 누적 후 페이드아웃
 */
export class SectorNotification {
  private sectorTextContainer: HTMLElement | null;

  constructor() {
    this.sectorTextContainer = document.getElementById('sector-text-container');
  }

  public show(driverName: string, sectorName: string, timeMs: number): void {
    if (!this.sectorTextContainer) return;

    const line = document.createElement('div');
    line.className = 'sector-text-line';
    line.innerHTML = `
      <span class="sector-text-sector">${sectorName}</span>
      <span class="sector-text-name">${driverName}</span>
      <span class="sector-text-time">${(timeMs / 1000).toFixed(3)}s</span>
    `;

    this.sectorTextContainer.appendChild(line);

    // 최대 4줄 초과 시 가장 오래된 줄 제거
    while (this.sectorTextContainer.children.length > 4) {
      this.sectorTextContainer.firstElementChild?.remove();
    }

    // 다음 프레임에서 표시 페이드인
    requestAnimationFrame(() => {
      line.classList.add('visible');
    });

    // 3.2초 노출 후 스르륵 페이드아웃 및 제거
    setTimeout(() => {
      line.classList.add('fade-out');
      line.classList.remove('visible');
      setTimeout(() => {
        line.remove();
      }, 500);
    }, 3200);
  }

  public reset(): void {
    if (this.sectorTextContainer) {
      this.sectorTextContainer.innerHTML = '';
    }
  }
}
