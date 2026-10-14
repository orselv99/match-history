export interface BgmTrack {
  id: string;
  title: string;
  artist: string;
  genre: string;
  fileName: string;
}

/**
 * 로비 배경음악 트랙 (2곡)
 * 실제 파일 위치: public/audio/bgm/lobby/
 */
export const LOBBY_BGM_TRACKS: readonly BgmTrack[] = [
  {
    id: 'silk_drive',
    title: 'Silk Drive',
    artist: 'NEO SOUND LAB & K-SYNTH',
    genre: 'Chilled Synthwave',
    fileName: 'silk-drive.ogg'
  },
  {
    id: 'velvet_drive',
    title: 'Velvet Drive',
    artist: 'CYBER VELVET TRIO feat. M. ORSEL',
    genre: 'Smooth Electro Funk',
    fileName: 'velvet-drive.ogg'
  },
] as const;

/**
 * 인게임 레이스 주행 배경음악 트랙 (6곡)
 * 실제 파일 위치: public/audio/bgm/ingame/
 */
export const INGAME_BGM_TRACKS: readonly BgmTrack[] = [
  {
    id: 'apex_velocity',
    title: 'Apex Velocity',
    artist: 'APEX SOUNDWORKS feat. KENJI SATO',
    genre: 'High-Octane D&B',
    fileName: 'apex-velocity.ogg'
  },
  {
    id: 'final_lap_breakpoint',
    title: 'Final Lap Breakpoint',
    artist: 'CIRCUIT BREAKERS & OVERDRIVE FX',
    genre: 'Cyber Tech House',
    fileName: 'final-lap-breakpoint.ogg'
  },
  {
    id: 'mach_aero',
    title: 'Mach Aero',
    artist: 'TURBO DYNAMICS ORCHESTRA',
    genre: 'Aero Eurobeat',
    fileName: 'mach-aero.ogg'
  },
  {
    id: 'midnight_gridlock',
    title: 'Midnight Gridlock',
    artist: 'SYNTHWAVE RUNNERS CLUB',
    genre: 'Midnight Retrowave',
    fileName: 'midnight-gridlock.ogg'
  },
  {
    id: 'neon_overdrive',
    title: 'Neon Overdrive',
    artist: 'CYBERPUNK HIGHWAY feat. DJ VORTEX',
    genre: 'Hard Darksynth',
    fileName: 'neon-overdrive.ogg'
  },
  {
    id: 'redline_friction',
    title: 'Redline Friction',
    artist: 'REDLINE MOTORSPORTS ENSEMBLE',
    genre: 'Industrial Speed Metal',
    fileName: 'redline-friction.ogg'
  },
] as const;
