import * as THREE from 'three';

/**
 * 스타트/피니시 및 섹터 체크포인트 네온 듀얼빔 아치 게이트 생성
 */
export function buildArchGate(
  pos: THREE.Vector3,
  tangent: THREE.Vector3,
  isFinish: boolean,
  trackWidth: number
): THREE.Group {
  const archGroup = new THREE.Group();
  archGroup.position.copy(pos);

  const right = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
  const halfW = trackWidth / 2 + 1.5;

  // 기둥 2개
  const pillarGeom = new THREE.BoxGeometry(0.6, 6, 0.6);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x26282f, roughness: 0.6, metalness: 0.4 });

  const leftPillar = new THREE.Mesh(pillarGeom, pillarMat);
  leftPillar.position.copy(new THREE.Vector3().addScaledVector(right, -halfW));
  leftPillar.position.y = 3;

  const rightPillar = new THREE.Mesh(pillarGeom, pillarMat);
  rightPillar.position.copy(new THREE.Vector3().addScaledVector(right, halfW));
  rightPillar.position.y = 3;

  // 상단 듀얼 빔 (y=4.9, y=5.8): 피니시는 로즈(0xc45a72), 일반 섹터는 스카이블루(0x7dd3fc)
  const beamGeom = new THREE.BoxGeometry(trackWidth + 4, 0.35, 0.75);
  const beamColor = isFinish ? 0xc45a72 : 0x7dd3fc;
  const beamEmissive = isFinish ? 0xc45a72 : 0x38bdf8;

  const beamMat = new THREE.MeshStandardMaterial({
    color: beamColor,
    emissive: beamEmissive,
    emissiveIntensity: 1.4,
    roughness: 0.3,
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
