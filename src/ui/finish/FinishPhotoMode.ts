import { showToast } from '../Toast.ts';

export interface PhotoModeCallbacks {
  isOpen: () => boolean;
  onCaptureScreenshot?: () => string | void;
}

/**
 * 완주 화면 포토 모드(UI 숨김 및 깨끗한 3D 컷씬 스크린샷 캡처) 전담 제어기
 * - Ctrl+Z 단축키로 포토 모드 진입/해제
 * - PrintScreen / OS 화면 캡처(Win+Shift+S 등) 감지 시 안내 힌트 즉시 소거
 * - 캔버스 toDataURL 기반 PNG 이미지 다운로드
 */
export class FinishPhotoMode {
  private isPhotoMode: boolean = false;
  private hintTimeoutId: number | null = null;
  private callbacks: PhotoModeCallbacks;

  constructor(callbacks: PhotoModeCallbacks) {
    this.callbacks = callbacks;
    this.bindEvents();
  }

  private bindEvents(): void {
    // OS 캡처(PrintScreen 단축키) 및 화면 캡처 도구 감지 시 토스트 즉각 숨김
    const hideToastForCapture = () => {
      if (!this.isPhotoMode) return;
      const hint = document.getElementById('photo-mode-hint');
      if (hint) {
        hint.classList.remove('visible');
        hint.classList.add('capture-hidden');
      }
      const toastContainer = document.getElementById('toast-container');
      if (toastContainer) {
        toastContainer.innerHTML = '';
      }
    };

    // Ctrl + Z 단축키로 포토 모드(UI 숨김) 토글 및 복귀 리스너
    window.addEventListener('keydown', (e) => {
      if (!this.callbacks.isOpen()) return;

      if (e.key === 'PrintScreen' || e.code === 'PrintScreen') {
        hideToastForCapture();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault();
        this.togglePhotoMode();
      } else if (this.isPhotoMode && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        // 포토 모드 중 일반 키 입력 시 UI 복귀
        this.setPhotoMode(false);
      }
    });

    // OS 캡처 도구 실행 시 브라우저 포커스 상실(blur)을 감지하여 토스트 숨김
    window.addEventListener('blur', () => {
      hideToastForCapture();
    });

    // 포토 모드 중 마우스 이동 시 힌트를 잠시 표시했다가 자동 페이드아웃
    window.addEventListener('mousemove', () => {
      if (this.callbacks.isOpen() && this.isPhotoMode) {
        this.showHintTemporarily(1800);
      }
    });

    // 포토 모드 중 화면 클릭 시 UI 복귀
    window.addEventListener('click', () => {
      if (this.callbacks.isOpen() && this.isPhotoMode) {
        this.setPhotoMode(false);
      }
    });
  }

  public get active(): boolean {
    return this.isPhotoMode;
  }

  public showHintTemporarily(durationMs: number = 2200): void {
    const hint = document.getElementById('photo-mode-hint');
    if (!hint) return;

    hint.classList.remove('capture-hidden');
    hint.classList.add('visible');

    if (this.hintTimeoutId !== null) {
      window.clearTimeout(this.hintTimeoutId);
    }

    this.hintTimeoutId = window.setTimeout(() => {
      hint.classList.remove('visible');
      this.hintTimeoutId = null;
    }, durationMs);
  }

  public togglePhotoMode(): void {
    this.setPhotoMode(!this.isPhotoMode);
  }

  public setPhotoMode(enabled: boolean): void {
    this.isPhotoMode = enabled;
    document.body.classList.toggle('in-photo-mode', enabled);

    const hint = document.getElementById('photo-mode-hint');
    if (this.hintTimeoutId !== null) {
      window.clearTimeout(this.hintTimeoutId);
      this.hintTimeoutId = null;
    }

    if (enabled) {
      const toastContainer = document.getElementById('toast-container');
      if (toastContainer) {
        toastContainer.innerHTML = '';
      }
      this.showHintTemporarily(2200);
    } else {
      if (hint) {
        hint.classList.remove('visible');
        hint.classList.remove('capture-hidden');
      }
    }
  }

  public captureScreenshot(circuitId?: string): void {
    try {
      let dataUrl: string | null = null;
      if (this.callbacks.onCaptureScreenshot) {
        dataUrl = this.callbacks.onCaptureScreenshot() || null;
      }
      if (!dataUrl) {
        const canvas = document.querySelector<HTMLCanvasElement>('#game-container canvas');
        if (canvas) {
          dataUrl = canvas.toDataURL('image/png');
        }
      }
      if (!dataUrl) return;

      const a = document.createElement('a');
      a.href = dataUrl;
      const circuitName = circuitId || 'circuit';
      a.download = `apex-finish-${circuitName}.png`;
      a.click();
      showToast('📷 3D 컷씬 스크린샷이 저장되었습니다! (보정 후 로비 배경 등으로 활용해보세요)');
    } catch (e) {
      console.warn('Screenshot capture failed', e);
    }
  }
}
