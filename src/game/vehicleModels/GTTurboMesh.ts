import * as THREE from 'three';
import { VehicleMeshParams, VehicleWheels } from './types.ts';

/**
 * [스타일 1] gt_turbo: 2도어 정통 스포츠 GT 쿠페 3D 지오메트리 빌더
 */
export function buildGTTurboGeometry(params: VehicleMeshParams): VehicleWheels {
  const { rootGroup, bodyMat, darkMat, glassMat, headLightMat, brakeLightMat, isGhost, ghostColor, addHoloEdges } = params;

  // 1. 언더바디 플로어 & 전방 스플리터
  const underbodyGeom = new THREE.BoxGeometry(1.96, 0.14, 4.35);
  const underbody = new THREE.Mesh(underbodyGeom, darkMat);
  underbody.position.set(0, 0.24, 0);
  underbody.castShadow = !isGhost;
  rootGroup.add(underbody);

  const splitterGeom = new THREE.BoxGeometry(2.04, 0.06, 0.45);
  const splitter = new THREE.Mesh(splitterGeom, darkMat);
  splitter.position.set(0, 0.19, 2.08);
  rootGroup.add(splitter);

  // 2. 메인 에어로 쐐기형 차체
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-2.15, 0.28);
  bodyShape.lineTo(2.15, 0.24);
  bodyShape.lineTo(2.26, 0.42);
  bodyShape.lineTo(1.25, 0.72);
  bodyShape.lineTo(0.35, 0.78);
  bodyShape.lineTo(-1.45, 0.84);
  bodyShape.lineTo(-2.18, 0.74);
  bodyShape.lineTo(-2.22, 0.42);
  bodyShape.closePath();

  const bodyGeom = new THREE.ExtrudeGeometry(bodyShape, {
    depth: 1.68,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.18,
    bevelThickness: 0.16,
  });
  bodyGeom.center();
  bodyGeom.rotateY(Math.PI / 2);

  const mainBody = new THREE.Mesh(bodyGeom, bodyMat);
  mainBody.position.set(0, 0.56, 0.02);
  mainBody.castShadow = !isGhost;
  mainBody.receiveShadow = !isGhost;
  addHoloEdges(mainBody, 0.7);
  rootGroup.add(mainBody);

  // 3. 보닛 위 크리즈 패널 & 측면 에어 인테이크
  const hoodVentGeom = new THREE.BoxGeometry(1.1, 0.06, 0.95);
  const hoodPanel = new THREE.Mesh(hoodVentGeom, bodyMat);
  hoodPanel.position.set(0, 0.74, 1.35);
  hoodPanel.rotation.x = 0.24;
  addHoloEdges(hoodPanel, 0.5);
  rootGroup.add(hoodPanel);

  const intakeGeom = new THREE.BoxGeometry(0.12, 0.32, 1.15);
  const leftIntake = new THREE.Mesh(intakeGeom, darkMat);
  leftIntake.position.set(-0.98, 0.55, -0.35);
  leftIntake.rotation.z = 0.15;
  leftIntake.rotation.y = -0.06;

  const rightIntake = new THREE.Mesh(intakeGeom, darkMat);
  rightIntake.position.set(0.98, 0.55, -0.35);
  rightIntake.rotation.z = -0.15;
  rightIntake.rotation.y = 0.06;
  rootGroup.add(leftIntake, rightIntake);

  // 4. 캐빈 캐노피 & 루프 캡
  const cabinShape = new THREE.Shape();
  cabinShape.moveTo(-1.35, 0.0);
  cabinShape.lineTo(1.05, 0.0);
  cabinShape.lineTo(0.22, 0.44);
  cabinShape.lineTo(-0.65, 0.42);
  cabinShape.closePath();

  const cabinGeom = new THREE.ExtrudeGeometry(cabinShape, {
    depth: 1.18,
    bevelEnabled: true,
    bevelSegments: 1,
    steps: 1,
    bevelSize: 0.16,
    bevelThickness: 0.18,
  });
  cabinGeom.center();
  cabinGeom.rotateY(Math.PI / 2);

  const cabin = new THREE.Mesh(cabinGeom, glassMat);
  cabin.position.set(0, 0.96, -0.12);
  cabin.castShadow = !isGhost;
  addHoloEdges(cabin, 0.5);
  rootGroup.add(cabin);

  const roofCapGeom = new THREE.BoxGeometry(1.12, 0.05, 0.82);
  const roofCap = new THREE.Mesh(roofCapGeom, bodyMat);
  roofCap.position.set(0, 1.21, -0.26);
  roofCap.rotation.x = -0.04;
  rootGroup.add(roofCap);

  // 5. GT 리어 윙 스포일러
  const wingBladeGeom = new THREE.BoxGeometry(2.02, 0.06, 0.36);
  const wingBlade = new THREE.Mesh(wingBladeGeom, darkMat);
  wingBlade.position.set(0, 1.14, -2.02);
  wingBlade.rotation.x = 0.14;
  wingBlade.castShadow = !isGhost;
  addHoloEdges(wingBlade, 0.6);
  rootGroup.add(wingBlade);

  const endPlateGeom = new THREE.BoxGeometry(0.04, 0.22, 0.44);
  const leftPlate = new THREE.Mesh(endPlateGeom, bodyMat);
  leftPlate.position.set(-1.01, 1.14, -2.02);
  const rightPlate = new THREE.Mesh(endPlateGeom, bodyMat);
  rightPlate.position.set(1.01, 1.14, -2.02);
  rootGroup.add(leftPlate, rightPlate);

  const strutGeom = new THREE.BoxGeometry(0.06, 0.34, 0.16);
  const leftStrut = new THREE.Mesh(strutGeom, darkMat);
  leftStrut.position.set(-0.55, 0.96, -1.96);
  leftStrut.rotation.x = -0.2;
  const rightStrut = new THREE.Mesh(strutGeom, darkMat);
  rightStrut.position.set(0.55, 0.96, -1.96);
  rightStrut.rotation.x = -0.2;
  rootGroup.add(leftStrut, rightStrut);

  // 6. 사선 앵그리 아이 LED 헤드라이트
  const lightGeom = new THREE.BoxGeometry(0.46, 0.08, 0.16);
  const leftLight = new THREE.Mesh(lightGeom, headLightMat);
  leftLight.position.set(-0.72, 0.52, 2.06);
  leftLight.rotation.set(0.2, 0.32, -0.12);

  const rightLight = new THREE.Mesh(lightGeom, headLightMat);
  rightLight.position.set(0.72, 0.52, 2.06);
  rightLight.rotation.set(0.2, -0.32, 0.12);
  rootGroup.add(leftLight, rightLight);

  // 7. 일자형 사이버 테일라이트 바
  const tailLightGeom = new THREE.BoxGeometry(1.84, 0.09, 0.08);
  const tailLight = new THREE.Mesh(tailLightGeom, brakeLightMat);
  tailLight.position.set(0, 0.66, -2.18);
  rootGroup.add(tailLight);

  // 8. 5-스포크 스포츠 알로이 휠 & 타이어 어셈블리
  const tireGeom = new THREE.CylinderGeometry(0.39, 0.39, 0.32, 24);
  tireGeom.rotateZ(Math.PI / 2);

  const tireMat = new THREE.MeshStandardMaterial({
    color: isGhost ? ghostColor : 0x0b0f19,
    roughness: 0.85,
    metalness: 0.1,
    transparent: isGhost,
    opacity: isGhost ? 0.35 : 1.0,
  });

  const rimMat = new THREE.MeshStandardMaterial({
    color: isGhost ? 0x67e8f9 : 0x94a3b8,
    roughness: 0.25,
    metalness: 0.85,
    emissive: isGhost ? ghostColor : 0x000000,
    emissiveIntensity: isGhost ? 0.6 : 0,
    transparent: isGhost,
    opacity: isGhost ? 0.7 : 1.0,
  });

  const createSportWheel = (isLeft: boolean): THREE.Mesh => {
    const wheelMesh = new THREE.Mesh(tireGeom, tireMat);
    wheelMesh.castShadow = !isGhost;
    const sideSign = isLeft ? -1 : 1;

    const rimRingGeom = new THREE.CylinderGeometry(0.27, 0.27, 0.33, 16);
    rimRingGeom.rotateZ(Math.PI / 2);
    const rimRing = new THREE.Mesh(rimRingGeom, darkMat);
    wheelMesh.add(rimRing);

    const spokeGeom = new THREE.BoxGeometry(0.04, 0.5, 0.055);
    for (let i = 0; i < 5; i++) {
      const spoke = new THREE.Mesh(spokeGeom, rimMat);
      spoke.rotation.x = (i * Math.PI) / 5;
      spoke.position.x = sideSign * 0.15;
      wheelMesh.add(spoke);
    }

    const hubGeom = new THREE.CylinderGeometry(0.08, 0.08, 0.35, 12);
    hubGeom.rotateZ(Math.PI / 2);
    const hub = new THREE.Mesh(hubGeom, rimMat);
    wheelMesh.add(hub);

    if (isGhost) addHoloEdges(wheelMesh, 0.75);
    return wheelMesh;
  };

  const frontLeftWheel = createSportWheel(true);
  frontLeftWheel.position.set(-1.02, 0.39, 1.32);

  const frontRightWheel = createSportWheel(false);
  frontRightWheel.position.set(1.02, 0.39, 1.32);

  const rearLeftWheel = createSportWheel(true);
  rearLeftWheel.position.set(-1.04, 0.39, -1.32);

  const rearRightWheel = createSportWheel(false);
  rearRightWheel.position.set(1.04, 0.39, -1.32);

  rootGroup.add(frontLeftWheel, frontRightWheel, rearLeftWheel, rearRightWheel);

  return { frontLeftWheel, frontRightWheel, rearLeftWheel, rearRightWheel };
}
