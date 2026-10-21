import { VehiclePreview } from '../VehiclePreview.ts';
import { HoneycombPicker } from '../HoneycombPicker.ts';
import { VEHICLE_MODELS, type VehicleModelId } from '../../../data/vehicles.ts';

export interface VehicleStepCallbacks {
  onModelChange?: (modelId: VehicleModelId) => void;
  onColorChange?: (color: string) => void;
}

/**
 * 게임 설정 위저드 Step 2: 머신 모델, 스펙 쇼케이스, 3D 턴테이블 & 컬러 팔레트 전담 스텝
 */
export class VehicleStep {
  private modelCards: NodeListOf<HTMLElement>;
  private honeycombContainer: HTMLElement | null;
  private vehicleCanvas: HTMLCanvasElement | null;
  private vehicleSpecSpeed: HTMLElement | null;
  private vehicleSpecAccel: HTMLElement | null;
  private vehicleSpecDownforce: HTMLElement | null;
  private vehicleSpecHandling: HTMLElement | null;

  private vehiclePreview: VehiclePreview | null = null;
  private honeycombPicker: HoneycombPicker | null = null;

  private selectedModel: VehicleModelId = 'gt_turbo';
  private selectedColor: string = '#ef4444';
  private callbacks: VehicleStepCallbacks;

  constructor(callbacks: VehicleStepCallbacks = {}) {
    this.callbacks = callbacks;
    this.modelCards = document.querySelectorAll<HTMLElement>('.wizard-choice-card[data-model]');
    this.honeycombContainer = document.getElementById('wizard-honeycomb-picker-container');
    this.vehicleCanvas = document.getElementById('wizard-vehicle-canvas') as HTMLCanvasElement | null;
    this.vehicleSpecSpeed = document.getElementById('vehicle-spec-speed');
    this.vehicleSpecAccel = document.getElementById('vehicle-spec-accel');
    this.vehicleSpecDownforce = document.getElementById('vehicle-spec-downforce');
    this.vehicleSpecHandling = document.getElementById('vehicle-spec-handling');

    this.initPreviewAndPicker();
    this.bindEvents();
  }

  private initPreviewAndPicker(): void {
    if (this.vehicleCanvas) {
      try {
        this.vehiclePreview = new VehiclePreview(this.vehicleCanvas);
        this.vehiclePreview.setVehicleModel(this.selectedModel);
        this.vehiclePreview.setColor(this.selectedColor);
      } catch (e) {
        console.warn('VehiclePreview init failed', e);
      }
    }

    if (this.honeycombContainer) {
      try {
        this.honeycombPicker = new HoneycombPicker(this.honeycombContainer, this.selectedColor, (hex) => {
          this.setColor(hex, false);
        });
      } catch (e) {
        console.warn('HoneycombPicker init failed', e);
      }
    }
  }

  private bindEvents(): void {
    this.modelCards.forEach(card => {
      card.addEventListener('click', () => {
        const modelId = (card.dataset.model as VehicleModelId) || 'gt_turbo';
        this.setModel(modelId);
      });
    });
  }

  public getSelectedModel(): VehicleModelId {
    return this.selectedModel;
  }

  public getSelectedColor(): string {
    return this.selectedColor;
  }

  public setModel(modelId: VehicleModelId): void {
    this.selectedModel = modelId;
    this.updateModelShowcase();
    this.callbacks.onModelChange?.(modelId);
  }

  public setColor(hexVal: string, syncPicker: boolean = true): void {
    this.selectedColor = hexVal;
    if (syncPicker && this.honeycombPicker) {
      this.honeycombPicker.selectColor(hexVal);
    }
    this.vehiclePreview?.setColor(hexVal);
    this.callbacks.onColorChange?.(hexVal);
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

    this.vehiclePreview?.setVehicleModel(this.selectedModel);
  }

  public startPreview(): void {
    this.vehiclePreview?.start();
    setTimeout(() => this.vehiclePreview?.resize(), 40);
  }

  public stopPreview(): void {
    this.vehiclePreview?.stop();
  }

  public resizePreview(): void {
    this.vehiclePreview?.resize();
  }

  public reset(): void {
    this.setModel('gt_turbo');
    this.setColor('#ef4444', true);
  }
}
