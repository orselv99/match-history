import { Game, GameUIState } from './core/Game.ts';
import { MatchSummaryMetadata } from './telemetry/TelemetryTypes.ts';
import { TelemetryCodec } from './telemetry/TelemetryCodec.ts';

window.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('game-container') as HTMLElement;
  const minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;

  if (!container || !minimapCanvas) return;

  // 게임 메인 인스턴스 초기화
  const game = new Game(container, minimapCanvas);

  // DOM 요소 참조
  const modeTag = document.getElementById('mode-tag')!;
  const modeText = document.getElementById('mode-text')!;
  const btnModeDrive = document.getElementById('btn-mode-drive')!;
  const btnModeDemo = document.getElementById('btn-mode-demo')!;
  const btnModeReplay = document.getElementById('btn-mode-replay')!;
  const btnReset = document.getElementById('btn-reset')!;

  const lapCounter = document.getElementById('lap-counter')!;
  const currentLapTime = document.getElementById('current-lap-time')!;
  const bestLapTime = document.getElementById('best-lap-time')!;
  const sectorChips = [
    document.getElementById('sector-1')!,
    document.getElementById('sector-2')!,
    document.getElementById('sector-3')!
  ];

  const speedIndicator = document.getElementById('speed-indicator')!;
  const gearIndicator = document.getElementById('gear-indicator')!;
  const rpmBar = document.getElementById('rpm-bar')!;
  const driftBadge = document.getElementById('drift-badge')!;

  // 리플레이 컨트롤러 DOM
  const replayController = document.getElementById('replay-controller')!;
  const btnReplayPlayPause = document.getElementById('btn-replay-playpause')!;
  const replaySeekSlider = document.getElementById('replay-seek-slider') as HTMLInputElement;
  const replayTimeDisplay = document.getElementById('replay-time-display')!;
  const speedButtons = {
    '0.5': document.getElementById('btn-speed-05')!,
    '1.0': document.getElementById('btn-speed-10')!,
    '2.0': document.getElementById('btn-speed-20')!,
  };

  // 카운트다운 DOM
  const countdownOverlay = document.getElementById('countdown-overlay')!;
  const countdownNumber = document.getElementById('countdown-number')!;

  // 완주 모달 DOM
  const finishModal = document.getElementById('finish-modal')!;
  const modalBestLap = document.getElementById('modal-best-lap')!;
  const modalTotalTime = document.getElementById('modal-total-time')!;
  const modalTopSpeed = document.getElementById('modal-top-speed')!;
  const modalAvgSpeed = document.getElementById('modal-avg-speed')!;
  const modalReductionRate = document.getElementById('modal-reduction-rate')!;
  const modalJsonSize = document.getElementById('modal-json-size')!;
  const modalBinarySize = document.getElementById('modal-binary-size')!;
  const modalCompressedSize = document.getElementById('modal-compressed-size')!;

  const modalBtnReplay = document.getElementById('modal-btn-replay')!;
  const modalBtnDownload = document.getElementById('modal-btn-download')!;
  const modalBtnRestart = document.getElementById('modal-btn-restart')!;

  let latestFinishedMetadata: MatchSummaryMetadata | null = null;

  // 1. UI 상태 이벤트 구독
  game.onStateUpdate = (state: GameUIState) => {
    speedIndicator.textContent = state.speedKmh.toString();
    gearIndicator.textContent = state.gear;
    rpmBar.style.width = `${Math.round(state.rpmRatio * 100)}%`;

    if (state.isDrifting) {
      driftBadge.classList.add('active');
      driftBadge.textContent = 'DRIFT_ACTIVE';
    } else {
      driftBadge.classList.remove('active');
      driftBadge.textContent = 'DRIFT_OFF';
    }

    lapCounter.textContent = `LAP ${state.currentLap.toString().padStart(2, '0')} / ${state.totalLaps.toString().padStart(2, '0')}`;
    currentLapTime.textContent = state.currentLapTimeStr;
    bestLapTime.textContent = state.bestLapTimeStr;

    // 카운트다운 오버레이 갱신 (게임 스타일 순수 대형 숫자)
    if (state.countdownVisible) {
      countdownOverlay.classList.add('visible');
      countdownNumber.textContent = state.countdownText || '';
      if (state.countdownText === 'GO!') {
        countdownNumber.classList.add('highlight');
      } else {
        countdownNumber.classList.remove('highlight');
      }
    } else {
      countdownOverlay.classList.remove('visible');
    }

    // 섹터 표시
    state.sectorsMs.forEach((sMs, idx) => {
      if (sMs > 0) {
        sectorChips[idx].textContent = `S${idx + 1}: ${(sMs / 1000).toFixed(2)}s`;
        sectorChips[idx].classList.add('passed');
      } else {
        sectorChips[idx].textContent = `S${idx + 1}: --.-s`;
        sectorChips[idx].classList.remove('passed');
      }
    });

    // 리플레이 슬라이더 갱신
    if (state.gameMode === 'REPLAY' && game.replayPlayer.totalDurationMs > 0) {
      const progress = (game.replayPlayer.currentTimeMs / game.replayPlayer.totalDurationMs) * 1000;
      replaySeekSlider.value = Math.round(progress).toString();
      if (state.replayTimeStr) {
        replayTimeDisplay.textContent = state.replayTimeStr;
      }
    }
  };

  // 2. 완주 콜백
  game.onFinishCallback = (metadata: MatchSummaryMetadata) => {
    latestFinishedMetadata = metadata;

    const formatMs = (ms: number) => {
      const s = (ms / 1000).toFixed(3);
      return `${s}s`;
    };

    modalBestLap.textContent = formatMs(metadata.bestLapMs);
    modalTotalTime.textContent = formatMs(metadata.totalTimeMs);
    modalTopSpeed.textContent = `${metadata.topSpeedKmh} km/h`;
    modalAvgSpeed.textContent = `${metadata.avgSpeedKmh} km/h`;

    const jsonKb = (metadata.rawJsonBytes / 1024).toFixed(1);
    const binKb = (metadata.quantizedBinaryBytes / 1024).toFixed(1);
    const compKb = (metadata.compressedBytes / 1024).toFixed(1);

    modalJsonSize.textContent = `${jsonKb} KB`;
    modalBinarySize.textContent = `${binKb} KB (-${(100 - (metadata.quantizedBinaryBytes / metadata.rawJsonBytes * 100)).toFixed(1)}%)`;
    modalCompressedSize.textContent = `${compKb} KB (-${metadata.compressionRatioPercent}%)`;
    modalReductionRate.textContent = `${metadata.compressionRatioPercent}% 초압축 절감`;

    finishModal.classList.add('open');
  };

  // 3. 모드 전환 버튼 핸들러
  const setModeUI = (mode: 'DRIVING' | 'REPLAY' | 'DEMO') => {
    game.setMode(mode);

    // 버튼 활성 상태 초기화
    btnModeDrive.classList.remove('active');
    btnModeDemo.classList.remove('active');
    btnModeReplay.classList.remove('active');

    if (mode === 'DRIVING') {
      modeTag.className = 'mode-tag';
      modeText.textContent = 'LIVE_DRIVING';
      btnModeDrive.classList.add('active');
      replayController.classList.remove('visible');
    } else if (mode === 'DEMO') {
      modeTag.className = 'mode-tag demo-mode';
      modeText.textContent = 'DEMO_AI // 4 CARS';
      btnModeDemo.classList.add('active');
      replayController.classList.remove('visible');
    } else {
      modeTag.className = 'mode-tag replay-mode';
      modeText.textContent = 'REPLAY_3D // MATCH REPLAY';
      btnModeReplay.classList.add('active');
      replayController.classList.add('visible');
    }
  };

  btnModeDrive.addEventListener('click', () => setModeUI('DRIVING'));
  btnModeDemo.addEventListener('click', () => setModeUI('DEMO'));
  btnModeReplay.addEventListener('click', () => setModeUI('REPLAY'));
  btnReset.addEventListener('click', () => {
    game.resetCarToStart();
    setModeUI('DRIVING');
  });

  // 4. 리플레이 컨트롤러 이벤트
  btnReplayPlayPause.addEventListener('click', () => {
    if (game.replayPlayer.isPlaying) {
      game.replayPlayer.pause();
      btnReplayPlayPause.textContent = '▶';
    } else {
      game.replayPlayer.play();
      btnReplayPlayPause.textContent = '⏸';
    }
  });

  replaySeekSlider.addEventListener('input', (e) => {
    const val = Number((e.target as HTMLInputElement).value);
    const targetMs = (val / 1000) * game.replayPlayer.totalDurationMs;
    game.replayPlayer.seek(targetMs);
  });

  const setupSpeedBtn = (speed: number, btn: HTMLElement) => {
    btn.addEventListener('click', () => {
      game.replayPlayer.playbackSpeed = speed;
      Object.values(speedButtons).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  };
  setupSpeedBtn(0.5, speedButtons['0.5']);
  setupSpeedBtn(1.0, speedButtons['1.0']);
  setupSpeedBtn(2.0, speedButtons['2.0']);

  // 5. 모달 액션 버튼
  modalBtnReplay.addEventListener('click', () => {
    finishModal.classList.remove('open');
    setModeUI('REPLAY');
  });

  modalBtnRestart.addEventListener('click', () => {
    finishModal.classList.remove('open');
    game.resetCarToStart();
    setModeUI('DRIVING');
  });

  modalBtnDownload.addEventListener('click', () => {
    if (!latestFinishedMetadata) return;
    const ticks = game.recorder.getTicks();
    const buffer = TelemetryCodec.encode(ticks, latestFinishedMetadata.trackId);

    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${latestFinishedMetadata.matchCode}_replay.bin`;
    a.click();
    URL.revokeObjectURL(url);
  });
});
