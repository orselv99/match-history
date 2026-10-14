import * as THREE from 'three';
import { CheckpointTrigger } from './CircuitTrack.ts';

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

    // 현재 대기 중인 체크포인트 감지
    const targetCp = checkpoints[this.nextCheckpointIndex];
    if (!targetCp || !targetCp.position) return;

    const distSq = (carPos.x - targetCp.position.x) ** 2 + (carPos.z - targetCp.position.z) ** 2;

    if (distSq < targetCp.radius ** 2) {
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
  }
}
