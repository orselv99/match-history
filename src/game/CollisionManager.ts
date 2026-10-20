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
    // 입체 교차로(다리 상판 vs 하부 도로)에서 고도 차이가 큰 차량끼리는 충돌 판정 제외
    if (Math.abs(v1.position.y - v2.position.y) > 2.2) return;

    // 1차 거리 컬링 (차체 대각선 6.2m 이내일 때 정밀 검사)
    const distSq = v1.position.distanceToSquared(v2.position);
    if (distSq > 38.44) return;

    // 2D OBB (Oriented Bounding Box) SAT: 바퀴와 펜더를 포함한 전 차체 직사각형 정밀 충돌 판정
    // 전폭: 2.20m (halfW = 1.10m), 전장: 4.60m (halfL = 2.30m)
    const h1 = v1.heading + v1.slipAngle;
    const fwd1 = new THREE.Vector3(Math.sin(h1), 0, Math.cos(h1));
    const right1 = new THREE.Vector3(-Math.cos(h1), 0, Math.sin(h1));

    const h2 = v2.heading + v2.slipAngle;
    const fwd2 = new THREE.Vector3(Math.sin(h2), 0, Math.cos(h2));
    const right2 = new THREE.Vector3(-Math.cos(h2), 0, Math.sin(h2));

    const halfW1 = 1.10, halfL1 = 2.30;
    const halfW2 = 1.10, halfL2 = 2.30;

    const D = new THREE.Vector3().subVectors(v2.position, v1.position);
    D.y = 0;

    const axes = [right1, fwd1, right2, fwd2];
    let minOverlap = Infinity;
    let bestAxis = axes[0];
    let bestSign = 1;

    for (let i = 0; i < 4; i++) {
      const axis = axes[i];
      const projD = D.dot(axis);
      const absProjD = Math.abs(projD);

      const r1 = halfW1 * Math.abs(right1.dot(axis)) + halfL1 * Math.abs(fwd1.dot(axis));
      const r2 = halfW2 * Math.abs(right2.dot(axis)) + halfL2 * Math.abs(fwd2.dot(axis));

      const overlap = (r1 + r2) - absProjD;
      if (overlap <= 0) {
        return; // 분리축(Separating Axis) 존재: 충돌하지 않음
      }

      if (overlap < minOverlap) {
        minOverlap = overlap;
        bestAxis = axis;
        bestSign = projD < 0 ? 1 : -1;
      }
    }

    // 최소 침투 깊이 및 v2 -> v1 방향 분리 노멀
    const depth = minOverlap;
    const normal = bestAxis.clone().multiplyScalar(bestSign).normalize();

    // 8개 모서리(전륜/후륜 바퀴 및 범퍼 끝단) 중 가장 깊게 침투된 접점 위치 탐색
    const corners1 = [
      new THREE.Vector3().copy(v1.position).addScaledVector(fwd1, halfL1).addScaledVector(right1, halfW1),
      new THREE.Vector3().copy(v1.position).addScaledVector(fwd1, halfL1).addScaledVector(right1, -halfW1),
      new THREE.Vector3().copy(v1.position).addScaledVector(fwd1, -halfL1).addScaledVector(right1, halfW1),
      new THREE.Vector3().copy(v1.position).addScaledVector(fwd1, -halfL1).addScaledVector(right1, -halfW1),
    ];
    const corners2 = [
      new THREE.Vector3().copy(v2.position).addScaledVector(fwd2, halfL2).addScaledVector(right2, halfW2),
      new THREE.Vector3().copy(v2.position).addScaledVector(fwd2, halfL2).addScaledVector(right2, -halfW2),
      new THREE.Vector3().copy(v2.position).addScaledVector(fwd2, -halfL2).addScaledVector(right2, halfW2),
      new THREE.Vector3().copy(v2.position).addScaledVector(fwd2, -halfL2).addScaledVector(right2, -halfW2),
    ];

    let deepestCorner = corners2[0];
    let maxCornerPen = -Infinity;

    for (const c of corners2) {
      const local = new THREE.Vector3().subVectors(c, v1.position);
      const dRight = halfW1 - Math.abs(local.dot(right1));
      const dFwd = halfL1 - Math.abs(local.dot(fwd1));
      if (dRight > 0 && dFwd > 0) {
        const pen = Math.min(dRight, dFwd);
        if (pen > maxCornerPen) {
          maxCornerPen = pen;
          deepestCorner = c;
        }
      }
    }

    for (const c of corners1) {
      const local = new THREE.Vector3().subVectors(c, v2.position);
      const dRight = halfW2 - Math.abs(local.dot(right2));
      const dFwd = halfL2 - Math.abs(local.dot(fwd2));
      if (dRight > 0 && dFwd > 0) {
        const pen = Math.min(dRight, dFwd);
        if (pen > maxCornerPen) {
          maxCornerPen = pen;
          deepestCorner = c;
        }
      }
    }

    const contact = deepestCorner.clone();
    contact.y = (v1.position.y + v2.position.y) * 0.5 + 0.3; // 3D 노면 고도 기반 바퀴/허브 높이

    const aIsFront = new THREE.Vector3().subVectors(contact, v1.position).dot(fwd1) > 0;
    const bIsFront = new THREE.Vector3().subVectors(contact, v2.position).dot(fwd2) > 0;

    // 1. 관통 분리(Position Separation Push) - 바퀴 및 차체 겹침 완벽 차단
    const separation = normal.clone().multiplyScalar(Math.max(depth * 0.58, 0.05));
    v1.position.add(separation);
    v2.position.sub(separation);
    v1.mesh.position.copy(v1.position);
    v2.mesh.position.copy(v2.position);

    // 2. 속도 및 탄성 임펄스(Elastic Restitution Impulse)
    const vel1 = fwd1.clone().multiplyScalar(v1.speed);
    const vel2 = fwd2.clone().multiplyScalar(v2.speed);

    const relVel = new THREE.Vector3().subVectors(vel1, vel2);
    const velAlongNormal = relVel.dot(normal);

    // 차량 탄성 반발 계수 (0.68)
    const restitution = 0.68;
    const impactSpeed = Math.max(Math.abs(velAlongNormal), depth * 14.0, 4.0);

    // 서로 접근 중이거나, 겹침 상태인 경우 물리적 임펄스 및 토크 적용
    if (velAlongNormal < -0.05 || depth > 0.02) {
      const impulseMag = Math.max(
        -(1 + restitution) * velAlongNormal * 0.5,
        depth * 7.5
      );
      const impulse = normal.clone().multiplyScalar(impulseMag);

      // 속도 변화량 반영
      v1.speed += impulse.dot(fwd1) * 0.92;
      v2.speed -= impulse.dot(fwd2) * 0.92;

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

  /**
   * 급경사 바닥 압축(Eau Rouge 등)이나 언덕 점프 착지 시 하부 디퓨저 마찰 스파크 방출
   */
  public emitBottomingSparks(vehicle: Vehicle, shockIntensity: number): void {
    const count = Math.min(18, Math.floor(6 + shockIntensity * 14));
    const backX = -Math.sin(vehicle.heading);
    const backZ = -Math.cos(vehicle.heading);

    for (let i = 0; i < count; i++) {
      if (this.sparks.length >= this.MAX_SPARKS) break;
      const spread = (Math.random() - 0.5) * 1.4;
      const spd = 5.0 + Math.random() * 8.0;
      this.sparks.push({
        pos: new THREE.Vector3(
          vehicle.position.x + backX * 1.6 + spread * 0.5,
          vehicle.position.y + 0.08,
          vehicle.position.z + backZ * 1.6 + spread * 0.5
        ),
        vel: new THREE.Vector3(
          backX * spd + spread * 2.5,
          1.2 + Math.random() * 2.8,
          backZ * spd + spread * 2.5
        ),
        life: 0,
        maxLife: 0.22 + Math.random() * 0.18,
      });
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

  public updateSparks(delta: number): void {
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


  /**
   * 3D 리플레이 전용 충돌 감지 및 불꽃(스파크) 파티클 갱신
   * - 틱 데이터로 복원된 차량 위치를 보존하면서 접촉 시 화려한 메탈 스파크 및 충돌 사운드 연출
   */
  public updateReplay(delta: number, vehicles: Vehicle[], playerVehicle?: Vehicle): void {
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
        const v1 = activeVehicles[i];
        const v2 = activeVehicles[j];

        if (Math.abs(v1.position.y - v2.position.y) > 2.2) continue;

        const distSq = v1.position.distanceToSquared(v2.position);
        if (distSq > 38.44) continue;

        // 3D 리플레이 차체 겹침/관통 방지 2D OBB SAT 정밀 물리 판정
        const h1 = v1.heading + (v1.slipAngle || 0);
        const fwd1 = new THREE.Vector3(Math.sin(h1), 0, Math.cos(h1));
        const right1 = new THREE.Vector3(-Math.cos(h1), 0, Math.sin(h1));

        const h2 = v2.heading + (v2.slipAngle || 0);
        const fwd2 = new THREE.Vector3(Math.sin(h2), 0, Math.cos(h2));
        const right2 = new THREE.Vector3(-Math.cos(h2), 0, Math.sin(h2));

        const halfW1 = 1.10, halfL1 = 2.30;
        const halfW2 = 1.10, halfL2 = 2.30;

        const D = new THREE.Vector3().subVectors(v2.position, v1.position);
        D.y = 0;

        const axes = [right1, fwd1, right2, fwd2];
        let minOverlap = Infinity;
        let bestAxis = axes[0];
        let bestSign = 1;
        let collided = true;

        for (let k = 0; k < 4; k++) {
          const axis = axes[k];
          const projD = D.dot(axis);
          const absProjD = Math.abs(projD);

          const r1 = halfW1 * Math.abs(right1.dot(axis)) + halfL1 * Math.abs(fwd1.dot(axis));
          const r2 = halfW2 * Math.abs(right2.dot(axis)) + halfL2 * Math.abs(fwd2.dot(axis));

          const overlap = (r1 + r2) - absProjD;
          if (overlap <= 0) {
            collided = false;
            break;
          }

          if (overlap < minOverlap) {
            minOverlap = overlap;
            bestAxis = axis;
            bestSign = projD < 0 ? 1 : -1;
          }
        }

        if (collided && minOverlap > 0) {
          const depth = minOverlap;
          const normal = bestAxis.clone().multiplyScalar(bestSign).normalize();

          // 리플레이 중 머신끼리 파고드는 관통 현상(Penetration) 즉각 해소 및 외곽 접촉 유지
          const separation = normal.clone().multiplyScalar(Math.max(depth * 0.54, 0.05));
          v1.position.add(separation);
          v2.position.sub(separation);
          v1.mesh.position.copy(v1.position);
          v2.mesh.position.copy(v2.position);

          const pairKey = v1.id < v2.id ? `${v1.id}_${v2.id}` : `${v2.id}_${v1.id}`;
          const cd = this.collisionCooldowns.get(pairKey) || 0;

          if (cd <= 0) {
            this.collisionCooldowns.set(pairKey, 0.25);
            const contact = new THREE.Vector3().addVectors(v1.position, v2.position).multiplyScalar(0.5);
            contact.y = Math.max(v1.position.y, v2.position.y) + 0.35;

            const impactSpeed = Math.max(8.0, Math.abs(v1.speed - v2.speed) * 3.6);
            this.emitSparks(contact, impactSpeed);

            if (this.onCollision) {
              this.onCollision({
                vehicleA: v1,
                vehicleB: v2,
                contactPoint: contact,
                impactSpeed,
                isPlayerInvolved: (v1 === playerVehicle || v2 === playerVehicle),
              });
            }
          }
        }
      }
    }

    this.updateSparks(delta);
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
