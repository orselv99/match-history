import * as THREE from 'three';
import {
  createStructureMaterials,
  buildStartGantry,
  buildGrandstand,
  buildPitComplex,
  buildControlTower,
} from './circuitStructures/index.ts';


/**
 * 3D 서킷 환경 조형물 및 노면 마킹 생성 전담 빌더
 * - 적백 연석(Curbs) 절차적 메시
 * - 결승선 체커보드 스트립 & 4개 스타팅 그리드 코너 브래킷 「 」 마킹
 * - 네온 듀얼빔 체크포인트 아치 게이트(ArchGate)
 * - 600m x 600m 다크 매트 그라운드 플레인 & 테크니컬 그리드 라인
 */
export class TrackDecorations {
  /**
   * 스타팅 그리드 체커보드 라인 및 4대 머신 주차 그리드 슬롯 마킹 생성
   */
  public static buildStartingGrids(trackCurve: THREE.CatmullRomCurve3, trackWidth: number): THREE.Group {
    const group = new THREE.Group();
    const trackLength = trackCurve.getLength();
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc, side: THREE.DoubleSide, depthWrite: true });
    const blackMat = new THREE.MeshBasicMaterial({ color: 0x121316, side: THREE.DoubleSide, depthWrite: true });

    // 1) 결승선 체커 라인 (가로로 반듯하게 정렬된 2행 체커보드 스트립)
    const startPt = trackCurve.getPointAt(0);
    const startTangent = trackCurve.getTangentAt(0).normalize();
    const startRight = new THREE.Vector3(-startTangent.z, 0, startTangent.x).normalize();

    const checkerTotalW = trackWidth - 2 * (0.15 + 0.35 + 0.05);
    const cols = 18;
    const rows = 2;
    const blockW = checkerTotalW / cols;
    const blockL = 0.55;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const isWhite = (r + c) % 2 === 0;
        const mat = isWhite ? whiteMat : blackMat;

        const leftDist = -checkerTotalW / 2 + c * blockW;
        const rightDist = leftDist + blockW;
        const backDist = (r - rows / 2) * blockL;
        const frontDist = backDist + blockL;

        const p1 = new THREE.Vector3().copy(startPt).addScaledVector(startRight, leftDist).addScaledVector(startTangent, backDist);
        const p2 = new THREE.Vector3().copy(startPt).addScaledVector(startRight, rightDist).addScaledVector(startTangent, backDist);
        const p3 = new THREE.Vector3().copy(startPt).addScaledVector(startRight, leftDist).addScaledVector(startTangent, frontDist);
        const p4 = new THREE.Vector3().copy(startPt).addScaledVector(startRight, rightDist).addScaledVector(startTangent, frontDist);

        const quadGeom = new THREE.BufferGeometry();
        quadGeom.setAttribute('position', new THREE.Float32BufferAttribute([
          p1.x, p1.y + 0.08, p1.z,
          p2.x, p2.y + 0.08, p2.z,
          p3.x, p3.y + 0.08, p3.z,
          p4.x, p4.y + 0.08, p4.z
        ], 3));
        quadGeom.setIndex([0, 1, 2, 1, 3, 2]);
        quadGeom.computeVertexNormals();
        const blockMesh = new THREE.Mesh(quadGeom, mat);
        group.add(blockMesh);
      }
    }

    // 2) 4개 슬롯 코너 브래킷 「 」 마킹
    const slotConfigs = [
      { distBehind: 5.0, lane: -2.2 },
      { distBehind: 12.0, lane: 2.2 },
      { distBehind: 19.0, lane: -2.2 },
      { distBehind: 26.0, lane: 2.2 },
    ];

    const localXDir = new THREE.Vector3(startTangent.z, 0, -startTangent.x).normalize();

    slotConfigs.forEach((slot) => {
      const center = new THREE.Vector3()
        .copy(startPt)
        .addScaledVector(startTangent, -slot.distBehind)
        .addScaledVector(localXDir, slot.lane);
      const halfW = 1.35;
      const halfL = 2.4;
      const bracketArm = 0.7;
      const bThick = 0.12;

      const corners = [
        { sideX: -1, sideZ: 1 },  // 전방 좌측 「
        { sideX: 1, sideZ: 1 },   // 전방 우측 」
        { sideX: -1, sideZ: -1 }, // 후방 좌측 ㄴ
        { sideX: 1, sideZ: -1 },  // 후방 우측 ┙
      ];

      corners.forEach(c => {
        const cornerOrigin = new THREE.Vector3()
          .copy(center)
          .addScaledVector(localXDir, c.sideX * halfW)
          .addScaledVector(startTangent, c.sideZ * halfL);

        // 가로 바
        const hStart = new THREE.Vector3().copy(cornerOrigin);
        const hEnd = new THREE.Vector3().copy(cornerOrigin).addScaledVector(localXDir, -c.sideX * bracketArm);
        group.add(this.createMarkingStrip(hStart, hEnd, startTangent, bThick, whiteMat));

        // 세로 바
        const vStart = new THREE.Vector3().copy(cornerOrigin);
        const vEnd = new THREE.Vector3().copy(cornerOrigin).addScaledVector(startTangent, -c.sideZ * bracketArm);
        group.add(this.createMarkingStrip(vStart, vEnd, localXDir, bThick, whiteMat));
      });
    });

    return group;
  }

  private static createMarkingStrip(start: THREE.Vector3, end: THREE.Vector3, normalVec: THREE.Vector3, thick: number, mat: THREE.Material): THREE.Mesh {
    const halfT = thick / 2;
    const p1 = new THREE.Vector3().copy(start).addScaledVector(normalVec, -halfT);
    const p2 = new THREE.Vector3().copy(start).addScaledVector(normalVec, halfT);
    const p3 = new THREE.Vector3().copy(end).addScaledVector(normalVec, -halfT);
    const p4 = new THREE.Vector3().copy(end).addScaledVector(normalVec, halfT);

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute([
      p1.x, p1.y + 0.08, p1.z,
      p2.x, p2.y + 0.08, p2.z,
      p3.x, p3.y + 0.08, p3.z,
      p4.x, p4.y + 0.08, p4.z
    ], 3));
    geom.setIndex([0, 1, 2, 1, 3, 2]);
    geom.computeVertexNormals();

    return new THREE.Mesh(geom, mat);
  }

  /**
   * 도로 양쪽 적백 연석(Curbs) 및 고저차 입체 성토 옹벽(Embankment Skirt) / 교량 상판 슬래브 빌드
   */
  public static buildCurbs(
    points: THREE.Vector3[],
    halfWidth: number,
    bridgeSpan?: [number, number]
  ): THREE.Group {
    const group = new THREE.Group();
    const curbWidth = 1.3;
    const curbHeight = 0.16;
    const segments = points.length;

    const curbGeom = new THREE.BufferGeometry();
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    // 고가/언덕 구간 하부를 받쳐주는 다크 콘크리트 성토 옹벽(Embankment) 및 다리 상판 거더 버퍼
    const skirtGeom = new THREE.BufferGeometry();
    const skirtPos: number[] = [];
    const skirtIdx: number[] = [];

    for (let i = 0; i < segments; i++) {
      const prevI = (i - 1 + segments) % segments;
      const nextI = (i + 1) % segments;
      const pt = points[i];
      const prevPt = points[prevI];
      const nextPt = points[nextI];

      const forward = new THREE.Vector3().subVectors(nextPt, prevPt).normalize();
      const right = new THREE.Vector3(-forward.z, 0, forward.x).normalize();

      const isSpecAccent = Math.floor(i / 3) % 2 === 0;
      const r = isSpecAccent ? 0.77 : 0.93;
      const g = isSpecAccent ? 0.35 : 0.93;
      const b = isSpecAccent ? 0.45 : 0.93;

      // 좌측 연석 (Left Curb)
      const leftInner = new THREE.Vector3().copy(pt).addScaledVector(right, -halfWidth);
      const leftOuter = new THREE.Vector3().copy(pt).addScaledVector(right, -halfWidth - curbWidth);
      // 우측 연석 (Right Curb)
      const rightInner = new THREE.Vector3().copy(pt).addScaledVector(right, halfWidth);
      const rightOuter = new THREE.Vector3().copy(pt).addScaledVector(right, halfWidth + curbWidth);

      positions.push(
        leftInner.x, pt.y + curbHeight, leftInner.z,
        leftOuter.x, pt.y + 0.06, leftOuter.z,
        rightInner.x, pt.y + curbHeight, rightInner.z,
        rightOuter.x, pt.y + 0.06, rightOuter.z
      );
      colors.push(r, g, b, r, g, b, r, g, b, r, g, b);

      const base = i * 4;
      const nextBase = nextI * 4;
      // 좌측 연석 쿼드
      indices.push(base, base + 1, nextBase, base + 1, nextBase + 1, nextBase);
      // 우측 연석 쿼드
      indices.push(base + 2, nextBase + 2, base + 3, base + 3, nextBase + 2, nextBase + 3);

      const t = i / segments;
      const nextT = nextI / segments;
      const isBridge = bridgeSpan ? (t >= bridgeSpan[0] && t <= bridgeSpan[1]) : false;
      const isNextBridge = bridgeSpan ? (nextT >= bridgeSpan[0] && nextT <= bridgeSpan[1]) : false;

      if (isBridge) {
        // 다리(Overpass Bridge) 구간: 하부 통과 도로를 막지 않도록 지면(0m) 대신 상판 하부(pt.y - 1.25m)까지만 박스 거더 생성
        const deckBottomY = Math.max(0.2, pt.y - 1.25);
        skirtPos.push(
          leftOuter.x, pt.y + 0.05, leftOuter.z,
          leftOuter.x, deckBottomY, leftOuter.z,
          rightOuter.x, pt.y + 0.05, rightOuter.z,
          rightOuter.x, deckBottomY, rightOuter.z
        );
      } else {
        // 일반 구간: 평지(pt.y < 0.15m)에서는 불필요한 어두운 치마 폭이 삐져나오지 않도록 0으로 수렴
        const spread = pt.y > 0.15 ? Math.min(1.8, pt.y * 0.35) : 0;
        const leftBase = new THREE.Vector3().copy(leftOuter).addScaledVector(right, -spread);
        const rightBase = new THREE.Vector3().copy(rightOuter).addScaledVector(right, spread);
        skirtPos.push(
          leftOuter.x, pt.y + 0.05, leftOuter.z,
          leftBase.x, 0, leftBase.z,
          rightOuter.x, pt.y + 0.05, rightOuter.z,
          rightBase.x, 0, rightBase.z
        );
      }

      // 다리 시작/끝 경계에서는 수직 절단면이 꼬이지 않도록 동일 속성 구간끼리만 스커트 연결
      if (isBridge === isNextBridge) {
        skirtIdx.push(
          base, nextBase, base + 1, base + 1, nextBase, nextBase + 1,
          base + 2, base + 3, nextBase + 2, base + 3, nextBase + 3, nextBase + 2
        );
        // 다리 구간은 하부 도로에서 올려다볼 때 막혀 보이도록 상판 바닥면(Underside Slab)도 함께 마감
        if (isBridge) {
          skirtIdx.push(base + 1, nextBase + 1, base + 3, base + 3, nextBase + 1, nextBase + 3);
        }
      }
    }

    curbGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    curbGeom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    curbGeom.setIndex(indices);
    curbGeom.computeVertexNormals();

    const curbMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.5,
      side: THREE.DoubleSide,
    });
    group.add(new THREE.Mesh(curbGeom, curbMat));

    skirtGeom.setAttribute('position', new THREE.Float32BufferAttribute(skirtPos, 3));
    skirtGeom.setIndex(skirtIdx);
    skirtGeom.computeVertexNormals();
    const skirtMat = new THREE.MeshStandardMaterial({
      color: 0x262b36,
      roughness: 0.85,
      metalness: 0.15,
      side: THREE.DoubleSide,
    });
    group.add(new THREE.Mesh(skirtGeom, skirtMat));

    if (bridgeSpan) {
      group.add(this.buildOverpassBridge(points, halfWidth, bridgeSpan));
    }

    return group;
  }

  /**
   * 고가 대교(Overpass Viaduct Bridge) 전용 3D 구조물 빌더
   * - 교량 양측 방호 난간(Parapet Wall) 및 네온 시안 가드레일
   * - 상부 강철 아치 트러스 포털 프레임(Steel Truss Portals)
   * - 하부 관통 도로와 간섭하지 않는 대형 철근 콘크리트 교각(Bridge Piers & Pier Caps)
   */
  public static buildOverpassBridge(
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

  /**
   * 600m x 600m 다크 매트 그라운드 플레인 & 테크니컬 그리드 헬퍼 생성
   */
  public static buildGround(): THREE.Group {
    const group = new THREE.Group();

    const groundGeom = new THREE.PlaneGeometry(600, 600);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x121316,
      roughness: 0.95,
      metalness: 0.05,
    });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    group.add(ground);

    const grid = new THREE.GridHelper(600, 60, 0x3a3d47, 0x1a1b20);
    grid.position.y = 0.01;
    group.add(grid);

    return group;
  }

  /**
   * 스타트/피니시 및 섹터 체크포인트 네온 듀얼빔 아치 게이트 생성
   */
  public static buildArchGate(pos: THREE.Vector3, tangent: THREE.Vector3, isFinish: boolean, trackWidth: number): THREE.Group {
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

  /**
   * 국제 공인 서킷 규격 3D 랜드마크 오브젝트 배치
   * - 출발선 F1 5구 스타팅 라이트 갠트리 (Start / Finish Gantry)
   * - 65m 대형 관중석 그랜드스탠드 (Grandstand with Cantilever Roof)
   * - 2층 피트 빌딩 & 피트 월 & 피트 레인 (Pit Complex & Pit Wall)
   * - 4층 레이스 컨트롤 타워 & 대형 전광판 (Race Control Tower & Live Timing Board)
   */
  public static buildCircuitStructures(trackCurve: THREE.CatmullRomCurve3, trackWidth: number): THREE.Group {
    const group = new THREE.Group();

    const startPt = trackCurve.getPointAt(0);
    const startTangent = trackCurve.getTangentAt(0).normalize();
    const heading = Math.atan2(startTangent.x, startTangent.z);

    group.position.copy(startPt);
    group.rotation.y = heading;

    // 공통 구조물 머티리얼 인스턴스화
    const materials = createStructureMaterials();

    // 1. 출발선 갠트리 (F1 Start Lights & Race Gantry)
    group.add(buildStartGantry(materials, trackWidth));

    // 2. 그랜드스탠드 (Grandstand - 출발선 이전 Z <= 0 구간)
    group.add(buildGrandstand(materials, trackWidth));

    // 3. 피트 콤플렉스 (Pit Building & Pit Wall & Pit Lane - 출발선 이전 Z <= 0 구간)
    group.add(buildPitComplex(materials, trackWidth));

    // 4. 레이스 컨트롤 타워 (Race Control Tower & Timing Board - Z <= 0 구간)
    group.add(buildControlTower(materials, trackWidth));

    return group;
  }
}
