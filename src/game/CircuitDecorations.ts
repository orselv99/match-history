import * as THREE from 'three';
import {
  createStructureMaterials,
  buildStartGantry,
  buildGrandstand,
  buildPitComplex,
  buildControlTower,
  buildOverpassBridge,
  buildArchGate,
  type StructureMaterials,
} from './circuitStructures/index.ts';


/**
 * 3D 서킷 환경 조형물 및 노면 마킹 생성 전담 빌더
 * - 적백 연석(Curbs) 절차적 메시
 * - 결승선 체커보드 스트립 & 4개 스타팅 그리드 코너 브래킷 「 」 마킹
 * - 네온 듀얼빔 체크포인트 아치 게이트(ArchGate)
 * - 600m x 600m 다크 매트 그라운드 플레인 & 테크니컬 그리드 라인
 */
export class CircuitDecorations {
  /**
   * 스타팅 그리드 체커보드 라인 및 4대 머신 주차 그리드 슬롯 마킹 생성
   */
  public static buildStartingGrids(circuitCurve: THREE.CatmullRomCurve3, circuitWidth: number): THREE.Group {
    const group = new THREE.Group();
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc, side: THREE.DoubleSide, depthWrite: true });
    const blackMat = new THREE.MeshBasicMaterial({ color: 0x121316, side: THREE.DoubleSide, depthWrite: true });

    // 1) 결승선 체커 라인 (가로로 반듯하게 정렬된 2행 체커보드 스트립)
    const startPt = circuitCurve.getPointAt(0);
    const startTangent = circuitCurve.getTangentAt(0).normalize();
    const startRight = new THREE.Vector3(-startTangent.z, 0, startTangent.x).normalize();

    const checkerTotalW = circuitWidth - 2 * (0.15 + 0.35 + 0.05);
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
          p1.x, Math.max(0, p1.y) + 0.095, p1.z,
          p2.x, Math.max(0, p2.y) + 0.095, p2.z,
          p3.x, Math.max(0, p3.y) + 0.095, p3.z,
          p4.x, Math.max(0, p4.y) + 0.095, p4.z
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
      { distBehind: 16.0, lane: 2.2 },
      { distBehind: 27.0, lane: -2.2 },
      { distBehind: 38.0, lane: 2.2 },
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
      p1.x, Math.max(0, p1.y) + 0.095, p1.z,
      p2.x, Math.max(0, p2.y) + 0.095, p2.z,
      p3.x, Math.max(0, p3.y) + 0.095, p3.z,
      p4.x, Math.max(0, p4.y) + 0.095, p4.z
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

      const safeY = Math.max(0, pt.y);
      positions.push(
        leftInner.x, safeY + curbHeight + 0.08, leftInner.z,
        leftOuter.x, safeY + 0.085, leftOuter.z,
        rightInner.x, safeY + curbHeight + 0.08, rightInner.z,
        rightOuter.x, safeY + 0.085, rightOuter.z
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
          leftOuter.x, safeY + 0.08, leftOuter.z,
          leftOuter.x, deckBottomY, leftOuter.z,
          rightOuter.x, safeY + 0.08, rightOuter.z,
          rightOuter.x, deckBottomY, rightOuter.z
        );
      } else {
        // 일반 구간: 평지(pt.y < 0.15m)에서는 불필요한 어두운 치마 폭이 삐져나오지 않도록 0으로 수렴
        const spread = pt.y > 0.15 ? Math.min(1.8, pt.y * 0.35) : 0;
        const leftBase = new THREE.Vector3().copy(leftOuter).addScaledVector(right, -spread);
        const rightBase = new THREE.Vector3().copy(rightOuter).addScaledVector(right, spread);
        skirtPos.push(
          leftOuter.x, safeY + 0.08, leftOuter.z,
          leftBase.x, -0.05, leftBase.z,
          rightOuter.x, safeY + 0.08, rightOuter.z,
          rightBase.x, -0.05, rightBase.z
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

  public static buildOverpassBridge = buildOverpassBridge;

  private static grassTexture?: THREE.CanvasTexture;

  private static getGrassTexture(): THREE.CanvasTexture {
    if (this.grassTexture) return this.grassTexture;
    if (typeof document === 'undefined') {
      return new THREE.Texture() as THREE.CanvasTexture;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return new THREE.CanvasTexture(canvas);
    }

    // 1. 천연 서킷 잔디 베이스 (차분하고 묵직한 모스 그린)
    ctx.fillStyle = '#1c381e';
    ctx.fillRect(0, 0, 512, 512);

    // 2. F1 / 챔피언십 서킷 특유의 가로/세로 격자 잔디 깎기(Mowed Lawn Stripes) 패턴
    const stripeW = 64;
    for (let x = 0; x < 512; x += stripeW * 2) {
      ctx.fillStyle = 'rgba(38, 77, 40, 0.4)';
      ctx.fillRect(x, 0, stripeW, 512);
    }
    for (let y = 0; y < 512; y += stripeW * 2) {
      ctx.fillStyle = 'rgba(23, 49, 25, 0.3)';
      ctx.fillRect(0, y, 512, stripeW);
    }

    // 3. 미세 유기 잔디 노이즈 질감 입히기
    const imgData = ctx.getImageData(0, 0, 512, 512);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 24;
      d[i] = Math.max(12, Math.min(65, d[i] + n * 0.7));     // R
      d[i + 1] = Math.max(30, Math.min(95, d[i + 1] + n));  // G
      d[i + 2] = Math.max(12, Math.min(60, d[i + 2] + n * 0.6)); // B
    }
    ctx.putImageData(imgData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(70, 70); // 800m 대지에 균형 잡힌 자연스러운 잔디 밀도
    this.grassTexture = tex;
    return tex;
  }

  /**
   * 800m x 800m 서킷 천연 잔디 대지(Championship Circuit Turf) 생성
   */
  public static buildGround(): THREE.Group {
    const group = new THREE.Group();

    const groundGeom = new THREE.PlaneGeometry(800, 800);
    const grassTex = this.getGrassTexture();
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x244c26,
      map: grassTex,
      roughness: 0.92,
      metalness: 0.04,
    });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02; // 잔디 대지를 도로/연석(+0.08m)보다 낮게 배치하여 잔디 침범 원천 방지
    ground.receiveShadow = true;
    group.add(ground);


    return group;
  }

  public static buildArchGate = buildArchGate;

  /**
   * 국제 공인 서킷 규격 3D 랜드마크 오브젝트 배치
   * - 출발선 F1 5구 스타팅 라이트 갠트리 (Start / Finish Gantry)
   * - 65m 대형 관중석 그랜드스탠드 (Grandstand with Cantilever Roof)
   * - 2층 피트 빌딩 & 피트 월 & 피트 레인 (Pit Complex & Pit Wall)
   * - 4층 레이스 컨트롤 타워 & 대형 전광판 (Race Control Tower & Live Timing Board)
   */
  public static buildCircuitStructures(
    circuitCurve: THREE.CatmullRomCurve3,
    circuitWidth: number,
    sharedMaterials?: StructureMaterials
  ): THREE.Group {
    const root = new THREE.Group();

    const totalL = circuitCurve.getLength();
    const materials = sharedMaterials || createStructureMaterials();


    // 1. 출발선 갠트리 (F1 Start Lights & Race Gantry, t = 0)
    const startPt = circuitCurve.getPointAt(0);
    const startTangent = circuitCurve.getTangentAt(0).normalize();
    const heading = Math.atan2(startTangent.x, startTangent.z);

    const gantryGroup = new THREE.Group();
    gantryGroup.position.copy(startPt);
    gantryGroup.rotation.y = heading;
    gantryGroup.add(buildStartGantry(materials, circuitWidth));
    root.add(gantryGroup);

    // 2. 메인 스트레이트 그랜드스탠드 (출발선 통과 28m 지점 트랙 바깥쪽 + 안전펜스 + 맞은편 대형 전광판)
    {
      const t = (28.0 / totalL + 1.0) % 1.0;
      const pt = circuitCurve.getPointAt(t);
      const tangent = circuitCurve.getTangentAt(t).normalize();
      const h = Math.atan2(tangent.x, tangent.z);

      const gsGroup = new THREE.Group();
      gsGroup.position.copy(pt);
      gsGroup.rotation.y = h;
      gsGroup.add(buildGrandstand(materials, circuitWidth, 52.0, 0.0, false));
      root.add(gsGroup);
    }

    // 3. 메인 스트레이트 피트 콤플렉스 (출발선 통과 30m 지점 트랙 외곽 -X)
    {
      const t = (30.0 / totalL + 1.0) % 1.0;
      const pt = circuitCurve.getPointAt(t);
      const tangent = circuitCurve.getTangentAt(t).normalize();
      const h = Math.atan2(tangent.x, tangent.z);

      const pitGroup = new THREE.Group();
      pitGroup.position.copy(pt);
      pitGroup.rotation.y = h;
      pitGroup.add(buildPitComplex(materials, circuitWidth));
      root.add(pitGroup);
    }

    // 4. 레이스 컨트롤 타워 (출발선 통과 5m 지점 트랙 외곽 -X)
    {
      const t = (5.0 / totalL + 1.0) % 1.0;
      const pt = circuitCurve.getPointAt(t);
      const tangent = circuitCurve.getTangentAt(t).normalize();
      const h = Math.atan2(tangent.x, tangent.z);

      const towerGroup = new THREE.Group();
      towerGroup.position.copy(pt);
      towerGroup.rotation.y = h;
      towerGroup.add(buildControlTower(materials, circuitWidth));
      root.add(towerGroup);
    }

    // 5. 서킷 중간 주요 섹터(S1, S2, 고속 코너) 외곽 그랜드스탠드 추가 (코스 횡함 해소 및 전광판 설치)
    const intermediateTs = [0.28, 0.55, 0.82];
    intermediateTs.forEach((t) => {
      const pt = circuitCurve.getPointAt(t);
      const tangent = circuitCurve.getTangentAt(t).normalize();
      const h = Math.atan2(tangent.x, tangent.z);

      const sectorGroup = new THREE.Group();
      sectorGroup.position.copy(pt);
      sectorGroup.rotation.y = h;

      // 중간 관중석은 길이 38m, 안전펜스 및 맞은편 전광판과 함께 트랙 외곽에 배치
      sectorGroup.add(buildGrandstand(materials, circuitWidth, 38.0, 0.0, true));
      root.add(sectorGroup);
    });

    return root;
  }
}
