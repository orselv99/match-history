import { RawReplayTick } from './ReplayTypes.ts';
import { Vehicle } from '../game/Vehicle.ts';

/**
 * 30Hz 고주파 주행 리플레이 레코더
 */
export class ReplayRecorder {
  private ticks: RawReplayTick[] = [];
  private sampleIntervalMs: number = 33.333; // 30Hz
  private accumulatedMs: number = 0;
  private isRecording: boolean = false;
  private sessionElapsedMs: number = 0;

  public start(): void {
    this.ticks = [];
    this.accumulatedMs = 0;
    this.sessionElapsedMs = 0;
    this.isRecording = true;
  }

  public stop(): void {
    this.isRecording = false;
  }

  public update(
    deltaMs: number,
    vehicle: Vehicle,
    currentLap: number,
    steerInput: number,
    throttleInput: number,
    brakeInput: number,
    opponents?: Vehicle[]
  ): void {
    if (!this.isRecording) return;

    this.sessionElapsedMs += deltaMs;
    this.accumulatedMs += deltaMs;

    // 33.33ms (30Hz) 주기로 틱 샘플링
    while (this.accumulatedMs >= this.sampleIntervalMs) {
      this.accumulatedMs -= this.sampleIntervalMs;

      this.ticks.push({
        timeMs: Math.round(this.sessionElapsedMs),
        x: Number(vehicle.position.x.toFixed(3)),
        y: Number(vehicle.position.y.toFixed(3)),
        z: Number(vehicle.position.z.toFixed(3)),
        yaw: Number(vehicle.heading.toFixed(4)),
        pitch: 0,
        roll: Number(vehicle.mesh.rotation.z.toFixed(4)),
        speedKmh: Number(vehicle.getSpeedKmh().toFixed(1)),
        steer: Number(steerInput.toFixed(2)),
        throttle: Number(throttleInput.toFixed(2)),
        brake: Number(brakeInput.toFixed(2)),
        isDrifting: vehicle.isDrifting,
        lap: currentLap,
        opponents: opponents && opponents.length > 0
          ? opponents.map(opp => ({
              x: Number(opp.position.x.toFixed(3)),
              y: Number(opp.position.y.toFixed(3)),
              z: Number(opp.position.z.toFixed(3)),
              yaw: Number(opp.heading.toFixed(4)),
              speedKmh: Number(opp.getSpeedKmh().toFixed(1)),
              isDrifting: opp.isDrifting,
            }))
          : undefined,
      });
    }
  }

  public getTicks(): RawReplayTick[] {
    return this.ticks;
  }

  public getTickCount(): number {
    return this.ticks.length;
  }

  public clear(): void {
    this.ticks = [];
    this.accumulatedMs = 0;
    this.sessionElapsedMs = 0;
    this.isRecording = false;
  }
}

