import { BaseModal } from './BaseModal.ts';
import { AudioManager } from '../core/AudioManager.ts';
import { appDB } from '../storage/AppDatabase.ts';
import { keyBindingManager, KeyAction } from '../core/KeyBindingManager.ts';

/**
 * 환경 설정 모달 전담 컨트롤러
 * - 3대 탭 시스템: 01 일반(시스템/스토리지), 02 사운드(볼륨/음소거), 03 게임플레이(조작/시점/키바인딩)
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

  // 키 바인딩 컨트롤 (단일 키 매핑)
  private btnPresetWasd: HTMLButtonElement | null;
  private btnPresetArrows: HTMLButtonElement | null;
  private badgePresetCustom: HTMLElement | null;
  private keybindButtons: NodeListOf<HTMLButtonElement>;

  private listeningAction: KeyAction | null = null;
  private activeKeydownListener: ((e: KeyboardEvent) => void) | null = null;

  private audio: AudioManager;

  constructor(audio: AudioManager) {
    super('settings-modal');
    this.audio = audio;

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

    this.btnPresetWasd = document.getElementById('btn-preset-wasd') as HTMLButtonElement | null;
    this.btnPresetArrows = document.getElementById('btn-preset-arrows') as HTMLButtonElement | null;
    this.badgePresetCustom = document.getElementById('badge-preset-custom');
    this.keybindButtons = document.querySelectorAll('.keybind-btn');

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
    buttonEl.textContent = '[입력 대기...]';

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

    // 키 바인딩 UI 동기화 (단일 키 이름 포맷 표시)
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
  }
}
