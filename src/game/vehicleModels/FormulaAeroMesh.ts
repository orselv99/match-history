import * as THREE from 'three';
import { VehicleMeshParams, VehicleWheels } from './types.ts';

/**
 * [스타일 2] formula_aero: 오픈휠 포뮬러 F1 머신 스타일 3D 지오메트리 빌더
 */
export function buildFormulaAeroGeometry(params: VehicleMeshParams): VehicleWheels {
  const { rootGroup, bodyMat, darkMat, glassMat, headLightMat, brakeLightMat, isGhost, ghostColor, addHoloEdges } = params;

  // 1. 에어로 플로어 & 플랫 보텀
  const floorGeom = new THREE.BoxGeometry(1.68, 0.08, 4.45);
  const floor = new THREE.Mesh(floorGeom, darkMat);
  floor.position.set(0, 0.12, 0.05);
  floor.castShadow = !isGhost;
  rootGroup.add(floor);

  // 2. 테이퍼드 모노코크 노즈 섀시
  const noseShape = new THREE.Shape();
  noseShape.moveTo(-2.15, 0.18);
  noseShape.lineTo(2.35, 0.15);
  noseShape.lineTo(2.18, 0.32);
  noseShape.lineTo(0.55, 0.62);
  noseShape.lineTo(-1.25, 0.68);
  noseShape.lineTo(-2.15, 0.38);
  noseShape.closePath();

  const monoGeom = new THREE.ExtrudeGeometry(noseShape, {
    depth: 0.52,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.08,
    bevelThickness: 0.08,
  });
  monoGeom.center();
  monoGeom.rotateY(Math.PI / 2);

  const monocoque = new THREE.Mesh(monoGeom, bodyMat);
  monocoque.position.set(0, 0.52, 0.12);
  monocoque.castShadow = !isGhost;
  addHoloEdges(monocoque, 0.75);
  rootGroup.add(monocoque);

  // 3. 좌/우 에어로 사이드포드
  const podShape = new THREE.Shape();
  podShape.moveTo(-1.45, 0.22);
  podShape.lineTo(0.45, 0.22);
  podShape.lineTo(0.58, 0.58);
  podShape.lineTo(-0.3, 0.60);
  podShape.lineTo(-1.45, 0.36);
  podShape.closePath();

  const podGeom = new THREE.ExtrudeGeometry(podShape, {
    depth: 0.44,
    bevelEnabled: true,
    bevelSegments: 1,
    steps: 1,
    bevelSize: 0.06,
    bevelThickness: 0.06,
  });
  podGeom.center();
  podGeom.rotateY(Math.PI / 2);

  const leftPod = new THREE.Mesh(podGeom, bodyMat);
  leftPod.position.set(-0.58, 0.38, -0.35);
  leftPod.castShadow = !isGhost;
  addHoloEdges(leftPod, 0.65);

  const rightPod = new THREE.Mesh(podGeom, bodyMat);
  rightPod.position.set(0.58, 0.38, -0.35);
  rightPod.castShadow = !isGhost;
  addHoloEdges(rightPod, 0.65);
  rootGroup.add(leftPod, rightPod);

  // 4. 콕핏 바이저 & 티타늄 헤일로 가드
  const cockpitGeom = new THREE.BoxGeometry(0.44, 0.22, 0.75);
  const cockpit = new THREE.Mesh(cockpitGeom, glassMat);
  cockpit.position.set(0, 0.72, 0.15);
  rootGroup.add(cockpit);

  const haloPillarGeom = new THREE.BoxGeometry(0.05, 0.26, 0.08);
  const haloPillar = new THREE.Mesh(haloPillarGeom, darkMat);
  haloPillar.position.set(0, 0.82, 0.48);
  haloPillar.rotation.x = -0.35;

  const haloRingGeom = new THREE.TorusGeometry(0.32, 0.032, 8, 16, Math.PI);
  haloRingGeom.rotateX(Math.PI / 2);
  const haloRing = new THREE.Mesh(haloRingGeom, darkMat);
  haloRing.position.set(0, 0.91, 0.18);
  rootGroup.add(haloPillar, haloRing);

  // 5. 프론트 윙
  const fwMainGeom = new THREE.BoxGeometry(2.12, 0.05, 0.42);
  const fwMain = new THREE.Mesh(fwMainGeom, darkMat);
  fwMain.position.set(0, 0.18, 2.22);
  fwMain.castShadow = !isGhost;
  addHoloEdges(fwMain, 0.7);

  const fwFlapGeom = new THREE.BoxGeometry(2.08, 0.04, 0.22);
  const fwFlap = new THREE.Mesh(fwFlapGeom, bodyMat);
  fwFlap.position.set(0, 0.24, 2.12);
  fwFlap.rotation.x = 0.22;

  const fwPlateGeom = new THREE.BoxGeometry(0.04, 0.26, 0.56);
  const fwLeftPlate = new THREE.Mesh(fwPlateGeom, bodyMat);
  fwLeftPlate.position.set(-1.06, 0.26, 2.18);
  const fwRightPlate = new THREE.Mesh(fwPlateGeom, bodyMat);
  fwRightPlate.position.set(1.06, 0.26, 2.18);

  const fwLightGeom = new THREE.BoxGeometry(0.38, 0.05, 0.08);
  const leftLight = new THREE.Mesh(fwLightGeom, headLightMat);
  leftLight.position.set(-0.68, 0.26, 2.32);
  const rightLight = new THREE.Mesh(fwLightGeom, headLightMat);
  rightLight.position.set(0.68, 0.26, 2.32);

  rootGroup.add(fwMain, fwFlap, fwLeftPlate, fwRightPlate, leftLight, rightLight);

  // 6. 하이-다운포스 듀얼 리어 윙 & FIA 레인 라이트
  const rwMainGeom = new THREE.BoxGeometry(1.76, 0.06, 0.38);
  const rwMain = new THREE.Mesh(rwMainGeom, darkMat);
  rwMain.position.set(0, 0.98, -2.02);
  rwMain.rotation.x = 0.18;

  const rwUpperGeom = new THREE.BoxGeometry(1.76, 0.05, 0.24);
  const rwUpper = new THREE.Mesh(rwUpperGeom, bodyMat);
  rwUpper.position.set(0, 1.12, -2.08);
  rwUpper.rotation.x = 0.32;

  const rwPlateGeom = new THREE.BoxGeometry(0.04, 0.54, 0.56);
  const rwLeftPlate = new THREE.Mesh(rwPlateGeom, bodyMat);
  rwLeftPlate.position.set(-0.88, 0.94, -2.02);
  const rwRightPlate = new THREE.Mesh(rwPlateGeom, bodyMat);
  rwRightPlate.position.set(0.88, 0.94, -2.02);

  const rainLightGeom = new THREE.BoxGeometry(0.18, 0.14, 0.08);
  const fiaRainLight = new THREE.Mesh(rainLightGeom, brakeLightMat);
  fiaRainLight.position.set(0, 0.32, -2.18);

  rootGroup.add(rwMain, rwUpper, rwLeftPlate, rwRightPlate, fiaRainLight);

  // 7. 노출형 서스펜션 위시본 암
  const armGeom = new THREE.CylinderGeometry(0.016, 0.016, 0.65, 8);
  const createWishbones = (xSign: number, zCenter: number): THREE.Group => {
    const group = new THREE.Group();
    const upperArm = new THREE.Mesh(armGeom, darkMat);
    upperArm.rotation.z = xSign * 0.45;
    upperArm.rotation.y = 0.18;
    upperArm.position.set(xSign * 0.42, 0.42, zCenter);

    const lowerArm = new THREE.Mesh(armGeom, darkMat);
    lowerArm.rotation.z = xSign * 0.25;
    lowerArm.rotation.y = -0.18;
    lowerArm.position.set(xSign * 0.42, 0.24, zCenter);

    group.add(upperArm, lowerArm);
    return group;
  };

  rootGroup.add(createWishbones(1, 1.35), createWishbones(-1, 1.35));
  rootGroup.add(createWishbones(1, -1.35), createWishbones(-1, -1.35));

  // 8. F1 광폭 슬릭 타이어 & 에어로 휠 커버
  const f1TireGeom = new THREE.CylinderGeometry(0.42, 0.42, 0.44, 28);
  f1TireGeom.rotateZ(Math.PI / 2);

  const f1TireMat = new THREE.MeshStandardMaterial({
    color: isGhost ? ghostColor : 0x080c14,
    roughness: 0.92,
    metalness: 0.08,
    transparent: isGhost,
    opacity: isGhost ? 0.35 : 1.0,
  });

  const f1AeroDiscMat = new THREE.MeshStandardMaterial({
    color: isGhost ? 0x38bdf8 : 0x1f2937,
    roughness: 0.25,
    metalness: 0.85,
    emissive: isGhost ? ghostColor : 0x000000,
    emissiveIntensity: isGhost ? 0.5 : 0,
    transparent: isGhost,
    opacity: isGhost ? 0.65 : 1.0,
  });

  const createF1Wheel = (isLeft: boolean): THREE.Mesh => {
    const wheelMesh = new THREE.Mesh(f1TireGeom, f1TireMat);
    wheelMesh.castShadow = !isGhost;
    const sideSign = isLeft ? -1 : 1;

    const aeroDiscGeom = new THREE.CylinderGeometry(0.32, 0.32, 0.45, 18);
    aeroDiscGeom.rotateZ(Math.PI / 2);
    const aeroDisc = new THREE.Mesh(aeroDiscGeom, f1AeroDiscMat);
    wheelMesh.add(aeroDisc);

    const ringGeom = new THREE.TorusGeometry(0.28, 0.018, 8, 20);
    ringGeom.rotateY(Math.PI / 2);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xef4444,
      emissiveIntensity: 0.9,
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.position.x = sideSign * 0.23;
    wheelMesh.add(ring);

    if (isGhost) addHoloEdges(wheelMesh, 0.75);
    return wheelMesh;
  };

  const frontLeftWheel = createF1Wheel(true);
  frontLeftWheel.position.set(-1.18, 0.42, 1.35);

  const frontRightWheel = createF1Wheel(false);
  frontRightWheel.position.set(1.18, 0.42, 1.35);

  const rearLeftWheel = createF1Wheel(true);
  rearLeftWheel.position.set(-1.22, 0.42, -1.35);

  const rearRightWheel = createF1Wheel(false);
  rearRightWheel.position.set(1.22, 0.42, -1.35);

  rootGroup.add(frontLeftWheel, frontRightWheel, rearLeftWheel, rearRightWheel);

  return { frontLeftWheel, frontRightWheel, rearLeftWheel, rearRightWheel };
}
