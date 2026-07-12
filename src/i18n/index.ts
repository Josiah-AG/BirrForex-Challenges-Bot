/**
 * Internationalization (i18n) — Amharic + English support for DM flows
 * 
 * Usage: t(lang, 'key') or t(lang, 'key', { var1: 'value' })
 */

import { en } from './en';
import { am } from './am';

export type Lang = 'en' | 'am';

const translations: Record<Lang, Record<string, string>> = { en, am };

/**
 * Get a translated string. Supports {variable} interpolation.
 */
export function t(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const str = translations[lang]?.[key] || translations['en'][key] || key;
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}
