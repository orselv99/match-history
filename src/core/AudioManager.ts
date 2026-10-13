/**
 * Web Audio API 기반 절차적 사운드 생성기 (Zero-Asset Audio)
 * - 3단 게인 라우팅 (Master ➔ SFX / BGM ➔ Destination)
 * - 엔진 RPM 사운드 (Sawtooth + Sub-oscillator + Biquad Filter)
 * - 타이어 스키드 사운드 (Noise Buffer + Bandpass Filter)
 * - 절차적 사이버 신스 BGM (Zero-Asset Dual Ambient Pad)
 * - 체크포인트 및 완주 비프 차임
 */
import { TITLE_BGM_TRACKS, INGAME_BGM_TRACKS, BgmTrack } from '../data/audio.ts';

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

  // BGM 노드
  private bgmOsc1: OscillatorNode | null = null;
  private bgmOsc2: OscillatorNode | null = null;
  private bgmLfo: OscillatorNode | null = null;
  private bgmFilter: BiquadFilterNode | null = null;
  private bgmAudio: HTMLAudioElement | null = null;
  private bgmSourceNode: MediaElementAudioSourceNode | null = null;
  private currentBgmTrack: BgmTrack | null = null;

  // 설정 상태
  public settings: AudioSettings = {
    masterVolume: 0.8,
    bgmVolume: 0.4,
    sfxVolume: 0.8,
    isMuted: false,
  };

  constructor() {
    this.loadSettings();
  }

  public init(): void {
    if (this.isInitialized) return;

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

      // 2. 엔진 사운드 초기화
      this.initEngineAudio();

      // 3. 타이어 스키드 사운드 초기화
      this.initSkidNoise();

      // 4. 절차적 배경음(BGM) 신디사이저 시작
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
    if (!this.ctx || !this.bgmGain) return;

    // OGG BGM 오디오 엘리먼트 초기화 및 Web Audio API 버스(bgmGain) 연결
    try {
      if (!this.bgmAudio) {
        this.bgmAudio = new Audio();
        this.bgmAudio.loop = true;
        this.bgmAudio.preload = 'auto';

        // HTMLAudioElement를 Web Audio API 노드로 래핑하여 bgmGain에 연결
        // -> 기존 마스터 볼륨, BGM 볼륨 슬라이더 및 Mute 설정이 그대로 적용됩니다.
        this.bgmSourceNode = this.ctx.createMediaElementSource(this.bgmAudio);
        this.bgmSourceNode.connect(this.bgmGain);
      }
    } catch (e) {
      console.warn('[AudioManager] Failed to initialize media element source for BGM:', e);
    }
  }

  /**
   * 타이틀 화면 배경음악 재생 (Silk Drive, Velvet Drive 중 선택 또는 랜덤)
   */
  public playTitleBgm(trackId?: string): void {
    const tracks = TITLE_BGM_TRACKS;
    if (tracks.length === 0) return;
    const selected = trackId
      ? tracks.find((t) => t.id === trackId) || tracks[0]
      : tracks[Math.floor(Math.random() * tracks.length)];

    this.playBgmFile(`audio/bgm/${selected.fileName}`, selected);
  }

  /**
   * 인게임 주행 배경음악 재생 (6곡 중 선택 또는 랜덤)
   */
  public playInGameBgm(trackId?: string): void {
    const tracks = INGAME_BGM_TRACKS;
    if (tracks.length === 0) return;
    const selected = trackId
      ? tracks.find((t) => t.id === trackId) || tracks[0]
      : tracks[Math.floor(Math.random() * tracks.length)];

    this.playBgmFile(`audio/bgm/${selected.fileName}`, selected);
  }

  /**
   * BGM 파일 스트리밍 재생 실행
   */
  private playBgmFile(url: string, track: BgmTrack): void {
    if (!this.isInitialized) {
      this.init();
    }
    if (!this.bgmAudio) return;

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    this.currentBgmTrack = track;
    this.bgmAudio.src = url;
    this.bgmAudio.currentTime = 0;
    this.bgmAudio.play().catch((err) => {
      // 사용자 브라우저 첫 인터랙션 전 자동재생 차단(Autoplay Policy) 시 경고
      console.warn('[AudioManager] Autoplay blocked, waiting for user gesture:', err);
    });
  }

  /**
   * BGM 정지
   */
  public stopBgm(): void {
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio.currentTime = 0;
    }
  }

  /**
   * BGM 일시정지
   */
  public pauseBgm(): void {
    if (this.bgmAudio) {
      this.bgmAudio.pause();
    }
  }

  /**
   * BGM 재개
   */
  public resumeBgm(): void {
    if (this.bgmAudio && this.currentBgmTrack) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      this.bgmAudio.play().catch(() => { });
    }
  }

  /**
   * 현재 재생 중인 BGM 트랙 정보 조회
   */
  public getCurrentBgm(): BgmTrack | null {
    return this.currentBgmTrack;
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
