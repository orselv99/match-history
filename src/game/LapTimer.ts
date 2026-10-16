import * as THREE from 'three';
import type { CheckpointTrigger } from './Circuit.ts';

export interface LapResult {
  lap: number;
  timeMs: number;
  sectorsMs: number[];
}

/**
 * 랩 타임 및 체크포인트 순서 검증기
 */
export class LapTimer {
  public currentLap: number = 1;
  public totalLaps: number = 3; // 기본 3랩 완주
  public isStarted: boolean = false;
  public isFinished: boolean = false;

  public currentLapTimeMs: number = 0;
  public totalTimeMs: number = 0;
  public bestLapMs: number = Infinity;

  public lapHistory: LapResult[] = [];
  public currentSectorTimes: number[] = [0, 0, 0];

  private nextCheckpointIndex: number = 0; // 그리드 스폰 후 출발선(0번) 통과부터 대기
  private lastCheckpointTimestamp: number = 0;
  private currentSectorIndex: number = 0;
  private prevCarPos: THREE.Vector3 = new THREE.Vector3();
  private hasPrevCarPos: boolean = false;
  public hasPassedStartLine: boolean = false;

  constructor(totalLaps: number = 3) {
    this.totalLaps = totalLaps;
  }

  public update(deltaMs: number, carPos: THREE.Vector3, checkpoints: CheckpointTrigger[], onCheckpointPassed?: (cpId: number, sectorTimeMs: number) => void): void {
    if (this.isFinished) return;

    if (!this.isStarted) {
      return;
    }

    this.currentLapTimeMs += deltaMs;
    this.totalTimeMs += deltaMs;

    if (!checkpoints || checkpoints.length === 0) return;

    if (!this.hasPrevCarPos) {
      this.prevCarPos.copy(carPos);
      this.hasPrevCarPos = true;
      return;
    }

    // 현재 대기 중인 체크포인트 감지
    const targetCp = checkpoints[this.nextCheckpointIndex];
    if (!targetCp || !targetCp.position) {
      this.prevCarPos.copy(carPos);
      return;
    }

    const dx = carPos.x - targetCp.position.x;
    const dz = carPos.z - targetCp.position.z;
    const distSq = dx * dx + dz * dz;

    const dirX = targetCp.direction ? targetCp.direction.x : 0;
    const dirZ = targetCp.direction ? targetCp.direction.z : 1;

    // 현재 프레임 및 직전 프레임의 게이트 축 투영 거리 계산
    const currDistAlong = dx * dirX + dz * dirZ;
    const currDistLateral = Math.abs(-dx * dirZ + dz * dirX);

    // 게이트 좌우 폭(트랙 폭 반경) 내 주행 여부 검증
    if (currDistLateral > targetCp.radius) {
      this.prevCarPos.copy(carPos);
      return;
    }

    const prevDx = this.prevCarPos.x - targetCp.position.x;
    const prevDz = this.prevCarPos.z - targetCp.position.z;
    const prevDistAlong = prevDx * dirX + prevDz * dirZ;

    // 1. 역주행 및 게이트 평면 통과(Plane-crossing) 엄격 판정:
    // 직전 프레임은 게이트 진입부(<= 0.3m), 현재 프레임은 진출부(>= -0.3m)이며 정방향 전진일 때만 인정
    const isMovingForward = (currDistAlong - prevDistAlong) > 0.001;
    const isCrossingPlane = prevDistAlong <= 0.3 && currDistAlong >= -0.3;
    const isWithinSpeedWindow = prevDistAlong > -8.0 && currDistAlong < 8.0;

    if (isMovingForward && isCrossingPlane && isWithinSpeedWindow) {
      // 첫 랩 시작: 그리드에서 출발하여 첫 출발선 통과 시 랩 타이머 0초 초기화 (알림 제외)
      if (!this.hasPassedStartLine && targetCp.id === 0) {
        this.hasPassedStartLine = true;
        this.currentLap = 1;
        this.currentLapTimeMs = 0;
        this.lastCheckpointTimestamp = 0;
        this.currentSectorIndex = 0;
        this.nextCheckpointIndex = 1;
        this.prevCarPos.copy(carPos);
        return;
      }

      // 체크포인트 통과 성공
      const sectorTime = this.currentLapTimeMs - this.lastCheckpointTimestamp;
      const sectorTimeMs = Math.round(sectorTime);
      this.currentSectorTimes[this.currentSectorIndex] = sectorTimeMs;
      this.lastCheckpointTimestamp = this.currentLapTimeMs;
      this.currentSectorIndex = (this.currentSectorIndex + 1) % 3;

      if (onCheckpointPassed) {
        // 누적 랩타임을 전달하여 통과 순서와 타임스탬프 순서가 완전 일치하도록 보장
        onCheckpointPassed(targetCp.id, Math.round(this.currentLapTimeMs));
      }

      // 다음 체크포인트로 전환
      if (this.nextCheckpointIndex === 0) {
        // 랩 완주 (Start/Finish 라인 통과)
        this.onLapCompleted();
        this.nextCheckpointIndex = 1;
      } else {
        this.nextCheckpointIndex = (this.nextCheckpointIndex + 1) % checkpoints.length;
      }
    }

    this.prevCarPos.copy(carPos);
  }

  public start(): void {
    this.isStarted = true;
    this.isFinished = false;
    this.currentLap = 1;
    this.currentLapTimeMs = 0;
    this.totalTimeMs = 0;
    this.nextCheckpointIndex = 0;
    this.hasPassedStartLine = false;
    this.lastCheckpointTimestamp = 0;
    this.currentSectorIndex = 0;
    this.currentSectorTimes = [0, 0, 0];
    this.hasPrevCarPos = false;
  }

  private onLapCompleted(): void {
    const lapRecord: LapResult = {
      lap: this.currentLap,
      timeMs: Math.round(this.currentLapTimeMs),
      sectorsMs: [...this.currentSectorTimes]
    };

    this.lapHistory.push(lapRecord);
    if (lapRecord.timeMs < this.bestLapMs) {
      this.bestLapMs = lapRecord.timeMs;
    }

    if (this.currentLap >= this.totalLaps) {
      // 경기 완전 종료
      this.isFinished = true;
    } else {
      // 다음 랩 시작
      this.currentLap++;
      this.currentLapTimeMs = 0;
      this.lastCheckpointTimestamp = 0;
      this.currentSectorIndex = 0;
      this.currentSectorTimes = [0, 0, 0];
    }
  }

  public reset(): void {
    this.isStarted = false;
    this.isFinished = false;
    this.currentLap = 1;
    this.currentLapTimeMs = 0;
    this.totalTimeMs = 0;
    this.bestLapMs = Infinity;
    this.lapHistory = [];
    this.currentSectorTimes = [0, 0, 0];
    this.nextCheckpointIndex = 0;
    this.hasPassedStartLine = false;
    this.lastCheckpointTimestamp = 0;
    this.currentSectorIndex = 0;
    this.hasPrevCarPos = false;
  }
}
