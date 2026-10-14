import type { IModal } from './BaseModal.ts';

/**
 * 활성 모달 계층 스택 및 ESC 키 닫기 이벤트 중앙 제어 관리자
 */
export class ModalManager {
  private static registeredModals: IModal<any>[] = [];
  private static activeStack: IModal<any>[] = [];

  public static register<M extends IModal<any>>(modal: M): M {
    if (!this.registeredModals.includes(modal)) {
      this.registeredModals.push(modal);
    }
    return modal;
  }

  public static push(modal: IModal<any>): void {
    const idx = this.activeStack.indexOf(modal);
    if (idx !== -1) {
      this.activeStack.splice(idx, 1);
    }
    this.activeStack.push(modal);
    this.updateZIndices();
  }

  public static remove(modal: IModal<any>): void {
    const idx = this.activeStack.indexOf(modal);
    if (idx !== -1) {
      this.activeStack.splice(idx, 1);
    }
    modal.resetZIndex?.();
    this.updateZIndices();
  }

  private static updateZIndices(): void {
    this.activeStack.forEach((m, i) => {
      // Base z-index 50, 상위 중첩 모달일수록 +10씩 높은 z-index 부여하여 완벽한 시각적/인터랙션 계층 보장
      m.setZIndex?.(50 + (i + 1) * 10);
    });
  }

  /**
   * 열려있는 최상단 모달을 닫음 (ESC 키 처리 시 유용)
   * @returns 닫힌 모달 인스턴스 (열려있는 모달이 없었으면 null)
   */
  public static closeTopModal(): IModal<any> | null {
    if (this.activeStack.length > 0) {
      const top = this.activeStack[this.activeStack.length - 1];
      top.close();
      return top;
    }
    return null;
  }

  public static hasActiveModal(): boolean {
    return this.activeStack.length > 0;
  }

  public static getTopModal(): IModal<any> | null {
    return this.activeStack.length > 0 ? this.activeStack[this.activeStack.length - 1] : null;
  }

  public static getActiveModal(): IModal<any> | null {
    return this.getTopModal();
  }
}
