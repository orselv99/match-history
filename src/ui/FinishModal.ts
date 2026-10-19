import { BaseModal } from './BaseModal.ts';
import type { MatchSummaryMetadata, RaceResultEntry } from '../replay/ReplayTypes.ts';
import type { CircuitId } from '../data/circuits.ts';
import { t } from '../i18n/I18nManager.ts';
import { showToast } from './Toast.ts';
import { appDB } from '../storage/AppDatabase.ts';

export interface FinishModalCallbacks {
  onReplay: () => void;
  onRestart: () => void;
  onTitle: () => void;
}

export interface CircuitLeaderboardEntry {
  rank: number;
  driverName: string;
  timeFormatted: string;
}

/**
 * 서킷별 공식 벤치마크 역대 상위 5위 기록 (서버 연동 전/오프라인 Fallback)
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

/**
 * 경기 완주 인게임 결과 ('순위, 이름, 시간') 및 서킷 TOP 5 랭킹 모달 컨트롤러
 */
export class FinishModal extends BaseModal<MatchSummaryMetadata> {
  private circuitCodeTag: HTMLElement | null;
  private raceResultsTbody: HTMLElement | null;
  private serverTop5Tbody: HTMLElement | null;
  private serverStatusTag: HTMLElement | null;

  private latestMetadata: MatchSummaryMetadata | null = null;
  private isPhotoMode: boolean = false;
  private hintTimeoutId: number | null = null;

  constructor(callbacks: FinishModalCallbacks) {
    super('finish-modal');

    this.circuitCodeTag = document.getElementById('modal-circuit-code');
    this.raceResultsTbody = document.getElementById('finish-race-results-tbody');
    this.serverTop5Tbody = document.getElementById('finish-server-top5-tbody');
    this.serverStatusTag = document.getElementById('finish-server-status-tag');

    const btnPhoto = document.getElementById('modal-btn-photo');
    const btnCapture = document.getElementById('modal-btn-capture');
    const btnReplay = document.getElementById('modal-btn-replay');
    const btnRestart = document.getElementById('modal-btn-restart');
    const btnTitle = document.getElementById('modal-btn-title');

    btnPhoto?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePhotoMode();
    });

    btnCapture?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.captureScreenshot();
    });

    btnReplay?.addEventListener('click', () => {
      this.close();
      callbacks.onReplay();
    });

    btnRestart?.addEventListener('click', () => {
      this.close();
      callbacks.onRestart();
    });

    btnTitle?.addEventListener('click', () => {
      this.close();
      callbacks.onTitle();
    });

    // OS 캡처(PrintScreen 단축키) 및 화면 캡처 도구(Win+Shift+S / Snipping Tool 브라우저 블러) 감지 시 토스트 즉각 숨김
    const hideToastForCapture = () => {
      if (!this.isPhotoMode) return;
      const hint = document.getElementById('photo-mode-hint');
      if (hint) {
        hint.classList.remove('visible');
        hint.classList.add('capture-hidden');
      }
      const toastContainer = document.getElementById('toast-container');
      if (toastContainer) {
        toastContainer.innerHTML = '';
      }
    };

    // Ctrl + Z 단축키로 포토 모드(UI 숨김) 토글 및 복귀 리스너
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen()) return;

      if (e.key === 'PrintScreen' || e.code === 'PrintScreen') {
        hideToastForCapture();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault();
        this.togglePhotoMode();
      } else if (this.isPhotoMode && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        // 포토 모드 중 아무 일반 키나 누르면 UI 복귀 (Ctrl 등 보조키 단독 입력 제외)
        this.setPhotoMode(false);
      }
    });

    // OS 캡처 도구(Win+Shift+S 등) 실행 시 브라우저 포커스 상실(blur)을 감지하여 토스트 숨김
    window.addEventListener('blur', () => {
      hideToastForCapture();
    });

    // 포토 모드 중 마우스 이동 시 힌트를 잠시 표시했다가 자동 페이드아웃
    window.addEventListener('mousemove', () => {
      if (this.isOpen() && this.isPhotoMode) {
        this.showHintTemporarily(1800);
      }
    });

    // 포토 모드 중 화면 클릭 시 UI 복귀
    window.addEventListener('click', () => {
      if (this.isOpen() && this.isPhotoMode) {
        this.setPhotoMode(false);
      }
    });
  }

  private showHintTemporarily(durationMs: number = 2200): void {
    const hint = document.getElementById('photo-mode-hint');
    if (!hint) return;

    hint.classList.remove('capture-hidden');
    hint.classList.add('visible');

    if (this.hintTimeoutId !== null) {
      window.clearTimeout(this.hintTimeoutId);
    }

    this.hintTimeoutId = window.setTimeout(() => {
      hint.classList.remove('visible');
      this.hintTimeoutId = null;
    }, durationMs);
  }

  public togglePhotoMode(): void {
    this.setPhotoMode(!this.isPhotoMode);
  }

  public setPhotoMode(enabled: boolean): void {
    this.isPhotoMode = enabled;
    document.body.classList.toggle('in-photo-mode', enabled);

    const hint = document.getElementById('photo-mode-hint');
    if (this.hintTimeoutId !== null) {
      window.clearTimeout(this.hintTimeoutId);
      this.hintTimeoutId = null;
    }

    if (enabled) {
      // 1. 기존 잔여 게임 토스트 즉시 소거
      const toastContainer = document.getElementById('toast-container');
      if (toastContainer) {
        toastContainer.innerHTML = '';
      }
      // 2. 포토 모드 진입 시 힌트 토스트를 2.2초간만 표시 후 자동 소거하여 깨끗한 캡처 화면 제공
      this.showHintTemporarily(2200);
    } else {
      if (hint) {
        hint.classList.remove('visible');
        hint.classList.remove('capture-hidden');
      }
    }
  }

  public captureScreenshot(): void {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-container canvas');
    if (!canvas) return;

    try {
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      const circuitName = this.latestMetadata?.circuitId || 'circuit';
      a.download = `apex-finish-${circuitName}.png`;
      a.click();
      showToast('📷 3D 컷씬 스크린샷이 저장되었습니다! (보정 후 로비 배경 등으로 활용해보세요)');
    } catch (e) {
      console.warn('Screenshot capture failed', e);
    }
  }

  public override close(): void {
    this.setPhotoMode(false);
    super.close();
  }

  public open(metadata?: MatchSummaryMetadata): void {
    if (metadata) {
      this.latestMetadata = metadata;

      if (this.circuitCodeTag) {
        const circuitName = (metadata.circuitId || 'circuit_monaco').replace('circuit_', '').toUpperCase();
        this.circuitCodeTag.textContent = `CIRCUIT // ${circuitName}`;
      }

      // 1. 인게임 레이스 최종 순위 ('순위, 이름, 시간')
      this.renderRaceResults(metadata.raceResults || []);

      // 2. 서버 서킷 상위 5위 랭킹 비동기 조회 (Fallback 지원)
      this.loadServerTop5(metadata.circuitId);
    }

    this.showModal();
  }

  /**
   * 경기 결과 테이블 렌더링 ('순위, 이름, 시간')
   */
  private renderRaceResults(results: RaceResultEntry[]): void {
    if (!this.raceResultsTbody) return;

    if (results.length === 0) {
      this.raceResultsTbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 12px;">${t('finish.noRecords')}</td></tr>`;
      return;
    }

    this.raceResultsTbody.innerHTML = results.map(r => {
      const isPlayer = r.isPlayer;
      const rankClass = r.rank <= 3 ? `finish-rank-${r.rank}` : '';
      const playerBadge = isPlayer ? `<span class="player-tag">YOU</span>` : '';

      return `
        <tr class="${isPlayer ? 'is-player' : ''}">
          <td class="finish-rank-cell ${rankClass}">P${r.rank}</td>
          <td>${this.escapeHtml(r.driverName)}${playerBadge}</td>
          <td class="finish-time-cell">${r.timeFormatted}</td>
        </tr>
      `;
    }).join('');
  }

  /**
   * 로컬 IndexedDB에서 현재 서킷 기준 상위 5개 기록 조회, 부족 시 기본 fallback 데이터로 보충
   */
  private async loadServerTop5(circuitId: CircuitId): Promise<void> {
    if (!this.serverTop5Tbody) return;

    this.serverTop5Tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 10px;">${t('finish.loading')}</td></tr>`;
    if (this.serverStatusTag) {
      this.serverStatusTag.textContent = 'LOCAL DB...';
      this.serverStatusTag.className = 'finish-status-badge';
    }

    try {
      const allReplays = await appDB.listReplays();
      const circuitReplays = allReplays.filter(
        r => r.metadata?.circuitId === circuitId && typeof r.metadata?.bestLapMs === 'number' && r.metadata.bestLapMs > 0
      );

      // 베스트 랩 오름차순 정렬
      circuitReplays.sort((a, b) => (a.metadata.bestLapMs || Infinity) - (b.metadata.bestLapMs || Infinity));

      const records: CircuitLeaderboardEntry[] = [];
      const seenDrivers = new Set<string>();

      for (const r of circuitReplays) {
        const dName = r.metadata.driverName || 'Driver';
        if (!seenDrivers.has(dName)) {
          seenDrivers.add(dName);
          records.push({
            rank: records.length + 1,
            driverName: dName,
            timeFormatted: this.formatMs(r.metadata.bestLapMs),
          });
          if (records.length >= 5) break;
        }
      }

      // 5개 미만인 경우 기본 벤치마크 기록으로 채움
      if (records.length < 5) {
        const fallbackList = FALLBACK_LEADERBOARDS[circuitId] || FALLBACK_LEADERBOARDS['circuit_monaco'] || [];
        for (const fb of fallbackList) {
          if (!seenDrivers.has(fb.driverName)) {
            seenDrivers.add(fb.driverName);
            records.push({
              rank: records.length + 1,
              driverName: fb.driverName,
              timeFormatted: fb.timeFormatted,
            });
            if (records.length >= 5) break;
          }
        }
      }

      this.renderServerTop5(records.slice(0, 5), false);
    } catch {
      const fallbackList = FALLBACK_LEADERBOARDS[circuitId] || FALLBACK_LEADERBOARDS['circuit_monaco'] || [];
      this.renderServerTop5(fallbackList, true);
    }
  }

  private renderServerTop5(records: CircuitLeaderboardEntry[], isFallback: boolean): void {
    if (!this.serverTop5Tbody) return;

    if (this.serverStatusTag) {
      this.serverStatusTag.textContent = isFallback ? t('finish.serverOffline') : t('finish.serverLive');
      this.serverStatusTag.className = `finish-status-badge ${isFallback ? 'fallback' : 'live'}`;
    }

    if (records.length === 0) {
      this.serverTop5Tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 10px;">${t('finish.noRecords')}</td></tr>`;
      return;
    }

    this.serverTop5Tbody.innerHTML = records.map((rec, idx) => {
      const rank = rec.rank || (idx + 1);
      const rankClass = rank <= 3 ? `finish-rank-${rank}` : '';

      return `
        <tr>
          <td class="finish-rank-cell ${rankClass}">P${rank}</td>
          <td>${this.escapeHtml(rec.driverName)}</td>
          <td class="finish-time-cell">${rec.timeFormatted}</td>
        </tr>
      `;
    }).join('');
  }

  private formatMs(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
    const s = (totalSec % 60).toString().padStart(2, '0');
    const msec = Math.floor(ms % 1000).toString().padStart(3, '0');
    return `${m}:${s}.${msec}`;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
