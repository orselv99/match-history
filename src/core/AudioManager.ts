/**
 * Web Audio API 기반 절차적 사운드 생성기 (Zero-Asset Audio)
 * - 3단 게인 라우팅 (Master ➔ SFX / BGM ➔ Destination)
 * - 엔진 RPM 사운드 (Sawtooth + Sub-oscillator + Biquad Filter)
 * - 타이어 스키드 사운드 (Noise Buffer + Bandpass Filter)
 * - 절차적 사이버 신스 BGM (Zero-Asset Dual Ambient Pad)
 * - 체크포인트 및 완주 비프 차임
 */
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

    // 절차적 사이버펑크 앰비언트 패드 (Zero-Asset)
    // 110Hz (A2) + 164.81Hz (E3) 듀얼 오실레이터
    this.bgmOsc1 = this.ctx.createOscillator();
    this.bgmOsc1.type = 'triangle';
    this.bgmOsc1.frequency.setValueAtTime(110, this.ctx.currentTime);

    this.bgmOsc2 = this.ctx.createOscillator();
    this.bgmOsc2.type = 'sine';
    this.bgmOsc2.frequency.setValueAtTime(164.81, this.ctx.currentTime);

    this.bgmFilter = this.ctx.createBiquadFilter();
    this.bgmFilter.type = 'lowpass';
    this.bgmFilter.frequency.setValueAtTime(320, this.ctx.currentTime);

    // 느린 0.15Hz LFO로 필터 주파수 스윕 (신비로운 우주/레이싱 앰비언스)
    this.bgmLfo = this.ctx.createOscillator();
    this.bgmLfo.frequency.setValueAtTime(0.15, this.ctx.currentTime);

    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(120, this.ctx.currentTime);
    this.bgmLfo.connect(lfoGain);
    lfoGain.connect(this.bgmFilter.frequency);

    const padGain = this.ctx.createGain();
    padGain.gain.setValueAtTime(0.09, this.ctx.currentTime);

    this.bgmOsc1.connect(this.bgmFilter);
    this.bgmOsc2.connect(this.bgmFilter);
    this.bgmFilter.connect(padGain);
    padGain.connect(this.bgmGain);

    this.bgmOsc1.start();
    this.bgmOsc2.start();
    this.bgmLfo.start();
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
