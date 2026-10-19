import * as THREE from 'three';
import * as fs from 'fs';
import * as path from 'path';
import { CIRCUIT_DEFINITIONS, type CircuitId } from '../src/data/circuits.ts';
import type { RawReplayTick, MatchSummaryMetadata, ReplayOpponentState } from '../src/replay/ReplayTypes.ts';
import type { CachedReplayRecord } from '../src/storage/schema.ts';

// 1. 미리 정해진 영어3, 한국어3 드라이버 이름 (반복 사용)
const PREDEFINED_DRIVERS = [
  'Apex Hunter',   // EN 1
  '스피드마스터',  // KR 1
  'Ghost Runner', // EN 2
  '질주본능',      // KR 2
  'Turbo Nova',   // EN 3
  '한밤의질주',    // KR 3
];

const VEHICLE_MODELS = ['formula_aero', 'gt_turbo', 'cyber_speedster', 'lm_hypercar'];
const COLORS = ['#ef4444', '#38bdf8', '#f59e0b', '#10b981', '#a855f7', '#f43f5e', '#e2e8f0', '#06b6d4'];

interface CircuitSeedPlan {
  circuitId: CircuitId;
  prefix: string;
  count: number;
  baseLapMs: number;
  baseTopSpeed: number;
}

const CIRCUIT_PLANS: CircuitSeedPlan[] = [
  { circuitId: 'circuit_monaco', prefix: 'SEED-MC', count: 13, baseLapMs: 74260, baseTopSpeed: 216.0 },
  { circuitId: 'circuit_monza', prefix: 'SEED-MZ', count: 13, baseLapMs: 81046, baseTopSpeed: 246.0 },
  { circuitId: 'circuit_spa', prefix: 'SEED-SP', count: 12, baseLapMs: 106286, baseTopSpeed: 248.0 },
  { circuitId: 'circuit_silverstone', prefix: 'SEED-SS', count: 12, baseLapMs: 87097, baseTopSpeed: 244.0 },
];

function generateTicksForSeed(
  circuitId: CircuitId,
  targetLapMs: number,
  topSpeedKmh: number,
  playerRank: number,
  opponentsConfig: Array<{ offsetDist: number; lane: number }>
): RawReplayTick[] {
  const def = CIRCUIT_DEFINITIONS[circuitId];
  if (!def) throw new Error(`Unknown circuit: ${circuitId}`);

  const curve = new THREE.CatmullRomCurve3(def.controlPoints, true, 'centripetal');
  const circuitLength = curve.getLength();

  // 8Hz 샘플링 (Catmull-Rom 스플라인 3차 보간으로 60/120fps 부드러운 재생 유지 및 50개 파일 대폭 경량화)
  const FPS = 8;
  const dtMs = 1000 / FPS;
  const totalTicks = Math.round((targetLapMs / 1000) * FPS);

  const ticks: RawReplayTick[] = [];
  const pt = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const right = new THREE.Vector3();
  const oppPt = new THREE.Vector3();
  const oppTangent = new THREE.Vector3();
  const oppRight = new THREE.Vector3();

  for (let i = 0; i < totalTicks; i++) {
    const timeMs = Math.round(i * dtMs);
    const currentT = (i / totalTicks) % 1.0;

    curve.getPointAt(currentT, pt);
    curve.getTangentAt(currentT, tangent).normalize();
    right.set(-tangent.z, 0, tangent.x).normalize();

    // 전방 샘플링으로 곡률 및 선회 방향 계산
    const nextT = (currentT + 0.015) % 1.0;
    const nextTangent = curve.getTangentAt(nextT).normalize();
    const dot = THREE.MathUtils.clamp(tangent.dot(nextTangent), -1, 1);
    const cornerAngle = Math.acos(dot);
    const crossY = tangent.x * nextTangent.z - tangent.z * nextTangent.x;
    const turnDir = crossY > 0 ? 1 : -1;

    // 코너링 감속 물리
    const cornerFactor = Math.min(1.0, cornerAngle / 0.35);
    const minSpeedKmh = 95.0;
    const speedKmh = topSpeedKmh - (topSpeedKmh - minSpeedKmh) * cornerFactor;

    const steer = THREE.MathUtils.clamp(-turnDir * cornerFactor * 1.3, -1.0, 1.0);
    const isDrifting = cornerFactor > 0.65 && speedKmh > 130.0;
    const throttle = cornerFactor < 0.3 ? 1.0 : (1.0 - cornerFactor * 0.8);
    const brake = cornerFactor > 0.5 ? (cornerFactor - 0.5) * 1.6 : 0.0;

    const heading = Math.atan2(tangent.x, tangent.z);
    const pitch = -Math.asin(THREE.MathUtils.clamp(tangent.y, -0.45, 0.45));
    const roll = isDrifting ? steer * 0.06 : 0;

    // 라이벌 3대 위치 계산 (순위에 따라 앞서거나 뒤쳐짐)
    const opponents: ReplayOpponentState[] = opponentsConfig.map((opp) => {
      let oppT = (currentT + opp.offsetDist / circuitLength) % 1.0;
      if (oppT < 0) oppT += 1.0;

      curve.getPointAt(oppT, oppPt);
      curve.getTangentAt(oppT, oppTangent).normalize();
      oppRight.set(-oppTangent.z, 0, oppTangent.x).normalize();

      oppPt.addScaledVector(oppRight, opp.lane);
      oppPt.y = Math.max(0, oppPt.y) + 0.055;

      const oppHeading = Math.atan2(oppTangent.x, oppTangent.z);

      return {
        x: Number(oppPt.x.toFixed(2)),
        y: Number(oppPt.y.toFixed(2)),
        z: Number(oppPt.z.toFixed(2)),
        yaw: Number(oppHeading.toFixed(3)),
        speedKmh: Number((speedKmh * 0.98).toFixed(1)),
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
  let globalIndex = 0;

  for (const plan of CIRCUIT_PLANS) {
    for (let cIdx = 0; cIdx < plan.count; cIdx++) {
      const matchNum = (cIdx + 1).toString().padStart(2, '0');
      const matchCode = `${plan.prefix}-${matchNum}`;

      // 1. 이름은 미리 정해진 영어3, 한국어3 을 순환 반복
      const driverName = PREDEFINED_DRIVERS[globalIndex % PREDEFINED_DRIVERS.length];
      const vehicleModelId = VEHICLE_MODELS[globalIndex % VEHICLE_MODELS.length];
      const color = COLORS[globalIndex % COLORS.length];
      const viewMode: 'FIRST_PERSON' | 'THIRD_PERSON' = (globalIndex % 2 === 0) ? 'THIRD_PERSON' : 'FIRST_PERSON';

      // 2. 순위 다양화 (1위만이 아니라 2위, 3위, 4위로 완주한 매치도 포함)
      // cIdx가 0, 4, 8 -> 1위 / 1, 5, 9 -> 2위 / 2, 6, 10 -> 3위 / 3, 7, 11 -> 4위
      const playerRank = (cIdx % 4) + 1;

      // 랩타임: 상위 순번일수록 빠름 (1위가 벤치마크 최고 기록)
      const targetLapMs = plan.baseLapMs + cIdx * 620;
      const topSpeedKmh = Number((plan.baseTopSpeed - cIdx * 0.8).toFixed(1));

      // 상대 차량 3대 설정 (playerRank에 따라 플레이어보다 앞서거나 뒤쳐짐)
      // playerRank가 1이면 플레이어가 맨 앞, playerRank가 2면 1대가 앞서감, 3이면 2대가 앞섬, 4면 3대 모두 앞섬
      const oppOffsetDistances = playerRank === 1
        ? [-14, -32, -54]
        : playerRank === 2
        ? [18, -16, -38]
        : playerRank === 3
        ? [28, 14, -22]
        : [42, 28, 14];

      const rivalPool = PREDEFINED_DRIVERS.filter(n => n !== driverName);
      const opponentConfigs = [
        {
          driverName: rivalPool[0 % rivalPool.length],
          vehicleModelId: VEHICLE_MODELS[(globalIndex + 1) % VEHICLE_MODELS.length],
          color: COLORS[(globalIndex + 2) % COLORS.length],
          offsetDist: oppOffsetDistances[0],
          lane: 2.2,
        },
        {
          driverName: rivalPool[1 % rivalPool.length],
          vehicleModelId: VEHICLE_MODELS[(globalIndex + 2) % VEHICLE_MODELS.length],
          color: COLORS[(globalIndex + 4) % COLORS.length],
          offsetDist: oppOffsetDistances[1],
          lane: -2.0,
        },
        {
          driverName: rivalPool[2 % rivalPool.length],
          vehicleModelId: VEHICLE_MODELS[(globalIndex + 3) % VEHICLE_MODELS.length],
          color: COLORS[(globalIndex + 6) % COLORS.length],
          offsetDist: oppOffsetDistances[2],
          lane: 1.4,
        },
      ];

      console.log(`[${globalIndex + 1}/50] Generating ${matchCode}: ${driverName} (${plan.circuitId}, Rank ${playerRank}, ${formatMs(targetLapMs)})`);

      const ticks = generateTicksForSeed(
        plan.circuitId,
        targetLapMs,
        topSpeedKmh,
        playerRank,
        opponentConfigs.map(o => ({ offsetDist: o.offsetDist, lane: o.lane }))
      );

      const s1 = Math.round(targetLapMs * 0.32);
      const s2 = Math.round(targetLapMs * 0.36);
      const s3 = targetLapMs - s1 - s2;
      const totalTimeMs = targetLapMs * 3;

      // 레이스 최종 순위표 구성
      const raceParticipants = [
        { driverName, color, isPlayer: true, rank: playerRank },
        { driverName: opponentConfigs[0].driverName, color: opponentConfigs[0].color, isPlayer: false, rank: 0 },
        { driverName: opponentConfigs[1].driverName, color: opponentConfigs[1].color, isPlayer: false, rank: 0 },
        { driverName: opponentConfigs[2].driverName, color: opponentConfigs[2].color, isPlayer: false, rank: 0 },
      ];

      // 나머지 3대 순위 배정 (1~4 중 playerRank 제외)
      const remainingRanks = [1, 2, 3, 4].filter(r => r !== playerRank);
      raceParticipants[1].rank = remainingRanks[0];
      raceParticipants[2].rank = remainingRanks[1];
      raceParticipants[3].rank = remainingRanks[2];

      raceParticipants.sort((a, b) => a.rank - b.rank);

      const raceResults = raceParticipants.map(p => {
        const timeOffset = (p.rank - 1) * 2100;
        const time = totalTimeMs + timeOffset;
        return {
          rank: p.rank,
          driverName: p.driverName,
          timeMs: time,
          timeFormatted: formatMs(time),
          isPlayer: p.isPlayer,
          color: p.color,
        };
      });

      const metadata: MatchSummaryMetadata = {
        matchCode,
        userId: `seed_${matchCode.toLowerCase()}`,
        driverName,
        circuitId: plan.circuitId,
        vehicleModelId,
        color,
        opponentConfigs: opponentConfigs.map(o => ({
          driverName: o.driverName,
          vehicleModelId: o.vehicleModelId,
          color: o.color,
        })),
        totalLaps: 3,
        totalTimeMs,
        bestLapMs: targetLapMs,
        lapTimesMs: [targetLapMs + 950, targetLapMs, targetLapMs + 420],
        sectorTimesMs: [
          [s1 + 350, s2 + 400, s3 + 200],
          [s1, s2, s3],
          [s1 + 120, s2 + 180, s3 + 120],
        ],
        topSpeedKmh,
        avgSpeedKmh: Number((topSpeedKmh * 0.74).toFixed(1)),
        createdAt: new Date(Date.now() - (50 - globalIndex) * 14400000).toISOString(),
        rawJsonBytes: ticks.length * 110,
        quantizedBinaryBytes: ticks.length * 20 + 26,
        compressedBytes: Math.round(ticks.length * 5.5),
        compressionRatioPercent: 95.5,
        viewMode,
        raceResults,
      };

      seedRecords.push({
        matchCode,
        ticks,
        metadata,
        createdAt: metadata.createdAt,
        savedAt: Date.now() - (50 - globalIndex) * 14400000,
      });

      globalIndex++;
    }
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
  console.log(`  -> Total File Size: ${(stat.size / (1024 * 1024)).toFixed(2)} MB (${(stat.size / 1024).toFixed(1)} KB)`);
}

main();
