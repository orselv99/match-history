import { BgmTrack } from '../data/audio.ts';
import { SoundEffects } from '../audio/SoundEffects.ts';
import { BgmPlayer } from '../audio/BgmPlayer.ts';

export interface AudioSettings {
  masterVolume: number; // 0.0 ~ 1.0
  bgmVolume: number;    // 0.0 ~ 1.0
  sfxVolume: number;    // 0.0 ~ 1.0
  isMuted: boolean;
}

const STORAGE_KEY = 'racing_game_audio_settings';

/**
 * 게임 오디오 시스템 통합 파사드(Facade) 매니저
 * - 마스터/SFX/BGM 3단 게인 버스 라우팅 제어
 * - SoundEffects(절차적 합성 SFX) 및 BgmPlayer(스트리밍 BGM) 오케스트레이션
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private isInitialized = false;

  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;

  public sfx: SoundEffects = new SoundEffects();
  public bgm: BgmPlayer = new BgmPlayer();

  public settings: AudioSettings = {
    masterVolume: 0.8,
    bgmVolume: 0.4,
    sfxVolume: 0.8,
    isMuted: false,
  };

  constructor() {
    this.loadSettings();
    this.setupUserGestureUnlock();
  }

  // BGM 변경 콜백 위임
  public get onBgmChange(): ((track: BgmTrack, scene: 'lobby' | 'ingame') => void) | undefined {
    return this.bgm.onBgmChange;
  }
  public set onBgmChange(cb: ((track: BgmTrack, scene: 'lobby' | 'ingame') => void) | undefined) {
    this.bgm.onBgmChange = cb;
  }

  public get currentScene(): 'lobby' | 'ingame' | 'none' {
    return this.bgm.currentScene;
  }

  private setupUserGestureUnlock(): void {
    const unlock = () => {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      this.bgm.handleUserGestureUnlock();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  public init(): void {
    if (this.isInitialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtxClass();

      // 마스터 & 버스 게인 노드 구성
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.settings.isMuted ? 0 : this.settings.masterVolume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(this.settings.sfxVolume, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.setValueAtTime(this.settings.bgmVolume, this.ctx.currentTime);
      this.bgmGain.connect(this.masterGain);

      // 서브 모듈 초기화
      this.sfx.init(this.ctx, this.sfxGain);
      this.bgm.init(this.ctx, this.bgmGain);

      this.isInitialized = true;
    } catch (e) {
      console.warn('[AudioManager] AudioContext not supported or blocked:', e);
    }
  }

  // --- BGM 제어 위임 ---
  public playLobbyBgm(trackId?: string): void {
    if (!this.isInitialized) this.init();
    this.bgm.playLobbyBgm(trackId);
  }
  public playLobbygm(trackId?: string): void { this.playLobbyBgm(trackId); }
  public playInGameBgm(trackId?: string): void {
    if (!this.isInitialized) this.init();
    this.bgm.playInGameBgm(trackId);
  }
  public playNextLobbyBgm(): void { this.bgm.playNextLobbyBgm(); }
  public playNextInGameBgm(): void { this.bgm.playNextInGameBgm(); }
  public playNextTrack(): void { this.bgm.playNextTrack(); }
  public stopBgm(): void { this.bgm.stop(); }
  public pauseBgm(): void { this.bgm.pause(); }
  public resumeBgm(): void { this.bgm.resume(); }
  public duckBgm(duck: boolean, targetRatio: number = 0.25): void { this.bgm.duckBgm(duck, targetRatio); }
  public getCurrentBgm(): BgmTrack | null { return this.bgm.currentBgmTrack; }
  public getCurrentScene(): 'lobby' | 'ingame' | 'none' { return this.bgm.currentScene; }

  // --- SFX 효과음 제어 위임 ---
  public update(speedKmh: number, isDrifting: boolean, throttle: number): void {
    this.sfx.update(speedKmh, isDrifting, throttle);
  }
  public pauseEngine(): void { this.sfx.pauseEngine(); }
  public playCheckpointBeep(): void { this.sfx.playCheckpointBeep(); }
  public playCountdownBeep(isGo: boolean = false): void { this.sfx.playCountdownBeep(isGo); }
  public playFinishFanfare(): void { this.sfx.playFinishFanfare(); }
  public playCrashImpact(intensity: number = 1.0): void { this.sfx.playCrashImpact(intensity); }
  public setRainAudio(enabled: boolean): void { this.sfx.setRainAudio(enabled); }
  public playTestBeep(): void {
    if (!this.isInitialized) this.init();
    this.playCountdownBeep(true);
  }

  // --- 볼륨 및 음소거 설정 ---
  public setMasterVolume(val: number): void {
    this.settings.masterVolume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx) {
      const target = this.settings.isMuted ? 0 : this.settings.masterVolume;
      this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    }
    this.saveSettings();
  }

  public setSfxVolume(val: number): void {
    this.settings.sfxVolume = Math.max(0, Math.min(1, val));
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(this.settings.sfxVolume, this.ctx.currentTime, 0.05);
    }
    this.saveSettings();
  }

  public setBgmVolume(val: number): void {
    this.settings.bgmVolume = Math.max(0, Math.min(1, val));
    if (this.bgmGain && this.ctx) {
      this.bgmGain.gain.setTargetAtTime(this.settings.bgmVolume, this.ctx.currentTime, 0.05);
    }
    this.saveSettings();
  }

  public setMute(muted: boolean): void {
    this.settings.isMuted = muted;
    if (this.masterGain && this.ctx) {
      const target = muted ? 0 : this.settings.masterVolume;
      this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    }
    this.saveSettings();
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch (e) {}
  }

  private loadSettings(): void {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        this.settings = { ...this.settings, ...JSON.parse(saved) };
      }
    } catch (e) {}
  }
}
