import { Game, GameUIState } from './core/Game.ts';
import { MatchSummaryMetadata } from './replay/ReplayTypes.ts';
import { ReplayCodec } from './replay/ReplayCodec.ts';

window.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('game-container') as HTMLElement;
  const minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;

  if (!container || !minimapCanvas) return;

  // 게임 메인 인스턴스 초기화
  const game = new Game(container, minimapCanvas);

  // DOM 요소 참조
  // 타이틀 씬 DOM
  const titleSceneOverlay = document.getElementById('title-scene-overlay')!;
  const titleBtnStart = document.getElementById('title-btn-start')!;
  const titleBtnHistory = document.getElementById('title-btn-history')!;
  const titleBtnSettings = document.getElementById('title-btn-settings')!;
  const titleBtnDemo = document.getElementById('title-btn-demo')!;
  const btnModeTitle = document.getElementById('btn-mode-title')!;
  const modalBtnTitle = document.getElementById('modal-btn-title')!;

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

  // 환경 설정 모달 DOM
  const btnSettings = document.getElementById('btn-settings')!;
  const settingsModal = document.getElementById('settings-modal')!;
  const settingsBtnClose = document.getElementById('settings-btn-close')!;
  const settingsBtnSave = document.getElementById('settings-btn-save')!;

  const volMaster = document.getElementById('vol-master') as HTMLInputElement;
  const volMasterVal = document.getElementById('vol-master-val')!;
  const volBgm = document.getElementById('vol-bgm') as HTMLInputElement;
  const volBgmVal = document.getElementById('vol-bgm-val')!;
  const volSfx = document.getElementById('vol-sfx') as HTMLInputElement;
  const volSfxVal = document.getElementById('vol-sfx-val')!;
  const btnTestSfx = document.getElementById('btn-test-sfx')!;
  const chkMute = document.getElementById('chk-mute') as HTMLInputElement;

  const settingSteer = document.getElementById('setting-steer') as HTMLInputElement;
  const settingSteerVal = document.getElementById('setting-steer-val')!;

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
  const setModeUI = (mode: 'TITLE' | 'DRIVING' | 'REPLAY' | 'DEMO') => {
    game.setMode(mode);

    // 버튼 활성 상태 초기화
    btnModeTitle.classList.remove('active');
    btnModeDrive.classList.remove('active');
    btnModeDemo.classList.remove('active');
    btnModeReplay.classList.remove('active');

    if (mode === 'TITLE') {
      document.body.classList.add('in-title-mode');
      titleSceneOverlay.classList.add('active');
      btnModeTitle.classList.add('active');
      modeTag.className = 'mode-tag';
      modeText.textContent = 'TITLE // APEX RACING';
      replayController.classList.remove('visible');
    } else {
      document.body.classList.remove('in-title-mode');
      titleSceneOverlay.classList.remove('active');

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
    }
  };

  // 타이틀 씬 메뉴 버튼 이벤트
  titleBtnStart.addEventListener('click', () => {
    game.audio.init();
    setModeUI('DRIVING');
  });

  titleBtnHistory.addEventListener('click', () => {
    alert('전적 검색 & 글로벌 리더보드는 다음 순서(3단계)에서 구현될 예정입니다.');
  });

  titleBtnSettings.addEventListener('click', () => {
    game.audio.init();
    syncAudioSettingsUI();
    settingsModal.classList.add('open');
  });

  titleBtnDemo.addEventListener('click', () => {
    game.audio.init();
    setModeUI('DEMO');
  });

  btnModeTitle.addEventListener('click', () => setModeUI('TITLE'));
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

  modalBtnTitle.addEventListener('click', () => {
    finishModal.classList.remove('open');
    setModeUI('TITLE');
  });

  modalBtnDownload.addEventListener('click', () => {
    if (!latestFinishedMetadata) return;
    const ticks = game.recorder.getTicks();
    const buffer = ReplayCodec.encode(ticks, latestFinishedMetadata.trackId);

    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${latestFinishedMetadata.matchCode}_replay.bin`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // 6. Embedding Page & Deep-link Replay Bridge
  const API_BASE = 'https://match-history-api.orsel.workers.dev';

  const loadRemoteReplay = async (matchCode: string) => {
    try {
      modeTag.className = 'mode-tag replay-mode';
      modeText.textContent = `FETCHING // ${matchCode}`;
      const res = await fetch(`${API_BASE}/api/replays/${matchCode}`);
      if (!res.ok) {
        throw new Error(`Failed to load replay (HTTP ${res.status}): ${res.statusText}`);
      }
      const arrayBuffer = await res.arrayBuffer();
      const { ticks } = ReplayCodec.decode(arrayBuffer);
      game.replayPlayer.loadReplay(ticks);
      setModeUI('REPLAY');
      game.replayPlayer.play();
      btnReplayPlayPause.textContent = '⏸';
      console.log(`[ReplayBridge] Loaded ${ticks.length} ticks for ${matchCode}`);
    } catch (err) {
      console.error('[ReplayBridge] Failed to load replay:', err);
      modeText.textContent = 'ERR: REPLAY LOAD FAILED';
    }
  };

  // URL Deep Link Support (?replay=RACE-XXXX)
  const urlParams = new URLSearchParams(window.location.search);
  const replayParam = urlParams.get('replay');
  if (replayParam) {
    loadRemoteReplay(replayParam);
  }

  // Parent Page Iframe Bridge (window.postMessage)
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.data?.type === 'LOAD_REPLAY' && event.data?.matchCode) {
      loadRemoteReplay(event.data.matchCode);
    }
  });

  // 7. 환경 설정 모달 이벤트 바인딩
  const syncAudioSettingsUI = () => {
    const s = game.audio.settings;
    volMaster.value = Math.round(s.masterVolume * 100).toString();
    volMasterVal.textContent = `${volMaster.value}%`;

    volBgm.value = Math.round(s.bgmVolume * 100).toString();
    volBgmVal.textContent = `${volBgm.value}%`;

    volSfx.value = Math.round(s.sfxVolume * 100).toString();
    volSfxVal.textContent = `${volSfx.value}%`;

    chkMute.checked = s.isMuted;
  };
  syncAudioSettingsUI();

  // 설정 열기/닫기
  btnSettings.addEventListener('click', () => {
    syncAudioSettingsUI();
    settingsModal.classList.add('open');
  });

  const closeSettings = () => {
    settingsModal.classList.remove('open');
  };

  settingsBtnClose.addEventListener('click', closeSettings);
  settingsBtnSave.addEventListener('click', closeSettings);

  // 실시간 볼륨 조절
  volMaster.addEventListener('input', () => {
    const v = Number(volMaster.value);
    volMasterVal.textContent = `${v}%`;
    game.audio.setMasterVolume(v / 100);
  });

  volBgm.addEventListener('input', () => {
    const v = Number(volBgm.value);
    volBgmVal.textContent = `${v}%`;
    game.audio.setBgmVolume(v / 100);
  });

  volSfx.addEventListener('input', () => {
    const v = Number(volSfx.value);
    volSfxVal.textContent = `${v}%`;
    game.audio.setSfxVolume(v / 100);
  });

  btnTestSfx.addEventListener('click', () => {
    game.audio.playTestBeep();
  });

  chkMute.addEventListener('change', () => {
    game.audio.setMute(chkMute.checked);
  });

  settingSteer.addEventListener('input', () => {
    const val = Number(settingSteer.value);
    settingSteerVal.textContent = `${(val / 100).toFixed(1)}x`;
  });

  // 단축키: ESC로 타이틀 복귀 및 모달 닫기, O로 설정 토글
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (settingsModal.classList.contains('open')) {
        closeSettings();
      } else if (finishModal.classList.contains('open')) {
        finishModal.classList.remove('open');
        setModeUI('TITLE');
      } else if (game.mode !== 'TITLE') {
        setModeUI('TITLE');
      }
    } else if (e.key === 'o' || e.key === 'O') {
      if (settingsModal.classList.contains('open')) {
        closeSettings();
      } else {
        syncAudioSettingsUI();
        settingsModal.classList.add('open');
      }
    }
  });

  // 초기 시작 화면: 타이틀 씬
  setModeUI('TITLE');
});

