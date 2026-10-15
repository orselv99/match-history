import { ko } from './locales/ko.ts';
import { en } from './locales/en.ts';

export type Language = 'ko' | 'en';

const STORAGE_KEY = 'apex_racing_language';

/**
 * 다국어(i18n) 시스템 전담 매니저
 * - 한국어(ko) / 영어(en) 사전 및 런타임 언어 실시간 전환 지원
 * - data-i18n, data-i18n-placeholder, data-i18n-title DOM 자동 바인딩
 * - localStorage 영구 보관 및 onLanguageChange 이벤트 발행
 */
export class I18nManager {
  private currentLanguage: Language = 'ko';
  private dictionaries = { ko, en };
  private listeners: Array<(lang: Language) => void> = [];

  constructor() {
    this.currentLanguage = this.loadLanguage();
  }

  private loadLanguage(): Language {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Language | null;
      if (saved === 'ko' || saved === 'en') {
        return saved;
      }
      if (typeof navigator !== 'undefined' && navigator.language) {
        return navigator.language.toLowerCase().startsWith('ko') ? 'ko' : 'en';
      }
    } catch {
      // Ignore
    }
    return 'ko';
  }

  public getLanguage(): Language {
    return this.currentLanguage;
  }

  public setLanguage(lang: Language): void {
    if (this.currentLanguage === lang) return;
    this.currentLanguage = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Ignore
    }
    this.applyToDOM();
    for (const listener of this.listeners) {
      listener(lang);
    }
  }

  public onLanguageChange(callback: (lang: Language) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  public t(key: string, params?: Record<string, string | number>): string {
    const dict = this.dictionaries[this.currentLanguage] || this.dictionaries.ko;
    const parts = key.split('.');
    let curr: any = dict;
    for (const part of parts) {
      if (curr && typeof curr === 'object' && part in curr) {
        curr = curr[part];
      } else {
        // Fallback to Korean if key is missing in target dictionary
        let fallback: any = this.dictionaries.ko;
        for (const p of parts) {
          if (fallback && typeof fallback === 'object' && p in fallback) {
            fallback = fallback[p];
          } else {
            return key;
          }
        }
        curr = fallback;
        break;
      }
    }

    if (typeof curr !== 'string') return key;

    let text = curr;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return text;
  }

  public applyToDOM(root?: HTMLElement | Document): void {
    if (typeof document === 'undefined') return;
    const target = root || document;

    // 1. 텍스트 컨텐츠 번역
    const textEls = target.querySelectorAll('[data-i18n]');
    textEls.forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (key) {
        el.textContent = this.t(key);
      }
    });

    // 2. Placeholder 속성 번역
    const placeholderEls = target.querySelectorAll('[data-i18n-placeholder]');
    placeholderEls.forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
        el.placeholder = this.t(key);
      }
    });

    // 3. Title 툴팁 속성 번역
    const titleEls = target.querySelectorAll('[data-i18n-title]');
    titleEls.forEach((el) => {
      const key = el.getAttribute('data-i18n-title');
      if (key && el instanceof HTMLElement) {
        el.title = this.t(key);
      }
    });
  }

  public init(): void {
    this.applyToDOM();
  }
}

export const i18nManager = new I18nManager();
export const t = (key: string, params?: Record<string, string | number>) => i18nManager.t(key, params);
