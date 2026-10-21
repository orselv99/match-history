import { BaseModal } from '../BaseModal.ts';
import { CircuitStep } from './steps/CircuitStep.ts';
import { VehicleStep } from './steps/VehicleStep.ts';
import { EnvironmentStep } from './steps/EnvironmentStep.ts';
import { BriefingStep } from './steps/BriefingStep.ts';
import type { CircuitId } from '../../data/circuits.ts';
import type { VehicleModelId } from '../../data/vehicles.ts';
import type { TimeOfDay, WeatherType } from '../../game/EnvironmentManager.ts';
import { i18nManager, t } from '../../i18n/I18nManager.ts';

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
 * 4단계 게임 설정 위저드(서킷, 머신/컬러, 환경, 드라이버) 메인 오케스트레이터
 * - 각 단계별 로직을 steps/ 하위 모듈(CircuitStep, VehicleStep, EnvironmentStep, BriefingStep)로 위임 관리
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

  // 서브 스텝 컨트롤러
  public circuitStep: CircuitStep;
  public vehicleStep: VehicleStep;
  public environmentStep: EnvironmentStep;
  public briefingStep: BriefingStep;

  private currentStep: 1 | 2 | 3 | 4 = 1;
  private callbacks: GameSetupWizardCallbacks;

  // 하위 호환 게터/세터
  public get selectedCircuit(): CircuitId {
    return this.circuitStep.getSelectedCircuit();
  }
  public set selectedCircuit(id: CircuitId) {
    this.circuitStep.setSelectedCircuit(id);
  }

  public get selectedVehicleModel(): VehicleModelId {
    return this.vehicleStep.getSelectedModel();
  }
  public set selectedVehicleModel(id: VehicleModelId) {
    this.vehicleStep.setModel(id);
  }

  public get selectedColor(): string {
    return this.vehicleStep.getSelectedColor();
  }
  public set selectedColor(color: string) {
    this.vehicleStep.setColor(color);
  }

  public get selectedTimeOfDay(): TimeOfDay {
    return this.environmentStep.getTimeOfDay();
  }
  public set selectedTimeOfDay(time: TimeOfDay) {
    this.environmentStep.setTimeOfDay(time);
  }

  public get selectedWeather(): WeatherType {
    return this.environmentStep.getWeather();
  }
  public set selectedWeather(weather: WeatherType) {
    this.environmentStep.setWeather(weather);
  }

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

    // 4개 스텝 초기화
    this.circuitStep = new CircuitStep({
      onCircuitChange: () => this.syncBriefing(),
    });

    this.vehicleStep = new VehicleStep({
      onModelChange: (modelId) => {
        this.syncBriefing();
        this.callbacks.onVehicleModelChange?.(modelId);
      },
      onColorChange: (color) => {
        this.syncBriefing();
        this.callbacks.onColorChange?.(color);
      },
    });

    this.environmentStep = new EnvironmentStep({
      onEnvironmentChange: (time, weather) => {
        this.syncBriefing();
        this.callbacks.onEnvironmentChange?.(time, weather);
      },
    });

    this.briefingStep = new BriefingStep({
      onDriverChange: () => this.syncBriefing(),
    });

    this.bindEvents();
    this.syncBriefing();
  }

  private getStepTitle(step: number): string {
    return t(`wizard.step${step}Title`);
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
      this.circuitStep.update();
      this.vehicleStep.updateModelShowcase();
      this.environmentStep.updateShowcase();
      this.syncBriefing();
    });

    this.btnRandomAll?.addEventListener('click', () => this.randomizeAll());
    this.btnReset?.addEventListener('click', () => this.resetDefaults());

    this.btnStart?.addEventListener('click', () => {
      const config: RaceSetupConfig = {
        circuitId: this.selectedCircuit,
        vehicleModelId: this.selectedVehicleModel,
        color: this.selectedColor,
        timeOfDay: this.selectedTimeOfDay,
        weather: this.selectedWeather,
        driverName: this.briefingStep.getDriverName(),
        isAutoDrive: this.briefingStep.isAutoDrive(),
      };
      this.close();
      this.callbacks.onStartRace(config);
    });

    window.addEventListener('resize', () => {
      if (this.isOpen() && this.currentStep === 2) {
        this.vehicleStep.resizePreview();
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
      this.circuitStep.update();
    } else if (step === 2) {
      this.vehicleStep.updateModelShowcase();
      this.vehicleStep.startPreview();
    } else if (step === 3) {
      this.environmentStep.updateShowcase();
    } else if (step === 4) {
      this.syncBriefing();
    }

    if (step === 4) {
      if (this.btnNext) this.btnNext.style.display = 'none';
      if (this.btnStart) this.btnStart.style.display = 'inline-block';
    } else {
      if (this.btnNext) this.btnNext.style.display = 'inline-block';
      if (this.btnStart) this.btnStart.style.display = 'none';
    }

    if (step !== 2) {
      this.vehicleStep.stopPreview();
    }
  }

  public syncBriefing(): void {
    this.briefingStep.updateBriefing(
      this.selectedCircuit,
      this.selectedVehicleModel,
      this.selectedColor,
      this.environmentStep.getSummaryText()
    );
  }

  public randomizeAll(): void {
    this.briefingStep.pickRandomName();
    this.circuitStep.randomize();
    this.vehicleStep.randomize();
    this.environmentStep.randomize();
    this.syncBriefing();
  }

  public resetDefaults(): void {
    this.circuitStep.reset();
    this.vehicleStep.reset();
    this.environmentStep.reset();
    this.briefingStep.reset();
    this.syncBriefing();
  }

  public open(): void {
    this.showModal();
    this.circuitStep.update();
    this.vehicleStep.updateModelShowcase();
    this.environmentStep.updateShowcase();
    this.syncBriefing();
    this.goToStep(1);
  }

  public override close(): void {
    super.close();
    this.vehicleStep.stopPreview();
  }
}
