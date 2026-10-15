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
          p1.x, 0.08, p1.z,
          p2.x, 0.08, p2.z,
          p3.x, 0.08, p3.z,
          p4.x, 0.08, p4.z
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
      center.y = 0.052;
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
      p1.x, 0.08, p1.z,
      p2.x, 0.08, p2.z,
      p3.x, 0.08, p3.z,
      p4.x, 0.08, p4.z
    ], 3));
    geom.setIndex([0, 1, 2, 1, 3, 2]);
    geom.computeVertexNormals();

    return new THREE.Mesh(geom, mat);
  }

  /**
   * 도로 양쪽 적백 연석(Curbs) 메시 빌드
   */
  public static buildCurbs(points: THREE.Vector3[], halfWidth: number): THREE.Mesh {
    const curbWidth = 1.3;
    const curbHeight = 0.16;
    const segments = points.length;

    const curbGeom = new THREE.BufferGeometry();
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

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

      const leftInner = new THREE.Vector3().copy(pt).addScaledVector(right, -halfWidth);
      const leftOuter = new THREE.Vector3().copy(pt).addScaledVector(right, -halfWidth - curbWidth);

      positions.push(leftInner.x, curbHeight, leftInner.z);
      positions.push(leftOuter.x, 0.06, leftOuter.z);
      colors.push(r, g, b, r, g, b);

      const v0 = i * 2;
      const v1 = i * 2 + 1;
      const v2 = nextI * 2;
      const v3 = nextI * 2 + 1;
      indices.push(v0, v1, v2, v1, v3, v2);
    }

    curbGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    curbGeom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    curbGeom.setIndex(indices);
    curbGeom.computeVertexNormals();

    const curbMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.5,
    });
    return new THREE.Mesh(curbGeom, curbMat);
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
