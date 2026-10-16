import * as THREE from 'three';
import { VEHICLE_MODELS, type VehicleModelId } from '../data/vehicles.ts';
import {
  createNameTagSprite,
  assembleVehicleVisuals,
} from './vehicleModels/index.ts';

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
  private static nextVehicleId = 1;
  public readonly id: number = Vehicle.nextVehicleId++;

  public mesh: THREE.Group = new THREE.Group();

  // 물리 파라미터
  public position: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  public speed: number = 0; // m/s (1 m/s = 3.6 km/h)
  public heading: number = 0; // Yaw 각도 (라디안)
  public pitch: number = 0; // Pitch 각도 (라디안, 오르막 음수 / 내리막 양수)
  public slipAngle: number = 0; // 드리프트 시 횡방향 미끄러짐 각도
  public isDrifting: boolean = false;
  public driftStamina: number = 100.0; // 스태미나 (0~100%)
  public isSpinningOut: boolean = false; // 스핀아웃 페널티 상태
  public spinoutTimer: number = 0; // 스핀아웃 지속 타이머

  // 3D 고저차 중력/서스펜션 충격 물리 상태
  public verticalVelocity: number = 0;
  public suspensionOffset: number = 0;
  public suspensionVelocity: number = 0;
  public lastLandingImpact: number = 0;

  // 바퀴 메시 레퍼런스 (회전 및 조향 애니메이션용)
  public frontLeftWheel!: THREE.Mesh;
  public frontRightWheel!: THREE.Mesh;
  public rearLeftWheel!: THREE.Mesh;
  public rearRightWheel!: THREE.Mesh;
  public brakeLightMaterial!: THREE.MeshStandardMaterial;
  public bodyMaterial!: THREE.MeshStandardMaterial;
  public currentVehicleModelId: VehicleModelId = 'gt_turbo';

  public headSpotLight!: THREE.SpotLight;
  public headTarget!: THREE.Object3D;
  public groundBeamMesh!: THREE.Mesh;
  public leftLensGlow!: THREE.Sprite;
  public rightLensGlow!: THREE.Sprite;
  public headLightMaterial!: THREE.MeshStandardMaterial;
  public leftTailPointLight!: THREE.PointLight;
  public rightTailPointLight!: THREE.PointLight;
  public tailPointLight!: THREE.PointLight;
  public headlightsEnabled: boolean = false;
  public color: string = '#ef4444';
  public driverName: string = '';
  public nameTagColor?: string;
  public nameTagSprite?: THREE.Sprite;
  private isGhost: boolean = false;
  private ghostColor: string = '#06b6d4';

  // 스펙 상수 (가변)
  private MAX_SPEED_MS = 58.3; // 약 210 km/h
  private REVERSE_MAX_SPEED_MS = -12.0; // 약 -43 km/h
  private ACCELERATION = 14.0; // m/s^2
  private BRAKING = 26.0; // m/s^2
  private DRAG = 0.45; // 공기 저항
  private readonly OFFROAD_DRAG = 2.5; // 오프로드 잔디 저항

  constructor(isGhost: boolean = false, ghostColor: string = '#06b6d4', initialVehicleModelId: VehicleModelId = 'gt_turbo') {
    this.isGhost = isGhost;
    this.ghostColor = ghostColor;
    this.currentVehicleModelId = initialVehicleModelId;
    this.mesh.rotation.order = 'YXZ';
    this.buildVehicleMesh(isGhost, ghostColor, initialVehicleModelId);
  }

  public setColor(color: string): void {
    this.color = color;
    if (this.bodyMaterial) {
      this.bodyMaterial.color.set(color);
    }
    if (this.driverName) {
      this.setNameTag(this.driverName, color);
    }
  }

  /**
   * 차량 모델 변경 (스케일 단순 조절이 아닌, 모델 고유의 독립 3D 절차적 지오메트리 동적 리빌드)
   */
  public setVehicleModel(vehicleModelId: VehicleModelId): void {
    this.currentVehicleModelId = vehicleModelId;
    const meta = VEHICLE_MODELS[vehicleModelId] || VEHICLE_MODELS['gt_turbo'];

    // 1. 기존 도색 색상 유지
    const currentColor = this.color;

    // 2. 해당 모델 고유 3D 지오메트리 빌드
    this.buildVehicleMesh(this.isGhost, this.ghostColor, vehicleModelId);
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
   * 메인 메시 조립 디스패처 (모델별 전용 절차적 지오메트리 및 듀얼 조명 시스템 동적 빌드)
   */
  private buildVehicleMesh(isGhost: boolean, ghostColor: string, vehicleModelId: VehicleModelId = this.currentVehicleModelId): void {
    const visuals = assembleVehicleVisuals(
      this.mesh,
      vehicleModelId,
      isGhost,
      ghostColor,
      this.headlightsEnabled
    );

    this.bodyMaterial = visuals.bodyMaterial;
    this.headLightMaterial = visuals.headLightMaterial;
    this.brakeLightMaterial = visuals.brakeLightMaterial;
    this.frontLeftWheel = visuals.frontLeftWheel;
    this.frontRightWheel = visuals.frontRightWheel;
    this.rearLeftWheel = visuals.rearLeftWheel;
    this.rearRightWheel = visuals.rearRightWheel;
    this.headSpotLight = visuals.headSpotLight;
    this.headTarget = visuals.headTarget;
    this.groundBeamMesh = visuals.groundBeamMesh;
    this.leftLensGlow = visuals.leftLensGlow;
    this.rightLensGlow = visuals.rightLensGlow;
    this.leftTailPointLight = visuals.leftTailPointLight;
    this.rightTailPointLight = visuals.rightTailPointLight;
    this.tailPointLight = visuals.leftTailPointLight;

    if (this.nameTagSprite) {
      this.mesh.add(this.nameTagSprite);
    }
  }

  /**
   * 프레임별 물리 시뮬레이션 업데이트 (3D 고저차 중력 가감속, 체공/착지 압축 충격 및 차체 피치 연동)
   */
  public update(
    delta: number,
    throttle: number,
    brake: number,
    steerInput: number,
    handbrake: boolean,
    isOffroad: boolean,
    groundY: number = 0.055,
    slopeSin: number = 0,
    roadPitch: number = 0
  ): void {
    this.lastLandingImpact = 0;

    // 1. 가속, 감속 및 경사면 중력 가감속(Gravity Slope Effect) 연산
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

    // 경사면 중력 성분: 오르막(slopeSin > 0) 감속 부하, 내리막(slopeSin < 0) 중력 가속
    const gravitySlopeAccel = -slopeSin * 18.5;
    if (Math.abs(this.speed) > 0.3 || throttle > 0) {
      appliedAccel += gravitySlopeAccel;
    }

    // 오프로드 잔디 감속 또는 기본 공기 저항
    const currentDrag = isOffroad ? this.OFFROAD_DRAG : this.DRAG;
    this.speed += (appliedAccel - Math.sign(this.speed) * (this.speed ** 2 * 0.005 + Math.abs(this.speed) * currentDrag)) * delta;

    // 최고 속도 클램핑 (내리막 중력 가속 시 최고속도 보너스 허용, 오르막은 중력 부하 반영)
    const slopeTopSpeedMod = slopeSin < 0 ? -slopeSin * 26.0 : -slopeSin * 10.0;
    const maxAllowedSpeed = isOffroad ? 16.7 : (this.MAX_SPEED_MS + slopeTopSpeedMod);
    this.speed = Math.max(this.REVERSE_MAX_SPEED_MS, Math.min(maxAllowedSpeed, this.speed));

    if (Math.abs(this.speed) < 0.05 && throttle === 0 && brake === 0 && Math.abs(slopeSin) < 0.02) {
      this.speed = 0;
    }

    // 2. 스태미나 기반 드리프트 및 스핀아웃 페널티 연산
    const speedRatio = Math.min(1.0, Math.abs(this.speed) / 25.0);
    const steerAngle = steerInput * (0.65 - speedRatio * 0.35);

    const isHighSpeedTurn = Math.abs(steerInput) > 0.65 && Math.abs(this.speed) > 13.0;
    const wantsDrift = (handbrake && Math.abs(this.speed) > 3.0) || isHighSpeedTurn;

    if (this.isSpinningOut) {
      this.spinoutTimer -= delta;
      this.isDrifting = true;

      // 제어 불능 스핀: 맹렬한 360도 Yaw 회전 및 급격한 속도 감쇠
      this.heading += 12.5 * delta;
      this.speed = Math.max(0, this.speed - 28.0 * delta);

      if (this.spinoutTimer <= 0) {
        this.isSpinningOut = false;
        this.spinoutTimer = 0;
        this.driftStamina = 25.0; // 회복 초기치
      }
    } else if (wantsDrift) {
      if (this.driftStamina <= 0) {
        this.isSpinningOut = true;
        this.spinoutTimer = 1.5;
        this.isDrifting = true;
      } else {
        this.isDrifting = true;
        this.driftStamina = Math.max(0, this.driftStamina - 26.0 * delta);
        if (this.driftStamina <= 0) {
          this.isSpinningOut = true;
          this.spinoutTimer = 1.5;
        }
      }
    } else {
      this.isDrifting = false;
      this.driftStamina = Math.min(100.0, this.driftStamina + 24.0 * delta);
    }

    if (!this.isSpinningOut) {
      const driftFactor = this.isDrifting ? 2.2 : 1.0;
      const turnRate = steerAngle * (this.speed / 4.0) * driftFactor;
      this.heading -= turnRate * delta;

      const targetSlip = this.isDrifting ? steerInput * 0.45 : 0;
      this.slipAngle += (targetSlip - this.slipAngle) * Math.min(1.0, 10.0 * delta);
    }

    // 3. 위치 업데이트 (경사각 코사인 투영 반영 수평 이동 + 수직 중력/서스펜션 물리)
    const moveHeading = this.heading + this.slipAngle;
    const cosSlope = Math.sqrt(Math.max(0.75, 1.0 - slopeSin * slopeSin));
    const forwardX = Math.sin(moveHeading) * cosSlope;
    const forwardZ = Math.cos(moveHeading) * cosSlope;

    this.position.x += forwardX * this.speed * delta;
    this.position.z += forwardZ * this.speed * delta;

    // 노면 목표 고도 및 주행에 따른 노면 상승/하강 수직 변화율
    const offroadJitter = isOffroad
      ? (Math.random() - 0.5) * 0.012 * Math.min(1.0, Math.abs(this.speed) / 20.0)
      : 0;
    const targetGroundY = groundY + offroadJitter;
    const surfaceVerticalRate = this.speed * slopeSin;

    if (this.position.y > targetGroundY + 0.04) {
      // 언덕 마루(Crest) 고속 통과 후 체공 상태: 중력 가속도로 낙하
      this.verticalVelocity -= 26.0 * delta;
      this.position.y += this.verticalVelocity * delta;
    }

    if (this.position.y <= targetGroundY + 0.04) {
      // 착지 또는 급경사 변곡점(Eau Rouge 등 Dip) 진입 시 수직 충격량 계산
      const impactVel = surfaceVerticalRate - this.verticalVelocity;
      if (impactVel > 1.8 && Math.abs(this.speed) > 8.0) {
        const shock = Math.min(1.0, (impactVel - 1.8) / 7.5);
        this.suspensionVelocity -= shock * 2.6;
        // 강한 착지/바닥 압축 시 하부 마찰로 인한 미세 감속
        if (shock > 0.35) {
          this.speed *= (1.0 - shock * 0.03);
        }
        this.lastLandingImpact = shock;
      }
      this.position.y += (targetGroundY - this.position.y) * Math.min(1.0, 22.0 * delta);
      this.verticalVelocity = surfaceVerticalRate;
    }

    // 스프링-댐퍼 서스펜션 바운스 시뮬레이션
    this.suspensionVelocity += (-115.0 * this.suspensionOffset - 14.0 * this.suspensionVelocity) * delta;
    this.suspensionOffset = THREE.MathUtils.clamp(
      this.suspensionOffset + this.suspensionVelocity * delta,
      -0.14,
      0.10
    );

    // 차체 피치(Pitch): 도로 경사각 + 가감속 하중 이동(Squat/Dive) + 서스펜션 진동
    const dynamicPitch = (brake * 0.035) - (throttle * 0.022) - (this.suspensionVelocity * 0.016);
    const targetPitch = roadPitch + dynamicPitch;
    this.pitch += (targetPitch - this.pitch) * Math.min(1.0, 14.0 * delta);

    // 4. 3D 메시 Transform 적용 (YXZ 오일러 순서로 Yaw -> Pitch -> Roll 정확히 반영)
    this.mesh.position.set(
      this.position.x,
      this.position.y + this.suspensionOffset,
      this.position.z
    );
    this.mesh.rotation.order = 'YXZ';
    this.mesh.rotation.y = this.heading + this.slipAngle;
    this.mesh.rotation.x = this.pitch;

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
      this.brakeLightMaterial.emissiveIntensity = isBrakingOrDrifting ? 3.2 : 0.2;
    }
    const tailIntensity = isBrakingOrDrifting ? 3.0 : 0;
    if (this.leftTailPointLight) {
      this.leftTailPointLight.intensity = tailIntensity;
    }
    if (this.rightTailPointLight) {
      this.rightTailPointLight.intensity = tailIntensity;
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
    const tailIntensity = this.isDrifting ? 3.0 : 0;
    if (this.leftTailPointLight) {
      this.leftTailPointLight.intensity = tailIntensity;
    }
    if (this.rightTailPointLight) {
      this.rightTailPointLight.intensity = tailIntensity;
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
    if (this.position.y < 0.04) {
      this.position.y = 0.055;
    }
    this.speed = 0;
    this.heading = heading;
    this.pitch = 0;
    this.slipAngle = 0;
    this.isDrifting = false;
    this.driftStamina = 100.0;
    this.isSpinningOut = false;
    this.spinoutTimer = 0;
    this.verticalVelocity = 0;
    this.suspensionOffset = 0;
    this.suspensionVelocity = 0;
    this.lastLandingImpact = 0;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.order = 'YXZ';
    this.mesh.rotation.set(0, this.heading, 0);
  }

  /**
   * 차량 상단 3D 빌보드 네임태그 생성 및 갱신
   */
  public setNameTag(driverName: string, color?: string): void {
    this.driverName = driverName;
    if (color !== undefined) {
      this.nameTagColor = color;
    }

    const wasVisible = this.nameTagSprite ? this.nameTagSprite.visible : false;
    if (this.nameTagSprite) {
      if (this.nameTagSprite.material.map) {
        this.nameTagSprite.material.map.dispose();
      }
      this.nameTagSprite.material.dispose();
      this.mesh.remove(this.nameTagSprite);
      this.nameTagSprite = undefined;
    }

    if (!driverName || typeof document === 'undefined') return;

    this.nameTagSprite = createNameTagSprite(
      driverName,
      this.nameTagColor ?? this.color,
      wasVisible
    );
    this.mesh.add(this.nameTagSprite);
  }

  public setNameTagVisible(visible: boolean): void {
    if (this.nameTagSprite && this.nameTagSprite.visible !== visible) {
      this.nameTagSprite.visible = visible;
    }
  }
}
