import type { Cafe } from '../data/types'
import type { LangMode } from './i18n'

export function isPinyinName(name: string): boolean {
  return /^[A-Z][a-z]{11,}(\s*\(.*\))?$/.test(name)
}

export function displayNames(
  cafe: Pick<Cafe, 'name' | 'nameZh'>,
  mode: LangMode,
): { primary: string; secondary: string | null } {
  const pinyin = isPinyinName(cafe.name)
  let primary: string
  let secondary: string | null
  if (mode === 'zh') {
    primary = cafe.nameZh
    secondary = pinyin ? null : cafe.name
  } else if (pinyin) {
    primary = cafe.nameZh
    secondary = null
  } else {
    primary = cafe.name
    secondary = mode === 'both' ? cafe.nameZh : null
  }
  return { primary, secondary: secondary === primary ? null : secondary }
}
