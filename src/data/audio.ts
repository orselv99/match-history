export interface BgmTrack {
  id: string;
  title: string;
  fileName: string;
}

/**
 * 타이틀 및 메인 메뉴 화면 배경음악 트랙 (2곡)
 * 실제 파일 위치: public/audio/bgm/
 */
export const TITLE_BGM_TRACKS: readonly BgmTrack[] = [
  { id: 'silk_drive', title: 'Silk Drive', fileName: 'silk-drive.ogg' },
  { id: 'velvet_drive', title: 'Velvet Drive', fileName: 'velvet-drive.ogg' },
] as const;

/**
 * 인게임 레이스 주행 배경음악 트랙 (6곡)
 * 실제 파일 위치: public/audio/bgm/
 */
export const INGAME_BGM_TRACKS: readonly BgmTrack[] = [
  { id: 'apex_velocity', title: 'Apex Velocity', fileName: 'apex-velocity.ogg' },
  { id: 'final_lap_breakpoint', title: 'Final Lap Breakpoint', fileName: 'final-lap-breakpoint.ogg' },
  { id: 'mach_aero', title: 'Mach Aero', fileName: 'mach-aero.ogg' },
  { id: 'midnight_gridlock', title: 'Midnight Gridlock', fileName: 'midnight-gridlock.ogg' },
  { id: 'neon_overdrive', title: 'Neon Overdrive', fileName: 'neon-overdrive.ogg' },
  { id: 'redline_friction', title: 'Redline Friction', fileName: 'redline-friction.ogg' },
] as const;
