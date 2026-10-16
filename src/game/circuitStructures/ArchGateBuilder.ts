import * as THREE from 'three';

/**
 * 스타트/피니시 및 섹터 체크포인트 네온 듀얼빔 아치 게이트 생성
 */
export function buildArchGate(
  pos: THREE.Vector3,
  tangent: THREE.Vector3,
  isFinish: boolean,
  circuitWidth: number
): THREE.Group {
  const archGroup = new THREE.Group();
  archGroup.position.copy(pos);

  const right = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
  const halfW = circuitWidth / 2 + 1.5;

  // 기둥 2개
  const pillarGeom = new THREE.BoxGeometry(0.6, 6, 0.6);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x26282f, roughness: 0.6, metalness: 0.4 });

  const leftPillar = new THREE.Mesh(pillarGeom, pillarMat);
  leftPillar.position.copy(new THREE.Vector3().addScaledVector(right, -halfW));
  leftPillar.position.y = 3;

  const rightPillar = new THREE.Mesh(pillarGeom, pillarMat);
  rightPillar.position.copy(new THREE.Vector3().addScaledVector(right, halfW));
  rightPillar.position.y = 3;

  // 상단 듀얼 빔 (y=4.9, y=5.8): 고속 모션 블러 환경에서도 즉각 식별 가능한 초고휘도 네온 마젠타 & 네온 라임
  const beamGeom = new THREE.BoxGeometry(circuitWidth + 4, 0.42, 0.85);
  const beamColor = isFinish ? 0xff0066 : 0x10b981;
  const beamEmissive = isFinish ? 0xff0055 : 0x00ff66;

  const beamMat = new THREE.MeshStandardMaterial({
    color: beamColor,
    emissive: beamEmissive,
    emissiveIntensity: 4.8,
    roughness: 0.15,
  });

  const beam1 = new THREE.Mesh(beamGeom, beamMat);
  beam1.position.y = 4.9;
  beam1.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), right);

  const beam2 = new THREE.Mesh(beamGeom, beamMat);
  beam2.position.y = 5.8;
  beam2.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), right);

  archGroup.add(leftPillar, rightPillar, beam1, beam2);
  return archGroup;
}
