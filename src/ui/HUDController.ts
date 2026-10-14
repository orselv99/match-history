import { GameUIState } from '../core/Game.ts';
import { keyBindingManager } from '../core/KeyBindingManager.ts';

/**
 * 인게임 헤드업 디스플레이(HUD) 갱신 및 애니메이션 전담 컨트롤러
 */
export class HUDController {
  private speedIndicator: HTMLElement | null;
  private gearIndicator: HTMLElement | null;
  private rpmBar: HTMLElement | null;
  private driftBadge: HTMLElement | null;

  private lapCounter: HTMLElement | null;
  private currentLapTime: HTMLElement | null;
  private bestLapTime: HTMLElement | null;
  private sectorChips: (HTMLElement | null)[];
  private lapCircuitTitle: HTMLElement | null;

  private countdownOverlay: HTMLElement | null;
  private countdownNumber: HTMLElement | null;

  constructor() {
    this.speedIndicator = document.getElementById('speed-indicator');
    this.gearIndicator = document.getElementById('gear-indicator');
    this.rpmBar = document.getElementById('rpm-bar');
    this.driftBadge = document.getElementById('drift-badge');

    this.lapCounter = document.getElementById('lap-counter');
    this.currentLapTime = document.getElementById('current-lap-time');
    this.bestLapTime = document.getElementById('best-lap-time');
    this.sectorChips = [
      document.getElementById('sector-1'),
      document.getElementById('sector-2'),
      document.getElementById('sector-3'),
    ];
    this.lapCircuitTitle = document.getElementById('lap-circuit-title');

    this.countdownOverlay = document.getElementById('countdown-overlay');
    this.countdownNumber = document.getElementById('countdown-number');

    // 조작 가이드 키 뱃지 동적 초기화 및 키 변경 감지 리스너 바인딩
    this.updateControlGuide();
    keyBindingManager.onChangeCallbacks.push(() => {
      this.updateControlGuide();
    });
  }

  public updateControlGuide(): void {
    const throttleEl = document.getElementById('guide-key-throttle');
    const brakeEl = document.getElementById('guide-key-brake');
    const steerLEl = document.getElementById('guide-key-steer-l');
    const steerREl = document.getElementById('guide-key-steer-r');
    const driftEl = document.getElementById('guide-key-drift');

    if (throttleEl) throttleEl.textContent = keyBindingManager.formatActionKey('throttle');
    if (brakeEl) brakeEl.textContent = keyBindingManager.formatActionKey('brake');
    if (steerLEl) steerLEl.textContent = keyBindingManager.formatActionKey('steerLeft');
    if (steerREl) steerREl.textContent = keyBindingManager.formatActionKey('steerRight');
    if (driftEl) driftEl.textContent = keyBindingManager.formatActionKey('handbrake');
  }

  public setCircuitTitle(title: string): void {
    if (this.lapCircuitTitle) {
      this.lapCircuitTitle.textContent = title.toUpperCase();
    }
  }

  public update(state: GameUIState): void {
    if (this.speedIndicator) {
      this.speedIndicator.textContent = state.speedKmh.toString();
    }
    if (this.gearIndicator) {
      this.gearIndicator.textContent = state.gear;
    }
    if (this.rpmBar) {
      this.rpmBar.style.width = `${Math.round(state.rpmRatio * 100)}%`;
    }

    if (this.driftBadge) {
      if (state.isDrifting) {
        this.driftBadge.classList.add('active');
        this.driftBadge.textContent = 'DRIFT_ACTIVE';
      } else {
        this.driftBadge.classList.remove('active');
        this.driftBadge.textContent = 'DRIFT_OFF';
      }
    }

    if (this.lapCounter) {
      const cur = state.currentLap.toString().padStart(2, '0');
      const tot = state.totalLaps.toString().padStart(2, '0');
      this.lapCounter.textContent = `LAP ${cur} / ${tot}`;
    }
    if (this.currentLapTime) {
      this.currentLapTime.textContent = state.currentLapTimeStr;
    }
    if (this.bestLapTime) {
      this.bestLapTime.textContent = state.bestLapTimeStr;
    }

    // 카운트다운 오버레이 갱신
    if (this.countdownOverlay && this.countdownNumber) {
      if (state.countdownVisible) {
        this.countdownOverlay.classList.add('visible');
        this.countdownNumber.textContent = state.countdownText || '';
        if (state.countdownText === 'GO!') {
          this.countdownNumber.classList.add('highlight');
        } else {
          this.countdownNumber.classList.remove('highlight');
        }
      } else {
        this.countdownOverlay.classList.remove('visible');
      }
    }

    // 섹터 표시
    state.sectorsMs.forEach((sMs, idx) => {
      const chip = this.sectorChips[idx];
      if (!chip) return;
      if (sMs > 0) {
        chip.textContent = `S${idx + 1}: ${(sMs / 1000).toFixed(2)}s`;
        chip.classList.add('passed');
      } else {
        chip.textContent = `S${idx + 1}: --.-s`;
        chip.classList.remove('passed');
      }
    });
  }
}
