import * as THREE from 'three';
import { Vehicle } from './Vehicle.ts';
import { AICarManager } from './AICarManager.ts';
import { AudioManager } from '../core/AudioManager.ts';

export type TimeOfDay = 'morning' | 'noon' | 'sunset' | 'night';
export type WeatherType = 'clear' | 'rain' | 'wind_fog';

/**
 * 3D 환경 연출 전담 매니저 (조명, 날씨 파티클, 안개, 배경색, 노면 반사 동기화)
 */
export class EnvironmentManager {
  private scene: THREE.Scene;
  private dirLight!: THREE.DirectionalLight;
  private ambientLight!: THREE.AmbientLight;
  private hemiLight!: THREE.HemisphereLight;

  // 비 날씨 파티클 시스템 (초고속 3D 빗줄기 LineSegments)
  private rainParticles!: THREE.LineSegments;
  private rainGeom!: THREE.BufferGeometry;
  private rainPositions!: Float32Array;
  private isRaining: boolean = false;
  private readonly RAIN_COUNT = 2200;

  // 안개/바람 날씨 파티클 시스템 (측풍 가속 스트릭 & 짙은 미스트 wisps)
  private fogParticles!: THREE.LineSegments;
  private fogGeom!: THREE.BufferGeometry;
  private fogPositions!: Float32Array;
  private isFoggy: boolean = false;
  private readonly FOG_PARTICLE_COUNT = 1200;

  public currentTimeOfDay: TimeOfDay = 'noon';
  public currentWeatherId: WeatherType = 'clear';

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.setupLighting();
    this.initRainSystem();
    this.initFogSystem();
  }

  private setupLighting(): void {
    this.ambientLight = new THREE.AmbientLight(0xdbeafe, 0.6);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xffedd5, 1.4);
    this.dirLight.position.set(120, 150, 80);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 10;
    this.dirLight.shadow.camera.far = 400;
    const d = 120;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.scene.add(this.dirLight);

    this.hemiLight = new THREE.HemisphereLight(0x7dd3fc, 0x121316, 0.4);
    this.scene.add(this.hemiLight);
  }

  public setShadowQuality(quality: 'HIGH' | 'MEDIUM' | 'OFF'): void {
    const enabled = quality !== 'OFF';
    this.dirLight.castShadow = enabled;
    if (enabled) {
      const size = quality === 'HIGH' ? 2048 : 1024;
      this.dirLight.shadow.mapSize.set(size, size);
      if (this.dirLight.shadow.map) {
        this.dirLight.shadow.map.dispose();
        this.dirLight.shadow.map = null as any;
      }
    }
  }

  private initRainSystem(): void {
    this.rainGeom = new THREE.BufferGeometry();
    // 빗방울 1개당 2개 정점 (시작점, 끝점 * 3 = 6 floats)
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
      color: 0xc7d2fe, // 얇고 투명한 세련된 아이스 블루 빗줄기
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this.rainParticles = new THREE.LineSegments(this.rainGeom, rainMat);
    // 차량이 어디로 이동하든 뷰 절두체(Frustum) 컬링으로 빗줄기가 증발하지 않도록 설정
    this.rainParticles.frustumCulled = false;
    this.rainParticles.visible = false;
    this.scene.add(this.rainParticles);
  }

  private initFogSystem(): void {
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

  public updateRain(delta: number, focusPos: THREE.Vector3): void {
    if (this.isRaining && this.rainParticles && this.rainParticles.visible) {
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

        // 지면에 닿거나 차량 중심에서 50m 이상 멀어지면 차량 상공으로 즉시 연속 리스폰
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

    if (this.isFoggy && this.fogParticles && this.fogParticles.visible) {
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

  public setEnvironment(
    timeOfDay: TimeOfDay,
    weather: WeatherType,
    roadMaterial?: THREE.MeshStandardMaterial,
    playerVehicle?: Vehicle,
    aiManager?: AICarManager,
    audio?: AudioManager
  ): void {
    this.currentTimeOfDay = timeOfDay;
    this.currentWeatherId = weather;

    let bgColor = 0x121316;
    let fogColor = 0x121316;
    let fogDensity = 0.0035;
    let dirColor = 0xffedd5;
    let dirIntensity = 1.4;
    const dirPos = new THREE.Vector3(120, 150, 80);
    let ambColor = 0xdbeafe;
    let ambIntensity = 0.6;
    let hemiSky = 0x7dd3fc;
    let hemiGround = 0x121316;

    // 1. 시간대(Time of Day)
    if (timeOfDay === 'morning') {
      bgColor = 0xf59e0b; // 산뜻한 골든 모닝 아침 하늘
      fogColor = 0xfef08a; // 부드러운 아침 햇살 연무
      fogDensity = 0.002;
      dirColor = 0xfef08a; // 따뜻한 아침 햇살
      dirIntensity = 1.8;
      dirPos.set(180, 50, 60);
      ambColor = 0xfef3c7;
      ambIntensity = 0.75;
      hemiSky = 0xfde047;
      hemiGround = 0x1e293b;
    } else if (timeOfDay === 'noon') {
      bgColor = 0x38bdf8; // 쾌청하고 푸른 대낮 하늘
      fogColor = 0xbae6fd; // 맑은 대기 원경 헤이즈
      fogDensity = 0.0016;
      dirColor = 0xffffff; // 정오 순백색 태양광
      dirIntensity = 2.2;
      dirPos.set(70, 200, 60);
      ambColor = 0xf8fafc;
      ambIntensity = 0.9;
      hemiSky = 0x7dd3fc;
      hemiGround = 0x334155;
    } else if (timeOfDay === 'sunset') {
      bgColor = 0x9a3412; // 타오르는 앰버 오렌지 석양 하늘
      fogColor = 0xc2410c;
      fogDensity = 0.0022;
      dirColor = 0xf97316; // 강렬한 오렌지-선셋 석양광
      dirIntensity = 2.0;
      dirPos.set(190, 28, 90);
      ambColor = 0x7c2d12;
      ambIntensity = 0.65;
      hemiSky = 0xfb923c;
      hemiGround = 0x431407;
    } else if (timeOfDay === 'night') {
      bgColor = 0x070a14; // 칠흑 같은 미드나잇 밤하늘
      fogColor = 0x070a14;
      fogDensity = 0.0035;
      dirColor = 0x38bdf8; // 은은한 청백색 달빛
      dirIntensity = 0.5;
      dirPos.set(60, 120, 40);
      ambColor = 0x0f172a;
      ambIntensity = 0.4;
      hemiSky = 0x1e293b;
      hemiGround = 0x050811;
    }

    // 2. 날씨(Weather) 복합 효과
    if (weather === 'rain') {
      this.isRaining = true;
      this.isFoggy = false;
      if (this.rainParticles) this.rainParticles.visible = true;
      if (this.fogParticles) this.fogParticles.visible = false;
      fogColor = 0x334155;
      bgColor = 0x1e293b;
      fogDensity = 0.007;
      dirIntensity *= 0.5;
      ambColor = 0x475569;
      if (audio) audio.setRainAudio(true);

      // 비 오는 날 아스팔트 노면 웻 룩 (Glossy Wet Asphalt Reflection)
      if (roadMaterial) {
        roadMaterial.roughness = 0.12;
        roadMaterial.metalness = 0.55;
        roadMaterial.color.setHex(0x181a20);
      }
    } else if (weather === 'wind_fog') {
      this.isRaining = false;
      this.isFoggy = true;
      if (this.rainParticles) this.rainParticles.visible = false;
      if (this.fogParticles) this.fogParticles.visible = true;

      // 시간대별 안개 색조 & 배경색(하늘) 일치화 (온 세상이 짙은 안개로 둘러싸이도록 연출)
      if (timeOfDay === 'morning') {
        fogColor = 0xd4d4d8;
      } else if (timeOfDay === 'noon') {
        fogColor = 0xe2e8f0; // 짙은 쿨 실버-화이트 안개
      } else if (timeOfDay === 'sunset') {
        fogColor = 0x7c2d12; // 앰버-더스트 석양 안개
      } else { // night
        fogColor = 0x0f172a; // 칠흑 같은 미드나잇 안개
      }
      bgColor = fogColor;
      fogDensity = 0.026; // 시정 약 40~50m 수준의 확실한 레이싱 안개 밀도

      dirIntensity *= 0.35;
      ambIntensity *= 1.3;
      if (audio) audio.setRainAudio(false);

      if (roadMaterial) {
        roadMaterial.roughness = 0.55;
        roadMaterial.metalness = 0.25;
        roadMaterial.color.setHex(0x282c35);
      }
    } else { // clear
      this.isRaining = false;
      this.isFoggy = false;
      if (this.rainParticles) this.rainParticles.visible = false;
      if (this.fogParticles) this.fogParticles.visible = false;
      if (audio) audio.setRainAudio(false);

      if (roadMaterial) {
        roadMaterial.roughness = 0.7;
        roadMaterial.metalness = 0.15;
        roadMaterial.color.setHex(0x2e323b);
      }
    }

    // 3. 야간 또는 악천후(비/안개) 시에만 차량 헤드라이트 점등 (주간 맑음 시에는 OFF)
    const needHeadlights = timeOfDay === 'night' || weather === 'rain' || weather === 'wind_fog';
    if (playerVehicle) playerVehicle.setHeadlights(needHeadlights);
    if (aiManager) aiManager.setHeadlights(needHeadlights);

    this.scene.background = new THREE.Color(bgColor);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.setHex(fogColor);
      this.scene.fog.density = fogDensity;
    }
    this.dirLight.color.setHex(dirColor);
    this.dirLight.intensity = dirIntensity;
    this.dirLight.position.copy(dirPos);
    this.ambientLight.color.setHex(ambColor);
    this.ambientLight.intensity = ambIntensity;
    if (this.hemiLight) {
      this.hemiLight.color.setHex(hemiSky);
      this.hemiLight.groundColor.setHex(hemiGround);
    }
  }

  public setWeather(
    weatherId: 'clear' | 'sunset' | 'night' | 'rain',
    roadMaterial?: THREE.MeshStandardMaterial,
    playerVehicle?: Vehicle,
    aiManager?: AICarManager,
    audio?: AudioManager
  ): void {
    if (weatherId === 'sunset') {
      this.setEnvironment('sunset', 'clear', roadMaterial, playerVehicle, aiManager, audio);
    } else if (weatherId === 'night') {
      this.setEnvironment('night', 'clear', roadMaterial, playerVehicle, aiManager, audio);
    } else if (weatherId === 'rain') {
      this.setEnvironment('noon', 'rain', roadMaterial, playerVehicle, aiManager, audio);
    } else {
      this.setEnvironment('noon', 'clear', roadMaterial, playerVehicle, aiManager, audio);
    }
  }
}
