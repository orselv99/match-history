import { t } from '../i18n/I18nManager.ts';

export type VehicleModelId = 'gt_turbo' | 'formula_aero' | 'cyber_speedster' | 'lm_hypercar';

export interface VehicleModelMetadata {
  id: VehicleModelId;
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
  tailLightPos: {
    left: [number, number, number];
    right: [number, number, number];
  };
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
    get desc(): string {
      return t('wizard.carGtDesc');
    },
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
    tailLightPos: {
      left: [-0.68, 0.65, -2.25],
      right: [0.68, 0.65, -2.25],
    },
  },
  formula_aero: {
    id: 'formula_aero',
    title: 'Formula Aero',
    badge: 'DOWNFORCE AERO',
    speed: '228 km/h',
    accel: '2.6s',
    downforce: 'ULTRA HIGH',
    handling: 'RAZOR SHARP',
    get desc(): string {
      return t('wizard.carFormulaDesc');
    },
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
    tailLightPos: {
      left: [-0.55, 0.52, -2.15],
      right: [0.55, 0.52, -2.15],
    },
  },
  cyber_speedster: {
    id: 'cyber_speedster',
    title: 'Cyber Speedster',
    badge: 'HYPER SPEED',
    speed: '242 km/h',
    accel: '3.2s',
    downforce: 'HIGH',
    handling: 'HYPER DYNAMIC',
    get desc(): string {
      return t('wizard.carCyberDesc');
    },
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
    tailLightPos: {
      left: [-0.72, 0.62, -2.28],
      right: [0.72, 0.62, -2.28],
    },
  },
  lm_hypercar: {
    id: 'lm_hypercar',
    title: 'Apex Hypercar',
    badge: 'LE MANS PROTOTYPE',
    speed: '248 km/h',
    accel: '2.4s',
    downforce: 'MAXIMUM PROTOTYPE',
    handling: 'PRECISION RACER',
    get desc(): string {
      return t('wizard.carHyperDesc');
    },
    maxSpeedMs: 68.9,
    acceleration: 18.2,
    braking: 34.0,
    drag: 0.36,
    wheelRadius: 0.40,
    accentColor: 0x10b981,
    scale: [1.0, 1.0, 1.0],
    headlightPos: {
      left: [-0.78, 0.42, 2.30],
      right: [0.78, 0.42, 2.30],
    },
    tailLightPos: {
      left: [-0.82, 0.64, -2.32],
      right: [0.82, 0.64, -2.32],
    },
  },
};

export interface OpponentConfig {
  id: number;
  driverName: string;
  color: string;
  baseSpeed: number;
  laneOffset: number;
}

export const OPPONENT_CONFIGS: OpponentConfig[] = [
  { id: 1, driverName: '스피드마스터', color: '#ef4444', baseSpeed: 47.0, laneOffset: -2.2 },
  { id: 2, driverName: 'Monaco Ghost', color: '#c45a72', baseSpeed: 49.2, laneOffset: 2.2 },
  { id: 3, driverName: '질주본능', color: '#7dd3fc', baseSpeed: 45.8, laneOffset: -2.2 },
  { id: 4, driverName: 'Turbo Nova', color: '#f59e0b', baseSpeed: 48.0, laneOffset: 2.2 },
];
