/**
 * 인게임 및 UI 전역 토스트 알림 헬퍼
 */
export function showToast(message: string, durationMs: number = 3200): void {
  if (typeof document === 'undefined') return;

  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'game-toast';
  toast.innerHTML = `<span class="toast-icon">💾</span><span class="toast-msg">${message}</span>`;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });

  setTimeout(() => {
    toast.classList.remove('visible');
    toast.classList.add('fade-out');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, durationMs);
}
