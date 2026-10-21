import * as THREE from 'three';
import { SpeedFX } from '../../game/SpeedFX.ts';
import { GraphicsSettings, graphicsSettingsManager } from '../GraphicsSettingsManager.ts';

/**
 * Three.js 렌더링 파이프라인 전담 엔진 (Scene, Camera, WebGLRenderer, Resize, Graphics)
 */
export class RenderEngine {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public speedFX: SpeedFX;
  public container: HTMLElement;

  constructor(container: HTMLElement, initialFov: number = 65) {
    this.container = container;

    // 1. 씬 생성
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x121316);
    this.scene.fog = new THREE.FogExp2(0x121316, 0.0035);

    const initWidth = Math.max(container.clientWidth || window.innerWidth, 1088);
    const initHeight = Math.max(container.clientHeight || window.innerHeight, 612);

    // 2. 카메라
    this.camera = new THREE.PerspectiveCamera(initialFov, initWidth / initHeight, 0.1, 1000);

    // 3. 렌더러
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(initWidth, initHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    // 4. 고속 블러 및 모션 FX
    this.speedFX = new SpeedFX(this.renderer, this.scene, this.camera);
  }

  /**
   * 브라우저 뷰포트 크기 변화 및 전체화면 변경 시 캔버스 해상도 재계산
   */
  public handleResize(): void {
    const rawWidth = this.container.clientWidth || window.innerWidth;
    const rawHeight = this.container.clientHeight || window.innerHeight;
    const width = Math.max(rawWidth, 1088);
    const height = Math.max(rawHeight, 612);
    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);

    const settings = graphicsSettingsManager.getSettings();
    const targetRatio = settings.resolution === 'HIGH'
      ? Math.min(window.devicePixelRatio || 1, 2.0)
      : settings.resolution === 'MEDIUM'
        ? Math.min(window.devicePixelRatio || 1, 1.25)
        : 1.0;
    this.renderer.setPixelRatio(targetRatio);
    this.speedFX.resize(width, height);

    const isFullscreen = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
    document.documentElement.classList.toggle('is-fullscreen', isFullscreen);
  }

  /**
   * 그래픽 세팅(해상도, 그림자 맵, 모션블러 등) 동적 적용
   */
  public applyGraphicsSettings(settings: GraphicsSettings): void {
    const targetRatio = settings.resolution === 'HIGH'
      ? Math.min(window.devicePixelRatio || 1, 2.0)
      : settings.resolution === 'MEDIUM'
        ? Math.min(window.devicePixelRatio || 1, 1.25)
        : 1.0;
    this.renderer.setPixelRatio(targetRatio);

    const shadowsEnabled = settings.shadows !== 'OFF';
    this.renderer.shadowMap.enabled = shadowsEnabled;
    this.renderer.shadowMap.needsUpdate = true;

    this.speedFX.setQuality(settings.motionBlur);
  }

  /**
   * 프레임 렌더링 실행
   */
  public renderFrame(): void {
    this.renderer.setViewport(0, 0, this.renderer.domElement.width, this.renderer.domElement.height);
    if (this.speedFX.isActive()) {
      this.speedFX.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
