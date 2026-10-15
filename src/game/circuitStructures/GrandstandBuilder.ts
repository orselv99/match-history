import * as THREE from 'three';
import type { StructureMaterials } from './types.ts';

/**
 * 대형 5단 관중석 그랜드스탠드 (Grandstand with Cantilever Roof)
 * - 출발선 이전 (Z <= 0) 구간에 완벽 배치되어 출발선 앞쪽 침범 방지
 * - 5단 계단식 스탠드 & 레드/블루 교차 시트
 * - 트랙 방향 캔틸레버 에어로 루프 차양막 & 후방 지지 강철 기둥
 */
export function buildGrandstand(materials: StructureMaterials, trackWidth: number): THREE.Group {
  const grandstand = new THREE.Group();
  const halfW = trackWidth / 2;
  const gsBaseX = halfW + 4.5;
  const gsLength = 52.0;
  const gsZ = -30.0; // Z: -56.0 ~ -4.0 (출발선 이전 구간)

  // 5단 계단식 스탠드
  for (let tier = 0; tier < 5; tier++) {
    const tierW = 1.6;
    const tierH = 0.55 * (tier + 1);
    const tierGeom = new THREE.BoxGeometry(tierW, tierH, gsLength);
    const tierMesh = new THREE.Mesh(tierGeom, materials.concreteMat);
    tierMesh.position.set(gsBaseX + tier * tierW + tierW / 2, tierH / 2, gsZ);
    grandstand.add(tierMesh);

    // 관중석 시트 (레드 & 블루 교차 배치)
    const seatMat = tier % 2 === 0 ? materials.seatRedMat : materials.seatBlueMat;
    const seatGeom = new THREE.BoxGeometry(tierW * 0.75, 0.2, gsLength - 2.0);
    const seatMesh = new THREE.Mesh(seatGeom, seatMat);
    seatMesh.position.set(gsBaseX + tier * tierW + tierW / 2, tierH + 0.1, gsZ);
    grandstand.add(seatMesh);
  }

  // 캔틸레버 루프 차양막
  const canopyGeom = new THREE.BoxGeometry(11.0, 0.3, gsLength + 2.0);
  const canopy = new THREE.Mesh(canopyGeom, materials.roofMat);
  canopy.position.set(gsBaseX + 4.5, 7.2, gsZ);
  canopy.rotation.z = -0.16; // 트랙 방향으로 살짝 기울어진 에어로 루프
  grandstand.add(canopy);

  // 후방 지지 강철 기둥 5개
  const colGeom = new THREE.BoxGeometry(0.6, 7.5, 0.6);
  for (let c = 0; c < 5; c++) {
    const col = new THREE.Mesh(colGeom, materials.steelMat);
    col.position.set(gsBaseX + 8.5, 3.75, gsZ - 20.0 + c * 10.0);
    grandstand.add(col);
  }

  return grandstand;
}
