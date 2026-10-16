import * as THREE from 'three';
import { Vehicle } from '../Vehicle.ts';
import { Circuit } from '../Circuit.ts';

export interface OpponentAgent {
  id: number;
  driverName: string;
  vehicle: Vehicle;
  t: number;             // 서킷 곡선 진행도 (0.0 ~ 1.0)
  prevT: number;
  speedMs: number;       // 현재 시속 m/s
  baseSpeedMs: number;   // 기본 크루징 속도 m/s
  maxSpeedMs: number;    // 최고 속도 m/s
  laneOffset: number;    // 서킷 중심선으로부터의 좌우 레인 오프셋 (m)
  targetLaneOffset: number;
  color: string;
  currentLap: number;
  isFinished: boolean;
  finishTimeMs?: number;
  // 다이내믹 레이싱 배틀 변수 (엎치락뒤치락 팽팽한 순위 싸움)
  attackTimer: number;     // 어택 모멘텀 버스트 잔여 시간
  attackCooldown: number;  // 다음 어택까지의 대기 시간
  isDrafting: boolean;     // 슬립스트림 견인 가속 상태 여부
  hasPassedStartLine: boolean; // 첫 랩 출발선 통과 여부 (출발선 이전 그리드 스폰 대응)
  lastSectorTimeMs: number;
  currentSectorIndex: number;
  driftTimer: number;      // 코너 드리프트 지속 타이머
  steerDir: number;        // 드리프트/선회 조향 방향 (-1: 좌, 1: 우)
}

// 렌더 프레임 GC 방지를 위한 재사용 스크래치 벡터
const _scratchPt = new THREE.Vector3();
const _scratchTangent = new THREE.Vector3();
const _scratchRight = new THREE.Vector3();
const _scratchVehiclePos = new THREE.Vector3();
const _scratchDiff = new THREE.Vector3();

/**
 * 상대 차량 AI 주행 연산 (슬립스트림, 능동적 추월 차선 기동, 팩 압축 러버밴딩, 드리프트/스태미나 제어)
 */
export function simulateOpponentAI(
  agent: OpponentAgent,
  allAgents: OpponentAgent[],
  leader: OpponentAgent,
  circuitLength: number,
  delta: number,
  curveAngle: number,
  turnDir: number,
  currTangentY: number,
  isFinishedOrEnded: boolean
): void {
  if (isFinishedOrEnded) {
    // 완주 후 결승선 부근에서 자연스럽게 감속하여 안전하게 정지
    agent.speedMs = Math.max(0, agent.speedMs - 9.5 * delta);
    agent.vehicle.isDrifting = false;
    agent.driftTimer = 0;
    return;
  }

  // 1. 전방 가장 가까운 라이벌 차량 탐색 (슬립스트림 및 추월 궤적 연산)
  let nearestAheadDist = Infinity;
  let vehicleAhead: OpponentAgent | null = null;

  for (const other of allAgents) {
    if (other === agent || other.isFinished) continue;
    // 슬롯 0(플레이어 동기화 에이전트)이거나 메시가 가시적인 상대 차량 탐색
    if (!other.vehicle.mesh.visible && other !== allAgents[0]) continue;
    let dt = other.t - agent.t;
    if (dt < 0) dt += 1.0;
    const dist = dt * circuitLength;
    if (dist > 0.3 && dist < 60.0 && dist < nearestAheadDist) {
      nearestAheadDist = dist;
      vehicleAhead = other;
    }
  }

  // 2. 어택 모멘텀 버스트 타이머 업데이트 (빈번한 공격적 순위 쟁탈 페이스)
  if (agent.attackTimer > 0) {
    agent.attackTimer -= delta;
  } else {
    agent.attackCooldown -= delta;
    if (agent.attackCooldown <= 0) {
      agent.attackTimer = 3.5 + Math.random() * 3.0; // 3.5~6.5초간 어택 모멘텀
      agent.attackCooldown = 3.0 + Math.random() * 4.0;
    }
  }

  // 3. 동적 레이스 보너스 속도 계산 (슬립스트림 + 어택 모멘텀 + 팩 압축 초접전)
  let dynamicBonus = 0;

  // A. 어택 모멘텀 부스트 (+4.5 m/s)
  if (agent.attackTimer > 0) {
    dynamicBonus += 4.5;
  }

  // B. 슬립스트림 견인 가속 (전방 38m 이내 추격 시 강력한 가속)
  agent.isDrafting = false;
  if (vehicleAhead && nearestAheadDist < 38.0) {
    agent.isDrafting = true;
    const draftFactor = 1.0 - (nearestAheadDist / 38.0);
    dynamicBonus += 3.2 + draftFactor * 5.8;

    // C. 능동적 추월 차선 기동 (20m 이내 접근 시 후미 추돌 방지 및 슬링샷 스위칭)
    if (nearestAheadDist < 20.0) {
      // 코너 선회 중이면 인코너 다이브, 직선주로면 반대 차선 추월
      if (turnDir !== 0) {
        agent.targetLaneOffset = turnDir > 0 ? 2.4 : -2.4;
      } else {
        agent.targetLaneOffset = vehicleAhead.laneOffset <= 0 ? 2.4 : -2.4;
      }
    }
  } else {
    // 전방 클리어 주행 시 최적 레이싱 라인 스윙
    if (Math.random() < 0.02) {
      agent.targetLaneOffset = (Math.random() * 4.4) - 2.2;
    }
  }

  // D. 팽팽한 레이스 팩 유지 (선두 독주 견제 및 후미 차량 캐치업 러버밴딩)
  if (leader === agent) {
    let distBehindLeader = Infinity;
    for (const other of allAgents) {
      if (other === agent || !other.vehicle.mesh.visible || other.isFinished) continue;
      let dt = agent.t - other.t;
      if (dt < 0) dt += 1.0;
      const dist = dt * circuitLength;
      if (dist < distBehindLeader) distBehindLeader = dist;
    }
    if (distBehindLeader > 8.0 && distBehindLeader < 250.0) {
      // 선두가 8m 이상 벌리면 페이스 조절로 팩을 묶음
      dynamicBonus -= Math.min(4.5, (distBehindLeader - 8.0) * 0.25);
    }
  } else {
    let distToLeader = leader.t - agent.t;
    if (distToLeader < 0) distToLeader += 1.0;
    const mToLeader = distToLeader * circuitLength;
    if (mToLeader > 8.0) {
      // 후미 차량 팩 합류 캐치업 부스트
      dynamicBonus += Math.min(6.5, (mToLeader - 8.0) * 0.22);
    }
  }

  // 4. 스태미나 기반 급코너 드리프트 및 스핀아웃 관리 (쿨다운 대신 스태미나 소비/충전)
  const isSharpCorner = curveAngle > 0.28;
  const isExitingCorner = curveAngle < 0.16;

  if (agent.vehicle.isSpinningOut) {
    agent.vehicle.spinoutTimer -= delta;
    agent.speedMs = Math.max(0, agent.speedMs - 28.0 * delta);
    agent.driftTimer = 0;
    agent.vehicle.isDrifting = true;
    if (agent.vehicle.spinoutTimer <= 0) {
      agent.vehicle.isSpinningOut = false;
      agent.vehicle.driftStamina = 25.0;
    }
  } else {
    // 급코너 진입 + 고속 주행 시 드리프트 발동 (스태미나가 30% 이상일 때만 발동)
    if (isSharpCorner && agent.speedMs > 25.0 && agent.driftTimer <= 0 && agent.vehicle.driftStamina > 30.0) {
      agent.driftTimer = 1.1; // 약 1.1초간 파워 슬라이드
      agent.steerDir = turnDir !== 0 ? turnDir : (agent.steerDir || 1);
    }

    if (agent.driftTimer > 0 && !isExitingCorner) {
      agent.driftTimer -= delta;
      agent.vehicle.isDrifting = true;
      agent.vehicle.driftStamina = Math.max(0, agent.vehicle.driftStamina - 26.0 * delta);
      if (agent.vehicle.driftStamina <= 0) {
        agent.driftTimer = 0;
        agent.vehicle.isDrifting = false;
      }
    } else {
      agent.driftTimer = 0;
      agent.vehicle.isDrifting = false;
      agent.vehicle.driftStamina = Math.min(100.0, agent.vehicle.driftStamina + 24.0 * delta);
    }
  }

  const slopeMod = -currTangentY * 12.0;
  const basePace = agent.baseSpeedMs + dynamicBonus + slopeMod;
  let targetSpeed = curveAngle > 0.24
    ? basePace * 0.76
    : (curveAngle > 0.12 ? basePace * 0.90 : basePace * 1.18);

  // 동일 차선 전방 차량 근접 시 후미 추돌 완충 감속 (안전 차간 거리 유지)
  if (vehicleAhead && nearestAheadDist < 8.0 && Math.abs(agent.laneOffset - vehicleAhead.laneOffset) < 1.8) {
    targetSpeed = Math.min(targetSpeed, Math.max(8.0, vehicleAhead.speedMs * 0.94));
  }

  // 가속 반응성: 출발 그리드 급발진 방지(저속 8.5 m/s²) 및 고속 드래프팅 12.5 m/s²
  const maxAccel = agent.isDrafting ? 12.5 : (agent.attackTimer > 0 ? 11.0 : (agent.speedMs < 14.0 ? 8.5 : 10.0));
  const maxBrake = 24.0;
  const speedDelta = targetSpeed - agent.speedMs;

  if (speedDelta > 0) {
    agent.speedMs += Math.min(speedDelta, maxAccel * delta);
  } else {
    agent.speedMs += Math.max(speedDelta, -maxBrake * delta);
  }

  // 레인 스티어링 (추월 기동 시 신속한 차선 전환)
  const steerRate = (agent.isDrafting || nearestAheadDist < 20.0) ? 3.8 : 2.2;
  agent.laneOffset += (agent.targetLaneOffset - agent.laneOffset) * Math.min(1.0, steerRate * delta);
}

/**
 * 3D 서킷 노면 고도 및 곡선 궤적에 따른 차량 시각 메시, 휠, 조향, 라이트 갱신 (Zero GC)
 */
export function updateOpponentVisuals(
  agent: OpponentAgent,
  circuit: Circuit,
  delta: number,
  curveAngle: number,
  cachedTangent?: THREE.Vector3
): void {
  circuit.circuitCurve.getPointAt(agent.t, _scratchPt);

  if (cachedTangent) {
    _scratchTangent.copy(cachedTangent).normalize();
  } else {
    circuit.circuitCurve.getTangentAt(agent.t, _scratchTangent);
    _scratchTangent.normalize();
  }

  _scratchRight.set(-_scratchTangent.z, 0, _scratchTangent.x).normalize();

  _scratchVehiclePos.copy(_scratchPt).addScaledVector(_scratchRight, agent.laneOffset);
  _scratchVehiclePos.y = Math.max(0, _scratchPt.y) + 0.055; // 3D 서킷 노면 고도 밀착

  agent.vehicle.position.copy(_scratchVehiclePos);
  agent.vehicle.mesh.position.copy(_scratchVehiclePos);

  const heading = Math.atan2(_scratchTangent.x, _scratchTangent.z);
  agent.vehicle.heading = heading;

  const targetPitch = -Math.asin(THREE.MathUtils.clamp(_scratchTangent.y, -0.45, 0.45));
  agent.vehicle.pitch = delta > 0
    ? agent.vehicle.pitch + (targetPitch - agent.vehicle.pitch) * Math.min(1.0, 14.0 * delta)
    : targetPitch;

  // 드리프트 차체 슬립 각도 및 롤링 반영 (스핀아웃 시 360도 회전 연출)
  let displayHeading = heading;
  let rollZ = 0;
  if (agent.vehicle.isSpinningOut) {
    displayHeading += (1.4 - agent.vehicle.spinoutTimer) * 12.0;
    rollZ = Math.sin(agent.vehicle.spinoutTimer * 14.0) * 0.16;
  } else {
    const targetSlip = agent.vehicle.isDrifting ? -agent.steerDir * 0.32 : 0;
    agent.vehicle.slipAngle += (targetSlip - agent.vehicle.slipAngle) * Math.min(1.0, 10.0 * delta);
    displayHeading += agent.vehicle.slipAngle;
    rollZ = agent.vehicle.isDrifting ? agent.steerDir * 0.05 : 0;
  }

  agent.vehicle.mesh.rotation.order = 'YXZ';
  agent.vehicle.mesh.rotation.y = displayHeading;
  agent.vehicle.mesh.rotation.x = agent.vehicle.pitch;
  agent.vehicle.mesh.rotation.z = rollZ;
  agent.vehicle.speed = agent.speedMs;

  // 바퀴 회전 애니메이션
  const wheelRotSpeed = (agent.speedMs / 0.38) * delta;
  agent.vehicle.frontLeftWheel.rotation.x += wheelRotSpeed;
  agent.vehicle.frontRightWheel.rotation.x += wheelRotSpeed;
  agent.vehicle.rearLeftWheel.rotation.x += wheelRotSpeed;
  agent.vehicle.rearRightWheel.rotation.x += wheelRotSpeed;

  // 앞바퀴 조향 각도 (드리프트 시 카운터 스티어링, 일반 선회 시 코너 조향)
  const steerAngle = agent.vehicle.isDrifting
    ? agent.steerDir * 0.38
    : -agent.steerDir * Math.min(0.35, curveAngle * 1.8);
  agent.vehicle.frontLeftWheel.rotation.y = steerAngle;
  agent.vehicle.frontRightWheel.rotation.y = steerAngle;

  // 브레이크등/드리프트 후방 램프 점등
  const isBrakingOrDrifting = agent.vehicle.isDrifting || (curveAngle > 0.22 && agent.speedMs > 30.0);
  if (agent.vehicle.brakeLightMaterial) {
    agent.vehicle.brakeLightMaterial.emissiveIntensity = isBrakingOrDrifting ? 3.2 : 0.2;
  }
  const tailIntensity = isBrakingOrDrifting ? 3.0 : 0;
  if (agent.vehicle.leftTailPointLight) {
    agent.vehicle.leftTailPointLight.intensity = tailIntensity;
  }
  if (agent.vehicle.rightTailPointLight) {
    agent.vehicle.rightTailPointLight.intensity = tailIntensity;
  }
}

/**
 * 물리 충돌 엔진 피드백 동기화 (Zero GC)
 */
export function syncAgentFromPhysics(agent: OpponentAgent, circuit: Circuit): void {
  if (!agent.vehicle.mesh.visible || agent.isFinished) return;

  circuit.circuitCurve.getPointAt(agent.t, _scratchPt);
  circuit.circuitCurve.getTangentAt(agent.t, _scratchTangent);
  _scratchTangent.normalize();
  _scratchRight.set(-_scratchTangent.z, 0, _scratchTangent.x).normalize();

  // 충돌 물리 엔진이 이동시킨 위치로부터 실제 레인 오프셋 재계산
  _scratchDiff.subVectors(agent.vehicle.position, _scratchPt);
  _scratchDiff.y = 0;
  const actualOffset = _scratchDiff.dot(_scratchRight);

  // 서킷 아스팔트 폭 내로 안전하게 클램핑 동기화
  agent.laneOffset = THREE.MathUtils.clamp(actualOffset, -5.2, 5.2);
  agent.targetLaneOffset = agent.laneOffset;

  // 충돌 반발력으로 변경된 물리 속도를 진행 속도로 동기화
  if (agent.vehicle.speed > 0) {
    agent.speedMs = Math.max(12.0, Math.min(agent.maxSpeedMs, agent.vehicle.speed));
  }
}
