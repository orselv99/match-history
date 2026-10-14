import * as THREE from 'three';
import { RawReplayTick } from './ReplayTypes.ts';
import { Vehicle } from '../game/Vehicle.ts';

/**
 * 3D 리플레이 & 고스트 카 플레이어
 * - Catmull-Rom 큐빅 스플라인 위치 보간
 * - 쿼터니언 Slerp 회전 보간으로 120/144fps 부드러운 궤적 복원
 */
export class ReplayPlayer {
  public ghostVehicle: Vehicle;
  public isPlaying: boolean = false;
  public currentTimeMs: number = 0;
  public totalDurationMs: number = 0;
  public playbackSpeed: number = 1.0; // 0.5x, 1x, 2x

  private ticks: RawReplayTick[] = [];

  constructor() {
    this.ghostVehicle = new Vehicle(true, 0x06b6d4); // 반투명 사이언 고스트 카
    this.ghostVehicle.mesh.visible = false;
  }

  public loadReplay(ticks: RawReplayTick[]): void {
    this.ticks = ticks;
    if (ticks.length > 0) {
      this.totalDurationMs = ticks[ticks.length - 1].timeMs;
      this.currentTimeMs = 0;
      // 데이터 로드 시에는 고스트 카를 숨겨둔 상태로 유지 (리플레이 모드 재생 시에만 활성화)
      this.ghostVehicle.mesh.visible = false;
      this.seek(0);
    } else {
      this.totalDurationMs = 0;
      this.ghostVehicle.mesh.visible = false;
    }
  }

  public play(): void {
    if (this.ticks.length > 0) {
      this.isPlaying = true;
      this.ghostVehicle.mesh.visible = true;
    }
  }

  public pause(): void {
    this.isPlaying = false;
  }

  public hideGhost(): void {
    this.isPlaying = false;
    this.ghostVehicle.mesh.visible = false;
  }

  public seek(timeMs: number): void {
    this.currentTimeMs = Math.max(0, Math.min(this.totalDurationMs, timeMs));
    this.updateTransformAtTime(this.currentTimeMs);
  }

  public update(deltaMs: number): void {
    if (!this.isPlaying || this.ticks.length < 2) return;

    this.currentTimeMs += deltaMs * this.playbackSpeed;

    if (this.currentTimeMs >= this.totalDurationMs) {
      // 리플레이 루프 또는 정지
      this.currentTimeMs = 0;
    }

    this.updateTransformAtTime(this.currentTimeMs);
  }

  /**
   * Catmull-Rom 스플라인 보간으로 임의 시간 t의 3D Transform 복원
   */
  private updateTransformAtTime(targetTimeMs: number): void {
    if (this.ticks.length === 0) return;

    // 이진 탐색으로 현재 시간의 전후 틱 인덱스 탐색
    let low = 0;
    let high = this.ticks.length - 1;
    let index = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.ticks[mid].timeMs <= targetTimeMs) {
        index = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const i1 = index;
    const i2 = Math.min(this.ticks.length - 1, i1 + 1);

    const t1 = this.ticks[i1];
    const t2 = this.ticks[i2];

    const segmentDuration = t2.timeMs - t1.timeMs;
    const alpha = segmentDuration > 0 ? (targetTimeMs - t1.timeMs) / segmentDuration : 0;

    // Catmull-Rom을 위한 4개 제어점 (i0, i1, i2, i3)
    const i0 = Math.max(0, i1 - 1);
    const i3 = Math.min(this.ticks.length - 1, i2 + 1);

    const p0 = this.ticks[i0];
    const p3 = this.ticks[i3];

    // X, Y, Z 각각 큐빅 스플라인 보간
    const interpX = this.catmullRom(p0.x, t1.x, t2.x, p3.x, alpha);
    const interpY = this.catmullRom(p0.y, t1.y, t2.y, p3.y, alpha);
    const interpZ = this.catmullRom(p0.z, t1.z, t2.z, p3.z, alpha);

    this.ghostVehicle.mesh.position.set(interpX, interpY, interpZ);

    // 회전: 각도 언래핑 후 Slerp 보간
    const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t1.yaw);
    const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t2.yaw);
    const interpQuat = new THREE.Quaternion().slerpQuaternions(q1, q2, alpha);

    this.ghostVehicle.mesh.quaternion.copy(interpQuat);
  }

  /**
   * Catmull-Rom 큐빅 스플라인 1차원 계산
   */
  private catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
    const v0 = (p2 - p0) * 0.5;
    const v1 = (p3 - p1) * 0.5;
    const t2 = t * t;
    const t3 = t * t2;
    return (2 * p1 - 2 * p2 + v0 + v1) * t3 + (-3 * p1 + 3 * p2 - 2 * v0 - v1) * t2 + v0 * t + p1;
  }

  public getCurrentTick(): RawReplayTick | null {
    if (this.ticks.length === 0) return null;
    const idx = Math.min(this.ticks.length - 1, Math.floor((this.currentTimeMs / this.totalDurationMs) * this.ticks.length));
    return this.ticks[idx] || null;
  }
}

