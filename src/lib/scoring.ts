import type {
  Axes,
  AxisEvidence,
  AxisHint,
  AxisSource,
  Cafe,
  DianpingSignals,
} from '../data/types'
import dianpingRaw from '../data/dianping.json'
import { detailFor } from './details'

/**
 * The blend behind every axis (the “?” page explains this in prose).
 *
 *   axis = (w_e·(1−c_h)·E + w_h·c_h·H + w_u·ū·n/(n+k))
 *        / (w_e·(1−c_h) + w_h·c_h + w_u·n/(n+k))
 *
 * E — editorial prior (the curated value in `cafe.axes`), a considered
 *     guess and nothing more; it is never dressed up as measurement. Its
 *     weight fades as evidence firms up — a guess should not keep pulling a
 *     café back to the middle once three readings agree on where it sits.
 * H/c_h — the evidence hint for that axis and its confidence, derived
 *     offline by tools/axis_evidence.py from checkable readings only:
 *     structured photo facts (people on laptops, a stand-up bar, a roaster),
 *     quoted public snippets, and listed prices (Amap / Dianping 人均, menu
 *     prices in photos). Its weight scales with c_h, so a lone reading
 *     nudges and three agreeing ones decide. No hint → the prior stands.
 * ū/n — mean and count of reader votes, shrunk by k so one loud opinion
 *     cannot move a café but five consistent ones can.
 */
export const W_EDITORIAL = 1
export const W_EVIDENCE = 3
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

/** Per-café reader votes, keyed by axis. */
export type CafeVotes = Partial<Record<keyof Axes, AxisVotes>>

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
 * confidence ink, never to move an axis.
 */
export function dianpingTrust(dp: DianpingSignals | undefined): number {
  if (!dp || typeof dp.rating !== 'number' || dp.rating <= 0) return 0
  const count = parseCountText(dp.reviewCountText) || parseCountText(dp.picCountStr)
  if (count <= 0) return 0
  const volume = Math.min(1, Math.log10(count + 1) / 4.5)
  return Math.round((dp.rating / 5) * volume * 100) / 100
}

const clamp = (v: number) => Math.max(0, Math.min(100, v))

/** Which tier of evidence a hint rests on: listed numbers are measured, photos and pages observed. */
export function hintSources(hint: AxisHint): AxisSource[] {
  const kinds = hint.sources ?? ['photo']
  const out: AxisSource[] = []
  if (kinds.some((k) => k === 'amap' || k === 'dianping')) out.push('measured')
  if (kinds.some((k) => k === 'photo' || k === 'web' || k === 'osm')) out.push('observed')
  return out.length ? out : ['observed']
}

/** Blend one axis. Pure — this is the formula on the “?” page, verbatim. */
export function blendAxis(
  editorial: number,
  hint: AxisHint | undefined,
  votes: AxisVotes | undefined,
  editorialConfidence = 0.35,
  trust = 0,
): AxisEvidence {
  const n = votes && votes.count > 0 ? votes.count : 0
  const shrink = n / (n + SHRINK_K)
  const hc = hint ? Math.max(0, Math.min(1, hint.confidence)) : 0

  const we = W_EDITORIAL * (1 - hc)
  let num = we * editorial
  let den = we
  if (hint && hc > 0) {
    num += W_EVIDENCE * hc * hint.value
    den += W_EVIDENCE * hc
  }
  if (n > 0 && votes) {
    num += W_VOTES * votes.mean * shrink
    den += W_VOTES * shrink
  }

  const sources: AxisSource[] = ['editorial']
  if (hint && hc > 0) sources.push(...hintSources(hint))
  if (n > 0) sources.push('voted')

  // Confidence by tier: the prior alone is a guess (an imported one even
  // more so); evidence closes the gap in proportion to its own confidence;
  // votes close what remains asymptotically as n grows.
  let base = editorialConfidence
  if (hc > 0) base += (1 - base) * hc
  let confidence = base + (1 - base) * shrink
  // External trust (Dianping rating × review volume) deepens the ink a
  // little — corroboration, not a new opinion about any axis.
  if (trust > 0) confidence += (1 - confidence) * 0.25 * trust

  const out: AxisEvidence = {
    value: clamp(Math.round(num / den)),
    confidence: Math.round(confidence * 100) / 100,
    sources,
  }
  if (hint && hc > 0) {
    out.because = hint.because
    out.becauseZh = hint.becauseZh
  }
  return out
}

export type BlendedAxes = Record<keyof Axes, AxisEvidence>

export function blendCafe(cafe: Cafe, votes?: CafeVotes): BlendedAxes {
  const trust = dianpingTrust(dianpingFor(cafe))
  const hints = detailFor(cafe).axisHints
  const out = {} as BlendedAxes
  for (const key of AXIS_KEYS) {
    // A published AxisEvidence on the café (importer priors carry one with
    // low confidence) is the editorial term; evidence and votes blend on top.
    const published = cafe.evidence?.axes?.[key]
    out[key] = blendAxis(
      published?.value ?? cafe.axes[key],
      hints?.[key],
      votes?.[key],
      published?.confidence ?? 0.35,
      trust,
    )
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
  const out = new Map<string, BlendedAxes>()
  for (const cafe of cafes) out.set(cafe.id, blendCafe(cafe, votesByCafe?.get(cafe.id)))
  if (!votesByCafe) blendMemo.set(cafes, out)
  return out
}
