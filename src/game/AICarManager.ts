import * as THREE from 'three';
import { Vehicle } from './Vehicle.ts';
import { CircuitTrack } from './CircuitTrack.ts';
import { AI_CAR_CONFIGS } from '../data/vehicles.ts';

export interface AICarAgent {
  id: number;
  name: string;
  vehicle: Vehicle;
  t: number;             // 트랙 곡선 진행도 (0.0 ~ 1.0)
  prevT: number;
  speedMs: number;       // 현재 시속 m/s
  baseSpeedMs: number;   // 기본 크루징 속도 m/s
  maxSpeedMs: number;    // 최고 속도 m/s
  laneOffset: number;    // 트랙 중심선으로부터의 좌우 레인 오프셋 (m)
  targetLaneOffset: number;
  color: number;
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

/**
 * 4대의 컴퓨터 자동주행 레이서 관리자 (AI Multi-Car Simulation)
 * - 슬립스트림(Drafting / DRS) 및 능동적 추월 차선 기동 (Overtake Maneuver)
 * - 드라이버별 어택 모멘텀 웨이브로 끊임없는 1~4위 순위 교체(엎치락뒤치락 배틀)
 * - 팩 압축(Pack Compression)으로 선두 독주 방지 및 초접전 연출
 * - 물리 충돌 엔진과 양방향 레인/속도 동기화로 겹침 및 관통 원천 차단
 */
export class AICarManager {
  public agents: AICarAgent[] = [];
  public group: THREE.Group = new THREE.Group();
  public isActive: boolean = false;
  public totalLaps: number = 3; // 3 Lap 완주
  public isAllFinished: boolean = false;
  public raceTimeMs: number = 0;
  public isRivalsMode: boolean = false;
  public onSectorPassed?: (name: string, sectorName: string, timeMs: number) => void;

  private track: CircuitTrack;

  constructor(track: CircuitTrack) {
    this.track = track;

    const defaultModels: Array<'gt_turbo' | 'formula_aero' | 'cyber_speedster'> = [
      'gt_turbo',
      'formula_aero',
      'cyber_speedster',
      'gt_turbo'
    ];

    AI_CAR_CONFIGS.forEach((cfg, idx) => {
      const model = defaultModels[idx % defaultModels.length];
      const vehicle = new Vehicle(false, 0x06b6d4, model);
      vehicle.setColor(cfg.color);
      vehicle.setNameTag(cfg.name, cfg.color);

      // 차량 기본 속도를 대등하게 정규화하여 성능 격차로 인한 일방적 독주 방지
      const balancedBase = 49.0;

      this.agents.push({
        id: cfg.id,
        name: cfg.name,
        vehicle,
        t: 0,
        prevT: 0,
        speedMs: 0,
        baseSpeedMs: balancedBase,
        maxSpeedMs: balancedBase + 10.0,
        laneOffset: cfg.laneOffset,
        targetLaneOffset: cfg.laneOffset,
        color: cfg.color,
        currentLap: 1,
        isFinished: false,
        attackTimer: idx * 1.5, // 초기 모멘텀 시차 분산
        attackCooldown: 2.5 + idx * 2.0,
        isDrafting: false,
        hasPassedStartLine: false,
        lastSectorTimeMs: 0,
        currentSectorIndex: 0,
        driftTimer: 0,
        steerDir: 0,
      });

      this.group.add(vehicle.mesh);
    });

    this.group.visible = false;
  }

  /**
   * 특정 슬롯의 차량 모델 및 컬러, 드라이버 이름 동적 설정 (선택된 차량/옵션 자동주행 DEMO 모드 반영)
   */
  public setSlotConfig(
    slotIndex: number,
    modelId: 'gt_turbo' | 'formula_aero' | 'cyber_speedster',
    colorHex: number,
    name?: string
  ): void {
    if (slotIndex < 0 || slotIndex >= this.agents.length) return;
    const agent = this.agents[slotIndex];
    if (name) agent.name = name;
    agent.vehicle.setModel(modelId);
    agent.vehicle.setColor(colorHex);
    agent.color = colorHex;
    agent.vehicle.setNameTag(agent.name, colorHex);
  }

  /**
   * 스타팅 그리드 박스에 차량 나란히 정렬 배치 (Grid Alignment)
   * @param asRivals 플레이어 주행 모드 시 (슬롯 0은 플레이어 전용, AI는 1, 2, 3번 슬롯에 배치)
   */
  public resetToGrids(asRivals: boolean = false): void {
    this.isRivalsMode = asRivals;
    this.isActive = true;
    this.group.visible = true;
    this.isAllFinished = false;

    const trackLength = this.track.trackCurve.getLength();
    const slotDistances = [4.5, 11.5, 18.5, 25.5];
    const slotLanes = [-2.2, 2.2, -2.2, 2.2];

    this.raceTimeMs = 0;
    this.agents.forEach((agent, idx) => {
      if (asRivals && idx === 0) {
        // 슬롯 0은 플레이어 차량이 차지하므로 비활성화
        agent.vehicle.mesh.visible = false;
        agent.speedMs = 0;
        return;
      }

      agent.vehicle.mesh.visible = true;
      const distBehind = slotDistances[idx];
      const lane = slotLanes[idx];

      agent.t = (1.0 - (distBehind / trackLength)) % 1.0;
      agent.prevT = agent.t;
      agent.speedMs = 0;
      agent.laneOffset = lane;
      agent.targetLaneOffset = lane;
      agent.currentLap = 1;
      agent.isFinished = false;
      agent.finishTimeMs = undefined;
      agent.hasPassedStartLine = false;
      agent.lastSectorTimeMs = 0;
      agent.currentSectorIndex = 0;
      agent.attackTimer = idx * 1.8;
      agent.attackCooldown = 3.0 + idx * 2.2;
      agent.isDrafting = false;
      agent.driftTimer = 0;
      agent.steerDir = 0;

      // 그리드 박스 위치에 차량 스폰 (Y: 0.055m 지면 밀착)
      const gridPos = this.track.getGridPosition(idx);
      agent.vehicle.reset(gridPos.position, gridPos.heading);
    });
  }

  public activate(asRivals: boolean = false): void {
    this.resetToGrids(asRivals);
  }

  public deactivate(): void {
    this.isActive = false;
    this.group.visible = false;
    this.isAllFinished = false;
  }

  public setHeadlights(enabled: boolean): void {
    this.agents.forEach((agent) => {
      agent.vehicle.setHeadlights(enabled);
    });
  }

  /**
   * 물리 충돌 엔진(CollisionManager)이 차량을 밀어내거나 감속시킨 실제 결과를
   * AI의 레인 오프셋(laneOffset) 및 속도(speedMs)에 즉각 피드백 반영하여 겹침 원천 차단
   */
  public syncFromPhysics(): void {
    if (!this.isActive) return;

    this.agents.forEach((agent) => {
      if (!agent.vehicle.mesh.visible || agent.isFinished) return;

      const pt = this.track.trackCurve.getPointAt(agent.t);
      const tangent = this.track.trackCurve.getTangentAt(agent.t).normalize();
      const right = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      // 충돌 물리 엔진이 이동시킨 위치로부터 실제 레인 오프셋 재계산
      const diff = new THREE.Vector3().subVectors(agent.vehicle.position, pt);
      diff.y = 0;
      const actualOffset = diff.dot(right);

      // 트랙 아스팔트 폭 내로 안전하게 클램핑 동기화
      agent.laneOffset = THREE.MathUtils.clamp(actualOffset, -5.2, 5.2);
      agent.targetLaneOffset = agent.laneOffset;

      // 충돌 반발력으로 변경된 물리 속도를 AI 진행 속도로 동기화
      if (agent.vehicle.speed > 0) {
        agent.speedMs = Math.max(12.0, Math.min(agent.maxSpeedMs, agent.vehicle.speed));
      }
    });
  }

  public update(delta: number, isRunning: boolean): void {
    if (!this.isActive) return;

    if (!isRunning) {
      // 카운트다운 대기 중: 그리드에 정지 상태 유지
      return;
    }

    this.raceTimeMs += delta * 1000;

    const trackLength = this.track.trackCurve.getLength();
    const leader = this.getLeaderAgent();

    this.agents.forEach((agent, idx) => {
      if (!agent.vehicle.mesh.visible) return;

      // 트랙 코너 곡률 및 선회 방향 사전 계산 (추월 라인 선정 및 드리프트 판단)
      const futureT = (agent.t + 0.016) % 1.0;
      const currTangent = this.track.trackCurve.getTangentAt(agent.t);
      const futureTangent = this.track.trackCurve.getTangentAt(futureT);
      const curveAngle = currTangent.angleTo(futureTangent);
      const turnCrossY = currTangent.x * futureTangent.z - currTangent.z * futureTangent.x;
      const turnDir = turnCrossY > 0.001 ? 1 : (turnCrossY < -0.001 ? -1 : 0);

      if (agent.isFinished || this.isAllFinished) {
        // 완주 후 결승선 부근에서 자연스럽게 감속하여 안전하게 정지
        agent.speedMs = Math.max(0, agent.speedMs - 9.5 * delta);
        agent.vehicle.isDrifting = false;
        agent.driftTimer = 0;
      } else {
        // 1. 전방 가장 가까운 라이벌 차량 탐색 (슬립스트림 및 추월 궤적 연산)
        let nearestAheadDist = Infinity;
        let carAhead: AICarAgent | null = null;

        for (const other of this.agents) {
          if (other === agent || !other.vehicle.mesh.visible || other.isFinished) continue;
          let dt = other.t - agent.t;
          if (dt < 0) dt += 1.0;
          const dist = dt * trackLength;
          if (dist > 0.3 && dist < 60.0 && dist < nearestAheadDist) {
            nearestAheadDist = dist;
            carAhead = other;
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
        if (carAhead && nearestAheadDist < 38.0) {
          agent.isDrafting = true;
          const draftFactor = 1.0 - (nearestAheadDist / 38.0);
          dynamicBonus += 3.2 + draftFactor * 5.8;

          // C. 능동적 추월 차선 기동 (20m 이내 접근 시 슬링샷 스위칭)
          if (nearestAheadDist < 20.0) {
            // 코너 선회 중이면 인코너 다이브, 직선주로면 반대 차선 추월
            if (turnDir !== 0) {
              agent.targetLaneOffset = turnDir > 0 ? 2.4 : -2.4;
            } else {
              agent.targetLaneOffset = carAhead.laneOffset <= 0 ? 2.4 : -2.4;
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
          for (const other of this.agents) {
            if (other === agent || !other.vehicle.mesh.visible || other.isFinished) continue;
            let dt = agent.t - other.t;
            if (dt < 0) dt += 1.0;
            const dist = dt * trackLength;
            if (dist < distBehindLeader) distBehindLeader = dist;
          }
          if (distBehindLeader > 8.0 && distBehindLeader < 250.0) {
            // 선두가 8m 이상 벌리면 페이스 조절로 팩을 묶음
            dynamicBonus -= Math.min(4.5, (distBehindLeader - 8.0) * 0.25);
          }
        } else {
          let distToLeader = leader.t - agent.t;
          if (distToLeader < 0) distToLeader += 1.0;
          const mToLeader = distToLeader * trackLength;
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

        const slopeMod = -currTangent.y * 12.0;
        const basePace = agent.baseSpeedMs + dynamicBonus + slopeMod;
        const targetSpeed = curveAngle > 0.24
          ? basePace * 0.76
          : (curveAngle > 0.12 ? basePace * 0.90 : basePace * 1.18);

        // 가속 반응성: 현실적인 제로백 (약 2.9~3.2초) 및 물리 가속도 상한 적용 (초반 1초 폭발 가속 방지)
        const maxAccel = agent.isDrafting ? 13.0 : (agent.attackTimer > 0 ? 11.5 : 10.0);
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

      // 5. 진행률 t 전진
      agent.prevT = agent.t;
      const distTraveled = agent.speedMs * delta;
      agent.t = (agent.t + (distTraveled / trackLength)) % 1.0;

      // 6. 스타트/피니시 라인 및 섹터(S1, S2, 도착선) 통과 감지
      const isEligible = this.isRivalsMode ? (idx !== 0) : true;
      const displayName = (!this.isRivalsMode && idx === 0) ? 'Player' : agent.name;

      if (agent.prevT > 0.85 && agent.t < 0.15) {
        if (!agent.hasPassedStartLine) {
          // 레이스 시작 직후 출발선 통과는 첫 랩의 시작이므로 알림/랩 수 증가 제외
          agent.hasPassedStartLine = true;
          agent.lastSectorTimeMs = this.raceTimeMs;
          agent.currentSectorIndex = 0;
        } else {
          // 1바퀴 완주 (도착선 통과)
          if (isEligible && this.onSectorPassed && agent.currentSectorIndex === 2) {
            const lapTime = Math.round(this.raceTimeMs - agent.lastSectorTimeMs);
            agent.lastSectorTimeMs = this.raceTimeMs;
            agent.currentSectorIndex = 0;
            this.onSectorPassed(displayName, '도착선', lapTime);
          }
          agent.currentLap++;
          if (agent.currentLap > this.totalLaps) {
            agent.isFinished = true;
            agent.finishTimeMs = this.raceTimeMs;
            this.checkRaceFinish();
          }
        }
      } else if (agent.hasPassedStartLine && isEligible && this.onSectorPassed) {
        // shortcut: 트랙 정규화 t 비율(0.33, 0.66) 기반 섹터 체크, 트랙별 개별 체크포인트 3D 볼륨 충돌 매니저로 통합 시 업그레이드
        if (agent.currentSectorIndex === 0 && agent.prevT < 0.33 && agent.t >= 0.33) {
          const timeAtSector = Math.round(this.raceTimeMs - agent.lastSectorTimeMs);
          agent.currentSectorIndex = 1;
          this.onSectorPassed(displayName, 'S1', timeAtSector);
        } else if (agent.currentSectorIndex === 1 && agent.prevT < 0.66 && agent.t >= 0.66) {
          const timeAtSector = Math.round(this.raceTimeMs - agent.lastSectorTimeMs);
          agent.currentSectorIndex = 2;
          this.onSectorPassed(displayName, 'S2', timeAtSector);
        }
      }

      // 7. 위치 및 방향 계산
      this.updateAgentPosition(agent, delta, curveAngle);
    });
  }

  private checkRaceFinish(): void {
    // 1위 차량 완주 시 레이스 종료 플래그
    if (!this.isAllFinished) {
      this.isAllFinished = true;
    }
  }

  private updateAgentPosition(agent: AICarAgent, delta: number, curveAngle: number): void {
    const pt = this.track.trackCurve.getPointAt(agent.t);
    const tangent = this.track.trackCurve.getTangentAt(agent.t).normalize();
    const right = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

    const carPos = new THREE.Vector3()
      .copy(pt)
      .addScaledVector(right, agent.laneOffset);
    carPos.y = Math.max(0, pt.y) + 0.055; // 3D 트랙 노면 고도 밀착

    agent.vehicle.position.copy(carPos);
    agent.vehicle.mesh.position.copy(carPos);

    const heading = Math.atan2(tangent.x, tangent.z);
    agent.vehicle.heading = heading;

    const targetPitch = -Math.asin(THREE.MathUtils.clamp(tangent.y, -0.45, 0.45));
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
   * 현재 선두(가장 랩 수가 많거나 t가 큰) 차량 반환
   */
  public getLeaderAgent(): AICarAgent {
    let leader = this.agents[0];
    const getProg = (a: AICarAgent) => a.hasPassedStartLine ? (a.currentLap - 1) + a.t : a.t - 1.0;
    let leaderProg = getProg(leader);
    for (let i = 1; i < this.agents.length; i++) {
      const a = this.agents[i];
      const aProg = getProg(a);
      if (aProg > leaderProg) {
        leader = a;
        leaderProg = aProg;
      }
    }
    return leader;
  }
}
