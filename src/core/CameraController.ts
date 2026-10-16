import * as THREE from 'three';
import { Vehicle } from '../game/Vehicle.ts';

/**
 * 3D 체이스 카메라 및 다이내믹 카메라 쉐이크 전담 컨트롤러
 */
export class CameraController {
  public camera: THREE.PerspectiveCamera;
  private cameraLookTarget: THREE.Vector3 = new THREE.Vector3();
  private cameraShakeIntensity: number = 0;

  // 그래픽/멀미 방지 설정
  private dynamicFovEnabled: boolean = true;
  private shakeMode: 'FULL' | 'REDUCED' | 'OFF' = 'FULL';

  constructor(fov = 65, aspect = 16 / 9, near = 0.1, far = 1000) {
    this.camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
  }

  public snapToTarget(targetVehicle: Vehicle): void {
    const heading = targetVehicle.heading + targetVehicle.slipAngle;
    const sinH = Math.sin(heading);
    const cosH = Math.cos(heading);
    const pitchLookOffset = -Math.sin(targetVehicle.pitch) * 3.5;

    this.camera.position.set(
      targetVehicle.position.x - sinH * 8.5,
      targetVehicle.position.y + 4.2,
      targetVehicle.position.z - cosH * 8.5
    );

    this.cameraLookTarget.set(
      targetVehicle.position.x + sinH * 4.0,
      targetVehicle.position.y + 1.2 + pitchLookOffset,
      targetVehicle.position.z + cosH * 4.0
    );
    this.camera.lookAt(this.cameraLookTarget);
  }

  public updateChase(delta: number, targetVehicle: Vehicle): void {
    const heading = targetVehicle.heading + targetVehicle.slipAngle;
    const sinH = Math.sin(heading);
    const cosH = Math.cos(heading);
    const pitchLookOffset = -Math.sin(targetVehicle.pitch) * 3.5;

    const targetCamPos = new THREE.Vector3(
      targetVehicle.position.x - sinH * 8.5,
      targetVehicle.position.y + 4.2,
      targetVehicle.position.z - cosH * 8.5
    );

    this.camera.position.lerp(targetCamPos, Math.min(1.0, 9.0 * delta));

    this.cameraLookTarget.set(
      targetVehicle.position.x + sinH * 4.0,
      targetVehicle.position.y + 1.2 + pitchLookOffset,
      targetVehicle.position.z + cosH * 4.0
    );
    this.camera.lookAt(this.cameraLookTarget);

    // 충돌 시 다이내믹 카메라 쉐이크(Camera Shake) 감쇠 적용
    if (this.shakeMode !== 'OFF' && this.cameraShakeIntensity > 0.001) {
      const mult = this.shakeMode === 'REDUCED' ? 0.4 : 1.0;
      this.camera.position.x += (Math.random() - 0.5) * this.cameraShakeIntensity * 1.6 * mult;
      this.camera.position.y += (Math.random() - 0.5) * this.cameraShakeIntensity * 1.4 * mult;
      this.camera.position.z += (Math.random() - 0.5) * this.cameraShakeIntensity * 1.6 * mult;
      this.cameraShakeIntensity *= Math.max(0, 1.0 - 7.5 * delta);
    }

    // 100km/h 및 200km/h 초과 시 시각적 속도감 극대화를 위한 다이내믹 FOV 왜곡
    const speedKmh = targetVehicle.getSpeedKmh();
    let targetFov = 65;
    if (this.dynamicFovEnabled && speedKmh > 95) {
      // 100km/h: ~68°, 200km/h: 80°~82°
      const fovBoost = Math.min(17, (speedKmh - 95) * 0.14);
      targetFov = 65 + fovBoost;
    }

    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1.0, 4.5 * delta);
      this.camera.updateProjectionMatrix();
    }

    // 185km/h 초과 시 에어로다이내믹 고속 주행 진동 미세 쉐이크
    if (this.shakeMode !== 'OFF' && speedKmh > 185) {
      const mult = this.shakeMode === 'REDUCED' ? 0.4 : 1.0;
      const aeroShake = Math.min(0.045, (speedKmh - 185) * 0.0008) * mult;
      this.camera.position.x += (Math.random() - 0.5) * aeroShake;
      this.camera.position.y += (Math.random() - 0.5) * aeroShake * 0.7;
      this.camera.position.z += (Math.random() - 0.5) * aeroShake;
    }
  }

  public triggerShake(intensity: number): void {
    if (this.shakeMode === 'OFF') return;
    const mult = this.shakeMode === 'REDUCED' ? 0.4 : 1.0;
    this.cameraShakeIntensity = Math.min(1.0, Math.max(0.4, intensity * mult));
  }

  public setDynamicFovEnabled(enabled: boolean): void {
    this.dynamicFovEnabled = enabled;
    if (!enabled) {
      this.camera.fov = 65;
      this.camera.updateProjectionMatrix();
    }
  }

  public setShakeMode(mode: 'FULL' | 'REDUCED' | 'OFF'): void {
    this.shakeMode = mode;
    if (mode === 'OFF') {
      this.cameraShakeIntensity = 0;
    }
  }

  public setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /**
   * 레이스 완주 컷씬 카메라:
   * - 결승선 통과 즉시 정면 프론트 뷰로 컷 전환 (방송 중계 연출)
   * - 차량을 화면 좌측에 안정적으로 고정 배치하여 우측 결과 모달과 분리
   */
  public snapFinishCutscene(winnerVehicle: Vehicle): void {
    const heading = winnerVehicle.heading;
    const sinH = Math.sin(heading);
    const cosH = Math.cos(heading);
    const rightX = cosH;
    const rightZ = -sinH;

    const targetCamPos = new THREE.Vector3(
      winnerVehicle.position.x + sinH * 5.4 - rightX * 0.8,
      winnerVehicle.position.y + 1.2,
      winnerVehicle.position.z + cosH * 5.4 - rightZ * 0.8
    );

    const targetLook = new THREE.Vector3(
      winnerVehicle.position.x + rightX * 2.0,
      winnerVehicle.position.y + 0.85,
      winnerVehicle.position.z + rightZ * 2.0
    );

    this.camera.position.copy(targetCamPos);
    this.cameraLookTarget.copy(targetLook);
    this.camera.lookAt(this.cameraLookTarget);
    this.camera.fov = 55;
    this.camera.updateProjectionMatrix();
  }

  public updateFinishCutscene(delta: number, winnerVehicle: Vehicle): void {
    const heading = winnerVehicle.heading;
    const sinH = Math.sin(heading);
    const cosH = Math.cos(heading);
    const rightX = cosH;
    const rightZ = -sinH;

    const targetCamPos = new THREE.Vector3(
      winnerVehicle.position.x + sinH * 5.4 - rightX * 0.8,
      winnerVehicle.position.y + 1.2,
      winnerVehicle.position.z + cosH * 5.4 - rightZ * 0.8
    );

    const targetLook = new THREE.Vector3(
      winnerVehicle.position.x + rightX * 2.0,
      winnerVehicle.position.y + 0.85,
      winnerVehicle.position.z + rightZ * 2.0
    );

    // 감속 및 정지 중인 차량을 안정적으로 트래킹
    this.camera.position.lerp(targetCamPos, Math.min(1.0, 10.0 * delta));
    this.cameraLookTarget.lerp(targetLook, Math.min(1.0, 10.0 * delta));
    this.camera.lookAt(this.cameraLookTarget);

    if (this.camera.fov !== 55) {
      this.camera.fov = 55;
      this.camera.updateProjectionMatrix();
    }
  }

  /**
   * 레이스 출발 컷씬 카메라: 피트에서 나와 출발 그리드로 진입하는 차량을 역동적으로 트래킹
   */
  public updateStartCutscene(delta: number, vehicle: Vehicle, progress: number): void {
    const heading = vehicle.heading;
    const sinH = Math.sin(heading);
    const cosH = Math.cos(heading);
    const rightX = cosH;
    const rightZ = -sinH;

    // 0.0 ~ 0.35: 피트 출차 전면/측면 로우앵글 -> 0.35 ~ 1.0: 후방 체이스 카메라로 자연스럽게 스윙 전환
    let targetCamPos: THREE.Vector3;
    let targetLook: THREE.Vector3;

    if (progress < 0.35) {
      const p = progress / 0.35;
      const frontDist = 5.6 - p * 1.2;
      const sideDist = 3.2 - p * 1.2;
      targetCamPos = new THREE.Vector3(
        vehicle.position.x + sinH * frontDist + rightX * sideDist,
        vehicle.position.y + 1.2 + p * 0.3,
        vehicle.position.z + cosH * frontDist + rightZ * sideDist
      );
      targetLook = new THREE.Vector3(
        vehicle.position.x,
        vehicle.position.y + 0.8,
        vehicle.position.z
      );
    } else {
      const p = (progress - 0.35) / 0.65;
      const ease = 0.5 - 0.5 * Math.cos(p * Math.PI);
      const camDist = 5.2 + ease * 1.8;
      const sideOffset = (1.0 - ease) * 1.8;
      targetCamPos = new THREE.Vector3(
        vehicle.position.x - sinH * camDist + rightX * sideOffset,
        vehicle.position.y + 1.5 + ease * 0.9,
        vehicle.position.z - cosH * camDist + rightZ * sideOffset
      );
      targetLook = new THREE.Vector3(
        vehicle.position.x + sinH * 4.0,
        vehicle.position.y + 0.9,
        vehicle.position.z + cosH * 4.0
      );
    }

    this.camera.position.lerp(targetCamPos, Math.min(1.0, 10.0 * delta));
    this.cameraLookTarget.lerp(targetLook, Math.min(1.0, 10.0 * delta));
    this.camera.lookAt(this.cameraLookTarget);

    if (this.camera.fov !== 60) {
      this.camera.fov = 60;
      this.camera.updateProjectionMatrix();
    }
  }
}
