import { BaseModal } from './BaseModal.ts';
import { MatchSummaryMetadata } from '../replay/ReplayTypes.ts';

export interface FinishModalCallbacks {
  onReplay: () => void;
  onRestart: () => void;
  onTitle: () => void;
  onDownload: (metadata: MatchSummaryMetadata) => void;
}

/**
 * 레이스 완주 결과 및 텔레메트리/초압축 리포트 모달 컨트롤러
 */
export class FinishModal extends BaseModal<MatchSummaryMetadata> {
  private modalBestLap: HTMLElement | null;
  private modalTotalTime: HTMLElement | null;
  private modalTopSpeed: HTMLElement | null;
  private modalAvgSpeed: HTMLElement | null;
  private modalReductionRate: HTMLElement | null;
  private modalJsonSize: HTMLElement | null;
  private modalBinarySize: HTMLElement | null;
  private modalCompressedSize: HTMLElement | null;

  private latestMetadata: MatchSummaryMetadata | null = null;

  constructor(callbacks: FinishModalCallbacks) {
    super('finish-modal');

    this.modalBestLap = document.getElementById('modal-best-lap');
    this.modalTotalTime = document.getElementById('modal-total-time');
    this.modalTopSpeed = document.getElementById('modal-top-speed');
    this.modalAvgSpeed = document.getElementById('modal-avg-speed');
    this.modalReductionRate = document.getElementById('modal-reduction-rate');
    this.modalJsonSize = document.getElementById('modal-json-size');
    this.modalBinarySize = document.getElementById('modal-binary-size');
    this.modalCompressedSize = document.getElementById('modal-compressed-size');

    const btnReplay = document.getElementById('modal-btn-replay');
    const btnRestart = document.getElementById('modal-btn-restart');
    const btnTitle = document.getElementById('modal-btn-title');
    const btnDownload = document.getElementById('modal-btn-download');

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

    btnDownload?.addEventListener('click', () => {
      if (this.latestMetadata) {
        callbacks.onDownload(this.latestMetadata);
      }
    });
  }

  public open(metadata?: MatchSummaryMetadata): void {
    if (metadata) {
      this.latestMetadata = metadata;

      const formatMs = (ms: number) => {
        const s = (ms / 1000).toFixed(3);
        return `${s}s`;
      };

      if (this.modalBestLap) this.modalBestLap.textContent = formatMs(metadata.bestLapMs);
      if (this.modalTotalTime) this.modalTotalTime.textContent = formatMs(metadata.totalTimeMs);
      if (this.modalTopSpeed) this.modalTopSpeed.textContent = `${metadata.topSpeedKmh} km/h`;
      if (this.modalAvgSpeed) this.modalAvgSpeed.textContent = `${metadata.avgSpeedKmh} km/h`;

      const jsonKb = (metadata.rawJsonBytes / 1024).toFixed(1);
      const binKb = (metadata.quantizedBinaryBytes / 1024).toFixed(1);
      const compKb = (metadata.compressedBytes / 1024).toFixed(1);

      if (this.modalJsonSize) this.modalJsonSize.textContent = `${jsonKb} KB`;
      if (this.modalBinarySize) {
        const pct = (100 - (metadata.quantizedBinaryBytes / metadata.rawJsonBytes) * 100).toFixed(1);
        this.modalBinarySize.textContent = `${binKb} KB (-${pct}%)`;
      }
      if (this.modalCompressedSize) {
        this.modalCompressedSize.textContent = `${compKb} KB (-${metadata.compressionRatioPercent}%)`;
      }
      if (this.modalReductionRate) {
        this.modalReductionRate.textContent = `${metadata.compressionRatioPercent}% 초압축 절감`;
      }
    }

    this.showModal();
  }
}
