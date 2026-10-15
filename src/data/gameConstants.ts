import { t } from '../i18n/I18nManager.ts';

export const RANDOM_DRIVER_KEYS = [
  'wizard.driver1',
  'wizard.driver2',
  'wizard.driver3',
  'wizard.driver4',
  'wizard.driver5',
  'wizard.driver6',
  'wizard.driver7',
  'wizard.driver8',
  'wizard.driver9',
  'wizard.driver10',
];

export const getRandomDriverNames = (): string[] => {
  return RANDOM_DRIVER_KEYS.map((k) => t(k));
};

export const RANDOM_DRIVER_NAMES: string[] = new Proxy([] as string[], {
  get: (_, prop: string | symbol) => {
    const names = getRandomDriverNames();
    if (prop === Symbol.iterator) {
      return names[Symbol.iterator].bind(names);
    }
    if (prop === 'length') return names.length;
    if (typeof prop === 'string' && !isNaN(Number(prop))) {
      return names[Number(prop)];
    }
    const val = (names as any)[prop];
    return typeof val === 'function' ? val.bind(names) : val;
  },
});

export const TIME_OF_DAY_LABELS: Record<string, string> = new Proxy({} as Record<string, string>, {
  get: (_, prop: string) => t(`wizard.${prop}`),
});

export const WEATHER_LABELS: Record<string, string> = new Proxy({} as Record<string, string>, {
  get: (_, prop: string) => {
    const key = prop === 'wind_fog' ? 'windFog' : prop;
    return t(`wizard.${key}`);
  },
});

export const LOADING_TIP_KEYS = [
  'loading.tip1',
  'loading.tip2',
  'loading.tip3',
  'loading.tip4',
  'loading.tip5',
  'loading.tip6',
  'loading.tip7',
  'loading.tip8',
];

export const getLoadingTips = (): string[] => {
  return LOADING_TIP_KEYS.map((k) => t(k));
};

export const LOADING_TIPS: string[] = new Proxy([] as string[], {
  get: (_, prop: string | symbol) => {
    const tips = getLoadingTips();
    if (prop === Symbol.iterator) {
      return tips[Symbol.iterator].bind(tips);
    }
    if (prop === 'length') return tips.length;
    if (typeof prop === 'string' && !isNaN(Number(prop))) {
      return tips[Number(prop)];
    }
    const val = (tips as any)[prop];
    return typeof val === 'function' ? val.bind(tips) : val;
  },
});
