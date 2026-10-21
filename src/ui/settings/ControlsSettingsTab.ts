import { keyBindingManager, KeyAction } from '../../core/KeyBindingManager.ts';
import { i18nManager, Language } from '../../i18n/I18nManager.ts';
import type { Game } from '../../core/Game.ts';

/**
 * 환경 설정 모달 - 조작 키 바인딩 및 게임플레이 옵션 탭 전담 컴포넌트
 */
export class ControlsSettingsTab {
  private btnPresetWasd: HTMLButtonElement | null;
  private btnPresetArrows: HTMLButtonElement | null;
  private badgePresetCustom: HTMLElement | null;
  private keybindButtons: NodeListOf<HTMLButtonElement>;

  private settingSteer: HTMLInputElement | null;
  private settingSteerVal: HTMLElement | null;
  private settingLanguage: HTMLSelectElement | null;
  private chkShowNametags: HTMLInputElement | null;
  private selectCameraView: HTMLSelectElement | null;

  private listeningAction: KeyAction | null = null;
  private activeKeydownListener: ((e: KeyboardEvent) => void) | null = null;

  private game?: Game;
  private onStateChange?: () => void;

  constructor(game?: Game, onStateChange?: () => void) {
    this.game = game;
    this.onStateChange = onStateChange;

    this.btnPresetWasd = document.getElementById('btn-preset-wasd') as HTMLButtonElement | null;
    this.btnPresetArrows = document.getElementById('btn-preset-arrows') as HTMLButtonElement | null;
    this.badgePresetCustom = document.getElementById('badge-preset-custom');
    this.keybindButtons = document.querySelectorAll('.keybind-btn');

    this.settingSteer = document.getElementById('setting-steer') as HTMLInputElement | null;
    this.settingSteerVal = document.getElementById('setting-steer-val');
    this.settingLanguage = document.getElementById('setting-language') as HTMLSelectElement | null;
    this.chkShowNametags = document.getElementById('chk-show-nametags') as HTMLInputElement | null;
    this.selectCameraView = document.getElementById('setting-camera-view') as HTMLSelectElement | null;

    this.bindEvents();
  }

  private bindEvents(): void {
    this.btnPresetWasd?.addEventListener('click', () => {
      this.stopListening();
      keyBindingManager.setPreset('wasd');
      this.syncUI();
      this.onStateChange?.();
    });

    this.btnPresetArrows?.addEventListener('click', () => {
      this.stopListening();
      keyBindingManager.setPreset('arrows');
      this.syncUI();
      this.onStateChange?.();
    });

    this.keybindButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-action') as KeyAction;
        if (!action) return;
        this.startListening(action, btn);
      });
    });

    this.settingSteer?.addEventListener('input', () => {
      const val = Number(this.settingSteer?.value || 100);
      if (this.settingSteerVal) this.settingSteerVal.textContent = `${(val / 100).toFixed(1)}x`;
    });

    this.chkShowNametags?.addEventListener('change', () => {
      if (this.chkShowNametags && this.game) {
        this.game.setShowNametags(this.chkShowNametags.checked);
      }
    });

    this.selectCameraView?.addEventListener('change', () => {
      const val = (this.selectCameraView?.value || 'THIRD_PERSON') as any;
      if (this.game) {
        this.game.cameraController.viewMode = val;
      }
      localStorage.setItem('apex_camera_view_mode', val);
    });

    this.settingLanguage?.addEventListener('change', () => {
      const lang = (this.settingLanguage?.value || 'ko') as Language;
      i18nManager.setLanguage(lang);
      this.syncUI();
      this.onStateChange?.();
    });
  }

  public startListening(action: KeyAction, buttonEl: HTMLButtonElement): void {
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

      keyBindingManager.setCustomActionKey(action, e.code);
      this.stopListening();
      this.syncUI();
      this.onStateChange?.();
    };

    this.activeKeydownListener = onKeyDown;
    window.addEventListener('keydown', onKeyDown, { capture: true, once: true });
  }

  public stopListening(): void {
    if (this.activeKeydownListener) {
      window.removeEventListener('keydown', this.activeKeydownListener, { capture: true });
      this.activeKeydownListener = null;
    }
    this.listeningAction = null;
    this.keybindButtons.forEach((btn) => btn.classList.remove('listening'));
  }

  public syncUI(): void {
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

    if (this.settingLanguage) {
      this.settingLanguage.value = i18nManager.getLanguage();
    }

    if (this.chkShowNametags) {
      this.chkShowNametags.checked = this.game
        ? this.game.showNametagsSetting
        : (typeof localStorage !== 'undefined' ? localStorage.getItem('apex_show_nametags') !== 'false' : true);
    }

    if (this.selectCameraView) {
      this.selectCameraView.value = this.game
        ? this.game.cameraController.viewMode
        : (localStorage.getItem('apex_camera_view_mode') || 'THIRD_PERSON');
    }
  }
}
