import type {
  Axes,
  AxisEvidence,
  AxisSource,
  Cafe,
  DianpingSignals,
} from '../data/types'
import dianpingRaw from '../data/dianping.json'

/**
 * The Bayesian blend behind every axis (the “?” page explains this in prose).
 *
 *   axis = (w_e·E + w_s·S + w_u·ū·n/(n+k)) / (w_e + w_s·1[S] + w_u·n/(n+k))
 *
 * E — editorial prior (the curated value in `cafe.axes`).
 * S — structured-signal estimate from measurable proxies, only when a real
 *     proxy exists for that axis on that café.
 * ū/n — mean and count of reader votes, shrunk by k so one loud opinion
 *     cannot move a café but five consistent ones can.
 */
export const W_EDITORIAL = 1
export const W_STRUCTURED = 2
export const W_VOTES = 3
export const SHRINK_K = 5

export const AXIS_KEYS: (keyof Axes)[] = [
  'focus',
  'energy',
  'linger',
  'adventure',
  'spend',
]

export interface AxisVotes {
  /** Mean of reader votes on this axis, 0..100. */
  mean: number
  /** Number of votes behind the mean. */
  count: number
}

/** Per-café reader votes, keyed by axis. Workstream 4's widget feeds this. */
export type CafeVotes = Partial<Record<keyof Axes, AxisVotes>>

/** Dataset-level context needed for signals that are relative, not absolute. */
export interface DatasetContext {
  /** Sorted 人均 costs (RMB) across every café that has an Amap cost. */
  costsSorted: number[]
  /** Sorted Dianping 人均 prices (RMB) across every café that has one. */
  dpPricesSorted?: number[]
}

const DIANPING: Record<string, DianpingSignals> = dianpingRaw

/** Dianping signals for a café — inline evidence first, dataset file second. */
export function dianpingFor(cafe: Cafe): DianpingSignals | undefined {
  return cafe.evidence?.dianping ?? DIANPING[cafe.id]
}

/** Parse a Dianping display count (“8549”, “4万+”, “1.2万”) into a number. */
export function parseCountText(text: string | undefined): number {
  if (!text) return 0
  const m = /([\d.]+)(万)?/.exec(text)
  if (!m) return 0
  const n = parseFloat(m[1])
  if (Number.isNaN(n)) return 0
  return Math.round(m[2] ? n * 10000 : n)
}

/**
 * Trust in a café's Dianping presence, 0..1 — rating quality scaled by how
 * many reviews (or, failing that, photos) stand behind it. Used to deepen
 * confidence ink, never to move an axis directly.
 */
export function dianpingTrust(dp: DianpingSignals | undefined): number {
  if (!dp || typeof dp.rating !== 'number' || dp.rating <= 0) return 0
  const count = parseCountText(dp.reviewCountText) || parseCountText(dp.picCountStr)
  if (count <= 0) return 0
  const volume = Math.min(1, Math.log10(count + 1) / 4.5)
  return Math.round((dp.rating / 5) * volume * 100) / 100
}

export function buildContext(cafes: readonly Cafe[]): DatasetContext {
  const costs = cafes
    .map((c) => c.evidence?.amap?.cost)
    .filter((v): v is number => typeof v === 'number' && v > 0)
    .sort((a, b) => a - b)
  const dpPrices = cafes
    .map((c) => dianpingFor(c)?.avgPrice)
    .filter((v): v is number => typeof v === 'number' && v > 0)
    .sort((a, b) => a - b)
  return { costsSorted: costs, dpPricesSorted: dpPrices }
}

const clamp = (v: number) => Math.max(0, Math.min(100, v))

function openSpan(cafe: Cafe): number {
  return cafe.closes <= cafe.opens
    ? cafe.closes + 24 - cafe.opens
    : cafe.closes - cafe.opens
}

/** Percentile rank (0..1) of `value` within a sorted sample, ties split. */
export function percentile(sorted: number[], value: number): number {
  if (!sorted.length) return 0.5
  let below = 0
  let equal = 0
  for (const v of sorted) {
    if (v < value) below++
    else if (v === value) equal++
  }
  return (below + equal / 2) / sorted.length
}

/**
 * Structured-signal estimates. Each axis only gets an S when something
 * measurable actually speaks to it — silence is honest, not zero.
 */
export function structuredSignals(
  cafe: Cafe,
  ctx: DatasetContext,
): Partial<Axes> {
  const s: Partial<Axes> = {}
  const tags = new Set(cafe.tags)
  const span = openSpan(cafe)

  // spend ← 人均 mapped through the dataset's price quantiles, averaging the
  // Amap and Dianping estimates when both speak.
  {
    const estimates: number[] = []
    const cost = cafe.evidence?.amap?.cost
    if (typeof cost === 'number' && cost > 0 && ctx.costsSorted.length >= 5) {
      estimates.push(percentile(ctx.costsSorted, cost) * 100)
    }
    const dpPrice = dianpingFor(cafe)?.avgPrice
    const dpSorted = ctx.dpPricesSorted ?? []
    if (typeof dpPrice === 'number' && dpPrice > 0 && dpSorted.length >= 5) {
      estimates.push(percentile(dpSorted, dpPrice) * 100)
    }
    if (estimates.length) {
      s.spend = clamp(
        Math.round(estimates.reduce((a, b) => a + b, 0) / estimates.length),
      )
    }
  }

  // linger ← seats + opening span + archetype. A standing bar caps linger:
  // there is nothing to settle into.
  {
    let v =
      cafe.seats === 0
        ? 10
        : cafe.seats <= 8
          ? 28
          : cafe.seats <= 20
            ? 46
            : cafe.seats <= 40
              ? 62
              : cafe.seats <= 70
                ? 74
                : 84
    if (span >= 14) v += 8
    else if (span <= 9) v -= 8
    if (['garden', 'lane-house', 'gallery', 'riverside'].includes(cafe.archetype)) v += 6
    if (cafe.archetype === 'standing-bar') v = Math.min(v, 25)
    s.linger = clamp(Math.round(v))
  }

  // focus ← seats class + explicit tag evidence. Only when the tags (or a
  // seatless room) actually say something about working here.
  if (
    tags.has('laptop-welcome') ||
    tags.has('no-laptops') ||
    tags.has('books') ||
    cafe.seats === 0
  ) {
    let v =
      cafe.seats === 0 ? 15 : cafe.seats >= 30 ? 55 : cafe.seats >= 12 ? 50 : 40
    if (tags.has('laptop-welcome')) v += 25
    if (tags.has('books')) v += 15
    if (tags.has('no-laptops')) v -= 30
    if (tags.has('standing-only')) v -= 20
    s.focus = clamp(Math.round(v))
  }

  // energy ← archetype + tags + opening span.
  {
    const base: Record<Cafe['archetype'], number> = {
      'standing-bar': 55,
      'lane-house': 45,
      roastery: 50,
      garden: 68,
      laboratory: 40,
      gallery: 45,
      riverside: 58,
      neighborhood: 50,
      bakery: 60,
      'hidden-door': 30,
    }
    let v = base[cafe.archetype]
    if (tags.has('late')) v += 8
    if (tags.has('outdoor')) v += 6
    if (tags.has('books')) v -= 12
    if (tags.has('no-laptops')) v += 5
    if (span >= 14) v += 5
    // A mild popularity nudge: a heavily-reviewed, well-rated room runs a
    // little hotter than its architecture alone suggests.
    const trust = dianpingTrust(dianpingFor(cafe))
    if (trust > 0) v += Math.round((trust - 0.5) * 12)
    s.energy = clamp(Math.round(v))
  }

  // adventure ← menu signals + archetype. Omitted when the menu is silent.
  {
    let v = 35
    let spoke = false
    if (tags.has('single-origin')) {
      v += 20
      spoke = true
    }
    if (tags.has('own-roast')) {
      v += 15
      spoke = true
    }
    if (tags.has('natural-wine')) {
      v += 12
      spoke = true
    }
    if (tags.has('matcha')) {
      v += 8
      spoke = true
    }
    if (cafe.archetype === 'laboratory') {
      v += 25
      spoke = true
    }
    if (cafe.archetype === 'roastery') {
      v += 12
      spoke = true
    }
    if (spoke) s.adventure = clamp(Math.round(v))
  }

  return s
}

/** Blend one axis. Pure — this is the formula on the “?” page, verbatim. */
export function blendAxis(
  editorial: number,
  structured: number | undefined,
  votes: AxisVotes | undefined,
  trust = 0,
): AxisEvidence {
  const n = votes && votes.count > 0 ? votes.count : 0
  const shrink = n / (n + SHRINK_K)
  const hasS = typeof structured === 'number'

  let num = W_EDITORIAL * editorial
  let den = W_EDITORIAL
  if (hasS) {
    num += W_STRUCTURED * structured
    den += W_STRUCTURED
  }
  if (n > 0 && votes) {
    num += W_VOTES * votes.mean * shrink
    den += W_VOTES * shrink
  }

  const sources: AxisSource[] = ['editorial']
  if (hasS) sources.push('measured')
  if (n > 0) sources.push('voted')

  // Confidence by evidence tier: editorial alone is a considered guess,
  // structure roughly doubles it, votes close the remaining gap
  // asymptotically as n grows.
  const base = hasS ? 0.7 : 0.35
  let confidence = base + (1 - base) * shrink
  // External trust (Dianping rating × review volume) deepens the ink a
  // little — corroboration, not a new opinion about any axis.
  if (trust > 0) confidence += (1 - confidence) * 0.25 * trust

  return {
    value: clamp(Math.round(num / den)),
    confidence: Math.round(confidence * 100) / 100,
    sources,
  }
}

export type BlendedAxes = Record<keyof Axes, AxisEvidence>

export function blendCafe(
  cafe: Cafe,
  ctx: DatasetContext,
  votes?: CafeVotes,
): BlendedAxes {
  const s = structuredSignals(cafe, ctx)
  const trust = dianpingTrust(dianpingFor(cafe))
  const out = {} as BlendedAxes
  for (const key of AXIS_KEYS) {
    // If workstream 1 already published a blended AxisEvidence on the café,
    // trust it — the data pipeline saw evidence we cannot recompute here.
    const published = cafe.evidence?.axes?.[key]
    out[key] =
      published ?? blendAxis(cafe.axes[key], s[key], votes?.[key], trust)
  }
  return out
}

const blendMemo = new WeakMap<readonly Cafe[], Map<string, BlendedAxes>>()

/**
 * Blend a whole dataset, memoized on the array identity. Votes invalidate
 * the memo (pass a fresh map when they change).
 */
export function blendAll(
  cafes: readonly Cafe[],
  votesByCafe?: ReadonlyMap<string, CafeVotes>,
): Map<string, BlendedAxes> {
  if (!votesByCafe) {
    const hit = blendMemo.get(cafes)
    if (hit) return hit
  }
  const ctx = buildContext(cafes)
  const out = new Map<string, BlendedAxes>()
  for (const cafe of cafes) out.set(cafe.id, blendCafe(cafe, ctx, votesByCafe?.get(cafe.id)))
  if (!votesByCafe) blendMemo.set(cafes, out)
  return out
}
