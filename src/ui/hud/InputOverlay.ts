import { keyBindingManager, type KeyAction } from '../../core/KeyBindingManager.ts';
import type { KeyInputState } from '../../types/game.ts';

/**
 * 조작 가이드 키 뱃지 및 실시간 키 입력 오버레이 전담 컴포넌트
 */
export class InputOverlay {
  private keyOverlay: HTMLElement | null;
  private keyCapThrottle: HTMLElement | null;
  private keyCapBrake: HTMLElement | null;
  private keyCapSteerL: HTMLElement | null;
  private keyCapSteerR: HTMLElement | null;
  private keyCapDrift: HTMLElement | null;

  constructor() {
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
    const setKey = (id: string, action: KeyAction) => {
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

  public update(gameMode: string, inputState?: KeyInputState): void {
    if (!this.keyOverlay) return;

    const showKeys = gameMode === 'DRIVING' || gameMode === 'DEMO';
    this.keyOverlay.style.display = showKeys ? 'flex' : 'none';

    if (showKeys && inputState) {
      this.keyCapThrottle?.classList.toggle('active', inputState.throttle);
      this.keyCapBrake?.classList.toggle('active', inputState.brake);
      this.keyCapSteerL?.classList.toggle('active', inputState.steerLeft);
      this.keyCapSteerR?.classList.toggle('active', inputState.steerRight);
      this.keyCapDrift?.classList.toggle('active', inputState.handbrake);
    }
  }
}
