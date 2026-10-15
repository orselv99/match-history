import * as THREE from 'three';
import { Vehicle } from '../game/Vehicle.ts';

/**
 * 3D 체이스 카메라 및 다이내믹 카메라 쉐이크 전담 컨트롤러
 */
export class CameraController {
  public camera: THREE.PerspectiveCamera;
  private cameraLookTarget: THREE.Vector3 = new THREE.Vector3();
  private cameraShakeIntensity: number = 0;

  constructor(fov = 65, aspect = 16 / 9, near = 0.1, far = 1000) {
    this.camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
  }

  public updateChase(delta: number, targetVehicle: Vehicle): void {
    const heading = targetVehicle.heading + targetVehicle.slipAngle;
    const sinH = Math.sin(heading);
    const cosH = Math.cos(heading);

    const targetCamPos = new THREE.Vector3(
      targetVehicle.position.x - sinH * 8.5,
      targetVehicle.position.y + 4.2,
      targetVehicle.position.z - cosH * 8.5
    );

    this.camera.position.lerp(targetCamPos, Math.min(1.0, 9.0 * delta));

    this.cameraLookTarget.set(
      targetVehicle.position.x + sinH * 4.0,
      targetVehicle.position.y + 1.2,
      targetVehicle.position.z + cosH * 4.0
    );
    this.camera.lookAt(this.cameraLookTarget);

    // 충돌 시 다이내믹 카메라 쉐이크(Camera Shake) 감쇠 적용
    if (this.cameraShakeIntensity > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.cameraShakeIntensity * 1.6;
      this.camera.position.y += (Math.random() - 0.5) * this.cameraShakeIntensity * 1.4;
      this.camera.position.z += (Math.random() - 0.5) * this.cameraShakeIntensity * 1.6;
      this.cameraShakeIntensity *= Math.max(0, 1.0 - 7.5 * delta);
    }

    // 100km/h 및 200km/h 초과 시 시각적 속도감 극대화를 위한 다이내믹 FOV 왜곡
    const speedKmh = targetVehicle.getSpeedKmh();
    let targetFov = 65;
    if (speedKmh > 95) {
      // 100km/h: ~68°, 200km/h: 80°~82°
      const fovBoost = Math.min(17, (speedKmh - 95) * 0.14);
      targetFov = 65 + fovBoost;
    }

    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1.0, 4.5 * delta);
      this.camera.updateProjectionMatrix();
    }

    // 185km/h 초과 시 에어로다이내믹 고속 주행 진동 미세 쉐이크
    if (speedKmh > 185) {
      const aeroShake = Math.min(0.045, (speedKmh - 185) * 0.0008);
      this.camera.position.x += (Math.random() - 0.5) * aeroShake;
      this.camera.position.y += (Math.random() - 0.5) * aeroShake * 0.7;
      this.camera.position.z += (Math.random() - 0.5) * aeroShake;
    }
  }

  public triggerShake(intensity: number): void {
    this.cameraShakeIntensity = Math.min(1.0, Math.max(0.4, intensity));
  }

  public setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
