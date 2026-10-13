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
  const btnModeTitle = document.getElementById('btn-mode-title')!;
  const modalBtnTitle = document.getElementById('modal-btn-title')!;

  // 게임 설정 모달 DOM
  const gameSetupModal = document.getElementById('game-setup-modal')!;
  const setupBtnClose = document.getElementById('setup-btn-close')!;
  const setupChkAutoDrive = document.getElementById('setup-chk-autodrive') as HTMLInputElement;
  const setupOptionsContainer = document.getElementById('setup-options-container')!;
  const setupDriverName = document.getElementById('setup-driver-name') as HTMLInputElement;
  const setupBtnRandomName = document.getElementById('setup-btn-random-name')!;
  const setupBtnRandomAll = document.getElementById('setup-btn-random-all')!;
  const setupBtnStartRace = document.getElementById('setup-btn-start-race')!;

  const trackCards = document.querySelectorAll<HTMLElement>('.setup-card[data-track]');
  const modelCards = document.querySelectorAll<HTMLElement>('.setup-card[data-model]');
  const colorChips = document.querySelectorAll<HTMLElement>('.color-chip[data-color]');
  const weatherChips = document.querySelectorAll<HTMLElement>('.weather-chip[data-weather]');

  // 커스텀 컬러 피커 DOM
  const customColorPicker = document.getElementById('setup-custom-color-picker') as HTMLInputElement;
  const customColorDot = document.getElementById('custom-color-dot') as HTMLElement;
  const customColorHex = document.getElementById('custom-color-hex') as HTMLElement;
  const colorPickerBox = document.getElementById('color-picker-box') as HTMLElement;

  // 3단계 전적 검색 & 글로벌 리더보드 모달 DOM
  const matchHistoryModal = document.getElementById('match-history-modal')!;
  const historyBtnClose = document.getElementById('history-btn-close')!;
  const historyBtnCloseBottom = document.getElementById('history-btn-close-bottom')!;
  const btnTopHistory = document.getElementById('btn-top-history');
  const btnFullscreen = document.getElementById('btn-fullscreen');
  const historyTabBtns = document.querySelectorAll<HTMLElement>('.history-tab-btn');
  const historySearchInput = document.getElementById('history-search-driver') as HTMLInputElement;
  const historyBtnSearch = document.getElementById('history-btn-search')!;
  const historyBtnRefresh = document.getElementById('history-btn-refresh')!;
  const historyReplayBtns = document.querySelectorAll<HTMLElement>('.history-replay-btn');

  const RANDOM_NAMES = [
    'Apex Hunter',
    '스피드마스터',
    'Monaco Ghost',
    '질주본능',
    'Turbo Nova',
    '한밤의질주',
    'Phantom GT',
    '드리프트킹',
    'Redline Fox',
    '분노의질주'
  ];

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

  // 4. 게임 설정 인터랙션 핸들러
  let selectedTrack = 'circuit_monaco';
  let selectedModel = 'gt_turbo';
  let selectedColor = '#ef4444';
  let selectedWeather = 'clear';

  const selectRadioGroup = (elements: NodeListOf<HTMLElement>, activeEl: HTMLElement) => {
    elements.forEach(el => {
      el.classList.remove('active');
      const input = el.querySelector('input');
      if (input) input.checked = false;
    });
    activeEl.classList.add('active');
    const input = activeEl.querySelector('input');
    if (input) input.checked = true;
  };

  const updateCarVisuals = () => {
    game.playerVehicle.setModel(selectedModel as any);
    const hex = parseInt(selectedColor.replace('#', '0x'), 16);
    game.playerVehicle.setColor(hex);
  };

  trackCards.forEach(card => {
    card.addEventListener('click', () => {
      if (setupChkAutoDrive.checked) return;
      selectRadioGroup(trackCards, card);
      selectedTrack = card.dataset.track || 'circuit_monaco';
    });
  });

  modelCards.forEach(card => {
    card.addEventListener('click', () => {
      if (setupChkAutoDrive.checked) return;
      selectRadioGroup(modelCards, card);
      selectedModel = card.dataset.model || 'gt_turbo';
      updateCarVisuals();
    });
  });

  // 컬러 칩 클릭 핸들러
  colorChips.forEach(chip => {
    chip.addEventListener('click', () => {
      if (setupChkAutoDrive.checked) return;
      selectRadioGroup(colorChips, chip);
      colorPickerBox?.classList.remove('active');
      const c = chip.dataset.color || '#ef4444';
      selectedColor = c;
      if (customColorPicker) customColorPicker.value = c;
      if (customColorDot) customColorDot.style.backgroundColor = c;
      if (customColorHex) customColorHex.textContent = c.toUpperCase();
      updateCarVisuals();
    });
  });

  // 직접 입력 컬러 피커 핸들러
  const handleCustomColorInput = (hexVal: string) => {
    if (setupChkAutoDrive.checked) return;
    colorChips.forEach(c => c.classList.remove('active'));
    colorPickerBox?.classList.add('active');
    selectedColor = hexVal;
    if (customColorDot) customColorDot.style.backgroundColor = hexVal;
    if (customColorHex) customColorHex.textContent = hexVal.toUpperCase();
    updateCarVisuals();
  };

  customColorPicker?.addEventListener('input', (e) => {
    handleCustomColorInput((e.target as HTMLInputElement).value);
  });
  customColorPicker?.addEventListener('change', (e) => {
    handleCustomColorInput((e.target as HTMLInputElement).value);
  });

  weatherChips.forEach(chip => {
    chip.addEventListener('click', () => {
      if (setupChkAutoDrive.checked) return;
      selectRadioGroup(weatherChips, chip);
      selectedWeather = chip.dataset.weather || 'clear';
      game.setWeather(selectedWeather as any);
    });
  });

  const pickRandomName = () => {
    const rand = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
    setupDriverName.value = rand;
  };
  pickRandomName(); // 기본 1개 세팅

  setupBtnRandomName.addEventListener('click', pickRandomName);

  setupBtnRandomAll.addEventListener('click', () => {
    if (setupChkAutoDrive.checked) return;
    pickRandomName();

    const randTrack = trackCards[Math.floor(Math.random() * trackCards.length)];
    selectRadioGroup(trackCards, randTrack);
    selectedTrack = randTrack.dataset.track || 'circuit_monaco';

    const randModel = modelCards[Math.floor(Math.random() * modelCards.length)];
    selectRadioGroup(modelCards, randModel);
    selectedModel = randModel.dataset.model || 'gt_turbo';

    const randColor = colorChips[Math.floor(Math.random() * colorChips.length)];
    selectRadioGroup(colorChips, randColor);
    colorPickerBox?.classList.remove('active');
    selectedColor = randColor.dataset.color || '#ef4444';
    if (customColorPicker) customColorPicker.value = selectedColor;
    if (customColorDot) customColorDot.style.backgroundColor = selectedColor;
    if (customColorHex) customColorHex.textContent = selectedColor.toUpperCase();

    const randWeather = weatherChips[Math.floor(Math.random() * weatherChips.length)];
    selectRadioGroup(weatherChips, randWeather);
    selectedWeather = randWeather.dataset.weather || 'clear';
    game.setWeather(selectedWeather as any);

    updateCarVisuals();
  });

  // 자동주행 체크박스 토글 -> 하위 옵션 disabled 처리
  setupChkAutoDrive.addEventListener('change', () => {
    if (setupChkAutoDrive.checked) {
      setupOptionsContainer.classList.add('disabled');
    } else {
      setupOptionsContainer.classList.remove('disabled');
    }
  });

  // 전체화면 토글
  btnFullscreen?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  // 타이틀 씬 메뉴 버튼 이벤트
  titleBtnStart.addEventListener('click', () => {
    game.audio.init();
    gameSetupModal.classList.add('open');
  });

  setupBtnClose.addEventListener('click', () => {
    gameSetupModal.classList.remove('open');
  });

  setupBtnStartRace.addEventListener('click', () => {
    gameSetupModal.classList.remove('open');
    game.audio.init();

    if (setupChkAutoDrive.checked) {
      // 자동 주행 모드 실행 (컴퓨터 AI 4대 배틀)
      setModeUI('DEMO');
    } else {
      // 직접 주행 모드 실행 - 선택된 옵션 엔진에 반영
      const driverName = setupDriverName.value.trim() || 'Apex Hunter';
      game.currentDriverName = driverName;
      game.currentTrackId = selectedTrack;
      updateCarVisuals();
      game.setWeather(selectedWeather as any);

      setModeUI('DRIVING');
    }
  });

  // 3단계 전적 검색 & 글로벌 리더보드 모달 이벤트
  titleBtnHistory.addEventListener('click', () => {
    matchHistoryModal.classList.add('open');
  });

  btnTopHistory?.addEventListener('click', () => {
    matchHistoryModal.classList.add('open');
  });

  historyBtnClose.addEventListener('click', () => {
    matchHistoryModal.classList.remove('open');
  });

  historyBtnCloseBottom.addEventListener('click', () => {
    matchHistoryModal.classList.remove('open');
  });

  // 트랙 탭 전환
  historyTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      historyTabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // 검색 필터링 인터랙션
  const filterMockRows = () => {
    const q = historySearchInput.value.trim().toLowerCase();
    const rows = document.querySelectorAll<HTMLElement>('#history-table-tbody tr');
    rows.forEach(r => {
      const text = r.textContent?.toLowerCase() || '';
      if (!q || text.includes(q)) {
        r.style.display = '';
      } else {
        r.style.display = 'none';
      }
    });
  };

  historyBtnSearch?.addEventListener('click', filterMockRows);
  historySearchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') filterMockRows();
  });

  historyBtnRefresh?.addEventListener('click', () => {
    historySearchInput.value = '';
    filterMockRows();
  });

  historyReplayBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const matchCode = btn.getAttribute('data-match');
      alert(`[Step 3 안내] 리플레이 매치 코드: ${matchCode}\n현재 3단계 UI 프로토타입 상태입니다. 다음 단계에서 실제 R2 압축 바이너리 스트리밍 및 3D 뷰어 재생이 연결됩니다.`);
    });
  });

  titleBtnSettings.addEventListener('click', () => {
    game.audio.init();
    syncAudioSettingsUI();
    settingsModal.classList.add('open');
  });

  btnModeTitle.addEventListener('click', () => setModeUI('TITLE'));
  btnModeDrive.addEventListener('click', () => {
    gameSetupModal.classList.add('open');
  });
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

  // 단축키: ESC로 타이틀 복귀 및 모달 닫기, O로 설정 토글, F로 전체화면
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (gameSetupModal.classList.contains('open')) {
        gameSetupModal.classList.remove('open');
      } else if (matchHistoryModal.classList.contains('open')) {
        matchHistoryModal.classList.remove('open');
      } else if (settingsModal.classList.contains('open')) {
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
    } else if ((e.key === 'f' || e.key === 'F') && !(e.target instanceof HTMLInputElement)) {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }
  });

  // 초기 시작 화면: 타이틀 씬
  setModeUI('TITLE');
});

