import { keyBindingManager } from './KeyBindingManager.ts';

/**
 * 키보드 및 사용자 입력 관리자
 * - KeyBindingManager와 연동하여 프리셋(WASD / 방향키) 및 커스텀 키 지원
 */
export class InputManager {
  public throttle: number = 0;   // 0.0 ~ 1.0 (가속)
  public brake: number = 0;      // 0.0 ~ 1.0 (제동/후진)
  public steer: number = 0;      // -1.0 (좌) ~ 1.0 (우)
  public handbrake: boolean = false; // 드리프트 핸드브레이크
  public resetRequested: boolean = false; // 리셋 요청

  private keyState: Record<string, boolean> = {};

  constructor() {
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
  }

  private onKeyDown(e: KeyboardEvent): void {
    // 텍스트 인풋 포커스 중에는 게임 조작 키 입력 무시
    const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (targetTag === 'input' || targetTag === 'textarea') return;

    this.keyState[e.code] = true;

    if (keyBindingManager.isActionKey('reset', e.code)) {
      this.resetRequested = true;
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.keyState[e.code] = false;
  }

  /**
   * 프레임마다 입력 값 갱신 (KeyBindingManager 연동 및 부드러운 조향 보간)
   */
  public update(deltaSeconds: number): void {
    // 1. 가속 (Throttle)
    const isAccelerating = keyBindingManager.isActionActive('throttle', this.keyState);
    this.throttle = isAccelerating ? 1.0 : 0.0;

    // 2. 브레이크 / 후진 (Brake)
    const isBraking = keyBindingManager.isActionActive('brake', this.keyState);
    this.brake = isBraking ? 1.0 : 0.0;

    // 3. 조향 (Steer Left / Steer Right)
    let targetSteer = 0;
    if (keyBindingManager.isActionActive('steerLeft', this.keyState)) targetSteer -= 1.0;
    if (keyBindingManager.isActionActive('steerRight', this.keyState)) targetSteer += 1.0;

    // 조향 부드럽게 보간 (초당 9.0 속도)
    const steerSpeed = 9.0;
    this.steer += (targetSteer - this.steer) * Math.min(1.0, steerSpeed * deltaSeconds);

    // 4. 핸드브레이크 / 드리프트 (Handbrake)
    this.handbrake = keyBindingManager.isActionActive('handbrake', this.keyState);
  }

  public consumeReset(): boolean {
    if (this.resetRequested) {
      this.resetRequested = false;
      return true;
    }
    return false;
  }
}
