export interface VehicleModelMetadata {
  id: 'gt_turbo' | 'formula_aero' | 'cyber_speedster';
  title: string;
  badge: string;
  speed: string;
  accel: string;
  downforce: string;
  handling: string;
  desc: string;
  maxSpeedMs: number;
  acceleration: number;
  braking: number;
  drag: number;
  wheelRadius: number;
  accentColor: number;
  scale: [number, number, number];
  headlightPos: {
    left: [number, number, number];
    right: [number, number, number];
  };
  tailLightPos: [number, number, number];
}

export const VEHICLE_MODELS: Record<string, VehicleModelMetadata> = {
  gt_turbo: {
    id: 'gt_turbo',
    title: 'GT-86 Turbo',
    badge: 'BALANCE COUPE',
    speed: '210 km/h',
    accel: '4.8s',
    downforce: 'MEDIUM',
    handling: 'STABLE',
    desc: '균형 잡힌 밸런스와 높은 컨트롤 안정성을 자랑하는 정통 후륜 스포츠 쿠페.',
    maxSpeedMs: 58.3,
    acceleration: 14.0,
    braking: 26.0,
    drag: 0.45,
    wheelRadius: 0.39,
    accentColor: 0xef4444,
    scale: [1.0, 1.0, 1.0], // 고유 3D 절차적 지오메트리 적용으로 정규화
    headlightPos: {
      left: [-0.72, 0.52, 2.15],
      right: [0.72, 0.52, 2.15],
    },
    tailLightPos: [0, 0.65, -2.35],
  },
  formula_aero: {
    id: 'formula_aero',
    title: 'Formula Aero',
    badge: 'DOWNFORCE AERO',
    speed: '228 km/h',
    accel: '2.6s',
    downforce: 'ULTRA HIGH',
    handling: 'RAZOR SHARP',
    desc: '극강의 다운포스와 날카로운 에이펙스 공략을 위해 설계된 초경량 포뮬러 머신.',
    maxSpeedMs: 62.5,
    acceleration: 17.5,
    braking: 32.0,
    drag: 0.40,
    wheelRadius: 0.40,
    accentColor: 0x38bdf8,
    scale: [1.0, 1.0, 1.0], // 고유 3D 절차적 지오메트리 적용으로 정규화
    headlightPos: {
      left: [-0.68, 0.26, 2.32],
      right: [0.68, 0.26, 2.32],
    },
    tailLightPos: [0, 0.36, -2.25],
  },
  cyber_speedster: {
    id: 'cyber_speedster',
    title: 'Cyber Speedster',
    badge: 'HYPER SPEED',
    speed: '242 km/h',
    accel: '3.2s',
    downforce: 'HIGH',
    handling: 'HYPER DYNAMIC',
    desc: '초고속 직선 주로와 하이퍼 스피드웨이를 압도하는 미래형 하이퍼 하이퍼카.',
    maxSpeedMs: 66.7,
    acceleration: 15.5,
    braking: 28.0,
    drag: 0.38,
    wheelRadius: 0.40,
    accentColor: 0x06b6d4,
    scale: [1.0, 1.0, 1.0], // 고유 3D 절차적 지오메트리 적용으로 정규화
    headlightPos: {
      left: [-0.75, 0.44, 2.26],
      right: [0.75, 0.44, 2.26],
    },
    tailLightPos: [0, 0.65, -2.35],
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
