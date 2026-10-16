import * as THREE from 'three';
import type { Vehicle } from './Vehicle.ts';
import type { OpponentManager } from './OpponentManager.ts';
import type { AudioManager } from '../core/AudioManager.ts';
import {
  getEnvironmentPreset,
  type TimeOfDay,
  type WeatherType,
  type EnvironmentPreset,
} from './environment/EnvironmentPresets.ts';
import { WeatherParticles } from './environment/WeatherParticles.ts';

export type { TimeOfDay, WeatherType, EnvironmentPreset };

/**
 * 3D 환경 연출 전담 매니저 (조명, 날씨 파티클, 안개, 배경색, 노면 반사 동기화)
 */
export class EnvironmentManager {
  private scene: THREE.Scene;
  private dirLight!: THREE.DirectionalLight;
  private ambientLight!: THREE.AmbientLight;
  private hemiLight!: THREE.HemisphereLight;

  private weatherParticles: WeatherParticles;

  // 천체(해/달/별), 스카이돔 및 절차적 3D 볼류메트릭 구름 시스템
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

  private sunBaseOffset: THREE.Vector3 = new THREE.Vector3(80, 240, 70);
  private moonBaseOffset: THREE.Vector3 = new THREE.Vector3(70, 160, 50);
  private currentPreset: EnvironmentPreset;

  public currentTimeOfDay: TimeOfDay = 'noon';
  public currentWeather: WeatherType = 'clear';

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.currentPreset = getEnvironmentPreset('noon', 'clear');

    this.setupLighting();
    this.initCelestialAndClouds();
    this.weatherParticles = new WeatherParticles(this.scene);
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

  private createMoonTexture(): THREE.CanvasTexture | null {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 밝은 은빛 달 표면
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, 0, 256, 256);

    // 크레이터 및 바다(Lunar Maria) 음영
    const craters = [
      { x: 95, y: 85, r: 48, a: 0.18 },
      { x: 165, y: 115, r: 58, a: 0.22 },
      { x: 135, y: 175, r: 42, a: 0.16 },
      { x: 75, y: 155, r: 32, a: 0.20 },
      { x: 185, y: 65, r: 28, a: 0.15 },
    ];
    craters.forEach(c => {
      const g = ctx.createRadialGradient(c.x, c.y, 4, c.x, c.y, c.r);
      g.addColorStop(0, `rgba(71, 85, 105, ${c.a})`);
      g.addColorStop(0.7, `rgba(100, 116, 139, ${c.a * 0.6})`);
      g.addColorStop(1, 'rgba(241, 245, 249, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
    });

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

          vec3 col = mix(uHorizonColor, uLowerMidColor, smoothstep(0.0, 0.14, h));
          col = mix(col, uUpperMidColor, smoothstep(0.14, 0.38, h));
          col = mix(col, uTopColor, smoothstep(0.38, 0.82, h));

          float sunAmt = max(dot(dir, uSunDir), 0.0);
          float horizonBand = (1.0 - smoothstep(0.0, 0.35, h)) * pow(sunAmt, 2.2);
          float solarHalo = pow(sunAmt, 7.0) * 0.55 + horizonBand * 0.65;
          col = mix(col, uSunGlowColor, clamp(solarHalo * uSunGlowStrength, 0.0, 0.85));

          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
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

    // 2. 대형 달 (Full Moon + 크레이터 음영 + 소프트 루나 코로나)
    this.moonGroup = new THREE.Group();
    const moonTex = this.createMoonTexture();
    const moonGeom = new THREE.SphereGeometry(22, 24, 24);
    const moonMat = new THREE.MeshBasicMaterial({
      color: 0xf8fafc,
      map: moonTex || undefined,
      fog: false,
    });
    this.moonCore = new THREE.Mesh(moonGeom, moonMat);
    this.moonGroup.add(this.moonCore);

    if (glowTex) {
      const moonCoronaMat = new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xbde0fe,
        transparent: true,
        opacity: 0.78,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      this.moonCorona = new THREE.Sprite(moonCoronaMat);
      this.moonCorona.scale.set(110, 110, 1);
      this.moonGroup.add(this.moonCorona);
    }
    this.scene.add(this.moonGroup);

    // 3. 밤하늘 대형 성단 (2600개 별자리 + 다채로운 항성 스펙트럼)
    const starCount = 2600;
    const starGeom = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * (Math.PI * 0.48); // 지평선 근처까지 균일하고 둥글게 분포
      const r = 390 + Math.random() * 30; // 440m 스카이돔 직전 천구면
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.cos(phi) + 10;
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

      // 다채로운 항성 스펙트럼 색상 (다이아몬드 화이트 / 아이시 블루 / 웜 앰버 골드)
      const colorRand = Math.random();
      if (colorRand < 0.72) {
        starColors[i * 3] = 1.0;
        starColors[i * 3 + 1] = 1.0;
        starColors[i * 3 + 2] = 1.0;
      } else if (colorRand < 0.88) {
        starColors[i * 3] = 0.72;
        starColors[i * 3 + 1] = 0.88;
        starColors[i * 3 + 2] = 1.0;
      } else {
        starColors[i * 3] = 1.0;
        starColors[i * 3 + 1] = 0.92;
        starColors[i * 3 + 2] = 0.70;
      }
    }
    starGeom.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeom.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

    const starMat = new THREE.PointsMaterial({
      size: 2.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      fog: false,
    });
    this.starPoints = new THREE.Points(starGeom, starMat);
    this.starPoints.visible = false;
    this.scene.add(this.starPoints);

    // 4. 입체 투톤 볼류메트릭 구름
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

  public update(delta: number, focusPos: THREE.Vector3): void {
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

    if (this.clouds.length > 0) {
      const windX = this.currentPreset.cloudWindX * delta;
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

    this.weatherParticles.update(delta, focusPos);
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
    this.currentWeather = weather;

    const preset = getEnvironmentPreset(timeOfDay, weather);
    this.currentPreset = preset;

    // 1. 기상 파티클 시스템
    this.weatherParticles.setWeather(weather);

    // 2. 환경 앰비언스 오디오
    if (audio) {
      audio.setRainAudio(preset.playRainAudio);
    }

    // 3. 노면 아스팔트 반사도/거칠기/색상
    if (roadMaterial) {
      roadMaterial.roughness = preset.roadRoughness;
      roadMaterial.metalness = preset.roadMetalness;
      roadMaterial.color.setHex(preset.roadColor);
    }

    // 4. 차량 헤드라이트 점등
    if (playerVehicle) playerVehicle.setHeadlights(preset.needHeadlights);
    if (opponentManager) opponentManager.setHeadlights(preset.needHeadlights);

    // 5. 배경색 및 지수 안개
    this.scene.background = new THREE.Color(preset.bgColor);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.setHex(preset.fogColor);
      this.scene.fog.density = preset.fogDensity;
    }

    // 6. 직사광 및 환경광
    this.dirLight.color.setHex(preset.dirColor);
    this.dirLight.intensity = preset.dirIntensity;
    this.dirLight.position.copy(preset.dirPos);
    this.ambientLight.color.setHex(preset.ambColor);
    this.ambientLight.intensity = preset.ambIntensity;
    if (this.hemiLight) {
      this.hemiLight.color.setHex(preset.hemiSky);
      this.hemiLight.groundColor.setHex(preset.hemiGround);
    }

    // 7. 스카이돔 셰이더 Uniform
    if (this.skyDomeMat) {
      this.skyDomeMat.uniforms.uTopColor.value.setHex(preset.skyTop);
      this.skyDomeMat.uniforms.uUpperMidColor.value.setHex(preset.skyUpperMid);
      this.skyDomeMat.uniforms.uLowerMidColor.value.setHex(preset.skyLowerMid);
      this.skyDomeMat.uniforms.uHorizonColor.value.setHex(preset.skyHorizon);
      this.skyDomeMat.uniforms.uSunGlowColor.value.setHex(preset.sunGlowColor);
      this.skyDomeMat.uniforms.uSunGlowStrength.value = preset.sunGlowStrength;
      this.skyDomeMat.uniforms.uSunDir.value.copy(preset.dirPos).normalize();
    }

    // 8. 볼류메트릭 구름 머티리얼
    if (this.cloudMaterial) {
      this.cloudMaterial.color.setHex(preset.cloudTopColor);
      this.cloudMaterial.emissive.setHex(preset.cloudTopEmissive);
      this.cloudMaterial.emissiveIntensity = preset.cloudEmissiveIntensity;
    }
    if (this.cloudShadowMaterial) {
      this.cloudShadowMaterial.color.setHex(preset.cloudBellyColor);
      this.cloudShadowMaterial.emissive.setHex(preset.cloudBellyEmissive);
      this.cloudShadowMaterial.emissiveIntensity = preset.cloudEmissiveIntensity * 0.7;
    }

    // 9. 천체(해/달/별)
    this.sunBaseOffset.copy(preset.sunOffset);
    if (this.sunGroup) {
      this.sunGroup.position.copy(this.sunBaseOffset);
      this.sunGroup.visible = preset.sunVisible;
      this.sunCore.material.color.setHex(preset.sunCoreColor);
      if (this.sunCorona) {
        this.sunCorona.material.color.setHex(preset.sunCoronaColor);
        this.sunCorona.scale.set(preset.sunCoronaScale, preset.sunCoronaScale, 1);
      }
      if (this.sunHorizonHalo) {
        this.sunHorizonHalo.material.color.setHex(preset.sunHorizonHaloColor);
        this.sunHorizonHalo.material.opacity = preset.sunHorizonHaloOpacity;
      }
    }

    this.moonBaseOffset.copy(preset.moonOffset);
    if (this.moonGroup) {
      this.moonGroup.position.copy(this.moonBaseOffset);
      this.moonGroup.visible = preset.moonVisible;
    }

    if (this.starPoints) {
      this.starPoints.visible = preset.starsVisible;
      (this.starPoints.material as THREE.PointsMaterial).opacity = preset.starsOpacity;
    }
  }

  public dispose(): void {
    this.weatherParticles.dispose();
  }
}
