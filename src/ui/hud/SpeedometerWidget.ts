export const GEAR_COLORS: Record<string, string> = {
  N: '#94a3b8',   // 중립 (Slate Gray)
  '1': '#38bdf8', // 1단 (Sky Blue)
  '2': '#34d399', // 2단 (Emerald Green)
  '3': '#fbbf24', // 3단 (Amber Yellow)
  '4': '#fb923c', // 4단 (Orange)
  '5': '#f43f5e', // 5단 (Spec Red)
  '6': '#e11d48', // 6단 (Crimson)
  R: '#c084fc',   // 후진 (Purple)
};

/**
 * 속도계, 기어 단수, RPM 타코미터 바, 드리프트 스태미나 위젯 전담 컨트롤러
 */
export class SpeedometerWidget {
  private speedIndicator: HTMLElement | null;
  private gearIndicator: HTMLElement | null;
  private rpmBar: HTMLElement | null;
  private driftBadge: HTMLElement | null;
  private driftStaminaBar: HTMLElement | null;
  private driftStaminaValue: HTMLElement | null;

  constructor() {
    this.speedIndicator = document.getElementById('speed-indicator');
    this.gearIndicator = document.getElementById('gear-indicator');
    this.rpmBar = document.getElementById('rpm-bar');
    this.driftBadge = document.getElementById('drift-badge');
    this.driftStaminaBar = document.getElementById('drift-stamina-bar');
    this.driftStaminaValue = document.getElementById('drift-stamina-value');
  }

  public update(
    speedKmh: number,
    gear: string,
    rpmRatio: number,
    driftStamina?: number,
    isDrifting?: boolean,
    isSpinningOut?: boolean
  ): void {
    const gearColor = GEAR_COLORS[gear] || '#c45a72';

    if (this.speedIndicator) {
      this.speedIndicator.textContent = speedKmh.toString();
    }
    if (this.gearIndicator) {
      this.gearIndicator.textContent = gear;
      this.gearIndicator.style.color = gearColor;
    }
    if (this.rpmBar) {
      this.rpmBar.style.width = `${Math.round(rpmRatio * 100)}%`;
      this.rpmBar.style.backgroundColor = gearColor;
    }

    const stamina = Math.round(driftStamina ?? 100);
    if (this.driftStaminaValue) {
      this.driftStaminaValue.textContent = `${stamina}%`;
    }
    if (this.driftStaminaBar) {
      this.driftStaminaBar.style.width = `${stamina}%`;
      if (isSpinningOut) {
        this.driftStaminaBar.style.backgroundColor = '#ef4444';
        if (this.driftStaminaValue) this.driftStaminaValue.style.color = '#ef4444';
      } else if (stamina > 45) {
        this.driftStaminaBar.style.backgroundColor = '#38bdf8';
        if (this.driftStaminaValue) this.driftStaminaValue.style.color = '#38bdf8';
      } else if (stamina > 20) {
        this.driftStaminaBar.style.backgroundColor = '#fbbf24';
        if (this.driftStaminaValue) this.driftStaminaValue.style.color = '#fbbf24';
      } else {
        this.driftStaminaBar.style.backgroundColor = '#f43f5e';
        if (this.driftStaminaValue) this.driftStaminaValue.style.color = '#f43f5e';
      }
    }

    if (this.driftBadge) {
      this.driftBadge.classList.remove('spinout', 'active');
      if (isSpinningOut) {
        this.driftBadge.classList.add('spinout');
        this.driftBadge.textContent = 'SPINOUT!';
      } else if (isDrifting) {
        this.driftBadge.classList.add('active');
        this.driftBadge.textContent = 'DRIFT_ACTIVE';
      } else {
        this.driftBadge.textContent = 'DRIFT_READY';
      }
    }
  }
}
