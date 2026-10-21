import { CircuitPreview } from '../CircuitPreview.ts';
import { type CircuitId } from '../../../data/circuits.ts';

export interface CircuitStepCallbacks {
  onCircuitChange?: (circuitId: CircuitId) => void;
}

/**
 * 게임 설정 위저드 Step 1: 서킷 선택 및 2D SVG 프리뷰 전담 스텝
 */
export class CircuitStep {
  private preview: CircuitPreview;
  private selectedCircuit: CircuitId = 'circuit_monaco';
  private callbacks: CircuitStepCallbacks;

  constructor(callbacks: CircuitStepCallbacks = {}) {
    this.callbacks = callbacks;
    this.preview = new CircuitPreview((circuitId) => {
      this.selectedCircuit = circuitId;
      this.update();
      this.callbacks.onCircuitChange?.(circuitId);
    });
  }

  public getSelectedCircuit(): CircuitId {
    return this.selectedCircuit;
  }

  public setSelectedCircuit(circuitId: CircuitId): void {
    this.selectedCircuit = circuitId;
    this.update();
  }

  public update(): void {
    this.preview.update(this.selectedCircuit);
  }

  public reset(): void {
    this.setSelectedCircuit('circuit_monaco');
    this.callbacks.onCircuitChange?.('circuit_monaco');
  }
}
