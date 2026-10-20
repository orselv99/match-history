import * as THREE from 'three';
import { Vehicle } from './Vehicle.ts';
import { Circuit } from './Circuit.ts';
import { STARTING_GRID_SLOTS } from '../data/circuits.ts';
import { OPPONENT_CONFIGS, type VehicleModelId } from '../data/vehicles.ts';
import {
  type OpponentAgent,
  simulateOpponentAI,
  updateOpponentVisuals,
  syncAgentFromPhysics
} from './opponent/OpponentSimulation.ts';

export type { OpponentAgent };

/**
 * 4대의 경쟁 레이서 관리자 (Opponent Multi-Vehicle Simulation)
 * - 슬립스트림(Drafting / DRS) 및 능동적 추월 차선 기동 (Overtake Maneuver)
 * - 드라이버별 어택 모멘텀 웨이브로 끊임없는 1~4위 순위 교체(엎치락뒤치락 배틀)
 * - 팩 압축(Pack Compression)으로 선두 독주 방지 및 초접전 연출
 * - 물리 충돌 엔진과 양방향 레인/속도 동기화로 겹침 및 관통 원천 차단
 */
export class OpponentManager {
  public agents: OpponentAgent[] = [];
  public group: THREE.Group = new THREE.Group();
  public isActive: boolean = false;
  public totalLaps: number = 3; // 3 Lap 완주
  public isAllFinished: boolean = false;
  public raceTimeMs: number = 0;
  public isRivalsMode: boolean = false;
  public onSectorPassed?: (driverName: string, sectorName: string, timeMs: number) => void;

  private circuit: Circuit;

  constructor(circuit: Circuit) {
    this.circuit = circuit;

    const defaultModels: VehicleModelId[] = [
      'gt_turbo',
      'formula_aero',
      'cyber_speedster',
      'lm_hypercar'
    ];

    OPPONENT_CONFIGS.forEach((cfg, idx) => {
      const model = defaultModels[idx % defaultModels.length];
      const vehicle = new Vehicle(false, '#06b6d4', model);
      vehicle.setColor(cfg.color);
      vehicle.setNameTag(cfg.driverName, cfg.color);

      // 차량 기본 속도를 대등하게 정규화하여 성능 격차로 인한 일방적 독주 방지
      const balancedBase = 49.0;

      this.agents.push({
        id: cfg.id,
        driverName: cfg.driverName,
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
   * 특정 슬롯의 차량 모델 및 컬러, 드라이버 이름 동적 설정 (선택된 차량/옵션 DEMO 모드 반영)
   */
  public setSlotConfig(
    slotIndex: number,
    vehicleModelId: VehicleModelId,
    color: string,
    driverName?: string
  ): void {
    if (slotIndex < 0 || slotIndex >= this.agents.length) return;
    const agent = this.agents[slotIndex];
    if (driverName) agent.driverName = driverName;
    agent.vehicle.setVehicleModel(vehicleModelId);
    agent.vehicle.setColor(color);
    agent.color = color;
    agent.vehicle.setNameTag(agent.driverName, color);
  }

  /**
   * 스타팅 그리드 박스에 차량 나란히 정렬 배치 (Grid Alignment)
   * @param asRivals 플레이어 주행 모드 시 (슬롯 0은 플레이어 전용, 상대는 1, 2, 3번 슬롯에 배치)
   */
  public resetToGrids(asRivals: boolean = false): void {
    this.isRivalsMode = asRivals;
    this.isActive = true;
    this.group.visible = true;
    this.isAllFinished = false;

    const circuitLength = this.circuit.circuitCurve.getLength();
    this.raceTimeMs = 0;
    this.agents.forEach((agent, idx) => {
      if (asRivals && idx === 0) {
        // 슬롯 0은 플레이어 차량이 차지하므로 비활성화
        agent.vehicle.mesh.visible = false;
        agent.speedMs = 0;
        return;
      }

      agent.vehicle.mesh.visible = true;
      const slot = STARTING_GRID_SLOTS[Math.min(STARTING_GRID_SLOTS.length - 1, Math.max(0, idx))] ?? STARTING_GRID_SLOTS[0];
      const distBehind = slot.distBehind;
      const lane = slot.lane;

      agent.t = (1.0 - (distBehind / circuitLength)) % 1.0;
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
      agent.attackTimer = 0; // 시작 직후 급발진으로 인한 플레이어 후미 추돌 방지
      agent.attackCooldown = 3.5 + idx * 2.0;
      agent.isDrafting = false;
      agent.driftTimer = 0;
      agent.steerDir = 0;

      // 그리드 박스 위치에 차량 스폰 (Y: 0.055m 지면 밀착)
      const gridPos = this.circuit.getGridPosition(idx);
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
   * 물리 충돌 엔진(CollisionManager) 피드백 반영으로 겹침 원천 차단
   */
  public syncFromPhysics(): void {
    if (!this.isActive) return;
    this.agents.forEach((agent) => {
      syncAgentFromPhysics(agent, this.circuit);
    });
  }

  /**
   * Rivals 주행 모드에서 플레이어의 실제 서킷 진행도 및 속도를 AI 인지 모델에 실시간 동기화
   */
  public syncPlayerState(progressT: number, speedMs: number, lap: number, laneOffset: number, pos: THREE.Vector3): void {
    if (!this.isActive || !this.isRivalsMode || !this.agents[0]) return;
    const p = this.agents[0];
    p.t = progressT;
    p.speedMs = speedMs;
    p.currentLap = lap;
    p.laneOffset = laneOffset;
    p.vehicle.position.copy(pos);
    p.hasPassedStartLine = true;
  }

  public update(delta: number, isRunning: boolean): void {
    if (!this.isActive || !isRunning) return;

    this.raceTimeMs += delta * 1000;
    const circuitLength = this.circuit.circuitCurve.getLength();
    const leader = this.getLeaderAgent();

    this.agents.forEach((agent, idx) => {
      if (!agent.vehicle.mesh.visible) return;

      // 서킷 코너 곡률 및 선회 방향 사전 계산 (추월 라인 선정 및 드리프트 판단)
      const futureT = (agent.t + 0.016) % 1.0;
      const currTangent = this.circuit.circuitCurve.getTangentAt(agent.t);
      const futureTangent = this.circuit.circuitCurve.getTangentAt(futureT);
      const curveAngle = currTangent.angleTo(futureTangent);
      const turnCrossY = currTangent.x * futureTangent.z - currTangent.z * futureTangent.x;
      const turnDir = turnCrossY > 0.001 ? 1 : (turnCrossY < -0.001 ? -1 : 0);

      // AI 주행 연산 (슬립스트림, 추월 기동, 팩 압축, 드리프트, 목표 속도)
      simulateOpponentAI(
        agent,
        this.agents,
        leader,
        circuitLength,
        delta,
        curveAngle,
        turnDir,
        currTangent.y,
        agent.isFinished || this.isAllFinished
      );

      // 서킷 곡선 진행도 전진
      agent.prevT = agent.t;
      const distTraveled = agent.speedMs * delta;
      agent.t = (agent.t + (distTraveled / circuitLength)) % 1.0;

      // 스타트/피니시 라인 및 섹터(S1, S2, 도착선) 통과 감지
      this.checkSectorAndLapProgress(agent, idx);

      // 3D 위치, 헤딩, 피치, 휠, 조명 갱신
      updateOpponentVisuals(agent, this.circuit, delta, curveAngle, currTangent);
    });
  }

  private checkSectorAndLapProgress(agent: OpponentAgent, idx: number): void {
    const isEligible = this.isRivalsMode ? (idx !== 0) : true;
    const displayName = (!this.isRivalsMode && idx === 0) ? 'Player' : agent.driverName;

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
      // shortcut: 서킷 정규화 t 비율(0.33, 0.66) 기반 섹터 체크, 서킷별 개별 체크포인트 3D 볼륨 충돌 매니저로 통합 시 업그레이드
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
  }

  private checkRaceFinish(): void {
    if (!this.isAllFinished) {
      this.isAllFinished = true;
    }
  }

  /**
   * 현재 선두(가장 랩 수가 많거나 t가 큰 활성) 차량 반환
   */
  public getLeaderAgent(): OpponentAgent {
    const getProg = (a: OpponentAgent) => {
      if (!a.vehicle.mesh.visible) return -999;
      return a.hasPassedStartLine ? (a.currentLap - 1) + a.t : a.t - 1.0;
    };

    let leader = this.agents[0];
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
