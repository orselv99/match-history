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
}

/**
 * 4대의 컴퓨터 자동주행 레이서 관리자 (AI Multi-Car Simulation)
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

    AI_CAR_CONFIGS.forEach((cfg) => {
      const vehicle = new Vehicle(false);
      this.customizeCarColor(vehicle, cfg.color);

      this.agents.push({
        id: cfg.id,
        name: cfg.name,
        vehicle,
        t: 0,
        prevT: 0,
        speedMs: 0,
        baseSpeedMs: cfg.baseSpeed,
        maxSpeedMs: cfg.baseSpeed + 8.5,
        laneOffset: cfg.laneOffset,
        targetLaneOffset: cfg.laneOffset,
        color: cfg.color,
        currentLap: 1,
        isFinished: false,
      });

      this.group.add(vehicle.mesh);
    });

    this.group.visible = false;
  }

  private customizeCarColor(vehicle: Vehicle, hexColor: number): void {
    vehicle.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        if (child.material.color.getHex() === 0xef4444) {
          child.material = new THREE.MeshStandardMaterial({
            color: hexColor,
            roughness: 0.3,
            metalness: 0.6,
          });
        }
      }
    });
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

  public update(delta: number, isRunning: boolean): void {
    if (!this.isActive) return;

    if (!isRunning) {
      // 카운트다운 대기 중: 그리드에 정지 상태 유지
      return;
    }

    const trackLength = this.track.trackCurve.getLength();

    this.agents.forEach((agent) => {
      if (!agent.vehicle.mesh.visible) return;

      if (agent.isFinished) {
        // 완주 후 서서히 감속
        agent.speedMs = Math.max(0, agent.speedMs - 15.0 * delta);
        if (agent.speedMs <= 0.1) return;
      } else {
        // 1. 코너 곡률에 따른 가감속
        const futureT = (agent.t + 0.02) % 1.0;
        const currTangent = this.track.trackCurve.getTangentAt(agent.t);
        const futureTangent = this.track.trackCurve.getTangentAt(futureT);
        const curveAngle = currTangent.angleTo(futureTangent);

        const targetSpeed = curveAngle > 0.3 ? agent.baseSpeedMs * 0.65 : agent.maxSpeedMs;
        agent.speedMs += (targetSpeed - agent.speedMs) * Math.min(1.0, 3.5 * delta);

        // 고속 급선회 시 AI 차량도 드리프트 활성화
        agent.vehicle.isDrifting = curveAngle > 0.32 && agent.speedMs > 25.0;

        // 2. 주기적 레인 변경 (추월 시도 모션)
        if (Math.random() < 0.015) {
          agent.targetLaneOffset = (Math.random() * 5.0) - 2.5; // -2.5m ~ +2.5m
        }
        agent.laneOffset += (agent.targetLaneOffset - agent.laneOffset) * Math.min(1.0, 1.8 * delta);
      }

      // 3. 진행률 t 전진
      agent.prevT = agent.t;
      const distTraveled = agent.speedMs * delta;
      agent.t = (agent.t + (distTraveled / trackLength)) % 1.0;

      // 4. 스타트/피니시 라인 통과 감지 (t가 0.9x에서 0.0x로 랩어라운드할 때)
      if (agent.prevT > 0.85 && agent.t < 0.15) {
        agent.currentLap++;
        if (agent.currentLap > this.totalLaps) {
          agent.isFinished = true;
          this.checkRaceFinish();
        }
      }

      // 5. 위치 및 방향 계산
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
