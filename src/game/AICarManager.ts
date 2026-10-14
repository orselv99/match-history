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
  // 다이내믹 레이싱 배틀 변수 (엎치락뒤치락 팽팽한 순위 싸움)
  attackTimer: number;     // 어택 모멘텀 버스트 잔여 시간
  attackCooldown: number;  // 다음 어택까지의 대기 시간
  isDrafting: boolean;     // 슬립스트림 견인 가속 상태 여부
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

      // 차량 기본 속도를 대등하게 정규화하여 성능 격차로 인한 일방적 독주 방지
      const balancedBase = 48.0 + (idx === 1 ? 0.4 : idx === 3 ? 0.2 : -0.2);

      this.agents.push({
        id: cfg.id,
        name: cfg.name,
        vehicle,
        t: 0,
        prevT: 0,
        speedMs: 0,
        baseSpeedMs: balancedBase,
        maxSpeedMs: balancedBase + 9.5,
        laneOffset: cfg.laneOffset,
        targetLaneOffset: cfg.laneOffset,
        color: cfg.color,
        currentLap: 1,
        isFinished: false,
        attackTimer: idx * 2.0, // 초기 모멘텀 시차 분산
        attackCooldown: 3.5 + idx * 2.5,
        isDrafting: false,
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
    agent.vehicle.setModel(modelId);
    agent.vehicle.setColor(colorHex);
    agent.color = colorHex;
    if (name) agent.name = name;
  }

  /**
   * 스타팅 그리드 박스에 차량 나란히 정렬 배치 (Grid Alignment)
   * @param asRivals 플레이어 주행 모드 시 (슬롯 0은 플레이어 전용, AI는 1, 2, 3번 슬롯에 배치)
   */
  public resetToGrids(asRivals: boolean = false): void {
    this.isActive = true;
    this.group.visible = true;
    this.isAllFinished = false;

    const trackLength = this.track.trackCurve.getLength();
    const slotDistances = [4.5, 11.5, 18.5, 25.5];
    const slotLanes = [-2.2, 2.2, -2.2, 2.2];

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
      agent.attackTimer = idx * 1.8;
      agent.attackCooldown = 3.0 + idx * 2.2;
      agent.isDrafting = false;

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

    const trackLength = this.track.trackCurve.getLength();
    const leader = this.getLeaderAgent();

    this.agents.forEach((agent) => {
      if (!agent.vehicle.mesh.visible) return;

      if (agent.isFinished) {
        // 완주 후 서서히 감속
        agent.speedMs = Math.max(0, agent.speedMs - 15.0 * delta);
        if (agent.speedMs <= 0.1) return;
      } else {
        // 1. 전방 가장 가까운 라이벌 차량 탐색 (슬립스트림 및 추월 궤적 연산)
        let nearestAheadDist = Infinity;
        let carAhead: AICarAgent | null = null;

        for (const other of this.agents) {
          if (other === agent || !other.vehicle.mesh.visible || other.isFinished) continue;
          let dt = other.t - agent.t;
          if (dt < 0) dt += 1.0;
          const dist = dt * trackLength;
          if (dist > 0.5 && dist < 50.0 && dist < nearestAheadDist) {
            nearestAheadDist = dist;
            carAhead = other;
          }
        }

        // 2. 어택 모멘텀 버스트 타이머 업데이트 (주기적인 공격적 페이스 업)
        if (agent.attackTimer > 0) {
          agent.attackTimer -= delta;
        } else {
          agent.attackCooldown -= delta;
          if (agent.attackCooldown <= 0) {
            // 새로운 어택 모멘텀 발동 (4~7초간 가속 부스트 및 적극적 추월 라인 공략)
            agent.attackTimer = 4.2 + Math.random() * 3.2;
            agent.attackCooldown = 7.0 + Math.random() * 5.0;
          }
        }

        // 3. 동적 레이스 보너스 속도 계산 (슬립스트림 + 어택 모멘텀 + 팩 압축)
        let dynamicBonus = 0;

        // A. 어택 모멘텀 부스트
        if (agent.attackTimer > 0) {
          dynamicBonus += 4.2;
        }

        // B. 슬립스트림 견인 가속 (전방 32m 이내 추격 시 공기 저항 감소 가속)
        agent.isDrafting = false;
        if (carAhead && nearestAheadDist < 32.0) {
          const latDiff = Math.abs(agent.laneOffset - carAhead.laneOffset);
          if (latDiff < 2.5) {
            agent.isDrafting = true;
            // 가까워질수록 최대 +7.5 m/s까지 강력한 가속 부스트
            const draftFactor = 1.0 - (nearestAheadDist / 32.0);
            dynamicBonus += 2.8 + draftFactor * 5.2;
          }

          // C. 능동적 추월 차선 기동 (16m 이내 접근 시 전방 차량 빈 차선으로 날카롭게 스위칭)
          if (nearestAheadDist < 16.0) {
            if (carAhead.laneOffset <= 0) {
              agent.targetLaneOffset = 2.4; // 우측 추월 레인
            } else {
              agent.targetLaneOffset = -2.4; // 좌측 추월 레인
            }
          }
        } else {
          // 전방 자유 주행 시: 주기적인 최적 레이싱 라인 스윙
          if (Math.random() < 0.015) {
            agent.targetLaneOffset = (Math.random() * 4.6) - 2.3;
          }
        }

        // D. 팽팽한 레이스 팩 유지 (선두 독주 방지 및 후미 차량 캐치업 텐션)
        if (leader === agent && nearestAheadDist > 150.0) {
          // 선두 독주 차량: 정면 공기 저항 및 타이어 관리로 페이스 소폭 조절
          dynamicBonus -= 2.0;
        } else if (leader !== agent) {
          let distToLeader = leader.t - agent.t;
          if (distToLeader < 0) distToLeader += 1.0;
          const mToLeader = distToLeader * trackLength;
          if (mToLeader > 22.0) {
            // 후미 차량 팩 합류 캐치업 부스트
            dynamicBonus += Math.min(5.5, (mToLeader - 22.0) * 0.16);
          }
        }

        // 4. 코너 곡률에 따른 가감속 (인사이드 라인은 후기 제동, 아웃사이드 라인은 탈출 가속)
        const futureT = (agent.t + 0.02) % 1.0;
        const currTangent = this.track.trackCurve.getTangentAt(agent.t);
        const futureTangent = this.track.trackCurve.getTangentAt(futureT);
        const curveAngle = currTangent.angleTo(futureTangent);

        const basePace = agent.baseSpeedMs + dynamicBonus;
        const targetSpeed = curveAngle > 0.30 ? basePace * 0.70 : basePace * 1.16;

        // 가속 반응성 (추월/어택 시 민첩한 스로틀 반응)
        const accelRate = agent.isDrafting || agent.attackTimer > 0 ? 5.2 : 3.6;
        agent.speedMs += (targetSpeed - agent.speedMs) * Math.min(1.0, accelRate * delta);

        // 고속 급선회 시 AI 차량 드리프트 활성화
        agent.vehicle.isDrifting = curveAngle > 0.32 && agent.speedMs > 24.0;

        // 레인 스티어링 (추월 기동 시 신속한 차선 전환)
        const steerRate = (agent.isDrafting || nearestAheadDist < 16.0) ? 3.6 : 2.0;
        agent.laneOffset += (agent.targetLaneOffset - agent.laneOffset) * Math.min(1.0, steerRate * delta);
      }

      // 5. 진행률 t 전진
      agent.prevT = agent.t;
      const distTraveled = agent.speedMs * delta;
      agent.t = (agent.t + (distTraveled / trackLength)) % 1.0;

      // 6. 스타트/피니시 라인 통과 감지
      if (agent.prevT > 0.85 && agent.t < 0.15) {
        agent.currentLap++;
        if (agent.currentLap > this.totalLaps) {
          agent.isFinished = true;
          this.checkRaceFinish();
        }
      }

      // 7. 위치 및 방향 계산
      this.updateAgentPosition(agent, delta);
    });
  }

  private checkRaceFinish(): void {
    // 1위 차량 완주 시 레이스 종료 플래그
    if (!this.isAllFinished) {
      this.isAllFinished = true;
    }
  }

  private updateAgentPosition(agent: AICarAgent, delta: number): void {
    const pt = this.track.trackCurve.getPointAt(agent.t);
    const tangent = this.track.trackCurve.getTangentAt(agent.t).normalize();
    const right = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

    const carPos = new THREE.Vector3()
      .copy(pt)
      .addScaledVector(right, agent.laneOffset);
    carPos.y = 0.055; // 지면 노면 밀착

    agent.vehicle.position.copy(carPos);
    agent.vehicle.mesh.position.copy(carPos);

    const heading = Math.atan2(tangent.x, tangent.z);
    agent.vehicle.heading = heading;
    agent.vehicle.mesh.rotation.y = heading;
    agent.vehicle.speed = agent.speedMs;

    // 바퀴 회전 애니메이션
    const wheelRotSpeed = (agent.speedMs / 0.38) * delta;
    agent.vehicle.frontLeftWheel.rotation.x += wheelRotSpeed;
    agent.vehicle.frontRightWheel.rotation.x += wheelRotSpeed;
    agent.vehicle.rearLeftWheel.rotation.x += wheelRotSpeed;
    agent.vehicle.rearRightWheel.rotation.x += wheelRotSpeed;
  }

  /**
   * 현재 선두(가장 랩 수가 많거나 t가 큰) 차량 반환
   */
  public getLeaderAgent(): AICarAgent {
    let leader = this.agents[0];
    for (let i = 1; i < this.agents.length; i++) {
      const a = this.agents[i];
      if (a.currentLap > leader.currentLap || (a.currentLap === leader.currentLap && a.t > leader.t)) {
        leader = a;
      }
    }
    return leader;
  }
}
