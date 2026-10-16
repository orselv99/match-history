import * as THREE from 'three';
import type { VehicleMeshParams, VehicleWheels } from './types.ts';

/**
 * [스타일 4] lm_hypercar: 르망 24시 하이퍼카(LMH / LMDh) 프로토타입 3D 지오메트리 빌더
 * - 초저상 와이드 모노코크 카본 섀시 & 대형 프론트 스플리터
 * - 공기역학 돔 캐노피 & 루프탑 엔진 에어 인테이크 스쿠프
 * - 르망의 상징 샤크 핀(Shark Fin) & 와이드 듀얼 엔드플레이트 리어 윙
 * - 쿼드 에어로 디퓨저 & 4륜 레이싱 슬릭 타이어
 */
export function buildLmHypercarGeometry(params: VehicleMeshParams): VehicleWheels {
  const { rootGroup, bodyMat, darkMat, glassMat, headLightMat, brakeLightMat, isGhost, ghostColor, addHoloEdges } = params;

  // 1. 하부 카본 플로어 플레이트 & 프론트 스플리터 & 리어 디퓨저
  const floorGeom = new THREE.BoxGeometry(2.14, 0.08, 4.65);
  const floorMesh = new THREE.Mesh(floorGeom, darkMat);
  floorMesh.position.set(0, 0.18, 0.0);
  floorMesh.castShadow = !isGhost;
  rootGroup.add(floorMesh);

  // 프론트 대형 에어로 스플리터
  const splitterGeom = new THREE.BoxGeometry(2.18, 0.04, 0.6);
  const splitter = new THREE.Mesh(splitterGeom, darkMat);
  splitter.position.set(0, 0.16, 2.38);
  rootGroup.add(splitter);

  // 2. 메인 바디 쉘: 와이드 펜더 & 콕핏 바디
  const mainBodyShape = new THREE.Shape();
  mainBodyShape.moveTo(-2.32, 0.22);
  mainBodyShape.lineTo(2.35, 0.20);
  mainBodyShape.lineTo(2.38, 0.40);
  mainBodyShape.lineTo(1.10, 0.52);
  mainBodyShape.lineTo(0.35, 0.78);
  mainBodyShape.lineTo(-0.85, 0.80);
  mainBodyShape.lineTo(-1.95, 0.65);
  mainBodyShape.lineTo(-2.35, 0.45);
  mainBodyShape.closePath();

  const bodyGeom = new THREE.ExtrudeGeometry(mainBodyShape, {
    depth: 1.88,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.14,
    bevelThickness: 0.12,
  });
  bodyGeom.center();
  bodyGeom.rotateY(Math.PI / 2);

  const mainBody = new THREE.Mesh(bodyGeom, bodyMat);
  mainBody.position.set(0, 0.48, 0.0);
  mainBody.castShadow = !isGhost;
  mainBody.receiveShadow = !isGhost;
  addHoloEdges(mainBody, 0.8);
  rootGroup.add(mainBody);

  // 3. 에어로 돔 캐노피 (눈물방울형 전투기 콕핏)
  const canopyGeom = new THREE.SphereGeometry(0.72, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
  canopyGeom.scale(1.05, 0.85, 1.75);
  const canopy = new THREE.Mesh(canopyGeom, glassMat);
  canopy.position.set(0, 0.62, 0.15);
  canopy.rotation.x = -0.06;
  addHoloEdges(canopy, 0.6);
  rootGroup.add(canopy);

  // 4. 루프탑 엔진 흡기 스쿠프 (Roof Air Scoop)
  const scoopGeom = new THREE.BoxGeometry(0.38, 0.22, 0.95);
  const scoop = new THREE.Mesh(scoopGeom, darkMat);
  scoop.position.set(0, 1.05, -0.25);
  scoop.rotation.x = -0.15;
  rootGroup.add(scoop);

  // 5. 르망 시그니처: 샤크 핀 (Shark Fin, 루프에서 리어 윙까지 연결되는 거대 수직 안정판)
  const finShape = new THREE.Shape();
  finShape.moveTo(-2.28, 0.62);
  finShape.lineTo(-0.35, 1.08);
  finShape.lineTo(-0.55, 1.25);
  finShape.lineTo(-2.25, 1.28);
  finShape.closePath();

  const finGeom = new THREE.ExtrudeGeometry(finShape, {
    depth: 0.04,
    bevelEnabled: false,
  });
  finGeom.center();
  finGeom.rotateY(Math.PI / 2);

  const sharkFin = new THREE.Mesh(finGeom, bodyMat);
  sharkFin.position.set(0, 1.02, -1.30);
  addHoloEdges(sharkFin, 0.85);
  rootGroup.add(sharkFin);

  // 6. 초대형 리어 윙 & 듀얼 엔드플레이트
  const wingMainGeom = new THREE.BoxGeometry(2.05, 0.05, 0.42);
  const wingMain = new THREE.Mesh(wingMainGeom, darkMat);
  wingMain.position.set(0, 1.15, -2.20);
  wingMain.rotation.x = 0.12;

  const wingUpperGeom = new THREE.BoxGeometry(2.05, 0.04, 0.28);
  const wingUpper = new THREE.Mesh(wingUpperGeom, bodyMat);
  wingUpper.position.set(0, 1.26, -2.26);
  wingUpper.rotation.x = 0.24;

  const endplateGeom = new THREE.BoxGeometry(0.04, 0.62, 0.68);
  const leftEndplate = new THREE.Mesh(endplateGeom, bodyMat);
  leftEndplate.position.set(-1.02, 1.08, -2.20);
  const rightEndplate = new THREE.Mesh(endplateGeom, bodyMat);
  rightEndplate.position.set(1.02, 1.08, -2.20);

  rootGroup.add(wingMain, wingUpper, leftEndplate, rightEndplate);

  // 7. 르망 프로토타입 헤드라이트 (좌우 듀얼 슬림 수직/수평 매트릭스)
  const hlGeom = new THREE.BoxGeometry(0.32, 0.08, 0.10);
  const leftHL = new THREE.Mesh(hlGeom, headLightMat);
  leftHL.position.set(-0.78, 0.42, 2.30);
  const rightHL = new THREE.Mesh(hlGeom, headLightMat);
  rightHL.position.set(0.78, 0.42, 2.30);
  rootGroup.add(leftHL, rightHL);

  // 8. 리어 램프 (좌/우 에어로 블레이드 + 중앙 FIA 레인 라이트)
  const tlGeom = new THREE.BoxGeometry(0.38, 0.08, 0.08);
  const leftTL = new THREE.Mesh(tlGeom, brakeLightMat);
  leftTL.position.set(-0.82, 0.64, -2.32);
  const rightTL = new THREE.Mesh(tlGeom, brakeLightMat);
  rightTL.position.set(0.82, 0.64, -2.32);

  const rainLightGeom = new THREE.BoxGeometry(0.14, 0.14, 0.06);
  const rainLight = new THREE.Mesh(rainLightGeom, brakeLightMat);
  rainLight.position.set(0, 0.28, -2.33);

  rootGroup.add(leftTL, rightTL, rainLight);

  // 9. 4륜 고성능 슬릭 타이어 & 에어로 림
  const tireGeom = new THREE.CylinderGeometry(0.40, 0.40, 0.38, 24);
  tireGeom.rotateZ(Math.PI / 2);

  const tireMat = new THREE.MeshStandardMaterial({
    color: isGhost ? ghostColor : 0x0a0e17,
    roughness: 0.90,
    metalness: 0.1,
    transparent: isGhost,
    opacity: isGhost ? 0.35 : 1.0,
  });

  const rimMat = new THREE.MeshStandardMaterial({
    color: isGhost ? 0x10b981 : 0x1f2937,
    roughness: 0.3,
    metalness: 0.8,
    emissive: isGhost ? ghostColor : 0x000000,
    emissiveIntensity: isGhost ? 0.5 : 0,
    transparent: isGhost,
    opacity: isGhost ? 0.65 : 1.0,
  });

  const createWheel = (isLeft: boolean): THREE.Mesh => {
    const wheel = new THREE.Mesh(tireGeom, tireMat);
    wheel.castShadow = !isGhost;
    const sideSign = isLeft ? -1 : 1;

    const discGeom = new THREE.CylinderGeometry(0.30, 0.30, 0.39, 16);
    discGeom.rotateZ(Math.PI / 2);
    const disc = new THREE.Mesh(discGeom, rimMat);
    wheel.add(disc);

    const ringGeom = new THREE.TorusGeometry(0.24, 0.016, 8, 18);
    ringGeom.rotateY(Math.PI / 2);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 0.8,
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.position.x = sideSign * 0.20;
    wheel.add(ring);

    if (isGhost) addHoloEdges(wheel, 0.75);
    return wheel;
  };

  const frontLeftWheel = createWheel(true);
  frontLeftWheel.position.set(-1.06, 0.40, 1.40);

  const frontRightWheel = createWheel(false);
  frontRightWheel.position.set(1.06, 0.40, 1.40);

  const rearLeftWheel = createWheel(true);
  rearLeftWheel.position.set(-1.08, 0.40, -1.40);

  const rearRightWheel = createWheel(false);
  rearRightWheel.position.set(1.08, 0.40, -1.40);

  rootGroup.add(frontLeftWheel, frontRightWheel, rearLeftWheel, rearRightWheel);

  return { frontLeftWheel, frontRightWheel, rearLeftWheel, rearRightWheel };
}
