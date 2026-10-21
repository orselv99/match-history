import * as THREE from 'three';

export type GameLoopTickHandler = (delta: number, deltaMs: number) => void;

/**
 * 프레임 렌더 및 물리 틱 루프 전담 매니저
 * - requestAnimationFrame 생명주기 관리
 * - 탭 전환 및 렉 발생 시 물리 폭주를 막는 Delta Time Clamping (최대 100ms)
 */
export class GameLoop {
  private clock: THREE.Clock;
  private animId: number | null = null;
  private isLoopRunning: boolean = false;
  private tickHandler: GameLoopTickHandler | null = null;
  public lastDelta: number = 0.016;

  constructor() {
    this.clock = new THREE.Clock();
  }

  public setTickHandler(handler: GameLoopTickHandler): void {
    this.tickHandler = handler;
  }

  public start(): void {
    if (this.isLoopRunning) return;
    this.isLoopRunning = true;
    this.clock.start();

    const loop = () => {
      if (!this.isLoopRunning) return;
      this.animId = requestAnimationFrame(loop);

      const delta = Math.min(this.clock.getDelta(), 0.1);
      this.lastDelta = delta;
      const deltaMs = delta * 1000;

      if (this.tickHandler) {
        this.tickHandler(delta, deltaMs);
      }
    };

    this.animId = requestAnimationFrame(loop);
  }

  public stop(): void {
    this.isLoopRunning = false;
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  public isRunning(): boolean {
    return this.isLoopRunning;
  }
}
