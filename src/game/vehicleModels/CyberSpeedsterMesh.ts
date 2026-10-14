import * as THREE from 'three';
import { VehicleMeshParams, VehicleWheels } from './types.ts';

/**
 * [스타일 3] cyber_speedster: 사이버펑크 쐐기형 모노볼륨 스피드스터 3D 지오메트리 빌더
 */
export function buildCyberSpeedsterGeometry(params: VehicleMeshParams): VehicleWheels {
  const { rootGroup, bodyMat, darkMat, glassMat, headLightMat, brakeLightMat, isGhost, ghostColor, addHoloEdges } = params;

  const cyberNeonMat = new THREE.MeshStandardMaterial({
    color: 0x06b6d4,
    emissive: 0x06b6d4,
    emissiveIntensity: 2.8,
  });

  // 1. 하부 아머드 디퓨저 플레이트
  const baseGeom = new THREE.BoxGeometry(2.12, 0.12, 4.45);
  const baseMesh = new THREE.Mesh(baseGeom, darkMat);
  baseMesh.position.set(0, 0.22, 0);
  baseMesh.castShadow = !isGhost;
  rootGroup.add(baseMesh);

  const sideGlowGeom = new THREE.BoxGeometry(2.18, 0.04, 3.1);
  const sideGlow = new THREE.Mesh(sideGlowGeom, cyberNeonMat);
  sideGlow.position.set(0, 0.19, 0.0);
  rootGroup.add(sideGlow);

  // 2. 브루탈리즘 쐐기형 메인 쉘
  const cyberShape = new THREE.Shape();
  cyberShape.moveTo(-2.24, 0.26);
  cyberShape.lineTo(2.26, 0.22);
  cyberShape.lineTo(2.34, 0.38);
  cyberShape.lineTo(0.45, 0.88);
  cyberShape.lineTo(-0.85, 0.90);
  cyberShape.lineTo(-2.22, 0.68);
  cyberShape.lineTo(-2.28, 0.38);
  cyberShape.closePath();

  const cyberBodyGeom = new THREE.ExtrudeGeometry(cyberShape, {
    depth: 1.82,
    bevelEnabled: true,
    bevelSegments: 1,
    steps: 1,
    bevelSize: 0.16,
    bevelThickness: 0.16,
  });
  cyberBodyGeom.center();
  cyberBodyGeom.rotateY(Math.PI / 2);

  const mainHull = new THREE.Mesh(cyberBodyGeom, bodyMat);
  mainHull.position.set(0, 0.56, 0.02);
  mainHull.castShadow = !isGhost;
  mainHull.receiveShadow = !isGhost;
  addHoloEdges(mainHull, 0.8);
  rootGroup.add(mainHull);

  // 3. 장갑형 바이저
  const visorGeom = new THREE.BoxGeometry(1.62, 0.28, 1.95);
  const visor = new THREE.Mesh(visorGeom, glassMat);
  visor.position.set(0, 0.92, 0.05);
  visor.rotation.x = 0.14;
  addHoloEdges(visor, 0.5);
  rootGroup.add(visor);

  // 4. 센터 도살 에어로 핀
  const finShape = new THREE.Shape();
  finShape.moveTo(-2.18, 0.68);
  finShape.lineTo(-0.25, 0.90);
  finShape.lineTo(-0.45, 1.18);
  finShape.lineTo(-2.12, 1.06);
  finShape.closePath();

  const finGeom = new THREE.ExtrudeGeometry(finShape, {
    depth: 0.06,
    bevelEnabled: false,
  });
  finGeom.center();
  finGeom.rotateY(Math.PI / 2);

  const dorsalFin = new THREE.Mesh(finGeom, darkMat);
  dorsalFin.position.set(0, 0.98, -1.15);
  addHoloEdges(dorsalFin, 0.8);
  rootGroup.add(dorsalFin);

  const finGlowGeom = new THREE.BoxGeometry(0.07, 0.04, 1.65);
  const finGlow = new THREE.Mesh(finGlowGeom, cyberNeonMat);
  finGlow.position.set(0, 1.16, -1.25);
  finGlow.rotation.x = -0.07;
  rootGroup.add(finGlow);

  // 5. 프론트 호라이즌 풀-와이드 사이버 라이트바
  const horizonLightGeom = new THREE.BoxGeometry(2.02, 0.06, 0.12);
  const horizonLight = new THREE.Mesh(horizonLightGeom, headLightMat);
  horizonLight.position.set(0, 0.38, 2.30);
  rootGroup.add(horizonLight);

  // 6. 리어 블레이드 네온 브레이크 라이트
  const cyberTailGeom = new THREE.BoxGeometry(1.98, 0.08, 0.08);
  const cyberTail = new THREE.Mesh(cyberTailGeom, brakeLightMat);
  cyberTail.position.set(0, 0.62, -2.26);
  rootGroup.add(cyberTail);

  // 7. 인클로즈드 휠 아치 & 사이버 터빈 휠
  const createWheelArch = (xSign: number, zCenter: number): THREE.Mesh => {
    const archGeom = new THREE.BoxGeometry(0.14, 0.28, 1.12);
    const arch = new THREE.Mesh(archGeom, bodyMat);
    arch.position.set(xSign * 1.05, 0.62, zCenter);
    addHoloEdges(arch, 0.6);
    return arch;
  };

  rootGroup.add(createWheelArch(-1, 1.36), createWheelArch(1, 1.36));
  rootGroup.add(createWheelArch(-1, -1.34), createWheelArch(1, -1.34));

  const cyberTireGeom = new THREE.CylinderGeometry(0.40, 0.40, 0.34, 24);
  cyberTireGeom.rotateZ(Math.PI / 2);

  const cyberTireMat = new THREE.MeshStandardMaterial({
    color: isGhost ? ghostColor : 0x090d16,
    roughness: 0.88,
    metalness: 0.12,
    transparent: isGhost,
    opacity: isGhost ? 0.35 : 1.0,
  });

  const createCyberWheel = (isLeft: boolean): THREE.Mesh => {
    const wheelMesh = new THREE.Mesh(cyberTireGeom, cyberTireMat);
    wheelMesh.castShadow = !isGhost;
    const sideSign = isLeft ? -1 : 1;

    const discGeom = new THREE.CylinderGeometry(0.31, 0.31, 0.35, 24);
    discGeom.rotateZ(Math.PI / 2);
    const disc = new THREE.Mesh(discGeom, darkMat);
    wheelMesh.add(disc);

    const neonRingGeom = new THREE.TorusGeometry(0.25, 0.018, 8, 24);
    neonRingGeom.rotateY(Math.PI / 2);
    const neonRing = new THREE.Mesh(neonRingGeom, cyberNeonMat);
    neonRing.position.x = sideSign * 0.18;
    wheelMesh.add(neonRing);

    const bladeGeom = new THREE.BoxGeometry(0.02, 0.44, 0.04);
    const blade = new THREE.Mesh(bladeGeom, cyberNeonMat);
    blade.position.x = sideSign * 0.18;
    wheelMesh.add(blade);

    if (isGhost) addHoloEdges(wheelMesh, 0.75);
    return wheelMesh;
  };

  const frontLeftWheel = createCyberWheel(true);
  frontLeftWheel.position.set(-1.05, 0.40, 1.36);

  const frontRightWheel = createCyberWheel(false);
  frontRightWheel.position.set(1.05, 0.40, 1.36);

  const rearLeftWheel = createCyberWheel(true);
  rearLeftWheel.position.set(-1.07, 0.40, -1.34);

  const rearRightWheel = createCyberWheel(false);
  rearRightWheel.position.set(1.07, 0.40, -1.34);

  rootGroup.add(frontLeftWheel, frontRightWheel, rearLeftWheel, rearRightWheel);

  return { frontLeftWheel, frontRightWheel, rearLeftWheel, rearRightWheel };
}
