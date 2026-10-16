import * as THREE from 'three';

/**
 * 고가 대교(Overpass Viaduct Bridge) 전용 3D 구조물 빌더
 * - 교량 양측 방호 난간(Parapet Wall) 및 네온 시안 가드레일
 * - 상부 강철 아치 트러스 포털 프레임(Steel Truss Portals)
 * - 하부 관통 도로와 간섭하지 않는 대형 철근 콘크리트 교각(Bridge Piers & Pier Caps)
 */
export function buildOverpassBridge(
  points: THREE.Vector3[],
  halfWidth: number,
  bridgeSpan: [number, number]
): THREE.Group {
  const bridgeGroup = new THREE.Group();
  const segments = points.length;
  const startIdx = Math.floor(bridgeSpan[0] * segments);
  const endIdx = Math.ceil(bridgeSpan[1] * segments);
  const railOffset = halfWidth + 1.15;

  const concretePierMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.8,
    metalness: 0.15,
  });
  const steelTrussMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.45,
    metalness: 0.65,
  });
  const neonRailMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 1.5,
    roughness: 0.25,
  });

  // 1. 교량 양측 방호벽 난간 (Parapet Barrier) & 상단 시안 안전 레일 연속 리본 생성
  const parapetGeom = new THREE.BufferGeometry();
  const parapetPos: number[] = [];
  const parapetIdx: number[] = [];

  const railGeom = new THREE.BufferGeometry();
  const railPos: number[] = [];
  const railIdx: number[] = [];

  let vCount = 0;
  for (let i = startIdx; i <= endIdx; i++) {
    const idx = i % segments;
    const prevIdx = (idx - 1 + segments) % segments;
    const nextIdx = (idx + 1) % segments;
    const pt = points[idx];
    const forward = new THREE.Vector3().subVectors(points[nextIdx], points[prevIdx]).normalize();
    const right = new THREE.Vector3(-forward.z, 0, forward.x).normalize();

    const lPos = new THREE.Vector3().copy(pt).addScaledVector(right, -railOffset);
    const rPos = new THREE.Vector3().copy(pt).addScaledVector(right, railOffset);

    // 방호 난간: 높이 0.05m ~ 0.90m
    parapetPos.push(
      lPos.x, pt.y + 0.05, lPos.z,
      lPos.x, pt.y + 0.90, lPos.z,
      rPos.x, pt.y + 0.05, rPos.z,
      rPos.x, pt.y + 0.90, rPos.z
    );

    // 상단 시안 네온 레일: 높이 0.90m ~ 1.08m
    railPos.push(
      lPos.x, pt.y + 0.90, lPos.z,
      lPos.x, pt.y + 1.08, lPos.z,
      rPos.x, pt.y + 0.90, rPos.z,
      rPos.x, pt.y + 1.08, rPos.z
    );

    if (i < endIdx) {
      const b = vCount * 4;
      const nb = (vCount + 1) * 4;
      parapetIdx.push(
        b, nb, b + 1, b + 1, nb, nb + 1,
        b + 2, b + 3, nb + 2, b + 3, nb + 3, nb + 2
      );
      railIdx.push(
        b, nb, b + 1, b + 1, nb, nb + 1,
        b + 2, b + 3, nb + 2, b + 3, nb + 3, nb + 2
      );
    }
    vCount++;
  }

  parapetGeom.setAttribute('position', new THREE.Float32BufferAttribute(parapetPos, 3));
  parapetGeom.setIndex(parapetIdx);
  parapetGeom.computeVertexNormals();
  const parapetMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.6,
    metalness: 0.3,
    side: THREE.DoubleSide,
  });
  bridgeGroup.add(new THREE.Mesh(parapetGeom, parapetMat));

  railGeom.setAttribute('position', new THREE.Float32BufferAttribute(railPos, 3));
  railGeom.setIndex(railIdx);
  railGeom.computeVertexNormals();
  const railMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 1.4,
    side: THREE.DoubleSide,
  });
  bridgeGroup.add(new THREE.Mesh(railGeom, railMat));

  // 2. 교량 상부 강철 트러스 아치 게이트 & 하부 콘크리트 교각(Pier) 배치
  const spanLen = endIdx - startIdx;
  const portalStep = Math.max(5, Math.floor(spanLen / 6));

  for (let i = startIdx + 3; i <= endIdx - 3; i += portalStep) {
    const idx = i % segments;
    const prevIdx = (idx - 1 + segments) % segments;
    const nextIdx = (idx + 1) % segments;
    const pt = points[idx];
    const forward = new THREE.Vector3().subVectors(points[nextIdx], points[prevIdx]).normalize();
    const heading = Math.atan2(forward.x, forward.z);

    const frameGroup = new THREE.Group();
    frameGroup.position.copy(pt);
    frameGroup.rotation.y = heading;

    const colX = halfWidth + 1.25;
    const portalH = 6.8;

    // 상부 강철 트러스 기둥 (좌/우) 및 오버헤드 크로스 거더
    const colGeom = new THREE.BoxGeometry(0.55, portalH, 0.55);
    const leftCol = new THREE.Mesh(colGeom, steelTrussMat);
    leftCol.position.set(-colX, portalH * 0.5, 0);
    const rightCol = new THREE.Mesh(colGeom, steelTrussMat);
    rightCol.position.set(colX, portalH * 0.5, 0);

    const topBeamGeom = new THREE.BoxGeometry(colX * 2 + 0.8, 0.65, 0.65);
    const topBeam = new THREE.Mesh(topBeamGeom, steelTrussMat);
    topBeam.position.set(0, portalH, 0);

    const topLightGeom = new THREE.BoxGeometry(colX * 1.6, 0.16, 0.72);
    const topLight = new THREE.Mesh(topLightGeom, neonRailMat);
    topLight.position.set(0, portalH - 0.35, 0);

    frameGroup.add(leftCol, rightCol, topBeam, topLight);

    // 하부 다른 도로와의 최소 2D 거리 검사 (하부 관통 도로 위에는 교각 기둥을 세우지 않고 오픈 스팬 유지!)
    let minDistToOtherRoad = Infinity;
    for (let j = 0; j < segments; j++) {
      const diffIdx = Math.min(Math.abs(j - idx), segments - Math.abs(j - idx));
      if (diffIdx < 24) continue;
      const d = Math.hypot(points[j].x - pt.x, points[j].z - pt.z);
      if (d < minDistToOtherRoad) minDistToOtherRoad = d;
    }

    if (minDistToOtherRoad > halfWidth + 8.5 && pt.y > 3.5) {
      const pierH = pt.y - 1.1;
      // 코핑보 (Pier Cap Crosshead)
      const capGeom = new THREE.BoxGeometry(colX * 2 + 1.2, 1.1, 2.2);
      const capMesh = new THREE.Mesh(capGeom, concretePierMat);
      capMesh.position.set(0, -1.1, 0);
      frameGroup.add(capMesh);

      // 좌/우 원통형 대형 철근 콘크리트 교각 기둥 (Twin Columns down to y=0)
      const pierGeom = new THREE.CylinderGeometry(1.05, 1.25, pierH, 12);
      const leftPier = new THREE.Mesh(pierGeom, concretePierMat);
      leftPier.position.set(-(halfWidth * 0.68), -1.1 - pierH * 0.5, 0);
      const rightPier = new THREE.Mesh(pierGeom, concretePierMat);
      rightPier.position.set(halfWidth * 0.68, -1.1 - pierH * 0.5, 0);
      frameGroup.add(leftPier, rightPier);
    }

    bridgeGroup.add(frameGroup);
  }

  return bridgeGroup;
}
