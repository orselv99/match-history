import * as THREE from 'three';
import type { CachedReplayRecord } from '../../storage/schema.ts';
import { CIRCUIT_DEFINITIONS, type CircuitId } from '../../data/circuits.ts';

export interface CachedCircuit2D {
  points: Array<{ x: number; z: number }>;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  s1Index: number;
  s2Index: number;
}

/**
 * 전적 검색/리더보드 인스펙터 내 2D 캔버스 트랙 미니맵 리플레이 플레이어
 * - Catmull-Rom 서킷 제어점 2D 투영 및 Bounding Box 정규화 캐싱
 * - 섹터(S1, S2, S3) 컬러 경로 및 S/F, S1, S2 체크포인트 게이트/배지 시각화
 * - 플레이어 & AI 차량 보간(Lerp), 속도, 랩, 섹터 텔레메트리 HUD 렌더링
 * - 1.0x / 2.0x / 4.0x 배속 제어 및 타임라인 스크러버 탐색
 */
export class MinimapReplayPlayer {
  private static circuit2DCache = new Map<string, CachedCircuit2D>();

  private record: CachedReplayRecord | null = null;
  private currentTimeMs: number = 0;
  private isPlaying: boolean = false;
  private playbackSpeed: number = 1.0;
  private isScrubbing: boolean = false;
  private lastTimestamp: number = 0;
  private animId: number | null = null;

  // DOM 바인딩 요소
  private canvas: HTMLCanvasElement | null = null;
  private playBtn: HTMLElement | null = null;
  private speedBtn: HTMLElement | null = null;
  private scrubber: HTMLInputElement | null = null;
  private timeDisplay: HTMLElement | null = null;
  private telemetryInfo: HTMLElement | null = null;

  public getSpeed(): number {
    return this.playbackSpeed;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getCurrentTimeMs(): number {
    return this.currentTimeMs;
  }

  /**
   * 인스펙터 DOM 컨테이너에 미니맵 플레이어를 연결하고 초기 프레임을 렌더링합니다.
   */
  public attach(container: HTMLElement, record: CachedReplayRecord): void {
    this.stop();

    this.record = record;
    this.currentTimeMs = 0;
    this.isPlaying = false;
    this.isScrubbing = false;
    this.lastTimestamp = performance.now();

    // DOM 요소 캐싱
    this.canvas = container.querySelector('#inspector-minimap-canvas') as HTMLCanvasElement | null;
    this.playBtn = container.querySelector('#inspector-btn-play');
    this.speedBtn = container.querySelector('#inspector-btn-speed');
    this.scrubber = container.querySelector('#inspector-scrubber') as HTMLInputElement | null;
    this.timeDisplay = container.querySelector('#inspector-time-display');
    this.telemetryInfo = container.querySelector('#inspector-telemetry-info');

    if (this.playBtn) {
      this.playBtn.textContent = '▶';
    }
    if (this.speedBtn) {
      this.speedBtn.textContent = `${this.playbackSpeed.toFixed(1)}x`;
    }

    this.drawFrame();
    this.startLoop();
  }

  /**
   * 재생 / 일시정지 토글
   */
  public togglePlayPause(): boolean {
    if (!this.isPlaying) {
      const maxDur = this.record?.ticks[this.record.ticks.length - 1]?.timeMs || 0;
      if (this.currentTimeMs >= maxDur - 100) {
        this.currentTimeMs = 0;
      }
      this.isPlaying = true;
      if (this.playBtn) this.playBtn.textContent = '⏸';
    } else {
      this.isPlaying = false;
      if (this.playBtn) this.playBtn.textContent = '▶';
    }
    this.lastTimestamp = performance.now();
    return this.isPlaying;
  }

  /**
   * 배속 순환 (1.0x -> 2.0x -> 4.0x -> 1.0x)
   */
  public cyclePlaybackSpeed(): number {
    if (this.playbackSpeed === 1.0) {
      this.playbackSpeed = 2.0;
    } else if (this.playbackSpeed === 2.0) {
      this.playbackSpeed = 4.0;
    } else {
      this.playbackSpeed = 1.0;
    }

    if (this.speedBtn) {
      this.speedBtn.textContent = `${this.playbackSpeed.toFixed(1)}x`;
    }
    return this.playbackSpeed;
  }

  /**
   * 스크러버 탐색 (0 ~ 1 진행도)
   */
  public seekProgress(progress: number): void {
    if (!this.record || !this.record.ticks || this.record.ticks.length === 0) return;
    const totalDuration = this.record.ticks[this.record.ticks.length - 1].timeMs;
    this.currentTimeMs = Math.max(0, Math.min(totalDuration, progress * totalDuration));
    this.drawFrame();
  }

  /**
   * 스크러버 드래그 상태 설정
   */
  public setScrubbing(isScrubbing: boolean): void {
    this.isScrubbing = isScrubbing;
    if (!isScrubbing) {
      this.lastTimestamp = performance.now();
    }
  }

  /**
   * 미니맵 렌더 루프 시작
   */
  private startLoop(): void {
    const loop = () => {
      this.tick();
      if (this.animId !== null) {
        this.animId = requestAnimationFrame(loop);
      }
    };
    this.animId = requestAnimationFrame(loop);
  }

  /**
   * 미니맵 재생 및 애니메이션 중지
   */
  public stop(): void {
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    this.isPlaying = false;
  }

  /**
   * 매 프레임 시간 전진 및 드로우
   */
  private tick(): void {
    if (!this.record || !this.record.ticks || this.record.ticks.length === 0) return;

    const ticks = this.record.ticks;
    const maxDuration = ticks[ticks.length - 1].timeMs;

    if (this.isPlaying && !this.isScrubbing) {
      const now = performance.now();
      const dt = now - this.lastTimestamp;
      this.lastTimestamp = now;

      this.currentTimeMs += dt * this.playbackSpeed;
      if (this.currentTimeMs >= maxDuration) {
        this.currentTimeMs = maxDuration;
        this.isPlaying = false;
        if (this.playBtn) this.playBtn.textContent = '▶';
      }
      this.drawFrame();
    } else {
      this.lastTimestamp = performance.now();
    }
  }

  /**
   * 2D 미니맵 캔버스 프레임 드로우
   */
  public drawFrame(): void {
    if (!this.canvas || !this.record || !this.record.ticks || this.record.ticks.length === 0) return;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    const w = this.canvas.width;
    const h = this.canvas.height;

    // 1. 배경 클리어
    ctx.fillStyle = '#101319';
    ctx.fillRect(0, 0, w, h);

    // 2. 그리드 배경선
    ctx.strokeStyle = '#181c25';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // 3. 서킷 2D 정규화 좌표 계산
    const circuitId = this.record.metadata?.circuitId || 'circuit_monaco';
    const cData = this.getCircuit2D(circuitId);

    const pad = 24;
    const availW = w - pad * 2;
    const availH = h - pad * 2;
    const rangeX = cData.maxX - cData.minX || 1;
    const rangeZ = cData.maxZ - cData.minZ || 1;
    const scale = Math.min(availW / rangeX, availH / rangeZ);
    const midX = (cData.minX + cData.maxX) / 2;
    const midZ = (cData.minZ + cData.maxZ) / 2;

    const toX = (x: number) => (x - midX) * scale + w / 2;
    const toY = (z: number) => (z - midZ) * scale + h / 2;

    // 4. 서킷 트랙 렌더링
    // 4-1. 아스팔트 베이스 외곽 트랙
    ctx.beginPath();
    ctx.lineWidth = 11;
    ctx.strokeStyle = '#1e2330';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    cData.points.forEach((p, i) => {
      const cx = toX(p.x);
      const cy = toY(p.z);
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.closePath();
    ctx.stroke();

    // 4-2. 섹터 1, 2, 3 컬러 중심선 (S1: Sky Cyan, S2: Violet Purple, S3: Amber Gold)
    const drawSectorPath = (startIdx: number, endIdx: number, color: string) => {
      ctx.beginPath();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = startIdx; i <= endIdx; i++) {
        const p = cData.points[i % cData.points.length];
        const cx = toX(p.x);
        const cy = toY(p.z);
        if (i === startIdx) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    };

    drawSectorPath(0, cData.s1Index, '#38bdf8');
    drawSectorPath(cData.s1Index, cData.s2Index, '#a855f7');
    drawSectorPath(cData.s2Index, cData.points.length, '#f59e0b');

    // 4-3. 각 체크포인트 게이트 및 텍스트 배지 렌더링
    const drawCheckpointMarker = (idx: number, label: string, color: string, badgeOffset: { ox: number; oy: number }) => {
      const p = cData.points[idx % cData.points.length];
      const prevP = cData.points[(idx - 1 + cData.points.length) % cData.points.length];
      const nextP = cData.points[(idx + 1) % cData.points.length];

      const cx = toX(p.x);
      const cy = toY(p.z);

      const fwdX = toX(nextP.x) - toX(prevP.x);
      const fwdY = toY(nextP.z) - toY(prevP.z);
      const fwdLen = Math.hypot(fwdX, fwdY) || 1;
      const nx = -fwdY / fwdLen;
      const ny = fwdX / fwdLen;

      const halfGate = 6.5;
      ctx.beginPath();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = color;
      ctx.moveTo(cx - nx * halfGate, cy - ny * halfGate);
      ctx.lineTo(cx + nx * halfGate, cy + ny * halfGate);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();

      const bx = cx + badgeOffset.ox;
      const by = cy + badgeOffset.oy;
      ctx.save();
      ctx.font = 'bold 9px monospace';
      const tw = ctx.measureText(label).width;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (typeof (ctx as any).roundRect === 'function') {
        (ctx as any).roundRect(bx - 3, by - 8, tw + 6, 12, 2);
      } else {
        ctx.rect(bx - 3, by - 8, tw + 6, 12);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.fillText(label, bx, by + 1);
      ctx.restore();
    };

    drawCheckpointMarker(0, 'S/F', '#ffffff', { ox: 8, oy: -3 });
    drawCheckpointMarker(cData.s1Index, 'S1', '#38bdf8', { ox: 8, oy: -3 });
    drawCheckpointMarker(cData.s2Index, 'S2', '#a855f7', { ox: 8, oy: -3 });

    // 5. 현재 시간 전후 틱 검색 및 부드러운 위치 보간 (Lerp)
    const ticks = this.record.ticks;
    const maxDuration = ticks[ticks.length - 1].timeMs;

    let low = 0, high = ticks.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (ticks[mid].timeMs <= this.currentTimeMs) low = mid + 1;
      else high = mid - 1;
    }
    const i1 = Math.max(0, Math.min(ticks.length - 1, high));
    const i2 = Math.min(ticks.length - 1, i1 + 1);
    const t1 = ticks[i1];
    const t2 = ticks[i2];
    const dt = t2.timeMs - t1.timeMs;
    const alpha = dt > 0 ? THREE.MathUtils.clamp((this.currentTimeMs - t1.timeMs) / dt, 0, 1) : 0;

    const playerX = THREE.MathUtils.lerp(t1.x, t2.x, alpha);
    const playerZ = THREE.MathUtils.lerp(t1.z, t2.z, alpha);
    const currentSpeed = (this.currentTimeMs <= 50) ? 0 : THREE.MathUtils.lerp(t1.speedKmh, t2.speedKmh, alpha);
    const currentLap = t1.lap || 1;

    let dYaw = t2.yaw - t1.yaw;
    while (dYaw > Math.PI) dYaw -= Math.PI * 2;
    while (dYaw < -Math.PI) dYaw += Math.PI * 2;
    const currentYaw = t1.yaw + dYaw * alpha;

    // 트랙 최근접 점 기준으로 현재 섹터(1, 2, 3) 산출
    let closestIdx = 0;
    let minDistSq = Infinity;
    for (let i = 0; i < cData.points.length; i++) {
      const dx = cData.points[i].x - playerX;
      const dz = cData.points[i].z - playerZ;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDistSq) {
        minDistSq = distSq;
        closestIdx = i;
      }
    }
    let currentSector = 1;
    if (closestIdx >= cData.s2Index) {
      currentSector = 3;
    } else if (closestIdx >= cData.s1Index) {
      currentSector = 2;
    } else {
      currentSector = 1;
    }

    // 6. 라이벌 머신 3대 위치 보간 및 렌더링
    if (t1.opponents) {
      t1.opponents.forEach((opp1, oppIdx) => {
        const opp2 = t2.opponents?.[oppIdx] || opp1;
        const oppX = THREE.MathUtils.lerp(opp1.x, opp2.x, alpha);
        const oppZ = THREE.MathUtils.lerp(opp1.z, opp2.z, alpha);
        const ox = toX(oppX);
        const oy = toY(oppZ);
        const color = this.record?.metadata?.opponentConfigs?.[oppIdx]?.color || '#f59e0b';

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(ox, oy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }

    // 7. 플레이어 머신 렌더링
    const px = toX(playerX);
    const py = toY(playerZ);
    const playerColor = this.record.metadata?.color || '#38bdf8';

    // 120ms 앞선 궤적 위치 샘플링으로 헤딩 방향각 산출
    const lookaheadTimeMs = Math.min(maxDuration, this.currentTimeMs + 120);
    let dirX = 0;
    let dirY = 0;

    if (lookaheadTimeMs > this.currentTimeMs) {
      let fLow = 0, fHigh = ticks.length - 1;
      while (fLow <= fHigh) {
        const mid = (fLow + fHigh) >> 1;
        if (ticks[mid].timeMs <= lookaheadTimeMs) fLow = mid + 1;
        else fHigh = mid - 1;
      }
      const fi1 = Math.max(0, Math.min(ticks.length - 1, fHigh));
      const fi2 = Math.min(ticks.length - 1, fi1 + 1);
      const ft1 = ticks[fi1];
      const ft2 = ticks[fi2];
      const fdt = ft2.timeMs - ft1.timeMs;
      const fAlpha = fdt > 0 ? (lookaheadTimeMs - ft1.timeMs) / fdt : 0;
      const fwdX = THREE.MathUtils.lerp(ft1.x, ft2.x, fAlpha);
      const fwdZ = THREE.MathUtils.lerp(ft1.z, ft2.z, fAlpha);

      dirX = toX(fwdX) - px;
      dirY = toY(fwdZ) - py;
    }

    const moveLen = Math.hypot(dirX, dirY);
    if (moveLen > 0.05) {
      dirX /= moveLen;
      dirY /= moveLen;
    } else {
      dirX = Math.sin(currentYaw);
      dirY = Math.cos(currentYaw);
      const yawLen = Math.hypot(dirX, dirY) || 1;
      dirX /= yawLen;
      dirY /= yawLen;
    }

    const normX = -dirY;
    const normY = dirX;

    // 7-1. 플레이어 코어 도트
    ctx.save();
    ctx.shadowColor = playerColor;
    ctx.shadowBlur = 9;
    ctx.fillStyle = playerColor;
    ctx.beginPath();
    ctx.arc(px, py, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // 7-2. 날렵한 헤딩 화살표
    const tipDist = 13;
    const baseDist = 6;
    const wingWidth = 4.5;

    const tipX = px + dirX * tipDist;
    const tipY = py + dirY * tipDist;
    const leftX = px + dirX * baseDist + normX * wingWidth;
    const leftY = py + dirY * baseDist + normY * wingWidth;
    const rightX = px + dirX * baseDist - normX * wingWidth;
    const rightY = py + dirY * baseDist - normY * wingWidth;
    const innerX = px + dirX * (baseDist + 1.5);
    const innerY = py + dirY * (baseDist + 1.5);

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = playerColor;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(innerX, innerY);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 8. 캔버스 HUD 텍스트
    const totalLaps = this.record.metadata?.totalLaps || 3;
    const secBadgeColor = currentSector === 1 ? '#38bdf8' : (currentSector === 2 ? '#c084fc' : '#fbbf24');

    ctx.save();
    ctx.textAlign = 'right';

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`${currentSpeed.toFixed(0)} km/h`, w - 14, 18);

    ctx.font = 'bold 10px monospace';
    const secStr = `SEC ${currentSector}`;
    const secWidth = ctx.measureText(secStr).width;
    ctx.fillStyle = secBadgeColor;
    ctx.fillText(secStr, w - 14, 33);

    ctx.font = '10px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`LAP ${currentLap}/${totalLaps} · `, w - 14 - secWidth, 33);

    ctx.restore();

    // 9. DOM 컨트롤 및 텔레메트리 업데이트
    if (this.timeDisplay) {
      this.timeDisplay.textContent = `${this.formatTime(this.currentTimeMs)} / ${this.formatTime(maxDuration)}`;
    }

    if (this.scrubber && !this.isScrubbing) {
      this.scrubber.value = String(Math.round((this.currentTimeMs / (maxDuration || 1)) * 1000));
    }

    if (this.telemetryInfo) {
      this.telemetryInfo.innerHTML = `
        <span>${currentSpeed.toFixed(0)} km/h</span> |
        <span>LAP ${currentLap} / ${this.record.metadata?.totalLaps || 3}</span> |
        <span style="color: ${secBadgeColor}; font-weight: 700;">SECTOR ${currentSector}</span>
      `;
    }
  }

  /**
   * 서킷 2D 커브 좌표 및 바운딩 박스 캐싱
   */
  public getCircuit2D(circuitId: CircuitId): CachedCircuit2D {
    if (MinimapReplayPlayer.circuit2DCache.has(circuitId)) {
      return MinimapReplayPlayer.circuit2DCache.get(circuitId)!;
    }
    const def = CIRCUIT_DEFINITIONS[circuitId] || CIRCUIT_DEFINITIONS.circuit_monaco;
    const curve = new THREE.CatmullRomCurve3(def.controlPoints, true, 'centripetal');
    const threePts = curve.getPoints(180);
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    const points = threePts.map(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
      return { x: p.x, z: p.z };
    });
    const s1Index = Math.round(points.length * 0.33);
    const s2Index = Math.round(points.length * 0.66);
    const cached: CachedCircuit2D = { points, minX, maxX, minZ, maxZ, s1Index, s2Index };
    MinimapReplayPlayer.circuit2DCache.set(circuitId, cached);
    return cached;
  }

  private formatTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
    const s = (totalSec % 60).toString().padStart(2, '0');
    const msec = Math.floor(ms % 1000).toString().padStart(3, '0');
    return `${m}:${s}.${msec}`;
  }
}
