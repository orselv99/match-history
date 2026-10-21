import * as THREE from 'three';
import * as fs from 'fs';
import * as path from 'path';
import { CIRCUIT_DEFINITIONS, STARTING_GRID_SLOTS, type CircuitId } from '../src/data/circuits.ts';
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
 * - 출발 시 4대 차량 모두 「 」 그리드 마킹 박스 내 정중앙에 수평 정차(speed=0, yaw=메인스트레이트 정방향)
 * - 결승선 통과 전에는 메인 스트레이트 직선 궤적 주행, 결승선 통과 후 서킷 스플라인 곡선에 부드럽게 합류
 * - 차량 속도(km/h)와 3D 트랙 실제 이동 거리(m)를 100% 일치시켜 실제 주행과 리플레이 속도감이 완벽히 동일함
 */
function generateTicksForSeed(
  circuitId: CircuitId,
  topSpeedKmh: number,
  playerRank: number,
  opponentsConfig: Array<{ offsetDist: number; lane: number }>,
  cIdx: number,
  playerSlot: number
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

  // 15Hz 샘플링 (66.6ms당 1틱) - 정밀 궤적 및 100MB 이내 고밀도 시뮬레이션
  const FPS = 15;
  const dt = 1 / FPS;
  const dtMs = 1000 / FPS;

  const ticks: RawReplayTick[] = [];
  const tangent = new THREE.Vector3();

  // 4개 그리드 슬롯 배치 결정 (STARTING_GRID_SLOTS 단일 소스 참조)
  const oppSlots = [0, 1, 2, 3].filter(s => s !== playerSlot);

  const playerInitDist = -STARTING_GRID_SLOTS[playerSlot].distBehind;
  const playerInitLane = -STARTING_GRID_SLOTS[playerSlot].lane; // startRight 좌표계 변환

  const oppInitDists = oppSlots.map(s => -STARTING_GRID_SLOTS[s].distBehind);
  const oppInitLanes = oppSlots.map(s => -STARTING_GRID_SLOTS[s].lane);

  // 3D 위치 및 회전각 산출 함수 (서킷 스플라인 곡선 추종으로 모든 그리드 슬롯이 100% 서킷 위에 정렬)
  function getVehiclePose(vDist: number, vInitLane: number, targetLane: number): {
    pos: THREE.Vector3;
    heading: number;
    pitch: number;
    roll: number;
  } {
    const pos = new THREE.Vector3();
    const t = ((vDist / circuitLength) % 1.0 + 1.0) % 1.0;
    curve.getPointAt(t, pos);
    const tan = curve.getTangentAt(t).normalize();
    const r = new THREE.Vector3(-tan.z, 0, tan.x).normalize();

    // 출발 후 45m 구간에 걸쳐 그리드 레인에서 레이싱 레인으로 부드럽게 합류 (출발선 이전은 그리드 레인 유지)
    const blendOut = vDist <= 0 ? 0 : Math.min(1.0, vDist / 45.0);
    const lane = THREE.MathUtils.lerp(vInitLane, targetLane, blendOut);
    pos.addScaledVector(r, lane);
    pos.y = Math.max(0, pos.y) + 0.055;

    const heading = Math.atan2(tan.x, tan.z);
    const pitch = -Math.asin(THREE.MathUtils.clamp(tan.y, -0.45, 0.45));
    return {
      pos,
      heading,
      pitch,
      roll: 0,
    };
  }

  let dist = playerInitDist;
  let timeMs = 0;
  let prevDist = dist;
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

  // 1. Tick 0: 모든 차량이 그리드 마킹 「 」 박스 내에 0km/h로 완벽히 정렬된 정차 틱 추가
  const initPlayerPose = getVehiclePose(playerInitDist, playerInitLane, 0);
  const initOpponents: ReplayOpponentState[] = opponentsConfig.map((opp, oppIdx) => {
    const oppPose = getVehiclePose(oppInitDists[oppIdx], oppInitLanes[oppIdx], opp.lane);
    return {
      x: Number(oppPose.pos.x.toFixed(2)),
      y: Number(oppPose.pos.y.toFixed(2)),
      z: Number(oppPose.pos.z.toFixed(2)),
      yaw: Number(oppPose.heading.toFixed(3)),
      speedKmh: 0,
    };
  });

  ticks.push({
    timeMs: 0,
    x: Number(initPlayerPose.pos.x.toFixed(2)),
    y: Number(initPlayerPose.pos.y.toFixed(2)),
    z: Number(initPlayerPose.pos.z.toFixed(2)),
    yaw: Number(initPlayerPose.heading.toFixed(3)),
    pitch: 0,
    roll: 0,
    speedKmh: 0,
    steer: 0,
    throttle: 1.0,
    brake: 0,
    isDrifting: false,
    lap: 1,
    opponents: initOpponents,
  });

  while (lap <= 3) {
    // 랩 1 스타트 가속 시뮬레이션
    let speedKmh = 0;
    if (timeMs < 2500) {
      speedKmh = Math.max(12, (timeMs / 2500) * (actualTopSpeed * 0.88));
    } else {
      speedKmh = actualTopSpeed;
    }

    let cornerFactor = 0;
    let turnDir = 0;

    if (dist > 0) {
      const currentT = (dist / circuitLength) % 1.0;
      curve.getTangentAt(currentT, tangent).normalize();
      const nextT = (currentT + 0.02) % 1.0;
      const nextTangent = curve.getTangentAt(nextT).normalize();
      const dot = THREE.MathUtils.clamp(tangent.dot(nextTangent), -1, 1);
      const cornerAngle = Math.acos(dot);
      const crossY = tangent.x * nextTangent.z - tangent.z * nextTangent.x;
      turnDir = crossY > 0 ? 1 : -1;
      cornerFactor = Math.min(1.0, cornerAngle / 0.35);

      const targetCornerSpeed = actualTopSpeed - (actualTopSpeed - minCornerSpeedKmh) * cornerFactor;
      speedKmh = Math.min(speedKmh, targetCornerSpeed);
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

    const playerPose = getVehiclePose(dist, playerInitLane, 0);

    // 라이벌 3대 동시 3D 위치 및 주행 계산 (엎치락뒤치락 추월 및 차체 충돌 불꽃 스파크 시뮬레이션)
    const opponents: ReplayOpponentState[] = opponentsConfig.map((opp, oppIdx) => {
      let oppDist = 0;
      const raceProgress = dist > 0 ? THREE.MathUtils.clamp(dist / (3 * circuitLength), 0, 1) : 0;
      
      // 3개 랩 전체에 걸쳐 랩마다 2~3회 이상 엎치락뒤치락(Lead Changes) 발생하는 다중 주파수 오버테이크 파동
      const lapProgress = dist / circuitLength;
      const overtakeWave = Math.sin(lapProgress * Math.PI * 2.2 + oppIdx * 1.8 + cIdx * 0.7) * 22.0
                         + Math.cos(lapProgress * Math.PI * 4.4 + oppIdx * 2.5) * 9.0;
      // 결승선(마지막 반 바퀴, raceProgress > 0.75)에서는 각 차량의 최종 순위(opp.offsetDist)로 부드럽게 수렴
      const convergeWeight = Math.pow(THREE.MathUtils.clamp((raceProgress - 0.75) / 0.25, 0, 1), 2.0);
      const dynamicOffset = opp.offsetDist * convergeWeight + (opp.offsetDist * 0.15 + overtakeWave) * (1.0 - convergeWeight);

      if (dist <= 0) {
        oppDist = oppInitDists[oppIdx] + (dist - playerInitDist);
      } else {
        // 결승선 통과 직후(0~50m) 초기 슬롯 간격에서 레이스 동적 간격(dynamicOffset)으로 부드럽게 전환
        const launchBlend = Math.min(1.0, dist / 50.0);
        const startDiff = oppInitDists[oppIdx] - playerInitDist;
        const currentOffset = THREE.MathUtils.lerp(startDiff, dynamicOffset, launchBlend);
        oppDist = dist + currentOffset;
      }

      let laneOffset = opp.lane;
      const distDiff = Math.abs(oppDist - dist);
      if (dist > 30 && distDiff < 3.5 && distDiff > 0.4) {
        if (Math.abs(opp.lane) < 3.0) {
          laneOffset = opp.lane > 0 ? 2.12 : -2.12;
        }
      }

      const oppPose = getVehiclePose(oppDist, oppInitLanes[oppIdx], laneOffset);

      return {
        x: Number(oppPose.pos.x.toFixed(2)),
        y: Number(oppPose.pos.y.toFixed(2)),
        z: Number(oppPose.pos.z.toFixed(2)),
        yaw: Number(oppPose.heading.toFixed(3)),
        speedKmh: Math.round(speedKmh * 0.98),
      };
    });

    ticks.push({
      timeMs: Math.round(timeMs),
      x: Number(playerPose.pos.x.toFixed(2)),
      y: Number(playerPose.pos.y.toFixed(2)),
      z: Number(playerPose.pos.z.toFixed(2)),
      yaw: Number(playerPose.heading.toFixed(3)),
      pitch: Number(playerPose.pitch.toFixed(3)),
      roll: isDrifting ? Number((steer * 0.06).toFixed(3)) : 0,
      speedKmh: Number(speedKmh.toFixed(1)),
      steer: Number(steer.toFixed(2)),
      throttle: Number(throttle.toFixed(2)),
      brake: Number(brake.toFixed(2)),
      isDrifting,
      lap: Math.min(3, Math.max(1, lap)),
      opponents,
    });

    // 출발선 통과 감지 (dist 이전 < 0 && 현재 >= 0)
    if (prevDist < 0 && dist >= 0) {
      lapStartTimeMs = timeMs;
      currentSector = 1;
    }

    if (dist > 0) {
      const currentT = (dist / circuitLength) % 1.0;

      // 정밀 서브틱(sub-tick) 보간을 통한 밀리초 정밀도 섹터 타임 산출
      if (currentSector === 1 && currentT >= 0.33) {
        const frac = (prevT < currentT && (currentT - prevT) > 0.0001) ? THREE.MathUtils.clamp((0.33 - prevT) / (currentT - prevT), 0, 1) : 0.5;
        const exactTime = (timeMs - dtMs) + frac * dtMs;
        const lapJitter = ((cIdx * 17 + lap * 37) % 73) - 36;
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
      prevT = currentT;
    }

    prevDist = dist;
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
          lane: 2.25,
        },
        {
          driverName: rivalPool[1 % rivalPool.length],
          vehicleModelId: VEHICLE_MODELS[(globalIndex + 2) % VEHICLE_MODELS.length],
          color: COLORS[(globalIndex + 4) % COLORS.length],
          offsetDist: oppOffsetDistances[1],
          lane: -2.25,
        },
        {
          driverName: rivalPool[2 % rivalPool.length],
          vehicleModelId: VEHICLE_MODELS[(globalIndex + 3) % VEHICLE_MODELS.length],
          color: COLORS[(globalIndex + 6) % COLORS.length],
          offsetDist: oppOffsetDistances[2],
          lane: (cIdx % 2 === 0) ? -4.3 : 4.3,
        },
      ];

      // 시작 슬롯을 0(Pole), 1(P2), 2(P3), 3(P4)로 고르게 25%씩 분산
      const playerSlot = (cIdx * 3 + globalIndex) % 4;
      const sim = generateTicksForSeed(plan.circuitId, topSpeedKmh, playerRank, opponentConfigs, cIdx, playerSlot);

      // 3. 상대 차량 3대의 기록 산출 (밀리초 단위 실시간 주행 기반)
      const opponentsResult = opponentConfigs.map((opp, oppIdx) => {
        const gapMs = (oppIdx + 1) * 850 + ((cIdx * 37 + oppIdx * 19) % 350) - 175;
        const totalMs = playerRank === 1
          ? sim.totalTimeMs + gapMs
          : (playerRank === 2
              ? (oppIdx === 0 ? sim.totalTimeMs - 720 : sim.totalTimeMs + gapMs)
              : (playerRank === 3
                  ? (oppIdx <= 1 ? sim.totalTimeMs - (800 - oppIdx * 350) : sim.totalTimeMs + gapMs)
                  : sim.totalTimeMs - (1200 - oppIdx * 320)));

        const safeTotalMs = Math.max(sim.totalTimeMs * 0.9, Math.round(totalMs));
        const oppBestMs = Math.round(safeTotalMs / 3.03 + (oppIdx * 120));

        return {
          driverName: opp.driverName,
          vehicleModelId: opp.vehicleModelId,
          color: opp.color,
          totalTimeMs: safeTotalMs,
          totalTimeFormatted: formatMs(safeTotalMs),
          bestLapMs: oppBestMs,
          bestLapFormatted: formatMs(oppBestMs),
        };
      });

      // 4. 레이스 최종 완주 순위(1~4위) 배열 산출
      const allRacers = [
        {
          driverName,
          timeMs: sim.totalTimeMs,
          timeFormatted: formatMs(sim.totalTimeMs),
          isPlayer: true,
          color,
        },
        ...opponentsResult.map(opp => ({
          driverName: opp.driverName,
          timeMs: opp.totalTimeMs,
          timeFormatted: opp.totalTimeFormatted,
          isPlayer: false,
          color: opp.color,
        })),
      ].sort((a, b) => a.timeMs - b.timeMs);

      const raceResults = allRacers.map((r, idx) => ({
        rank: idx + 1,
        driverName: r.driverName,
        timeMs: r.timeMs,
        timeFormatted: r.timeFormatted,
        isPlayer: r.isPlayer,
        color: r.color,
      }));

      // 5. 메타데이터 생성 (통일된 최신 표준 스키마)
      const metadata: MatchSummaryMetadata = {
        matchCode,
        userId: `seed_pilot_${cIdx + 1}`,
        driverName,
        circuitId: plan.circuitId,
        vehicleModelId,
        color,
        viewMode,
        totalTimeMs: sim.totalTimeMs,
        totalTimeFormatted: formatMs(sim.totalTimeMs),
        bestLapMs: sim.bestLapMs,
        bestLapFormatted: formatMs(sim.bestLapMs),
        bestLapNum: sim.bestLapNum,
        lapTimesMs: sim.lapTimes,
        sectorTimesMs: sim.sectorTimes,
        avgSpeedKmh: sim.avgSpeedKmh,
        topSpeedKmh,
        rank: playerRank,
        totalLaps: 3,
        createdAt: new Date(Date.now() - (plan.count - cIdx) * 3600000 * 3).toISOString(),
        opponentConfigs,
        raceResults,
      };

      seedRecords.push({
        matchCode,
        metadata,
        ticks: sim.ticks,
        createdAt: metadata.createdAt,
        savedAt: new Date(metadata.createdAt).getTime(),
        compressed: false,
      });

      globalIndex++;
    }
  }

  const outDir = path.resolve(process.cwd(), 'public/data');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outFile = path.join(outDir, 'seed-replays.json');
  fs.writeFileSync(outFile, JSON.stringify(seedRecords));
  console.log(`Successfully generated ${seedRecords.length} high-frequency 3-lap replays (aligned to starting grids) to: ${outFile}`);
}

main();
