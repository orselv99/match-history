import type { CachedReplayRecord } from '../../storage/schema.ts';
import { MinimapReplayPlayer } from './MinimapReplayPlayer.ts';
import type { MatchHistoryTable } from './MatchHistoryTable.ts';

export interface MatchHistoryInspectorCallbacks {
  onPlayReplay?: (record: CachedReplayRecord) => void;
  onClose?: () => void;
}

/**
 * 전적 검색/리더보드 인스펙터 풀-커버 팝업 전담 컨트롤러
 * - 드라이버 요약, 9개 섹터 기록(이전 랩 대비 델타), 최종 순위표, 텔레메트리 메타데이터
 * - 2D 트랙 미니맵 리플레이어 및 스크러버/배속 컨트롤 연동
 */
export class MatchHistoryInspector {
  private inspectorCard: HTMLElement | null;
  private inspectorBtnClose: HTMLElement | null;
  private inspectorContentBody: HTMLElement | null;

  public isOpen: boolean = false;
  public currentRecord: CachedReplayRecord | null = null;
  public minimapPlayer: MinimapReplayPlayer = new MinimapReplayPlayer();

  private callbacks: MatchHistoryInspectorCallbacks;

  constructor(callbacks: MatchHistoryInspectorCallbacks = {}) {
    this.callbacks = callbacks;
    this.inspectorCard = document.getElementById('history-inspector-card');
    this.inspectorBtnClose = document.getElementById('inspector-btn-close');
    this.inspectorContentBody = document.getElementById('inspector-content-body');

    this.bindEvents();
  }

  private bindEvents(): void {
    // 1. 닫기(목록 복귀) 버튼
    this.inspectorBtnClose?.addEventListener('click', () => {
      this.callbacks.onClose?.();
    });

    // 2. 인스펙터 내부 클릭 & 스크러버 이벤트 위임
    this.inspectorCard?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      // 2D 미니맵 배속 토글 버튼 (1.0x -> 2.0x -> 4.0x)
      const speedBtn = target.closest('#inspector-btn-speed') as HTMLElement | null;
      if (speedBtn) {
        this.minimapPlayer.cyclePlaybackSpeed();
        return;
      }

      // 2D 미니맵 재생/일시정지 토글 버튼
      const togglePlayBtn = target.closest('#inspector-btn-play') as HTMLElement | null;
      if (togglePlayBtn) {
        this.minimapPlayer.togglePlayPause();
        return;
      }

      // 2D 미니맵 영역 내 3D 뷰어 재생 버튼
      const minimap3dBtn = target.closest('#inspector-btn-3d') as HTMLElement | null;
      if (minimap3dBtn && this.currentRecord && this.callbacks.onPlayReplay) {
        this.callbacks.onPlayReplay(this.currentRecord);
      }
    });

    // 미니맵 스크러버 입력 처리
    this.inspectorCard?.addEventListener('input', (e) => {
      const target = e.target as HTMLElement;
      if (target.id === 'inspector-scrubber') {
        const scrubber = target as HTMLInputElement;
        const progress = parseFloat(scrubber.value) / 1000;
        this.minimapPlayer.seekProgress(progress);
      }
    });

    this.inspectorCard?.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).id === 'inspector-scrubber') {
        this.minimapPlayer.setScrubbing(true);
      }
    });

    window.addEventListener('mouseup', () => {
      this.minimapPlayer.setScrubbing(false);
    });

    // 마우스 휠 이벤트 위임: 우측 미니맵 영역 위에서 휠을 굴려도 좌측 메타데이터 목록이 스크롤되도록 지원
    this.inspectorCard?.addEventListener('wheel', (e) => {
      const metaCol = this.inspectorContentBody?.querySelector('.inspector-meta-col') as HTMLElement | null;
      if (metaCol && !metaCol.contains(e.target as Node)) {
        metaCol.scrollTop += e.deltaY;
      }
    }, { passive: true });
  }

  public open(record: CachedReplayRecord, mainCard: HTMLElement | null, table: MatchHistoryTable): void {
    if (!this.inspectorCard || !mainCard || !this.inspectorContentBody) return;

    this.currentRecord = record;
    this.isOpen = true;

    // 메인 카드 숨기고 인스펙터 카드 표시
    mainCard.style.display = 'none';
    this.inspectorCard.style.display = 'flex';

    // 본문 내용 렌더링
    this.inspectorContentBody.innerHTML = this.buildContentHtml(record, table);

    // 2D 미니맵 플레이어 연결 및 첫 프레임 렌더링
    this.minimapPlayer.attach(this.inspectorContentBody, record);
  }

  public close(mainCard: HTMLElement | null): void {
    this.minimapPlayer.stop();
    this.isOpen = false;
    this.currentRecord = null;

    if (this.inspectorCard) this.inspectorCard.style.display = 'none';
    if (mainCard) mainCard.style.display = 'flex';
  }

  public stop(): void {
    this.minimapPlayer.stop();
  }

  private buildContentHtml(rec: CachedReplayRecord, table: MatchHistoryTable): string {
    const meta = rec.metadata;
    const driverName = table.escapeHtml(meta?.driverName || 'Driver');
    const recCircuitId = meta?.circuitId || 'circuit_monaco';
    const circuitTitle = table.getCircuitTitle(recCircuitId);
    const vehicleName = table.getVehicleName(meta?.vehicleModelId || 'gt_turbo');
    const playerColor = meta?.color || '#38bdf8';
    const bestLapStr = meta?.bestLapMs ? table.formatTime(meta.bestLapMs) : '--:--.---';
    const totalRaceStr = meta?.totalTimeMs ? table.formatTime(meta.totalTimeMs) : '--:--.---';
    const topSpeedStr = meta?.topSpeedKmh ? `${meta.topSpeedKmh.toFixed(1)} km/h` : '--.- km/h';
    const avgSpeedStr = meta?.avgSpeedKmh ? `${meta.avgSpeedKmh.toFixed(1)} km/h` : '--.- km/h';

    // 베스트 랩 번호 및 랩별 전체 섹터 기록 생성 (3 LAP × 3 SECTOR = 9행)
    const bestLapNum = meta?.bestLapNum || (meta?.lapTimesMs && meta?.bestLapMs ? (meta.lapTimesMs.indexOf(meta.bestLapMs) + 1 || 1) : 1);

    const allSectors = meta?.sectorTimesMs && meta.sectorTimesMs.length >= 3
      ? meta.sectorTimesMs
      : [
          meta?.sectorTimesMs?.[0] || [8200, 8400, 8200],
          meta?.sectorTimesMs?.[1] || [8100, 8300, 8400],
          meta?.sectorTimesMs?.[2] || [8300, 8500, 8300],
        ];

    let sectorRowsHtml = '';
    for (let l = 0; l < 3; l++) {
      const lapNum = l + 1;
      const currentLapSectors = allSectors[l] || [0, 0, 0];
      const prevLapSectors = l > 0 ? (allSectors[l - 1] || [0, 0, 0]) : null;

      for (let s = 0; s < 3; s++) {
        const secNum = s + 1;
        const curMs = currentLapSectors[s] || 0;
        const timeStr = curMs > 0 ? table.formatTime(curMs) : '--:--.---';

        let deltaHtml = '<span class="sector-delta-val delta-even text-right">-</span>';
        if (prevLapSectors && curMs > 0 && prevLapSectors[s] > 0) {
          const diffMs = curMs - prevLapSectors[s];
          if (diffMs < 0) {
            deltaHtml = `<span class="sector-delta-val delta-faster text-right">-${(Math.abs(diffMs) / 1000).toFixed(3)}s</span>`;
          } else if (diffMs > 0) {
            deltaHtml = `<span class="sector-delta-val delta-slower text-right">+${(diffMs / 1000).toFixed(3)}s</span>`;
          } else {
            deltaHtml = `<span class="sector-delta-val delta-even text-right">0.000s</span>`;
          }
        }

        const isLapFirst = (s === 0 && l > 0);
        sectorRowsHtml += `
          ${isLapFirst ? '<div class="sector-lap-divider"></div>' : ''}
          <div class="sector-grid-row">
            <span class="sector-tag s${secNum}">LAP ${lapNum} · SEC ${secNum}</span>
            <span class="sector-time-val text-right">${timeStr}</span>
            ${deltaHtml}
          </div>
        `;
      }
    }

    // 1~4위 순위표
    let raceResultsHtml = '';
    const results = meta?.raceResults || [];
    if (results.length > 0) {
      raceResultsHtml = results.map(r => `
        <div class="rank-finish-row ${r.isPlayer ? 'player-row' : ''}">
          <div class="rank-badge-wrap">
            <span class="rank-pos-badge ${r.rank === 1 ? 'gold' : r.rank === 2 ? 'silver' : r.rank === 3 ? 'bronze' : 'fourth'}">
              ${r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : ''} P${r.rank}
            </span>
          </div>
          <span class="rank-driver-name ${r.isPlayer ? 'player-driver' : ''}">
            ${table.escapeHtml(r.driverName)}${r.isPlayer ? ' <span class="you-pill">YOU</span>' : ''}
          </span>
          <span class="rank-time-val">${r.timeFormatted}</span>
        </div>
      `).join('');
    } else {
      raceResultsHtml = `
        <div class="rank-finish-row player-row">
          <div class="rank-badge-wrap">
            <span class="rank-pos-badge gold">🥇 P1</span>
          </div>
          <span class="rank-driver-name player-driver">
            ${driverName} <span class="you-pill">YOU</span>
          </span>
          <span class="rank-time-val">${bestLapStr}</span>
        </div>
      `;
    }

    const totalDurationStr = rec.ticks.length > 0 ? table.formatTime(rec.ticks[rec.ticks.length - 1].timeMs) : '--:--.---';

    return `
      <div class="inspector-layout-grid">
        <!-- 좌측: 메타데이터 컬럼 -->
        <div class="inspector-meta-col">
          <!-- 1~3행: 드라이버 Parent Grouping (총 6개의 카드) -->
          <div class="detail-floating-group driver-parent-group">
            <span class="floating-group-title">🪛 드라이버: <strong class="driver-name-highlight">${driverName}</strong></span>
            <div class="detail-meta-grid-2col">
              <!-- 1행: 머신, 서킷 -->
              <div class="detail-floating-card">
                <span class="floating-card-label">머신</span>
                <span class="floating-card-value">${vehicleName}</span>
              </div>
              <div class="detail-floating-card">
                <span class="floating-card-label">서킷</span>
                <span class="floating-card-value circuit-name-val">${table.formatCircuitTitle(circuitTitle)}</span>
              </div>
              <!-- 2행: 베스트 랩타임, 총 레이스 시간 -->
              <div class="detail-floating-card">
                <span class="floating-card-label">베스트 랩타임</span>
                <span class="floating-card-value text-accent-gold">${bestLapStr} <span class="best-lap-num-badge">LAP ${bestLapNum}</span></span>
              </div>
              <div class="detail-floating-card">
                <span class="floating-card-label">총 레이스 시간</span>
                <span class="floating-card-value">${totalRaceStr}</span>
              </div>
              <!-- 3행: 최고속도, 평균속도 -->
              <div class="detail-floating-card">
                <span class="floating-card-label">최고속도</span>
                <span class="floating-card-value">${topSpeedStr}</span>
              </div>
              <div class="detail-floating-card">
                <span class="floating-card-label">평균속도</span>
                <span class="floating-card-value">${avgSpeedStr}</span>
              </div>
            </div>
          </div>

          <!-- 4행: 랩별 섹터 기록 (3 LAP × 3 SECTOR = 9구간) -->
          <div class="detail-floating-group">
            <span class="floating-group-title">⏱ 랩별 섹터 기록</span>
            <div class="sector-record-grid">
              <div class="sector-grid-header">
                <span>구간 (LAP/SEC)</span>
                <span class="text-right">시간</span>
                <span class="text-right">이전 랩 대비</span>
              </div>
              ${sectorRowsHtml}
            </div>
          </div>

          <!-- 5행: 레이스 완주 순위 -->
          <div class="detail-floating-group">
            <span class="floating-group-title">🏆 레이스 완주 순위</span>
            <div class="rank-finish-list">
              ${raceResultsHtml}
            </div>
          </div>

          <!-- 6행: 텔레메트리 리플레이 데이터 정보 -->
          <div class="detail-floating-group">
            <span class="floating-group-title">📊 텔레메트리 & 리플레이 데이터 정보</span>
            <div class="inspector-tech-col-list">
              <div class="tech-row-item">
                <span class="tech-k">샘플링 레이트</span>
                <span class="tech-v">30Hz / Catmull-Rom 3차 보간</span>
              </div>
              <div class="tech-row-item">
                <span class="tech-k">기록 프레임 수</span>
                <span class="tech-v">${rec.ticks.length.toLocaleString()} 틱</span>
              </div>
              <div class="tech-row-item">
                <span class="tech-k">데이터 압축률</span>
                <span class="tech-v text-cyan">95.5% (고정소수점 패킷)</span>
              </div>
              <div class="tech-row-item">
                <span class="tech-k">저장 일시</span>
                <span class="tech-v">${table.formatDate(rec.metadata?.createdAt || rec.createdAt || rec.savedAt)}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 우측: 2D 미니맵 컬럼 (우측 가운데 Floating Group) -->
        <div class="inspector-minimap-col detail-floating-group minimap-floating-card">
          <span class="floating-group-title minimap-floating-label">📡 2D 미니맵 레이스 궤적</span>
          <span class="floating-group-title minimap-floating-time" id="inspector-time-display">00:00.000 / ${totalDurationStr}</span>

          <div class="inspector-canvas-wrapper">
            <canvas id="inspector-minimap-canvas" width="440" height="260"></canvas>
          </div>

          <div class="minimap-controls">
            <button type="button" class="minimap-play-btn" id="inspector-btn-play" title="재생 / 일시정지">▶</button>
            <input type="range" class="minimap-scrubber" id="inspector-scrubber" min="0" max="1000" value="0">
            <button type="button" class="inspector-speed-badge" id="inspector-btn-speed" title="재생 배속 변경 (1.0x -> 2.0x -> 4.0x)">${this.minimapPlayer.getSpeed().toFixed(1)}x</button>
          </div>

          <div class="inspector-telemetry-strip">
            <div style="display: flex; gap: 12px; align-items: center;">
              <span style="display: flex; align-items: center; gap: 5px;">
                <span style="display: inline-block; width: 8px; height: 8px; background: ${playerColor}; border: 1px solid #fff; border-radius: 1px;"></span>
                <span style="color: #fff; font-weight: 700;">YOU</span>
              </span>
              <span style="display: flex; align-items: center; gap: 5px;">
                <span style="display: inline-block; width: 8px; height: 8px; background: #f59e0b; border-radius: 1px;"></span>
                <span>AI 3 CARS</span>
              </span>
            </div>
            <div id="inspector-telemetry-info" style="color: #38bdf8; font-weight: 700;">
              0 km/h | LAP 1 / ${meta?.totalLaps || 3}
            </div>
          </div>

          <button type="button" class="minimap-3d-btn inspector-3d-action-btn" id="inspector-btn-3d" data-match="${rec.matchCode}">
            ▶ 3D 뷰어로 전체 리플레이 재생
          </button>
        </div>
      </div>
    `;
  }
}
