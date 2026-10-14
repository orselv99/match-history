/**
 * Web Audio API 기반 절차적 사운드 생성기 (Zero-Asset Audio)
 * - 3단 게인 라우팅 (Master ➔ SFX / BGM ➔ Destination)
 * - 엔진 RPM 사운드 (Sawtooth + Sub-oscillator + Biquad Filter)
 * - 타이어 스키드 사운드 (Noise Buffer + Bandpass Filter)
 * - 절차적 사이버 신스 BGM (Zero-Asset Dual Ambient Pad)
 * - 체크포인트 및 완주 비프 차임
 */
import { LOBBY_BGM_TRACKS, INGAME_BGM_TRACKS, BgmTrack } from '../data/audio.ts';

export interface AudioSettings {
  masterVolume: number; // 0.0 ~ 1.0
  bgmVolume: number;    // 0.0 ~ 1.0
  sfxVolume: number;    // 0.0 ~ 1.0
  isMuted: boolean;
}

const STORAGE_KEY = 'racing_game_audio_settings';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private isInitialized = false;

  // 마스터 / 버스 노드
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;

  // SFX 노드
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private skidGain: GainNode | null = null;

  // BGM 노드 및 씬 상태
  private bgmAudio: HTMLAudioElement | null = null;
  private bgmSourceNode: MediaElementAudioSourceNode | null = null;
  private bgmFadeGain: GainNode | null = null;
  private currentBgmTrack: BgmTrack | null = null;
  public currentScene: 'lobby' | 'ingame' | 'none' = 'none';
  private lobbyTrackIndex: number = 0;
  private inGameTrackIndex: number = 0;
  private pendingPlayScene: 'lobby' | 'ingame' | null = null;
  public onBgmChange?: (track: BgmTrack, scene: 'lobby' | 'ingame') => void;

  // 설정 상태
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

  /**
   * 브라우저 자동재생 제한(Autoplay Policy) 해제를 위한 최초 사용자 제스처 리스너
   */
  private setupUserGestureUnlock(): void {
    const unlock = () => {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      if (this.pendingPlayScene && this.bgmAudio) {
        const scene = this.pendingPlayScene;
        this.pendingPlayScene = null;
        if (scene === 'lobby') {
          this.playLobbyBgm();
        } else if (scene === 'ingame') {
          this.playInGameBgm();
        }
      }
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

      // 1. 마스터 & 버스 게인 구성
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.settings.isMuted ? 0 : this.settings.masterVolume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(this.settings.sfxVolume, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.setValueAtTime(this.settings.bgmVolume, this.ctx.currentTime);
      this.bgmGain.connect(this.masterGain);

      // BGM 페이드 전용 서브 게인 노드 (곡 전환 시 크로스페이드 및 덕킹 제어)
      this.bgmFadeGain = this.ctx.createGain();
      this.bgmFadeGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this.bgmFadeGain.connect(this.bgmGain);

      // 2. 엔진 사운드 초기화
      this.initEngineAudio();

      // 3. 타이어 스키드 사운드 초기화
      this.initSkidNoise();

      // 4. HTML5 스트리밍 BGM 파이프라인 초기화
      this.initBgmAudio();

      this.isInitialized = true;
    } catch (e) {
      console.warn('AudioContext not supported or blocked:', e);
    }
  }

  private initEngineAudio(): void {
    if (!this.ctx || !this.sfxGain) return;

    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.setValueAtTime(60, this.ctx.currentTime);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, this.ctx.currentTime);

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.setValueAtTime(0.08, this.ctx.currentTime);

    this.engineOsc.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.sfxGain);
    this.engineOsc.start();
  }

  private initSkidNoise(): void {
    if (!this.ctx || !this.sfxGain) return;

    const bufferSize = this.ctx.sampleRate;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    this.skidGain = this.ctx.createGain();
    this.skidGain.gain.setValueAtTime(0, this.ctx.currentTime);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(950, this.ctx.currentTime);
    filter.Q.setValueAtTime(2.0, this.ctx.currentTime);

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    noiseSource.connect(filter);
    filter.connect(this.skidGain);
    this.skidGain.connect(this.sfxGain);
    noiseSource.start();
  }

  private initBgmAudio(): void {
    if (!this.ctx || !this.bgmFadeGain) return;

    try {
      if (!this.bgmAudio) {
        this.bgmAudio = new Audio();
        this.bgmAudio.loop = false; // 곡 종료 시 ended 이벤트로 다음 플레이리스트 곡 순환
        this.bgmAudio.preload = 'auto';

        // 곡 완곡 시 자동으로 다음 플레이리스트 곡 재생 (플레이리스트 로테이션)
        this.bgmAudio.addEventListener('ended', () => {
          this.playNextTrack();
        });

        this.bgmSourceNode = this.ctx.createMediaElementSource(this.bgmAudio);
        this.bgmSourceNode.connect(this.bgmFadeGain);
      }
    } catch (e) {
      console.warn('[AudioManager] Failed to initialize media element source for BGM:', e);
    }
  }

  /**
   * 베이스 URL 정규화 (Vite base: './' 및 서브디렉토리 배포 대응)
   */
  private resolveTrackUrl(folder: 'lobby' | 'ingame', fileName: string): string {
    const base = import.meta.env.BASE_URL || './';
    const cleanBase = base.endsWith('/') ? base : `${base}/`;
    return `${cleanBase}audio/bgm/${folder}/${fileName}`;
  }

  /**
   * 로비 화면 배경음악 재생 (Silk Drive, Velvet Drive 중 선택 또는 순환)
   */
  public playLobbyBgm(trackId?: string): void {
    const tracks = LOBBY_BGM_TRACKS;
    if (tracks.length === 0) return;

    // 이미 로비 곡이 정상 재생 중이고 특정 곡 지정이 없으면 중복 재시작 방지
    if (this.currentScene === 'lobby' && this.bgmAudio && !this.bgmAudio.paused && !trackId) {
      return;
    }

    let selected: BgmTrack;
    if (trackId) {
      selected = tracks.find((t) => t.id === trackId) || tracks[0];
      this.lobbyTrackIndex = tracks.indexOf(selected);
    } else {
      selected = tracks[this.lobbyTrackIndex % tracks.length];
    }

    const url = this.resolveTrackUrl('lobby', selected.fileName);
    this.switchBgmWithFade(url, selected, 'lobby');
  }

  /**
   * 레거시 오타 방지 호환성 별칭
   */
  public playLobbygm(trackId?: string): void {
    this.playLobbyBgm(trackId);
  }

  /**
   * 인게임 주행 배경음악 재생 (6곡 중 선택 또는 순환)
   */
  public playInGameBgm(trackId?: string): void {
    const tracks = INGAME_BGM_TRACKS;
    if (tracks.length === 0) return;

    // 이미 인게임 곡이 정상 재생 중이고 특정 곡 지정이 없으면 중복 재시작 방지
    if (this.currentScene === 'ingame' && this.bgmAudio && !this.bgmAudio.paused && !trackId) {
      return;
    }

    let selected: BgmTrack;
    if (trackId) {
      selected = tracks.find((t) => t.id === trackId) || tracks[0];
      this.inGameTrackIndex = tracks.indexOf(selected);
    } else {
      selected = tracks[this.inGameTrackIndex % tracks.length];
    }

    const url = this.resolveTrackUrl('ingame', selected.fileName);
    this.switchBgmWithFade(url, selected, 'ingame');
  }

  /**
   * 다음 로비 곡으로 스킵/순환 재생
   */
  public playNextLobbyBgm(): void {
    if (LOBBY_BGM_TRACKS.length === 0) return;
    this.lobbyTrackIndex = (this.lobbyTrackIndex + 1) % LOBBY_BGM_TRACKS.length;
    const nextTrack = LOBBY_BGM_TRACKS[this.lobbyTrackIndex];
    this.playLobbyBgm(nextTrack.id);
  }

  /**
   * 다음 인게임 곡으로 스킵/순환 재생
   */
  public playNextInGameBgm(): void {
    if (INGAME_BGM_TRACKS.length === 0) return;
    this.inGameTrackIndex = (this.inGameTrackIndex + 1) % INGAME_BGM_TRACKS.length;
    const nextTrack = INGAME_BGM_TRACKS[this.inGameTrackIndex];
    this.playInGameBgm(nextTrack.id);
  }

  /**
   * 현재 씬의 다음 곡 자동 순환 (곡 완곡 시 호출)
   */
  public playNextTrack(): void {
    if (this.currentScene === 'lobby') {
      this.playNextLobbyBgm();
    } else if (this.currentScene === 'ingame') {
      this.playNextInGameBgm();
    }
  }

  /**
   * 부드러운 볼륨 페이드아웃 ➔ 소스 교체 ➔ 페이드인 크로스페이드 트랜지션
   */
  private switchBgmWithFade(url: string, track: BgmTrack, scene: 'lobby' | 'ingame'): void {
    if (!this.isInitialized) {
      this.init();
    }

    if (!this.bgmAudio || !this.ctx || !this.bgmFadeGain) {
      this.playBgmFileDirect(url, track, scene);
      return;
    }

    // 이미 오디오가 정지 상태이면 페이드아웃 없이 즉시 재생
    if (this.bgmAudio.paused || this.bgmAudio.currentTime === 0) {
      this.playBgmFileDirect(url, track, scene);
      const resumeNow = this.ctx.currentTime;
      this.bgmFadeGain.gain.cancelScheduledValues(resumeNow);
      this.bgmFadeGain.gain.setValueAtTime(0.001, resumeNow);
      this.bgmFadeGain.gain.linearRampToValueAtTime(1.0, resumeNow + 0.35);
      return;
    }

    // 0.12초간 부드럽게 볼륨 페이드아웃 후 새 트랙 로드
    const now = this.ctx.currentTime;
    this.bgmFadeGain.gain.cancelScheduledValues(now);
    this.bgmFadeGain.gain.setValueAtTime(this.bgmFadeGain.gain.value, now);
    this.bgmFadeGain.gain.linearRampToValueAtTime(0.001, now + 0.12);

    setTimeout(() => {
      this.playBgmFileDirect(url, track, scene);
      if (this.ctx && this.bgmFadeGain) {
        const resumeNow = this.ctx.currentTime;
        this.bgmFadeGain.gain.cancelScheduledValues(resumeNow);
        this.bgmFadeGain.gain.setValueAtTime(0.001, resumeNow);
        this.bgmFadeGain.gain.linearRampToValueAtTime(1.0, resumeNow + 0.35);
      }
    }, 130);
  }

  /**
   * BGM 파일 스트리밍 재생 실행
   */
  private playBgmFileDirect(url: string, track: BgmTrack, scene: 'lobby' | 'ingame'): void {
    if (!this.bgmAudio) return;

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    this.currentBgmTrack = track;
    this.currentScene = scene;
    this.bgmAudio.src = url;
    this.bgmAudio.currentTime = 0;

    const playPromise = this.bgmAudio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        // 사용자 인터랙션 전 자동재생 차단 시 제스처 대기 플래그 등록
        this.pendingPlayScene = scene;
        console.warn('[AudioManager] Autoplay blocked, waiting for user gesture:', err);
      });
    }

    if (this.onBgmChange) {
      this.onBgmChange(track, scene);
    }
  }

  /**
   * BGM 정지
   */
  public stopBgm(): void {
    this.currentScene = 'none';
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio.currentTime = 0;
    }
  }

  /**
   * BGM 일시정지
   */
  public pauseBgm(): void {
    if (this.bgmAudio && !this.bgmAudio.paused) {
      this.bgmAudio.pause();
    }
  }

  /**
   * BGM 재개
   */
  public resumeBgm(): void {
    if (this.bgmAudio && this.currentBgmTrack && this.bgmAudio.paused) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      this.bgmAudio.play().catch(() => {});
    }
  }

  /**
   * 완주 팡파르나 긴급 알림 시 배경음 볼륨 임시 감쇠(Ducking)
   */
  public duckBgm(duck: boolean, targetRatio: number = 0.25): void {
    if (!this.ctx || !this.bgmFadeGain) return;
    const now = this.ctx.currentTime;
    const target = duck ? targetRatio : 1.0;
    this.bgmFadeGain.gain.cancelScheduledValues(now);
    this.bgmFadeGain.gain.setValueAtTime(this.bgmFadeGain.gain.value, now);
    this.bgmFadeGain.gain.linearRampToValueAtTime(target, now + 0.2);
  }

  /**
   * 현재 재생 중인 BGM 트랙 정보 조회
   */
  public getCurrentBgm(): BgmTrack | null {
    return this.currentBgmTrack;
  }

  /**
   * 현재 활성 BGM 씬 모드 조회
   */
  public getCurrentScene(): 'lobby' | 'ingame' | 'none' {
    return this.currentScene;
  }

  public update(speedKmh: number, isDrifting: boolean, throttle: number): void {
    if (!this.isInitialized || !this.ctx || !this.engineOsc || !this.engineGain || !this.skidGain) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    // 엔진 주파수: 55Hz (공회전) ~ 320Hz (최고속)
    const baseFreq = 55 + Math.min(265, (speedKmh / 200) * 265) + (throttle * 25);
    this.engineOsc.frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 0.05);

    // 엔진 볼륨
    const targetVolume = 0.04 + (throttle * 0.06);
    this.engineGain.gain.setTargetAtTime(targetVolume, this.ctx.currentTime, 0.05);

    // 스키드 볼륨 (드리프트 시 활성화)
    const skidVol = (isDrifting && speedKmh > 20) ? 0.12 : 0.0;
    this.skidGain.gain.setTargetAtTime(skidVol, this.ctx.currentTime, 0.08);
  }

  public pauseEngine(): void {
    if (!this.ctx || !this.engineGain || !this.skidGain) return;
    this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    this.skidGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
  }

  public playCheckpointBeep(): void {
    if (!this.ctx || !this.sfxGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, this.ctx.currentTime); // A5
    osc.frequency.exponentialRampToValueAtTime(1320, this.ctx.currentTime + 0.1); // E6

    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  public playCountdownBeep(isGo: boolean = false): void {
    if (!this.ctx || !this.sfxGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (isGo) {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, this.ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.45);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.45);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.2);
    }
  }

  public playFinishFanfare(): void {
    if (!this.ctx || !this.sfxGain) return;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, this.ctx!.currentTime + idx * 0.1);

      gain.gain.setValueAtTime(0.2, this.ctx!.currentTime + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx!.currentTime + idx * 0.1 + 0.4);

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(this.ctx!.currentTime + idx * 0.1);
      osc.stop(this.ctx!.currentTime + idx * 0.1 + 0.4);
    });
  }

  /**
   * 차량 충돌 시 메탈릭 크런치 임팩트 사운드 재생
   */
  public playCrashImpact(intensity: number = 1.0): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const clampedIntensity = Math.min(1.0, Math.max(0.25, intensity / 15.0));

    // 1. 저주파 펀치 서브 베이스 (Sub Boom)
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(160, now);
    subOsc.frequency.exponentialRampToValueAtTime(25, now + 0.22);

    subGain.gain.setValueAtTime(0.6 * clampedIntensity, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    subOsc.connect(subGain);
    subGain.connect(this.sfxGain);
    subOsc.start(now);
    subOsc.stop(now + 0.25);

    // 2. 금속 충돌 노이즈 버스트 (Metal Crunch Noise)
    const sampleRate = this.ctx.sampleRate;
    const noiseBuf = this.ctx.createBuffer(1, Math.floor(sampleRate * 0.25), sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleRate * 0.06));
    }
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = noiseBuf;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1500, now);
    filter.Q.setValueAtTime(2.2, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.55 * clampedIntensity, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    noiseSource.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);
    noiseSource.start(now);
  }

  private rainGain: GainNode | null = null;
  private rainSource: AudioBufferSourceNode | null = null;

  /**
   * 빗소리 앰비언트 사운드 켜기/끄기
   */
  public setRainAudio(enabled: boolean): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    if (enabled) {
      if (!this.rainSource) {
        const bufferSize = this.ctx.sampleRate * 2;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1;
        }

        this.rainSource = this.ctx.createBufferSource();
        this.rainSource.buffer = noiseBuffer;
        this.rainSource.loop = true;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1900, now);

        this.rainGain = this.ctx.createGain();
        this.rainGain.gain.setValueAtTime(0, now);
        this.rainGain.gain.linearRampToValueAtTime(0.07, now + 0.8);

        this.rainSource.connect(filter);
        filter.connect(this.rainGain);
        this.rainGain.connect(this.sfxGain);
        this.rainSource.start();
      }
    } else {
      if (this.rainGain && this.rainSource) {
        this.rainGain.gain.linearRampToValueAtTime(0, now + 0.4);
        const oldSrc = this.rainSource;
        setTimeout(() => {
          try {
            oldSrc.stop();
            oldSrc.disconnect();
          } catch (e) { }
        }, 500);
        this.rainSource = null;
        this.rainGain = null;
      }
    }
  }

  public playTestBeep(): void {
    if (!this.isInitialized) {
      this.init();
    }
    this.playCountdownBeep(true);
  }

  // 볼륨 제어 메소드
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
    } catch (e) {
      // LocalStorage 불가 시 무시
    }
  }

  private loadSettings(): void {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        this.settings = { ...this.settings, ...JSON.parse(saved) };
      }
    } catch (e) {
      // Ignore
    }
  }
}
