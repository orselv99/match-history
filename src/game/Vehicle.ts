import * as THREE from 'three';

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
  private frontLeftWheel!: THREE.Mesh;
  private frontRightWheel!: THREE.Mesh;
  private rearLeftWheel!: THREE.Mesh;
  private rearRightWheel!: THREE.Mesh;
  private brakeLightMaterial!: THREE.MeshStandardMaterial;
  public bodyMaterial!: THREE.MeshStandardMaterial;
  public currentModelId: string = 'gt_turbo';

  // 스펙 상수 (가변)
  private MAX_SPEED_MS = 58.3; // 약 210 km/h
  private REVERSE_MAX_SPEED_MS = -12.0; // 약 -43 km/h
  private ACCELERATION = 14.0; // m/s^2
  private BRAKING = 26.0; // m/s^2
  private readonly DRAG = 0.45; // 공기 저항
  private readonly OFFROAD_DRAG = 2.5; // 오프로드 잔디 저항

  constructor(isGhost: boolean = false, ghostColor: number = 0x06b6d4) {
    this.buildCarMesh(isGhost, ghostColor);
  }

  public setColor(colorHex: number): void {
    if (this.bodyMaterial) {
      this.bodyMaterial.color.setHex(colorHex);
    }
  }

  public setModel(modelId: 'gt_turbo' | 'formula_aero' | 'cyber_speedster'): void {
    this.currentModelId = modelId;
    if (modelId === 'formula_aero') {
      // 포뮬러 머신: 가볍고 날렵한 조향, 초고속 가속
      this.mesh.scale.set(0.92, 0.75, 1.05);
      this.ACCELERATION = 17.5;
      this.MAX_SPEED_MS = 62.5; // 225 km/h
    } else if (modelId === 'cyber_speedster') {
      // 사이버 스피드스터: 최고속 지향 하이퍼카
      this.mesh.scale.set(1.05, 0.85, 1.12);
      this.ACCELERATION = 15.5;
      this.MAX_SPEED_MS = 66.7; // 240 km/h
    } else {
      // GT 터보 (기본)
      this.mesh.scale.set(1.0, 1.0, 1.0);
      this.ACCELERATION = 14.0;
      this.MAX_SPEED_MS = 58.3;
    }
  }

  private buildCarMesh(isGhost: boolean, ghostColor: number): void {
    this.bodyMaterial = isGhost
      ? new THREE.MeshStandardMaterial({
          color: ghostColor,
          transparent: true,
          opacity: 0.45,
          wireframe: false,
          roughness: 0.2,
          emissive: ghostColor,
          emissiveIntensity: 0.3,
        })
      : new THREE.MeshStandardMaterial({
          color: 0xef4444, // 강렬한 스포츠 레드
          roughness: 0.25,
          metalness: 0.7,
        });

    const bodyMat = this.bodyMaterial;


    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.5,
      transparent: isGhost,
      opacity: isGhost ? 0.3 : 1.0,
    });

    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.1,
      metalness: 0.9,
      transparent: true,
      opacity: isGhost ? 0.2 : 0.75,
    });

    // 1. 차체 하단 (샤시)
    const chassisGeom = new THREE.BoxGeometry(2.1, 0.5, 4.4);
    const chassis = new THREE.Mesh(chassisGeom, bodyMat);
    chassis.position.y = 0.5;
    chassis.castShadow = !isGhost;
    this.mesh.add(chassis);

    // 2. 캐빈 (루프 및 유리창)
    const cabinGeom = new THREE.BoxGeometry(1.7, 0.45, 2.2);
    const cabin = new THREE.Mesh(cabinGeom, glassMat);
    cabin.position.set(0, 0.95, -0.2);
    this.mesh.add(cabin);

    // 루프 상단
    const roofGeom = new THREE.BoxGeometry(1.65, 0.1, 1.8);
    const roof = new THREE.Mesh(roofGeom, bodyMat);
    roof.position.set(0, 1.2, -0.2);
    this.mesh.add(roof);

    // 3. 리어 윙 (스포일러)
    const wingGeom = new THREE.BoxGeometry(2.0, 0.08, 0.4);
    const wing = new THREE.Mesh(wingGeom, darkMat);
    wing.position.set(0, 1.05, -2.0);
    this.mesh.add(wing);

    // 윙 지지대
    const strutGeom = new THREE.BoxGeometry(0.08, 0.35, 0.1);
    const leftStrut = new THREE.Mesh(strutGeom, darkMat);
    leftStrut.position.set(-0.7, 0.85, -2.0);
    const rightStrut = new THREE.Mesh(strutGeom, darkMat);
    rightStrut.position.set(0.7, 0.85, -2.0);
    this.mesh.add(leftStrut);
    this.mesh.add(rightStrut);

    // 4. 헤드라이트 (LED 네온 화이트)
    const lightGeom = new THREE.BoxGeometry(0.4, 0.15, 0.1);
    const headLightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 1.5,
    });
    const leftLight = new THREE.Mesh(lightGeom, headLightMat);
    leftLight.position.set(-0.75, 0.5, 2.2);
    const rightLight = new THREE.Mesh(lightGeom, headLightMat);
    rightLight.position.set(0.75, 0.5, 2.2);
    this.mesh.add(leftLight);
    this.mesh.add(rightLight);

    // 5. 테일라이트 / 브레이크등
    this.brakeLightMaterial = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      emissive: 0x991b1b,
      emissiveIntensity: 0.8,
    });
    const tailLightGeom = new THREE.BoxGeometry(1.8, 0.12, 0.08);
    const tailLight = new THREE.Mesh(tailLightGeom, this.brakeLightMaterial);
    tailLight.position.set(0, 0.55, -2.2);
    this.mesh.add(tailLight);

    // 6. 바퀴 4개 (Wheel Cylinders)
    const wheelGeom = new THREE.CylinderGeometry(0.38, 0.38, 0.32, 16);
    wheelGeom.rotateZ(Math.PI / 2); // 휠 방향 정렬

    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 });

    this.frontLeftWheel = new THREE.Mesh(wheelGeom, wheelMat);
    this.frontLeftWheel.position.set(-1.05, 0.38, 1.3);
    this.frontRightWheel = new THREE.Mesh(wheelGeom, wheelMat);
    this.frontRightWheel.position.set(1.05, 0.38, 1.3);

    this.rearLeftWheel = new THREE.Mesh(wheelGeom, wheelMat);
    this.rearLeftWheel.position.set(-1.05, 0.38, -1.3);
    this.rearRightWheel = new THREE.Mesh(wheelGeom, wheelMat);
    this.rearRightWheel.position.set(1.05, 0.38, -1.3);

    this.mesh.add(this.frontLeftWheel);
    this.mesh.add(this.frontRightWheel);
    this.mesh.add(this.rearLeftWheel);
    this.mesh.add(this.rearRightWheel);
  }

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

    // 드리프트 판정 (핸드브레이크 또는 고속 급선회)
    const isHighSpeedTurn = Math.abs(steerInput) > 0.7 && Math.abs(this.speed) > 18.0;
    this.isDrifting = (handbrake && Math.abs(this.speed) > 8.0) || isHighSpeedTurn;

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

    // 6. 브레이크등 발광
    if (this.brakeLightMaterial) {
      const isBraking = brake > 0.1 || handbrake;
      this.brakeLightMaterial.emissiveIntensity = isBraking ? 2.8 : 0.8;
    }
  }

  public getSpeedKmh(): number {
    return Math.abs(this.speed * 3.6);
  }

  public reset(pos: THREE.Vector3, heading: number = 0): void {
    this.position.copy(pos);
    this.speed = 0;
    this.heading = heading;
    this.slipAngle = 0;
    this.isDrifting = false;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.set(0, this.heading, 0);
  }
}
