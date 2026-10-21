import { Game, GameUIState, GameMode } from './core/Game.ts';
import { MatchSummaryMetadata } from './replay/ReplayTypes.ts';
import { ReplayCodec } from './replay/ReplayCodec.ts';
import { LoadingScreen } from './ui/LoadingScreen.ts';
import { CIRCUIT_DEFINITIONS } from './data/circuits.ts';
import { VEHICLE_MODELS } from './data/vehicles.ts';
import { INGAME_BGM_TRACKS, BgmTrack } from './data/audio.ts';
import { keyBindingManager } from './core/KeyBindingManager.ts';

// UI Controllers
import { GameSetupWizard, RaceSetupConfig } from './ui/gamesetup/GameSetupWizard.ts';
import { HUDController } from './ui/hud/HUDController.ts';
import { FinishModal } from './ui/FinishModal.ts';
import { ReplayBarController } from './ui/ReplayBarController.ts';
import { SettingsModal } from './ui/SettingsModal.ts';
import { PauseModal } from './ui/PauseModal.ts';
import { MatchHistoryModal } from './ui/history/MatchHistoryModal.ts';
import { ModalManager } from './ui/ModalManager.ts';
import { i18nManager } from './i18n/I18nManager.ts';
import { appDB } from './storage/AppDatabase.ts';
import { initSeedReplays } from './storage/ReplaySeedService.ts';
import { showToast } from './ui/Toast.ts';

window.addEventListener('DOMContentLoaded', () => {
  i18nManager.init();
  initSeedReplays();

  const container = document.getElementById('game-container') as HTMLElement;
  const minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
  if (!container || !minimapCanvas) return;

  // 1. 게임 엔진 및 로딩 스크린 초기화
  const game = new Game(container, minimapCanvas);
  const savedViewMode = localStorage.getItem('apex_camera_view_mode');
  if (savedViewMode === 'FIRST_PERSON' || savedViewMode === 'THIRD_PERSON') {
    game.cameraController.viewMode = savedViewMode;
  }
  const loadingScreen = new LoadingScreen();

  // 2. 모듈식 UI 컨트롤러 초기화
  const hud = new HUDController();
  const settingsModal = new SettingsModal(game.audio, game);
  let onReplayUserInteract: (() => void) | undefined;
  const replayBar = new ReplayBarController(game.replayPlayer, () => onReplayUserInteract?.());

  // 모드 헤더 태그 DOM (있을 경우만 동기화)
  const modeTag = document.getElementById('mode-tag');
  const modeText = document.getElementById('mode-text');
  const titleSceneOverlay = document.getElementById('title-scene-overlay')!;

  const setModeUI = (mode: GameMode) => {
    game.setMode(mode);

    if (mode === 'TITLE') {
      document.body.classList.add('in-title-mode');
      titleSceneOverlay?.classList.add('active');
      if (modeTag) modeTag.className = 'mode-tag';
      if (modeText) modeText.textContent = 'TITLE // APEX RACING';
      replayBar.setVisible(false);
    } else {
      document.body.classList.remove('in-title-mode');
      titleSceneOverlay?.classList.remove('active');

      if (mode === 'DRIVING') {
        if (modeTag) modeTag.className = 'mode-tag';
        if (modeText) modeText.textContent = 'LIVE_DRIVING';
        replayBar.setVisible(false);
      } else if (mode === 'DEMO') {
        if (modeTag) modeTag.className = 'mode-tag demo-mode';
        if (modeText) modeText.textContent = 'DEMO_AI // 4 CARS';
        replayBar.setVisible(false);
      } else {
        if (modeTag) modeTag.className = 'mode-tag replay-mode';
        if (modeText) modeText.textContent = 'REPLAY_3D // MATCH REPLAY';
        replayBar.setVisible(true);
      }
    }
  };

  let lastInspectedMatchCode: string | null = null;

  const matchHistoryModal = new MatchHistoryModal({
    onPlayReplay: (record) => {
      lastInspectedMatchCode = record.matchCode;
      // 1. 다른 서킷일 경우 서킷 로드
      const recCircuitId = record.metadata.circuitId || 'circuit_monaco';
      if (recCircuitId && recCircuitId !== game.currentCircuitId) {
        game.loadCircuit(recCircuitId);
        const circuitMeta = CIRCUIT_DEFINITIONS[recCircuitId];
        if (circuitMeta) hud.setCircuitTitle(circuitMeta.title);
      }

      // 2. 플레이어 차량 스펙/컬러/이름 복원
      const model = record.metadata.vehicleModelId || (record.metadata as any).vehicleId;
      if (model) {
        game.playerVehicle.setVehicleModel(model as any);
        game.replayPlayer.ghostVehicle.setVehicleModel(model as any);
      }
      const color = record.metadata.color || (record.metadata as any).playerColorHex;
      if (color !== undefined) {
        game.playerVehicle.setColor(typeof color === 'number' ? `#${color.toString(16).padStart(6, '0')}` : color);
        game.replayPlayer.ghostVehicle.setColor(typeof color === 'number' ? `#${color.toString(16).padStart(6, '0')}` : color);
      }
      const driverName = record.metadata.driverName || (record.metadata as any).userNickname;
      if (driverName) {
        game.setDriverName(driverName);
      }

      // 3. 상대 3대 차량 모델/컬러/이름 동기화
      if (record.metadata.opponentConfigs) {
        game.replayPlayer.syncOpponents(record.metadata.opponentConfigs);
      }

      // 4. 리플레이 틱 데이터 로드 및 모드 전환 (카운트다운과 함께 재생 준비)
      game.currentReplayMetadata = record.metadata;
      game.replayPlayer.loadReplay(record.ticks);
      setModeUI('REPLAY');
      game.replayPlayer.seek(0);
      game.replayPlayer.pause();
      game.startCountdown(true);
      game.cameraController.snapToTarget(game.replayPlayer.ghostVehicle);
      replayBar.updateButtonState();

      showToast(`▶ [${record.matchCode}] ${driverName || 'Driver'} 리플레이 재생을 시작합니다.`);
    },
  });

  // 3. 게임 설정 위저드 모달 (Step 1~4)
  let currentConfig: RaceSetupConfig = {
    circuitId: 'circuit_monaco',
    vehicleModelId: 'gt_turbo',
    color: '#ef4444',
    timeOfDay: 'noon',
    weather: 'clear',
    driverName: 'Apex Hunter',
    isAutoDrive: false,
  };

  const wizard = new GameSetupWizard({
    onStartRace: (config) => {
      currentConfig = config;
      game.loadCircuit(config.circuitId);
      game.playerVehicle.setVehicleModel(config.vehicleModelId);
      game.playerVehicle.setColor(config.color);
      game.setDriverName(config.driverName);
      game.setEnvironment(config.timeOfDay, config.weather);

      const circuitMeta = CIRCUIT_DEFINITIONS[config.circuitId];
      if (circuitMeta) hud.setCircuitTitle(circuitMeta.title);

      setModeUI(config.isAutoDrive ? 'DEMO' : 'DRIVING');
      game.startRace(true);
    },
  });

  // 4. 완주 결과 모달 및 리플레이 저장
  let lastRaceMetadata: MatchSummaryMetadata | null = null;

  const finishModal = new FinishModal({
    onReplay: async () => {
      if (game.mode === 'REPLAY') {
        game.replayPlayer.seek(0);
        game.replayPlayer.pause();
        game.startCountdown(true);
        game.cameraController.snapToTarget(game.replayPlayer.ghostVehicle);
        replayBar.updateButtonState();
        return;
      }

      const ticks = game.recorder.getTicks();
      game.currentReplayMetadata = lastRaceMetadata;
      game.replayPlayer.loadReplay(ticks);
      setModeUI('REPLAY');
      game.replayPlayer.seek(0);
      game.replayPlayer.pause();
      game.startCountdown(true);
      game.cameraController.snapToTarget(game.replayPlayer.ghostVehicle);
      replayBar.updateButtonState();
    },
    onRestart: () => {
      game.restartRace();
    },
    onTitle: () => {
      setModeUI('TITLE');
    },
    onCaptureScreenshot: () => {
      game.renderer.render(game.scene, game.camera);
      return game.renderer.domElement.toDataURL('image/png');
    },
  });

  onReplayUserInteract = () => {
    if (game.raceState === 'FINISHED') {
      game.raceState = 'RUNNING';
      if (finishModal.isOpen()) finishModal.close();
      game.cameraController.snapToTarget(game.replayPlayer.ghostVehicle);
    }
  };

  game.onFinishCallback = async (metadata: MatchSummaryMetadata) => {
    lastRaceMetadata = metadata;
    const ticks = game.recorder.getTicks();
    if (ticks.length > 0 && game.mode === 'DRIVING') {
      try {
        const res = await appDB.saveReplay(metadata.matchCode, ticks, metadata);
        showToast(`💾 [${metadata.matchCode}] 주행 데이터가 자동 저장되었습니다. (${res.totalCount}/30)`);
      } catch (e) {
        console.warn('[AutoSave] Failed to save replay to IndexedDB:', e);
      }
    }
    finishModal.show(metadata, game.mode === 'REPLAY');
  };

  // 5. 일시정지 (Pause) 모달
  const pauseModal = new PauseModal({
    onResume: () => {
      game.resume();
      replayBar.updateButtonState();
    },
    onRestart: () => {
      if (game.mode === 'REPLAY') {
        if (finishModal.isOpen()) finishModal.close();
        game.replayPlayer.seek(0);
        game.replayPlayer.pause();
        game.startCountdown(true);
        game.cameraController.snapToTarget(game.replayPlayer.ghostVehicle);
        replayBar.updateButtonState();
      } else {
        game.restartRace();
      }
    },
    onSettings: () => settingsModal.open(),
    onExit: () => {
      if (game.mode === 'REPLAY') {
        game.replayPlayer.pause();
        setModeUI('TITLE');
        matchHistoryModal.open();
        if (lastInspectedMatchCode) {
          matchHistoryModal.openInspector(lastInspectedMatchCode);
        }
      } else {
        setModeUI('TITLE');
      }
    },
  });

  // 모달 중앙 관리자 등록
  ModalManager.register(wizard);
  ModalManager.register(settingsModal);
  ModalManager.register(matchHistoryModal);
  ModalManager.register(finishModal);
  ModalManager.register(pauseModal);

  const openPauseDialog = () => {
    if (game.mode !== 'DRIVING' && game.mode !== 'DEMO' && game.mode !== 'REPLAY') return;
    game.pause();
    const isReplay = game.mode === 'REPLAY';
    const circuitTitle = CIRCUIT_DEFINITIONS[currentConfig.circuitId]?.title || game.currentCircuitId;
    const vehicleTitle = VEHICLE_MODELS[currentConfig.vehicleModelId]?.title || game.playerVehicle.currentVehicleModelId;
    const lapStr = isReplay
      ? `LAP ${game.replayPlayer.currentLap.toString().padStart(2, '0')} / 03`
      : `LAP ${game.lapTimer.currentLap.toString().padStart(2, '0')} / ${game.lapTimer.totalLaps.toString().padStart(2, '0')}`;
    const timeStr = isReplay
      ? `${(game.replayPlayer.currentTimeMs / 1000).toFixed(3)}s`
      : `${(game.lapTimer.currentLapTimeMs / 1000).toFixed(3)}s`;
    pauseModal.show({ circuitTitle, vehicleTitle, lapStr, timeStr, isReplay });
  };

  // 6. 실시간 게임 상태 구독 -> HUD 및 리플레이 타임라인 동기화
  game.onStateUpdate = (state: GameUIState) => {
    hud.update(state);
    if (state.gameMode === 'REPLAY' && game.replayPlayer.totalDurationMs > 0) {
      replayBar.update(state.replayTimeStr);
    }
  };

  game.onSectorPassed = (driverName: string, sectorName: string, timeMs: number) => {
    hud.showSectorNotification(driverName, sectorName, timeMs);
  };

  // 7. 로비 & HUD 버튼 바인딩
  document.getElementById('title-btn-start')?.addEventListener('click', () => wizard.open());
  document.getElementById('title-btn-history')?.addEventListener('click', () => matchHistoryModal.open());
  document.getElementById('title-btn-settings')?.addEventListener('click', () => settingsModal.open());
  document.getElementById('btn-hud-pause')?.addEventListener('click', openPauseDialog);
  document.getElementById('btn-camera-view')?.addEventListener('click', (e) => {
    e.stopPropagation();
    game.toggleCameraView();
  });

  // BGM 변경 시 상단 중앙 마키 티커 및 로비 UI 동기화
  const lobbyBgmTitle = document.getElementById('lobby-bgm-title');
  const hudBgmText = document.getElementById('hud-bgm-text');
  const hudBgmTextDup = document.getElementById('hud-bgm-text-dup');

  const updateHudBgmTicker = (track: BgmTrack) => {
    const formatted = `🎵 OST // <span class="ost-title">${track.title}</span> <span class="ost-sep">—</span> <span class="ost-artist">${track.artist || 'APEX SOUNDWORKS'}</span> <span class="ost-sep">///</span> <span class="ost-genre">${track.genre || 'ORIGINAL SOUNDTRACK'}</span> <span class="ost-sep">///</span>`;
    if (hudBgmText) hudBgmText.innerHTML = formatted;
    if (hudBgmTextDup) hudBgmTextDup.innerHTML = formatted;
  };

  game.audio.onBgmChange = (track, scene) => {
    if (lobbyBgmTitle && scene === 'lobby') lobbyBgmTitle.textContent = `${track.title} — ${track.artist}`;
    if (scene === 'ingame') {
      updateHudBgmTicker(track);
    }
  };

  // 초기 BGM 마키 텍스트 설정
  updateHudBgmTicker(INGAME_BGM_TRACKS[0]);

  document.getElementById('btn-next-lobby-bgm')?.addEventListener('click', (e) => {
    e.stopPropagation();
    game.audio.init();
    game.audio.playNextLobbyBgm();
  });
  document.getElementById('hud-bgm-marquee')?.addEventListener('click', (e) => {
    e.stopPropagation();
    game.audio.init();
    game.audio.playNextInGameBgm();
  });

  // 8. 리모트 리플레이 브릿지 (Deep link & postMessage)
  const API_BASE = 'https://match-history-api.orsel.workers.dev';
  const loadRemoteReplay = async (matchCode: string) => {
    try {
      if (modeTag) modeTag.className = 'mode-tag replay-mode';
      if (modeText) modeText.textContent = `FETCHING // ${matchCode}`;
      const res = await fetch(`${API_BASE}/api/replays/${matchCode}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      const { ticks } = ReplayCodec.decode(arrayBuffer);
      game.replayPlayer.loadReplay(ticks);
      setModeUI('REPLAY');
      game.replayPlayer.play();
    } catch (err) {
      console.error('[ReplayBridge] Failed to load replay:', err);
      if (modeText) modeText.textContent = 'ERR: REPLAY LOAD FAILED';
    }
  };

  const urlParams = new URLSearchParams(window.location.search);
  const replayParam = urlParams.get('replay');
  if (replayParam) loadRemoteReplay(replayParam);

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.data?.type === 'LOAD_REPLAY' && event.data?.matchCode) {
      loadRemoteReplay(event.data.matchCode);
    }
  });

  // 9. 키보드 단축키 핸들러
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const closed = ModalManager.closeTopModal();
      if (closed) {
        if (closed === pauseModal) {
          game.resume();
        } else if (closed === finishModal) {
          setModeUI('TITLE');
        }
      } else if (game.mode === 'DRIVING' || game.mode === 'DEMO' || game.mode === 'REPLAY') {
        openPauseDialog();
      }
    } else if (game.mode === 'REPLAY' && (e.code === 'Space' || e.key === 'p' || e.key === 'P' || e.key === 'k' || e.key === 'K')) {
      if (!(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        game.replayPlayer.togglePlayPause();
        replayBar.updateButtonState();
      }
    } else if (e.key === 'r' || e.key === 'R') {
      if (!(e.target instanceof HTMLInputElement)) {
        if (pauseModal.isOpen()) {
          pauseModal.close();
          game.restartRace();
        } else if (game.mode === 'REPLAY') {
          game.replayPlayer.seek(0);
          game.replayPlayer.play();
          replayBar.updateButtonState();
        }
        // 주행 중(DRIVING 모드)에는 Game.ts의 [R] 트랙 안전 복귀(Track Respawn)가 독립 처리됨
      }
    } else if (keyBindingManager.isActionKey('headlights', e.code) || e.key === 'h' || e.key === 'H') {
      if (!(e.target instanceof HTMLInputElement)) {
        game.toggleHeadlights();
      }
    } else if (e.key === 'c' || e.key === 'C') {
      if (!(e.target instanceof HTMLInputElement)) {
        game.toggleCameraView();
      }
    } else if (e.key === 'o' || e.key === 'O') {
      if (settingsModal.isOpen()) settingsModal.close();
      else settingsModal.open();
    } else if ((e.key === 'f' || e.key === 'F') && !(e.target instanceof HTMLInputElement)) {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }
  });

  // 10. 최초 시뮬레이션 엔진 로딩 후 로비 씬 진입
  loadingScreen.runInitialLoad().then(() => {
    setModeUI('TITLE');
  });
});
