/**
 * 키보드 및 사용자 입력 관리자
 */
export class InputManager {
  public throttle: number = 0;   // 0.0 ~ 1.0 (가속)
  public brake: number = 0;      // 0.0 ~ 1.0 (제동/후진)
  public steer: number = 0;      // -1.0 (좌) ~ 1.0 (우)
  public handbrake: boolean = false; // 드리프트 핸드브레이크
  public resetRequested: boolean = false; // R 키 리셋 요청

  private keyState: Record<string, boolean> = {};

  constructor() {
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
  }

  private onKeyDown(e: KeyboardEvent): void {
    this.keyState[e.code] = true;

    if (e.code === 'KeyR') {
      this.resetRequested = true;
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.keyState[e.code] = false;
  }

  /**
   * 프레임마다 입력 값 갱신 (부드러운 조향 보간)
   */
  public update(deltaSeconds: number): void {
    // 1. 가속 (W / ArrowUp)
    const forward = this.keyState['KeyW'] || this.keyState['ArrowUp'] ? 1.0 : 0.0;
    this.throttle = forward;

    // 2. 브레이크 / 후진 (S / ArrowDown)
    const backward = this.keyState['KeyS'] || this.keyState['ArrowDown'] ? 1.0 : 0.0;
    this.brake = backward;

    // 3. 조향 (A / D / ArrowLeft / ArrowRight)
    let targetSteer = 0;
    if (this.keyState['KeyA'] || this.keyState['ArrowLeft']) targetSteer -= 1.0;
    if (this.keyState['KeyD'] || this.keyState['ArrowRight']) targetSteer += 1.0;

    // 조향 부드럽게 보간 (초당 8.0 속도로 이동)
    const steerSpeed = 9.0;
    this.steer += (targetSteer - this.steer) * Math.min(1.0, steerSpeed * deltaSeconds);

    // 4. 핸드브레이크 (Space)
    this.handbrake = !!this.keyState['Space'];
  }

  public consumeReset(): boolean {
    if (this.resetRequested) {
      this.resetRequested = false;
      return true;
    }
    return false;
  }
}
