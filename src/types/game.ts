export type GameMode = 'TITLE' | 'DRIVING' | 'REPLAY' | 'DEMO';
export type RaceState = 'READY' | 'START_CUTSCENE' | 'COUNTDOWN' | 'RUNNING' | 'FINISHED';

export interface KeyInputState {
  throttle: boolean;
  brake: boolean;
  steerLeft: boolean;
  steerRight: boolean;
  handbrake: boolean;
}

export interface LeaderboardRacerEntry {
  id: string;
  rank: number;
  driverName: string;
  isPlayer: boolean;
  color: string;
}

export interface GameUIState {
  speedKmh: number;
  gear: string;
  rpmRatio: number;
  currentLap: number;
  totalLaps: number;
  currentLapTimeStr: string;
  bestLapTimeStr: string;
  sectorsMs: number[];
  isDrifting: boolean;
  driftStamina: number;
  isSpinningOut: boolean;
  gameMode: GameMode;
  raceState: RaceState;
  countdownText?: string;
  countdownVisible: boolean;
  replayTimeStr?: string;
  inputState?: KeyInputState;
  currentRank?: number;
  totalRacers?: number;
  standings?: LeaderboardRacerEntry[];
}
