import * as THREE from 'three';
import { Vehicle } from './Vehicle';

/**
 * 게임 설정 마법사 Step 2용 독립 Three.js 턴테이블 3D 뷰어
 * - 부드러운 360도 연속 회전
 * - 차량 모델 및 리버리 컬러 실시간 갱신
 */
export class VehiclePreview {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private vehicle: Vehicle;
  private canvas: HTMLCanvasElement;
  private isRunning: boolean = false;
  private animId: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x13151b);

    const width = canvas.clientWidth || 380;
    const height = canvas.clientHeight || 260;

    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    this.camera.position.set(4.2, 1.8, 4.6);
    this.camera.lookAt(0, 0.35, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // 조명
    const amb = new THREE.AmbientLight(0xffffff, 0.9);
    this.scene.add(amb);

    const keyLight = new THREE.DirectionalLight(0xffedd5, 1.6);
    keyLight.position.set(5, 8, 5);
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.1);
    rimLight.position.set(-6, 5, -5);
    this.scene.add(rimLight);

    // 플로어 테크니컬 그리드
    const gridHelper = new THREE.GridHelper(7, 14, 0xc45a72, 0x272a34);
    gridHelper.position.y = -0.02;
    this.scene.add(gridHelper);

    // 차량 메시
    this.vehicle = new Vehicle(false);
    this.scene.add(this.vehicle.mesh);

    this.animate = this.animate.bind(this);
  }

  public setModel(modelId: 'gt_turbo' | 'formula_aero' | 'cyber_speedster'): void {
    this.vehicle.setModel(modelId);
  }

  public setColor(colorHex: number): void {
    this.vehicle.setColor(colorHex);
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.resize();
    this.animate();
  }

  public stop(): void {
    this.isRunning = false;
    cancelAnimationFrame(this.animId);
  }

  public resize(): void {
    const width = this.canvas.clientWidth || 380;
    const height = this.canvas.clientHeight || 260;
    if (width === 0 || height === 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private animate(): void {
    if (!this.isRunning) return;
    this.vehicle.mesh.rotation.y += 0.012; // 천천히 부드럽게 360도 회전
    this.renderer.render(this.scene, this.camera);
    this.animId = requestAnimationFrame(this.animate);
  }
}
