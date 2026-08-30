import type { Axes, Cafe, Tag } from '../data/types'
import { blendAll, type BlendedAxes, type CafeVotes } from './scoring'

/**
 * The compass. Five axes, each a spectrum rather than a checkbox, because the
 * real question is never "does it have wifi" — it is "what do I want the next
 * ninety minutes to feel like".
 */
export interface AxisDef {
  key: keyof Axes
  label: string
  labelZh: string
  low: string
  high: string
}

export const AXES: AxisDef[] = [
  {
    key: 'focus',
    label: 'Head down',
    labelZh: '专注',
    low: 'Here to talk',
    high: 'Here to work',
  },
  {
    key: 'energy',
    label: 'Room energy',
    labelZh: '气氛',
    low: 'Library hush',
    high: 'Loud and full',
  },
  {
    key: 'linger',
    label: 'Time',
    labelZh: '停留',
    low: 'Drink and go',
    high: 'Stay for hours',
  },
  {
    key: 'adventure',
    label: 'Cup',
    labelZh: '风味',
    low: 'Perfect flat white',
    high: 'Surprise me',
  },
  {
    key: 'spend',
    label: 'Spend',
    labelZh: '价位',
    low: 'Everyday money',
    high: 'Worth the splurge',
  },
]

export const NEUTRAL: Axes = {
  focus: 50,
  energy: 50,
  linger: 50,
  adventure: 50,
  spend: 50,
}

export interface Weights {
  focus: number
  energy: number
  linger: number
  adventure: number
  spend: number
}

export const EVEN_WEIGHTS: Weights = {
  focus: 1,
  energy: 1,
  linger: 1,
  adventure: 1,
  spend: 1,
}

export interface Filters {
  districts: string[]
  tags: Tag[]
  openAt: number | null
  maxPrice: 1 | 2 | 3 | null
  query: string
}

export const EMPTY_FILTERS: Filters = {
  districts: [],
  tags: [],
  openAt: null,
  maxPrice: null,
  query: '',
}

/** Lowercase and drop spaces/punctuation so “% Arabica” matches “arabica”. */
export function normalizeQuery(s: string): string {
  return s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
}

const hayCache = new WeakMap<Cafe, string>()

export function searchHay(cafe: Cafe): string {
  let hay = hayCache.get(cafe)
  if (hay === undefined) {
    hay = normalizeQuery(
      `${cafe.name} ${cafe.nameZh} ${cafe.street} ${cafe.streetZh} ${cafe.hood} ${cafe.district} ${cafe.signature}`,
    )
    hayCache.set(cafe, hay)
  }
  return hay
}

export function isOpenAt(cafe: Cafe, hour: number): boolean {
  const close = cafe.closes <= cafe.opens ? cafe.closes + 24 : cafe.closes
  const h = hour < cafe.opens ? hour + 24 : hour
  return h >= cafe.opens && h < close
}

export function passesFilters(cafe: Cafe, f: Filters): boolean {
  if (f.districts.length && !f.districts.includes(cafe.district)) return false
  if (f.tags.length && !f.tags.every((t) => cafe.tags.includes(t))) return false
  if (f.maxPrice !== null && cafe.price > f.maxPrice) return false
  if (f.openAt !== null && !isOpenAt(cafe, f.openAt)) return false
  if (f.query.trim()) {
    const q = normalizeQuery(f.query)
    const hay = searchHay(cafe)
    if (!hay.includes(q)) return false
  }
  return true
}

/**
 * 0–100. Distance on each axis is stretched rather than squashed: a small miss
 * has to cost something, or every café in the city sits in the nineties and the
 * compass feels dead.
 */
export function matchScore(
  cafe: Cafe,
  want: Axes,
  weights: Weights = EVEN_WEIGHTS,
  blended?: BlendedAxes,
): number {
  let total = 0
  let used = 0
  for (const { key } of AXES) {
    const w = weights[key]
    if (w <= 0) continue
    const v = blended?.[key]?.value ?? cafe.axes[key]
    const d = Math.abs(v - want[key]) / 100
    total += w * (1 - d ** 0.72)
    used += w
  }
  if (!used) return 50
  return Math.round(Math.max(0, Math.min(1, total / used)) * 100)
}

export interface Ranked {
  cafe: Cafe
  score: number
}

let blendCacheCafes: Cafe[] | null = null
let blendCacheVotes: ReadonlyMap<string, CafeVotes> | undefined
let blendCache: Map<string, BlendedAxes> | null = null

/**
 * blendAll is pure in (cafes, votes) and both are referentially stable in the
 * app, so one cached result survives an entire slider drag.
 */
export function blendAllMemo(
  cafes: Cafe[],
  votes?: ReadonlyMap<string, CafeVotes>,
): Map<string, BlendedAxes> {
  if (!blendCache || blendCacheCafes !== cafes || blendCacheVotes !== votes) {
    blendCache = blendAll(cafes, votes)
    blendCacheCafes = cafes
    blendCacheVotes = votes
  }
  return blendCache
}

export function rank(
  cafes: Cafe[],
  want: Axes,
  filters: Filters,
  weights?: Weights,
  votes?: ReadonlyMap<string, CafeVotes>,
): Ranked[] {
  const blends = blendAllMemo(cafes, votes)
  return cafes
    .filter((c) => passesFilters(c, filters))
    .map((cafe) => ({ cafe, score: matchScore(cafe, want, weights, blends.get(cafe.id)) }))
    .sort((a, b) => b.score - a.score || a.cafe.name.localeCompare(b.cafe.name))
}

export function scoreVerdict(score: number): string {
  if (score >= 92) return 'Made for this'
  if (score >= 84) return 'Very close'
  if (score >= 74) return 'Good call'
  if (score >= 62) return 'Worth a look'
  return 'Different mood'
}
