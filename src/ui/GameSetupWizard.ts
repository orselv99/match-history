import { BaseModal } from './BaseModal.ts';
import { VehiclePreview } from './VehiclePreview.ts';
import { HoneycombPicker } from './HoneycombPicker.ts';
import { TRACK_DEFINITIONS, getCircuitSvgData } from '../data/circuitTracks.ts';
import { VEHICLE_MODELS } from '../data/vehicles.ts';
import { RANDOM_DRIVER_NAMES, TIME_OF_DAY_LABELS, WEATHER_LABELS } from '../data/gameConstants.ts';

export type TrackId = 'circuit_monaco' | 'circuit_silverstone' | 'circuit_nurburgring';
export type VehicleModelId = 'gt_turbo' | 'formula_aero' | 'cyber_speedster';
export type TimeOfDay = 'morning' | 'noon' | 'sunset' | 'night';
export type WeatherType = 'clear' | 'rain' | 'wind_fog';

export interface RaceSetupConfig {
  trackId: TrackId;
  modelId: VehicleModelId;
  color: string;
  timeOfDay: TimeOfDay;
  weather: WeatherType;
  driverName: string;
  isAutoDrive: boolean;
}

export interface GameSetupWizardCallbacks {
  onStartRace: (config: RaceSetupConfig) => void | Promise<void>;
  onColorChange?: (hexVal: string) => void;
  onModelChange?: (modelId: VehicleModelId) => void;
  onEnvironmentChange?: (time: TimeOfDay, weather: WeatherType) => void;
}

/**
 * 4단계 게임 설정 위저드(트랙, 차량, 환경, 드라이버) 전담 컨트롤러
 */
export class GameSetupWizard extends BaseModal {
  private btnClose: HTMLElement | null;
  private btnPrev: HTMLButtonElement | null;
  private btnNext: HTMLElement | null;
  private btnStart: HTMLElement | null;
  private btnReset: HTMLElement | null;
  private btnRandomAll: HTMLElement | null;
  private currentStepTitle: HTMLElement | null;

  private stepTabs: NodeListOf<HTMLElement>;
  private stepPanels: NodeListOf<HTMLElement>;

  // Step 1: 서킷 선택
  private trackCards: NodeListOf<HTMLElement>;
  private trackSvgMonaco: HTMLElement | null;
  private trackSvgSilverstone: HTMLElement | null;
  private trackSvgNurburgring: HTMLElement | null;
  private trackShowcaseTitle: HTMLElement | null;
  private trackShowcaseBadge: HTMLElement | null;
  private trackShowcaseDesc: HTMLElement | null;
  private trackSpecLen: HTMLElement | null;
  private trackSpecCorners: HTMLElement | null;
  private trackSpecRecord: HTMLElement | null;
  private trackSpecType: HTMLElement | null;

  // Step 2: 머신 & 컬러
  private modelCards: NodeListOf<HTMLElement>;
  private honeycombContainer: HTMLElement | null;
  private vehicleCanvas: HTMLCanvasElement | null;
  private vehicleSpecSpeed: HTMLElement | null;
  private vehicleSpecAccel: HTMLElement | null;
  private vehicleSpecDownforce: HTMLElement | null;
  private vehicleSpecHandling: HTMLElement | null;
  private vehiclePreview: VehiclePreview | null = null;
  private honeycombPicker: HoneycombPicker | null = null;

  // Step 3: 환경
  private envTimeChips: NodeListOf<HTMLElement>;
  private envWeatherChips: NodeListOf<HTMLElement>;
  private envSummaryText: HTMLElement | null;

  // Step 4: 드라이버 프로필 & 브리핑
  private driverNameInput: HTMLInputElement | null;
  private btnRandomName: HTMLElement | null;
  private chkAutodrive: HTMLInputElement | null;
  private briefingTrack: HTMLElement | null;
  private briefingModel: HTMLElement | null;
  private briefingColorDot: HTMLElement | null;
  private briefingEnv: HTMLElement | null;
  private briefingDriver: HTMLElement | null;

  // 내부 상태
  private currentStep: 1 | 2 | 3 | 4 = 1;
  public selectedTrack: TrackId = 'circuit_monaco';
  public selectedModel: VehicleModelId = 'gt_turbo';
  public selectedColor: string = '#ef4444';
  public selectedTime: TimeOfDay = 'noon';
  public selectedWeather: WeatherType = 'clear';

  private readonly stepTitles = [
    '01 CIRCUIT // 서킷 트랙 선택',
    '02 MACHINE // 머신 모델 & 리버리 컬러',
    '03 ENVIRONMENT // 시간대 & 기후 환경',
    '04 DRIVER & MODE // 드라이버 프로필 & 주행 모드',
  ];

  private callbacks: GameSetupWizardCallbacks;

  constructor(callbacks: GameSetupWizardCallbacks) {
    super('game-setup-modal');
    this.callbacks = callbacks;
    this.btnClose = document.getElementById('setup-btn-close');
    this.btnPrev = document.getElementById('wizard-btn-prev') as HTMLButtonElement | null;
    this.btnNext = document.getElementById('wizard-btn-next');
    this.btnStart = document.getElementById('wizard-btn-start');
    this.btnReset = document.getElementById('wizard-btn-reset');
    this.btnRandomAll = document.getElementById('wizard-btn-random-all');
    this.currentStepTitle = document.getElementById('wizard-current-step-title');

    this.stepTabs = document.querySelectorAll<HTMLElement>('.wizard-step-tab');
    this.stepPanels = document.querySelectorAll<HTMLElement>('.wizard-step-panel');

    // Step 1
    this.trackCards = document.querySelectorAll<HTMLElement>('.wizard-choice-card[data-track]');
    this.trackSvgMonaco = document.getElementById('track-svg-monaco');
    this.trackSvgSilverstone = document.getElementById('track-svg-silverstone');
    this.trackSvgNurburgring = document.getElementById('track-svg-nurburgring');
    this.trackShowcaseTitle = document.getElementById('track-showcase-title');
    this.trackShowcaseBadge = document.getElementById('track-showcase-badge');
    this.trackShowcaseDesc = document.getElementById('track-showcase-desc');
    this.trackSpecLen = document.getElementById('track-spec-len');
    this.trackSpecCorners = document.getElementById('track-spec-corners');
    this.trackSpecRecord = document.getElementById('track-spec-record');
    this.trackSpecType = document.getElementById('track-spec-type');

    // Step 2
    this.modelCards = document.querySelectorAll<HTMLElement>('.wizard-choice-card[data-model]');
    this.honeycombContainer = document.getElementById('wizard-honeycomb-picker-container');
    this.vehicleCanvas = document.getElementById('wizard-vehicle-canvas') as HTMLCanvasElement | null;
    this.vehicleSpecSpeed = document.getElementById('vehicle-spec-speed');
    this.vehicleSpecAccel = document.getElementById('vehicle-spec-accel');
    this.vehicleSpecDownforce = document.getElementById('vehicle-spec-downforce');
    this.vehicleSpecHandling = document.getElementById('vehicle-spec-handling');

    // Step 3
    this.envTimeChips = document.querySelectorAll<HTMLElement>('.env-chip-btn[data-time]');
    this.envWeatherChips = document.querySelectorAll<HTMLElement>('.env-chip-btn[data-weather]');
    this.envSummaryText = document.getElementById('env-summary-text');

    // Step 4
    this.driverNameInput = document.getElementById('wizard-driver-name') as HTMLInputElement | null;
    this.btnRandomName = document.getElementById('wizard-btn-random-name');
    this.chkAutodrive = document.getElementById('wizard-chk-autodrive') as HTMLInputElement | null;
    this.briefingTrack = document.getElementById('briefing-track');
    this.briefingModel = document.getElementById('briefing-model');
    this.briefingColorDot = document.getElementById('briefing-color-dot');
    this.briefingEnv = document.getElementById('briefing-env');
    this.briefingDriver = document.getElementById('briefing-driver');

    this.initTurntableAndPicker();
    this.initTrackSvgs();
    this.bindEvents();
    this.pickRandomName();
  }

  private initTurntableAndPicker(): void {
    if (this.vehicleCanvas) {
      try {
        this.vehiclePreview = new VehiclePreview(this.vehicleCanvas);
        this.vehiclePreview.setModel(this.selectedModel);
        this.vehiclePreview.setColor(parseInt(this.selectedColor.replace('#', '0x'), 16));
      } catch (e) {
        console.warn('VehiclePreview init failed', e);
      }
    }

    if (this.honeycombContainer) {
      try {
        this.honeycombPicker = new HoneycombPicker(this.honeycombContainer, this.selectedColor, (hex) => {
          this.updateColor(hex, false);
        });
      } catch (e) {
        console.warn('HoneycombPicker init failed', e);
      }
    }
  }

  private initTrackSvgs(): void {
    const list: Array<{ id: TrackId; el: HTMLElement | null }> = [
      { id: 'circuit_monaco', el: this.trackSvgMonaco },
      { id: 'circuit_silverstone', el: this.trackSvgSilverstone },
      { id: 'circuit_nurburgring', el: this.trackSvgNurburgring },
    ];

    list.forEach(({ id, el }) => {
      if (!el) return;
      const data = getCircuitSvgData(id);
      const pathEl = el.querySelector<SVGPathElement>('.track-svg-outline');
      const circleEl = el.querySelector<SVGCircleElement>('.track-start-pin');
      const textEl = el.querySelector<SVGTextElement>('.track-start-text');

      if (pathEl) pathEl.setAttribute('d', data.pathD);
      if (circleEl) {
        circleEl.setAttribute('cx', data.startX.toString());
        circleEl.setAttribute('cy', data.startY.toString());
      }
      if (textEl) {
        textEl.setAttribute('x', data.textX.toString());
        textEl.setAttribute('y', data.textY.toString());
      }
    });
  }

  private bindEvents(): void {
    this.btnClose?.addEventListener('click', () => this.close());

    this.stepTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const step = Number(tab.dataset.step) as 1 | 2 | 3 | 4;
        if (step >= 1 && step <= 4) this.goToStep(step);
      });
    });

    this.btnPrev?.addEventListener('click', () => {
      if (this.currentStep > 1) {
        this.goToStep((this.currentStep - 1) as 1 | 2 | 3 | 4);
      }
    });

    this.btnNext?.addEventListener('click', () => {
      if (this.currentStep < 4) {
        this.goToStep((this.currentStep + 1) as 1 | 2 | 3 | 4);
      }
    });

    // Step 1: 서킷 카드
    this.trackCards.forEach(card => {
      card.addEventListener('click', () => {
        this.selectedTrack = (card.dataset.track as TrackId) || 'circuit_monaco';
        this.updateTrackShowcase();
      });
    });

    // Step 2: 머신 모델 카드
    this.modelCards.forEach(card => {
      card.addEventListener('click', () => {
        this.selectedModel = (card.dataset.model as VehicleModelId) || 'gt_turbo';
        this.updateModelShowcase();
        this.callbacks.onModelChange?.(this.selectedModel);
      });
    });

    // Step 3: 환경 칩
    this.envTimeChips.forEach(chip => {
      chip.addEventListener('click', () => {
        this.selectedTime = (chip.dataset.time as TimeOfDay) || 'noon';
        this.updateEnvironmentShowcase();
        this.callbacks.onEnvironmentChange?.(this.selectedTime, this.selectedWeather);
      });
    });

    this.envWeatherChips.forEach(chip => {
      chip.addEventListener('click', () => {
        this.selectedWeather = (chip.dataset.weather as WeatherType) || 'clear';
        this.updateEnvironmentShowcase();
        this.callbacks.onEnvironmentChange?.(this.selectedTime, this.selectedWeather);
      });
    });

    // Step 4: 드라이버 닉네임 & 자동주행
    this.btnRandomName?.addEventListener('click', () => this.pickRandomName());
    this.driverNameInput?.addEventListener('input', () => {
      if (this.currentStep === 4) this.updateBriefingCard();
    });

    this.chkAutodrive?.addEventListener('change', () => {
      if (this.chkAutodrive?.checked) {
        if (this.driverNameInput) this.driverNameInput.disabled = true;
        this.btnRandomName?.setAttribute('disabled', 'true');
        if (this.btnRandomName) {
          this.btnRandomName.style.pointerEvents = 'none';
          this.btnRandomName.style.opacity = '0.4';
        }
      } else {
        if (this.driverNameInput) this.driverNameInput.disabled = false;
        this.btnRandomName?.removeAttribute('disabled');
        if (this.btnRandomName) {
          this.btnRandomName.style.pointerEvents = 'auto';
          this.btnRandomName.style.opacity = '1';
        }
      }
      if (this.currentStep === 4) this.updateBriefingCard();
    });

    // 전체 랜덤 선택
    this.btnRandomAll?.addEventListener('click', () => this.randomizeAll());

    // 기본값 초기화
    this.btnReset?.addEventListener('click', () => this.resetDefaults());

    // 레이스 시작 버튼
    this.btnStart?.addEventListener('click', () => {
      const config: RaceSetupConfig = {
        trackId: this.selectedTrack,
        modelId: this.selectedModel,
        color: this.selectedColor,
        timeOfDay: this.selectedTime,
        weather: this.selectedWeather,
        driverName: this.driverNameInput?.value.trim() || 'Apex Hunter',
        isAutoDrive: this.chkAutodrive?.checked ?? false,
      };
      this.close();
      this.callbacks.onStartRace(config);
    });

    window.addEventListener('resize', () => {
      if (this.isOpen() && this.currentStep === 2) {
        this.vehiclePreview?.resize();
      }
    });
  }

  public goToStep(step: 1 | 2 | 3 | 4): void {
    this.currentStep = step;

    if (this.currentStepTitle) {
      this.currentStepTitle.textContent = this.stepTitles[step - 1];
    }

    this.stepTabs.forEach(tab => {
      tab.classList.toggle('active', Number(tab.dataset.step) === step);
    });

    this.stepPanels.forEach((panel, idx) => {
      panel.classList.toggle('active', idx + 1 === step);
    });

    if (this.btnPrev) this.btnPrev.disabled = (step === 1);

    if (step === 1) {
      this.updateTrackShowcase();
    } else if (step === 2) {
      this.updateModelShowcase();
      this.vehiclePreview?.start();
      setTimeout(() => this.vehiclePreview?.resize(), 40);
    } else if (step === 3) {
      this.updateEnvironmentShowcase();
    } else if (step === 4) {
      this.updateBriefingCard();
    }

    if (step === 4) {
      if (this.btnNext) this.btnNext.style.display = 'none';
      if (this.btnStart) this.btnStart.style.display = 'inline-block';
    } else {
      if (this.btnNext) this.btnNext.style.display = 'inline-block';
      if (this.btnStart) this.btnStart.style.display = 'none';
    }

    if (step !== 2) {
      this.vehiclePreview?.stop();
    }
  }

  public updateTrackShowcase(): void {
    this.trackCards.forEach(c => {
      c.classList.toggle('active', c.dataset.track === this.selectedTrack);
    });

    this.trackSvgMonaco?.classList.toggle('active', this.selectedTrack === 'circuit_monaco');
    this.trackSvgSilverstone?.classList.toggle('active', this.selectedTrack === 'circuit_silverstone');
    this.trackSvgNurburgring?.classList.toggle('active', this.selectedTrack === 'circuit_nurburgring');

    const meta = TRACK_DEFINITIONS[this.selectedTrack];
    if (meta) {
      if (this.trackShowcaseTitle) this.trackShowcaseTitle.textContent = meta.title;
      if (this.trackShowcaseBadge) {
        this.trackShowcaseBadge.textContent = meta.badge;
        this.trackShowcaseBadge.className = `choice-card-badge ${meta.badgeClass}`;
      }
      if (this.trackShowcaseDesc) this.trackShowcaseDesc.textContent = meta.desc;
      if (this.trackSpecLen) this.trackSpecLen.textContent = meta.len;
      if (this.trackSpecCorners) this.trackSpecCorners.textContent = meta.corners;
      if (this.trackSpecRecord) this.trackSpecRecord.textContent = meta.record;
      if (this.trackSpecType) this.trackSpecType.textContent = meta.type;
    }
    if (this.briefingTrack) this.briefingTrack.textContent = meta?.title || this.selectedTrack;
  }

  public updateModelShowcase(): void {
    this.modelCards.forEach(c => {
      c.classList.toggle('active', c.dataset.model === this.selectedModel);
    });

    const meta = VEHICLE_MODELS[this.selectedModel];
    if (meta) {
      if (this.vehicleSpecSpeed) this.vehicleSpecSpeed.textContent = meta.speed;
      if (this.vehicleSpecAccel) this.vehicleSpecAccel.textContent = meta.accel;
      if (this.vehicleSpecDownforce) this.vehicleSpecDownforce.textContent = meta.downforce;
      if (this.vehicleSpecHandling) this.vehicleSpecHandling.textContent = meta.handling;
    }

    this.vehiclePreview?.setModel(this.selectedModel);
    if (this.briefingModel) this.briefingModel.textContent = meta?.title || this.selectedModel;
  }

  public updateColor(hexVal: string, syncPicker: boolean = false): void {
    this.selectedColor = hexVal;
    if (syncPicker && this.honeycombPicker) {
      this.honeycombPicker.selectColor(hexVal);
    }

    const hexNum = parseInt(hexVal.replace('#', '0x'), 16);
    this.vehiclePreview?.setColor(hexNum);
    if (this.briefingColorDot) this.briefingColorDot.style.backgroundColor = hexVal;
    this.callbacks.onColorChange?.(hexVal);
  }

  public updateEnvironmentShowcase(): void {
    this.envTimeChips.forEach(c => {
      c.classList.toggle('active', c.dataset.time === this.selectedTime);
    });
    this.envWeatherChips.forEach(c => {
      c.classList.toggle('active', c.dataset.weather === this.selectedWeather);
    });

    if (this.envSummaryText) {
      const t = TIME_OF_DAY_LABELS[this.selectedTime] || this.selectedTime;
      const w = WEATHER_LABELS[this.selectedWeather] || this.selectedWeather;
      this.envSummaryText.textContent = `${t} + ${w}`;
    }

    const timeUpper = this.selectedTime.toUpperCase();
    const weatherUpper = this.selectedWeather === 'wind_fog' ? 'WIND & FOG' : this.selectedWeather.toUpperCase();
    if (this.briefingEnv) this.briefingEnv.textContent = `${timeUpper} + ${weatherUpper}`;
  }

  public updateBriefingCard(): void {
    if (this.briefingTrack) this.briefingTrack.textContent = TRACK_DEFINITIONS[this.selectedTrack]?.title || this.selectedTrack;
    if (this.briefingModel) this.briefingModel.textContent = VEHICLE_MODELS[this.selectedModel]?.title || this.selectedModel;
    if (this.briefingColorDot) this.briefingColorDot.style.backgroundColor = this.selectedColor;

    const timeUpper = this.selectedTime.toUpperCase();
    const weatherUpper = this.selectedWeather === 'wind_fog' ? 'WIND & FOG' : this.selectedWeather.toUpperCase();
    if (this.briefingEnv) this.briefingEnv.textContent = `${timeUpper} + ${weatherUpper}`;

    if (this.briefingDriver) {
      if (this.chkAutodrive?.checked) {
        this.briefingDriver.textContent = 'AI 4-CAR SIMULATION (컴퓨터 자율 주행 배틀)';
      } else {
        const name = this.driverNameInput?.value.trim() || 'Apex Hunter';
        this.briefingDriver.textContent = `${name} (수동 주행)`;
      }
    }
  }

  public pickRandomName(): void {
    const rand = RANDOM_DRIVER_NAMES[Math.floor(Math.random() * RANDOM_DRIVER_NAMES.length)];
    if (this.driverNameInput) this.driverNameInput.value = rand;
    if (this.currentStep === 4) this.updateBriefingCard();
  }

  public randomizeAll(): void {
    this.pickRandomName();

    const tracks: TrackId[] = ['circuit_monaco', 'circuit_silverstone', 'circuit_nurburgring'];
    this.selectedTrack = tracks[Math.floor(Math.random() * tracks.length)];
    this.updateTrackShowcase();

    const models: VehicleModelId[] = ['gt_turbo', 'formula_aero', 'cyber_speedster'];
    this.selectedModel = models[Math.floor(Math.random() * models.length)];
    this.updateModelShowcase();
    this.callbacks.onModelChange?.(this.selectedModel);

    const randHex = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    this.updateColor(randHex, true);

    const times: TimeOfDay[] = ['morning', 'noon', 'sunset', 'night'];
    this.selectedTime = times[Math.floor(Math.random() * times.length)];

    const weathers: WeatherType[] = ['clear', 'rain', 'wind_fog'];
    this.selectedWeather = weathers[Math.floor(Math.random() * weathers.length)];
    this.updateEnvironmentShowcase();
    this.callbacks.onEnvironmentChange?.(this.selectedTime, this.selectedWeather);

    this.updateBriefingCard();
  }

  public resetDefaults(): void {
    this.selectedTrack = 'circuit_monaco';
    this.selectedModel = 'gt_turbo';
    this.selectedColor = '#ef4444';
    this.selectedTime = 'noon';
    this.selectedWeather = 'clear';
    if (this.driverNameInput) this.driverNameInput.value = 'Apex Hunter';
    if (this.chkAutodrive) this.chkAutodrive.checked = false;
    if (this.driverNameInput) this.driverNameInput.disabled = false;
    this.btnRandomName?.removeAttribute('disabled');
    if (this.btnRandomName) {
      this.btnRandomName.style.pointerEvents = 'auto';
      this.btnRandomName.style.opacity = '1';
    }

    this.updateTrackShowcase();
    this.updateModelShowcase();
    this.updateColor('#ef4444', true);
    this.updateEnvironmentShowcase();
    this.updateBriefingCard();

    this.callbacks.onModelChange?.(this.selectedModel);
    this.callbacks.onEnvironmentChange?.(this.selectedTime, this.selectedWeather);
  }

  public open(): void {
    this.showModal();
    this.updateTrackShowcase();
    this.updateModelShowcase();
    this.updateEnvironmentShowcase();
    this.updateBriefingCard();

    if (this.chkAutodrive) this.chkAutodrive.checked = false;
    if (this.driverNameInput) this.driverNameInput.disabled = false;
    this.btnRandomName?.removeAttribute('disabled');
    if (this.btnRandomName) {
      this.btnRandomName.style.pointerEvents = 'auto';
      this.btnRandomName.style.opacity = '1';
    }

    this.goToStep(1);
  }

  public override close(): void {
    super.close();
    this.vehiclePreview?.stop();
  }
}
