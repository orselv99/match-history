import { RANDOM_DRIVER_NAMES } from '../../../data/gameConstants.ts';
import { CIRCUIT_DEFINITIONS, type CircuitId } from '../../../data/circuits.ts';
import { VEHICLE_MODELS, type VehicleModelId } from '../../../data/vehicles.ts';
import { t } from '../../../i18n/I18nManager.ts';

export interface BriefingStepCallbacks {
  onDriverChange?: () => void;
}

/**
 * 게임 설정 위저드 Step 4: 드라이버 프로필, 자동주행 여부 및 최종 레이스 브리핑 카드 전담 스텝
 */
export class BriefingStep {
  private driverNameInput: HTMLInputElement | null;
  private btnRandomName: HTMLElement | null;
  private chkAutodrive: HTMLInputElement | null;
  private briefingCircuit: HTMLElement | null;
  private briefingModel: HTMLElement | null;
  private briefingColorDot: HTMLElement | null;
  private briefingEnv: HTMLElement | null;
  private briefingDriver: HTMLElement | null;
  private callbacks: BriefingStepCallbacks;

  constructor(callbacks: BriefingStepCallbacks = {}) {
    this.callbacks = callbacks;
    this.driverNameInput = document.getElementById('wizard-driver-name') as HTMLInputElement | null;
    this.btnRandomName = document.getElementById('wizard-btn-random-name');
    this.chkAutodrive = document.getElementById('wizard-chk-autodrive') as HTMLInputElement | null;
    this.briefingCircuit = document.getElementById('briefing-circuit');
    this.briefingModel = document.getElementById('briefing-model');
    this.briefingColorDot = document.getElementById('briefing-color-dot');
    this.briefingEnv = document.getElementById('briefing-env');
    this.briefingDriver = document.getElementById('briefing-driver');

    this.bindEvents();
    if (this.driverNameInput && !this.driverNameInput.value) {
      this.driverNameInput.value = RANDOM_DRIVER_NAMES[Math.floor(Math.random() * RANDOM_DRIVER_NAMES.length)];
    }
  }

  private bindEvents(): void {
    this.btnRandomName?.addEventListener('click', () => this.pickRandomName());
    this.driverNameInput?.addEventListener('input', () => {
      this.callbacks.onDriverChange?.();
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
      this.callbacks.onDriverChange?.();
    });
  }

  public getDriverName(): string {
    return this.driverNameInput?.value.trim() || 'Apex Hunter';
  }

  public isAutoDrive(): boolean {
    return this.chkAutodrive?.checked ?? false;
  }

  public pickRandomName(): void {
    const rand = RANDOM_DRIVER_NAMES[Math.floor(Math.random() * RANDOM_DRIVER_NAMES.length)];
    if (this.driverNameInput) this.driverNameInput.value = rand;
    this.callbacks.onDriverChange?.();
  }

  public updateBriefing(
    circuitId: CircuitId,
    vehicleModelId: VehicleModelId,
    color: string,
    envSummary: string
  ): void {
    if (this.briefingCircuit) {
      this.briefingCircuit.textContent = CIRCUIT_DEFINITIONS[circuitId]?.title || circuitId;
    }
    if (this.briefingModel) {
      this.briefingModel.textContent = VEHICLE_MODELS[vehicleModelId]?.title || vehicleModelId;
    }
    if (this.briefingColorDot) {
      this.briefingColorDot.style.backgroundColor = color;
    }
    if (this.briefingEnv) {
      this.briefingEnv.textContent = envSummary;
    }
    if (this.briefingDriver) {
      if (this.chkAutodrive?.checked) {
        this.briefingDriver.textContent = t('wizard.autoDriveMode');
      } else {
        const name = this.getDriverName();
        this.briefingDriver.textContent = `${name} (${t('wizard.manualDrive')})`;
      }
    }
  }

  public reset(): void {
    if (this.driverNameInput) this.driverNameInput.value = 'Apex Hunter';
    if (this.chkAutodrive) this.chkAutodrive.checked = false;
    if (this.driverNameInput) this.driverNameInput.disabled = false;
    this.btnRandomName?.removeAttribute('disabled');
    if (this.btnRandomName) {
      this.btnRandomName.style.pointerEvents = 'auto';
      this.btnRandomName.style.opacity = '1';
    }
  }
}
