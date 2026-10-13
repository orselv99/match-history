import * as THREE from 'three';

export interface CheckpointTrigger {
  id: number;
  position: THREE.Vector3;
  direction: THREE.Vector3;
  radius: number;
  isPassed: boolean;
}

/**
 * Three.js 폐루프 서킷 트랙 (Circuit Track)
 * - 아스팔트 노면 + 적백 연석(Curbs) + 3개 섹터 체크포인트
 * - CatmullRomCurve3 기반의 중심선 궤적
 */
export class CircuitTrack {
  public group: THREE.Group = new THREE.Group();
  public trackCurve: THREE.CatmullRomCurve3;
  public trackWidth: number = 14; // 도로 폭 14m
  public checkpoints: CheckpointTrigger[] = [];
  public trackPoints2D: { x: number; z: number }[] = [];

  constructor() {
    // 1. 서킷 제어점 (F1 스타일 테크니컬 루프 서킷)
    const rawPoints = [
      new THREE.Vector3(0, 0, 0),         // 스타트/피니시 라인
      new THREE.Vector3(80, 0, 0),        // 메인 스트레이트
      new THREE.Vector3(140, 0, -30),     // 고속 우코너 진입
      new THREE.Vector3(170, 0, -90),     // 헤어핀 1
      new THREE.Vector3(130, 0, -140),
      new THREE.Vector3(60, 0, -120),     // 섹터 1 체크포인트 부근
      new THREE.Vector3(10, 0, -150),     // 시케인 진입
      new THREE.Vector3(-40, 0, -130),
      new THREE.Vector3(-80, 0, -170),    // 백 스트레이트
      new THREE.Vector3(-150, 0, -130),   // 섹터 2 체크포인트 부근
      new THREE.Vector3(-160, 0, -60),    // 깊은 헤어핀 2
      new THREE.Vector3(-120, 0, -20),
      new THREE.Vector3(-80, 0, 40),      // 마지막 코너 복귀 구간
      new THREE.Vector3(-30, 0, 20),
    ];

    this.trackCurve = new THREE.CatmullRomCurve3(rawPoints, true, 'centripetal');

    // 미니맵용 2D 샘플 점 추출 (200개)
    const samplePoints = this.trackCurve.getPoints(200);
    this.trackPoints2D = samplePoints.map(p => ({ x: p.x, z: p.z }));

    // 트랙 3D 지오메트리 빌드
    this.buildTrackMesh();
    this.buildGround();
    this.setupCheckpoints();
  }

  private buildTrackMesh(): void {
    const segments = 300;
    // THREE.CatmullRomCurve3.getSpacedPoints는 closed 커브일 때도 0부터 1.0까지 segments + 1개의 점을 반환합니다.
    // 폐루프 서킷의 이음새 중복 버그(0과 1.0에서의 영벡터 계산 오류 및 대각선 왜곡)를 방지하기 위해
    // 마지막 중복점을 제거하고 정확히 segments개의 고유 순환 점을 유지합니다.
    const rawPoints = this.trackCurve.getSpacedPoints(segments);
    const roadPoints = rawPoints.slice(0, segments);

    // 아스팔트 리본 메시 지오메트리 생성
    const roadGeom = new THREE.BufferGeometry();
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const halfWidth = this.trackWidth / 2;

    for (let i = 0; i <= segments; i++) {
      const idx = i % segments;
      const prevIdx = (idx - 1 + segments) % segments;
      const nextIdx = (idx + 1) % segments;
      const pt = roadPoints[idx];
      const prevPt = roadPoints[prevIdx];
      const nextPt = roadPoints[nextIdx];

      // 접선 벡터(Forward) 및 법선 벡터(Right) - 중앙 차분으로 완벽한 곡률 연속성 확보
      const forward = new THREE.Vector3().subVectors(nextPt, prevPt).normalize();
      const right = new THREE.Vector3(-forward.z, 0, forward.x).normalize();

      const leftPos = new THREE.Vector3().copy(pt).addScaledVector(right, -halfWidth);
      const rightPos = new THREE.Vector3().copy(pt).addScaledVector(right, halfWidth);

      // Y좌표 0.05m 살짝 띄워 z-fighting 방지
      positions.push(leftPos.x, 0.05, leftPos.z);
      positions.push(rightPos.x, 0.05, rightPos.z);

      const u = (i / segments) * 20;
      uvs.push(0, u, 1, u);

      if (i < segments) {
        const base = i * 2;
        indices.push(base, base + 1, base + 2);
        indices.push(base + 1, base + 3, base + 2);
      }
    }

    roadGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    roadGeom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    roadGeom.setIndex(indices);
    roadGeom.computeVertexNormals();

    // 아스팔트 재질 (시인성을 대폭 높인 뚜렷한 테크니컬 아스팔트 그레이)
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x2e323b,
      roughness: 0.7,
      metalness: 0.15,
    });
    const roadMesh = new THREE.Mesh(roadGeom, roadMat);
    roadMesh.receiveShadow = true;
    this.group.add(roadMesh);

    // 연석(Curbs) 및 트랙 도로 마킹 추가
    this.buildCurbs(roadPoints, halfWidth);
    this.buildRoadMarkings(roadPoints, halfWidth);
  }

  private buildRoadMarkings(points: THREE.Vector3[], halfWidth: number): void {
    const segments = points.length;
    // 일반도로 양쪽 외곽 흰색 실선 마킹 (DoubleSide로 백페이스 컬링 방지 및 시인성 극대화)
    const boundaryMat = new THREE.MeshBasicMaterial({
      color: 0xf8fafc,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
    const centerMat = new THREE.MeshBasicMaterial({
      color: 0x7dd3fc, // 파스텔 스카이 중앙 점선
      side: THREE.DoubleSide,
      depthWrite: true,
    });

    const lineWidth = 0.35; // 35cm 굵기의 선명한 실선

    // 1. 좌측 외곽선 (Left Edge: -halfWidth 부근) - 완벽한 폐루프 연속 연결 (대각선 왜곡 완전 제거)
    {
      const leftGeom = new THREE.BufferGeometry();
      const pos: number[] = [];
      const idx: number[] = [];

      for (let i = 0; i < segments; i++) {
        const prevI = (i - 1 + segments) % segments;
        const nextI = (i + 1) % segments;
        const curr = points[i];
        const prev = points[prevI];
        const next = points[nextI];

        // 중앙 차분 기반 완벽한 법선 계산으로 시작점/결승선에서도 연속성 유지
        const fwd = new THREE.Vector3().subVectors(next, prev).normalize();
        const rgt = new THREE.Vector3(-fwd.z, 0, fwd.x).normalize();

        const outerDist = -halfWidth + 0.15;
        const innerDist = outerDist + lineWidth;

        const pOuter = new THREE.Vector3().copy(curr).addScaledVector(rgt, outerDist);
        const pInner = new THREE.Vector3().copy(curr).addScaledVector(rgt, innerDist);

        pos.push(pOuter.x, 0.085, pOuter.z);
        pos.push(pInner.x, 0.085, pInner.z);

        const v0 = i * 2;
        const v1 = i * 2 + 1;
        const v2 = nextI * 2;
        const v3 = nextI * 2 + 1;
        idx.push(v0, v1, v2, v1, v3, v2);
      }
      leftGeom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      leftGeom.setIndex(idx);
      leftGeom.computeVertexNormals();
      const leftLine = new THREE.Mesh(leftGeom, boundaryMat);
      this.group.add(leftLine);
    }

    // 2. 우측 외곽선 (Right Edge: +halfWidth 부근) - 완벽한 폐루프 연속 연결
    {
      const rightGeom = new THREE.BufferGeometry();
      const pos: number[] = [];
      const idx: number[] = [];

      for (let i = 0; i < segments; i++) {
        const prevI = (i - 1 + segments) % segments;
        const nextI = (i + 1) % segments;
        const curr = points[i];
        const prev = points[prevI];
        const next = points[nextI];

        const fwd = new THREE.Vector3().subVectors(next, prev).normalize();
        const rgt = new THREE.Vector3(-fwd.z, 0, fwd.x).normalize();

        const outerDist = halfWidth - 0.15;
        const innerDist = outerDist - lineWidth;

        const pOuter = new THREE.Vector3().copy(curr).addScaledVector(rgt, outerDist);
        const pInner = new THREE.Vector3().copy(curr).addScaledVector(rgt, innerDist);

        pos.push(pInner.x, 0.085, pInner.z);
        pos.push(pOuter.x, 0.085, pOuter.z);

        const v0 = i * 2;
        const v1 = i * 2 + 1;
        const v2 = nextI * 2;
        const v3 = nextI * 2 + 1;
        idx.push(v0, v1, v2, v1, v3, v2);
      }
      rightGeom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      rightGeom.setIndex(idx);
      rightGeom.computeVertexNormals();
      const rightLine = new THREE.Mesh(rightGeom, boundaryMat);
      this.group.add(rightLine);
    }

    // 3. 중앙 대시선 (Center Dashed Line - 출발선 및 그리드 구간인 t=0.91~1.0 및 t=0.0~0.05 구간은 제외)
    const centerGeom = new THREE.BufferGeometry();
    const cPos: number[] = [];
    const cIdx: number[] = [];
    let cVertexIdx = 0;

    for (let i = 0; i < segments; i++) {
      const progress = i / segments;
      // 출발선 및 그리드 구역 (0.91 ~ 1.0 및 0.0 ~ 0.05)에는 중앙선 제외
      if (progress > 0.91 || progress < 0.05) continue;

      if (i % 4 < 2) {
        const prevI = (i - 1 + segments) % segments;
        const nextI = (i + 1) % segments;
        const curr = points[i];
        const next = points[nextI];
        const prev = points[prevI];
        const fwd = new THREE.Vector3().subVectors(next, prev).normalize();
        const rgt = new THREE.Vector3(-fwd.z, 0, fwd.x).normalize();

        const halfW = 0.18;
        const p1 = new THREE.Vector3().copy(curr).addScaledVector(rgt, -halfW);
        const p2 = new THREE.Vector3().copy(curr).addScaledVector(rgt, halfW);
        const p3 = new THREE.Vector3().copy(next).addScaledVector(rgt, -halfW);
        const p4 = new THREE.Vector3().copy(next).addScaledVector(rgt, halfW);

        cPos.push(p1.x, 0.085, p1.z, p2.x, 0.085, p2.z, p3.x, 0.085, p3.z, p4.x, 0.085, p4.z);
        cIdx.push(cVertexIdx, cVertexIdx + 1, cVertexIdx + 2, cVertexIdx + 1, cVertexIdx + 3, cVertexIdx + 2);
        cVertexIdx += 4;
      }
    }
    centerGeom.setAttribute('position', new THREE.Float32BufferAttribute(cPos, 3));
    centerGeom.setIndex(cIdx);
    centerGeom.computeVertexNormals();
    const centerLine = new THREE.Mesh(centerGeom, centerMat);
    this.group.add(centerLine);

    // 4. 스타팅 그리드 마킹 & 체커 라인
    this.buildStartingGrids(points);
  }

  private buildStartingGrids(points: THREE.Vector3[]): void {
    const trackLength = this.trackCurve.getLength();
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc, side: THREE.DoubleSide, depthWrite: true });
    const blackMat = new THREE.MeshBasicMaterial({ color: 0x121316, side: THREE.DoubleSide, depthWrite: true });
    const specMat = new THREE.MeshBasicMaterial({ color: 0xc45a72, side: THREE.DoubleSide, depthWrite: true });

    // 1) 결승선 체커 라인 (가로로 반듯하게 정렬된 2행 체커보드 스트립)
    const startPt = this.trackCurve.getPointAt(0);
    const startTangent = this.trackCurve.getTangentAt(0).normalize();
    const startRight = new THREE.Vector3(-startTangent.z, 0, startTangent.x).normalize();

    // 양쪽 외곽 실선 안쪽에 딱 맞게 정렬 (실선 침범 방지: 12.9m)
    const checkerTotalW = this.trackWidth - 2 * (0.15 + 0.35 + 0.05);
    const cols = 18;
    const rows = 2;
    const blockW = checkerTotalW / cols; // 가로 블록 폭
    const blockL = 0.55; // 진행 방향 길이

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const isWhite = (r + c) % 2 === 0;
        const mat = isWhite ? whiteMat : blackMat;

        // 반듯한 사각형 버텍스를 startTangent와 startRight 축으로 직접 계산 (회전 왜곡 없음)
        const leftDist = - checkerTotalW / 2 + c * blockW;
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
        this.group.add(blockMesh);
      }
    }

    // 2) 4개 슬롯 코너 브래킷 「 」 마킹
    // 슬롯 1 (Pole: -2.2m, 결승선 5m 뒤), 슬롯 2 (+2.2m, 12m 뒤), 슬롯 3 (-2.2m, 19m 뒤), 슬롯 4 (+2.2m, 26m 뒤)
    const slotConfigs = [
      { distBehind: 5.0, lane: -2.2, isPole: true },
      { distBehind: 12.0, lane: 2.2, isPole: false },
      { distBehind: 19.0, lane: -2.2, isPole: false },
      { distBehind: 26.0, lane: 2.2, isPole: false },
    ];

    slotConfigs.forEach((slot, idx) => {
      const t = (1.0 - (slot.distBehind / trackLength)) % 1.0;
      const pt = this.trackCurve.getPointAt(t);
      const tangent = this.trackCurve.getTangentAt(t).normalize();
      const right = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      const center = new THREE.Vector3().copy(pt).addScaledVector(right, slot.lane);
      const mat = slot.isPole ? specMat : whiteMat;

      // 차량 크기에 맞춘 코너 브래킷 규격
      const halfW = 1.35; // 폭 반경
      const halfL = 2.4;  // 길이 반경
      const bracketArm = 0.7; // 브래킷 가지 길이
      const bThick = 0.12;   // 선 두께

      // 4개 코너 브래킷: [전방좌측 「], [전방우측 」], [후방좌측 ㄴ], [후방우측 ┙]
      const corners = [
        { sideX: -1, sideZ: 1 },  // 전방 좌측 「
        { sideX: 1, sideZ: 1 },   // 전방 우측 」
        { sideX: -1, sideZ: -1 }, // 후방 좌측 ㄴ
        { sideX: 1, sideZ: -1 },  // 후방 우측 ┙
      ];

      corners.forEach(c => {
        // 코너 원점
        const cornerOrigin = new THREE.Vector3()
          .copy(center)
          .addScaledVector(right, c.sideX * halfW)
          .addScaledVector(tangent, c.sideZ * halfL);

        // 1. 가로 바
        const hStart = new THREE.Vector3().copy(cornerOrigin);
        const hEnd = new THREE.Vector3().copy(cornerOrigin).addScaledVector(right, -c.sideX * bracketArm);
        this.addMarkingStrip(hStart, hEnd, tangent, bThick, mat);

        // 2. 세로 바
        const vStart = new THREE.Vector3().copy(cornerOrigin);
        const vEnd = new THREE.Vector3().copy(cornerOrigin).addScaledVector(tangent, -c.sideZ * bracketArm);
        this.addMarkingStrip(vStart, vEnd, right, bThick, mat);
      });
    });
  }

  private addMarkingStrip(start: THREE.Vector3, end: THREE.Vector3, normalVec: THREE.Vector3, thick: number, mat: THREE.Material): void {
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

    const strip = new THREE.Mesh(geom, mat);
    this.group.add(strip);
  }

  /**
   * 스타팅 그리드 슬롯 인덱스(0: Pole, 1, 2, 3)의 위치 및 헤딩각 반환
   */
  public getGridPosition(slotIndex: number): { position: THREE.Vector3; heading: number } {
    const trackLength = this.trackCurve.getLength();
    const slotDistances = [4.5, 11.5, 18.5, 25.5];
    const slotLanes = [-2.2, 2.2, -2.2, 2.2];

    const distBehind = slotDistances[Math.min(3, slotIndex)] || 4.5;
    const lane = slotLanes[Math.min(3, slotIndex)] || 0;

    const t = (1.0 - (distBehind / trackLength)) % 1.0;
    const pt = this.trackCurve.getPointAt(t);
    const tangent = this.trackCurve.getTangentAt(t).normalize();
    const right = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

    const position = new THREE.Vector3()
      .copy(pt)
      .addScaledVector(right, lane);
    position.y = 0.35;

    const heading = Math.atan2(tangent.x, tangent.z);

    return { position, heading };
  }

  private buildCurbs(points: THREE.Vector3[], halfWidth: number): void {
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

      // Swiss Technical Accent Spec (#c45a72) / 화이트 (#ededed) 체커
      const isSpecAccent = Math.floor(i / 3) % 2 === 0;
      const r = isSpecAccent ? 0.77 : 0.93; // 0xc4 = 196
      const g = isSpecAccent ? 0.35 : 0.93; // 0x5a = 90
      const b = isSpecAccent ? 0.45 : 0.93; // 0x72 = 114

      // 외측/내측 연석 버텍스
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
    const curbMesh = new THREE.Mesh(curbGeom, curbMat);
    this.group.add(curbMesh);
  }

  private buildGround(): void {
    // 딥 매트 차콜 (Swiss Technical surface-canvas: #121316)
    const groundGeom = new THREE.PlaneGeometry(600, 600);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x121316,
      roughness: 0.95,
      metalness: 0.05,
    });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);

    // 테크니컬 그리드 라인 (#26282f 및 #3a3d47)
    const grid = new THREE.GridHelper(600, 60, 0x3a3d47, 0x1a1b20);
    grid.position.y = 0.01;
    this.group.add(grid);
  }

  private setupCheckpoints(): void {
    const cpConfigs = [
      { t: 0.0, id: 0, label: 'FINISH / START' },
      { t: 0.33, id: 1, label: 'SECTOR 1' },
      { t: 0.66, id: 2, label: 'SECTOR 2' },
    ];

    cpConfigs.forEach(cfg => {
      const pos = this.trackCurve.getPointAt(cfg.t);
      const tangent = this.trackCurve.getTangentAt(cfg.t);

      this.checkpoints.push({
        id: cfg.id,
        position: pos,
        direction: tangent,
        radius: this.trackWidth * 0.9,
        isPassed: false,
      });

      this.buildArchGate(pos, tangent, cfg.id === 0);
    });
  }

  private buildArchGate(pos: THREE.Vector3, tangent: THREE.Vector3, isFinish: boolean): void {
    const archGroup = new THREE.Group();
    archGroup.position.copy(pos);

    const right = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const halfW = this.trackWidth / 2 + 1.5;

    // 기둥 2개 (Swiss Technical Hairline Architecture, 0px radius box)
    const pillarGeom = new THREE.BoxGeometry(0.6, 6, 0.6);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x26282f, roughness: 0.6, metalness: 0.4 });

    const leftPillar = new THREE.Mesh(pillarGeom, pillarMat);
    leftPillar.position.copy(new THREE.Vector3().addScaledVector(right, -halfW));
    leftPillar.position.y = 3;

    const rightPillar = new THREE.Mesh(pillarGeom, pillarMat);
    rightPillar.position.copy(new THREE.Vector3().addScaledVector(right, halfW));
    rightPillar.position.y = 3;

    // 상단 빔: 피니시는 로즈(0xc45a72), 일반 섹터는 선명한 파스텔 하늘색(0x7dd3fc) 적용!
    const beamGeom = new THREE.BoxGeometry(this.trackWidth + 4, 0.8, 0.6);
    const beamColor = isFinish ? 0xc45a72 : 0x7dd3fc;
    const beamEmissive = isFinish ? 0xc45a72 : 0x38bdf8;

    const beamMat = new THREE.MeshStandardMaterial({
      color: beamColor,
      emissive: beamEmissive,
      emissiveIntensity: 0.95,
      roughness: 0.3,
    });
    const beam = new THREE.Mesh(beamGeom, beamMat);
    beam.position.y = 5.8;
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), right);

    archGroup.add(leftPillar);
    archGroup.add(rightPillar);
    archGroup.add(beam);

    this.group.add(archGroup);
  }

  /**
   * 차량 위치가 트랙 중심선으로부터 얼마나 벗어났는지 확인 (오프로드/잔디 감지)
   */
  public getDistanceFromCenter(pos: THREE.Vector3): number {
    let minDistSq = Infinity;
    const sampleCount = 60;

    for (let i = 0; i < sampleCount; i++) {
      const sample = this.trackCurve.getPointAt(i / sampleCount);
      const dSq = (sample.x - pos.x) ** 2 + (sample.z - pos.z) ** 2;
      if (dSq < minDistSq) minDistSq = dSq;
    }

    return Math.sqrt(minDistSq);
  }
}
