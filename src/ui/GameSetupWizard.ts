import { BaseModal } from './BaseModal.ts';
import { CircuitPreview } from './CircuitPreview.ts';
import { VehiclePreview } from './VehiclePreview.ts';
import { HoneycombPicker } from './HoneycombPicker.ts';
import { CIRCUIT_DEFINITIONS, type CircuitId } from '../data/circuits.ts';
import { VEHICLE_MODELS, type VehicleModelId } from '../data/vehicles.ts';
import type { TimeOfDay, WeatherType } from '../game/EnvironmentManager.ts';
import { RANDOM_DRIVER_NAMES } from '../data/gameConstants.ts';
import { i18nManager, t } from '../i18n/I18nManager.ts';

export type { CircuitId, VehicleModelId, TimeOfDay, WeatherType };

export interface RaceSetupConfig {
  circuitId: CircuitId;
  vehicleModelId: VehicleModelId;
  color: string;
  timeOfDay: TimeOfDay;
  weather: WeatherType;
  driverName: string;
  isAutoDrive: boolean;
}

export interface GameSetupWizardCallbacks {
  onStartRace: (config: RaceSetupConfig) => void | Promise<void>;
  onColorChange?: (hexVal: string) => void;
  onVehicleModelChange?: (vehicleModelId: VehicleModelId) => void;
  onEnvironmentChange?: (timeOfDay: TimeOfDay, weather: WeatherType) => void;
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

  // Step 1: 서킷 프리뷰 (SVG 트랙맵 & 스펙 쇼케이스)
  private circuitPreview: CircuitPreview;

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
  public selectedVehicleModel: VehicleModelId = 'gt_turbo';
  public selectedColor: string = '#ef4444';
  public selectedTimeOfDay: TimeOfDay = 'noon';
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

    // Step 1: 서킷 프리뷰
    this.circuitPreview = new CircuitPreview((circuitId) => {
      this.selectedCircuit = circuitId;
      this.updateCircuitShowcase();
    });

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
    this.briefingCircuit = document.getElementById('briefing-circuit');
    this.briefingModel = document.getElementById('briefing-model');
    this.briefingColorDot = document.getElementById('briefing-color-dot');
    this.briefingEnv = document.getElementById('briefing-env');
    this.briefingDriver = document.getElementById('briefing-driver');

    this.initTurntableAndPicker();
    this.bindEvents();
    this.pickRandomName();
  }

  private initTurntableAndPicker(): void {
    if (this.vehicleCanvas) {
      try {
        this.vehiclePreview = new VehiclePreview(this.vehicleCanvas);
        this.vehiclePreview.setVehicleModel(this.selectedVehicleModel);
        this.vehiclePreview.setColor(this.selectedColor);
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

    // Step 2: 차량 모델 카드
    this.modelCards.forEach(card => {
      card.addEventListener('click', () => {
        this.selectedVehicleModel = (card.dataset.model as VehicleModelId) || 'gt_turbo';
        this.updateModelShowcase();
        this.callbacks.onVehicleModelChange?.(this.selectedVehicleModel);
      });
    });

    // Step 3: 환경 칩
    this.envTimeChips.forEach(chip => {
      chip.addEventListener('click', () => {
        this.selectedTimeOfDay = (chip.dataset.time as TimeOfDay) || 'noon';
        this.updateEnvironmentShowcase();
        this.callbacks.onEnvironmentChange?.(this.selectedTimeOfDay, this.selectedWeather);
      });
    });

    this.envWeatherChips.forEach(chip => {
      chip.addEventListener('click', () => {
        this.selectedWeather = (chip.dataset.weather as WeatherType) || 'clear';
        this.updateEnvironmentShowcase();
        this.callbacks.onEnvironmentChange?.(this.selectedTimeOfDay, this.selectedWeather);
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
        vehicleModelId: this.selectedVehicleModel,
        color: this.selectedColor,
        timeOfDay: this.selectedTimeOfDay,
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
    this.circuitPreview.update(this.selectedCircuit);
    if (this.briefingCircuit) {
      this.briefingCircuit.textContent = CIRCUIT_DEFINITIONS[this.selectedCircuit]?.title || this.selectedCircuit;
    }
  }

  public updateModelShowcase(): void {
    this.modelCards.forEach(c => {
      c.classList.toggle('active', c.dataset.model === this.selectedVehicleModel);
    });

    const meta = VEHICLE_MODELS[this.selectedVehicleModel];
    if (meta) {
      if (this.vehicleSpecSpeed) this.vehicleSpecSpeed.textContent = meta.speed;
      if (this.vehicleSpecAccel) this.vehicleSpecAccel.textContent = meta.accel;
      if (this.vehicleSpecDownforce) this.vehicleSpecDownforce.textContent = meta.downforce;
      if (this.vehicleSpecHandling) this.vehicleSpecHandling.textContent = meta.handling;
    }

    this.vehiclePreview?.setVehicleModel(this.selectedVehicleModel);
    if (this.briefingModel) this.briefingModel.textContent = meta?.title || this.selectedVehicleModel;
  }

  public updateColor(hexVal: string, syncPicker: boolean = false): void {
    this.selectedColor = hexVal;
    if (syncPicker && this.honeycombPicker) {
      this.honeycombPicker.selectColor(hexVal);
    }

    this.vehiclePreview?.setColor(hexVal);
    if (this.briefingColorDot) this.briefingColorDot.style.backgroundColor = hexVal;
    this.callbacks.onColorChange?.(hexVal);
  }

  public updateEnvironmentShowcase(): void {
    this.envTimeChips.forEach(c => {
      c.classList.toggle('active', c.dataset.time === this.selectedTimeOfDay);
    });
    this.envWeatherChips.forEach(c => {
      c.classList.toggle('active', c.dataset.weather === this.selectedWeather);
    });

    const timeKey = `wizard.${this.selectedTimeOfDay}`;
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
    if (this.briefingModel) this.briefingModel.textContent = VEHICLE_MODELS[this.selectedVehicleModel]?.title || this.selectedVehicleModel;
    if (this.briefingColorDot) this.briefingColorDot.style.backgroundColor = this.selectedColor;

    const timeKey = `wizard.${this.selectedTimeOfDay}`;
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

    const circuits: CircuitId[] = ['circuit_monaco', 'circuit_monza', 'circuit_spa', 'circuit_silverstone'];
    this.selectedCircuit = circuits[Math.floor(Math.random() * circuits.length)];
    this.updateCircuitShowcase();

    const models: VehicleModelId[] = ['gt_turbo', 'formula_aero', 'cyber_speedster', 'lm_hypercar'];
    this.selectedVehicleModel = models[Math.floor(Math.random() * models.length)];
    this.updateModelShowcase();
    this.callbacks.onVehicleModelChange?.(this.selectedVehicleModel);

    const randHex = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    this.updateColor(randHex, true);

    const times: TimeOfDay[] = ['morning', 'noon', 'sunset', 'night'];
    this.selectedTimeOfDay = times[Math.floor(Math.random() * times.length)];

    const weathers: WeatherType[] = ['clear', 'rain', 'wind_fog', 'snow'];
    this.selectedWeather = weathers[Math.floor(Math.random() * weathers.length)];
    this.updateEnvironmentShowcase();
    this.callbacks.onEnvironmentChange?.(this.selectedTimeOfDay, this.selectedWeather);

    this.updateBriefingCard();
  }

  public resetDefaults(): void {
    this.selectedCircuit = 'circuit_monaco';
    this.selectedVehicleModel = 'gt_turbo';
    this.selectedColor = '#ef4444';
    this.selectedTimeOfDay = 'noon';
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

    this.callbacks.onVehicleModelChange?.(this.selectedVehicleModel);
    this.callbacks.onEnvironmentChange?.(this.selectedTimeOfDay, this.selectedWeather);
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
