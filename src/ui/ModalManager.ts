import { IModal } from './BaseModal.ts';

/**
 * 활성 모달 스택 및 ESC 키 닫기 이벤트 중앙 제어 관리자
 */
export class ModalManager {
  private static registeredModals: IModal<any>[] = [];

  public static register<M extends IModal<any>>(modal: M): M {
    if (!this.registeredModals.includes(modal)) {
      this.registeredModals.push(modal);
    }
    return modal;
  }

  /**
   * 열려있는 최상단 모달을 닫음 (ESC 키 처리 시 유용)
   * @returns 모달을 닫았으면 true, 열려있는 모달이 없었으면 false
   */
  public static closeTopModal(): boolean {
    // 역순(나중에 등록되거나 활성화된 모달부터) 검사
    for (let i = this.registeredModals.length - 1; i >= 0; i--) {
      const modal = this.registeredModals[i];
      if (modal.isOpen()) {
        modal.close();
        return true;
      }
    }
    return false;
  }

  public static getActiveModal(): IModal<any> | null {
    for (let i = this.registeredModals.length - 1; i >= 0; i--) {
      const modal = this.registeredModals[i];
      if (modal.isOpen()) return modal;
    }
    return null;
  }
}
