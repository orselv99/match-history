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
  }

  public triggerShake(intensity: number): void {
    this.cameraShakeIntensity = Math.min(1.0, Math.max(0.4, intensity));
  }

  public setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
