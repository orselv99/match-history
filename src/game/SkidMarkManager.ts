import * as THREE from 'three';
import { Vehicle } from './Vehicle.ts';

interface SkidPoint {
  leftPos: THREE.Vector3;
  rightPos: THREE.Vector3;
  active: boolean;
}

interface SmokeParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
}

/**
 * 실시간 드리프트 타이어 스키드마크 및 연기 파티클 매니저
 * - 차량 드리프트 및 급제동 시 바닥 노면에 검은 고무 타이어 자국(Skid Marks) 실시간 연속 생성
 * - 고성능 순환 버퍼(Ring Buffer) 지오메트리를 활용하여 60FPS 무한 주행 최적화
 * - 후륜 타이어 연기(Tire Smoke Puffs) 절차적 파티클 생성
 */
export class SkidMarkManager {
  public group: THREE.Group = new THREE.Group();

  // 스키드마크 쿼드 메시 (최대 세그먼트 800쌍 = 1600 쿼드 = 9600 버텍스)
  private readonly MAX_QUADS = 1600;
  private geometry: THREE.BufferGeometry;
  private positions: Float32Array;
  private colors: Float32Array;
  private indices: Uint32Array;
  private quadIndex: number = 0;
  private totalQuads: number = 0;
  private posAttr: THREE.BufferAttribute;
  private colAttr: THREE.BufferAttribute;

  // 차량별 이전 스키드 접지 좌표 상태
  private lastPoints: Map<Vehicle, SkidPoint> = new Map();

  // 드리프트 타이어 연기 파티클
  private smokeParticles: SmokeParticle[] = [];
  private smokePointsMesh!: THREE.Points;
  private smokeGeom!: THREE.BufferGeometry;
  private smokePosAttr!: THREE.BufferAttribute;
  private smokeColAttr!: THREE.BufferAttribute;
  private readonly MAX_SMOKE = 240;

  constructor() {
    // 1. 스키드마크 지오메트리 버퍼 초기화
    this.geometry = new THREE.BufferGeometry();
    const vertexCount = this.MAX_QUADS * 4;
    const indexCount = this.MAX_QUADS * 6;

    this.positions = new Float32Array(vertexCount * 3);
    this.colors = new Float32Array(vertexCount * 4); // RGBA
    this.indices = new Uint32Array(indexCount);

    for (let i = 0; i < this.MAX_QUADS; i++) {
      const vOffset = i * 4;
      const iOffset = i * 6;
      this.indices[iOffset] = vOffset;
      this.indices[iOffset + 1] = vOffset + 1;
      this.indices[iOffset + 2] = vOffset + 2;
      this.indices[iOffset + 3] = vOffset + 1;
      this.indices[iOffset + 4] = vOffset + 3;
      this.indices[iOffset + 5] = vOffset + 2;
    }

    this.posAttr = new THREE.BufferAttribute(this.positions, 3);
    this.colAttr = new THREE.BufferAttribute(this.colors, 4);
    this.geometry.setAttribute('position', this.posAttr);
    this.geometry.setAttribute('color', this.colAttr);
    this.geometry.setIndex(new THREE.BufferAttribute(this.indices, 1));

    const skidMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
    });

    const skidMesh = new THREE.Mesh(this.geometry, skidMat);
    this.group.add(skidMesh);

    // 2. 타이어 연기 파티클 시스템 초기화
    this.initSmokeParticles();
  }

  private initSmokeParticles(): void {
    this.smokeGeom = new THREE.BufferGeometry();
    const smokePositions = new Float32Array(this.MAX_SMOKE * 3);
    const smokeColors = new Float32Array(this.MAX_SMOKE * 4);

    this.smokePosAttr = new THREE.BufferAttribute(smokePositions, 3);
    this.smokeColAttr = new THREE.BufferAttribute(smokeColors, 4);

    this.smokeGeom.setAttribute('position', this.smokePosAttr);
    this.smokeGeom.setAttribute('color', this.smokeColAttr);

    // 연기 캔버스 텍스처 (소프트 라운드 알파 마스크)
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, 'rgba(255,255,255,0.85)');
      grad.addColorStop(0.5, 'rgba(230,230,235,0.4)');
      grad.addColorStop(1, 'rgba(200,200,210,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 32, 32);
    }
    const smokeTex = new THREE.CanvasTexture(canvas);

    const smokeMat = new THREE.PointsMaterial({
      size: 1.6,
      map: smokeTex,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      blending: THREE.NormalBlending,
    });

    this.smokePointsMesh = new THREE.Points(this.smokeGeom, smokeMat);
    this.group.add(this.smokePointsMesh);
  }

  /**
   * 프레임별 차량 상태에 따라 스키드마크 및 연기 생성
   */
  public update(delta: number, vehicles: Vehicle[]): void {
    const tireWidth = 0.28;
    const markElevation = 0.058; // 노면(0.05) 바로 위

    vehicles.forEach((vehicle) => {
      if (!vehicle.mesh.visible) return;

      const isDrifting = vehicle.isDrifting;
      const speed = Math.abs(vehicle.speed);
      const isHeavySlip = isDrifting && speed > 2.0;

      const wheels = vehicle.getRearWheelWorldPositions();
      const leftWheelPos = wheels.left;
      const rightWheelPos = wheels.right;
      // 3D 고저차 노면 바로 위(+0.012m)에 스키드마크가 밀착되도록 Y좌표 동기화
      leftWheelPos.y = vehicle.position.y + 0.012;
      rightWheelPos.y = vehicle.position.y + 0.012;

      let last = this.lastPoints.get(vehicle);
      if (!last) {
        last = { leftPos: new THREE.Vector3(), rightPos: new THREE.Vector3(), active: false };
        this.lastPoints.set(vehicle, last);
      }

      if (isHeavySlip) {
        if (last.active) {
          const distL = leftWheelPos.distanceTo(last.leftPos);
          if (distL > 0.2 && distL < 8.0) {
            // 좌/우 타이어 각각에 대해 스키드 쿼드 생성
            this.addSkidQuad(last.leftPos, leftWheelPos, tireWidth);
            this.addSkidQuad(last.rightPos, rightWheelPos, tireWidth);

            last.leftPos.copy(leftWheelPos);
            last.rightPos.copy(rightWheelPos);

            // 타이어 연기 방출
            this.emitSmoke(leftWheelPos, vehicle.heading);
            this.emitSmoke(rightWheelPos, vehicle.heading);
          }
        } else {
          last.leftPos.copy(leftWheelPos);
          last.rightPos.copy(rightWheelPos);
          last.active = true;
        }
      } else {
        last.active = false;
      }
    });

    // 연기 파티클 시뮬레이션
    this.updateSmoke(delta);
  }

  private addSkidQuad(
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    width: number
  ): void {
    const halfW = width * 0.5;
    // 진행 방향에 수직인 횡방향 벡터
    const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize();

    const v0 = new THREE.Vector3().copy(p1).addScaledVector(perp, -halfW);
    const v1 = new THREE.Vector3().copy(p1).addScaledVector(perp, halfW);
    const v2 = new THREE.Vector3().copy(p2).addScaledVector(perp, -halfW);
    const v3 = new THREE.Vector3().copy(p2).addScaledVector(perp, halfW);

    v0.y = p1.y;
    v1.y = p1.y;
    v2.y = p2.y;
    v3.y = p2.y;

    const baseV = this.quadIndex * 4;
    const pos = this.positions;
    const col = this.colors;

    // 버텍스 좌표 기록
    const verts = [v0, v1, v2, v3];
    for (let i = 0; i < 4; i++) {
      const idx = (baseV + i) * 3;
      pos[idx] = verts[i].x;
      pos[idx + 1] = verts[i].y;
      pos[idx + 2] = verts[i].z;

      // 짙은 고무 스키드 블랙 (#111115), Alpha 0.72
      const cIdx = (baseV + i) * 4;
      col[cIdx] = 0.07;
      col[cIdx + 1] = 0.07;
      col[cIdx + 2] = 0.08;
      col[cIdx + 3] = 0.72;
    }

    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;

    this.quadIndex = (this.quadIndex + 1) % this.MAX_QUADS;
    if (this.totalQuads < this.MAX_QUADS) {
      this.totalQuads++;
      this.geometry.setDrawRange(0, this.totalQuads * 6);
    }
  }

  private emitSmoke(pos: THREE.Vector3, heading: number): void {
    if (this.smokeParticles.length >= this.MAX_SMOKE) return;

    for (let i = 0; i < 2; i++) {
      const backX = -Math.sin(heading) * 0.4 + (Math.random() - 0.5) * 0.3;
      const backZ = -Math.cos(heading) * 0.4 + (Math.random() - 0.5) * 0.3;

      this.smokeParticles.push({
        pos: new THREE.Vector3(pos.x + (Math.random() - 0.5) * 0.2, pos.y + 0.1, pos.z + (Math.random() - 0.5) * 0.2),
        vel: new THREE.Vector3(backX * 1.5, 0.8 + Math.random() * 0.8, backZ * 1.5),
        life: 0,
        maxLife: 0.45 + Math.random() * 0.3,
        size: 1.0 + Math.random() * 0.8,
      });
    }
  }

  private updateSmoke(delta: number): void {
    const posArr = this.smokePosAttr.array as Float32Array;
    const colArr = this.smokeColAttr.array as Float32Array;

    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      const p = this.smokeParticles[i];
      p.life += delta;

      if (p.life >= p.maxLife) {
        this.smokeParticles.splice(i, 1);
        continue;
      }

      p.pos.addScaledVector(p.vel, delta);
      p.vel.y += 0.3 * delta; // 위로 서서히 피어오름
      p.vel.multiplyScalar(0.92); // 공기 저항 감속
    }

    const count = this.smokeParticles.length;
    for (let i = 0; i < this.MAX_SMOKE; i++) {
      const idx3 = i * 3;
      const idx4 = i * 4;

      if (i < count) {
        const p = this.smokeParticles[i];
        posArr[idx3] = p.pos.x;
        posArr[idx3 + 1] = p.pos.y;
        posArr[idx3 + 2] = p.pos.z;

        const alpha = Math.max(0, 0.45 * (1 - p.life / p.maxLife));
        colArr[idx4] = 0.9;
        colArr[idx4 + 1] = 0.9;
        colArr[idx4 + 2] = 0.92;
        colArr[idx4 + 3] = alpha;
      } else {
        posArr[idx3] = 0;
        posArr[idx3 + 1] = -100;
        posArr[idx3 + 2] = 0;
        colArr[idx4 + 3] = 0;
      }
    }

    this.smokePosAttr.needsUpdate = true;
    this.smokeColAttr.needsUpdate = true;
  }

  public reset(): void {
    this.lastPoints.clear();
    this.smokeParticles = [];
    this.quadIndex = 0;
    this.totalQuads = 0;
    this.geometry.setDrawRange(0, 0);

    for (let i = 0; i < this.positions.length; i++) {
      this.positions[i] = 0;
      this.colors[i] = 0;
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
  }
}
