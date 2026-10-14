/**
 * 모든 인게임 및 로비 모달 창의 공통 수명주기 인터페이스
 */
export interface IModal<T = void> {
  open(data?: T): void;
  close(): void;
  isOpen(): boolean;
}

/**
 * 모달 공통 베이스 클래스 (DOM 바인딩 및 열기/닫기 상태 표준화)
 */
export abstract class BaseModal<T = void> implements IModal<T> {
  protected modal: HTMLElement | null;

  constructor(elementId: string) {
    this.modal = document.getElementById(elementId);
  }

  public abstract open(data?: T): void;

  public close(): void {
    this.modal?.classList.remove('open');
  }

  public isOpen(): boolean {
    return this.modal?.classList.contains('open') ?? false;
  }

  // 데이터 기반 모달을 위한 시맨틱 에일리어스
  public show(data?: T): void {
    this.open(data);
  }

  public hide(): void {
    this.close();
  }
}
