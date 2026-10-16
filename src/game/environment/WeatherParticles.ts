import * as THREE from 'three';
import type { WeatherType } from './EnvironmentPresets.ts';

/**
 * 3D 기상 파티클 시스템 (빗줄기 및 측풍 안개 스트릭 시뮬레이션)
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
      const x = (Math.random() - 0.5) * 90;
      const y = 0.3 + Math.random() * 14;
      const z = (Math.random() - 0.5) * 90;
      const len = 2.5 + Math.random() * 3.5;

      this.fogPositions[idx] = x;
      this.fogPositions[idx + 1] = y;
      this.fogPositions[idx + 2] = z;
      this.fogPositions[idx + 3] = x + len;
      this.fogPositions[idx + 4] = y + (Math.random() - 0.5) * 0.2;
      this.fogPositions[idx + 5] = z + (Math.random() - 0.5) * 0.4;
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
  }

  public setWeather(weather: WeatherType): void {
    this.isRaining = weather === 'rain';
    this.isFoggy = weather === 'wind_fog';
    this.rainParticles.visible = this.isRaining;
    this.fogParticles.visible = this.isFoggy;
  }

  public update(delta: number, focusPos: THREE.Vector3): void {
    if (this.isRaining && this.rainParticles.visible) {
      const pos = this.rainPositions;
      const fallSpeed = 66.0 * delta;
      const windSpeed = 7.0 * delta;

      for (let i = 0; i < this.RAIN_COUNT; i++) {
        const idx = i * 6;
        pos[idx] += windSpeed;
        pos[idx + 1] -= fallSpeed;
        pos[idx + 3] += windSpeed;
        pos[idx + 4] -= fallSpeed;

        const dx = pos[idx] - focusPos.x;
        const dy = pos[idx + 1] - focusPos.y;
        const dz = pos[idx + 2] - focusPos.z;

        if (pos[idx + 4] < 0.05 || dy < -3 || Math.abs(dx) > 50 || Math.abs(dz) > 50) {
          const x = focusPos.x + (Math.random() - 0.5) * 80;
          const y = focusPos.y + 15 + Math.random() * 16;
          const z = focusPos.z + (Math.random() - 0.5) * 80;
          const len = 1.0 + Math.random() * 0.8;

          pos[idx] = x;
          pos[idx + 1] = y;
          pos[idx + 2] = z;
          pos[idx + 3] = x - 0.12;
          pos[idx + 4] = y - len;
          pos[idx + 5] = z;
        }
      }
      (this.rainGeom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }

    if (this.isFoggy && this.fogParticles.visible) {
      const pos = this.fogPositions;
      const windSpeedX = 26.0 * delta;
      const windSpeedZ = 6.0 * delta;

      for (let i = 0; i < this.FOG_PARTICLE_COUNT; i++) {
        const idx = i * 6;
        pos[idx] += windSpeedX;
        pos[idx + 2] += windSpeedZ;
        pos[idx + 3] += windSpeedX;
        pos[idx + 5] += windSpeedZ;

        const dx = pos[idx] - focusPos.x;
        const dy = pos[idx + 1] - focusPos.y;
        const dz = pos[idx + 2] - focusPos.z;

        if (dx > 50 || Math.abs(dz) > 50 || dy < 0 || dy > 20) {
          const x = focusPos.x - 45 - Math.random() * 20;
          const y = focusPos.y + 0.3 + Math.random() * 12;
          const z = focusPos.z + (Math.random() - 0.5) * 90;
          const len = 2.5 + Math.random() * 3.5;

          pos[idx] = x;
          pos[idx + 1] = y;
          pos[idx + 2] = z;
          pos[idx + 3] = x + len;
          pos[idx + 4] = y + (Math.random() - 0.5) * 0.2;
          pos[idx + 5] = z + (Math.random() - 0.5) * 0.4;
        }
      }
      (this.fogGeom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  public dispose(): void {
    this.scene.remove(this.rainParticles);
    this.rainGeom.dispose();
    (this.rainParticles.material as THREE.Material).dispose();

    this.scene.remove(this.fogParticles);
    this.fogGeom.dispose();
    (this.fogParticles.material as THREE.Material).dispose();
  }
}
