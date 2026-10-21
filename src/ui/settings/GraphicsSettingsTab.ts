import {
  graphicsSettingsManager,
  MotionBlurQuality,
  ShadowQuality,
  ResolutionScale,
  CameraShakeMode,
} from '../../core/GraphicsSettingsManager.ts';
import { i18nManager } from '../../i18n/I18nManager.ts';
import type { Game } from '../../core/Game.ts';

/**
 * 환경 설정 모달 - 그래픽 성능 및 하드웨어 옵션 탭 전담 컴포넌트
 */
export class GraphicsSettingsTab {
  private gfxDetectedGpu: HTMLElement | null;
  private gfxDetectedSpecs: HTMLElement | null;
  private gfxRecommendedBadge: HTMLElement | null;
  private gfxRecommendationReason: HTMLElement | null;
  private btnGfxAutodetect: HTMLButtonElement | null;
  private btnGfxPresetHigh: HTMLButtonElement | null;
  private btnGfxPresetMedium: HTMLButtonElement | null;
  private btnGfxPresetLow: HTMLButtonElement | null;
  private badgeGfxCustom: HTMLElement | null;
  private selectGfxMotionBlur: HTMLSelectElement | null;
  private selectGfxResolution: HTMLSelectElement | null;
  private selectGfxShadows: HTMLSelectElement | null;
  private chkGfxDynamicFov: HTMLInputElement | null;
  private selectGfxShake: HTMLSelectElement | null;
  private chkGfxWeatherFx: HTMLInputElement | null;

  private game?: Game;
  private onStateChange?: () => void;

  constructor(game?: Game, onStateChange?: () => void) {
    this.game = game;
    this.onStateChange = onStateChange;

    this.gfxDetectedGpu = document.getElementById('gfx-detected-gpu');
    this.gfxDetectedSpecs = document.getElementById('gfx-detected-specs');
    this.gfxRecommendedBadge = document.getElementById('gfx-recommended-badge');
    this.gfxRecommendationReason = document.getElementById('gfx-recommendation-reason');
    this.btnGfxAutodetect = document.getElementById('btn-gfx-autodetect') as HTMLButtonElement | null;
    this.btnGfxPresetHigh = document.getElementById('btn-gfx-preset-high') as HTMLButtonElement | null;
    this.btnGfxPresetMedium = document.getElementById('btn-gfx-preset-medium') as HTMLButtonElement | null;
    this.btnGfxPresetLow = document.getElementById('btn-gfx-preset-low') as HTMLButtonElement | null;
    this.badgeGfxCustom = document.getElementById('badge-gfx-custom');
    this.selectGfxMotionBlur = document.getElementById('setting-gfx-motion-blur') as HTMLSelectElement | null;
    this.selectGfxResolution = document.getElementById('setting-gfx-resolution') as HTMLSelectElement | null;
    this.selectGfxShadows = document.getElementById('setting-gfx-shadows') as HTMLSelectElement | null;
    this.chkGfxDynamicFov = document.getElementById('chk-gfx-dynamic-fov') as HTMLInputElement | null;
    this.selectGfxShake = document.getElementById('setting-gfx-shake') as HTMLSelectElement | null;
    this.chkGfxWeatherFx = document.getElementById('chk-gfx-weather-fx') as HTMLInputElement | null;

    this.bindEvents();
  }

  private bindEvents(): void {
    this.btnGfxAutodetect?.addEventListener('click', () => {
      const s = graphicsSettingsManager.applyRecommended();
      if (this.game) this.game.applyGraphicsSettings(s);
      this.syncUI();
      this.onStateChange?.();
    });

    this.btnGfxPresetHigh?.addEventListener('click', () => {
      const s = graphicsSettingsManager.setPreset('HIGH');
      if (this.game) this.game.applyGraphicsSettings(s);
      this.syncUI();
      this.onStateChange?.();
    });

    this.btnGfxPresetMedium?.addEventListener('click', () => {
      const s = graphicsSettingsManager.setPreset('MEDIUM');
      if (this.game) this.game.applyGraphicsSettings(s);
      this.syncUI();
      this.onStateChange?.();
    });

    this.btnGfxPresetLow?.addEventListener('click', () => {
      const s = graphicsSettingsManager.setPreset('LOW');
      if (this.game) this.game.applyGraphicsSettings(s);
      this.syncUI();
      this.onStateChange?.();
    });

    this.selectGfxMotionBlur?.addEventListener('change', () => {
      const val = (this.selectGfxMotionBlur?.value || 'HIGH') as MotionBlurQuality;
      const s = graphicsSettingsManager.updateSetting('motionBlur', val);
      if (this.game) this.game.applyGraphicsSettings(s);
      this.syncUI();
      this.onStateChange?.();
    });

    this.selectGfxResolution?.addEventListener('change', () => {
      const val = (this.selectGfxResolution?.value || 'HIGH') as ResolutionScale;
      const s = graphicsSettingsManager.updateSetting('resolution', val);
      if (this.game) this.game.applyGraphicsSettings(s);
      this.syncUI();
      this.onStateChange?.();
    });

    this.selectGfxShadows?.addEventListener('change', () => {
      const val = (this.selectGfxShadows?.value || 'HIGH') as ShadowQuality;
      const s = graphicsSettingsManager.updateSetting('shadows', val);
      if (this.game) this.game.applyGraphicsSettings(s);
      this.syncUI();
      this.onStateChange?.();
    });

    this.chkGfxDynamicFov?.addEventListener('change', () => {
      const val = !!this.chkGfxDynamicFov?.checked;
      const s = graphicsSettingsManager.updateSetting('dynamicFov', val);
      if (this.game) this.game.applyGraphicsSettings(s);
      this.syncUI();
      this.onStateChange?.();
    });

    this.selectGfxShake?.addEventListener('change', () => {
      const val = (this.selectGfxShake?.value || 'FULL') as CameraShakeMode;
      const s = graphicsSettingsManager.updateSetting('cameraShake', val);
      if (this.game) this.game.applyGraphicsSettings(s);
      this.syncUI();
      this.onStateChange?.();
    });

    this.chkGfxWeatherFx?.addEventListener('change', () => {
      const val = !!this.chkGfxWeatherFx?.checked;
      const s = graphicsSettingsManager.updateSetting('weatherFx', val);
      if (this.game) this.game.applyGraphicsSettings(s);
      this.syncUI();
      this.onStateChange?.();
    });
  }

  public syncUI(): void {
    const hw = graphicsSettingsManager.getHardwareInfo();
    if (this.gfxDetectedGpu) this.gfxDetectedGpu.textContent = hw.gpuRenderer;
    if (this.gfxDetectedSpecs) {
      const memStr = hw.memoryGb ? ` | ~${hw.memoryGb}GB RAM` : '';
      this.gfxDetectedSpecs.textContent = `${hw.cores} Logical Cores${memStr} | WebGL 2.0 Accelerated`;
    }
    if (this.gfxRecommendedBadge) {
      this.gfxRecommendedBadge.textContent = `${i18nManager.t('common.recommended')}: ${hw.recommendedPreset}`;
    }
    if (this.gfxRecommendationReason) {
      this.gfxRecommendationReason.textContent = hw.recommendationReason;
    }

    const gfx = graphicsSettingsManager.getSettings();
    if (this.btnGfxPresetHigh) this.btnGfxPresetHigh.classList.toggle('active', gfx.preset === 'HIGH');
    if (this.btnGfxPresetMedium) this.btnGfxPresetMedium.classList.toggle('active', gfx.preset === 'MEDIUM');
    if (this.btnGfxPresetLow) this.btnGfxPresetLow.classList.toggle('active', gfx.preset === 'LOW');
    if (this.badgeGfxCustom) this.badgeGfxCustom.style.display = gfx.preset === 'CUSTOM' ? 'inline-block' : 'none';

    if (this.selectGfxMotionBlur) this.selectGfxMotionBlur.value = gfx.motionBlur;
    if (this.selectGfxResolution) this.selectGfxResolution.value = gfx.resolution;
    if (this.selectGfxShadows) this.selectGfxShadows.value = gfx.shadows;
    if (this.chkGfxDynamicFov) this.chkGfxDynamicFov.checked = gfx.dynamicFov;
    if (this.selectGfxShake) this.selectGfxShake.value = gfx.cameraShake;
    if (this.chkGfxWeatherFx) this.chkGfxWeatherFx.checked = gfx.weatherFx !== false;
  }
}
