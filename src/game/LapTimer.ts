import * as THREE from 'three';
import type { CheckpointTrigger } from './CircuitTrack.ts';

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

  private nextCheckpointIndex: number = 1; // 0번(Start) 이후 1번(Sector 1)부터 대기
  private lastCheckpointTimestamp: number = 0;
  private currentSectorIndex: number = 0;
  private prevCarPos: THREE.Vector3 = new THREE.Vector3();
  private hasPrevCarPos: boolean = false;

  constructor(totalLaps: number = 3) {
    this.totalLaps = totalLaps;
  }

  public update(deltaMs: number, carPos: THREE.Vector3, checkpoints: CheckpointTrigger[], onCheckpointPassed?: (cpId: number) => void): void {
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

    if (distSq < targetCp.radius ** 2) {
      // 1. 역주행 감지: 차량의 이동 방향이 트랙 진행 방향과 일치하는지 확인
      if (targetCp.direction) {
        const moveX = carPos.x - this.prevCarPos.x;
        const moveZ = carPos.z - this.prevCarPos.z;
        const moveDistSq = moveX * moveX + moveZ * moveZ;
        if (moveDistSq > 0.0001) {
          const fwdDot = moveX * targetCp.direction.x + moveZ * targetCp.direction.z;
          if (fwdDot <= 0) {
            // 역주행 중에는 체크포인트 통과 불인정
            this.prevCarPos.copy(carPos);
            return;
          }
        }

        // 2. 게이트 통과 검증: 반경에 진입했더라도 게이트 라인(-1.2m)에 도달하기 전 조기 트리거 방지
        const distAlong = dx * targetCp.direction.x + dz * targetCp.direction.z;
        if (distAlong < -1.2) {
          this.prevCarPos.copy(carPos);
          return;
        }
      }

      // 체크포인트 통과 성공
      const sectorTime = this.currentLapTimeMs - this.lastCheckpointTimestamp;
      this.currentSectorTimes[this.currentSectorIndex] = Math.round(sectorTime);
      this.lastCheckpointTimestamp = this.currentLapTimeMs;
      this.currentSectorIndex = (this.currentSectorIndex + 1) % 3;

      if (onCheckpointPassed) {
        onCheckpointPassed(targetCp.id);
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
    this.nextCheckpointIndex = 1;
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
    this.nextCheckpointIndex = 1;
    this.lastCheckpointTimestamp = 0;
    this.currentSectorIndex = 0;
    this.hasPrevCarPos = false;
  }
}
