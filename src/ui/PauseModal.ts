import { BaseModal } from './BaseModal.ts';

export interface PauseModalCallbacks {
  onResume: () => void;
  onRestart: () => void;
  onSettings: () => void;
  onExit: () => void;
}

export interface PauseModalInfo {
  circuitTitle: string;
  vehicleTitle: string;
  lapStr: string;
  timeStr: string;
}

/**
 * 인게임 일시정지(ESC) 모달 전담 컨트롤러
 */
export class PauseModal extends BaseModal<PauseModalInfo> {
  private btnResume: HTMLElement | null;
  private btnRestart: HTMLElement | null;
  private btnSettings: HTMLElement | null;
  private btnExit: HTMLElement | null;

  private infoCircuit: HTMLElement | null;
  private infoVehicle: HTMLElement | null;
  private infoLap: HTMLElement | null;
  private infoTime: HTMLElement | null;

  constructor(callbacks: PauseModalCallbacks) {
    super('pause-modal');

    this.btnResume = document.getElementById('pause-btn-resume');
    this.btnRestart = document.getElementById('pause-btn-restart');
    this.btnSettings = document.getElementById('pause-btn-settings');
    this.btnExit = document.getElementById('pause-btn-exit');

    this.infoCircuit = document.getElementById('pause-info-circuit');
    this.infoVehicle = document.getElementById('pause-info-vehicle');
    this.infoLap = document.getElementById('pause-info-lap');
    this.infoTime = document.getElementById('pause-info-time');

    this.btnResume?.addEventListener('click', () => {
      this.close();
      callbacks.onResume();
    });

    this.btnRestart?.addEventListener('click', () => {
      this.close();
      callbacks.onRestart();
    });

    this.btnSettings?.addEventListener('click', () => {
      callbacks.onSettings();
    });

    this.btnExit?.addEventListener('click', () => {
      this.close();
      callbacks.onExit();
    });
  }

  public open(info?: PauseModalInfo): void {
    if (info) {
      if (this.infoCircuit) this.infoCircuit.textContent = info.circuitTitle;
      if (this.infoVehicle) this.infoVehicle.textContent = info.vehicleTitle;
      if (this.infoLap) this.infoLap.textContent = info.lapStr;
      if (this.infoTime) this.infoTime.textContent = info.timeStr;
    }
    this.showModal();
  }
}
