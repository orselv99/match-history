import { BaseModal } from '../BaseModal.ts';
import { AudioManager } from '../../core/AudioManager.ts';
import { i18nManager } from '../../i18n/I18nManager.ts';
import type { Game } from '../../core/Game.ts';
import { AudioSettingsTab } from './AudioSettingsTab.ts';
import { ControlsSettingsTab } from './ControlsSettingsTab.ts';
import { GraphicsSettingsTab } from './GraphicsSettingsTab.ts';

/**
 * 환경 설정 모달 메인 오케스트레이터 컨트롤러
 * - 사운드 탭 -> AudioSettingsTab 위임
 * - 조작 & 게임플레이 탭 -> ControlsSettingsTab 위임
 * - 그래픽 & 하드웨어 탭 -> GraphicsSettingsTab 위임
 */
export class SettingsModal extends BaseModal {
  private btnClose: HTMLElement | null;
  private btnSave: HTMLElement | null;

  // 탭 네비게이션
  private tabButtons: NodeListOf<HTMLButtonElement>;
  private tabPanels: NodeListOf<HTMLElement>;

  // 서브 탭 컨트롤러
  public readonly audioTab: AudioSettingsTab;
  public readonly controlsTab: ControlsSettingsTab;
  public readonly graphicsTab: GraphicsSettingsTab;

  constructor(audio: AudioManager, game?: Game) {
    super('settings-modal');

    this.btnClose = document.getElementById('settings-btn-close');
    this.btnSave = document.getElementById('settings-btn-save');

    this.tabButtons = document.querySelectorAll('.settings-tab-btn');
    this.tabPanels = document.querySelectorAll('.settings-tab-panel');

    // 3대 서브 탭 컴포넌트 초기화
    this.audioTab = new AudioSettingsTab(audio);
    this.controlsTab = new ControlsSettingsTab(game);
    this.graphicsTab = new GraphicsSettingsTab(game);

    this.bindEvents();
    this.syncUI();
  }

  private bindEvents(): void {
    const close = () => {
      this.controlsTab.stopListening();
      this.close();
    };
    this.btnClose?.addEventListener('click', close);
    this.btnSave?.addEventListener('click', close);

    // 탭 전환 이벤트
    this.tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        if (tab) this.switchTab(tab);
      });
    });

    i18nManager.onLanguageChange(() => {
      this.syncUI();
    });
  }

  public switchTab(tabId: string): void {
    this.tabButtons.forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
    });
    this.tabPanels.forEach((p) => {
      p.classList.toggle('active', p.id === `settings-panel-${tabId}`);
    });
  }

  public open(): void {
    this.syncUI();
    this.showModal();
  }

  public override close(): void {
    this.controlsTab.stopListening();
    super.close();
  }

  public syncUI(): void {
    this.audioTab.syncUI();
    this.controlsTab.syncUI();
    this.graphicsTab.syncUI();
  }
}
