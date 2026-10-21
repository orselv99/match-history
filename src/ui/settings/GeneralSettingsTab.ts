import { appDB } from '../../storage/AppDatabase.ts';
import { i18nManager, Language } from '../../i18n/I18nManager.ts';

/**
 * 환경 설정 모달 - 일반(General) 탭 전담 컴포넌트
 * - 시뮬레이션 UI 언어 변경 (i18n)
 * - 오프라인 영구 캐시 통계 및 삭제 (BGM 스트리밍 캐시 & 경기 3D 리플레이 캐시 분리 제어)
 */
export class GeneralSettingsTab {
  private settingLanguage: HTMLSelectElement | null;
  private storageAudioStatsEl: HTMLElement | null;
  private btnClearAudioCache: HTMLElement | null;
  private storageReplayStatsEl: HTMLElement | null;
  private btnClearReplayCache: HTMLElement | null;

  private onStateChange?: () => void;

  constructor(onStateChange?: () => void) {
    this.onStateChange = onStateChange;

    this.settingLanguage = document.getElementById('setting-language') as HTMLSelectElement | null;
    this.storageAudioStatsEl = document.getElementById('setting-storage-audio-stats');
    this.btnClearAudioCache = document.getElementById('btn-clear-audio-cache');
    this.storageReplayStatsEl = document.getElementById('setting-storage-replay-stats');
    this.btnClearReplayCache = document.getElementById('btn-clear-replay-cache');

    this.bindEvents();
  }

  private bindEvents(): void {
    this.settingLanguage?.addEventListener('change', () => {
      const lang = (this.settingLanguage?.value || 'ko') as Language;
      i18nManager.setLanguage(lang);
      this.syncUI();
      this.onStateChange?.();
    });

    this.btnClearAudioCache?.addEventListener('click', async () => {
      if (this.btnClearAudioCache) {
        this.btnClearAudioCache.textContent = '...';
      }
      await appDB.clearAudioCache();
      await this.refreshStats();
      this.onStateChange?.();
    });

    this.btnClearReplayCache?.addEventListener('click', async () => {
      if (this.btnClearReplayCache) {
        this.btnClearReplayCache.textContent = '...';
      }
      await appDB.clearReplayCache();
      await this.refreshStats();
      this.onStateChange?.();
    });
  }

  public async refreshStats(): Promise<void> {
    try {
      const stats = await appDB.getStats();

      if (this.storageAudioStatsEl) {
        const mb = (stats.audioBytes / (1024 * 1024)).toFixed(1);
        const isKo = i18nManager.getLanguage() === 'ko';
        this.storageAudioStatsEl.textContent = isKo
          ? `${mb}MB (로비 ${stats.lobbyAudioCount}곡 / 인게임 ${stats.inGameAudioCount}곡)`
          : `${mb}MB (Lobby: ${stats.lobbyAudioCount} / In-Game: ${stats.inGameAudioCount})`;
      }

      if (this.btnClearAudioCache) {
        this.btnClearAudioCache.textContent = i18nManager.t('settings.general.clearBgmCache');
      }

      if (this.storageReplayStatsEl) {
        const mb = (stats.replayBytes / (1024 * 1024)).toFixed(1);
        const isKo = i18nManager.getLanguage() === 'ko';
        this.storageReplayStatsEl.textContent = isKo
          ? `${mb}MB (${stats.replayCount}개 경기)`
          : `${mb}MB (${stats.replayCount} Matches)`;
      }

      if (this.btnClearReplayCache) {
        this.btnClearReplayCache.textContent = i18nManager.t('settings.general.clearReplayCache');
      }
    } catch {
      // IndexedDB 미지원 또는 통계 조회 실패 시 무시
    }
  }

  public syncUI(): void {
    if (this.settingLanguage) {
      this.settingLanguage.value = i18nManager.getLanguage();
    }
    void this.refreshStats();
  }
}
