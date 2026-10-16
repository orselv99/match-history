import * as THREE from 'three';
import type { Vehicle } from '../game/Vehicle.ts';

/**
 * 3D 좌/우 사이드 미러 렌더러 (하드웨어 가속 뷰포트 Scissor 테스트 기반)
 */
export class MirrorRenderer {
  private renderer: THREE.WebGLRenderer;
  private leftMirrorCamera: THREE.PerspectiveCamera;
  private rightMirrorCamera: THREE.PerspectiveCamera;
  public shouldRenderMirrors: boolean = false;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    // 좌/우 백미러 카메라 (사이드 미러 비율 220:116, FOV 52도)
    this.leftMirrorCamera = new THREE.PerspectiveCamera(52, 220 / 116, 0.2, 140);
    this.rightMirrorCamera = new THREE.PerspectiveCamera(52, 220 / 116, 0.2, 140);
  }

  public deactivate(): void {
    if (!this.shouldRenderMirrors) return;
    this.shouldRenderMirrors = false;
    const leftFrame = document.getElementById('left-mirror-frame');
    const rightFrame = document.getElementById('right-mirror-frame');
    if (leftFrame) leftFrame.classList.remove('active', 'danger');
    if (rightFrame) rightFrame.classList.remove('active', 'danger');
  }

  public update(targetVehicle: Vehicle, opponents: Vehicle[], isDrivingOrDemo: boolean): void {
    const leftFrame = document.getElementById('left-mirror-frame');
    const rightFrame = document.getElementById('right-mirror-frame');
    const leftDistEl = document.getElementById('left-mirror-dist');
    const rightDistEl = document.getElementById('right-mirror-dist');

    if (!leftFrame || !rightFrame) {
      this.shouldRenderMirrors = false;
      return;
    }

    if (!isDrivingOrDemo) {
      this.deactivate();
      return;
    }

    const heading = targetVehicle.heading + targetVehicle.slipAngle;
    const fwdX = Math.sin(heading);
    const fwdZ = Math.cos(heading);
    const rightX = -Math.cos(heading);
    const rightZ = Math.sin(heading);

    const targetPos = targetVehicle.position;

    let nearestLeftDist = Infinity;
    let nearestRightDist = Infinity;
    let hasVehicleBehind = false;

    const myRearFore = 2.25;
    const oppFrontFore = 2.25;

    for (const opp of opponents) {
      const dx = opp.position.x - targetPos.x;
      const dz = opp.position.z - targetPos.z;
      const fwdProj = dx * fwdX + dz * fwdZ;     // 양수면 전방, 음수면 후방
      const latProj = dx * rightX + dz * rightZ; // 양수면 우측(+), 음수면 좌측(-)

      // 후방 60m 이내 및 서킷 도로 폭 반경(좌우 12m 이내)에 위치한 후방 차량만 백미러 유효 감지
      if (fwdProj < 1.0 && fwdProj > -60.0 && Math.abs(latProj) < 12.0) {
        hasVehicleBehind = true;

        const longitudinalDist = Math.max(0, -fwdProj - (myRearFore + oppFrontFore));
        const lateralDist = Math.max(0, Math.abs(latProj) - 1.8);
        const bumperDist = Math.hypot(longitudinalDist, lateralDist);

        if (latProj <= 0.8) {
          if (bumperDist < nearestLeftDist) nearestLeftDist = bumperDist;
        }
        if (latProj >= -0.8) {
          if (bumperDist < nearestRightDist) nearestRightDist = bumperDist;
        }
      }
    }

    this.shouldRenderMirrors = hasVehicleBehind;

    if (!hasVehicleBehind) {
      leftFrame.classList.remove('active', 'danger');
      rightFrame.classList.remove('active', 'danger');
      return;
    }

    leftFrame.classList.add('active');
    rightFrame.classList.add('active');

    if (nearestLeftDist < Infinity) {
      if (leftDistEl) leftDistEl.textContent = `${nearestLeftDist.toFixed(1)}m`;
      if (nearestLeftDist < 10.0) leftFrame.classList.add('danger');
      else leftFrame.classList.remove('danger');
    } else {
      if (leftDistEl) leftDistEl.textContent = '--.-m';
      leftFrame.classList.remove('danger');
    }

    if (nearestRightDist < Infinity) {
      if (rightDistEl) rightDistEl.textContent = `${nearestRightDist.toFixed(1)}m`;
      if (nearestRightDist < 10.0) rightFrame.classList.add('danger');
      else rightFrame.classList.remove('danger');
    } else {
      if (rightDistEl) rightDistEl.textContent = '--.-m';
      rightFrame.classList.remove('danger');
    }

    const mirrorHeight = targetPos.y + 0.82;
    const mirrorFore = 0.25;
    const mirrorSpan = 0.98;
    const rearSlopeOffset = Math.sin(targetVehicle.pitch) * 25.0;

    const leftCamPos = new THREE.Vector3(
      targetPos.x - rightX * mirrorSpan + fwdX * mirrorFore,
      mirrorHeight,
      targetPos.z - rightZ * mirrorSpan + fwdZ * mirrorFore
    );
    const leftLookTarget = new THREE.Vector3(
      leftCamPos.x - fwdX * 25.0 - rightX * 4.5,
      mirrorHeight - 0.2 + rearSlopeOffset,
      leftCamPos.z - fwdZ * 25.0 - rightZ * 4.5
    );
    this.leftMirrorCamera.position.copy(leftCamPos);
    this.leftMirrorCamera.lookAt(leftLookTarget);

    const rightCamPos = new THREE.Vector3(
      targetPos.x + rightX * mirrorSpan + fwdX * mirrorFore,
      mirrorHeight,
      targetPos.z + rightZ * mirrorSpan + fwdZ * mirrorFore
    );
    const rightLookTarget = new THREE.Vector3(
      rightCamPos.x - fwdX * 25.0 + rightX * 4.5,
      mirrorHeight - 0.2 + rearSlopeOffset,
      rightCamPos.z - fwdZ * 25.0 + rightZ * 4.5
    );
    this.rightMirrorCamera.position.copy(rightCamPos);
    this.rightMirrorCamera.lookAt(rightLookTarget);
  }

  public render(scene: THREE.Scene, container: HTMLElement): void {
    if (!this.shouldRenderMirrors) return;

    const leftFrame = document.getElementById('left-mirror-frame');
    const rightFrame = document.getElementById('right-mirror-frame');
    if (!leftFrame || !rightFrame) return;

    const leftViewArea = (leftFrame.querySelector('.mirror-view-area') as HTMLElement) || leftFrame;
    const rightViewArea = (rightFrame.querySelector('.mirror-view-area') as HTMLElement) || rightFrame;

    const containerRect = container.getBoundingClientRect();
    const leftRect = leftViewArea.getBoundingClientRect();
    const rightRect = rightViewArea.getBoundingClientRect();

    if (leftRect.width <= 0 || leftRect.height <= 0) return;

    const pixelRatio = this.renderer.getPixelRatio();

    this.renderer.setScissorTest(true);

    const leftX = Math.round((leftRect.left - containerRect.left) * pixelRatio);
    const leftY = Math.round((containerRect.bottom - leftRect.bottom) * pixelRatio);
    const leftW = Math.round(leftRect.width * pixelRatio);
    const leftH = Math.round(leftRect.height * pixelRatio);

    if (leftW > 0 && leftH > 0) {
      this.renderer.setViewport(leftX, leftY, leftW, leftH);
      this.renderer.setScissor(leftX, leftY, leftW, leftH);
      this.renderer.render(scene, this.leftMirrorCamera);
    }

    const rightX = Math.round((rightRect.left - containerRect.left) * pixelRatio);
    const rightY = Math.round((containerRect.bottom - rightRect.bottom) * pixelRatio);
    const rightW = Math.round(rightRect.width * pixelRatio);
    const rightH = Math.round(rightRect.height * pixelRatio);

    if (rightW > 0 && rightH > 0) {
      this.renderer.setViewport(rightX, rightY, rightW, rightH);
      this.renderer.setScissor(rightX, rightY, rightW, rightH);
      this.renderer.render(scene, this.rightMirrorCamera);
    }

    this.renderer.setScissorTest(false);
    this.renderer.setViewport(
      0,
      0,
      this.renderer.domElement.width,
      this.renderer.domElement.height
    );
  }
}
