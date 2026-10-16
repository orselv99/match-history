import * as THREE from 'three';
import type { Circuit } from '../game/Circuit.ts';
import type { Vehicle } from '../game/Vehicle.ts';
import type { CameraController } from './CameraController.ts';
import type { InputManager } from './InputManager.ts';

/**
 * 경기 시작 컷씬 컨트롤러
 * - 4대 머신의 피트 가레지/피트 레인 출차 -> 메인 스트레이트 각 슬롯(Pole, 2nd, 3rd, 4th) 도킹 시뮬레이션
 * - 플레이어의 직접 피트 출차 운전(W/A/S/D 입력 시 수동 전환) 지원
 */
export class StartCutsceneController {
  private circuit: Circuit;
  private cameraController: CameraController;
  private input: InputManager;

  public timer: number = 0;
  public readonly duration: number = 4.2;
  public isManualPitDriving: boolean = false;

  constructor(circuit: Circuit, cameraController: CameraController, input: InputManager) {
    this.circuit = circuit;
    this.cameraController = cameraController;
    this.input = input;
  }

  /**
   * 4대 레이스 머신 각각의 피트 베이 출차 -> 피트 레인 주행 -> 지정 그리드 슬롯 안착 궤적 연산
   */
  public computePitRolloutState(
    i: number,
    progress: number,
    halfW: number
  ): { x: number; z: number; headingOffset: number; speed: number } {
    const slotX = (i % 2 === 0) ? -2.2 : 2.2;
    const slotZ = -5.0 - i * 7.0; // -5.0, -12.0, -19.0, -26.0 (그리드 브래킷 위치와 일치)
    const startX = -(halfW + 6.8);
    const startZ = -28.0 - i * 8.0; // 피트 가레지 베이 앞 대기열 (-28, -36, -44, -52)
    const mergeZ = -18.0 - (3 - i) * 1.5;

    let curX = -(halfW + 5.5);
    let curZ = slotZ;
    let headingOffset = 0.0;
    let speed = 0.0;

    // 1구간: 피트 베이에서 피트 레인 중앙으로 조향 진입 (0.0 ~ 0.25)
    if (progress < 0.25) {
      const p1 = progress / 0.25;
      const ease1 = p1 * p1;
      curX = THREE.MathUtils.lerp(startX, -(halfW + 5.5), ease1);
      curZ = THREE.MathUtils.lerp(startZ, startZ + 8.0, p1);
      headingOffset = THREE.MathUtils.lerp(0.26, 0.0, ease1);
      speed = 7.0;
    }
    // 2구간: 피트 레인 직선 직진 주행 (0.25 ~ 0.58)
    else if (progress < 0.58) {
      const p2 = (progress - 0.25) / 0.33;
      curX = -(halfW + 5.5);
      curZ = THREE.MathUtils.lerp(startZ + 8.0, mergeZ, p2);
      headingOffset = 0.0;
      speed = 9.0;
    }
    // 3구간: 피트 출구 방호벽 개방 구간을 통해 메인 스트레이트 각 슬롯으로 합류 (0.58 ~ 0.88)
    else if (progress < 0.88) {
      const p3 = (progress - 0.58) / 0.30;
      const ease3 = 0.5 - 0.5 * Math.cos(p3 * Math.PI);
      curX = THREE.MathUtils.lerp(-(halfW + 5.5), slotX, ease3);
      curZ = THREE.MathUtils.lerp(mergeZ, slotZ, ease3);
      headingOffset = Math.sin(p3 * Math.PI) * 0.16;
      speed = THREE.MathUtils.lerp(9.0, 1.5, ease3);
    }
    // 4구간: 각 슬롯 화이트 브래킷 박스 안에 반듯하게 도킹 정차 (0.88 ~ 1.0)
    else {
      curX = slotX;
      curZ = slotZ;
      headingOffset = 0.0;
      speed = 0.0;
    }

    return { x: curX, z: curZ, headingOffset, speed };
  }

  public setup(getVehicle: (slotIndex: number) => Vehicle | null, isDrivingMode: boolean): void {
    this.timer = 0;
    this.isManualPitDriving = false;

    const halfW = this.circuit.circuitWidth / 2;

    for (let i = 0; i < 4; i++) {
      const v = getVehicle(i);
      if (!v) continue;
      const startState = this.computePitRolloutState(i, 0, halfW);
      const worldPos = this.circuit.getStartStraightWorldPosition(startState.x, startState.z);
      v.reset(worldPos.position, worldPos.heading + startState.headingOffset);
      v.speed = (i === 0 && isDrivingMode) ? 4.0 : startState.speed;
    }

    const leadVehicle = getVehicle(0);
    if (leadVehicle) {
      this.cameraController.updateStartCutscene(0.016, leadVehicle, 0);
    }
  }

  public update(
    delta: number,
    getVehicle: (slotIndex: number) => Vehicle | null,
    isDrivingMode: boolean,
    onComplete: () => void
  ): { leadVehicle: Vehicle | null; progress: number } {
    const halfW = this.circuit.circuitWidth / 2;
    const grid0 = this.circuit.getGridPosition(0);

    // 1. 유저 직접 운전 감지 (W/A/S/D 키 입력 시 피트 출차 직접 운전 모드로 즉시 전환)
    if (isDrivingMode) {
      this.input.update(delta);
      if (
        !this.isManualPitDriving &&
        (this.input.throttle > 0 || this.input.brake > 0 || Math.abs(this.input.steer) > 0.05)
      ) {
        this.isManualPitDriving = true;
      }
    }

    this.timer += delta;
    const progress = Math.min(1.0, this.timer / this.duration);

    const leadVehicle = getVehicle(0);

    // 4대 차량 각각 피트 출차 주행 갱신
    for (let i = 0; i < 4; i++) {
      const v = getVehicle(i);
      if (!v) continue;

      if (i === 0 && this.isManualPitDriving) {
        // 플레이어 직접 운전
        v.update(
          delta,
          this.input.throttle,
          this.input.brake,
          this.input.steer,
          this.input.handbrake,
          false
        );
      } else {
        const state = this.computePitRolloutState(i, progress, halfW);
        const world = this.circuit.getStartStraightWorldPosition(state.x, state.z);

        v.position.copy(world.position);
        v.heading = world.heading + state.headingOffset;
        v.mesh.position.copy(v.position);
        v.mesh.rotation.set(0, v.heading, 0);

        const wheelRot = (state.speed / 0.38) * delta;
        v.frontLeftWheel.rotation.x += wheelRot;
        v.frontRightWheel.rotation.x += wheelRot;
        v.rearLeftWheel.rotation.x += wheelRot;
        v.rearRightWheel.rotation.x += wheelRot;

        const steerAngle = -state.headingOffset * 1.5;
        v.frontLeftWheel.rotation.y = steerAngle;
        v.frontRightWheel.rotation.y = steerAngle;
      }
    }

    if (this.isManualPitDriving && leadVehicle) {
      this.cameraController.updateChase(delta, leadVehicle);

      const distToGrid = leadVehicle.position.distanceTo(grid0.position);
      if (distToGrid < 4.2 && leadVehicle.speed < 14.0) {
        onComplete();
      }
      return { leadVehicle, progress };
    }

    if (leadVehicle) {
      this.cameraController.updateStartCutscene(delta, leadVehicle, progress);
    }

    if (progress >= 1.0) {
      onComplete();
    }

    return { leadVehicle, progress };
  }

  public skip(getVehicle: (slotIndex: number) => Vehicle | null): Vehicle | null {
    this.isManualPitDriving = false;

    for (let i = 0; i < 4; i++) {
      const v = getVehicle(i);
      if (!v) continue;
      const grid = this.circuit.getGridPosition(i);
      v.reset(grid.position, grid.heading);
      v.speed = 0;
    }

    const leadVehicle = getVehicle(0);
    if (leadVehicle) {
      this.cameraController.updateChase(0.016, leadVehicle);
    }
    return leadVehicle;
  }
}
