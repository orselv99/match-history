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
  isReplay?: boolean;
}

/**
 * 인게임 일시정지(ESC) 모달 전담 컨트롤러
 * - 일반 주행 및 3D 리플레이 모드별 맞춤 UI (리플레이 시 [다시 시작] 숨김 및 번호 재정렬)
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

  private pauseTag: HTMLElement | null;
  private pauseTitle: HTMLElement | null;
  private resumeTitle: HTMLElement | null;
  private resumeDesc: HTMLElement | null;
  private settingsNum: HTMLElement | null;
  private exitNum: HTMLElement | null;
  private exitTitle: HTMLElement | null;
  private exitDesc: HTMLElement | null;

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

    this.pauseTag = document.getElementById('pause-tag');
    this.pauseTitle = document.getElementById('pause-title');
    this.resumeTitle = document.getElementById('pause-resume-title');
    this.resumeDesc = document.getElementById('pause-resume-desc');
    this.settingsNum = document.getElementById('pause-settings-num');
    this.exitNum = document.getElementById('pause-exit-num');
    this.exitTitle = document.getElementById('pause-exit-title');
    this.exitDesc = document.getElementById('pause-exit-desc');

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

      // 3D 리플레이 시 [다시 시작] 버튼 숨김 및 텍스트 맞춤 변경
      const isReplay = !!info.isReplay;
      if (this.btnRestart) {
        this.btnRestart.style.display = isReplay ? 'none' : 'flex';
      }

      if (isReplay) {
        if (this.pauseTag) this.pauseTag.textContent = '3D 리플레이 일시 정지';
        if (this.pauseTitle) this.pauseTitle.textContent = '리플레이 일시정지';
        if (this.resumeTitle) this.resumeTitle.textContent = '리플레이 재생 계속';
        if (this.resumeDesc) this.resumeDesc.textContent = '현재 위치와 시간에서 리플레이를 계속 시청합니다 [ESC]';
        if (this.settingsNum) this.settingsNum.textContent = '02';
        if (this.exitNum) this.exitNum.textContent = '03';
        if (this.exitTitle) this.exitTitle.textContent = '인스펙터로 돌아가기';
        if (this.exitDesc) this.exitDesc.textContent = '3D 리플레이를 종료하고 경기 상세 인스펙터 화면으로 돌아갑니다';
      } else {
        if (this.pauseTag) this.pauseTag.textContent = '경기 일시 정지';
        if (this.pauseTitle) this.pauseTitle.textContent = '일시정지';
        if (this.resumeTitle) this.resumeTitle.textContent = '주행재개';
        if (this.resumeDesc) this.resumeDesc.textContent = '현재 위치와 시간에서 레이스를 재개합니다 [ESC]';
        if (this.settingsNum) this.settingsNum.textContent = '03';
        if (this.exitNum) this.exitNum.textContent = '04';
        if (this.exitTitle) this.exitTitle.textContent = '메인 메뉴로 나가기';
        if (this.exitDesc) this.exitDesc.textContent = '현재 레이스를 종료하고 로비 메뉴로 돌아갑니다';
      }
    }
    this.showModal();
  }
}
