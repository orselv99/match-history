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
  baseTopSpeed: number;
}

const CIRCUIT_PLANS: CircuitSeedPlan[] = [
  { circuitId: 'circuit_monaco', prefix: 'SEED-MC', count: 50, baseTopSpeed: 216.0 },
  { circuitId: 'circuit_monza', prefix: 'SEED-MZ', count: 50, baseTopSpeed: 246.0 },
  { circuitId: 'circuit_spa', prefix: 'SEED-SP', count: 50, baseTopSpeed: 248.0 },
  { circuitId: 'circuit_silverstone', prefix: 'SEED-SS', count: 50, baseTopSpeed: 244.0 },
];

/**
 * 인게임 물리 시뮬레이션 기반 3랩 주행 틱 및 정밀 메타데이터 생성
 * - 차량 속도(km/h)와 3D 트랙 실제 이동 거리(m)를 100% 일치시켜 실제 주행과 리플레이 속도감이 완벽히 동일함
 */
function generateTicksForSeed(
  circuitId: CircuitId,
  topSpeedKmh: number,
  playerRank: number,
  opponentsConfig: Array<{ offsetDist: number; lane: number }>,
  cIdx: number
): {
  ticks: RawReplayTick[];
  lapTimes: [number, number, number];
  totalTimeMs: number;
  bestLapMs: number;
  bestLapNum: number;
  sectorTimes: [number, number, number][];
  avgSpeedKmh: number;
} {
  const def = CIRCUIT_DEFINITIONS[circuitId];
  if (!def) throw new Error(`Unknown circuit: ${circuitId}`);

  const curve = new THREE.CatmullRomCurve3(def.controlPoints, true, 'centripetal');
  const circuitLength = curve.getLength();

  // 10Hz 샘플링 (0.1초당 1틱) - 3D 쿼터니언 Slerp 및 미니맵 실시간 보간과 완벽 호환, 50MB 이하 초경량화
  const FPS = 10;
  const dt = 1 / FPS;
  const dtMs = 1000 / FPS;

  const ticks: RawReplayTick[] = [];
  const pt = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const right = new THREE.Vector3();
  const oppPt = new THREE.Vector3();
  const oppTangent = new THREE.Vector3();
  const oppRight = new THREE.Vector3();

  let dist = 0;
  let timeMs = 0;
  let prevDist = 0;
  let prevT = 0;
  let lap = 1;
  const lapTimes: number[] = [];
  let lapStartTimeMs = 0;
  const sectorTimes: [number, number, number][] = [];
  let currentSector = 1;
  let s1TimeMs = 0;
  let s2TimeMs = 0;

  // 순위 및 드라이버 스킬에 따른 속도 미세 베리에이션
  const speedScale = 1.0 - (playerRank - 1) * 0.015 - (cIdx % 5) * 0.006;
  const actualTopSpeed = topSpeedKmh * speedScale;
  const minCornerSpeedKmh = circuitId === 'circuit_monaco' ? 142 : (circuitId === 'circuit_monza' ? 172 : (circuitId === 'circuit_spa' ? 158 : 155));

  let totalSpeedAccum = 0;
  let tickCount = 0;

  while (lap <= 3) {
    const currentT = (dist / circuitLength) % 1.0;

    curve.getPointAt(currentT, pt);
    curve.getTangentAt(currentT, tangent).normalize();
    right.set(-tangent.z, 0, tangent.x).normalize();

    // 전방 곡률 샘플링을 통한 현실적인 코너링 감속
    const nextT = (currentT + 0.02) % 1.0;
    const nextTangent = curve.getTangentAt(nextT).normalize();
    const dot = THREE.MathUtils.clamp(tangent.dot(nextTangent), -1, 1);
    const cornerAngle = Math.acos(dot);
    const crossY = tangent.x * nextTangent.z - tangent.z * nextTangent.x;
    const turnDir = crossY > 0 ? 1 : -1;

    const cornerFactor = Math.min(1.0, cornerAngle / 0.35);
    let speedKmh = actualTopSpeed - (actualTopSpeed - minCornerSpeedKmh) * cornerFactor;

    // 랩 1 스타트 가속 시뮬레이션
    if (lap === 1 && timeMs < 2500) {
      speedKmh = Math.min(speedKmh, (timeMs / 2500) * (actualTopSpeed * 0.88));
    }

    const speedMs = speedKmh / 3.6;
    dist += speedMs * dt;
    timeMs += dtMs;
    totalSpeedAccum += speedKmh;
    tickCount++;

    const steer = THREE.MathUtils.clamp(-turnDir * cornerFactor * 1.3, -1.0, 1.0);
    const isDrifting = cornerFactor > 0.65 && speedKmh > 130.0;
    const throttle = cornerFactor < 0.3 ? 1.0 : (1.0 - cornerFactor * 0.8);
    const brake = cornerFactor > 0.5 ? (cornerFactor - 0.5) * 1.6 : 0.0;

    const heading = Math.atan2(tangent.x, tangent.z);
    const pitch = -Math.asin(THREE.MathUtils.clamp(tangent.y, -0.45, 0.45));
    const roll = isDrifting ? steer * 0.06 : 0;

    // 라이벌 3대 동시 3D 위치 및 주행 계산 (엎치락뒤치락 추월 및 차체 충돌 불꽃 스파크 시뮬레이션)
    const opponents: ReplayOpponentState[] = opponentsConfig.map((opp, oppIdx) => {
      // 엎치락뒤치락 순위 역전 파동 (전체 레이스 진행도 기준 사인파 오프셋 진동)
      const raceProgress = THREE.MathUtils.clamp(dist / (3 * circuitLength), 0, 1);
      // 각 차량별로 위상을 다르게 주어 레이스 중 서로 앞서거니 뒤서거니 추월 발생
      const wave = Math.sin(raceProgress * Math.PI * 5 + oppIdx * 1.9) * 16.0;
      // 결승선(3랩 종반부)에 다다르면 지정된 최종 완주 순위(playerRank)로 안정 수렴
      const blend = Math.pow(raceProgress, 1.8);
      const dynamicOffset = opp.offsetDist * blend + (opp.offsetDist + wave) * (1 - blend);

      let oppT = (currentT + dynamicOffset / circuitLength) % 1.0;
      if (oppT < 0) oppT += 1.0;

      curve.getPointAt(oppT, oppPt);
      curve.getTangentAt(oppT, oppTangent).normalize();
      oppRight.set(-oppTangent.z, 0, oppTangent.x).normalize();

      // 머신끼리 부딪혀서 불꽃 튀는 차체 접촉(Wheel-to-wheel contact) 시뮬레이션
      let laneOffset = opp.lane;
      // 플레이어와 전후 거리가 2.4m 이내로 초근접할 때 차선을 서로 밀착시켜 충돌 스파크 유발
      if (Math.abs(dynamicOffset) < 2.4) {
        laneOffset = opp.lane > 0 ? 0.38 : -0.38;
      }

      oppPt.addScaledVector(oppRight, laneOffset);
      oppPt.y = Math.max(0, oppPt.y) + 0.055;

      const oppHeading = Math.atan2(oppTangent.x, oppTangent.z);

      return {
        x: Number(oppPt.x.toFixed(2)),
        y: Number(oppPt.y.toFixed(2)),
        z: Number(oppPt.z.toFixed(2)),
        yaw: Number(oppHeading.toFixed(3)),
        speedKmh: Math.round(speedKmh * 0.98),
      };
    });

    const playerPos = pt.clone();
    playerPos.y = Math.max(0, playerPos.y) + 0.055;

    ticks.push({
      timeMs: Math.round(timeMs),
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
      lap,
      opponents,
    });

    // 정밀 서브틱(sub-tick) 보간을 통한 밀리초 정밀도 섹터 타임 산출 (소수점 00 고정 제거)
    if (currentSector === 1 && currentT >= 0.33) {
      const frac = (prevT < currentT && (currentT - prevT) > 0.0001) ? THREE.MathUtils.clamp((0.33 - prevT) / (currentT - prevT), 0, 1) : 0.5;
      const exactTime = (timeMs - dtMs) + frac * dtMs;
      const lapJitter = ((cIdx * 17 + lap * 37) % 73) - 36; // 주행 랩별 현실적 밀리초 편차
      s1TimeMs = Math.max(1200, Math.round(exactTime - lapStartTimeMs + lapJitter));
      currentSector = 2;
    } else if (currentSector === 2 && currentT >= 0.66) {
      const frac = (prevT < currentT && (currentT - prevT) > 0.0001) ? THREE.MathUtils.clamp((0.66 - prevT) / (currentT - prevT), 0, 1) : 0.5;
      const exactTime = (timeMs - dtMs) + frac * dtMs;
      const lapJitter = ((cIdx * 29 + lap * 43) % 89) - 44;
      s2TimeMs = Math.max(1200, Math.round(exactTime - lapStartTimeMs - s1TimeMs + lapJitter));
      currentSector = 3;
    }

    // 랩 완료 체크
    if (dist >= lap * circuitLength) {
      const targetDist = lap * circuitLength;
      const frac = (dist > prevDist) ? THREE.MathUtils.clamp((targetDist - prevDist) / (dist - prevDist), 0, 1) : 0.5;
      const exactFinishTime = (timeMs - dtMs) + frac * dtMs;
      const lapDuration = Math.round(exactFinishTime - lapStartTimeMs);
      const s3TimeMs = Math.max(1200, lapDuration - s1TimeMs - s2TimeMs);

      lapTimes.push(lapDuration);
      sectorTimes.push([s1TimeMs, s2TimeMs, s3TimeMs]);

      lapStartTimeMs = exactFinishTime;
      currentSector = 1;
      s1TimeMs = 0;
      s2TimeMs = 0;
      lap++;
    }

    prevDist = dist;
    prevT = currentT;
  }

  const bestLapMs = Math.min(...lapTimes);
  const bestLapIndex = lapTimes.indexOf(bestLapMs);
  const bestLapNum = bestLapIndex >= 0 ? bestLapIndex + 1 : 1;
  const avgSpeedKmh = Number((totalSpeedAccum / (tickCount || 1)).toFixed(1));

  return {
    ticks,
    lapTimes: [lapTimes[0], lapTimes[1], lapTimes[2]],
    totalTimeMs: Math.round(timeMs),
    bestLapMs,
    bestLapNum,
    sectorTimes,
    avgSpeedKmh,
  };
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

      // 1. 이름은 미리 정해진 영어3, 한국어3 순환 반복
      const driverName = PREDEFINED_DRIVERS[globalIndex % PREDEFINED_DRIVERS.length];
      const vehicleModelId = VEHICLE_MODELS[globalIndex % VEHICLE_MODELS.length];
      const color = COLORS[globalIndex % COLORS.length];
      const viewMode: 'FIRST_PERSON' | 'THIRD_PERSON' = (globalIndex % 2 === 0) ? 'THIRD_PERSON' : 'FIRST_PERSON';

      // 2. 순위 다양화 (1~4위 완주)
      const playerRank = (cIdx % 4) + 1;
      const topSpeedKmh = Number((plan.baseTopSpeed - (cIdx % 5) * 1.5).toFixed(1));

      // 상대 차량 3대 설정
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

      const { ticks, lapTimes, totalTimeMs, bestLapMs, bestLapNum, sectorTimes, avgSpeedKmh } = generateTicksForSeed(
        plan.circuitId,
        topSpeedKmh,
        playerRank,
        opponentConfigs.map(o => ({ offsetDist: o.offsetDist, lane: o.lane })),
        cIdx
      );

      console.log(`[${globalIndex + 1}/50] Generating Realistic 3-LAP ${matchCode}: ${driverName} (${plan.circuitId}, Rank ${playerRank}, Best: ${formatMs(bestLapMs)}, Total: ${formatMs(totalTimeMs)})`);

      // 레이스 최종 순위표 구성
      const raceParticipants = [
        { driverName, color, isPlayer: true, rank: playerRank },
        { driverName: opponentConfigs[0].driverName, color: opponentConfigs[0].color, isPlayer: false, rank: 0 },
        { driverName: opponentConfigs[1].driverName, color: opponentConfigs[1].color, isPlayer: false, rank: 0 },
        { driverName: opponentConfigs[2].driverName, color: opponentConfigs[2].color, isPlayer: false, rank: 0 },
      ];

      const remainingRanks = [1, 2, 3, 4].filter(r => r !== playerRank);
      raceParticipants[1].rank = remainingRanks[0];
      raceParticipants[2].rank = remainingRanks[1];
      raceParticipants[3].rank = remainingRanks[2];

      raceParticipants.sort((a, b) => a.rank - b.rank);

      const raceResults = raceParticipants.map(p => {
        const timeOffset = (p.rank - 1) * 850;
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
        bestLapMs,
        bestLapNum,
        lapTimesMs: lapTimes,
        sectorTimesMs: sectorTimes,
        topSpeedKmh,
        avgSpeedKmh,
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
  console.log(`\n Successfully generated ${seedRecords.length} realistic physics 3-LAP seed replays to:`);
  console.log(`  -> ${outFile}`);
  console.log(`  -> Total File Size: ${(stat.size / (1024 * 1024)).toFixed(2)} MB (${(stat.size / 1024).toFixed(1)} KB)`);
}

main();
