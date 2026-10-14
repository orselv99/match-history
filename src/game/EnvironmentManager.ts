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

  // 비 날씨 파티클 시스템
  private rainParticles!: THREE.Points;
  private rainGeom!: THREE.BufferGeometry;
  private rainPositions!: Float32Array;
  private isRaining: boolean = false;
  private readonly RAIN_COUNT = 2400;

  public currentTimeOfDay: TimeOfDay = 'noon';
  public currentWeatherId: WeatherType = 'clear';

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.setupLighting();
    this.initRainSystem();
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

  private initRainSystem(): void {
    this.rainGeom = new THREE.BufferGeometry();
    this.rainPositions = new Float32Array(this.RAIN_COUNT * 3);

    for (let i = 0; i < this.RAIN_COUNT; i++) {
      this.rainPositions[i * 3] = (Math.random() - 0.5) * 120;
      this.rainPositions[i * 3 + 1] = Math.random() * 45;
      this.rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 120;
    }

    this.rainGeom.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));

    // 절차적 세로 빗방울 텍스처
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(8, 0, 8, 64);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
      grad.addColorStop(0.5, 'rgba(190, 225, 255, 0.7)');
      grad.addColorStop(1, 'rgba(230, 245, 255, 0.95)');
      ctx.fillStyle = grad;
      ctx.fillRect(6, 0, 4, 64);
    }
    const rainTex = new THREE.CanvasTexture(canvas);

    const rainMat = new THREE.PointsMaterial({
      color: 0x93c5fd,
      size: 1.4,
      map: rainTex,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this.rainParticles = new THREE.Points(this.rainGeom, rainMat);
    this.rainParticles.visible = false;
    this.scene.add(this.rainParticles);
  }

  public updateRain(delta: number, focusPos: THREE.Vector3): void {
    if (!this.isRaining || !this.rainParticles || !this.rainParticles.visible) return;

    const pos = this.rainPositions;
    const fallSpeed = 52.0 * delta;
    const windSpeed = 6.0 * delta;

    for (let i = 0; i < this.RAIN_COUNT; i++) {
      const idx = i * 3;
      pos[idx] += windSpeed;
      pos[idx + 1] -= fallSpeed;

      if (pos[idx + 1] < 0.05) {
        pos[idx] = focusPos.x + (Math.random() - 0.5) * 110;
        pos[idx + 1] = focusPos.y + 25 + Math.random() * 20;
        pos[idx + 2] = focusPos.z + (Math.random() - 0.5) * 110;
      }
    }

    (this.rainGeom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
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
      bgColor = 0x1a2130;
      fogColor = 0x1a2130;
      dirColor = 0xfde047; // 따뜻한 골든 모닝 햇살
      dirIntensity = 1.5;
      dirPos.set(180, 50, 60);
      ambColor = 0x94a3b8;
      ambIntensity = 0.65;
      hemiSky = 0xfef08a;
      hemiGround = 0x1e293b;
    } else if (timeOfDay === 'noon') {
      bgColor = 0x141824;
      fogColor = 0x141824;
      dirColor = 0xffffff; // 정오 순백색 태양광
      dirIntensity = 1.7;
      dirPos.set(70, 200, 60);
      ambColor = 0xe2e8f0;
      ambIntensity = 0.75;
      hemiSky = 0x7dd3fc;
      hemiGround = 0x0f172a;
    } else if (timeOfDay === 'sunset') {
      bgColor = 0x3b111e; // 노을빛 딥 버건디 퍼플
      fogColor = 0x3b111e;
      dirColor = 0xf97316; // 타오르는 오렌지-선셋 석양
      dirIntensity = 1.9;
      dirPos.set(190, 28, 90);
      ambColor = 0x9a3412;
      ambIntensity = 0.6;
      hemiSky = 0xfb923c;
      hemiGround = 0x2e1018;
    } else if (timeOfDay === 'night') {
      bgColor = 0x070a14; // 칠흑 같은 미드나잇
      fogColor = 0x070a14;
      dirColor = 0x38bdf8; // 은은한 청백색 달빛
      dirIntensity = 0.55;
      dirPos.set(60, 120, 40);
      ambColor = 0x1e293b;
      ambIntensity = 0.5;
      hemiSky = 0x334155;
      hemiGround = 0x0b0f19;
    }

    // 2. 날씨(Weather) 복합 효과
    if (weather === 'rain') {
      this.isRaining = true;
      if (this.rainParticles) this.rainParticles.visible = true;
      fogColor = 0x1e293b;
      fogDensity = 0.007;
      dirIntensity *= 0.6;
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
      if (this.rainParticles) this.rainParticles.visible = false;
      fogColor = 0x334155; // 짙은 슬레이트 안개
      fogDensity = 0.018;  // 진한 볼류메트릭 안개 농도
      dirIntensity *= 0.5;
      ambIntensity *= 1.1;
      if (audio) audio.setRainAudio(false);

      if (roadMaterial) {
        roadMaterial.roughness = 0.6;
        roadMaterial.metalness = 0.2;
        roadMaterial.color.setHex(0x282c35);
      }
    } else { // clear
      this.isRaining = false;
      if (this.rainParticles) this.rainParticles.visible = false;
      if (audio) audio.setRainAudio(false);

      if (roadMaterial) {
        roadMaterial.roughness = 0.7;
        roadMaterial.metalness = 0.15;
        roadMaterial.color.setHex(0x2e323b);
      }
    }

    // 3. 야간 또는 악천후(비/안개) 시 차량 헤드라이트 & 테일라이트 점등
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
