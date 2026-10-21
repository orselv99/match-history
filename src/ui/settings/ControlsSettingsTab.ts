import { keyBindingManager, KeyAction } from '../../core/KeyBindingManager.ts';
import { i18nManager } from '../../i18n/I18nManager.ts';
import type { Game } from '../../core/Game.ts';

/**
 * 환경 설정 모달 - 조작 설정 및 게임플레이 옵션 탭 전담 컴포넌트
 * - 조향 감도, 다이내믹 카메라 틸트, 기본 드라이빙 시점, 차량 식별 태그 제어
 * - 조작 설정 아코디언(접기/펼치기):
 *   1) ⌨️ 키보드 조작 설정 (프리셋 & 1:1 단일 키 매핑)
 *   2) 🎮 게임패드 조작 설정 (XInput/DirectInput 자동 감지 & 매핑 가이드)
 */
export class ControlsSettingsTab {
  // 게임플레이 감도 & 뷰
  private settingSteer: HTMLInputElement | null;
  private settingSteerVal: HTMLElement | null;
  private chkCamTilt: HTMLInputElement | null;
  private selectCameraView: HTMLSelectElement | null;
  private chkShowNametags: HTMLInputElement | null;

  // 아코디언 요소
  private accordionKeyboard: HTMLElement | null;
  private btnToggleKeyboard: HTMLButtonElement | null;
  private bodyKeyboard: HTMLElement | null;

  private accordionGamepad: HTMLElement | null;
  private btnToggleGamepad: HTMLButtonElement | null;
  private bodyGamepad: HTMLElement | null;

  // 키보드 키 바인딩 컨트롤
  private btnPresetWasd: HTMLButtonElement | null;
  private btnPresetArrows: HTMLButtonElement | null;
  private badgePresetCustom: HTMLElement | null;
  private keybindButtons: NodeListOf<HTMLButtonElement>;

  // 게임패드 컨트롤
  private badgeGamepadStatus: HTMLElement | null;
  private gamepadDetectedName: HTMLElement | null;
  private gamepadStatusDesc: HTMLElement | null;

  private listeningAction: KeyAction | null = null;
  private activeKeydownListener: ((e: KeyboardEvent) => void) | null = null;

  private game?: Game;
  private onStateChange?: () => void;

  constructor(game?: Game, onStateChange?: () => void) {
    this.game = game;
    this.onStateChange = onStateChange;

    this.settingSteer = document.getElementById('setting-steer') as HTMLInputElement | null;
    this.settingSteerVal = document.getElementById('setting-steer-val');
    this.chkCamTilt = document.getElementById('chk-cam-tilt') as HTMLInputElement | null;
    this.selectCameraView = document.getElementById('setting-camera-view') as HTMLSelectElement | null;
    this.chkShowNametags = document.getElementById('chk-show-nametags') as HTMLInputElement | null;

    this.accordionKeyboard = document.getElementById('controls-accordion-keyboard');
    this.btnToggleKeyboard = document.getElementById('btn-toggle-keyboard') as HTMLButtonElement | null;
    this.bodyKeyboard = document.getElementById('body-controls-keyboard');

    this.accordionGamepad = document.getElementById('controls-accordion-gamepad');
    this.btnToggleGamepad = document.getElementById('btn-toggle-gamepad') as HTMLButtonElement | null;
    this.bodyGamepad = document.getElementById('body-controls-gamepad');

    this.btnPresetWasd = document.getElementById('btn-preset-wasd') as HTMLButtonElement | null;
    this.btnPresetArrows = document.getElementById('btn-preset-arrows') as HTMLButtonElement | null;
    this.badgePresetCustom = document.getElementById('badge-preset-custom');
    this.keybindButtons = document.querySelectorAll('.keybind-btn');

    this.badgeGamepadStatus = document.getElementById('badge-gamepad-status');
    this.gamepadDetectedName = document.getElementById('gamepad-detected-name');
    this.gamepadStatusDesc = document.getElementById('gamepad-status-desc');

    this.bindEvents();
  }

  private bindEvents(): void {
    // 1. 아코디언 토글 (키보드)
    this.btnToggleKeyboard?.addEventListener('click', () => {
      this.toggleAccordion(this.accordionKeyboard, this.bodyKeyboard);
    });

    // 2. 아코디언 토글 (게임패드)
    this.btnToggleGamepad?.addEventListener('click', () => {
      this.toggleAccordion(this.accordionGamepad, this.bodyGamepad);
    });

    // 3. 키보드 프리셋 및 키 바인딩
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

    // 4. 게임플레이 옵션
    this.settingSteer?.addEventListener('input', () => {
      const val = Number(this.settingSteer?.value || 100);
      if (this.settingSteerVal) this.settingSteerVal.textContent = `${(val / 100).toFixed(1)}x`;
    });

    this.chkCamTilt?.addEventListener('change', () => {
      if (this.chkCamTilt) {
        localStorage.setItem('apex_cam_tilt', this.chkCamTilt.checked ? 'true' : 'false');
      }
    });

    this.selectCameraView?.addEventListener('change', () => {
      const val = (this.selectCameraView?.value || 'THIRD_PERSON') as any;
      if (this.game) {
        this.game.cameraController.viewMode = val;
      }
      localStorage.setItem('apex_camera_view_mode', val);
    });

    this.chkShowNametags?.addEventListener('change', () => {
      if (this.chkShowNametags && this.game) {
        this.game.setShowNametags(this.chkShowNametags.checked);
      }
    });

    // 5. 게임패드 연결/해제 이벤트 감지
    window.addEventListener('gamepadconnected', () => this.syncGamepadUI());
    window.addEventListener('gamepaddisconnected', () => this.syncGamepadUI());
  }

  private toggleAccordion(itemEl: HTMLElement | null, bodyEl: HTMLElement | null): void {
    if (!itemEl || !bodyEl) return;
    const isExpanded = itemEl.classList.contains('expanded');
    if (isExpanded) {
      itemEl.classList.remove('expanded');
      bodyEl.style.display = 'none';
      const chevron = itemEl.querySelector('.accordion-chevron');
      if (chevron) chevron.textContent = '▶';
    } else {
      itemEl.classList.add('expanded');
      bodyEl.style.display = 'block';
      const chevron = itemEl.querySelector('.accordion-chevron');
      if (chevron) chevron.textContent = '▼';
    }
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

  public syncGamepadUI(): void {
    const isKo = i18nManager.getLanguage() === 'ko';
    let connectedPad: Gamepad | null = null;

    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (let i = 0; i < pads.length; i++) {
        if (pads[i]) {
          connectedPad = pads[i];
          break;
        }
      }
    } catch {}

    if (connectedPad) {
      if (this.badgeGamepadStatus) {
        this.badgeGamepadStatus.textContent = isKo ? '🟢 연결됨' : '🟢 Connected';
        this.badgeGamepadStatus.style.background = 'rgba(34, 197, 94, 0.15)';
        this.badgeGamepadStatus.style.borderColor = 'rgba(34, 197, 94, 0.4)';
        this.badgeGamepadStatus.style.color = '#4ade80';
      }
      if (this.gamepadDetectedName) {
        this.gamepadDetectedName.textContent = connectedPad.id || (isKo ? '표준 게임패드 (연결됨)' : 'Standard Gamepad (Connected)');
      }
      if (this.gamepadStatusDesc) {
        this.gamepadStatusDesc.textContent = i18nManager.t('settings.gameplay.gamepadConnected');
      }
    } else {
      if (this.badgeGamepadStatus) {
        this.badgeGamepadStatus.textContent = isKo ? '⚪ 미연결' : '⚪ Disconnected';
        this.badgeGamepadStatus.style.background = 'rgba(148, 163, 184, 0.15)';
        this.badgeGamepadStatus.style.borderColor = 'rgba(148, 163, 184, 0.3)';
        this.badgeGamepadStatus.style.color = 'var(--text-secondary)';
      }
      if (this.gamepadDetectedName) {
        this.gamepadDetectedName.textContent = isKo
          ? '표준 게임패드 (XInput / DualShock / DirectInput)'
          : 'Standard Gamepad (XInput / DualShock / DirectInput)';
      }
      if (this.gamepadStatusDesc) {
        this.gamepadStatusDesc.textContent = i18nManager.t('settings.gameplay.gamepadDisconnected');
      }
    }
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

    if (this.chkCamTilt) {
      this.chkCamTilt.checked = typeof localStorage !== 'undefined' ? localStorage.getItem('apex_cam_tilt') !== 'false' : true;
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

    this.syncGamepadUI();
  }
}
