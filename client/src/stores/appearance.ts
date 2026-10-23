import { create } from 'zustand';
import { api } from '@/lib/api';
import { configureFormatting } from '@/lib/jalali';
import type { AppearanceSettings, PublicInfo } from '@/lib/types';

const DEFAULT_APPEARANCE: AppearanceSettings = {
  language: 'fa',
  calendar: 'jalali',
  timezone: 'Asia/Tehran',
  timeFormat: '24',
  theme: 'light',
  accentColor: 'blue',
};

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

interface AppearanceState {
  appearance: AppearanceSettings;
  loaded: boolean;
  load: () => Promise<void>;
  apply: (appearance: AppearanceSettings) => void;
}

function resolveTheme(theme: AppearanceSettings['theme']): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function setMetaThemeColor(theme: 'light' | 'dark'): void {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0b101b' : '#0f1729');
}

function applyToDocument(appearance: AppearanceSettings): void {
  const root = document.documentElement;
  const resolved = resolveTheme(appearance.theme);
  root.dataset.theme = resolved;
  root.dataset.accent = appearance.accentColor;
  root.lang = appearance.language === 'fa' ? 'fa' : 'en';
  root.dir = appearance.language === 'fa' ? 'rtl' : 'ltr';
  setMetaThemeColor(resolved);
  configureFormatting({
    language: appearance.language,
    calendar: appearance.calendar,
    timezone: appearance.timezone,
    timeFormat: appearance.timeFormat,
  });
}

/** ارقام را بر اساس زبان انتخاب‌شده به فارسی یا لاتین تبدیل می‌کند */
export function localizeDigits(input: string | number, language: 'fa' | 'en'): string {
  if (language === 'fa') {
    return String(input).replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)] ?? digit);
  }
  return String(input).replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)));
}

let systemListenerAttached = false;

export const useAppearance = create<AppearanceState>((set, get) => ({
  appearance: DEFAULT_APPEARANCE,
  loaded: false,

  apply: (appearance) => {
    applyToDocument(appearance);
    set({ appearance, loaded: true });
  },

  load: async () => {
    try {
      const info = await api.get<PublicInfo>('/api/public/info', { auth: false });
      const appearance = info.appearance ?? DEFAULT_APPEARANCE;
      get().apply(appearance);
      if (!systemListenerAttached && typeof window !== 'undefined' && window.matchMedia) {
        systemListenerAttached = true;
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
          const current = get().appearance;
          if (current.theme === 'system') applyToDocument(current);
        });
      }
    } catch {
      get().apply(DEFAULT_APPEARANCE);
    }
  },
}));
