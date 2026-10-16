import * as THREE from 'three';
import { CIRCUIT_DEFINITIONS, type CircuitId, type CircuitMetadata } from '../data/circuits.ts';
import { CircuitDecorations } from './CircuitDecorations.ts';

export interface CheckpointTrigger {
  id: number;
  position: THREE.Vector3;
  direction: THREE.Vector3;
  radius: number;
  isPassed: boolean;
}

export interface CircuitSurfaceInfo {
  distFromCenter: number;
  groundY: number;
  slopeSin: number;
  roadPitch: number;
}

/**
 * Three.js 폐루프 서킷 (Circuit)
 * - 3D 고저차(Elevation) 아스팔트 노면 + 양측 적백 연석(Curbs) + 성토 옹벽 + 3개 섹터 체크포인트
 * - CatmullRomCurve3 기반의 3D 중심선 궤적 및 실시간 노면 고도/경사도(Pitch) 샘플링
 */
export class Circuit {
  public group: THREE.Group = new THREE.Group();
  public circuitCurve!: THREE.CatmullRomCurve3;
  public circuitWidth: number = 14; // 도로 폭
  public checkpoints: CheckpointTrigger[] = [];
  public circuitPoints2D: { x: number; z: number }[] = [];
  public currentCircuitId: CircuitId = 'circuit_monaco';

  private samplePoints: THREE.Vector3[] = [];
  private sampleTangents: THREE.Vector3[] = [];
  private readonly SAMPLE_COUNT = 240;

  constructor(circuitId: CircuitId = 'circuit_monaco') {
    this.loadCircuit(circuitId);
  }

  /**
   * 지정된 서킷 ID로 서킷 지오메트리, 연석, 마킹 및 체크포인트를 실시간으로 완전 재구축
   */
  public loadCircuit(circuitId: CircuitId): CircuitMetadata {
    this.currentCircuitId = circuitId;
    const def = CIRCUIT_DEFINITIONS[circuitId] || CIRCUIT_DEFINITIONS['circuit_monaco'];

    // 1. 기존 그룹 내 모든 하위 3D 객체 및 지오메트리 해제
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
      child.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry?.dispose();
        }
      });
    }

    // 2. 새 서킷 파라미터 적용
    this.checkpoints = [];
    this.circuitWidth = def.circuitWidth;
    this.circuitCurve = new THREE.CatmullRomCurve3(def.controlPoints, true, 'centripetal');

    // 3. 미니맵용 2D 샘플 점 및 물리 고도/경사 조회용 3D 샘플 캐싱
    const miniPoints = this.circuitCurve.getPoints(200);
    this.circuitPoints2D = miniPoints.map(p => ({ x: p.x, z: p.z }));

    this.samplePoints = [];
    this.sampleTangents = [];
    for (let i = 0; i < this.SAMPLE_COUNT; i++) {
      const t = i / this.SAMPLE_COUNT;
      this.samplePoints.push(this.circuitCurve.getPointAt(t));
      this.sampleTangents.push(this.circuitCurve.getTangentAt(t).normalize());
    }

    // 4. 지오메트리 및 환경 재빌드
    this.buildCircuitMesh(def.bridgeSpan);
    this.group.add(CircuitDecorations.buildGround());
    this.group.add(CircuitDecorations.buildCircuitStructures(this.circuitCurve, this.circuitWidth));
    this.setupCheckpoints();

    return def;
  }

  public roadMaterial: THREE.MeshStandardMaterial = new THREE.MeshStandardMaterial({
    color: 0x2e323b,
    roughness: 0.68,
    metalness: 0.16,
  });

  private buildCircuitMesh(bridgeSpan?: [number, number]): void {
    const segments = 300;
    const rawPoints = this.circuitCurve.getSpacedPoints(segments);
    const roadPoints = rawPoints.slice(0, segments);

    // 아스팔트 리본 메시 지오메트리 생성
    const roadGeom = new THREE.BufferGeometry();
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const halfWidth = this.circuitWidth / 2;

    for (let i = 0; i <= segments; i++) {
      const idx = i % segments;
      const prevIdx = (idx - 1 + segments) % segments;
      const nextIdx = (idx + 1) % segments;
      const pt = roadPoints[idx];
      const prevPt = roadPoints[prevIdx];
      const nextPt = roadPoints[nextIdx];

      // 접선 벡터(Forward) 및 수평 법선 벡터(Right) - 중앙 차분으로 완벽한 곡률 연속성 확보
      const forward = new THREE.Vector3().subVectors(nextPt, prevPt).normalize();
      const right = new THREE.Vector3(-forward.z, 0, forward.x).normalize();

      const leftPos = new THREE.Vector3().copy(pt).addScaledVector(right, -halfWidth);
      const rightPos = new THREE.Vector3().copy(pt).addScaledVector(right, halfWidth);

      // 3D 고도(pt.y) 반영 + 0.05m 오프셋으로 평지 지면과 z-fighting 방지
      positions.push(leftPos.x, pt.y + 0.05, leftPos.z);
      positions.push(rightPos.x, pt.y + 0.05, rightPos.z);

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

    const roadMesh = new THREE.Mesh(roadGeom, this.roadMaterial);
    roadMesh.receiveShadow = true;
    this.group.add(roadMesh);

    // 연석(Curbs), 성토 옹벽, 입체 고가 다리(Overpass Bridge) 및 서킷 도로 마킹 추가
    this.group.add(CircuitDecorations.buildCurbs(roadPoints, halfWidth, bridgeSpan));
    this.buildRoadMarkings(roadPoints, halfWidth);
  }

  private buildRoadMarkings(points: THREE.Vector3[], halfWidth: number): void {
    const segments = points.length;
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

    // 1. 좌측 외곽선 (Left Edge: -halfWidth 부근)
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

        const fwd = new THREE.Vector3().subVectors(next, prev).normalize();
        const rgt = new THREE.Vector3(-fwd.z, 0, fwd.x).normalize();

        const outerDist = -halfWidth + 0.15;
        const innerDist = outerDist + lineWidth;

        const pOuter = new THREE.Vector3().copy(curr).addScaledVector(rgt, outerDist);
        const pInner = new THREE.Vector3().copy(curr).addScaledVector(rgt, innerDist);

        pos.push(pOuter.x, curr.y + 0.085, pOuter.z);
        pos.push(pInner.x, curr.y + 0.085, pInner.z);

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

    // 2. 우측 외곽선 (Right Edge: +halfWidth 부근)
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

        pos.push(pInner.x, curr.y + 0.085, pInner.z);
        pos.push(pOuter.x, curr.y + 0.085, pOuter.z);

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

    // 3. 중앙 대시선 (Center Dashed Line - 출발선 및 그리드 구간 제외)
    const centerGeom = new THREE.BufferGeometry();
    const cPos: number[] = [];
    const cIdx: number[] = [];
    let cVertexIdx = 0;

    for (let i = 0; i < segments; i++) {
      const progress = i / segments;
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

        cPos.push(
          p1.x, curr.y + 0.085, p1.z,
          p2.x, curr.y + 0.085, p2.z,
          p3.x, next.y + 0.085, p3.z,
          p4.x, next.y + 0.085, p4.z
        );
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
    this.group.add(CircuitDecorations.buildStartingGrids(this.circuitCurve, this.circuitWidth));
  }

  /**
   * 스타팅 그리드 슬롯 인덱스(0: Pole, 1, 2, 3)의 위치 및 헤딩각 반환
   */
  public getGridPosition(slotIndex: number): { position: THREE.Vector3; heading: number } {
    const slotDistances = [-5.0, -12.0, -19.0, -26.0];
    const slotLanes = [-2.2, 2.2, -2.2, 2.2];

    const distZ = slotDistances[Math.min(3, Math.max(0, slotIndex))] ?? -5.0;
    const laneX = slotLanes[Math.min(3, Math.max(0, slotIndex))] ?? -2.2;

    return this.getStartStraightWorldPosition(laneX, distZ);
  }

  /**
   * 스타트/피니시 라인 기준 로컬 좌표계 (localX: 횡방향, localZ: 종방향)를 3D 월드 좌표로 정확히 변환
   */
  public getStartStraightWorldPosition(localX: number, localZ: number): { position: THREE.Vector3; heading: number } {
    const startPt = this.circuitCurve.getPointAt(0);
    const tangent = this.circuitCurve.getTangentAt(0).normalize();
    const localXDir = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    const heading = Math.atan2(tangent.x, tangent.z);

    const position = new THREE.Vector3()
      .copy(startPt)
      .addScaledVector(tangent, localZ)
      .addScaledVector(localXDir, localX);
    position.y = Math.max(0, startPt.y) + 0.055;

    return { position, heading };
  }

  private setupCheckpoints(): void {
    const cpConfigs = [
      { t: 0.0, id: 0, label: 'FINISH / START' },
      { t: 0.33, id: 1, label: 'SECTOR 1' },
      { t: 0.66, id: 2, label: 'SECTOR 2' },
    ];

    cpConfigs.forEach(cfg => {
      const pos = this.circuitCurve.getPointAt(cfg.t);
      const tangent = this.circuitCurve.getTangentAt(cfg.t);

      this.checkpoints.push({
        id: cfg.id,
        position: pos,
        direction: tangent,
        radius: this.circuitWidth * 0.9,
        isPassed: false,
      });

      if (cfg.id !== 0) {
        this.group.add(CircuitDecorations.buildArchGate(pos, tangent, false, this.circuitWidth));
      }
    });
  }

  /**
   * 임의의 차량 3D 위치 및 진행 방향(heading)에 대한 서킷 중심선 거리, 노면 고도(groundY), 경사도(slopeSin, roadPitch) 반환
   */
  public getCircuitSurfaceInfo(pos: THREE.Vector3, heading: number = 0): CircuitSurfaceInfo {
    const n = this.samplePoints.length;
    if (n === 0) {
      return { distFromCenter: 0, groundY: 0.055, slopeSin: 0, roadPitch: 0 };
    }

    let bestIdx = 0;
    let minScore = Infinity;

    for (let i = 0; i < n; i++) {
      const p = this.samplePoints[i];
      // 상/하부 입체 교차로(Overpass Bridge)에서 상부 교량 차량과 하부 도로 차량이 서로의 고도로 스냅되지 않도록 Y 고도 가중치 결합
      const score = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2 + (p.y - pos.y) ** 2 * 6.0;
      if (score < minScore) {
        minScore = score;
        bestIdx = i;
      }
    }

    // 인접 세그먼트 투영 보간으로 매끄러운 연속 고도 및 접선 산출
    const nextIdx = (bestIdx + 1) % n;
    const prevIdx = (bestIdx - 1 + n) % n;
    const pCurr = this.samplePoints[bestIdx];
    const pNext = this.samplePoints[nextIdx];
    const pPrev = this.samplePoints[prevIdx];

    // 전방 세그먼트 vs 후방 세그먼트 중 더 가까운 투영 선택
    const segNext = this.projectOnSegmentXZ(pos.x, pos.z, pCurr, pNext);
    const segPrev = this.projectOnSegmentXZ(pos.x, pos.z, pPrev, pCurr);

    let segStartIndex = bestIdx;
    let segEndIndex = nextIdx;
    let alpha = segNext.alpha;
    let closestY = segNext.y;
    let distSq = segNext.distSq;

    if (segPrev.distSq < segNext.distSq) {
      segStartIndex = prevIdx;
      segEndIndex = bestIdx;
      alpha = segPrev.alpha;
      closestY = segPrev.y;
      distSq = segPrev.distSq;
    }

    const distFromCenter = Math.sqrt(distSq);
    const halfWidth = this.circuitWidth * 0.5;

    // 서킷 3D 접선 보간
    const tStart = this.sampleTangents[segStartIndex];
    const tEnd = this.sampleTangents[segEndIndex];
    const tx = tStart.x + (tEnd.x - tStart.x) * alpha;
    const ty = tStart.y + (tEnd.y - tStart.y) * alpha;
    const tz = tStart.z + (tEnd.z - tStart.z) * alpha;
    const tLen = Math.hypot(tx, ty, tz) || 1;
    const normTx = tx / tLen;
    const normTy = ty / tLen;
    const normTz = tz / tLen;

    // 서킷 연석 바깥(오프로드 성토 사면)으로 벗어날 경우 지면(0m)으로 부드럽게 고도 감쇠
    const roadEdge = halfWidth + 1.3;
    const offroadBlend = THREE.MathUtils.clamp((distFromCenter - roadEdge) / 2.2, 0, 1);

    const onCircuitY = Math.max(0, closestY) + 0.055;
    const groundY = THREE.MathUtils.lerp(onCircuitY, 0.02, offroadBlend);

    // 차량 진행 방향과 서킷 수평 접선의 정렬도에 따른 실제 체감 경사(sin θ) 계산
    const horizLen = Math.hypot(normTx, normTz) || 1;
    const fwdX = Math.sin(heading);
    const fwdZ = Math.cos(heading);
    const cosAlign = (fwdX * normTx + fwdZ * normTz) / horizLen;

    const slopeSin = normTy * cosAlign * (1 - offroadBlend);
    // Three.js 로컬 +Z 전면 기준 오르막(slopeSin > 0)일 때 rotation.x < 0 이 되어야 노즈가 들림
    const roadPitch = -Math.asin(THREE.MathUtils.clamp(slopeSin, -0.45, 0.45));

    return {
      distFromCenter,
      groundY,
      slopeSin,
      roadPitch,
    };
  }

  private projectOnSegmentXZ(
    px: number,
    pz: number,
    a: THREE.Vector3,
    b: THREE.Vector3
  ): { alpha: number; x: number; y: number; z: number; distSq: number } {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lenSq = dx * dx + dz * dz;
    const alpha = lenSq > 1e-6
      ? THREE.MathUtils.clamp(((px - a.x) * dx + (pz - a.z) * dz) / lenSq, 0, 1)
      : 0;
    const x = a.x + dx * alpha;
    const y = a.y + (b.y - a.y) * alpha;
    const z = a.z + dz * alpha;
    const distSq = (px - x) ** 2 + (pz - z) ** 2;
    return { alpha, x, y, z, distSq };
  }

  /**
   * 차량 위치가 서킷 중심선으로부터 얼마나 벗어났는지 확인 (오프로드/잔디 감지)
   */
  public getDistanceFromCenter(pos: THREE.Vector3): number {
    return this.getCircuitSurfaceInfo(pos, 0).distFromCenter;
  }

  /**
   * 특정 3D 좌표에서 가장 가까운 서킷 곡선 진행도 (t: 0.0 ~ 1.0) 반환
   */
  public getClosestT(pos: THREE.Vector3): number {
    const n = this.samplePoints.length;
    if (n === 0) return 0;
    let bestIdx = 0;
    let minScore = Infinity;
    for (let i = 0; i < n; i++) {
      const p = this.samplePoints[i];
      const score = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2 + (p.y - pos.y) ** 2 * 6.0;
      if (score < minScore) {
        minScore = score;
        bestIdx = i;
      }
    }
    return bestIdx / n;
  }

  /**
   * 오프로드 이탈 시 가장 가까운 서킷 아스팔트 중심선 좌표 및 주행 방향(heading) 산출
   */
  public getNearestTrackPoint(pos: THREE.Vector3): { position: THREE.Vector3; heading: number } {
    const t = this.getClosestT(pos);
    const pt = this.circuitCurve.getPointAt(t);
    const tangent = this.circuitCurve.getTangentAt(t).normalize();
    const heading = Math.atan2(tangent.x, tangent.z);
    return {
      position: new THREE.Vector3(pt.x, Math.max(0, pt.y) + 0.055, pt.z),
      heading,
    };
  }
}
