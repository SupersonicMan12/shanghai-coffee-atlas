import { createContext, useContext } from 'react'

/**
 * Three reading modes, one sheet. `both` keeps the bilingual editorial layout,
 * `en` hides the Chinese asides, `zh` turns the whole interface Chinese.
 */
export type LangMode = 'both' | 'en' | 'zh'

export interface Pair {
  en: string
  zh: string
}

export interface I18n {
  mode: LangMode
  /** The primary string for the current mode. */
  t: (p: Pair) => string
  /** The small companion string (the `.zh` aside), or null when it would repeat. */
  sub: (p: Pair) => string | null
}

export const I18nContext = createContext<I18n>({
  mode: 'both',
  t: (p) => p.en,
  sub: (p) => p.zh,
})

export function makeI18n(mode: LangMode): I18n {
  return {
    mode,
    t: (p) => (mode === 'zh' ? p.zh : p.en),
    sub: (p) => (mode === 'both' ? p.zh : null),
  }
}

export function useI18n(): I18n {
  return useContext(I18nContext)
}

export const LANG_KEY = 'shca.lang.v1'

export function readStoredLang(): LangMode | null {
  try {
    const v = localStorage.getItem(LANG_KEY)
    return v === 'both' || v === 'en' || v === 'zh' ? v : null
  } catch {
    return null
  }
}

export function storeLang(mode: LangMode) {
  try {
    localStorage.setItem(LANG_KEY, mode)
  } catch {
    // private browsing — the atlas still works, it just forgets
  }
}
