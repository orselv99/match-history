import * as THREE from 'three';
import type { RawReplayTick } from './ReplayTypes.ts';
import { Vehicle } from '../game/Vehicle.ts';
import type { VehicleModelId } from '../data/vehicles.ts';

/**
 * 3D 리플레이 & 고스트 카 플레이어
 * - Catmull-Rom 큐빅 스플라인 위치 보간
 * - 쿼터니언 Slerp 회전 보간으로 120/144fps 부드러운 궤적 복원
 */
export class ReplayPlayer {
  public ghostVehicle: Vehicle;
  public opponentVehicles: Vehicle[] = [];
  public isPlaying: boolean = false;
  public currentTimeMs: number = 0;
  public totalDurationMs: number = 0;
  public playbackSpeed: number = 1.0; // 0.5x, 1x, 2x

  private ticks: RawReplayTick[] = [];

  constructor() {
    this.ghostVehicle = new Vehicle(false, '#ef4444'); // 실차 외관의 3D 리플레이 차량
    this.ghostVehicle.mesh.visible = false;

    // 동승했던 라이벌 상대 차량 3대 인스턴스 초기화
    const defaultModels: VehicleModelId[] = [
      'formula_aero',
      'cyber_speedster',
      'lm_hypercar',
      'gt_turbo'
    ];
    for (let i = 0; i < 3; i++) {
      const v = new Vehicle(false, '#c45a72', defaultModels[i % defaultModels.length]);
      v.mesh.visible = false;
      this.opponentVehicles.push(v);
    }
  }

  public syncOpponents(configs: Array<{ vehicleModelId?: string; color?: string; driverName?: string }>): void {
    configs.forEach((cfg, idx) => {
      const v = this.opponentVehicles[idx];
      if (v) {
        if (cfg.vehicleModelId) v.setVehicleModel(cfg.vehicleModelId as any);
        if (cfg.color !== undefined) v.setColor(cfg.color);
        if (cfg.driverName) v.setNameTag(cfg.driverName, cfg.color || '#38bdf8');
      }
    });
  }

  public loadReplay(ticks: RawReplayTick[]): void {
    this.ticks = ticks;
    if (ticks.length > 0) {
      this.totalDurationMs = ticks[ticks.length - 1].timeMs;
      this.currentTimeMs = 0;
      // 데이터 로드 시에는 고스트 카를 숨겨둔 상태로 유지 (리플레이 모드 재생 시에만 활성화)
      this.ghostVehicle.mesh.visible = false;
      this.opponentVehicles.forEach(v => { v.mesh.visible = false; });
      this.seek(0);
    } else {
      this.totalDurationMs = 0;
      this.ghostVehicle.mesh.visible = false;
      this.opponentVehicles.forEach(v => { v.mesh.visible = false; });
    }
  }

  public onPlaybackEnd?: () => void;
  public onStateChange?: (isPlaying: boolean) => void;

  public play(): void {
    if (this.ticks.length > 0) {
      // 리플레이 끝에 도달해 있던 경우 처음부터 다시 재생
      if (this.currentTimeMs >= this.totalDurationMs) {
        this.currentTimeMs = 0;
      }
      this.isPlaying = true;
      this.ghostVehicle.mesh.visible = true;
      this.opponentVehicles.forEach(v => { v.mesh.visible = true; });
      this.onStateChange?.(true);
    }
  }

  public pause(): void {
    this.isPlaying = false;
    this.onStateChange?.(false);
  }

  public togglePlayPause(): boolean {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
    return this.isPlaying;
  }

  public hideGhost(): void {
    this.isPlaying = false;
    this.ghostVehicle.mesh.visible = false;
    this.opponentVehicles.forEach(v => { v.mesh.visible = false; });
    this.onStateChange?.(false);
  }

  public seek(timeMs: number): void {
    this.currentTimeMs = Math.max(0, Math.min(this.totalDurationMs, timeMs));
    this.updateTransformAtTime(this.currentTimeMs);
  }

  public update(deltaMs: number): void {
    if (!this.isPlaying || this.ticks.length < 2) return;

    this.currentTimeMs += deltaMs * this.playbackSpeed;

    if (this.currentTimeMs >= this.totalDurationMs) {
      // 연속 루프 재생 방지: 종료 지점에서 일시정지 후 재생 종료 이벤트 발생
      this.currentTimeMs = this.totalDurationMs;
      this.pause();
      this.updateTransformAtTime(this.currentTimeMs);
      this.onPlaybackEnd?.();
      return;
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

    this.ghostVehicle.position.set(interpX, interpY, interpZ);
    this.ghostVehicle.mesh.position.copy(this.ghostVehicle.position);

    // 회전: YXZ 오일러 각(Yaw, Pitch, Roll)을 쿼터니언 Slerp 보간하여 오르막/내리막 경사 각도까지 복원
    const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(t1.pitch || 0, t1.yaw, t1.roll || 0, 'YXZ'));
    const q2 = new THREE.Quaternion().setFromEuler(new THREE.Euler(t2.pitch || 0, t2.yaw, t2.roll || 0, 'YXZ'));
    const interpQuat = new THREE.Quaternion().slerpQuaternions(q1, q2, alpha);

    this.ghostVehicle.mesh.quaternion.copy(interpQuat);

    // 카메라 및 HUD 동기화를 위한 물리 변수 갱신
    const euler = new THREE.Euler().setFromQuaternion(interpQuat, 'YXZ');
    this.ghostVehicle.heading = euler.y;
    this.ghostVehicle.pitch = euler.x;

    const interpSpeedKmh = THREE.MathUtils.lerp(t1.speedKmh, t2.speedKmh, alpha);
    this.ghostVehicle.speed = interpSpeedKmh / 3.6;
    this.ghostVehicle.isDrifting = t1.isDrifting;

    const steer = THREE.MathUtils.lerp(t1.steer, t2.steer, alpha);
    if (this.ghostVehicle.frontLeftWheel && this.ghostVehicle.frontRightWheel) {
      this.ghostVehicle.frontLeftWheel.rotation.y = steer * 0.55;
      this.ghostVehicle.frontRightWheel.rotation.y = steer * 0.55;
    }

    // 동승했던 라이벌 경쟁 차량 3대 동시 3D 위치 및 회전 보간
    for (let k = 0; k < this.opponentVehicles.length; k++) {
      const opp1 = t1.opponents?.[k];
      const opp2 = t2.opponents?.[k];
      const oppVehicle = this.opponentVehicles[k];

      if (opp1 && opp2 && oppVehicle) {
        const oppX = THREE.MathUtils.lerp(opp1.x, opp2.x, alpha);
        const oppY = THREE.MathUtils.lerp(opp1.y, opp2.y, alpha);
        const oppZ = THREE.MathUtils.lerp(opp1.z, opp2.z, alpha);

        oppVehicle.position.set(oppX, oppY, oppZ);
        oppVehicle.mesh.position.copy(oppVehicle.position);

        const qOpp1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(opp1.pitch || 0, opp1.yaw, 0, 'YXZ'));
        const qOpp2 = new THREE.Quaternion().setFromEuler(new THREE.Euler(opp2.pitch || 0, opp2.yaw, 0, 'YXZ'));
        oppVehicle.mesh.quaternion.slerpQuaternions(qOpp1, qOpp2, alpha);

        const eulerOpp = new THREE.Euler().setFromQuaternion(oppVehicle.mesh.quaternion, 'YXZ');
        oppVehicle.heading = eulerOpp.y;
        oppVehicle.pitch = eulerOpp.x;

        const oppSpeedKmh = THREE.MathUtils.lerp(opp1.speedKmh, opp2.speedKmh, alpha);
        oppVehicle.speed = oppSpeedKmh / 3.6;
        oppVehicle.isDrifting = !!opp1.isDrifting;

        const wheelRot = (oppVehicle.speed / 0.38) * 0.033;
        if (oppVehicle.frontLeftWheel) oppVehicle.frontLeftWheel.rotation.x += wheelRot;
        if (oppVehicle.frontRightWheel) oppVehicle.frontRightWheel.rotation.x += wheelRot;
        if (oppVehicle.rearLeftWheel) oppVehicle.rearLeftWheel.rotation.x += wheelRot;
        if (oppVehicle.rearRightWheel) oppVehicle.rearRightWheel.rotation.x += wheelRot;
      }
    }
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

