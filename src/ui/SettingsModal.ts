import { BaseModal } from './BaseModal.ts';
import { AudioManager } from '../core/AudioManager.ts';
import { appDB } from '../storage/AppDatabase.ts';
import { keyBindingManager, KeyAction } from '../core/KeyBindingManager.ts';
import { graphicsSettingsManager, MotionBlurQuality, ShadowQuality, ResolutionScale, CameraShakeMode } from '../core/GraphicsSettingsManager.ts';
import { i18nManager, Language } from '../i18n/I18nManager.ts';
import type { Game } from '../core/Game.ts';

/**
 * 환경 설정 모달 전담 컨트롤러
 * - 4대 탭 시스템: 01 일반, 02 사운드, 03 게임플레이, 04 그래픽(PC 하드웨어 감지 & 성능 옵션)
 * - 단일 키 1:1 매핑 규격 (WASD, 화살표 프리셋 & 완전 커스텀 키 설정)
 */
export class SettingsModal extends BaseModal {
  private btnClose: HTMLElement | null;
  private btnSave: HTMLElement | null;

  // 탭 네비게이션
  private tabButtons: NodeListOf<HTMLButtonElement>;
  private tabPanels: NodeListOf<HTMLElement>;

  // 오디오 컨트롤
  private volMaster: HTMLInputElement | null;
  private volMasterVal: HTMLElement | null;
  private volBgm: HTMLInputElement | null;
  private volBgmVal: HTMLElement | null;
  private volSfx: HTMLInputElement | null;
  private volSfxVal: HTMLElement | null;
  private btnTestSfx: HTMLElement | null;
  private chkMute: HTMLInputElement | null;

  // 게임플레이 & 스토리지
  private settingSteer: HTMLInputElement | null;
  private settingSteerVal: HTMLElement | null;
  private settingBgmDesc: HTMLElement | null;
  private storageStatsEl: HTMLElement | null;
  private btnClearCache: HTMLElement | null;
  private settingLanguage: HTMLSelectElement | null;

  // 키 바인딩 컨트롤 (단일 키 매핑)
  private btnPresetWasd: HTMLButtonElement | null;
  private btnPresetArrows: HTMLButtonElement | null;
  private badgePresetCustom: HTMLElement | null;
  private keybindButtons: NodeListOf<HTMLButtonElement>;

  // 그래픽 성능 & 하드웨어 컨트롤
  private gfxDetectedGpu: HTMLElement | null;
  private gfxDetectedSpecs: HTMLElement | null;
  private gfxRecommendedBadge: HTMLElement | null;
  private gfxRecommendationReason: HTMLElement | null;
  private btnGfxAutodetect: HTMLButtonElement | null;
  private btnGfxPresetHigh: HTMLButtonElement | null;
  private btnGfxPresetMedium: HTMLButtonElement | null;
  private btnGfxPresetLow: HTMLButtonElement | null;
  private badgeGfxCustom: HTMLElement | null;
  private selectGfxMotionBlur: HTMLSelectElement | null;
  private selectGfxResolution: HTMLSelectElement | null;
  private selectGfxShadows: HTMLSelectElement | null;
  private chkGfxDynamicFov: HTMLInputElement | null;
  private selectGfxShake: HTMLSelectElement | null;

  private listeningAction: KeyAction | null = null;
  private activeKeydownListener: ((e: KeyboardEvent) => void) | null = null;

  private audio: AudioManager;
  private game?: Game;

  constructor(audio: AudioManager, game?: Game) {
    super('settings-modal');
    this.audio = audio;
    this.game = game;

    this.btnClose = document.getElementById('settings-btn-close');
    this.btnSave = document.getElementById('settings-btn-save');

    this.tabButtons = document.querySelectorAll('.settings-tab-btn');
    this.tabPanels = document.querySelectorAll('.settings-tab-panel');

    this.volMaster = document.getElementById('vol-master') as HTMLInputElement | null;
    this.volMasterVal = document.getElementById('vol-master-val');
    this.volBgm = document.getElementById('vol-bgm') as HTMLInputElement | null;
    this.volBgmVal = document.getElementById('vol-bgm-val');
    this.volSfx = document.getElementById('vol-sfx') as HTMLInputElement | null;
    this.volSfxVal = document.getElementById('vol-sfx-val');
    this.btnTestSfx = document.getElementById('btn-test-sfx');
    this.chkMute = document.getElementById('chk-mute') as HTMLInputElement | null;

    this.settingSteer = document.getElementById('setting-steer') as HTMLInputElement | null;
    this.settingSteerVal = document.getElementById('setting-steer-val');
    this.settingBgmDesc = document.getElementById('setting-bgm-desc');
    this.storageStatsEl = document.getElementById('setting-storage-stats');
    this.btnClearCache = document.getElementById('btn-clear-cache');
    this.settingLanguage = document.getElementById('setting-language') as HTMLSelectElement | null;

    this.btnPresetWasd = document.getElementById('btn-preset-wasd') as HTMLButtonElement | null;
    this.btnPresetArrows = document.getElementById('btn-preset-arrows') as HTMLButtonElement | null;
    this.badgePresetCustom = document.getElementById('badge-preset-custom');
    this.keybindButtons = document.querySelectorAll('.keybind-btn');

    // 그래픽 컨트롤 DOM 연결
    this.gfxDetectedGpu = document.getElementById('gfx-detected-gpu');
    this.gfxDetectedSpecs = document.getElementById('gfx-detected-specs');
    this.gfxRecommendedBadge = document.getElementById('gfx-recommended-badge');
    this.gfxRecommendationReason = document.getElementById('gfx-recommendation-reason');
    this.btnGfxAutodetect = document.getElementById('btn-gfx-autodetect') as HTMLButtonElement | null;
    this.btnGfxPresetHigh = document.getElementById('btn-gfx-preset-high') as HTMLButtonElement | null;
    this.btnGfxPresetMedium = document.getElementById('btn-gfx-preset-medium') as HTMLButtonElement | null;
    this.btnGfxPresetLow = document.getElementById('btn-gfx-preset-low') as HTMLButtonElement | null;
    this.badgeGfxCustom = document.getElementById('badge-gfx-custom');
    this.selectGfxMotionBlur = document.getElementById('setting-gfx-motion-blur') as HTMLSelectElement | null;
    this.selectGfxResolution = document.getElementById('setting-gfx-resolution') as HTMLSelectElement | null;
    this.selectGfxShadows = document.getElementById('setting-gfx-shadows') as HTMLSelectElement | null;
    this.chkGfxDynamicFov = document.getElementById('chk-gfx-dynamic-fov') as HTMLInputElement | null;
    this.selectGfxShake = document.getElementById('setting-gfx-shake') as HTMLSelectElement | null;

    this.bindEvents();
    this.syncUI();
  }

  private bindEvents(): void {
    const close = () => {
      this.stopListening();
      this.close();
    };
    this.btnClose?.addEventListener('click', close);
    this.btnSave?.addEventListener('click', close);

    // 탭 전환 이벤트
    this.tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        if (tab) this.switchTab(tab);
      });
    });

    this.volMaster?.addEventListener('input', () => {
      const v = Number(this.volMaster?.value || 80);
      if (this.volMasterVal) this.volMasterVal.textContent = `${v}%`;
      this.audio.setMasterVolume(v / 100);
    });

    this.volBgm?.addEventListener('input', () => {
      const v = Number(this.volBgm?.value || 70);
      if (this.volBgmVal) this.volBgmVal.textContent = `${v}%`;
      this.audio.setBgmVolume(v / 100);
    });

    this.volSfx?.addEventListener('input', () => {
      const v = Number(this.volSfx?.value || 85);
      if (this.volSfxVal) this.volSfxVal.textContent = `${v}%`;
      this.audio.setSfxVolume(v / 100);
    });

    this.btnTestSfx?.addEventListener('click', () => {
      this.audio.playTestBeep();
    });

    this.chkMute?.addEventListener('change', () => {
      if (this.chkMute) {
        this.audio.setMute(this.chkMute.checked);
      }
    });

    this.settingSteer?.addEventListener('input', () => {
      const val = Number(this.settingSteer?.value || 100);
      if (this.settingSteerVal) this.settingSteerVal.textContent = `${(val / 100).toFixed(1)}x`;
    });

    this.btnClearCache?.addEventListener('click', async () => {
      await appDB.clearAudioCache();
      this.syncUI();
    });

    // 프리셋 선택 이벤트
    this.btnPresetWasd?.addEventListener('click', () => {
      this.stopListening();
      keyBindingManager.setPreset('wasd');
      this.syncUI();
    });

    this.btnPresetArrows?.addEventListener('click', () => {
      this.stopListening();
      keyBindingManager.setPreset('arrows');
      this.syncUI();
    });

    // 개별 키 커스텀 바인딩 클릭 이벤트 (단일 키 매핑)
    this.keybindButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-action') as KeyAction;
        if (!action) return;
        this.startListening(action, btn);
      });
    });

    // 그래픽 자동 감지 & 프리셋 버튼 이벤트
    this.btnGfxAutodetect?.addEventListener('click', () => {
      const s = graphicsSettingsManager.applyRecommended();
      if (this.game) this.game.applyGraphicsSettings(s);
      this.syncUI();
    });

    this.btnGfxPresetHigh?.addEventListener('click', () => {
      const s = graphicsSettingsManager.setPreset('HIGH');
      if (this.game) this.game.applyGraphicsSettings(s);
      this.syncUI();
    });

    this.btnGfxPresetMedium?.addEventListener('click', () => {
      const s = graphicsSettingsManager.setPreset('MEDIUM');
      if (this.game) this.game.applyGraphicsSettings(s);
      this.syncUI();
    });

    this.btnGfxPresetLow?.addEventListener('click', () => {
      const s = graphicsSettingsManager.setPreset('LOW');
      if (this.game) this.game.applyGraphicsSettings(s);
      this.syncUI();
    });

    // 개별 그래픽 옵션 변경 이벤트
    this.selectGfxMotionBlur?.addEventListener('change', () => {
      const val = (this.selectGfxMotionBlur?.value || 'HIGH') as MotionBlurQuality;
      const s = graphicsSettingsManager.updateSetting('motionBlur', val);
      if (this.game) this.game.applyGraphicsSettings(s);
      this.syncUI();
    });

    this.selectGfxResolution?.addEventListener('change', () => {
      const val = (this.selectGfxResolution?.value || 'HIGH') as ResolutionScale;
      const s = graphicsSettingsManager.updateSetting('resolution', val);
      if (this.game) this.game.applyGraphicsSettings(s);
      this.syncUI();
    });

    this.selectGfxShadows?.addEventListener('change', () => {
      const val = (this.selectGfxShadows?.value || 'HIGH') as ShadowQuality;
      const s = graphicsSettingsManager.updateSetting('shadows', val);
      if (this.game) this.game.applyGraphicsSettings(s);
      this.syncUI();
    });

    this.chkGfxDynamicFov?.addEventListener('change', () => {
      const val = !!this.chkGfxDynamicFov?.checked;
      const s = graphicsSettingsManager.updateSetting('dynamicFov', val);
      if (this.game) this.game.applyGraphicsSettings(s);
      this.syncUI();
    });

    this.selectGfxShake?.addEventListener('change', () => {
      const val = (this.selectGfxShake?.value || 'FULL') as CameraShakeMode;
      const s = graphicsSettingsManager.updateSetting('cameraShake', val);
      if (this.game) this.game.applyGraphicsSettings(s);
      this.syncUI();
    });

    this.settingLanguage?.addEventListener('change', () => {
      const lang = (this.settingLanguage?.value || 'ko') as Language;
      i18nManager.setLanguage(lang);
      this.syncUI();
    });

    i18nManager.onLanguageChange(() => {
      this.syncUI();
    });
  }

  public switchTab(tabId: string): void {
    this.tabButtons.forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
    });
    this.tabPanels.forEach((p) => {
      p.classList.toggle('active', p.id === `settings-panel-${tabId}`);
    });
  }

  private startListening(action: KeyAction, buttonEl: HTMLButtonElement): void {
    this.stopListening();

    this.listeningAction = action;
    buttonEl.classList.add('listening');
    buttonEl.textContent = i18nManager.t('settings.gameplay.waitingKey');

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        this.stopListening();
        this.syncUI();
        return;
      }

      // 새 단일 키 코드로 커스텀 바인딩 설정
      keyBindingManager.setCustomActionKey(action, e.code);
      this.stopListening();
      this.syncUI();
    };

    this.activeKeydownListener = onKeyDown;
    window.addEventListener('keydown', onKeyDown, { capture: true, once: true });
  }

  private stopListening(): void {
    if (this.activeKeydownListener) {
      window.removeEventListener('keydown', this.activeKeydownListener, { capture: true });
      this.activeKeydownListener = null;
    }
    this.listeningAction = null;
    this.keybindButtons.forEach((btn) => btn.classList.remove('listening'));
  }

  public open(): void {
    this.syncUI();
    this.showModal();
  }

  public override close(): void {
    this.stopListening();
    super.close();
  }

  public syncUI(): void {
    const s = this.audio.settings;
    if (this.volMaster) this.volMaster.value = Math.round(s.masterVolume * 100).toString();
    if (this.volMasterVal) this.volMasterVal.textContent = `${this.volMaster?.value}%`;

    if (this.volBgm) this.volBgm.value = Math.round(s.bgmVolume * 100).toString();
    if (this.volBgmVal) this.volBgmVal.textContent = `${this.volBgm?.value}%`;

    if (this.volSfx) this.volSfx.value = Math.round(s.sfxVolume * 100).toString();
    if (this.volSfxVal) this.volSfxVal.textContent = `${this.volSfx?.value}%`;

    if (this.chkMute) this.chkMute.checked = s.isMuted;

    const currentTrack = this.audio.getCurrentBgm();
    if (this.settingBgmDesc && currentTrack) {
      const sceneLabel = this.audio.getCurrentScene() === 'lobby' ? '로비' : '인게임';
      this.settingBgmDesc.textContent = `재생 중: ${currentTrack.title} (${sceneLabel} OST)`;
    }

    appDB.getStats().then((stats) => {
      if (this.storageStatsEl) {
        const mb = (stats.audioBytes / (1024 * 1024)).toFixed(1);
        this.storageStatsEl.textContent = `${mb}MB (로비 ${stats.lobbyAudioCount}곡 / 인게임 ${stats.inGameAudioCount}곡)`;
      }
    }).catch(() => {});

    // 키 바인딩 UI 동기화
    const preset = keyBindingManager.getPreset();
    if (this.btnPresetWasd) {
      this.btnPresetWasd.classList.toggle('active', preset === 'wasd');
    }
    if (this.btnPresetArrows) {
      this.btnPresetArrows.classList.toggle('active', preset === 'arrows');
    }
    if (this.badgePresetCustom) {
      this.badgePresetCustom.style.display = preset === 'custom' ? 'inline-block' : 'none';
    }

    this.keybindButtons.forEach((btn) => {
      const action = btn.getAttribute('data-action') as KeyAction;
      if (action && this.listeningAction !== action) {
        btn.textContent = keyBindingManager.formatActionKey(action);
      }
    });

    // 그래픽 하드웨어 & 세부 설정 UI 동기화
    const hw = graphicsSettingsManager.getHardwareInfo();
    if (this.gfxDetectedGpu) this.gfxDetectedGpu.textContent = hw.gpuRenderer;
    if (this.gfxDetectedSpecs) {
      const memStr = hw.memoryGb ? ` | ~${hw.memoryGb}GB RAM` : '';
      this.gfxDetectedSpecs.textContent = `${hw.cores} Logical Cores${memStr} | WebGL 2.0 Accelerated`;
    }
    if (this.gfxRecommendedBadge) {
      this.gfxRecommendedBadge.textContent = `${i18nManager.t('common.recommended')}: ${hw.recommendedPreset}`;
    }
    if (this.gfxRecommendationReason) {
      this.gfxRecommendationReason.textContent = hw.recommendationReason;
    }

    const gfx = graphicsSettingsManager.getSettings();
    if (this.btnGfxPresetHigh) this.btnGfxPresetHigh.classList.toggle('active', gfx.preset === 'HIGH');
    if (this.btnGfxPresetMedium) this.btnGfxPresetMedium.classList.toggle('active', gfx.preset === 'MEDIUM');
    if (this.btnGfxPresetLow) this.btnGfxPresetLow.classList.toggle('active', gfx.preset === 'LOW');
    if (this.badgeGfxCustom) this.badgeGfxCustom.style.display = gfx.preset === 'CUSTOM' ? 'inline-block' : 'none';

    if (this.selectGfxMotionBlur) this.selectGfxMotionBlur.value = gfx.motionBlur;
    if (this.selectGfxResolution) this.selectGfxResolution.value = gfx.resolution;
    if (this.selectGfxShadows) this.selectGfxShadows.value = gfx.shadows;
    if (this.chkGfxDynamicFov) this.chkGfxDynamicFov.checked = gfx.dynamicFov;
    if (this.selectGfxShake) this.selectGfxShake.value = gfx.cameraShake;

    if (this.settingLanguage) {
      this.settingLanguage.value = i18nManager.getLanguage();
    }
  }
}
