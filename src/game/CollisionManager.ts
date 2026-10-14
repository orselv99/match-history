import * as THREE from 'three';
import { Vehicle } from './Vehicle.ts';

interface SparkParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

export interface CollisionEvent {
  vehicleA: Vehicle;
  vehicleB: Vehicle;
  contactPoint: THREE.Vector3;
  impactSpeed: number;
  isPlayerInvolved: boolean;
}

/**
 * 2D 듀얼 디스크 캡슐 기반 차량-차량 물리 충돌 및 스파크 이펙트 매니저
 * - 탄성 반발 충돌(Elastic Impulse & Restitution)로 차량 간 묵직하고 실감나는 밀림/충격 전달
 * - 충돌 지점 모멘텀 토크(Yaw Spin Wobble) 반영으로 리얼한 스핀/카운터스티어 유도
 * - 충돌 접점 절차적 주황빛 메탈 스파크(Collision Sparks) 폭발 생성
 * - 카메라 쉐이크(Camera Shake) 및 임팩트 사운드 트리거 콜백 제공
 */
export class CollisionManager {
  public group: THREE.Group = new THREE.Group();

  // 스파크 파티클 시스템
  private sparks: SparkParticle[] = [];
  private readonly MAX_SPARKS = 240;
  private sparkGeom: THREE.BufferGeometry;
  private sparkPosAttr: THREE.BufferAttribute;
  private sparkColAttr: THREE.BufferAttribute;
  private sparkPoints: THREE.Points;

  // 쿨다운 맵 (차량 쌍별 연타 사운드 방지)
  private collisionCooldowns: Map<string, number> = new Map();

  // 이벤트 리스너
  public onCollision?: (event: CollisionEvent) => void;

  constructor() {
    this.sparkGeom = new THREE.BufferGeometry();
    const positions = new Float32Array(this.MAX_SPARKS * 3);
    const colors = new Float32Array(this.MAX_SPARKS * 4);

    this.sparkPosAttr = new THREE.BufferAttribute(positions, 3);
    this.sparkColAttr = new THREE.BufferAttribute(colors, 4);
    this.sparkGeom.setAttribute('position', this.sparkPosAttr);
    this.sparkGeom.setAttribute('color', this.sparkColAttr);

    const sparkMat = new THREE.PointsMaterial({
      size: 0.65,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.sparkPoints = new THREE.Points(this.sparkGeom, sparkMat);
    this.group.add(this.sparkPoints);
  }

  /**
   * 모든 활성 차량 간 충돌 감지 및 물리적 반발력 해결
   */
  public update(delta: number, vehicles: Vehicle[], playerVehicle?: Vehicle): void {
    // 쿨다운 감쇠
    this.collisionCooldowns.forEach((time, key) => {
      const nextTime = time - delta;
      if (nextTime <= 0) {
        this.collisionCooldowns.delete(key);
      } else {
        this.collisionCooldowns.set(key, nextTime);
      }
    });

    const activeVehicles = vehicles.filter(v => v.mesh.visible);
    const n = activeVehicles.length;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        this.checkAndResolveCollision(activeVehicles[i], activeVehicles[j], playerVehicle);
      }
    }

    // 스파크 파티클 업데이트
    this.updateSparks(delta);
  }

  private checkAndResolveCollision(v1: Vehicle, v2: Vehicle, playerVehicle?: Vehicle): void {
    // 1차 거리 컬링 (차체 대각선 6.0m 이내일 때 정밀 검사)
    const distSq = v1.position.distanceToSquared(v2.position);
    if (distSq > 36.0) return;

    // 각 차량을 3개의 중첩 디스크(전방, 중앙 도어, 후방)로 근사
    // 디스크 반경: 1.05m, 오프셋 간격: 1.28m -> 전후/측면 도어 빈틈없이 100% 완전 포괄
    const diskRadius = 1.05;
    const diskOffsets = [1.28, 0.0, -1.28];

    const getDisks = (v: Vehicle) => {
      const heading = v.heading + v.slipAngle;
      const fwd = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
      return diskOffsets.map((offset, idx) => ({
        pos: new THREE.Vector3().copy(v.position).addScaledVector(fwd, offset),
        isFront: idx === 0,
        isRear: idx === 2,
      }));
    };

    const d1List = getDisks(v1);
    const d2List = getDisks(v2);

    let deepestCollision: {
      depth: number;
      normal: THREE.Vector3;
      contact: THREE.Vector3;
      aIsFront: boolean;
      bIsFront: boolean;
    } | null = null;

    const minD = diskRadius * 2.0; // 2.10m

    for (const d1 of d1List) {
      for (const d2 of d2List) {
        const diff = new THREE.Vector3().subVectors(d1.pos, d2.pos);
        diff.y = 0; // 평면 2D 거리
        const d = diff.length();

        if (d < minD) {
          const depth = minD - Math.max(d, 0.001);
          const normal = d > 0.001 ? diff.normalize() : new THREE.Vector3(0, 0, 1);
          if (!deepestCollision || depth > deepestCollision.depth) {
            deepestCollision = {
              depth,
              normal,
              contact: new THREE.Vector3().addVectors(d1.pos, d2.pos).multiplyScalar(0.5),
              aIsFront: d1.isFront,
              bIsFront: d2.isFront,
            };
          }
        }
      }
    }

    if (!deepestCollision) return;

    const { depth, normal, contact, aIsFront, bIsFront } = deepestCollision;

    // 1. 관통 분리(Position Separation Push) - 겹침 즉각적이고 확실한 해소
    const separation = normal.clone().multiplyScalar(Math.max(depth * 0.55, 0.04));
    v1.position.add(separation);
    v2.position.sub(separation);
    v1.mesh.position.copy(v1.position);
    v2.mesh.position.copy(v2.position);

    // 2. 속도 및 탄성 임펄스(Elastic Restitution Impulse)
    const heading1 = v1.heading + v1.slipAngle;
    const fwd1 = new THREE.Vector3(Math.sin(heading1), 0, Math.cos(heading1));
    const vel1 = fwd1.clone().multiplyScalar(v1.speed);

    const heading2 = v2.heading + v2.slipAngle;
    const fwd2 = new THREE.Vector3(Math.sin(heading2), 0, Math.cos(heading2));
    const vel2 = fwd2.clone().multiplyScalar(v2.speed);

    const relVel = new THREE.Vector3().subVectors(vel1, vel2);
    const velAlongNormal = relVel.dot(normal);

    // 차량 탄성 반발 계수 (탄성 충돌 0.65)
    const restitution = 0.65;
    const impactSpeed = Math.max(Math.abs(velAlongNormal), depth * 12.0, 4.0);

    // 서로 접근 중이거나, 깊게 침투된 겹침 상태인 경우 물리적 임펄스 및 토크 적용
    if (velAlongNormal < -0.05 || depth > 0.04) {
      const impulseMag = Math.max(
        -(1 + restitution) * velAlongNormal * 0.5,
        depth * 6.0
      );
      const impulse = normal.clone().multiplyScalar(impulseMag);

      // 속도 변화량 반영
      v1.speed += impulse.dot(fwd1) * 0.9;
      v2.speed -= impulse.dot(fwd2) * 0.9;

      // 3. 충돌 토크 모멘텀 (Yaw 회전각 튕김 및 스핀)
      const torqueStrength = Math.min(0.24, impactSpeed * 0.018);
      v1.heading += (aIsFront ? torqueStrength : -torqueStrength * 0.7);
      v2.heading -= (bIsFront ? torqueStrength : -torqueStrength * 0.7);
    }

    // 4. 충돌 이벤트 및 스파크 방출 (차량 고유 ID 기반 개별 쿨다운)
    const idA = Math.min(v1.id, v2.id);
    const idB = Math.max(v1.id, v2.id);
    const pairKey = `${idA}_${idB}`;
    const isCooldown = this.collisionCooldowns.has(pairKey);

    if (!isCooldown) {
      this.collisionCooldowns.set(pairKey, 0.10); // 100ms 쿨다운
      this.emitSparks(contact, impactSpeed);

      const isPlayerInvolved = v1 === playerVehicle || v2 === playerVehicle;
      if (this.onCollision) {
        this.onCollision({
          vehicleA: v1,
          vehicleB: v2,
          contactPoint: contact,
          impactSpeed: Math.max(8.0, impactSpeed),
          isPlayerInvolved,
        });
      }
    }
  }

  private emitSparks(contact: THREE.Vector3, impactSpeed: number): void {
    const sparkCount = Math.min(24, Math.floor(10 + impactSpeed * 0.8));
    for (let i = 0; i < sparkCount; i++) {
      if (this.sparks.length >= this.MAX_SPARKS) break;

      const angle = Math.random() * Math.PI * 2;
      const speed = 4.0 + Math.random() * 9.0;
      const upward = 1.5 + Math.random() * 4.5;

      this.sparks.push({
        pos: new THREE.Vector3(
          contact.x + (Math.random() - 0.5) * 0.3,
          contact.y + 0.3 + (Math.random() - 0.5) * 0.2,
          contact.z + (Math.random() - 0.5) * 0.3
        ),
        vel: new THREE.Vector3(
          Math.cos(angle) * speed,
          upward,
          Math.sin(angle) * speed
        ),
        life: 0,
        maxLife: 0.25 + Math.random() * 0.2,
      });
    }
  }

  private updateSparks(delta: number): void {
    const posArr = this.sparkPosAttr.array as Float32Array;
    const colArr = this.sparkColAttr.array as Float32Array;

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life += delta;

      if (s.life >= s.maxLife) {
        this.sparks.splice(i, 1);
        continue;
      }

      s.pos.addScaledVector(s.vel, delta);
      s.vel.y -= 15.0 * delta; // 중력
      s.vel.multiplyScalar(0.94); // 공기 저항
    }

    const count = this.sparks.length;
    for (let i = 0; i < this.MAX_SPARKS; i++) {
      const idx3 = i * 3;
      const idx4 = i * 4;

      if (i < count) {
        const s = this.sparks[i];
        posArr[idx3] = s.pos.x;
        posArr[idx3 + 1] = s.pos.y;
        posArr[idx3 + 2] = s.pos.z;

        const ratio = 1 - (s.life / s.maxLife);
        // 밝은 네온 오렌지~골드 스파크 (#ff9900 -> #ff4400)
        colArr[idx4] = 1.0;
        colArr[idx4 + 1] = 0.55 * ratio + 0.3;
        colArr[idx4 + 2] = 0.1 * ratio;
        colArr[idx4 + 3] = ratio;
      } else {
        posArr[idx3] = 0;
        posArr[idx3 + 1] = -100;
        posArr[idx3 + 2] = 0;
        colArr[idx4 + 3] = 0;
      }
    }

    this.sparkPosAttr.needsUpdate = true;
    this.sparkColAttr.needsUpdate = true;
  }

  public reset(): void {
    this.sparks = [];
    this.collisionCooldowns.clear();
    const posArr = this.sparkPosAttr.array as Float32Array;
    for (let i = 0; i < posArr.length; i++) {
      posArr[i] = 0;
    }
    this.sparkPosAttr.needsUpdate = true;
  }
}
