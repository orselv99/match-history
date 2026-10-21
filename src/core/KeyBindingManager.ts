/**
 * 게임 키 조작 액션 종류
 */
export type KeyAction =
  | 'throttle'
  | 'brake'
  | 'steerLeft'
  | 'steerRight'
  | 'handbrake'
  | 'reset';

export type KeyPresetId = 'wasd' | 'arrows' | 'custom';

/**
 * 액션별 1:1 단일 키 바인딩 맵 (조합키 배제, 단일 키 규격)
 */
export interface KeyBindingMap {
  throttle: string;
  brake: string;
  steerLeft: string;
  steerRight: string;
  handbrake: string;
  reset: string;
}

const STORAGE_KEY = 'apex_keybindings_v3';

/**
 * 기본 프리셋 정의 (단일 키 매핑)
 * - wasd: W 가속, 우측 쉬프트(ShiftRight) 감속/후진, A/D 조향, SPACE 드리프트
 * - arrows: 화살표↑ 가속, 좌측 쉬프트(ShiftLeft) 감속/후진, 화살표←/→ 조향, SPACE 드리프트
 * - 공통: R 서킷 복귀
 */
const PRESETS: Record<'wasd' | 'arrows', KeyBindingMap> = {
  wasd: {
    throttle: 'KeyW',
    brake: 'ShiftRight',
    steerLeft: 'KeyA',
    steerRight: 'KeyD',
    handbrake: 'Space',
    reset: 'KeyR',
  },
  arrows: {
    throttle: 'ArrowUp',
    brake: 'ShiftLeft',
    steerLeft: 'ArrowLeft',
    steerRight: 'ArrowRight',
    handbrake: 'Space',
    reset: 'KeyR',
  },
};

/**
 * 키 조작 바인딩 매니저 (KeyBindingManager)
 * - 단일 키 1:1 매핑 규격 (WASD, 화살표 프리셋 및 완전 커스텀 키 지원)
 * - localStorage 자동 영구 저장 및 복원
 */
export class KeyBindingManager {
  private currentPreset: KeyPresetId = 'wasd';
  private bindings: KeyBindingMap;

  public onChangeCallbacks: Array<(bindings: KeyBindingMap, preset: KeyPresetId) => void> = [];

  constructor() {
    this.bindings = { ...PRESETS.wasd };
    this.loadFromStorage();
  }

  public getPreset(): KeyPresetId {
    return this.currentPreset;
  }

  public getBindings(): KeyBindingMap {
    return this.bindings;
  }

  public getActionKey(action: KeyAction): string {
    return this.bindings[action] || '';
  }

  public setPreset(preset: 'wasd' | 'arrows'): void {
    this.currentPreset = preset;
    this.bindings = { ...PRESETS[preset] };
    this.saveToStorage();
    this.notifyChange();
  }

  public setCustomActionKey(action: KeyAction, keyCode: string): void {
    this.currentPreset = 'custom';
    this.bindings[action] = keyCode;
    this.saveToStorage();
    this.notifyChange();
  }

  public isActionActive(action: KeyAction, keyState: Record<string, boolean>): boolean {
    const code = this.bindings[action];
    return !!(code && keyState[code]);
  }

  public isActionKey(action: KeyAction, keyCode: string): boolean {
    return this.bindings[action] === keyCode;
  }

  public formatKeyName(code: string): string {
    if (!code) return '--';
    if (code.startsWith('Key')) return code.substring(3);
    if (code.startsWith('Digit')) return code.substring(5);
    switch (code) {
      case 'ArrowUp': return '↑';
      case 'ArrowDown': return '↓';
      case 'ArrowLeft': return '←';
      case 'ArrowRight': return '→';
      case 'Space': return 'SPACE';
      case 'ShiftLeft': return 'L_SHIFT';
      case 'ShiftRight': return 'R_SHIFT';
      case 'ControlLeft': return 'L_CTRL';
      case 'ControlRight': return 'R_CTRL';
      case 'AltLeft': return 'L_ALT';
      case 'AltRight': return 'R_ALT';
      case 'Enter': return 'ENTER';
      case 'Backspace': return 'BACKSPACE';
      case 'Tab': return 'TAB';
      default: return code;
    }
  }

  public formatActionKey(action: KeyAction): string {
    const code = this.bindings[action];
    return this.formatKeyName(code);
  }

  public loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data.preset && data.bindings) {
          this.currentPreset = data.preset;
          this.bindings = {
            ...PRESETS.wasd,
            ...data.bindings,
          };
        }
      }
    } catch {
      // localStorage 접근 불가 시 기본값 유지
    }
  }

  public saveToStorage(): void {
    try {
      const data = {
        preset: this.currentPreset,
        bindings: this.bindings,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // ignore
    }
  }

  private notifyChange(): void {
    this.onChangeCallbacks.forEach((cb) => cb(this.bindings, this.currentPreset));
  }
}

// 글로벌 싱글톤 인스턴스 export
export const keyBindingManager = new KeyBindingManager();
