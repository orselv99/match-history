import { Game, GameUIState, GameMode } from './core/Game.ts';
import { MatchSummaryMetadata } from './replay/ReplayTypes.ts';
import { ReplayCodec } from './replay/ReplayCodec.ts';
import { LoadingScreen } from './ui/LoadingScreen.ts';
import { TRACK_DEFINITIONS } from './data/circuitTracks.ts';
import { VEHICLE_MODELS } from './data/vehicles.ts';
import { INGAME_BGM_TRACKS, BgmTrack } from './data/audio.ts';
import { keyBindingManager } from './core/KeyBindingManager.ts';

// UI Controllers
import { GameSetupWizard, RaceSetupConfig } from './ui/GameSetupWizard.ts';
import { HUDController } from './ui/HUDController.ts';
import { FinishModal } from './ui/FinishModal.ts';
import { ReplayBarController } from './ui/ReplayBarController.ts';
import { SettingsModal } from './ui/SettingsModal.ts';
import { PauseModal } from './ui/PauseModal.ts';
import { MatchHistoryModal } from './ui/MatchHistoryModal.ts';
import { ModalManager } from './ui/ModalManager.ts';

window.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('game-container') as HTMLElement;
  const minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
  if (!container || !minimapCanvas) return;

  // 1. 게임 엔진 및 로딩 스크린 초기화
  const game = new Game(container, minimapCanvas);
  const loadingScreen = new LoadingScreen();

  // 2. 모듈식 UI 컨트롤러 초기화
  const hud = new HUDController();
  const matchHistoryModal = new MatchHistoryModal();
  const settingsModal = new SettingsModal(game.audio);
  const replayBar = new ReplayBarController(game.replayPlayer);

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

  // 3. 게임 설정 위저드 모달 (Step 1~4)
  let currentConfig: RaceSetupConfig = {
    trackId: 'circuit_monaco',
    modelId: 'gt_turbo',
    color: '#ef4444',
    timeOfDay: 'noon',
    weather: 'clear',
    driverName: 'Apex Hunter',
    isAutoDrive: false,
  };

  const wizard = new GameSetupWizard({
    onStartRace: (config) => {
      currentConfig = config;
      game.loadTrack(config.trackId);
      game.playerVehicle.setModel(config.modelId);
      game.playerVehicle.setColor(parseInt(config.color.replace('#', '0x'), 16));
      game.setDriverName(config.driverName);
      game.setEnvironment(config.timeOfDay, config.weather);

      const trackMeta = TRACK_DEFINITIONS[config.trackId];
      if (trackMeta) hud.setCircuitTitle(trackMeta.title);

      setModeUI(config.isAutoDrive ? 'DEMO' : 'DRIVING');
      game.startCountdown();
    },
  });

  // 4. 완주 결과 모달
  const finishModal = new FinishModal({
    onReplay: () => {
      const ticks = game.recorder.getTicks();
      game.replayPlayer.loadReplay(ticks);
      setModeUI('REPLAY');
      game.replayPlayer.play();
    },
    onRestart: () => {
      game.restartRace();
    },
    onTitle: () => {
      setModeUI('TITLE');
    },
    onDownload: (meta) => {
      const ticks = game.recorder.getTicks();
      const buffer = ReplayCodec.encode(ticks, meta.trackId);
      const blob = new Blob([buffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${meta.matchCode}_replay.bin`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  game.onFinishCallback = (metadata: MatchSummaryMetadata) => {
    finishModal.show(metadata);
  };

  // 5. 일시정지 (Pause) 모달
  const pauseModal = new PauseModal({
    onResume: () => game.resume(),
    onRestart: () => game.restartRace(),
    onSettings: () => settingsModal.open(),
    onExit: () => setModeUI('TITLE'),
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
    const trackTitle = TRACK_DEFINITIONS[currentConfig.trackId]?.title || game.currentTrackId;
    const vehicleTitle = VEHICLE_MODELS[currentConfig.modelId]?.title || game.playerVehicle.currentModelId;
    const lapStr = `LAP ${game.lapTimer.currentLap.toString().padStart(2, '0')} / ${game.lapTimer.totalLaps.toString().padStart(2, '0')}`;
    const timeStr = `${(game.lapTimer.currentLapTimeMs / 1000).toFixed(3)}s`;
    pauseModal.show({ trackTitle, vehicleTitle, lapStr, timeStr });
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
    } else if (e.key === 'r' || e.key === 'R') {
      if (!(e.target instanceof HTMLInputElement)) {
        if (pauseModal.isOpen()) pauseModal.close();
        if (game.mode === 'DRIVING' || game.mode === 'DEMO') {
          game.restartRace();
        }
      }
    } else if (keyBindingManager.isActionKey('headlights', e.code) || e.key === 'h' || e.key === 'H') {
      if (!(e.target instanceof HTMLInputElement)) {
        game.toggleHeadlights();
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
