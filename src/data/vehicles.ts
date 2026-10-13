export interface VehicleModelMetadata {
  id: 'gt_turbo' | 'formula_aero' | 'cyber_speedster';
  title: string;
  speed: string;
  accel: string;
  downforce: string;
  handling: string;
  desc: string;
  maxSpeedMs: number;
  acceleration: number;
  scale: [number, number, number];
}

export const VEHICLE_MODELS: Record<string, VehicleModelMetadata> = {
  gt_turbo: {
    id: 'gt_turbo',
    title: 'GT-86 Turbo',
    speed: '210 km/h',
    accel: '4.8s',
    downforce: 'MEDIUM',
    handling: 'STABLE',
    desc: '균형 잡힌 밸런스와 높은 컨트롤 안정성을 자랑하는 정통 후륜 스포츠 쿠페.',
    maxSpeedMs: 58.3,
    acceleration: 14.0,
    scale: [1.0, 1.0, 1.0],
  },
  formula_aero: {
    id: 'formula_aero',
    title: 'Formula Aero',
    speed: '228 km/h',
    accel: '2.6s',
    downforce: 'ULTRA HIGH',
    handling: 'RAZOR SHARP',
    desc: '극강의 다운포스와 날카로운 에이펙스 공략을 위해 설계된 초경량 포뮬러 머신.',
    maxSpeedMs: 62.5,
    acceleration: 17.5,
    scale: [0.92, 0.75, 1.05],
  },
  cyber_speedster: {
    id: 'cyber_speedster',
    title: 'Cyber Speedster',
    speed: '242 km/h',
    accel: '3.2s',
    downforce: 'HIGH',
    handling: 'HYPER DYNAMIC',
    desc: '초고속 직선 주로와 하이퍼 스피드웨이를 압도하는 미래형 하이퍼 하이퍼카.',
    maxSpeedMs: 66.7,
    acceleration: 15.5,
    scale: [1.05, 0.85, 1.12],
  },
};

export interface AICarConfig {
  id: number;
  name: string;
  color: number;
  baseSpeed: number;
  laneOffset: number;
}

export const AI_CAR_CONFIGS: AICarConfig[] = [
  { id: 1, name: 'AI_01 // APEX_RED', color: 0xef4444, baseSpeed: 47.0, laneOffset: -2.2 },
  { id: 2, name: 'AI_02 // SWISS_ROSE', color: 0xc45a72, baseSpeed: 49.2, laneOffset: 2.2 },
  { id: 3, name: 'AI_03 // PASTEL_SKY', color: 0x7dd3fc, baseSpeed: 45.8, laneOffset: -2.2 },
  { id: 4, name: 'AI_04 // AMBER_GOLD', color: 0xf59e0b, baseSpeed: 48.0, laneOffset: 2.2 },
];
