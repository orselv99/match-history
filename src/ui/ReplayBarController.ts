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

  constructor(replayPlayer: ReplayPlayer) {
    this.replayPlayer = replayPlayer;
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
  }

  private bindEvents(): void {
    this.btnPlayPause?.addEventListener('click', () => {
      if (this.replayPlayer.isPlaying) {
        this.replayPlayer.pause();
        if (this.btnPlayPause) this.btnPlayPause.textContent = '▶';
      } else {
        this.replayPlayer.play();
        if (this.btnPlayPause) this.btnPlayPause.textContent = '⏸';
      }
    });

    this.seekSlider?.addEventListener('input', (e) => {
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

  public setVisible(visible: boolean): void {
    if (visible) {
      this.container?.classList.add('visible');
    } else {
      this.container?.classList.remove('visible');
    }
  }

  public update(replayTimeStr?: string): void {
    if (!this.replayPlayer || this.replayPlayer.totalDurationMs <= 0) return;
    if (this.seekSlider) {
      const progress = (this.replayPlayer.currentTimeMs / this.replayPlayer.totalDurationMs) * 1000;
      this.seekSlider.value = Math.round(progress).toString();
    }
    if (this.timeDisplay && replayTimeStr) {
      this.timeDisplay.textContent = replayTimeStr;
    }
  }
}
