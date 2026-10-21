import type { CircuitId } from '../../data/circuits.ts';
import type { CircuitLeaderboardEntry } from './types.ts';

/**
 * 서킷별 공식 벤치마크 역대 상위 5위 기록 (오프라인/로컬 초기 Fallback)
 */
export const FALLBACK_LEADERBOARDS: Record<CircuitId, CircuitLeaderboardEntry[]> = {
  circuit_monaco: [
    { rank: 1, driverName: 'Ayrton_M', timeFormatted: '01:14.260' },
    { rank: 2, driverName: 'Schumacher_M', timeFormatted: '01:14.890' },
    { rank: 3, driverName: 'Leclerc_16', timeFormatted: '01:15.310' },
    { rank: 4, driverName: 'Verstappen_1', timeFormatted: '01:15.780' },
    { rank: 5, driverName: 'Hamilton_44', timeFormatted: '01:16.220' },
  ],
  circuit_monza: [
    { rank: 1, driverName: 'Barrichello_R', timeFormatted: '01:21.046' },
    { rank: 2, driverName: 'Hamilton_44', timeFormatted: '01:21.880' },
    { rank: 3, driverName: 'Raikkonen_K', timeFormatted: '01:22.120' },
    { rank: 4, driverName: 'Verstappen_1', timeFormatted: '01:22.540' },
    { rank: 5, driverName: 'Norris_4', timeFormatted: '01:23.010' },
  ],
  circuit_spa: [
    { rank: 1, driverName: 'Bottas_V', timeFormatted: '01:46.286' },
    { rank: 2, driverName: 'Hamilton_44', timeFormatted: '01:46.950' },
    { rank: 3, driverName: 'Raikkonen_K', timeFormatted: '01:47.410' },
    { rank: 4, driverName: 'Verstappen_1', timeFormatted: '01:47.880' },
    { rank: 5, driverName: 'Russell_63', timeFormatted: '01:48.340' },
  ],
  circuit_silverstone: [
    { rank: 1, driverName: 'Hamilton_44', timeFormatted: '01:27.097' },
    { rank: 2, driverName: 'Verstappen_1', timeFormatted: '01:27.420' },
    { rank: 3, driverName: 'Norris_4', timeFormatted: '01:27.810' },
    { rank: 4, driverName: 'Leclerc_16', timeFormatted: '01:28.150' },
    { rank: 5, driverName: 'Piastri_81', timeFormatted: '01:28.600' },
  ],
};
