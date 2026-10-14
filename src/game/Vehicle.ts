import * as THREE from 'three';
import { VEHICLE_MODELS } from '../data/vehicles.ts';
import {
  VehicleMeshParams,
  VehicleWheels,
  buildGTTurboGeometry,
  buildFormulaAeroGeometry,
  buildCyberSpeedsterGeometry,
} from './vehicleModels/VehicleMeshBuilders.ts';

export interface VehiclePhysicsState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  speedKmh: number;
  steer: number;
  throttle: number;
  brake: number;
  isDrifting: boolean;
}

/**
 * Three.js 기반 아케이드 키네마틱 스포츠카 모델
 * - 절차적 Low-poly 스포츠카 메시 (외부 GLTF 의존성 없음)
 * - 가속, 감속, 엔진브레이크, 스티어링, 드리프트 슬립 시뮬레이션
 */
export class Vehicle {
  public mesh: THREE.Group = new THREE.Group();

  // 물리 파라미터
  public position: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  public speed: number = 0; // m/s (1 m/s = 3.6 km/h)
  public heading: number = 0; // Yaw 각도 (라디안)
  public slipAngle: number = 0; // 드리프트 시 횡방향 미끄러짐 각도
  public isDrifting: boolean = false;

  // 바퀴 메시 레퍼런스 (회전 및 조향 애니메이션용)
  public frontLeftWheel!: THREE.Mesh;
  public frontRightWheel!: THREE.Mesh;
  public rearLeftWheel!: THREE.Mesh;
  public rearRightWheel!: THREE.Mesh;
  private brakeLightMaterial!: THREE.MeshStandardMaterial;
  public bodyMaterial!: THREE.MeshStandardMaterial;
  public currentModelId: string = 'gt_turbo';

  public headSpotLight!: THREE.SpotLight;
  public headTarget!: THREE.Object3D;
  public groundBeamMesh!: THREE.Mesh;
  public leftLensGlow!: THREE.Sprite;
  public rightLensGlow!: THREE.Sprite;
  public headLightMaterial!: THREE.MeshStandardMaterial;
  public tailPointLight!: THREE.PointLight;
  public headlightsEnabled: boolean = true;
  public bodyColorHex: number = 0xef4444;
  private isGhost: boolean = false;
  private ghostColor: number = 0x06b6d4;

  // 스펙 상수 (가변)
  private MAX_SPEED_MS = 58.3; // 약 210 km/h
  private REVERSE_MAX_SPEED_MS = -12.0; // 약 -43 km/h
  private ACCELERATION = 14.0; // m/s^2
  private BRAKING = 26.0; // m/s^2
  private DRAG = 0.45; // 공기 저항
  private readonly OFFROAD_DRAG = 2.5; // 오프로드 잔디 저항

  constructor(isGhost: boolean = false, ghostColor: number = 0x06b6d4, initialModel: 'gt_turbo' | 'formula_aero' | 'cyber_speedster' = 'gt_turbo') {
    this.isGhost = isGhost;
    this.ghostColor = ghostColor;
    this.currentModelId = initialModel;
    this.buildCarMesh(isGhost, ghostColor, initialModel);
  }

  public setColor(colorHex: number): void {
    this.bodyColorHex = colorHex;
    if (this.bodyMaterial) {
      this.bodyMaterial.color.setHex(colorHex);
    }
  }

  /**
   * 차량 모델 변경 (스케일 단순 조절이 아닌, 모델 고유의 독립 3D 절차적 지오메트리 동적 리빌드)
   */
  public setModel(modelId: 'gt_turbo' | 'formula_aero' | 'cyber_speedster'): void {
    this.currentModelId = modelId;
    const meta = VEHICLE_MODELS[modelId] || VEHICLE_MODELS['gt_turbo'];

    // 1. 기존 도색 색상 유지
    const currentColor = this.bodyMaterial ? this.bodyMaterial.color.getHex() : 0xef4444;

    // 2. 해당 모델 고유 3D 지오메트리 빌드
    this.buildCarMesh(this.isGhost, this.ghostColor, modelId);
    this.setColor(currentColor);

    // 3. 메타데이터 기반 물리 스펙 및 스케일 정규화 동기화
    this.ACCELERATION = meta.acceleration;
    this.MAX_SPEED_MS = meta.maxSpeedMs;
    this.BRAKING = meta.braking || 26.0;
    this.DRAG = meta.drag || 0.45;
    this.mesh.scale.set(1.0, 1.0, 1.0); // 고유 지오메트리 구현으로 스케일 왜곡 제거

    // 4. 헤드라이트 상태 동기화
    if (this.headlightsEnabled) {
      this.setHeadlights(true);
    }
  }

  /**
   * 메인 메시 조립 디스패처 (기존 메시 자식 청소 후 모델별 전용 지오메트리 생성)
   */
  private buildCarMesh(isGhost: boolean, ghostColor: number, modelId: string = this.currentModelId): void {
    // 기존 자식 메시 클린업
    while (this.mesh.children.length > 0) {
      this.mesh.remove(this.mesh.children[0]);
    }

    // 1. 공통 머티리얼 정의 (Low-poly 각진 면이 돋보이도록 flatShading 적용)
    this.bodyMaterial = isGhost
      ? new THREE.MeshStandardMaterial({
          color: ghostColor,
          transparent: true,
          opacity: 0.35,
          roughness: 0.15,
          metalness: 0.8,
          emissive: ghostColor,
          emissiveIntensity: 0.65,
          flatShading: true,
        })
      : new THREE.MeshPhysicalMaterial({
          color: 0xef4444, // 기본 스포츠 레드
          roughness: 0.2,
          metalness: 0.65,
          clearcoat: 1.0,
          clearcoatRoughness: 0.08,
          flatShading: true, // 각진 폴리곤 면 하이라이트 강조
        });

    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.5,
      metalness: 0.4,
      transparent: isGhost,
      opacity: isGhost ? 0.25 : 1.0,
      flatShading: true,
    });

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: isGhost ? ghostColor : 0x0f172a,
      roughness: 0.08,
      metalness: 0.9,
      clearcoat: 1.0,
      transparent: true,
      opacity: isGhost ? 0.2 : 0.88,
      flatShading: true,
    });

    const headLightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: isGhost ? ghostColor : 0xffffff,
      emissiveIntensity: isGhost ? 2.0 : 3.2,
    });
    this.headLightMaterial = headLightMat;

    this.brakeLightMaterial = new THREE.MeshStandardMaterial({
      color: isGhost ? ghostColor : 0xdc2626,
      emissive: isGhost ? ghostColor : 0xef4444,
      emissiveIntensity: 1.5,
    });

    // 고스트 차량 전용 홀로그램 와이어프레임 헬퍼 함수
    const addHoloEdges = (mesh: THREE.Mesh, opacity = 0.65) => {
      if (!isGhost) return;
      const edges = new THREE.EdgesGeometry(mesh.geometry, 18);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x67e8f9,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
      });
      mesh.add(new THREE.LineSegments(edges, lineMat));
    };

    // 2. 모델별 전용 3D 지오메트리 빌드 (모듈화된 VehicleMeshBuilders 사용)
    const meshParams: VehicleMeshParams = {
      rootGroup: this.mesh,
      bodyMat: this.bodyMaterial,
      darkMat,
      glassMat,
      headLightMat,
      brakeLightMat: this.brakeLightMaterial,
      isGhost,
      ghostColor,
      addHoloEdges,
    };

    let wheels: VehicleWheels;
    if (modelId === 'formula_aero') {
      wheels = buildFormulaAeroGeometry(meshParams);
    } else if (modelId === 'cyber_speedster') {
      wheels = buildCyberSpeedsterGeometry(meshParams);
    } else {
      wheels = buildGTTurboGeometry(meshParams);
    }

    this.frontLeftWheel = wheels.frontLeftWheel;
    this.frontRightWheel = wheels.frontRightWheel;
    this.rearLeftWheel = wheels.rearLeftWheel;
    this.rearRightWheel = wheels.rearRightWheel;

    // 3. 메타데이터 좌표 기반 전방 스포트라이트, 볼류메트릭 빔 및 후방 조명 세팅
    const meta = VEHICLE_MODELS[modelId] || VEHICLE_MODELS['gt_turbo'];
    this.setupLighting(
      new THREE.Vector3(...meta.headlightPos.left),
      new THREE.Vector3(...meta.headlightPos.right),
      new THREE.Vector3(...meta.tailLightPos),
      isGhost,
      ghostColor
    );
  }

  /**
   * 전방 스포트라이트, 볼류메트릭 빔 콘 및 리어 포인트 라이트 공통 바인딩
   */
  private setupLighting(
    leftHeadPos: THREE.Vector3,
    rightHeadPos: THREE.Vector3,
    tailPos: THREE.Vector3,
    isGhost: boolean,
    ghostColor: number
  ): void {
    // 1. 전방 고성능 스포트라이트 (차량 전면 중앙에서 노면 전방으로 뻗어 나가는 단일 고성능 빔)
    const centerHeadY = (leftHeadPos.y + rightHeadPos.y) * 0.5;
    const centerHeadZ = (leftHeadPos.z + rightHeadPos.z) * 0.5;

    this.headSpotLight = new THREE.SpotLight(0xfffbeb, 0, 55, Math.PI / 3.4, 0.75, 1.2);
    this.headSpotLight.position.set(0, centerHeadY, centerHeadZ);
    this.headTarget = new THREE.Object3D();
    this.headTarget.position.set(0, 0.05, 30.0);
    this.mesh.add(this.headSpotLight, this.headTarget);
    this.headSpotLight.target = this.headTarget;

    // 2. 차량 정면에서 바라볼 때 선명하게 빛나는 듀얼 LED 프로젝터 렌즈 플레어
    this.leftLensGlow = this.createLensGlowSprite();
    this.leftLensGlow.position.set(leftHeadPos.x, leftHeadPos.y, leftHeadPos.z + 0.08);
    this.leftLensGlow.visible = this.headlightsEnabled;
    this.mesh.add(this.leftLensGlow);

    this.rightLensGlow = this.createLensGlowSprite();
    this.rightLensGlow.position.set(rightHeadPos.x, rightHeadPos.y, rightHeadPos.z + 0.08);
    this.rightLensGlow.visible = this.headlightsEnabled;
    this.mesh.add(this.rightLensGlow);

    // 3. 전방 아스팔트 노면 헤드라이트 투사 빔 (두 갈래 분할 없이 하나로 비추는 단일 일루미네이션 카펫)
    this.groundBeamMesh = this.createGroundBeamMesh();
    this.groundBeamMesh.visible = this.headlightsEnabled;
    this.mesh.add(this.groundBeamMesh);

    if (this.headlightsEnabled) {
      this.headSpotLight.intensity = 55.0;
    }

    // 4. 후방 레드 포인트 라이트 (평소에는 0으로 꺼져 있고, 브레이크/드리프트 시에만 점등)
    this.tailPointLight = new THREE.PointLight(0xef4444, 0, 10, 1.5);
    this.tailPointLight.position.copy(tailPos);
    this.mesh.add(this.tailPointLight);
  }

  private createLensGlowSprite(): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // 차량 정면에서 직접 바라볼 때 선명한 듀얼 LED 프로젝터 코어 & 광배
      const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 60);
      grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
      grad.addColorStop(0.18, 'rgba(254, 243, 199, 0.95)');
      grad.addColorStop(0.45, 'rgba(186, 230, 253, 0.45)');
      grad.addColorStop(0.75, 'rgba(125, 211, 252, 0.12)');
      grad.addColorStop(1.0, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(64, 64, 60, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.75, 0.75, 1.0);
    return sprite;
  }

  private createGroundBeamMesh(): THREE.Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 512, 512);

      // 차량 전방 도로 전체를 하나로 자연스럽게 비추는 단일(Unified) 로드 일루미네이션 광선
      // 두 갈래(줄기)로 나뉘지 않고 범퍼 전방 노면 전체를 하나로 부드럽게 밝힘
      const grad = ctx.createRadialGradient(256, 30, 10, 256, 260, 250);
      grad.addColorStop(0.0, 'rgba(255, 255, 250, 0.65)');
      grad.addColorStop(0.25, 'rgba(254, 243, 199, 0.38)');
      grad.addColorStop(0.55, 'rgba(224, 242, 254, 0.16)');
      grad.addColorStop(0.80, 'rgba(186, 230, 253, 0.05)');
      grad.addColorStop(1.0, 'rgba(147, 197, 253, 0)');

      ctx.save();
      ctx.fillStyle = grad;
      ctx.beginPath();
      // 차량 전방 범퍼 폭(약 2m)에서 전방 30m 노면으로 고르게 퍼지는 단일 부채꼴
      ctx.moveTo(180, 20);
      ctx.lineTo(332, 20);
      ctx.bezierCurveTo(385, 160, 420, 310, 435, 490);
      ctx.lineTo(77, 490);
      ctx.bezierCurveTo(92, 310, 127, 160, 180, 20);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 전방 도로 중앙 핫스팟 (단일 중앙 집중 광선 - 두 갈래 분할 완전 제거)
      const gradCenter = ctx.createRadialGradient(256, 170, 10, 256, 210, 150);
      gradCenter.addColorStop(0.0, 'rgba(255, 255, 255, 0.50)');
      gradCenter.addColorStop(0.35, 'rgba(254, 249, 195, 0.22)');
      gradCenter.addColorStop(0.70, 'rgba(224, 242, 254, 0.06)');
      gradCenter.addColorStop(1.0, 'rgba(186, 230, 253, 0)');

      ctx.save();
      ctx.fillStyle = gradCenter;
      ctx.beginPath();
      ctx.ellipse(256, 210, 100, 160, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const tex = new THREE.CanvasTexture(canvas);
    const geom = new THREE.PlaneGeometry(8.5, 32);
    geom.rotateX(-Math.PI / 2);
    geom.translate(0, 0.04, 16.5);

    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    return new THREE.Mesh(geom, mat);
  }


  /**
   * [스타일 2] formula_aero: 오픈휠 포뮬러 F1 머신 스타일
   * - 슬림한 노즈 콘, 좌우 사이드포드, 드라이버 헤일로(Halo), 노출형 서스펜션 암, 광폭 슬릭 타이어
   */
  /**
   * 프레임별 물리 시뮬레이션 업데이트
   */
  public update(
    delta: number,
    throttle: number,
    brake: number,
    steerInput: number,
    handbrake: boolean,
    isOffroad: boolean
  ): void {
    // 1. 가속 및 감속 연산
    let appliedAccel = 0;
    if (throttle > 0) {
      // 속도가 오를수록 가속도 완만하게 감소 (토크 곡선)
      const powerCurve = Math.max(0.2, 1.0 - (this.speed / this.MAX_SPEED_MS));
      appliedAccel += throttle * this.ACCELERATION * powerCurve;
    }

    if (brake > 0) {
      if (this.speed > 0.5) {
        appliedAccel -= brake * this.BRAKING; // 감속
      } else {
        appliedAccel -= brake * (this.ACCELERATION * 0.6); // 후진 기어
      }
    }

    // 오프로드 잔디 감속 또는 기본 공기 저항
    const currentDrag = isOffroad ? this.OFFROAD_DRAG : this.DRAG;
    this.speed += (appliedAccel - Math.sign(this.speed) * (this.speed ** 2 * 0.005 + Math.abs(this.speed) * currentDrag)) * delta;

    // 최고 속도 클램핑
    const maxAllowedSpeed = isOffroad ? 16.7 : this.MAX_SPEED_MS; // 오프로드 60km/h 제한
    this.speed = Math.max(this.REVERSE_MAX_SPEED_MS, Math.min(maxAllowedSpeed, this.speed));

    if (Math.abs(this.speed) < 0.05 && throttle === 0 && brake === 0) {
      this.speed = 0;
    }

    // 2. 조향 및 드리프트 연산
    // 고속일수록 조향각을 줄여 스티어링 락 안정화
    const speedRatio = Math.min(1.0, Math.abs(this.speed) / 25.0);
    const steerAngle = steerInput * (0.65 - speedRatio * 0.35);

    // 드리프트 판정 (핸드브레이크 또는 급선회 슬립)
    const isHighSpeedTurn = Math.abs(steerInput) > 0.6 && Math.abs(this.speed) > 12.0;
    this.isDrifting = (handbrake && Math.abs(this.speed) > 2.5) || isHighSpeedTurn;

    const driftFactor = this.isDrifting ? 2.2 : 1.0;
    const turnRate = steerAngle * (this.speed / 4.0) * driftFactor;
    // 우회전 시 heading 감소(-), 좌회전 시 heading 증가(+)로 정상 조향
    this.heading -= turnRate * delta;

    // 드리프트 시 차체 슬립 각도
    const targetSlip = this.isDrifting ? steerInput * 0.45 : 0;
    this.slipAngle += (targetSlip - this.slipAngle) * Math.min(1.0, 10.0 * delta);

    // 3. 위치 업데이트 (주행 방향 벡터)
    const moveHeading = this.heading + this.slipAngle;
    const forwardX = Math.sin(moveHeading);
    const forwardZ = Math.cos(moveHeading);

    this.position.x += forwardX * this.speed * delta;
    this.position.z += forwardZ * this.speed * delta;

    // 지면 접지 서스펜션: 온로드 0.055m 밀착, 오프로드 잔디 진동 반영
    const targetY = isOffroad
      ? 0.02 + (Math.random() - 0.5) * 0.008 * Math.min(1.0, Math.abs(this.speed) / 20.0)
      : 0.055;
    this.position.y += (targetY - this.position.y) * Math.min(1.0, 18.0 * delta);

    // 4. 3D 메시 Transform 적용
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.heading + this.slipAngle;

    // 드리프트/급선회 시 차체 롤링(기울기)
    const targetRoll = steerInput * Math.min(0.08, (Math.abs(this.speed) / 40.0) * 0.08);
    this.mesh.rotation.z = targetRoll;

    // 5. 바퀴 애니메이션
    const wheelRotSpeed = (this.speed / 0.38) * delta;
    this.frontLeftWheel.rotation.x += wheelRotSpeed;
    this.frontRightWheel.rotation.x += wheelRotSpeed;
    this.rearLeftWheel.rotation.x += wheelRotSpeed;
    this.rearRightWheel.rotation.x += wheelRotSpeed;

    // 앞바퀴 조향 각도 적용 (조향 방향과 일치하도록 -steerAngle 적용)
    this.frontLeftWheel.rotation.y = -steerAngle;
    this.frontRightWheel.rotation.y = -steerAngle;

    // 6. 브레이크등 및 후방 조명 발광 (평소에는 완전히 꺼지고, 브레이크 또는 드리프트 시에만 점등!)
    const isBraking = brake > 0.1 || handbrake;
    const isBrakingOrDrifting = isBraking || this.isDrifting;
    if (this.brakeLightMaterial) {
      this.brakeLightMaterial.emissiveIntensity = isBrakingOrDrifting ? 3.2 : 0.4;
    }
    if (this.tailPointLight) {
      this.tailPointLight.intensity = isBrakingOrDrifting ? 3.5 : 0;
    }
  }

  public setHeadlights(enabled: boolean): void {
    this.headlightsEnabled = enabled;
    const spotIntensity = enabled ? 55.0 : 0;
    if (this.headSpotLight) this.headSpotLight.intensity = spotIntensity;
    if (this.leftLensGlow) this.leftLensGlow.visible = enabled;
    if (this.rightLensGlow) this.rightLensGlow.visible = enabled;
    if (this.groundBeamMesh) this.groundBeamMesh.visible = enabled;
    if (this.headLightMaterial) {
      this.headLightMaterial.emissiveIntensity = enabled ? 4.5 : 0.4;
    }
    // 후방 레드 포인트 라이트는 브레이크/드리프트 전용이므로 평소에는 0 유지!
    if (this.tailPointLight) {
      this.tailPointLight.intensity = this.isDrifting ? 3.5 : 0;
    }
  }

  public toggleHeadlights(): boolean {
    this.setHeadlights(!this.headlightsEnabled);
    return this.headlightsEnabled;
  }

  public getRearWheelWorldPositions(): { left: THREE.Vector3; right: THREE.Vector3 } {
    const left = new THREE.Vector3();
    const right = new THREE.Vector3();
    this.rearLeftWheel.getWorldPosition(left);
    this.rearRightWheel.getWorldPosition(right);
    return { left, right };
  }

  public getSpeedKmh(): number {
    return Math.abs(this.speed * 3.6);
  }

  public reset(pos: THREE.Vector3, heading: number = 0): void {
    this.position.copy(pos);
    if (this.position.y < 0.04 || this.position.y > 0.1) {
      this.position.y = 0.055;
    }
    this.speed = 0;
    this.heading = heading;
    this.slipAngle = 0;
    this.isDrifting = false;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.set(0, this.heading, 0);
  }
}
