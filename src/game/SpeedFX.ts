import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Vehicle } from './Vehicle.ts';
import { MotionBlurQuality } from '../core/GraphicsSettingsManager.ts';

/**
 * 3D 환경 방사형 줌 블러(Radial Zoom Blur) 및 고속 가속선 셰이더
 * - 차량 중심부(Center)는 100% 선명도 유지 (타원형 차체 마스킹)
 * - 주변 3D 배경 환경(노면, 가드레일, 건물, 나무, 하늘) 방사형 줌 블러 스트릭
 * - 100 km/h: 주변 배경 방사형 모션블러 시작 + 쿨 에어로 아이스블루 가속선
 * - 200 km/h: 하이퍼스피드 줌 블러 극대화 + 주변부 광학 색수차(RGB 분산) + 터널 비네트 + 크림슨/화이트 가속선
 * - 그래픽 설정(HIGH: 16샘플+색수차, MEDIUM: 8샘플 경량, OFF: 완전 비활성화)
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
        return;
      }

      vec2 toCenter = uCenter - vUv;

      // 1. 차량 형태에 최적화된 타원형 마스킹 (가로로 길고 세로로 콤팩트한 차체 보존)
      vec2 maskVec = vec2(toCenter.x * 1.0, toCenter.y * 1.55);
      float maskDist = length(maskVec);

      // 차량 및 전방 주행 시야(중앙부 0.25 이내)는 100% 선명하게 보존, 외곽만 부드러운 블러 처리
      float blurMask = smoothstep(0.24, 0.62, maskDist);
      // 고속에서만 점진적으로 블러 강도 상승 (과도한 화면 왜곡 방지)
      float totalStrength = pow(uStrength, 1.4) * blurMask * 0.14;

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

      // 2. 외곽부 미세 색수차 (170km/h 이상 초고속 시 테두리에만 은은하게 적용)
      if (uEnableChrom > 0.5 && uStrength > 0.60) {
        float chromFactor = (uStrength - 0.60) / 0.40;
        float chromOffset = maskDist * chromFactor * 0.008 * blurMask;
        vec2 chromDir = normalize(toCenter + vec2(0.0001));
        float r = texture2D(tDiffuse, clamp(vUv + chromDir * chromOffset, 0.0, 1.0)).r;
        float b = texture2D(tDiffuse, clamp(vUv - chromDir * chromOffset, 0.0, 1.0)).b;
        accumColor.r = mix(accumColor.r, r, 0.35);
        accumColor.b = mix(accumColor.b, b, 0.35);
      }

      // 3. 화면 최외곽 테두리(Periphery)에만 은은하게 흐르는 반투명 기류선 (중앙 주행 시야 침범 원천 차단)
      float edgeStreakMask = smoothstep(0.42, 0.75, maskDist);
      float angle = atan(toCenter.y, toCenter.x);

      float ray1 = fract(sin(floor(angle * 75.0) * 12.9898 + 45.1) * 43758.5453);
      float travel1 = fract(maskDist * 2.2 - uTime * (4.5 + ray1 * 3.0));
      float shape1 = smoothstep(0.0, 0.12, travel1) * smoothstep(0.55, 0.12, travel1);
      float streak1 = smoothstep(0.91, 0.985, ray1) * shape1 * 0.18 * smoothstep(0.25, 0.65, uStrength);

      float ray2 = fract(sin(floor(angle * 120.0 + 19.0) * 78.233 + 12.3) * 23421.6312);
      float travel2 = fract(maskDist * 2.8 - uTime * (6.2 + ray2 * 4.0));
      float shape2 = smoothstep(0.0, 0.10, travel2) * smoothstep(0.45, 0.10, travel2);
      float streak2 = smoothstep(0.90, 0.98, ray2) * shape2 * 0.25 * smoothstep(0.55, 0.92, uStrength);

      float totalStreak = (streak1 + streak2) * edgeStreakMask;

      vec3 colLow = vec3(0.75, 0.92, 1.0);
      vec3 colHigh = vec3(1.0, 0.85, 0.75);
      vec3 streakColor = mix(colLow, colHigh, smoothstep(0.55, 0.95, uStrength));

      vec3 finalColor = accumColor.rgb + streakColor * totalStreak;

      // 4. 주변부 고속 터널 비네트 (180km/h 이상에서 외곽만 은은하게 감싸기)
      float vignetteFactor = smoothstep(0.65, 1.0, uStrength);
      float vignette = smoothstep(1.15, 0.48, maskDist * (0.75 + vignetteFactor * 0.35));
      finalColor = mix(finalColor * (1.0 - vignetteFactor * 0.18), finalColor, vignette);

      gl_FragColor = vec4(finalColor, 1.0);
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

    // 차량 3D 위치를 2D 화면 좌표계(UV: 0.0 ~ 1.0)로 투영하여 블러 소실점 센터 실시간 동기화
    if (targetVehicle) {
      this.tempProjPos.copy(targetVehicle.position);
      this.tempProjPos.y += 0.6; // 차체 중심 높이
      this.tempProjPos.project(this.camera);

      // 카메라 전방에 있는 경우에만 유효 NDC -> UV 매핑 (후방에 있으면 기본 중앙)
      if (this.tempProjPos.z <= 1.0 && this.tempProjPos.z >= -1.0) {
        const uvX = THREE.MathUtils.clamp((this.tempProjPos.x + 1.0) * 0.5, 0.25, 0.75);
        const uvY = THREE.MathUtils.clamp((this.tempProjPos.y + 1.0) * 0.5, 0.25, 0.75);
        this.blurPass.uniforms.uCenter.value.set(uvX, uvY);
      } else {
        this.blurPass.uniforms.uCenter.value.set(0.5, 0.42);
      }
    } else {
      this.blurPass.uniforms.uCenter.value.set(0.5, 0.42);
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
