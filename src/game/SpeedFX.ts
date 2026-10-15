import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Vehicle } from './Vehicle.ts';

/**
 * 3D 환경 방사형 줌 블러(Radial Zoom Blur) 및 고속 가속선 셰이더
 * - 차량 중심부(Center)는 100% 선명도 유지 (타원형 차체 마스킹)
 * - 주변 3D 배경 환경(노면, 가드레일, 건물, 나무, 하늘) 방사형 줌 블러 스트릭
 * - 100 km/h: 주변 배경 방사형 모션블러 시작 + 쿨 에어로 아이스블루 가속선
 * - 200 km/h: 하이퍼스피드 줌 블러 극대화 + 주변부 광학 색수차(RGB 분산) + 터널 비네트 + 크림슨/화이트 가속선
 */
const RadialBlurShader = {
  name: 'RadialBlurShader',
  uniforms: {
    tDiffuse: { value: null },
    uCenter: { value: new THREE.Vector2(0.5, 0.42) },
    uStrength: { value: 0.0 },
    uTime: { value: 0.0 },
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
    varying vec2 vUv;

    const int SAMPLES = 16;

    void main() {
      if (uStrength <= 0.001) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }

      vec2 toCenter = uCenter - vUv;

      // 1. 차량 형태에 최적화된 타원형 마스킹 (가로로 길고 세로로 콤팩트한 차체 보존)
      vec2 maskVec = vec2(toCenter.x * 1.0, toCenter.y * 1.55);
      float maskDist = length(maskVec);

      // 차량 영역(0.08 이내)은 100% 선명하게 보존, 외곽(0.38 이상)은 완전 블러 처리
      float blurMask = smoothstep(0.08, 0.38, maskDist);
      float totalStrength = uStrength * blurMask * 0.24;

      vec2 stepVec = (toCenter / float(SAMPLES)) * totalStrength;

      vec4 accumColor = vec4(0.0);
      vec2 sampleUv = vUv;

      // 밴딩 방지 디더링 지터
      float dither = fract(sin(dot(vUv, vec2(12.9898, 78.233)) + fract(uTime) * 37.0) * 43758.5453);
      sampleUv += stepVec * (dither - 0.5);

      for (int i = 0; i < SAMPLES; i++) {
        accumColor += texture2D(tDiffuse, clamp(sampleUv, 0.0, 1.0));
        sampleUv += stepVec;
      }
      accumColor /= float(SAMPLES);

      // 2. 140km/h 이상 고속 시 외곽부 색수차 (Chromatic Aberration - 렌즈 광학 RGB 분산)
      if (uStrength > 0.38) {
        float chromFactor = (uStrength - 0.38) / 0.62;
        float chromOffset = maskDist * chromFactor * 0.016 * blurMask;
        vec2 chromDir = normalize(toCenter + vec2(0.0001));
        float r = texture2D(tDiffuse, clamp(vUv + chromDir * chromOffset, 0.0, 1.0)).r;
        float b = texture2D(tDiffuse, clamp(vUv - chromDir * chromOffset, 0.0, 1.0)).b;
        accumColor.r = mix(accumColor.r, r, 0.55);
        accumColor.b = mix(accumColor.b, b, 0.55);
      }

      // 3. 동적 방사형 속도선 (Radial Speed Lines / Wind Streaks)
      float angle = atan(toCenter.y, toCenter.x);
      
      float ray1 = fract(sin(floor(angle * 75.0) * 12.9898 + 45.1) * 43758.5453);
      float ray2 = fract(sin(floor(angle * 120.0 + 17.0) * 78.233 + 12.3) * 23421.6312);
      
      float streakTravel1 = fract(maskDist * 2.2 - uTime * (5.0 + ray1 * 4.0));
      float streakTravel2 = fract(maskDist * 3.0 - uTime * (6.5 + ray2 * 5.0));
      
      float shape1 = smoothstep(0.0, 0.12, streakTravel1) * smoothstep(0.70, 0.12, streakTravel1);
      float shape2 = smoothstep(0.0, 0.10, streakTravel2) * smoothstep(0.60, 0.10, streakTravel2);
      
      float streak1 = step(0.74, ray1) * shape1 * (ray1 - 0.74) * 3.8;
      float streak2 = step(0.80, ray2) * shape2 * (ray2 - 0.80) * 5.0;
      
      float totalStreak = (streak1 + streak2) * blurMask * uStrength;

      // 100km/h: 쿨 아이스 에어로 스카이블루 / 200km/h+: 순백색 코어 + 하이퍼 크림슨
      vec3 streakColor = mix(
        vec3(0.75, 0.92, 1.0),
        vec3(1.0, 0.35, 0.25),
        smoothstep(0.45, 0.90, uStrength)
      );

      vec3 finalColor = accumColor.rgb + streakColor * totalStreak * 1.5;

      // 4. 주변부 고속 터널 비네트 (고속 주행 집중도 극대화)
      float vignette = smoothstep(1.05, 0.38, maskDist * (0.8 + uStrength * 0.45));
      finalColor = mix(finalColor * 0.72, finalColor, vignette);

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

  /**
   * 프레임별 속도 및 차량 위치에 따른 셰이더 Uniform 갱신
   */
  public update(delta: number, speedKmh: number, targetVehicle: Vehicle | null): void {
    this.speedKmh = speedKmh;
    this.elapsedTime += delta;

    if (speedKmh < 92) {
      this.blurPass.uniforms.uStrength.value = 0.0;
      return;
    }

    // 100km/h: ~0.32 (뚜렷한 블러와 에어로 스트릭 시작)
    // 150km/h: ~0.66 (외곽 색수차 및 강한 줌 블러)
    // 200km/h+: 1.00 (맥시멈 하이퍼스피드 블러)
    let strength = 0;
    if (speedKmh < 100) {
      strength = ((speedKmh - 92) / 8.0) * 0.32;
    } else {
      strength = 0.32 + Math.min(1.0, (speedKmh - 100) / 100.0) * 0.68;
    }

    this.blurPass.uniforms.uStrength.value = strength;
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
    return this.speedKmh >= 92;
  }

  public render(): void {
    this.composer.render();
  }

  public resize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  public clear(): void {
    this.speedKmh = 0;
    this.blurPass.uniforms.uStrength.value = 0.0;
  }
}
