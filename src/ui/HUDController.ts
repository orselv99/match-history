import { GameUIState } from '../core/Game.ts';
import { keyBindingManager } from '../core/KeyBindingManager.ts';

const GEAR_COLORS: Record<string, string> = {
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
  private lapCircuitTitle: HTMLElement | null;

  private countdownOverlay: HTMLElement | null;
  private countdownNumber: HTMLElement | null;

  private sectorTextContainer: HTMLElement | null;

  private keyOverlay: HTMLElement | null;
  private keyCapThrottle: HTMLElement | null;
  private keyCapBrake: HTMLElement | null;
  private keyCapSteerL: HTMLElement | null;
  private keyCapSteerR: HTMLElement | null;
  private keyCapDrift: HTMLElement | null;

  constructor() {
    this.speedIndicator = document.getElementById('speed-indicator');
    this.gearIndicator = document.getElementById('gear-indicator');
    this.rpmBar = document.getElementById('rpm-bar');
    this.driftBadge = document.getElementById('drift-badge');

    this.lapCounter = document.getElementById('lap-counter');
    this.currentLapTime = document.getElementById('current-lap-time');
    this.bestLapTime = document.getElementById('best-lap-time');
    this.lapCircuitTitle = document.getElementById('lap-circuit-title');

    this.countdownOverlay = document.getElementById('countdown-overlay');
    this.countdownNumber = document.getElementById('countdown-number');

    this.sectorTextContainer = document.getElementById('sector-text-container');

    this.keyOverlay = document.getElementById('key-overlay');
    this.keyCapThrottle = document.getElementById('key-cap-throttle');
    this.keyCapBrake = document.getElementById('key-cap-brake');
    this.keyCapSteerL = document.getElementById('key-cap-steer-l');
    this.keyCapSteerR = document.getElementById('key-cap-steer-r');
    this.keyCapDrift = document.getElementById('key-cap-drift');

    // 조작 가이드 키 뱃지 동적 초기화 및 키 변경 감지 리스너 바인딩
    this.updateControlGuide();
    keyBindingManager.onChangeCallbacks.push(() => {
      this.updateControlGuide();
    });
  }

  public updateControlGuide(): void {
    const setKey = (id: string, action: import('../core/KeyBindingManager.ts').KeyAction) => {
      const el = document.getElementById(id);
      if (!el) return;
      const text = keyBindingManager.formatActionKey(action);
      el.textContent = text;
      el.classList.toggle('compact', text.length > 2);
    };

    setKey('key-cap-throttle-letter', 'throttle');
    setKey('key-cap-brake-letter', 'brake');
    setKey('key-cap-steer-l-letter', 'steerLeft');
    setKey('key-cap-steer-r-letter', 'steerRight');
    setKey('key-cap-drift-letter', 'handbrake');
  }

  public setCircuitTitle(title: string): void {
    if (this.lapCircuitTitle) {
      this.lapCircuitTitle.textContent = title.toUpperCase();
    }
  }

  public update(state: GameUIState): void {
    const gearColor = GEAR_COLORS[state.gear] || '#c45a72';

    if (this.speedIndicator) {
      this.speedIndicator.textContent = state.speedKmh.toString();
    }
    if (this.gearIndicator) {
      this.gearIndicator.textContent = state.gear;
      this.gearIndicator.style.color = gearColor;
    }
    if (this.rpmBar) {
      this.rpmBar.style.width = `${Math.round(state.rpmRatio * 100)}%`;
      this.rpmBar.style.backgroundColor = gearColor;
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

    // 키 오버레이 가시성 및 실시간 활성화 상태 업데이트 (AI 주행 모드 포함)
    if (this.keyOverlay) {
      const showKeys = state.gameMode === 'DRIVING' || state.gameMode === 'DEMO';
      this.keyOverlay.style.display = showKeys ? 'flex' : 'none';

      if (showKeys && state.inputState) {
        this.keyCapThrottle?.classList.toggle('active', state.inputState.throttle);
        this.keyCapBrake?.classList.toggle('active', state.inputState.brake);
        this.keyCapSteerL?.classList.toggle('active', state.inputState.steerLeft);
        this.keyCapSteerR?.classList.toggle('active', state.inputState.steerRight);
        this.keyCapDrift?.classList.toggle('active', state.inputState.handbrake);
      }
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

    // 로비 또는 준비 상태 진입 시 섹터 텍스트 초기화
    if (state.raceState === 'READY' || state.gameMode === 'TITLE') {
      this.resetSectorNotification();
    }
  }

  /**
   * 서킷 정보 카드 상단에 섹터/도착선 통과 텍스트 알림 표시 (순수 텍스트, 통과 순서대로 누적 후 페이드아웃)
   */
  public showSectorNotification(driverName: string, sectorName: string, timeMs: number): void {
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

  public resetSectorNotification(): void {
    if (this.sectorTextContainer) {
      this.sectorTextContainer.innerHTML = '';
    }
  }
}
