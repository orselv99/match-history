import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Vehicle } from './Vehicle.ts';
import { MotionBlurQuality } from '../core/GraphicsSettingsManager.ts';

/**
 * 3D 환경 외곽 방사형 모션 블러(Radial Motion Blur) 셰이더
 * - 인위적인 2D 속도선(하얀 선)을 완전히 제거하고 순수 광학 효과만으로 속도감 연출
 * - 차량 및 전방 주행 시야(중앙부)는 100% 선명하게 보존
 * - 화면 외곽 배경(노면 가장자리, 연석, 건물, 나무)만 속도에 비례해 부드럽게 뒤로 흐르는 모션 블러 적용
 */
const RadialBlurShader = {
  name: 'RadialBlurShader',
  uniforms: {
    tDiffuse: { value: null },
    uCenter: { value: new THREE.Vector2(0.5, 0.42) },
    uStrength: { value: 0.0 },
    uTime: { value: 0.0 },
    uSamples: { value: 16 },
    uEnableChrom: { value: 1.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uCenter;
    uniform float uStrength;
    uniform float uTime;
    uniform int uSamples;
    uniform float uEnableChrom;
    varying vec2 vUv;

    void main() {
      if (uStrength <= 0.001) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        return;
      }

      vec2 toCenter = uCenter - vUv;

      // 1. 차량 중심(uCenter)을 기준으로 차체 영역(0.07 이내)만 선명하게 보존하고, 차량 바로 주변부터 방사형 블러 생성
      vec2 maskVec = vec2(toCenter.x * 1.15, toCenter.y * 1.65);
      float maskDist = length(maskVec);

      float blurMask = smoothstep(0.07, 0.34, maskDist);
      float totalStrength = pow(uStrength, 1.25) * blurMask * 0.20;

      float sampleCount = float(clamp(uSamples, 4, 16));
      vec2 stepVec = (toCenter / sampleCount) * totalStrength;

      vec4 accumColor = vec4(0.0);
      vec2 sampleUv = vUv;

      // 밴딩 방지 디더링 지터
      float dither = fract(sin(dot(vUv, vec2(12.9898, 78.233)) + fract(uTime) * 37.0) * 43758.5453);
      sampleUv += stepVec * (dither - 0.5);

      for (int i = 0; i < 16; i++) {
        if (float(i) >= sampleCount) break;
        accumColor += texture2D(tDiffuse, clamp(sampleUv, 0.0, 1.0));
        sampleUv += stepVec;
      }
      accumColor /= sampleCount;

      // 2. 차량 중심 방사형 미세 광학 색수차 (165km/h 이상 초고속 시)
      if (uEnableChrom > 0.5 && uStrength > 0.58) {
        float chromFactor = (uStrength - 0.58) / 0.42;
        float chromOffset = maskDist * chromFactor * 0.007 * blurMask;
        vec2 chromDir = normalize(toCenter + vec2(0.0001));
        float r = texture2D(tDiffuse, clamp(vUv + chromDir * chromOffset, 0.0, 1.0)).r;
        float b = texture2D(tDiffuse, clamp(vUv - chromDir * chromOffset, 0.0, 1.0)).b;
        accumColor.r = mix(accumColor.r, r, 0.32);
        accumColor.b = mix(accumColor.b, b, 0.32);
      }

      vec3 finalColor = accumColor.rgb;

      // 3. 주변부 고속 터널 비네트 (180km/h 이상에서 외곽만 자연스럽게 포커싱)
      float vignetteFactor = smoothstep(0.65, 1.0, uStrength);
      float vignette = smoothstep(1.18, 0.50, maskDist * (0.75 + vignetteFactor * 0.30));
      finalColor = mix(finalColor * (1.0 - vignetteFactor * 0.15), finalColor, vignette);

      gl_FragColor = vec4(finalColor, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `
};

/**
 * 고속 주행 시각화 효과 매니저 (SpeedFX)
 * - 3D 씬을 Post-Processing 렌더 타깃에 담아 차량 중심을 제외한 주변부 환경을 방사형 줌 블러 처리
 */
export class SpeedFX {
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private blurPass: ShaderPass;
  private camera: THREE.PerspectiveCamera;
  private speedKmh: number = 0;
  private elapsedTime: number = 0;
  private tempProjPos: THREE.Vector3 = new THREE.Vector3();
  private quality: MotionBlurQuality = 'HIGH';
  private smoothStrength: number = 0;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.camera = camera;

    const size = renderer.getSize(new THREE.Vector2());
    const pixelRatio = renderer.getPixelRatio();
    const renderTarget = new THREE.WebGLRenderTarget(
      Math.max(1, Math.floor(size.width * pixelRatio)),
      Math.max(1, Math.floor(size.height * pixelRatio)),
      {
        type: THREE.HalfFloatType,
        samples: 4,
      }
    );

    this.composer = new EffectComposer(renderer, renderTarget);
    this.composer.setPixelRatio(pixelRatio);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    this.blurPass = new ShaderPass(RadialBlurShader);
    this.blurPass.renderToScreen = true;
    this.composer.addPass(this.blurPass);
  }

  public setQuality(quality: MotionBlurQuality): void {
    this.quality = quality;
    if (quality === 'MEDIUM') {
      this.blurPass.uniforms.uSamples.value = 8;
      this.blurPass.uniforms.uEnableChrom.value = 0.0;
    } else if (quality === 'HIGH') {
      this.blurPass.uniforms.uSamples.value = 16;
      this.blurPass.uniforms.uEnableChrom.value = 1.0;
    }
  }

  /**
   * 프레임별 속도 및 차량 위치에 따른 셰이더 Uniform 갱신
   * - 5단계 속도별 목표 강도 세분화 (70 -> 110 -> 155 -> 195+ km/h)
   * - 프레임 간 지수 보간 스무딩으로 뚝뚝 끊기는 어색함 완전 해소
   */
  public update(delta: number, speedKmh: number, targetVehicle: Vehicle | null): void {
    this.speedKmh = speedKmh;
    this.elapsedTime += delta;

    // 5단계 속도별 목표 강도 세분화 (부드러운 smoothstep S-커브 전환)
    let targetStrength = 0;
    if (this.quality === 'OFF' || speedKmh < 70) {
      targetStrength = 0;
    } else if (speedKmh < 110) {
      // [1단계: 70 ~ 110 km/h] 0.0 ~ 0.20 (미세한 바람결 기류선 페이드인)
      targetStrength = THREE.MathUtils.smoothstep(speedKmh, 70, 110) * 0.20;
    } else if (speedKmh < 155) {
      // [2단계: 110 ~ 155 km/h] 0.20 ~ 0.50 (선명한 네온 가속선 & 가벼운 줌블러)
      targetStrength = 0.20 + THREE.MathUtils.smoothstep(speedKmh, 110, 155) * 0.30;
    } else if (speedKmh < 195) {
      // [3단계: 155 ~ 195 km/h] 0.50 ~ 0.78 (하이스피드 레이싱 블러 & 색수차)
      targetStrength = 0.50 + THREE.MathUtils.smoothstep(speedKmh, 155, 195) * 0.28;
    } else {
      // [4단계: 195 km/h+] 0.78 ~ 1.00 (초고속 하이퍼스피드 터널 비네트)
      targetStrength = 0.78 + Math.min(1.0, (speedKmh - 195) / 45.0) * 0.22;
    }

    // 뚝뚝 끊김 완전 제거: 프레임 간 지수 보간 스무딩 (Exponential Lerp Smoothing)
    this.smoothStrength = THREE.MathUtils.lerp(
      this.smoothStrength,
      targetStrength,
      Math.min(1.0, 7.5 * delta)
    );

    this.blurPass.uniforms.uStrength.value = this.smoothStrength;
    this.blurPass.uniforms.uTime.value = this.elapsedTime;

    // 차량 3D 위치를 2D 화면 좌표계(UV: 0.0 ~ 1.0)로 투영하여 블러 소실점 센터를 차량 중심에 정확히 동기화
    if (targetVehicle) {
      this.camera.updateMatrixWorld();
      this.tempProjPos.copy(targetVehicle.position);
      this.tempProjPos.y += 0.55; // 차체 중심 높이
      this.tempProjPos.project(this.camera);

      // 카메라 전방에 있는 경우에만 유효 NDC -> UV 매핑 (후방에 있으면 기본 중앙)
      if (this.tempProjPos.z <= 1.0 && this.tempProjPos.z >= -1.0) {
        const uvX = THREE.MathUtils.clamp((this.tempProjPos.x + 1.0) * 0.5, 0.15, 0.85);
        const uvY = THREE.MathUtils.clamp((this.tempProjPos.y + 1.0) * 0.5, 0.15, 0.85);
        this.blurPass.uniforms.uCenter.value.set(uvX, uvY);
      } else {
        this.blurPass.uniforms.uCenter.value.set(0.5, 0.36);
      }
    } else {
      this.blurPass.uniforms.uCenter.value.set(0.5, 0.36);
    }
  }

  public isActive(): boolean {
    if (this.quality === 'OFF') return false;
    return this.smoothStrength > 0.005;
  }

  public render(): void {
    this.composer.render();
  }

  public resize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  public clear(): void {
    this.speedKmh = 0;
    this.smoothStrength = 0;
    this.blurPass.uniforms.uStrength.value = 0.0;
  }
}
