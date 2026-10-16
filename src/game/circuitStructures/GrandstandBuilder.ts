import * as THREE from 'three';
import type { StructureMaterials } from './types.ts';

/**
 * 대형 5단 관중석 그랜드스탠드 (Grandstand with Cantilever Roof)
 * - 5단 계단식 스탠드 & 레드/블루 교차 시트 & 캔틸레버 에어로 루프 차양막
 * - 트랙 측 전면 2.6m 와이어 메쉬 안전펜스(Catch Fence) & 하단 스폰서 광고판(Ad Board)
 * - 서킷 도로 건너편 관중 전용 대형 실시간 경기 중계 전광판(Spectator Jumbotron Screen)
 */
export function buildGrandstand(
  materials: StructureMaterials,
  circuitWidth: number,
  customLength: number = 52.0,
  customZ: number = 0.0,
  includeOppositeScreen: boolean = true
): THREE.Group {
  const grandstand = new THREE.Group();
  const halfW = circuitWidth / 2;
  const gsBaseX = halfW + 4.5;
  const gsLength = customLength;
  const gsZ = customZ;

  // 1. 5단 계단식 스탠드
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

  // 2. 캔틸레버 루프 차양막
  const canopyGeom = new THREE.BoxGeometry(11.0, 0.3, gsLength + 2.0);
  const canopy = new THREE.Mesh(canopyGeom, materials.roofMat);
  canopy.position.set(gsBaseX + 4.5, 7.2, gsZ);
  canopy.rotation.z = -0.16; // 트랙 방향으로 살짝 기울어진 에어로 루프
  grandstand.add(canopy);

  // 3. 후방 지지 강철 기둥
  const colCount = Math.max(3, Math.round(gsLength / 10.0));
  const colGeom = new THREE.BoxGeometry(0.6, 7.5, 0.6);
  const colStep = (gsLength - 8.0) / Math.max(1, colCount - 1);
  for (let c = 0; c < colCount; c++) {
    const col = new THREE.Mesh(colGeom, materials.steelMat);
    col.position.set(gsBaseX + 8.5, 3.75, gsZ - (gsLength - 8.0) / 2 + c * colStep);
    grandstand.add(col);
  }

  // 4. 관중석 전면 안전펜스 (Catch Fence) 및 하단 스폰서 광고판 (Sponsor Billboard Barrier)
  const fenceX = halfW + 1.8;
  const barrierGeom = new THREE.BoxGeometry(0.45, 1.0, gsLength);
  const barrier = new THREE.Mesh(barrierGeom, materials.concreteMat);
  barrier.position.set(fenceX, 0.5, gsZ);
  grandstand.add(barrier);

  // 하단 스폰서 광고 띠판 (트랙 방향)
  const adColors = [0x0284c7, 0x0f172a, 0xe11d48, 0x059669];
  const panelLen = (gsLength - 2.0) / 4;
  const adPanelGeom = new THREE.BoxGeometry(0.08, 0.72, panelLen);
  for (let a = 0; a < 4; a++) {
    const adMat = new THREE.MeshStandardMaterial({ color: adColors[a], roughness: 0.35, metalness: 0.2 });
    const adMesh = new THREE.Mesh(adPanelGeom, adMat);
    adMesh.position.set(fenceX - 0.24, 0.52, gsZ - (gsLength - 2.0) / 2 + panelLen * (a + 0.5));
    grandstand.add(adMesh);
  }

  // 상단 FIA 안전 철망 펜스 기둥 & 수평 인장 케이블
  const fencePoleCount = Math.max(4, Math.round(gsLength / 4.0));
  const poleGeom = new THREE.CylinderGeometry(0.04, 0.04, 1.8, 8);
  const poleStep = (gsLength - 2.0) / Math.max(1, fencePoleCount - 1);
  for (let p = 0; p < fencePoleCount; p++) {
    const pole = new THREE.Mesh(poleGeom, materials.steelMat);
    pole.position.set(fenceX, 1.9, gsZ - (gsLength - 2.0) / 2 + p * poleStep);
    grandstand.add(pole);
  }
  const cableGeom = new THREE.BoxGeometry(0.03, 0.03, gsLength);
  for (let c = 0; c < 3; c++) {
    const cable = new THREE.Mesh(cableGeom, materials.steelMat);
    cable.position.set(fenceX, 1.35 + c * 0.45, gsZ);
    grandstand.add(cable);
  }

  // 5. 서킷 도로 맞은편 대형 실시간 경기 중계 전광판 (Spectator Jumbotron Screen)
  if (includeOppositeScreen) {
    const screenX = -(halfW + 4.5);
    const screenZ = gsZ;

    // 듀얼 지지 스틸 필러
    const pylonGeom = new THREE.BoxGeometry(0.55, 6.4, 0.55);
    const pylonL = new THREE.Mesh(pylonGeom, materials.steelMat);
    pylonL.position.set(screenX, 3.2, screenZ - 2.6);
    const pylonR = new THREE.Mesh(pylonGeom, materials.steelMat);
    pylonR.position.set(screenX, 3.2, screenZ + 2.6);
    grandstand.add(pylonL, pylonR);

    // 대형 16:9 와이드스크린 프레임
    const frameW = 0.45;
    const frameH = 4.2;
    const frameL = 8.2;
    const frameGeom = new THREE.BoxGeometry(frameW, frameH, frameL);
    const frame = new THREE.Mesh(frameGeom, materials.steelMat);
    frame.position.set(screenX, 6.2, screenZ);
    grandstand.add(frame);

    // 관중석(+X) 방향을 정면으로 응시하는 고휘도 LED 디스플레이 화면
    const screenGeom = new THREE.BoxGeometry(0.08, 3.8, 7.8);
    const screenMesh = new THREE.Mesh(screenGeom, materials.emissiveCyanMat);
    screenMesh.position.set(screenX + frameW / 2 + 0.02, 6.2, screenZ);
    grandstand.add(screenMesh);

    // 상단 햇빛 차양 루프 바이저
    const visorGeom = new THREE.BoxGeometry(1.1, 0.14, frameL + 0.3);
    const visor = new THREE.Mesh(visorGeom, materials.roofMat);
    visor.position.set(screenX + 0.3, 8.35, screenZ);
    grandstand.add(visor);
  }

  // 6. 캔틸레버 루프 전면 경기장 대형 투광 조명 (Stadium Floodlight Clusters)
  const floodlightCount = Math.max(2, Math.round(gsLength / 18.0));
  const flStep = (gsLength - 8.0) / Math.max(1, floodlightCount - 1);
  const flHousingGeom = new THREE.BoxGeometry(0.5, 0.7, 1.8);
  const flBulbGeom = new THREE.BoxGeometry(0.08, 0.24, 0.44);

  for (let f = 0; f < floodlightCount; f++) {
    const flZ = gsZ - (gsLength - 8.0) / 2 + f * flStep;
    const flGroup = new THREE.Group();
    flGroup.position.set(gsBaseX - 0.95, 8.0, flZ);
    flGroup.rotation.z = -0.42; // 트랙 노면을 향해 하향 조사

    // 조명 하우징 바디
    const housing = new THREE.Mesh(flHousingGeom, materials.steelMat);
    flGroup.add(housing);

    // 4구 고휘도 스타디움 LED 발광 렌즈 (2 x 2)
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        const bulb = new THREE.Mesh(flBulbGeom, materials.floodlightBulbMat);
        bulb.position.set(-0.26, (row - 0.5) * 0.3, (col - 0.5) * 0.7);
        flGroup.add(bulb);
      }
    }
    grandstand.add(flGroup);

    // 트랙 노면을 직접 비추는 대형 투광 스포트라이트 (야간 경기 점등)
    const spot = new THREE.SpotLight(0xfff7ed, 0, 52, Math.PI / 2.6, 0.55, 1.2);
    spot.position.set(gsBaseX - 0.95, 8.0, flZ);
    const target = new THREE.Object3D();
    target.position.set(halfW * 0.2, 0, flZ);
    grandstand.add(target);
    spot.target = target;
    spot.userData = { isStadiumFloodlight: true, baseIntensity: 45.0 };
    grandstand.add(spot);
  }

  return grandstand;
}

