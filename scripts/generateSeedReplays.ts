import * as THREE from 'three';
import * as fs from 'fs';
import * as path from 'path';
import { CIRCUIT_DEFINITIONS, type CircuitId } from '../src/data/circuits.ts';
import type { RawReplayTick, MatchSummaryMetadata, ReplayOpponentState } from '../src/replay/ReplayTypes.ts';
import type { CachedReplayRecord } from '../src/storage/schema.ts';

interface SeedConfig {
  matchCode: string;
  driverName: string;
  circuitId: CircuitId;
  vehicleModelId: string;
  color: string;
  targetLapMs: number;
  topSpeedKmh: number;
  opponents: Array<{ driverName: string; vehicleModelId: string; color: string; offsetDist: number; lane: number }>;
  viewMode: 'FIRST_PERSON' | 'THIRD_PERSON';
}

const SEED_CONFIGS: SeedConfig[] = [
  // 1. Monaco
  {
    matchCode: 'SEED-MONACO-01',
    driverName: 'Charles L.',
    circuitId: 'circuit_monaco',
    vehicleModelId: 'formula_aero',
    color: '#ef4444',
    targetLapMs: 75310,
    topSpeedKmh: 218.4,
    opponents: [
      { driverName: 'Max V.', vehicleModelId: 'lm_hypercar', color: '#1e3a8a', offsetDist: -12, lane: 2.2 },
      { driverName: 'Lewis H.', vehicleModelId: 'gt_turbo', color: '#06b6d4', offsetDist: -28, lane: -2.0 },
      { driverName: 'Lando N.', vehicleModelId: 'cyber_speedster', color: '#f97316', offsetDist: -48, lane: 1.5 },
    ],
    viewMode: 'FIRST_PERSON',
  },
  {
    matchCode: 'SEED-MONACO-02',
    driverName: 'Ayrton M.',
    circuitId: 'circuit_monaco',
    vehicleModelId: 'gt_turbo',
    color: '#eab308',
    targetLapMs: 78420,
    topSpeedKmh: 205.2,
    opponents: [
      { driverName: 'Alain P.', vehicleModelId: 'gt_turbo', color: '#3b82f6', offsetDist: -15, lane: -1.8 },
      { driverName: 'Nigel M.', vehicleModelId: 'formula_aero', color: '#10b981', offsetDist: -32, lane: 2.0 },
      { driverName: 'Nelson P.', vehicleModelId: 'cyber_speedster', color: '#8b5cf6', offsetDist: -52, lane: -1.2 },
    ],
    viewMode: 'THIRD_PERSON',
  },

  // 2. Monza
  {
    matchCode: 'SEED-MONZA-01',
    driverName: 'Lewis H.',
    circuitId: 'circuit_monza',
    vehicleModelId: 'formula_aero',
    color: '#e2e8f0',
    targetLapMs: 81880,
    topSpeedKmh: 245.8,
    opponents: [
      { driverName: 'Kimi R.', vehicleModelId: 'formula_aero', color: '#dc2626', offsetDist: -18, lane: 2.5 },
      { driverName: 'Fernando A.', vehicleModelId: 'lm_hypercar', color: '#047857', offsetDist: -38, lane: -2.2 },
      { driverName: 'Sebastian V.', vehicleModelId: 'gt_turbo', color: '#1e40af', offsetDist: -65, lane: 1.0 },
    ],
    viewMode: 'THIRD_PERSON',
  },
  {
    matchCode: 'SEED-MONZA-02',
    driverName: 'Ghost Runner',
    circuitId: 'circuit_monza',
    vehicleModelId: 'cyber_speedster',
    color: '#06b6d4',
    targetLapMs: 83450,
    topSpeedKmh: 242.1,
    opponents: [
      { driverName: 'Apex Hunter', vehicleModelId: 'formula_aero', color: '#ef4444', offsetDist: -14, lane: -2.0 },
      { driverName: 'Speed Demon', vehicleModelId: 'lm_hypercar', color: '#f59e0b', offsetDist: -36, lane: 2.2 },
      { driverName: 'Neon Drift', vehicleModelId: 'cyber_speedster', color: '#a855f7', offsetDist: -58, lane: -1.5 },
    ],
    viewMode: 'FIRST_PERSON',
  },

  // 3. Spa
  {
    matchCode: 'SEED-SPA-01',
    driverName: 'Max V.',
    circuitId: 'circuit_spa',
    vehicleModelId: 'lm_hypercar',
    color: '#1e3a8a',
    targetLapMs: 106950,
    topSpeedKmh: 248.5,
    opponents: [
      { driverName: 'Charles L.', vehicleModelId: 'formula_aero', color: '#dc2626', offsetDist: -22, lane: -2.4 },
      { driverName: 'George R.', vehicleModelId: 'formula_aero', color: '#06b6d4', offsetDist: -45, lane: 2.0 },
      { driverName: 'Carlos S.', vehicleModelId: 'gt_turbo', color: '#eab308', offsetDist: -72, lane: -1.8 },
    ],
    viewMode: 'THIRD_PERSON',
  },
  {
    matchCode: 'SEED-SPA-02',
    driverName: 'Kimi R.',
    circuitId: 'circuit_spa',
    vehicleModelId: 'formula_aero',
    color: '#f8fafc',
    targetLapMs: 108340,
    topSpeedKmh: 232.0,
    opponents: [
      { driverName: 'Michael S.', vehicleModelId: 'gt_turbo', color: '#b91c1c', offsetDist: -20, lane: 2.2 },
      { driverName: 'Mika H.', vehicleModelId: 'formula_aero', color: '#94a3b8', offsetDist: -42, lane: -2.5 },
      { driverName: 'David C.', vehicleModelId: 'lm_hypercar', color: '#2563eb', offsetDist: -68, lane: 1.2 },
    ],
    viewMode: 'FIRST_PERSON',
  },

  // 4. Silverstone
  {
    matchCode: 'SEED-SILVER-01',
    driverName: 'Apex Legend',
    circuitId: 'circuit_silverstone',
    vehicleModelId: 'lm_hypercar',
    color: '#065f46',
    targetLapMs: 87097,
    topSpeedKmh: 246.3,
    opponents: [
      { driverName: 'Lewis H.', vehicleModelId: 'formula_aero', color: '#06b6d4', offsetDist: -16, lane: -2.2 },
      { driverName: 'Max V.', vehicleModelId: 'lm_hypercar', color: '#1e3a8a', offsetDist: -35, lane: 2.5 },
      { driverName: 'Lando N.', vehicleModelId: 'gt_turbo', color: '#ea580c', offsetDist: -62, lane: -1.6 },
    ],
    viewMode: 'THIRD_PERSON',
  },
  {
    matchCode: 'SEED-SILVER-02',
    driverName: 'Norris 4',
    circuitId: 'circuit_silverstone',
    vehicleModelId: 'formula_aero',
    color: '#f97316',
    targetLapMs: 88650,
    topSpeedKmh: 234.7,
    opponents: [
      { driverName: 'Oscar P.', vehicleModelId: 'formula_aero', color: '#f59e0b', offsetDist: -18, lane: 2.0 },
      { driverName: 'Charles L.', vehicleModelId: 'gt_turbo', color: '#ef4444', offsetDist: -40, lane: -2.2 },
      { driverName: 'George R.', vehicleModelId: 'cyber_speedster', color: '#38bdf8', offsetDist: -70, lane: 1.5 },
    ],
    viewMode: 'FIRST_PERSON',
  },
];

function generateTicks(cfg: SeedConfig): RawReplayTick[] {
  const def = CIRCUIT_DEFINITIONS[cfg.circuitId];
  if (!def) throw new Error(`Unknown circuit: ${cfg.circuitId}`);

  const curve = new THREE.CatmullRomCurve3(def.controlPoints, true, 'centripetal');
  const circuitLength = curve.getLength();

  // 15Hz 고정 샘플링 (Catmull-Rom 스플라인 보간으로 60/120fps 부드러운 재생 유지 및 파일 경량화)
  const FPS = 15;
  const dtSec = 1 / FPS;
  const dtMs = 1000 / FPS;
  const totalTicks = Math.round((cfg.targetLapMs / 1000) * FPS);

  const ticks: RawReplayTick[] = [];
  const pt = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const right = new THREE.Vector3();
  const oppPt = new THREE.Vector3();
  const oppTangent = new THREE.Vector3();
  const oppRight = new THREE.Vector3();

  // 진행도 누적
  let currentT = 0;

  for (let i = 0; i < totalTicks; i++) {
    const timeMs = Math.round(i * dtMs);
    const progress = i / totalTicks;
    currentT = progress % 1.0;

    curve.getPointAt(currentT, pt);
    curve.getTangentAt(currentT, tangent).normalize();
    right.set(-tangent.z, 0, tangent.x).normalize();

    // 곡률 추정 (전방 샘플과 비교)
    const nextT = (currentT + 0.015) % 1.0;
    const nextTangent = curve.getTangentAt(nextT).normalize();
    const dot = THREE.MathUtils.clamp(tangent.dot(nextTangent), -1, 1);
    const angle = Math.acos(dot); // 코너 각도
    const crossY = tangent.x * nextTangent.z - tangent.z * nextTangent.x;
    const turnDir = crossY > 0 ? 1 : -1;

    // 코너 곡률에 따른 가감속 물리 모델링
    const cornerFactor = Math.min(1.0, angle / 0.35); // 0(직선) ~ 1(급코너)
    const minSpeedKmh = 95.0;
    const speedKmh = cfg.topSpeedKmh - (cfg.topSpeedKmh - minSpeedKmh) * cornerFactor;

    // 조향 및 드리프트
    const steer = THREE.MathUtils.clamp(-turnDir * cornerFactor * 1.3, -1.0, 1.0);
    const isDrifting = cornerFactor > 0.65 && speedKmh > 130.0;
    const throttle = cornerFactor < 0.3 ? 1.0 : (1.0 - cornerFactor * 0.8);
    const brake = cornerFactor > 0.5 ? (cornerFactor - 0.5) * 1.6 : 0.0;

    const heading = Math.atan2(tangent.x, tangent.z);
    const pitch = -Math.asin(THREE.MathUtils.clamp(tangent.y, -0.45, 0.45));
    const roll = isDrifting ? steer * 0.06 : 0;

    // 경쟁 차량 3대 동시 상태 생성
    const opponents: ReplayOpponentState[] = cfg.opponents.map((opp) => {
      const oppDistOffset = opp.offsetDist;
      let oppT = (currentT + oppDistOffset / circuitLength) % 1.0;
      if (oppT < 0) oppT += 1.0;

      curve.getPointAt(oppT, oppPt);
      curve.getTangentAt(oppT, oppTangent).normalize();
      oppRight.set(-oppTangent.z, 0, oppTangent.x).normalize();

      oppPt.addScaledVector(oppRight, opp.lane);
      oppPt.y = Math.max(0, oppPt.y) + 0.055;

      const oppHeading = Math.atan2(oppTangent.x, oppTangent.z);
      const oppPitch = -Math.asin(THREE.MathUtils.clamp(oppTangent.y, -0.45, 0.45));

      return {
        x: Number(oppPt.x.toFixed(2)),
        y: Number(oppPt.y.toFixed(2)),
        z: Number(oppPt.z.toFixed(2)),
        yaw: Number(oppHeading.toFixed(3)),
        pitch: Number(oppPitch.toFixed(3)),
        speedKmh: Number((speedKmh * 0.98).toFixed(1)),
        isDrifting: false,
      };
    });

    const playerPos = pt.clone();
    playerPos.y = Math.max(0, playerPos.y) + 0.055;

    ticks.push({
      timeMs,
      x: Number(playerPos.x.toFixed(2)),
      y: Number(playerPos.y.toFixed(2)),
      z: Number(playerPos.z.toFixed(2)),
      yaw: Number(heading.toFixed(3)),
      pitch: Number(pitch.toFixed(3)),
      roll: Number(roll.toFixed(3)),
      speedKmh: Number(speedKmh.toFixed(1)),
      steer: Number(steer.toFixed(2)),
      throttle: Number(throttle.toFixed(2)),
      brake: Number(brake.toFixed(2)),
      isDrifting,
      lap: 1,
      opponents,
    });
  }

  return ticks;
}

function formatMs(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const milli = ms % 1000;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${milli.toString().padStart(3, '0')}`;
}

function main() {
  const seedRecords: CachedReplayRecord[] = [];

  for (const cfg of SEED_CONFIGS) {
    console.log(`Generating ticks for ${cfg.matchCode} (${cfg.driverName} on ${cfg.circuitId})...`);
    const ticks = generateTicks(cfg);

    const s1 = Math.round(cfg.targetLapMs * 0.32);
    const s2 = Math.round(cfg.targetLapMs * 0.36);
    const s3 = cfg.targetLapMs - s1 - s2;

    const totalTimeMs = cfg.targetLapMs * 3; // 3랩 기준 매치 서머리
    const lapTimesMs = [
      cfg.targetLapMs + 1200,
      cfg.targetLapMs,
      cfg.targetLapMs + 450,
    ];

    const metadata: MatchSummaryMetadata = {
      matchCode: cfg.matchCode,
      userId: `user_${cfg.matchCode.toLowerCase()}`,
      driverName: cfg.driverName,
      circuitId: cfg.circuitId,
      vehicleModelId: cfg.vehicleModelId,
      color: cfg.color,
      opponentConfigs: cfg.opponents.map((o) => ({
        driverName: o.driverName,
        vehicleModelId: o.vehicleModelId,
        color: o.color,
      })),
      totalLaps: 3,
      totalTimeMs,
      bestLapMs: cfg.targetLapMs,
      lapTimesMs,
      sectorTimesMs: [
        [s1 + 400, s2 + 500, s3 + 300],
        [s1, s2, s3],
        [s1 + 150, s2 + 200, s3 + 100],
      ],
      topSpeedKmh: cfg.topSpeedKmh,
      avgSpeedKmh: Number((cfg.topSpeedKmh * 0.74).toFixed(1)),
      createdAt: new Date(Date.now() - Math.floor(Math.random() * 86400000 * 5)).toISOString(),
      rawJsonBytes: ticks.length * 120,
      quantizedBinaryBytes: ticks.length * 20 + 26,
      compressedBytes: Math.round(ticks.length * 6),
      compressionRatioPercent: 95.2,
      viewMode: cfg.viewMode,
      raceResults: [
        { rank: 1, driverName: cfg.driverName, timeMs: totalTimeMs, timeFormatted: formatMs(totalTimeMs), isPlayer: true, color: cfg.color },
        { rank: 2, driverName: cfg.opponents[0].driverName, timeMs: totalTimeMs + 2410, timeFormatted: formatMs(totalTimeMs + 2410), isPlayer: false, color: cfg.opponents[0].color },
        { rank: 3, driverName: cfg.opponents[1].driverName, timeMs: totalTimeMs + 5890, timeFormatted: formatMs(totalTimeMs + 5890), isPlayer: false, color: cfg.opponents[1].color },
        { rank: 4, driverName: cfg.opponents[2].driverName, timeMs: totalTimeMs + 9230, timeFormatted: formatMs(totalTimeMs + 9230), isPlayer: false, color: cfg.opponents[2].color },
      ],
    };

    seedRecords.push({
      matchCode: cfg.matchCode,
      ticks,
      metadata,
      createdAt: metadata.createdAt,
      savedAt: Date.now() - 3600000 * 24 * 2,
    });
  }

  const outDir = path.resolve('public', 'data');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outFile = path.join(outDir, 'seed-replays.json');
  fs.writeFileSync(outFile, JSON.stringify(seedRecords));
  const stat = fs.statSync(outFile);
  console.log(`\n Successfully generated ${seedRecords.length} seed replays to:`);
  console.log(`  -> ${outFile}`);
  console.log(`  -> File size: ${(stat.size / 1024).toFixed(1)} KB`);
}

main();
