import { BaseModal } from '../BaseModal.ts';
import type { MatchSummaryMetadata } from '../../replay/ReplayTypes.ts';
import type { FinishModalCallbacks } from './types.ts';
import { FinishRaceResults } from './FinishRaceResults.ts';
import { FinishLeaderboard } from './FinishLeaderboard.ts';
import { FinishPhotoMode } from './FinishPhotoMode.ts';

/**
 * 경기 완주 인게임 결과 ('순위, 이름, 시간') 및 서킷 TOP 5 랭킹 모달 컨트롤러
 * - FinishRaceResults: 최종 완주 순위 테이블 전담
 * - FinishLeaderboard: 서킷별 TOP 5 벤치마크 및 로컬 기록 전담
 * - FinishPhotoMode: 컷씬 스크린샷 캡처 및 포토 모드(Ctrl+Z) 전담
 */
export class FinishModal extends BaseModal<MatchSummaryMetadata> {
  private circuitCodeTag: HTMLElement | null;
  private btnRestart: HTMLElement | null = null;

  public readonly raceResults: FinishRaceResults;
  public readonly leaderboard: FinishLeaderboard;
  public readonly photoMode: FinishPhotoMode;

  private latestMetadata: MatchSummaryMetadata | null = null;
  private callbacks: FinishModalCallbacks;

  constructor(callbacks: FinishModalCallbacks) {
    super('finish-modal');
    this.callbacks = callbacks;

    this.circuitCodeTag = document.getElementById('modal-circuit-code');

    this.raceResults = new FinishRaceResults();
    this.leaderboard = new FinishLeaderboard();
    this.photoMode = new FinishPhotoMode({
      isOpen: () => this.isOpen(),
      onCaptureScreenshot: callbacks.onCaptureScreenshot,
    });

    const btnPhoto = document.getElementById('modal-btn-photo');
    const btnCapture = document.getElementById('modal-btn-capture');
    const btnReplay = document.getElementById('modal-btn-replay');
    const btnRestart = document.getElementById('modal-btn-restart');
    const btnTitle = document.getElementById('modal-btn-title');
    this.btnRestart = btnRestart;

    btnPhoto?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.photoMode.togglePhotoMode();
    });

    btnCapture?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.photoMode.captureScreenshot(this.latestMetadata?.circuitId);
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
  }

  public override close(): void {
    this.photoMode.setPhotoMode(false);
    super.close();
  }

  public override show(metadata?: MatchSummaryMetadata, isReplayMode: boolean = false): void {
    this.open(metadata, isReplayMode);
  }

  public open(metadata?: MatchSummaryMetadata, isReplayMode: boolean = false): void {
    if (this.btnRestart) {
      this.btnRestart.style.display = isReplayMode ? 'none' : '';
    }

    if (metadata) {
      this.latestMetadata = metadata;

      if (this.circuitCodeTag) {
        const circuitName = (metadata.circuitId || 'circuit_monaco').replace('circuit_', '').toUpperCase();
        this.circuitCodeTag.textContent = `CIRCUIT // ${circuitName}`;
      }

      // 1. 인게임 레이스 최종 순위 ('순위, 이름, 시간')
      this.raceResults.render(metadata.raceResults || []);

      // 2. 서버 서킷 상위 5위 랭킹 비동기 조회 (Fallback 지원)
      void this.leaderboard.loadCircuitTop5(metadata.circuitId);
    }

    this.showModal();
  }
}
