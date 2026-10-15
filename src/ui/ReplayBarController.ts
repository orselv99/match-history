import { ReplayPlayer } from '../replay/ReplayPlayer.ts';

/**
 * 3D 리플레이 바 (재생/일시정지, 타임라인 시크, 배속 제어) 전담 컨트롤러
 */
export class ReplayBarController {
  private container: HTMLElement | null;
  private btnPlayPause: HTMLElement | null;
  private seekSlider: HTMLInputElement | null;
  private timeDisplay: HTMLElement | null;
  private speedButtons: Record<string, HTMLElement | null>;
  private replayPlayer: ReplayPlayer;
  private onUserInteract?: () => void;

  constructor(replayPlayer: ReplayPlayer, onUserInteract?: () => void) {
    this.replayPlayer = replayPlayer;
    this.onUserInteract = onUserInteract;
    this.container = document.getElementById('replay-controller');
    this.btnPlayPause = document.getElementById('btn-replay-playpause');
    this.seekSlider = document.getElementById('replay-seek-slider') as HTMLInputElement | null;
    this.timeDisplay = document.getElementById('replay-time-display');
    this.speedButtons = {
      '0.5': document.getElementById('btn-speed-05'),
      '1.0': document.getElementById('btn-speed-10'),
      '2.0': document.getElementById('btn-speed-20'),
    };

    this.bindEvents();
    this.replayPlayer.onStateChange = () => {
      this.updateButtonState();
    };
  }

  private bindEvents(): void {
    this.btnPlayPause?.addEventListener('click', () => {
      this.onUserInteract?.();
      this.replayPlayer.togglePlayPause();
      this.updateButtonState();
    });

    this.seekSlider?.addEventListener('input', (e) => {
      this.onUserInteract?.();
      const val = Number((e.target as HTMLInputElement).value);
      const targetMs = (val / 1000) * this.replayPlayer.totalDurationMs;
      this.replayPlayer.seek(targetMs);
    });

    const setupSpeedBtn = (speed: number, btn: HTMLElement | null) => {
      btn?.addEventListener('click', () => {
        this.replayPlayer.playbackSpeed = speed;
        Object.values(this.speedButtons).forEach(b => b?.classList.remove('active'));
        btn.classList.add('active');
      });
    };
    setupSpeedBtn(0.5, this.speedButtons['0.5']);
    setupSpeedBtn(1.0, this.speedButtons['1.0']);
    setupSpeedBtn(2.0, this.speedButtons['2.0']);
  }

  public updateButtonState(): void {
    if (this.btnPlayPause) {
      this.btnPlayPause.textContent = this.replayPlayer.isPlaying ? '⏸' : '▶';
      this.btnPlayPause.setAttribute('title', this.replayPlayer.isPlaying ? '일시 정지 (Space)' : '재생 (Space)');
    }
  }

  public setVisible(visible: boolean): void {
    if (visible) {
      this.container?.classList.add('visible');
      this.updateButtonState();
    } else {
      this.container?.classList.remove('visible');
    }
  }

  public update(replayTimeStr?: string): void {
    if (!this.replayPlayer || this.replayPlayer.totalDurationMs <= 0) return;
    this.updateButtonState();
    if (this.seekSlider) {
      const progress = (this.replayPlayer.currentTimeMs / this.replayPlayer.totalDurationMs) * 1000;
      this.seekSlider.value = Math.round(progress).toString();
    }
    if (this.timeDisplay && replayTimeStr) {
      this.timeDisplay.textContent = replayTimeStr;
    }
  }
}
