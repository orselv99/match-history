/**
 * 그래픽 성능 및 하드웨어 자동 감지 매니저 (GraphicsSettingsManager)
 * - WebGL UNMASKED_RENDERER_WEBGL, CPU 코어수, 디바이스 메모리 기반 하드웨어 성능 자동 감지
 * - PC 사양에 최적화된 초기 권장 설정(HIGH, MEDIUM, LOW) 자동 제안
 * - 저사양 GPU 모션블러 샘플 축소/비활성화, 해상도 스케일, 그림자, 다이내믹 FOV, 카메라 진동 조절
 */

export type GraphicsPreset = 'HIGH' | 'MEDIUM' | 'LOW' | 'CUSTOM';
export type MotionBlurQuality = 'HIGH' | 'MEDIUM' | 'OFF';
export type ShadowQuality = 'HIGH' | 'MEDIUM' | 'OFF';
export type ResolutionScale = 'HIGH' | 'MEDIUM' | 'LOW';
export type CameraShakeMode = 'FULL' | 'REDUCED' | 'OFF';

export interface GraphicsSettings {
  preset: GraphicsPreset;
  motionBlur: MotionBlurQuality;
  shadows: ShadowQuality;
  resolution: ResolutionScale;
  dynamicFov: boolean;
  cameraShake: CameraShakeMode;
}

export interface HardwareInfo {
  gpuRenderer: string;
  cores: number;
  memoryGb?: number;
  recommendedPreset: 'HIGH' | 'MEDIUM' | 'LOW';
  recommendationReason: string;
}

export const PRESET_CONFIGS: Record<'HIGH' | 'MEDIUM' | 'LOW', Omit<GraphicsSettings, 'preset'>> = {
  HIGH: {
    motionBlur: 'HIGH',
    shadows: 'HIGH',
    resolution: 'HIGH',
    dynamicFov: true,
    cameraShake: 'FULL',
  },
  MEDIUM: {
    motionBlur: 'MEDIUM',
    shadows: 'MEDIUM',
    resolution: 'MEDIUM',
    dynamicFov: true,
    cameraShake: 'REDUCED',
  },
  LOW: {
    motionBlur: 'OFF',
    shadows: 'OFF',
    resolution: 'LOW',
    dynamicFov: false,
    cameraShake: 'OFF',
  },
};

const STORAGE_KEY = 'apex_racing_graphics_settings';

export class GraphicsSettingsManager {
  private settings: GraphicsSettings;
  private hardwareInfo: HardwareInfo;

  constructor() {
    this.hardwareInfo = this.detectHardware();
    this.settings = this.loadSettings();
  }

  public detectHardware(): HardwareInfo {
    let gpuRenderer = 'Standard WebGL Hardware';
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          gpuRenderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || gpuRenderer;
        }
      }
    } catch {
      // Ignore fallback
    }

    const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
    const memoryGb = typeof navigator !== 'undefined' ? (navigator as any).deviceMemory : undefined;

    const gpuLower = gpuRenderer.toLowerCase();
    const isHighEndGpu = /rtx|gtx|geforce|radeon rx|radeon pro|apple m[1-4] (pro|max)|apple m[2-4]/i.test(gpuLower);
    const isLowEndGpu = /intel|uhd|iris|hd graphics|swiftshader|llvmpipe|software/i.test(gpuLower);

    let recommendedPreset: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
    let recommendationReason = '표준 PC 환경에 적합한 밸런스 설정입니다.';

    if (isHighEndGpu || (cores >= 8 && !isLowEndGpu)) {
      recommendedPreset = 'HIGH';
      recommendationReason = '고성능 GPU/CPU 환경입니다. 최고 품질 그래픽을 권장합니다.';
    } else if (isLowEndGpu || cores <= 4 || (memoryGb && memoryGb <= 4)) {
      recommendedPreset = 'LOW';
      recommendationReason = '내장 그래픽 또는 절전 환경입니다. 프레임 확보를 위한 경량 설정을 권장합니다.';
    }

    return {
      gpuRenderer,
      cores,
      memoryGb,
      recommendedPreset,
      recommendationReason,
    };
  }

  private loadSettings(): GraphicsSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.preset && parsed.motionBlur && parsed.shadows) {
          return parsed;
        }
      }
    } catch {
      // LocalStorage error fallback
    }

    // 초기값: 감지된 권장 프리셋 적용
    const rec = this.hardwareInfo.recommendedPreset;
    return {
      preset: rec,
      ...PRESET_CONFIGS[rec],
    };
  }

  public getSettings(): GraphicsSettings {
    return { ...this.settings };
  }

  public getHardwareInfo(): HardwareInfo {
    return { ...this.hardwareInfo };
  }

  public setPreset(preset: 'HIGH' | 'MEDIUM' | 'LOW'): GraphicsSettings {
    this.settings = {
      preset,
      ...PRESET_CONFIGS[preset],
    };
    this.save();
    return this.getSettings();
  }

  public updateSetting<K extends keyof GraphicsSettings>(key: K, value: GraphicsSettings[K]): GraphicsSettings {
    this.settings[key] = value;
    // 프리셋 일치 여부 확인
    let matchedPreset: GraphicsPreset = 'CUSTOM';
    for (const p of ['HIGH', 'MEDIUM', 'LOW'] as const) {
      const cfg = PRESET_CONFIGS[p];
      if (
        this.settings.motionBlur === cfg.motionBlur &&
        this.settings.shadows === cfg.shadows &&
        this.settings.resolution === cfg.resolution &&
        this.settings.dynamicFov === cfg.dynamicFov &&
        this.settings.cameraShake === cfg.cameraShake
      ) {
        matchedPreset = p;
        break;
      }
    }
    this.settings.preset = matchedPreset;
    this.save();
    return this.getSettings();
  }

  public applyRecommended(): GraphicsSettings {
    return this.setPreset(this.hardwareInfo.recommendedPreset);
  }

  public save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Ignore storage write failure
    }
  }
}

export const graphicsSettingsManager = new GraphicsSettingsManager();
