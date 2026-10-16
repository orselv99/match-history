export interface ReplayOpponentState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch?: number;
  speedKmh: number;
  isDrifting?: boolean;
}

/**
 * 3D 주행 리플레이 원시 틱 데이터 (인메모리 런타임용)
 */
export interface RawReplayTick {
  timeMs: number;       // 주행 시작 후 경과 시간 (ms)
  x: number;            // X 좌표 (m)
  y: number;            // Y 좌표 (m)
  z: number;            // Z 좌표 (m)
  yaw: number;          // Yaw 각도 (라디안, -PI ~ PI)
  pitch: number;        // Pitch 각도 (라디안)
  roll: number;         // Roll 각도 (라디안)
  speedKmh: number;     // 시속 (km/h)
  steer: number;        // 조향 입력 (-1.0 ~ 1.0)
  throttle: number;     // 가속 페달 (0.0 ~ 1.0)
  brake: number;        // 브레이크 페달 (0.0 ~ 1.0)
  isDrifting: boolean;  // 드리프트 상태 여부
  lap: number;          // 현재 랩 번호 (1, 2, 3...)
  opponents?: ReplayOpponentState[]; // 동승 레이스 경쟁 차량들 위치/회전 상태
}

export interface RaceResultEntry {
  rank: number;
  driverName: string;
  timeMs: number;
  timeFormatted: string;
  isPlayer: boolean;
  color?: string;
}

/**
 * 경기 완주 요약 메타데이터 (전적 DB 저장용)
 */
export interface MatchSummaryMetadata {
  matchCode: string;
  userId: string;
  driverName: string;
  circuitId: string;
  vehicleModelId: string;
  color?: string;
  opponentConfigs?: Array<{ vehicleModelId?: string; color?: string; driverName?: string }>;
  totalLaps: number;
  totalTimeMs: number;
  bestLapMs: number;
  lapTimesMs: number[];
  sectorTimesMs: number[][]; // [lap1: [s1, s2, s3], lap2: ...]
  topSpeedKmh: number;
  avgSpeedKmh: number;
  createdAt: string;
  rawJsonBytes?: number;
  quantizedBinaryBytes?: number;
  compressedBytes?: number;
  compressionRatioPercent?: number; // e.g. 98.5%
  raceResults?: RaceResultEntry[];
}

/**
 * 틱당 20바이트 고정 바이너리 패킷 레이아웃 상수
 */
export const REPLAY_PACKET = {
  HEADER_MAGIC: 0x52414345, // 'RACE' (4 bytes)
  VERSION: 1,               // 2 bytes uint16
  TICK_BYTES: 20,           // 틱당 20 바이트 고정
  SAMPLE_RATE_HZ: 30,       // 30Hz
  SAMPLE_INTERVAL_MS: 33.333
} as const;
