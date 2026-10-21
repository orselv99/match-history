export interface FinishModalCallbacks {
  onReplay: () => void;
  onRestart: () => void;
  onTitle: () => void;
  onCaptureScreenshot?: () => string | void;
}

export interface CircuitLeaderboardEntry {
  rank: number;
  driverName: string;
  timeFormatted: string;
}
