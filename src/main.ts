import { Game, GameUIState } from './core/Game.ts';
import { MatchSummaryMetadata } from './replay/ReplayTypes.ts';
import { ReplayCodec } from './replay/ReplayCodec.ts';
import { VehiclePreview } from './game/VehiclePreview.ts';
import { HoneycombPicker } from './game/HoneycombPicker.ts';
import { TRACK_DEFINITIONS } from './data/tracks.ts';
import { VEHICLE_MODELS } from './data/vehicles.ts';
import { RANDOM_DRIVER_NAMES, TIME_OF_DAY_LABELS, WEATHER_LABELS } from './data/gameConstants.ts';
import { LoadingScreen } from './game/LoadingScreen.ts';

window.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('game-container') as HTMLElement;
  const minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;

  if (!container || !minimapCanvas) return;

  // 게임 메인 인스턴스 초기화
  const game = new Game(container, minimapCanvas);

  // 로딩 씬 인스턴스 초기화 (Dual-purpose: 엔진 초기화 및 인게임 전 로딩)
  const loadingScreen = new LoadingScreen();

  // DOM 요소 참조
  // 타이틀 씬 DOM
  const titleSceneOverlay = document.getElementById('title-scene-overlay')!;
  const titleBtnStart = document.getElementById('title-btn-start')!;
  const titleBtnHistory = document.getElementById('title-btn-history')!;
  const titleBtnSettings = document.getElementById('title-btn-settings')!;
  const btnModeTitle = document.getElementById('btn-mode-title')!;
  const modalBtnTitle = document.getElementById('modal-btn-title')!;

  // 6. 게임 설정 위저드 모달 (Game Setup Wizard) DOM
  const gameSetupModal = document.getElementById('game-setup-modal')!;
  const setupBtnClose = document.getElementById('setup-btn-close')!;
  const wizardCurrentStepTitle = document.getElementById('wizard-current-step-title')!;
  const wizardStepTabs = document.querySelectorAll<HTMLElement>('.wizard-step-tab');
  const wizardStepPanels = document.querySelectorAll<HTMLElement>('.wizard-step-panel');

  // 위저드 풋터 네비게이션 버튼
  const wizardBtnPrev = document.getElementById('wizard-btn-prev') as HTMLButtonElement;
  const wizardBtnNext = document.getElementById('wizard-btn-next') as HTMLButtonElement;
  const wizardBtnStart = document.getElementById('wizard-btn-start') as HTMLButtonElement;
  const wizardBtnRandomAll = document.getElementById('wizard-btn-random-all') as HTMLButtonElement;

  // Step 1: 서킷 선택 DOM
  const wizardTrackCards = document.querySelectorAll<HTMLElement>('.wizard-choice-card[data-track]');
  const trackSvgMonaco = document.getElementById('track-svg-monaco')!;
  const trackSvgSilverstone = document.getElementById('track-svg-silverstone')!;
  const trackSvgNurburgring = document.getElementById('track-svg-nurburgring')!;
  const trackShowcaseTitle = document.getElementById('track-showcase-title')!;
  const trackShowcaseBadge = document.getElementById('track-showcase-badge')!;
  const trackShowcaseDesc = document.getElementById('track-showcase-desc')!;
  const trackSpecLen = document.getElementById('track-spec-len')!;
  const trackSpecCorners = document.getElementById('track-spec-corners')!;
  const trackSpecRecord = document.getElementById('track-spec-record')!;
  const trackSpecType = document.getElementById('track-spec-type')!;

  // Step 2: 머신 & 컬러 DOM
  const wizardModelCards = document.querySelectorAll<HTMLElement>('.wizard-choice-card[data-model]');
  const wizardHoneycombContainer = document.getElementById('wizard-honeycomb-picker-container');
  const wizardVehicleCanvas = document.getElementById('wizard-vehicle-canvas') as HTMLCanvasElement;
  const vehicleSpecSpeed = document.getElementById('vehicle-spec-speed')!;
  const vehicleSpecAccel = document.getElementById('vehicle-spec-accel')!;
  const vehicleSpecDownforce = document.getElementById('vehicle-spec-downforce')!;
  const vehicleSpecHandling = document.getElementById('vehicle-spec-handling')!;

  // 7. 인게임 일시정지 모달 DOM
  const pauseModal = document.getElementById('pause-modal')!;
  const pauseBtnResume = document.getElementById('pause-btn-resume')!;
  const pauseBtnRestart = document.getElementById('pause-btn-restart')!;
  const pauseBtnSettings = document.getElementById('pause-btn-settings')!;
  const pauseBtnExit = document.getElementById('pause-btn-exit')!;
  const pauseInfoTrack = document.getElementById('pause-info-track')!;
  const pauseInfoCar = document.getElementById('pause-info-car')!;
  const pauseInfoLap = document.getElementById('pause-info-lap')!;
  const pauseInfoTime = document.getElementById('pause-info-time')!;

  // Step 3: 환경 (시간 & 날씨) DOM
  const envTimeChips = document.querySelectorAll<HTMLElement>('.env-chip-btn[data-time]');
  const envWeatherChips = document.querySelectorAll<HTMLElement>('.env-chip-btn[data-weather]');
  const envSummaryText = document.getElementById('env-summary-text')!;

  // Step 4: 드라이버 프로필 & 자동주행 & 세션 브리핑 DOM
  const wizardDriverName = document.getElementById('wizard-driver-name') as HTMLInputElement;
  const wizardBtnRandomName = document.getElementById('wizard-btn-random-name')!;
  const wizardChkAutodrive = document.getElementById('wizard-chk-autodrive') as HTMLInputElement;
  const briefingTrack = document.getElementById('briefing-track')!;
  const briefingModel = document.getElementById('briefing-model')!;
  const briefingColorDot = document.getElementById('briefing-color-dot') as HTMLElement;
  const briefingEnv = document.getElementById('briefing-env')!;
  const briefingDriver = document.getElementById('briefing-driver')!;

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

  // 4. 게임 설정 위저드 (Game Setup Wizard) 인터랙션 핸들러
  let vehiclePreview: VehiclePreview | null = null;
  if (wizardVehicleCanvas) {
    try {
      vehiclePreview = new VehiclePreview(wizardVehicleCanvas);
    } catch (e) {
      console.warn('VehiclePreview init failed', e);
    }
  }

  let currentWizardStep: 1 | 2 | 3 | 4 = 1;
  let selectedTrack: 'circuit_monaco' | 'circuit_silverstone' | 'circuit_nurburgring' = 'circuit_monaco';
  let selectedModel: 'gt_turbo' | 'formula_aero' | 'cyber_speedster' = 'gt_turbo';
  let selectedColor = '#ef4444';
  let selectedTime: 'morning' | 'noon' | 'sunset' | 'night' = 'noon';
  let selectedWeather: 'clear' | 'rain' | 'wind_fog' = 'clear';

  // Step 1: 서킷 쇼케이스 갱신
  const updateTrackShowcase = () => {
    wizardTrackCards.forEach(c => {
      c.classList.toggle('active', c.dataset.track === selectedTrack);
    });

    trackSvgMonaco.classList.toggle('active', selectedTrack === 'circuit_monaco');
    trackSvgSilverstone.classList.toggle('active', selectedTrack === 'circuit_silverstone');
    trackSvgNurburgring.classList.toggle('active', selectedTrack === 'circuit_nurburgring');

    const meta = TRACK_DEFINITIONS[selectedTrack];
    if (meta) {
      trackShowcaseTitle.textContent = meta.title;
      trackShowcaseBadge.textContent = meta.badge;
      trackShowcaseBadge.className = `choice-card-badge ${meta.badgeClass}`;
      trackShowcaseDesc.textContent = meta.desc;
      trackSpecLen.textContent = meta.len;
      trackSpecCorners.textContent = meta.corners;
      trackSpecRecord.textContent = meta.record;
      trackSpecType.textContent = meta.type;
    }
    if (briefingTrack) briefingTrack.textContent = meta?.title || selectedTrack;
  };

  // Step 2: 차량 모델 & 스펙 갱신
  const updateModelShowcase = () => {
    wizardModelCards.forEach(c => {
      c.classList.toggle('active', c.dataset.model === selectedModel);
    });

    const meta = VEHICLE_MODELS[selectedModel];
    if (meta) {
      vehicleSpecSpeed.textContent = meta.speed;
      vehicleSpecAccel.textContent = meta.accel;
      vehicleSpecDownforce.textContent = meta.downforce;
      vehicleSpecHandling.textContent = meta.handling;
    }

    vehiclePreview?.setModel(selectedModel);
    game.playerVehicle.setModel(selectedModel);
    if (briefingModel) briefingModel.textContent = meta?.title || selectedModel;
  };

  // Step 2: 허니콤 헥사곤 컬러 팔레트 인스턴스 초기화 (설정에 임베디드)
  let honeycombPicker: HoneycombPicker | null = null;
  if (wizardHoneycombContainer) {
    try {
      honeycombPicker = new HoneycombPicker(wizardHoneycombContainer, selectedColor, (hex) => {
        updateColor(hex, false);
      });
    } catch (e) {
      console.warn('HoneycombPicker init failed', e);
    }
  }

  // Step 2: 차량 리버리 컬러 동적 갱신
  const updateColor = (hexVal: string, syncPicker: boolean = false) => {
    selectedColor = hexVal;
    if (syncPicker && honeycombPicker) {
      honeycombPicker.selectColor(hexVal);
    }

    const hexNum = parseInt(hexVal.replace('#', '0x'), 16);
    vehiclePreview?.setColor(hexNum);
    game.playerVehicle.setColor(hexNum);
    if (briefingColorDot) briefingColorDot.style.backgroundColor = hexVal;
  };

  // Step 3: 환경 (시간 & 날씨) 갱신
  const updateEnvironmentShowcase = () => {
    envTimeChips.forEach(c => {
      c.classList.toggle('active', c.dataset.time === selectedTime);
    });
    envWeatherChips.forEach(c => {
      c.classList.toggle('active', c.dataset.weather === selectedWeather);
    });

    if (envSummaryText) {
      envSummaryText.textContent = `${TIME_OF_DAY_LABELS[selectedTime] || selectedTime} + ${WEATHER_LABELS[selectedWeather] || selectedWeather}`;
    }

    game.setEnvironment(selectedTime, selectedWeather);

    const timeUpper = selectedTime.toUpperCase();
    const weatherUpper = selectedWeather === 'wind_fog' ? 'WIND & FOG' : selectedWeather.toUpperCase();
    if (briefingEnv) briefingEnv.textContent = `${timeUpper} + ${weatherUpper}`;
  };

  // Step 4: 세션 브리핑 카드 갱신
  const updateBriefingCard = () => {
    if (briefingTrack) briefingTrack.textContent = TRACK_DEFINITIONS[selectedTrack]?.title || selectedTrack;
    if (briefingModel) briefingModel.textContent = VEHICLE_MODELS[selectedModel]?.title || selectedModel;
    if (briefingColorDot) briefingColorDot.style.backgroundColor = selectedColor;

    const timeUpper = selectedTime.toUpperCase();
    const weatherUpper = selectedWeather === 'wind_fog' ? 'WIND & FOG' : selectedWeather.toUpperCase();
    if (briefingEnv) briefingEnv.textContent = `${timeUpper} + ${weatherUpper}`;

    if (briefingDriver) {
      if (wizardChkAutodrive.checked) {
        briefingDriver.textContent = 'AI 4-CAR SIMULATION (컴퓨터 자율 주행 배틀)';
      } else {
        const name = wizardDriverName.value.trim() || 'Apex Hunter';
        briefingDriver.textContent = `${name} (수동 주행)`;
      }
    }
  };

  // 위저드 스텝 이동 함수
  const stepTitles = [
    '01 CIRCUIT // 서킷 트랙 선택',
    '02 MACHINE // 머신 모델 & 리버리 컬러',
    '03 ENVIRONMENT // 시간대 & 기후 환경',
    '04 DRIVER & MODE // 드라이버 프로필 & 주행 모드'
  ];

  const goToStep = (step: 1 | 2 | 3 | 4) => {
    currentWizardStep = step;

    if (wizardCurrentStepTitle) {
      wizardCurrentStepTitle.textContent = stepTitles[step - 1];
    }

    wizardStepTabs.forEach(tab => {
      tab.classList.toggle('active', Number(tab.dataset.step) === step);
    });

    wizardStepPanels.forEach((panel, idx) => {
      panel.classList.toggle('active', idx + 1 === step);
    });

    wizardBtnPrev.disabled = (step === 1);

    if (step === 4) {
      wizardBtnNext.style.display = 'none';
      wizardBtnStart.style.display = 'inline-block';
      updateBriefingCard();
    } else {
      wizardBtnNext.style.display = 'inline-block';
      wizardBtnStart.style.display = 'none';
    }

    // Step 2 진입 시 턴테이블 3D 렌더링 가동, 벗어날 시 정지
    if (step === 2) {
      vehiclePreview?.start();
      setTimeout(() => vehiclePreview?.resize(), 40);
    } else {
      vehiclePreview?.stop();
    }
  };

  // 스텝 인디케이터 탭 클릭 이벤트
  wizardStepTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const step = Number(tab.dataset.step) as 1 | 2 | 3 | 4;
      if (step >= 1 && step <= 4) goToStep(step);
    });
  });

  // 이전 / 다음 단계 버튼 이벤트
  wizardBtnPrev.addEventListener('click', () => {
    if (currentWizardStep > 1) {
      goToStep((currentWizardStep - 1) as 1 | 2 | 3 | 4);
    }
  });

  wizardBtnNext.addEventListener('click', () => {
    if (currentWizardStep < 4) {
      goToStep((currentWizardStep + 1) as 1 | 2 | 3 | 4);
    }
  });

  // Step 1: 서킷 선택 카드 이벤트
  wizardTrackCards.forEach(card => {
    card.addEventListener('click', () => {
      selectedTrack = (card.dataset.track as any) || 'circuit_monaco';
      updateTrackShowcase();
    });
  });

  // Step 2: 머신 선택 카드 이벤트
  wizardModelCards.forEach(card => {
    card.addEventListener('click', () => {
      selectedModel = (card.dataset.model as any) || 'gt_turbo';
      updateModelShowcase();
    });
  });

  // Step 3: 환경 (시간대 & 기후) 이벤트
  envTimeChips.forEach(chip => {
    chip.addEventListener('click', () => {
      selectedTime = (chip.dataset.time as any) || 'noon';
      updateEnvironmentShowcase();
    });
  });

  envWeatherChips.forEach(chip => {
    chip.addEventListener('click', () => {
      selectedWeather = (chip.dataset.weather as any) || 'clear';
      updateEnvironmentShowcase();
    });
  });

  // Step 4: 드라이버 랜덤 닉네임 & 자동주행 모드 토글
  const pickRandomName = () => {
    const rand = RANDOM_DRIVER_NAMES[Math.floor(Math.random() * RANDOM_DRIVER_NAMES.length)];
    wizardDriverName.value = rand;
    if (currentWizardStep === 4) updateBriefingCard();
  };
  pickRandomName();

  wizardBtnRandomName.addEventListener('click', pickRandomName);

  wizardDriverName.addEventListener('input', () => {
    if (currentWizardStep === 4) updateBriefingCard();
  });

  wizardChkAutodrive.addEventListener('change', () => {
    if (wizardChkAutodrive.checked) {
      wizardDriverName.disabled = true;
      wizardBtnRandomName.setAttribute('disabled', 'true');
      (wizardBtnRandomName as HTMLElement).style.pointerEvents = 'none';
      (wizardBtnRandomName as HTMLElement).style.opacity = '0.4';
    } else {
      wizardDriverName.disabled = false;
      wizardBtnRandomName.removeAttribute('disabled');
      (wizardBtnRandomName as HTMLElement).style.pointerEvents = 'auto';
      (wizardBtnRandomName as HTMLElement).style.opacity = '1';
    }
    if (currentWizardStep === 4) updateBriefingCard();
  });

  // 전체 랜덤 선택 (ALL RANDOM) 버튼
  wizardBtnRandomAll.addEventListener('click', () => {
    pickRandomName();

    const tracks: Array<'circuit_monaco' | 'circuit_silverstone' | 'circuit_nurburgring'> = [
      'circuit_monaco', 'circuit_silverstone', 'circuit_nurburgring'
    ];
    selectedTrack = tracks[Math.floor(Math.random() * tracks.length)];
    updateTrackShowcase();

    const models: Array<'gt_turbo' | 'formula_aero' | 'cyber_speedster'> = [
      'gt_turbo', 'formula_aero', 'cyber_speedster'
    ];
    selectedModel = models[Math.floor(Math.random() * models.length)];
    updateModelShowcase();

    const randHex = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    updateColor(randHex, true);

    const times: Array<'morning' | 'noon' | 'sunset' | 'night'> = ['morning', 'noon', 'sunset', 'night'];
    selectedTime = times[Math.floor(Math.random() * times.length)];

    const weathers: Array<'clear' | 'rain' | 'wind_fog'> = ['clear', 'rain', 'wind_fog'];
    selectedWeather = weathers[Math.floor(Math.random() * weathers.length)];
    updateEnvironmentShowcase();

    updateBriefingCard();
  });

  // 전체화면 토글
  btnFullscreen?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  // 타이틀 씬 시작 버튼 클릭 -> 위저드 모달 1단계 오픈
  titleBtnStart.addEventListener('click', () => {
    game.audio.init();
    gameSetupModal.classList.add('open');
    goToStep(1);
  });

  setupBtnClose.addEventListener('click', () => {
    gameSetupModal.classList.remove('open');
    vehiclePreview?.stop();
  });

  // 위저드 4단계: 레이스 시작 버튼
  wizardBtnStart.addEventListener('click', async () => {
    gameSetupModal.classList.remove('open');
    vehiclePreview?.stop();
    game.audio.init();

    const trackMeta = TRACK_DEFINITIONS[selectedTrack] || TRACK_DEFINITIONS.circuit_monaco;
    const modelMeta = VEHICLE_MODELS[selectedModel] || VEHICLE_MODELS.gt_turbo;

    // 인게임 전 로딩 씬 실행 (Dual-purpose Pre-Race Loading: 프로그레스바 + 배경화면 + 설명팁)
    await loadingScreen.runPreRaceLoad(trackMeta.title, modelMeta.title);

    // 1. 서킷 실시간 동적 로드 (선택된 트랙 반영 및 3D 지오메트리/미니맵 리빌드!)
    game.loadTrack(selectedTrack);

    // 2. 환경 (시간대, 날씨) 적용
    game.setEnvironment(selectedTime, selectedWeather);

    // 3. 머신 모델 및 커스텀 컬러 적용
    game.playerVehicle.setModel(selectedModel);
    updateColor(selectedColor);

    if (wizardChkAutodrive.checked) {
      setModeUI('DEMO');
    } else {
      const driverName = wizardDriverName.value.trim() || 'Apex Hunter';
      game.currentDriverName = driverName;
      updateModelShowcase();
      setModeUI('DRIVING');
      game.startCountdown();
    }
  });

  // 윈도우 리사이즈 시 턴테이블 뷰어 반응형 크기 조정
  window.addEventListener('resize', () => {
    if (gameSetupModal.classList.contains('open') && currentWizardStep === 2) {
      vehiclePreview?.resize();
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

  // 인게임 일시정지 (Pause / Resume) 제어 핸들러
  const pauseRace = () => {
    if (game.mode !== 'DRIVING' && game.mode !== 'DEMO' && game.mode !== 'REPLAY') return;
    game.pause();

    if (pauseInfoTrack) pauseInfoTrack.textContent = TRACK_DEFINITIONS[selectedTrack]?.title || game.currentTrackId;
    if (pauseInfoCar) pauseInfoCar.textContent = VEHICLE_MODELS[selectedModel]?.title || game.playerVehicle.currentModelId;
    if (pauseInfoLap) pauseInfoLap.textContent = `LAP ${game.lapTimer.currentLap.toString().padStart(2, '0')} / ${game.lapTimer.totalLaps.toString().padStart(2, '0')}`;
    const s = (game.lapTimer.currentLapTimeMs / 1000).toFixed(3);
    if (pauseInfoTime) pauseInfoTime.textContent = `${s}s`;

    pauseModal.classList.add('open');
  };

  const resumeRace = () => {
    pauseModal.classList.remove('open');
    game.resume();
  };

  const restartRace = () => {
    pauseModal.classList.remove('open');
    game.restartRace();
  };

  const exitRaceToTitle = () => {
    pauseModal.classList.remove('open');
    setModeUI('TITLE');
  };

  pauseBtnResume?.addEventListener('click', resumeRace);
  pauseBtnRestart?.addEventListener('click', restartRace);
  pauseBtnSettings?.addEventListener('click', () => {
    syncAudioSettingsUI();
    settingsModal.classList.add('open');
  });
  pauseBtnExit?.addEventListener('click', exitRaceToTitle);

  // 단축키: ESC로 일시정지/재개 및 모달 닫기, O로 설정 토글, R로 재시작, F로 전체화면
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (settingsModal.classList.contains('open')) {
        closeSettings();
      } else if (gameSetupModal.classList.contains('open')) {
        gameSetupModal.classList.remove('open');
        vehiclePreview?.stop();
      } else if (matchHistoryModal.classList.contains('open')) {
        matchHistoryModal.classList.remove('open');
      } else if (finishModal.classList.contains('open')) {
        finishModal.classList.remove('open');
        setModeUI('TITLE');
      } else if (game.mode === 'DRIVING' || game.mode === 'DEMO' || game.mode === 'REPLAY') {
        if (pauseModal.classList.contains('open')) {
          resumeRace();
        } else {
          pauseRace();
        }
      }
    } else if (e.key === 'r' || e.key === 'R') {
      if (pauseModal.classList.contains('open')) {
        restartRace();
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

  // 초기 시작 화면: 타이틀 씬 설정 및 비동기 최초 부팅 로딩 씬 실행
  setModeUI('TITLE');
  loadingScreen.runInitialLoad();
});

