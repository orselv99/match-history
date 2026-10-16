import * as THREE from 'three';
import type { WeatherType } from './EnvironmentPresets.ts';

/**
 * 3D 기상 파티클 시스템 (빗줄기, 안개 스트릭, 강설 블리자드 시뮬레이션)
 */
export class WeatherParticles {
  private scene: THREE.Scene;

  // 비 날씨 파티클 시스템 (3D 빗줄기 LineSegments)
  private rainParticles: THREE.LineSegments;
  private rainGeom: THREE.BufferGeometry;
  private rainPositions: Float32Array;
  private isRaining: boolean = false;
  private readonly RAIN_COUNT = 2200;

  // 안개/바람 날씨 파티클 시스템 (측풍 가속 스트릭 & 짙은 미스트 wisps)
  private fogParticles: THREE.LineSegments;
  private fogGeom: THREE.BufferGeometry;
  private fogPositions: Float32Array;
  private isFoggy: boolean = false;
  private readonly FOG_PARTICLE_COUNT = 1200;

  // 강설 날씨 파티클 시스템 (3D 눈송이 Points 블리자드 시뮬레이션)
  private snowParticles: THREE.Points;
  private snowGeom: THREE.BufferGeometry;
  private snowPositions: Float32Array;
  private isSnowing: boolean = false;
  private snowTimer: number = 0;
  private readonly SNOW_COUNT = 1500;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // 1. 비 시스템 초기화
    this.rainGeom = new THREE.BufferGeometry();
    this.rainPositions = new Float32Array(this.RAIN_COUNT * 6);
    for (let i = 0; i < this.RAIN_COUNT; i++) {
      const idx = i * 6;
      const x = (Math.random() - 0.5) * 80;
      const y = Math.random() * 32;
      const z = (Math.random() - 0.5) * 80;
      const len = 1.0 + Math.random() * 0.8;

      this.rainPositions[idx] = x;
      this.rainPositions[idx + 1] = y;
      this.rainPositions[idx + 2] = z;
      this.rainPositions[idx + 3] = x - 0.12;
      this.rainPositions[idx + 4] = y - len;
      this.rainPositions[idx + 5] = z;
    }
    this.rainGeom.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));
    const rainMat = new THREE.LineBasicMaterial({
      color: 0xc7d2fe,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.rainParticles = new THREE.LineSegments(this.rainGeom, rainMat);
    this.rainParticles.frustumCulled = false;
    this.rainParticles.visible = false;
    this.scene.add(this.rainParticles);

    // 2. 안개 시스템 초기화
    this.fogGeom = new THREE.BufferGeometry();
    this.fogPositions = new Float32Array(this.FOG_PARTICLE_COUNT * 6);
    for (let i = 0; i < this.FOG_PARTICLE_COUNT; i++) {
      const idx = i * 6;
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * 50;
      const x = Math.cos(angle) * r;
      const y = 0.3 + Math.random() * 14;
      const z = Math.sin(angle) * r;
      const len = 3.5;

      this.fogPositions[idx] = x;
      this.fogPositions[idx + 1] = y;
      this.fogPositions[idx + 2] = z;
      this.fogPositions[idx + 3] = x;
      this.fogPositions[idx + 4] = y;
      this.fogPositions[idx + 5] = z - len;
    }
    this.fogGeom.setAttribute('position', new THREE.BufferAttribute(this.fogPositions, 3));
    const fogMat = new THREE.LineBasicMaterial({
      color: 0xdbeafe,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.fogParticles = new THREE.LineSegments(this.fogGeom, fogMat);
    this.fogParticles.frustumCulled = false;
    this.fogParticles.visible = false;
    this.scene.add(this.fogParticles);

    // 3. 강설 시스템 초기화 (3D 눈송이 Points)
    this.snowGeom = new THREE.BufferGeometry();
    this.snowPositions = new Float32Array(this.SNOW_COUNT * 3);
    for (let i = 0; i < this.SNOW_COUNT; i++) {
      const idx = i * 3;
      this.snowPositions[idx] = (Math.random() - 0.5) * 80;
      this.snowPositions[idx + 1] = Math.random() * 28;
      this.snowPositions[idx + 2] = (Math.random() - 0.5) * 80;
    }
    this.snowGeom.setAttribute('position', new THREE.BufferAttribute(this.snowPositions, 3));
    const snowMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.38,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.snowParticles = new THREE.Points(this.snowGeom, snowMat);
    this.snowParticles.frustumCulled = false;
    this.snowParticles.visible = false;
    this.scene.add(this.snowParticles);
  }

  public setWeather(weather: WeatherType): void {
    this.isRaining = weather === 'rain';
    this.isFoggy = weather === 'wind_fog';
    this.isSnowing = weather === 'snow';
    this.rainParticles.visible = this.isRaining;
    this.fogParticles.visible = this.isFoggy;
    this.snowParticles.visible = this.isSnowing;
  }

  public update(delta: number, focusPos: THREE.Vector3, heading: number = 0, speed: number = 0): void {
    if (this.isRaining && this.rainParticles.visible) {
      const pos = this.rainPositions;
      const fwdX = Math.sin(heading);
      const fwdZ = Math.cos(heading);
      // 차량 주행 방향 정반대 상대 풍속 (미풍 2.5m/s + 차량 속도에 따른 역방향 맞바람)
      const relWindX = -fwdX * speed + 2.5;
      const relWindZ = -fwdZ * speed + 1.2;
      const stepX = relWindX * delta;
      const stepZ = relWindZ * delta;
      const fallSpeed = 68.0 * delta;

      // 빗줄기 꼬리(Streak) 슬랜트: 차속이 빠를수록 전면 유리창/카메라를 향해 비스듬히 기울어짐
      const slantRatio = 0.024;
      const slantX = relWindX * slantRatio;
      const slantZ = relWindZ * slantRatio;

      for (let i = 0; i < this.RAIN_COUNT; i++) {
        const idx = i * 6;
        const len = 1.1 + (i % 5) * 0.25;

        pos[idx] += stepX;
        pos[idx + 1] -= fallSpeed;
        pos[idx + 2] += stepZ;
        pos[idx + 3] = pos[idx] + slantX;
        pos[idx + 4] = pos[idx + 1] - len;
        pos[idx + 5] = pos[idx + 2] + slantZ;

        const dx = pos[idx] - focusPos.x;
        const dy = pos[idx + 1] - focusPos.y;
        const dz = pos[idx + 2] - focusPos.z;
        const distSq = dx * dx + dz * dz;

        if (pos[idx + 4] < focusPos.y - 0.5 || dy < -3 || distSq > 3600) {
          const spawnX = focusPos.x + (Math.random() - 0.5) * 80 - relWindX * 0.15;
          const spawnY = focusPos.y + 14 + Math.random() * 18;
          const spawnZ = focusPos.z + (Math.random() - 0.5) * 80 - relWindZ * 0.15;

          pos[idx] = spawnX;
          pos[idx + 1] = spawnY;
          pos[idx + 2] = spawnZ;
          pos[idx + 3] = spawnX + slantX;
          pos[idx + 4] = spawnY - len;
          pos[idx + 5] = spawnZ + slantZ;
        }
      }
      (this.rainGeom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }

    if (this.isFoggy && this.fogParticles.visible) {
      const pos = this.fogPositions;
      // 차량 주행 방향(heading)과 차속(speed)에 기반한 물리적 상대 풍속(Relative Airflow) 산출
      const fwdX = Math.sin(heading);
      const fwdZ = Math.cos(heading);
      const effSpeed = Math.max(7.0, speed); // 정지 상태에서도 7m/s 미풍으로 흐름 유지
      const relVelX = -fwdX * effSpeed + 2.0;
      const relVelZ = -fwdZ * effSpeed + 1.0;

      const flowSpeed = Math.hypot(relVelX, relVelZ) || 1;
      const dirX = relVelX / flowSpeed;
      const dirZ = relVelZ / flowSpeed;

      const stepX = relVelX * delta;
      const stepZ = relVelZ * delta;
      const streakLen = 3.0 + Math.min(6.0, (speed / 35.0) * 4.5);

      for (let i = 0; i < this.FOG_PARTICLE_COUNT; i++) {
        const idx = i * 6;
        pos[idx] += stepX;
        pos[idx + 2] += stepZ;
        pos[idx + 3] = pos[idx] + dirX * streakLen;
        pos[idx + 5] = pos[idx + 2] + dirZ * streakLen;

        const dx = pos[idx] - focusPos.x;
        const dy = pos[idx + 1] - focusPos.y;
        const dz = pos[idx + 2] - focusPos.z;
        const distSq = dx * dx + dz * dz;

        // 차량 반경 55m 범위를 벗어나거나 고도가 어긋나면 차량 전방(맞바람 상류)으로 부드럽게 재배치
        if (distSq > 3025 || dy < 0 || dy > 16) {
          const spawnDist = 22 + Math.random() * 32;
          const spread = (Math.random() - 0.5) * 55;
          const spawnX = focusPos.x - dirX * spawnDist - dirZ * spread;
          const spawnZ = focusPos.z - dirZ * spawnDist + dirX * spread;
          const spawnY = focusPos.y + 0.3 + Math.random() * 12;

          pos[idx] = spawnX;
          pos[idx + 1] = spawnY;
          pos[idx + 2] = spawnZ;
          pos[idx + 3] = spawnX + dirX * streakLen;
          pos[idx + 4] = spawnY + (Math.random() - 0.5) * 0.2;
          pos[idx + 5] = spawnZ + dirZ * streakLen;
        }
      }
      (this.fogGeom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }

    if (this.isSnowing && this.snowParticles.visible) {
      this.snowTimer += delta * 3.0;
      const pos = this.snowPositions;
      const fwdX = Math.sin(heading);
      const fwdZ = Math.cos(heading);
      const relWindX = -fwdX * (speed * 0.95 + 3.0) + 1.8;
      const relWindZ = -fwdZ * (speed * 0.95 + 3.0) + 0.8;
      const stepX = relWindX * delta;
      const stepZ = relWindZ * delta;

      for (let i = 0; i < this.SNOW_COUNT; i++) {
        const idx = i * 3;
        const fallRate = (7.5 + (i % 6) * 0.7) * delta;
        const wobble = Math.sin(this.snowTimer + i * 0.4) * 0.035;

        pos[idx] += stepX + wobble;
        pos[idx + 1] -= fallRate;
        pos[idx + 2] += stepZ + wobble;

        const dx = pos[idx] - focusPos.x;
        const dy = pos[idx + 1] - focusPos.y;
        const dz = pos[idx + 2] - focusPos.z;
        const distSq = dx * dx + dz * dz;

        if (dy < -0.5 || dy > 24 || distSq > 3025) {
          pos[idx] = focusPos.x + (Math.random() - 0.5) * 75 - relWindX * 0.2;
          pos[idx + 1] = focusPos.y + 10.0 + Math.random() * 15.0;
          pos[idx + 2] = focusPos.z + (Math.random() - 0.5) * 75 - relWindZ * 0.2;
        }
      }
      (this.snowGeom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  public dispose(): void {
    this.scene.remove(this.rainParticles);
    this.rainGeom.dispose();
    (this.rainParticles.material as THREE.Material).dispose();

    this.scene.remove(this.fogParticles);
    this.fogGeom.dispose();
    (this.fogParticles.material as THREE.Material).dispose();

    this.scene.remove(this.snowParticles);
    this.snowGeom.dispose();
    (this.snowParticles.material as THREE.Material).dispose();
  }
}
