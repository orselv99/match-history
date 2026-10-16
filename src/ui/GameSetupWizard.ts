import { BaseModal } from './BaseModal.ts';
import { VehiclePreview } from './VehiclePreview.ts';
import { HoneycombPicker } from './HoneycombPicker.ts';
import { CIRCUIT_DEFINITIONS, getCircuitSvgData, type CircuitId } from '../data/circuits.ts';
import { VEHICLE_MODELS } from '../data/vehicles.ts';
import { RANDOM_DRIVER_NAMES } from '../data/gameConstants.ts';
import { i18nManager, t } from '../i18n/I18nManager.ts';

export type { CircuitId };
export type VehicleModelId = 'gt_turbo' | 'formula_aero' | 'cyber_speedster';
export type TimeOfDay = 'morning' | 'noon' | 'sunset' | 'night';
export type WeatherType = 'clear' | 'rain' | 'wind_fog';

export interface RaceSetupConfig {
  circuitId: CircuitId;
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
 * 4단계 게임 설정 위저드(서킷, 차량, 환경, 드라이버) 전담 컨트롤러
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
  private circuitCards: NodeListOf<HTMLElement>;
  private circuitSvgMonaco: HTMLElement | null;
  private circuitSvgMonza: HTMLElement | null;
  private circuitSvgSpa: HTMLElement | null;
  private circuitShowcaseTitle: HTMLElement | null;
  private circuitShowcaseBadge: HTMLElement | null;
  private circuitShowcaseDesc: HTMLElement | null;
  private circuitSpecLen: HTMLElement | null;
  private circuitSpecCorners: HTMLElement | null;
  private circuitSpecRecord: HTMLElement | null;
  private circuitSpecType: HTMLElement | null;

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
  private briefingCircuit: HTMLElement | null;
  private briefingModel: HTMLElement | null;
  private briefingColorDot: HTMLElement | null;
  private briefingEnv: HTMLElement | null;
  private briefingDriver: HTMLElement | null;

  // 내부 상태
  private currentStep: 1 | 2 | 3 | 4 = 1;
  public selectedCircuit: CircuitId = 'circuit_monaco';
  public selectedModel: VehicleModelId = 'gt_turbo';
  public selectedColor: string = '#ef4444';
  public selectedTime: TimeOfDay = 'noon';
  public selectedWeather: WeatherType = 'clear';

  private getStepTitle(step: number): string {
    return t(`wizard.step${step}Title`);
  }

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
    this.circuitCards = document.querySelectorAll<HTMLElement>('.wizard-choice-card[data-circuit], .wizard-choice-card[data-track]');
    this.circuitSvgMonaco = document.getElementById('track-svg-monaco');
    this.circuitSvgMonza = document.getElementById('track-svg-monza');
    this.circuitSvgSpa = document.getElementById('track-svg-spa');
    this.circuitShowcaseTitle = document.getElementById('track-showcase-title');
    this.circuitShowcaseBadge = document.getElementById('track-showcase-badge');
    this.circuitShowcaseDesc = document.getElementById('track-showcase-desc');
    this.circuitSpecLen = document.getElementById('track-spec-len');
    this.circuitSpecCorners = document.getElementById('track-spec-corners');
    this.circuitSpecRecord = document.getElementById('track-spec-record');
    this.circuitSpecType = document.getElementById('track-spec-type');

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
    this.briefingCircuit = document.getElementById('briefing-track');
    this.briefingModel = document.getElementById('briefing-model');
    this.briefingColorDot = document.getElementById('briefing-color-dot');
    this.briefingEnv = document.getElementById('briefing-env');
    this.briefingDriver = document.getElementById('briefing-driver');

    this.initTurntableAndPicker();
    this.initCircuitSvgs();
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

  private initCircuitSvgs(): void {
    const list: Array<{ id: CircuitId; el: HTMLElement | null }> = [
      { id: 'circuit_monaco', el: this.circuitSvgMonaco },
      { id: 'circuit_monza', el: this.circuitSvgMonza },
      { id: 'circuit_spa', el: this.circuitSvgSpa },
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

    i18nManager.onLanguageChange(() => {
      if (this.currentStepTitle) {
        this.currentStepTitle.textContent = this.getStepTitle(this.currentStep);
      }
      this.updateCircuitShowcase();
      this.updateModelShowcase();
      this.updateEnvironmentShowcase();
      this.updateBriefingCard();
    });

    // Step 1: 서킷 카드
    this.circuitCards.forEach(card => {
      card.addEventListener('click', () => {
        this.selectedCircuit = ((card.dataset.circuit || card.dataset.track) as CircuitId) || 'circuit_monaco';
        this.updateCircuitShowcase();
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
        circuitId: this.selectedCircuit,
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
      this.currentStepTitle.textContent = this.getStepTitle(step);
    }

    this.stepTabs.forEach(tab => {
      tab.classList.toggle('active', Number(tab.dataset.step) === step);
    });

    this.stepPanels.forEach((panel, idx) => {
      panel.classList.toggle('active', idx + 1 === step);
    });

    if (this.btnPrev) this.btnPrev.disabled = (step === 1);

    if (step === 1) {
      this.updateCircuitShowcase();
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

  public updateCircuitShowcase(): void {
    this.circuitCards.forEach(c => {
      const cardId = c.dataset.circuit || c.dataset.track;
      c.classList.toggle('active', cardId === this.selectedCircuit);
    });

    this.circuitSvgMonaco?.classList.toggle('active', this.selectedCircuit === 'circuit_monaco');
    this.circuitSvgMonza?.classList.toggle('active', this.selectedCircuit === 'circuit_monza');
    this.circuitSvgSpa?.classList.toggle('active', this.selectedCircuit === 'circuit_spa');

    const meta = CIRCUIT_DEFINITIONS[this.selectedCircuit];
    if (meta) {
      if (this.circuitShowcaseTitle) this.circuitShowcaseTitle.textContent = meta.title;
      if (this.circuitShowcaseBadge) {
        this.circuitShowcaseBadge.textContent = meta.badge;
        this.circuitShowcaseBadge.className = `choice-card-badge ${meta.badgeClass}`;
      }
      if (this.circuitShowcaseDesc) this.circuitShowcaseDesc.textContent = meta.desc;
      if (this.circuitSpecLen) this.circuitSpecLen.textContent = meta.len;
      if (this.circuitSpecCorners) this.circuitSpecCorners.textContent = meta.corners;
      if (this.circuitSpecRecord) this.circuitSpecRecord.textContent = meta.record;
      if (this.circuitSpecType) this.circuitSpecType.textContent = meta.type;
    }
    if (this.briefingCircuit) this.briefingCircuit.textContent = meta?.title || this.selectedCircuit;
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

    const timeKey = `wizard.${this.selectedTime}`;
    const weatherKey = `wizard.${this.selectedWeather === 'wind_fog' ? 'windFog' : this.selectedWeather}`;
    const envSummary = `${t(timeKey)} + ${t(weatherKey)}`;

    if (this.envSummaryText) {
      this.envSummaryText.textContent = envSummary;
    }
    if (this.briefingEnv) {
      this.briefingEnv.textContent = envSummary;
    }
  }

  public updateBriefingCard(): void {
    if (this.briefingCircuit) this.briefingCircuit.textContent = CIRCUIT_DEFINITIONS[this.selectedCircuit]?.title || this.selectedCircuit;
    if (this.briefingModel) this.briefingModel.textContent = VEHICLE_MODELS[this.selectedModel]?.title || this.selectedModel;
    if (this.briefingColorDot) this.briefingColorDot.style.backgroundColor = this.selectedColor;

    const timeKey = `wizard.${this.selectedTime}`;
    const weatherKey = `wizard.${this.selectedWeather === 'wind_fog' ? 'windFog' : this.selectedWeather}`;
    if (this.briefingEnv) this.briefingEnv.textContent = `${t(timeKey)} + ${t(weatherKey)}`;

    if (this.briefingDriver) {
      if (this.chkAutodrive?.checked) {
        this.briefingDriver.textContent = t('wizard.autoDriveMode');
      } else {
        const name = this.driverNameInput?.value.trim() || 'Apex Hunter';
        this.briefingDriver.textContent = `${name} (${t('wizard.manualDrive')})`;
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

    const circuits: CircuitId[] = ['circuit_monaco', 'circuit_monza', 'circuit_spa'];
    this.selectedCircuit = circuits[Math.floor(Math.random() * circuits.length)];
    this.updateCircuitShowcase();

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
    this.selectedCircuit = 'circuit_monaco';
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

    this.updateCircuitShowcase();
    this.updateModelShowcase();
    this.updateColor('#ef4444', true);
    this.updateEnvironmentShowcase();
    this.updateBriefingCard();

    this.callbacks.onModelChange?.(this.selectedModel);
    this.callbacks.onEnvironmentChange?.(this.selectedTime, this.selectedWeather);
  }

  public open(): void {
    this.showModal();
    this.updateCircuitShowcase();
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
