/**
 * Web Audio API 기반 절차적 사운드 효과(SFX) 합성 전담 엔진
 * - 엔진 RPM 사운드 (Sawtooth + Sub-oscillator + Lowpass Filter)
 * - 타이어 스키드 사운드 (White Noise Buffer + Bandpass Filter)
 * - 충돌 메탈릭 크런치 임팩트 (Sub Boom + Metal Crunch Noise Burst)
 * - 체크포인트 / 카운트다운 / 완주 팡파르 차임
 * - 빗소리 앰비언트 노이즈 (Pink/White Filtered Noise)
 */
export class SoundEffects {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;

  // 엔진 및 스키드 노드
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private skidGain: GainNode | null = null;

  // 비 사운드 노드
  private rainGain: GainNode | null = null;
  private rainSource: AudioBufferSourceNode | null = null;

  public init(ctx: AudioContext, sfxGain: GainNode): void {
    this.ctx = ctx;
    this.sfxGain = sfxGain;

    this.initEngineAudio();
    this.initSkidNoise();
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

  public update(speedKmh: number, isDrifting: boolean, throttle: number): void {
    if (!this.ctx || !this.engineOsc || !this.engineGain || !this.skidGain) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
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
    this.engineGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.engineGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.skidGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.skidGain.gain.setValueAtTime(0, this.ctx.currentTime);
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
          } catch (e) {}
        }, 500);
        this.rainSource = null;
        this.rainGain = null;
      }
    }
  }
}
