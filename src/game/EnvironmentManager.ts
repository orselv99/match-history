import * as THREE from 'three';
import type { Vehicle } from './Vehicle.ts';
import type { OpponentManager } from './OpponentManager.ts';
import type { AudioManager } from '../core/AudioManager.ts';

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

  // 천체(해/달/별), 다중 그라데이션 스카이돔 및 절차적 3D 볼류메트릭 구름 시스템
  private skyDome!: THREE.Mesh;
  private skyDomeMat!: THREE.ShaderMaterial;
  private sunGroup!: THREE.Group;
  private sunCore!: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private sunCorona?: THREE.Sprite;
  private sunHorizonHalo?: THREE.Sprite;
  private moonGroup!: THREE.Group;
  private moonCore!: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private moonCorona?: THREE.Sprite;
  private starPoints!: THREE.Points;
  private cloudGroup!: THREE.Group;
  private clouds: THREE.Group[] = [];
  private cloudMaterial!: THREE.MeshStandardMaterial;
  private cloudShadowMaterial!: THREE.MeshStandardMaterial;

  public currentTimeOfDay: TimeOfDay = 'noon';
  public currentWeatherId: WeatherType = 'clear';

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.setupLighting();
    this.initCelestialAndClouds();
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

  private createGlowTexture(innerAlpha: number = 1.0, outerAlpha: number = 0.0): THREE.CanvasTexture | null {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, `rgba(255, 255, 255, ${innerAlpha})`);
    grad.addColorStop(0.35, `rgba(255, 255, 255, ${innerAlpha * 0.5})`);
    grad.addColorStop(0.7, `rgba(255, 255, 255, ${innerAlpha * 0.15})`);
    grad.addColorStop(1, `rgba(255, 255, 255, ${outerAlpha})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
  }

  private initCelestialAndClouds(): void {
    // 0. 다중 스톱 대기 산란 스카이돔 (4-Stop Gradient + Directional Sun Mie Glow)
    const skyGeom = new THREE.SphereGeometry(440, 32, 24);
    this.skyDomeMat = new THREE.ShaderMaterial({
      uniforms: {
        uTopColor: { value: new THREE.Color(0x1d4ed8) },
        uUpperMidColor: { value: new THREE.Color(0x38bdf8) },
        uLowerMidColor: { value: new THREE.Color(0x7dd3fc) },
        uHorizonColor: { value: new THREE.Color(0xe0f2fe) },
        uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
        uSunGlowColor: { value: new THREE.Color(0xfffbeb) },
        uSunGlowStrength: { value: 0.25 },
      },
      vertexShader: `
        varying vec3 vWorldOffset;
        void main() {
          vWorldOffset = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uTopColor;
        uniform vec3 uUpperMidColor;
        uniform vec3 uLowerMidColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uSunDir;
        uniform vec3 uSunGlowColor;
        uniform float uSunGlowStrength;
        varying vec3 vWorldOffset;

        void main() {
          vec3 dir = normalize(vWorldOffset);
          float h = clamp(dir.y, 0.0, 1.0);

          // 4단계 수직 대기 그라데이션 (지평선 -> 하단층 -> 중단층 -> 천정)
          vec3 col = mix(uHorizonColor, uLowerMidColor, smoothstep(0.0, 0.14, h));
          col = mix(col, uUpperMidColor, smoothstep(0.14, 0.38, h));
          col = mix(col, uTopColor, smoothstep(0.38, 0.82, h));

          // 태양 방향 대기 산란(Mie Scattering) 및 지평선 노을 글로우
          float sunAmt = max(dot(dir, uSunDir), 0.0);
          float horizonBand = (1.0 - smoothstep(0.0, 0.35, h)) * pow(sunAmt, 2.2);
          float solarHalo = pow(sunAmt, 7.0) * 0.55 + horizonBand * 0.65;
          col = mix(col, uSunGlowColor, clamp(solarHalo * uSunGlowStrength, 0.0, 0.85));

          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.skyDome = new THREE.Mesh(skyGeom, this.skyDomeMat);
    this.skyDome.renderOrder = -10;
    this.skyDome.frustumCulled = false;
    this.scene.add(this.skyDome);

    const glowTex = this.createGlowTexture();

    // 1. 태양 (Sun + 이중 코로나/지평선 헤일로)
    this.sunGroup = new THREE.Group();
    const sunGeom = new THREE.SphereGeometry(14, 20, 20);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    this.sunCore = new THREE.Mesh(sunGeom, sunMat);
    this.sunGroup.add(this.sunCore);

    if (glowTex) {
      const coronaMat = new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xffedd5,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      this.sunCorona = new THREE.Sprite(coronaMat);
      this.sunCorona.scale.set(78, 78, 1);
      this.sunGroup.add(this.sunCorona);

      const haloMat = new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xf97316,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      this.sunHorizonHalo = new THREE.Sprite(haloMat);
      this.sunHorizonHalo.scale.set(220, 110, 1);
      this.sunGroup.add(this.sunHorizonHalo);
    }
    this.scene.add(this.sunGroup);

    // 2. 달 (Moon)
    this.moonGroup = new THREE.Group();
    const moonGeom = new THREE.SphereGeometry(10, 16, 16);
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe, fog: false });
    this.moonCore = new THREE.Mesh(moonGeom, moonMat);
    this.moonGroup.add(this.moonCore);

    if (glowTex) {
      const moonCoronaMat = new THREE.SpriteMaterial({
        map: glowTex,
        color: 0x93c5fd,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      this.moonCorona = new THREE.Sprite(moonCoronaMat);
      this.moonCorona.scale.set(45, 45, 1);
      this.moonGroup.add(this.moonCorona);
    }
    this.scene.add(this.moonGroup);

    // 3. 야간 및 석양 상공 별자리 (Stars)
    const starCount = 450;
    const starGeom = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * (Math.PI * 0.42);
      const r = 260 + Math.random() * 20;
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.cos(phi) + 25;
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    starGeom.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.6,
      transparent: true,
      opacity: 0.85,
      fog: false,
    });
    this.starPoints = new THREE.Points(starGeom, starMat);
    this.starPoints.visible = false;
    this.scene.add(this.starPoints);

    // 4. 입체 투톤 볼류메트릭 구름 (안개에 지워지지 않도록 fog: false 및 상/하단 음영 분리)
    this.cloudGroup = new THREE.Group();
    this.cloudMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0.02,
      flatShading: true,
      fog: false,
    });
    this.cloudShadowMaterial = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.9,
      metalness: 0.02,
      flatShading: true,
      fog: false,
    });

    const cloudClusterCount = 28;
    for (let i = 0; i < cloudClusterCount; i++) {
      const cluster = new THREE.Group();
      const x = (Math.random() - 0.5) * 520;
      const y = 58 + Math.random() * 42;
      const z = (Math.random() - 0.5) * 520;
      cluster.position.set(x, y, z);

      const puffCount = 5 + Math.floor(Math.random() * 4);
      for (let p = 0; p < puffCount; p++) {
        const radius = 10 + Math.random() * 13;
        const puffGeom = new THREE.SphereGeometry(radius, 7, 6);
        const isLowerBelly = p < 2;
        const puff = new THREE.Mesh(puffGeom, isLowerBelly ? this.cloudShadowMaterial : this.cloudMaterial);
        puff.position.set(
          (Math.random() - 0.5) * 28,
          isLowerBelly ? -2.5 - Math.random() * 2.5 : 1.5 + Math.random() * 4.5,
          (Math.random() - 0.5) * 20
        );
        puff.scale.set(1.5, 0.68, 1.25);
        cluster.add(puff);
      }

      this.cloudGroup.add(cluster);
      this.clouds.push(cluster);
    }
    this.scene.add(this.cloudGroup);
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

  private sunBaseOffset: THREE.Vector3 = new THREE.Vector3(230, 34, 110);
  private moonBaseOffset: THREE.Vector3 = new THREE.Vector3(70, 160, 50);

  public update(delta: number, focusPos: THREE.Vector3): void {
    // 0. 스카이돔 및 천체(해/달/별)를 차량 기준 원경 좌표에 동기화하여 서킷 어디서든 일정한 시야각 유지
    if (this.skyDome) {
      this.skyDome.position.set(focusPos.x, 0, focusPos.z);
    }
    if (this.sunGroup && this.sunGroup.visible) {
      this.sunGroup.position.set(
        focusPos.x + this.sunBaseOffset.x,
        this.sunBaseOffset.y,
        focusPos.z + this.sunBaseOffset.z
      );
    }
    if (this.moonGroup && this.moonGroup.visible) {
      this.moonGroup.position.set(
        focusPos.x + this.moonBaseOffset.x,
        this.moonBaseOffset.y,
        focusPos.z + this.moonBaseOffset.z
      );
    }
    if (this.starPoints && this.starPoints.visible) {
      this.starPoints.position.set(focusPos.x, 0, focusPos.z);
    }

    // 1. 구름이 바람을 타고 이동하며 차량 주변 520m 반경 내에 항상 분포하도록 Seamless 래핑
    if (this.clouds.length > 0) {
      const windX = (this.currentWeatherId === 'wind_fog' ? 16.0 : 4.5) * delta;
      const windZ = 1.2 * delta;
      for (let i = 0; i < this.clouds.length; i++) {
        const c = this.clouds[i];
        c.position.x += windX;
        c.position.z += windZ;
        if (c.position.x - focusPos.x > 260) c.position.x -= 520;
        if (c.position.x - focusPos.x < -260) c.position.x += 520;
        if (c.position.z - focusPos.z > 260) c.position.z -= 520;
        if (c.position.z - focusPos.z < -260) c.position.z += 520;
      }
    }

    // 2. 비 및 안개 파티클 시스템 업데이트
    this.updateRain(delta, focusPos);
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
    opponentManager?: OpponentManager,
    audio?: AudioManager
  ): void {
    this.currentTimeOfDay = timeOfDay;
    this.currentWeatherId = weather;

    let bgColor = 0x121316;
    let fogColor = 0x121316;
    let fogDensity = 0.0022;
    let dirColor = 0xffedd5;
    let dirIntensity = 1.4;
    const dirPos = new THREE.Vector3(120, 150, 80);
    let ambColor = 0xdbeafe;
    let ambIntensity = 0.6;
    let hemiSky = 0x7dd3fc;
    let hemiGround = 0x121316;

    // 스카이돔 4단계 그라데이션 & 태양 산란 파라미터
    let skyTop = 0x1d4ed8;
    let skyUpperMid = 0x38bdf8;
    let skyLowerMid = 0x7dd3fc;
    let skyHorizon = 0xe0f2fe;
    let sunGlowColor = 0xfffbeb;
    let sunGlowStrength = 0.3;

    // 구름 상단(하이라이트) & 하단(음영) 컬러 및 자체 발광(석양 노을 반사)
    let cloudTopColor = 0xffffff;
    let cloudBellyColor = 0xcbd5e1;
    let cloudTopEmissive = 0x000000;
    let cloudBellyEmissive = 0x000000;
    let cloudEmissiveIntensity = 0.0;

    // 1. 시간대(Time of Day) 기본 대기 및 조명 설정
    if (timeOfDay === 'morning') {
      bgColor = 0x60a5fa;
      fogColor = 0xfef3c7;
      fogDensity = 0.0016;
      dirColor = 0xfffbeb;
      dirIntensity = 1.85;
      dirPos.set(180, 55, 65);
      ambColor = 0xfef3c7;
      ambIntensity = 0.8;
      hemiSky = 0xfde68a;
      hemiGround = 0x334155;

      skyTop = 0x2563eb;
      skyUpperMid = 0x60a5fa;
      skyLowerMid = 0xfcd34d;
      skyHorizon = 0xfef3c7;
      sunGlowColor = 0xfde047;
      sunGlowStrength = 0.65;

      cloudTopColor = 0xfffbeb;
      cloudBellyColor = 0xfde68a;
      cloudTopEmissive = 0xfef08a;
      cloudBellyEmissive = 0xd97706;
      cloudEmissiveIntensity = 0.15;
    } else if (timeOfDay === 'noon') {
      bgColor = 0x38bdf8;
      fogColor = 0xdbeafe;
      fogDensity = 0.0014;
      dirColor = 0xffffff;
      dirIntensity = 2.2;
      dirPos.set(70, 200, 60);
      ambColor = 0xf8fafc;
      ambIntensity = 0.92;
      hemiSky = 0x7dd3fc;
      hemiGround = 0x334155;

      skyTop = 0x0284c7;
      skyUpperMid = 0x38bdf8;
      skyLowerMid = 0x7dd3fc;
      skyHorizon = 0xe0f2fe;
      sunGlowColor = 0xffffff;
      sunGlowStrength = 0.25;

      cloudTopColor = 0xffffff;
      cloudBellyColor = 0xcbd5e1;
      cloudEmissiveIntensity = 0.05;
      cloudTopEmissive = 0xffffff;
    } else if (timeOfDay === 'sunset') {
      // 단조로운 주황색 단색 배경 대신: 인디고 바이올렛(천정) -> 마젠타 로즈(중상단) -> 크림슨 코랄(중하단) -> 골든 앰버(지평선)
      bgColor = 0x4c1d4b;
      fogColor = 0x88394e; // 은은한 로즈-앰버 황혼 연무 (구름과 원경 건물을 가리지 않도록 밀도 완화)
      fogDensity = 0.0013;
      dirColor = 0xff9e5e; // 따뜻한 골든 코랄 석양 직사광
      dirIntensity = 2.15;
      dirPos.set(210, 32, 95);
      ambColor = 0xc06c84; // 핑크-바이올렛 황혼 환경광
      ambIntensity = 0.82;
      hemiSky = 0xfb923c;  // 상공 골든 오렌지
      hemiGround = 0x2e1a36; // 지면 딥 퍼플 반사광 (입체적인 색채 대비)

      skyTop = 0x161336;       // 천정: 딥 트와일라잇 인디고-네이비
      skyUpperMid = 0x5b2159;  // 상단: 로열 바이올렛-마젠타
      skyLowerMid = 0xc83e52;  // 하단: 크림슨-로즈 코랄
      skyHorizon = 0xff9238;   // 지평선: 타오르는 골든 앰버-피치
      sunGlowColor = 0xffe082; // 태양 주변 황금빛 대기 산란
      sunGlowStrength = 0.92;

      // 석양 구름: 상단/외곽은 황금빛 코랄 노을을 받고, 하단 배 부분은 진한 플럼-바이올렛 음영을 주어 뚜렷한 입체감 형성
      cloudTopColor = 0xffc299;
      cloudBellyColor = 0x52254e;
      cloudTopEmissive = 0xf97316;
      cloudBellyEmissive = 0x3b173b;
      cloudEmissiveIntensity = 0.38;
    } else if (timeOfDay === 'night') {
      bgColor = 0x070a14;
      fogColor = 0x070a14;
      fogDensity = 0.0032;
      dirColor = 0x60a5fa;
      dirIntensity = 0.55;
      dirPos.set(60, 120, 40);
      ambColor = 0x0f172a;
      ambIntensity = 0.45;
      hemiSky = 0x1e293b;
      hemiGround = 0x050811;

      skyTop = 0x03050a;
      skyUpperMid = 0x070b16;
      skyLowerMid = 0x0f172a;
      skyHorizon = 0x1e293b;
      sunGlowColor = 0x60a5fa;
      sunGlowStrength = 0.0;

      cloudTopColor = 0x334155;
      cloudBellyColor = 0x0f172a;
      cloudEmissiveIntensity = 0.0;
    }

    // 2. 날씨(Weather) 복합 효과 — 시간대(아침/낮/석양/밤) 고유의 밝기와 색조를 유지!
    if (weather === 'rain') {
      this.isRaining = true;
      this.isFoggy = false;
      if (this.rainParticles) this.rainParticles.visible = true;
      if (this.fogParticles) this.fogParticles.visible = false;

      if (timeOfDay === 'morning') {
        // 아침 비: 산뜻하고 밝은 실버-웜 그레이 아침 우천
        bgColor = 0x94a3b8;
        fogColor = 0xb0bec5;
        fogDensity = 0.0042;
        dirColor = 0xfef3c7;
        dirIntensity = 1.25;
        ambColor = 0xe2e8f0;
        ambIntensity = 0.88;
        hemiSky = 0xcbd5e1;
        hemiGround = 0x334155;

        skyTop = 0x64748b;
        skyUpperMid = 0x829ab1;
        skyLowerMid = 0xa8b8c8;
        skyHorizon = 0xdbeafe;
        sunGlowStrength = 0.2;

        cloudTopColor = 0xcbd5e1;
        cloudBellyColor = 0x64748b;
        cloudEmissiveIntensity = 0.08;
      } else if (timeOfDay === 'noon') {
        // 정오(낮) 비: 어두운 밤이 아닌 밝은 주간 흐린 하늘(Daytime Overcast Wet Race)
        bgColor = 0x829ab1;
        fogColor = 0x9fb3c8;
        fogDensity = 0.0040;
        dirColor = 0xe2e8f0;
        dirIntensity = 1.45;
        ambColor = 0xf1f5f9;
        ambIntensity = 0.98;
        hemiSky = 0xbae6fd;
        hemiGround = 0x334155;

        skyTop = 0x475569;
        skyUpperMid = 0x64748b;
        skyLowerMid = 0x8fa3b8;
        skyHorizon = 0xcbd5e1;
        sunGlowStrength = 0.15;

        cloudTopColor = 0xb0c4de;
        cloudBellyColor = 0x52667a;
        cloudEmissiveIntensity = 0.05;
      } else if (timeOfDay === 'sunset') {
        // 석양 비: 보랏빛 먹구름 사이로 붉은 황혼빛이 번지는 드라마틱한 우천 석양
        bgColor = 0x4a2c40;
        fogColor = 0x73414c;
        fogDensity = 0.0044;
        dirColor = 0xfb923c;
        dirIntensity = 1.15;
        ambColor = 0x9a6b78;
        ambIntensity = 0.76;
        hemiSky = 0xd97757;
        hemiGround = 0x261722;

        skyTop = 0x1f1930;
        skyUpperMid = 0x46263f;
        skyLowerMid = 0x7d3c47;
        skyHorizon = 0xc46243;
        sunGlowColor = 0xf97316;
        sunGlowStrength = 0.45;

        cloudTopColor = 0xb87a76;
        cloudBellyColor = 0x3d2336;
        cloudTopEmissive = 0xc2410c;
        cloudBellyEmissive = 0x291526;
        cloudEmissiveIntensity = 0.22;
      } else {
        // 야간 비: 짙은 미드나잇 폭우
        bgColor = 0x090d16;
        fogColor = 0x0f172a;
        fogDensity = 0.0055;
        dirIntensity = 0.45;
        ambColor = 0x1e293b;
        ambIntensity = 0.45;

        skyTop = 0x04070e;
        skyUpperMid = 0x090f1d;
        skyLowerMid = 0x111a2e;
        skyHorizon = 0x1e293b;
        sunGlowStrength = 0.0;

        cloudTopColor = 0x283548;
        cloudBellyColor = 0x0f172a;
        cloudEmissiveIntensity = 0.0;
      }

      if (audio) audio.setRainAudio(true);

      // 비 오는 날 아스팔트 노면 웻 룩 (Glossy Wet Asphalt Reflection)
      if (roadMaterial) {
        roadMaterial.roughness = 0.12;
        roadMaterial.metalness = 0.55;
        roadMaterial.color.setHex(timeOfDay === 'night' ? 0x181a20 : 0x222630);
      }
    } else if (weather === 'wind_fog') {
      this.isRaining = false;
      this.isFoggy = true;
      if (this.rainParticles) this.rainParticles.visible = false;
      if (this.fogParticles) this.fogParticles.visible = true;

      if (timeOfDay === 'morning') {
        fogColor = 0xd4d4d8;
      } else if (timeOfDay === 'noon') {
        fogColor = 0xe2e8f0;
      } else if (timeOfDay === 'sunset') {
        fogColor = 0x8c464f;
      } else {
        fogColor = 0x0f172a;
      }
      bgColor = fogColor;
      skyTop = fogColor;
      skyUpperMid = fogColor;
      skyLowerMid = fogColor;
      skyHorizon = fogColor;
      sunGlowStrength = 0.1;
      fogDensity = 0.024;

      dirIntensity *= 0.45;
      ambIntensity *= 1.25;
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
        roadMaterial.roughness = 0.68;
        roadMaterial.metalness = 0.16;
        roadMaterial.color.setHex(0x2e323b);
      }
    }

    // 3. 야간 또는 악천후(비/안개) 및 석양 시 차량 헤드라이트 점등
    const needHeadlights = timeOfDay === 'night' || weather === 'rain' || weather === 'wind_fog';
    if (playerVehicle) playerVehicle.setHeadlights(needHeadlights);
    if (opponentManager) opponentManager.setHeadlights(needHeadlights);

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

    // 4. 스카이돔 셰이더 Uniform 업데이트
    if (this.skyDomeMat) {
      this.skyDomeMat.uniforms.uTopColor.value.setHex(skyTop);
      this.skyDomeMat.uniforms.uUpperMidColor.value.setHex(skyUpperMid);
      this.skyDomeMat.uniforms.uLowerMidColor.value.setHex(skyLowerMid);
      this.skyDomeMat.uniforms.uHorizonColor.value.setHex(skyHorizon);
      this.skyDomeMat.uniforms.uSunGlowColor.value.setHex(sunGlowColor);
      this.skyDomeMat.uniforms.uSunGlowStrength.value = sunGlowStrength;
      this.skyDomeMat.uniforms.uSunDir.value.copy(dirPos).normalize();
    }

    // 5. 투톤 볼류메트릭 구름 머티리얼 업데이트
    if (this.cloudMaterial) {
      this.cloudMaterial.color.setHex(cloudTopColor);
      this.cloudMaterial.emissive.setHex(cloudTopEmissive);
      this.cloudMaterial.emissiveIntensity = cloudEmissiveIntensity;
    }
    if (this.cloudShadowMaterial) {
      this.cloudShadowMaterial.color.setHex(cloudBellyColor);
      this.cloudShadowMaterial.emissive.setHex(cloudBellyEmissive);
      this.cloudShadowMaterial.emissiveIntensity = cloudEmissiveIntensity * 0.7;
    }

    // 6. 천체(해/달/별) 위치 및 외형 동기화
    if (timeOfDay === 'morning') {
      this.sunBaseOffset.set(220, 55, 75);
      if (this.sunGroup) {
        this.sunGroup.position.copy(this.sunBaseOffset);
        this.sunCore.material.color.setHex(0xfef08a);
        if (this.sunCorona) this.sunCorona.material.color.setHex(0xfbbf24);
        if (this.sunHorizonHalo) {
          this.sunHorizonHalo.material.color.setHex(0xf59e0b);
          this.sunHorizonHalo.material.opacity = weather === 'clear' ? 0.35 : 0.0;
        }
        this.sunGroup.visible = weather === 'clear';
      }
      if (this.moonGroup) this.moonGroup.visible = false;
      if (this.starPoints) this.starPoints.visible = false;
    } else if (timeOfDay === 'noon') {
      this.sunBaseOffset.set(80, 240, 70);
      if (this.sunGroup) {
        this.sunGroup.position.copy(this.sunBaseOffset);
        this.sunCore.material.color.setHex(0xffffff);
        if (this.sunCorona) this.sunCorona.material.color.setHex(0xffedd5);
        if (this.sunHorizonHalo) this.sunHorizonHalo.material.opacity = 0.0;
        this.sunGroup.visible = weather === 'clear';
      }
      if (this.moonGroup) this.moonGroup.visible = false;
      if (this.starPoints) this.starPoints.visible = false;
    } else if (timeOfDay === 'sunset') {
      this.sunBaseOffset.set(230, 34, 110);
      if (this.sunGroup) {
        this.sunGroup.position.copy(this.sunBaseOffset);
        this.sunCore.material.color.setHex(0xfff3b0);
        if (this.sunCorona) {
          this.sunCorona.material.color.setHex(0xff7b38);
          this.sunCorona.scale.set(95, 95, 1);
        }
        if (this.sunHorizonHalo) {
          this.sunHorizonHalo.material.color.setHex(0xe11d48);
          this.sunHorizonHalo.material.opacity = weather === 'clear' ? 0.55 : 0.22;
        }
        this.sunGroup.visible = weather !== 'wind_fog';
      }
      if (this.moonGroup) this.moonGroup.visible = false;
      // 석양 시 천정(상공 인디고 하늘)에 은은한 초저녁 별빛 표시
      if (this.starPoints) {
        this.starPoints.visible = weather === 'clear';
        (this.starPoints.material as THREE.PointsMaterial).opacity = 0.42;
      }
    } else if (timeOfDay === 'night') {
      if (this.sunGroup) this.sunGroup.visible = false;
      this.moonBaseOffset.set(70, 160, 50);
      if (this.moonGroup) {
        this.moonGroup.position.copy(this.moonBaseOffset);
        this.moonGroup.visible = weather === 'clear';
      }
      if (this.starPoints) {
        this.starPoints.visible = weather === 'clear';
        (this.starPoints.material as THREE.PointsMaterial).opacity = 0.88;
      }
    }
  }

  public setWeather(
    weatherId: 'clear' | 'sunset' | 'night' | 'rain',
    roadMaterial?: THREE.MeshStandardMaterial,
    playerVehicle?: Vehicle,
    opponentManager?: OpponentManager,
    audio?: AudioManager
  ): void {
    if (weatherId === 'sunset') {
      this.setEnvironment('sunset', 'clear', roadMaterial, playerVehicle, opponentManager, audio);
    } else if (weatherId === 'night') {
      this.setEnvironment('night', 'clear', roadMaterial, playerVehicle, opponentManager, audio);
    } else if (weatherId === 'rain') {
      this.setEnvironment('noon', 'rain', roadMaterial, playerVehicle, opponentManager, audio);
    } else {
      this.setEnvironment('noon', 'clear', roadMaterial, playerVehicle, opponentManager, audio);
    }
  }
}
