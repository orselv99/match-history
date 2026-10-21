import { AudioManager } from '../../core/AudioManager.ts';
import { appDB } from '../../storage/AppDatabase.ts';

/**
 * 환경 설정 모달 - 사운드 설정 탭 전담 컴포넌트
 */
export class AudioSettingsTab {
  private volMaster: HTMLInputElement | null;
  private volMasterVal: HTMLElement | null;
  private volBgm: HTMLInputElement | null;
  private volBgmVal: HTMLElement | null;
  private volSfx: HTMLInputElement | null;
  private volSfxVal: HTMLElement | null;
  private btnTestSfx: HTMLElement | null;
  private chkMute: HTMLInputElement | null;
  private settingBgmDesc: HTMLElement | null;
  private storageStatsEl: HTMLElement | null;
  private btnClearCache: HTMLElement | null;

  private audio: AudioManager;
  private onStateChange?: () => void;

  constructor(audio: AudioManager, onStateChange?: () => void) {
    this.audio = audio;
    this.onStateChange = onStateChange;

    this.volMaster = document.getElementById('vol-master') as HTMLInputElement | null;
    this.volMasterVal = document.getElementById('vol-master-val');
    this.volBgm = document.getElementById('vol-bgm') as HTMLInputElement | null;
    this.volBgmVal = document.getElementById('vol-bgm-val');
    this.volSfx = document.getElementById('vol-sfx') as HTMLInputElement | null;
    this.volSfxVal = document.getElementById('vol-sfx-val');
    this.btnTestSfx = document.getElementById('btn-test-sfx');
    this.chkMute = document.getElementById('chk-mute') as HTMLInputElement | null;
    this.settingBgmDesc = document.getElementById('setting-bgm-desc');
    this.storageStatsEl = document.getElementById('setting-storage-stats');
    this.btnClearCache = document.getElementById('btn-clear-cache');

    this.bindEvents();
  }

  private bindEvents(): void {
    this.volMaster?.addEventListener('input', () => {
      const v = Number(this.volMaster?.value || 80);
      if (this.volMasterVal) this.volMasterVal.textContent = `${v}%`;
      this.audio.setMasterVolume(v / 100);
      this.onStateChange?.();
    });

    this.volBgm?.addEventListener('input', () => {
      const v = Number(this.volBgm?.value || 70);
      if (this.volBgmVal) this.volBgmVal.textContent = `${v}%`;
      this.audio.setBgmVolume(v / 100);
      this.onStateChange?.();
    });

    this.volSfx?.addEventListener('input', () => {
      const v = Number(this.volSfx?.value || 85);
      if (this.volSfxVal) this.volSfxVal.textContent = `${v}%`;
      this.audio.setSfxVolume(v / 100);
      this.onStateChange?.();
    });

    this.btnTestSfx?.addEventListener('click', () => {
      this.audio.playTestBeep();
    });

    this.chkMute?.addEventListener('change', () => {
      if (this.chkMute) {
        this.audio.setMute(this.chkMute.checked);
        this.onStateChange?.();
      }
    });

    this.btnClearCache?.addEventListener('click', async () => {
      await appDB.clearAudioCache();
      this.syncUI();
    });
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
  }
}
