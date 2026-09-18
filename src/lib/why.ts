import type { Axes, Cafe, CafeDetail, Trait, TraitKind } from '../data/types'
import { ARCHETYPE_LABEL } from '../data/labels'
import unverified from '../data/unverified.json'
import type { LangMode, Pair } from './i18n'
import { hoursOn } from './details'
import { AXES, type Weights } from './match'
import { formatHour } from './palette'
import type { BlendedAxes } from './scoring'

/**
 * "Why this one?" — the sentence the compass owes every result. A rating list
 * says a café is good; the verdict says why it is right for *this* reader,
 * *now*, and is honest about the one thing that is not.
 */
export type Confidence = 'firm' | 'sketch'

/** Editorial cafés no external register confirmed (tools/verify_editorial.py). */
const UNVERIFIED: ReadonlySet<string> = new Set(unverified)

export type ReasonKind = 'axis' | 'trait' | 'context'

export interface Reason {
  kind: ReasonKind
  text: Pair
  axis?: keyof Axes
  trait?: TraitKind
  /** Where a trait reason was read (URL when web-sourced). */
  source?: string
}

export interface Why {
  headline: Pair
  reasons: Reason[]
  tradeoff: Pair | null
  confidence: Confidence
}

export interface WhyContext {
  /** Atlas hour, decimal (14.5 = 14:30). */
  hour: number
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number
  /** Walking minutes from the anchor, when one is set. */
  minutesAway?: number
  /** Name of the anchor the minutes are measured from. */
  anchorName?: Pair
  lang: LangMode
}

/** A slider miss this big is worth saying out loud. */
export const TRADEOFF_GAP = 22
/** A slider this close counts as a reason. */
export const MATCH_GAP = 12

const KEYS = AXES.map((a) => a.key)

type Side = 'low' | 'high'

/** How a café reads on each axis, as a clause that can sit in a headline. */
const HEADLINE_CLAUSE: Record<keyof Axes, Record<Side, Pair>> = {
  focus: {
    high: { en: 'quiet enough to work', zh: '安静能办公' },
    low: { en: 'made for talking', zh: '适合坐着聊' },
  },
  energy: {
    high: { en: 'a room with a pulse', zh: '有点热闹' },
    low: { en: 'hushed', zh: '够安静' },
  },
  linger: {
    high: { en: 'nobody hurries you', zh: '坐多久都行' },
    low: { en: 'in and out', zh: '喝完就走' },
  },
  adventure: {
    high: { en: 'beans worth talking about', zh: '豆子有话说' },
    low: { en: 'the classics done right', zh: '经典做得稳' },
  },
  spend: {
    high: { en: 'priced for an occasion', zh: '价位配得上场合' },
    low: { en: 'priced for every day', zh: '价位日常' },
  },
}

/** The short axis reason when the café has no `because` of its own. */
const AXIS_REASON: Record<keyof Axes, Record<Side | 'mid', Pair>> = {
  focus: {
    high: { en: 'laptops are normal here', zh: '带电脑很正常' },
    mid: { en: 'works for a chat or a laptop', zh: '聊天办公都行' },
    low: { en: 'a talking room, not a desk', zh: '是聊天的地方，不是书桌' },
  },
  energy: {
    high: { en: 'full and lively', zh: '人多，有气氛' },
    mid: { en: 'a steady hum, not a roar', zh: '有人声，不吵' },
    low: { en: 'near-library quiet', zh: '接近图书馆的安静' },
  },
  linger: {
    high: { en: 'settle in for the afternoon', zh: '一下午坐得住' },
    mid: { en: 'an hour sits comfortably', zh: '坐一小时刚好' },
    low: { en: 'built for a quick cup', zh: '为快喝一杯而设' },
  },
  adventure: {
    high: { en: 'the menu takes risks', zh: '菜单敢玩' },
    mid: { en: 'a few surprises beside the classics', zh: '经典之外有小惊喜' },
    low: { en: 'a proper flat white, no theatre', zh: '一杯扎实的澳白，不花哨' },
  },
  spend: {
    high: { en: 'a treat, priced like one', zh: '当犒劳自己，价格也是' },
    mid: { en: 'mid-range for the neighbourhood', zh: '这一带的中间价' },
    low: { en: 'easy on the wallet', zh: '对钱包友好' },
  },
}

/** The honest clause when the biggest miss is worth admitting. */
const TRADEOFF: Record<keyof Axes, Record<Side, Pair>> = {
  focus: {
    high: { en: 'More heads-down than you wanted', zh: '比你想的更像办公室' },
    low: { en: 'More of a talking room than you asked for', zh: '比你想的更适合聊天而非工作' },
  },
  energy: {
    high: { en: 'Louder than you asked for', zh: '比你想的热闹' },
    low: { en: 'Quieter than you asked for', zh: '比你想的安静' },
  },
  linger: {
    high: { en: 'Slower than you planned to be', zh: '比你打算的更慢' },
    low: { en: 'Not really a place to settle in', zh: '不太适合久坐' },
  },
  adventure: {
    high: { en: 'The cup is more adventurous than you set', zh: '杯子比你要的更冒险' },
    low: { en: 'Safer cup than you were after', zh: '杯子比你想的保守' },
  },
  spend: {
    high: { en: 'Pricier than you set', zh: '比你设的价位贵' },
    low: { en: 'Plainer than the splurge you wanted', zh: '没你想挥霍得那么讲究' },
  },
}

const AXIS_NAME: Record<keyof Axes, Pair> = Object.fromEntries(
  AXES.map((a) => [a.key, { en: a.label, zh: a.labelZh }]),
) as Record<keyof Axes, Pair>

/** Which dials a trait speaks to. `time` speaks to the clock instead. */
const TRAIT_AXES: Record<TraitKind, (keyof Axes)[]> = {
  space: ['linger', 'focus'],
  light: ['linger', 'focus'],
  view: ['linger', 'focus'],
  seating: ['linger', 'focus'],
  sound: ['energy', 'focus'],
  beans: ['adventure'],
  drinks: ['adventure'],
  food: ['linger'],
  people: ['energy'],
  time: [],
  story: [],
}

const side = (v: number): Side | 'mid' => (v >= 60 ? 'high' : v <= 40 ? 'low' : 'mid')

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const pair = (en: string, zh: string): Pair => ({ en, zh })

function haveOf(cafe: Cafe, blended: BlendedAxes | undefined, k: keyof Axes): number {
  return blended ? blended[k].value : cafe.axes[k]
}

function fallbackHeadline(cafe: Cafe): Pair {
  const arch = ARCHETYPE_LABEL[cafe.archetype]
  return pair(`${arch.en} on ${cafe.street.replace(/\s+\d+[-\d]*$/, '')}`, `${cafe.streetZh.replace(/\d+号.*$/, '')}的${arch.zh}`)
}

/**
 * Two best-matching decisive axes, as one sentence. Decisive means the café
 * itself sits clearly to one side (≥60 or ≤40); a middling value says nothing.
 */
function composeHeadline(
  cafe: Cafe,
  want: Axes,
  weights: Weights,
  blended: BlendedAxes | undefined,
): Pair {
  const picks = KEYS.map((k) => {
    const have = haveOf(cafe, blended, k)
    return { k, have, gap: Math.abs(have - want[k]), w: weights[k] }
  })
    .filter((p) => side(p.have) !== 'mid' && p.gap <= 20)
    .sort((a, b) => b.w * (100 - b.gap) - a.w * (100 - a.gap))
    .slice(0, 2)
  if (picks.length === 0) return fallbackHeadline(cafe)
  const en = picks.map((p) => HEADLINE_CLAUSE[p.k][side(p.have) as Side].en)
  const zh = picks.map((p) => HEADLINE_CLAUSE[p.k][side(p.have) as Side].zh)
  return pair(cap(en.join(', ')), zh.join('，'))
}

function walkText(minutes: number, anchor: Pair | undefined): Pair {
  const m = Math.max(1, Math.round(minutes))
  return anchor
    ? pair(`${m} min walk from ${anchor.en}`, `离${anchor.zh}步行 ${m} 分钟`)
    : pair(`${m} min walk from here`, `从这里走 ${m} 分钟`)
}

/** Open-hours context for the given moment; `urgent` when it is about to shut. */
function clockReason(cafe: Cafe, ctx: WhyContext): { reason: Reason; urgent: boolean } {
  const h = hoursOn(cafe, ctx.weekday)
  const close = h.close <= h.open ? h.close + 24 : h.close
  const now = ctx.hour < h.open ? ctx.hour + 24 : ctx.hour
  const ctxReason = (text: Pair, urgent = false) => ({ reason: { kind: 'context' as const, text }, urgent })
  if (now < h.open || now >= close) {
    if (ctx.hour < h.open) {
      return ctxReason(pair(`Opens at ${formatHour(h.open)}`, `${formatHour(h.open)} 开门`))
    }
    return ctxReason(pair('Closed for the day', '今天已打烊'))
  }
  const left = Math.round((close - now) * 60)
  if (left <= 45) {
    return ctxReason(pair(`Closes in ${left} min`, `${left} 分钟后打烊`), true)
  }
  const night = close >= 21
  return ctxReason(
    pair(
      `Open till ${formatHour(h.close % 24)} ${night ? 'tonight' : 'today'}`,
      `${night ? '今晚' : '今天'}开到 ${formatHour(h.close % 24)}`,
    ),
  )
}

export function explain(
  cafe: Cafe,
  want: Axes,
  weights: Weights,
  blended: BlendedAxes | undefined,
  detail: CafeDetail,
  ctx: WhyContext,
): Why {
  const hasDetail = detail.traits.length > 0 || Boolean(detail.headline)
  const unchecked = cafe.source === 'imported' || UNVERIFIED.has(cafe.id)
  const confidence: Confidence = !hasDetail && unchecked ? 'sketch' : 'firm'

  const headline = detail.headline ?? composeHeadline(cafe, want, weights, blended)

  // (a) dials that agree, best contribution first.
  const axisReasons: Reason[] = KEYS.map((k) => {
    const have = haveOf(cafe, blended, k)
    return { k, have, gap: Math.abs(have - want[k]), w: weights[k] }
  })
    .filter((p) => p.gap <= MATCH_GAP && p.w > 0.5)
    .sort((a, b) => b.w * (MATCH_GAP - b.gap) - a.w * (MATCH_GAP - a.gap))
    .map((p) => {
      const hint = detail.axisHints?.[p.k]
      const name = AXIS_NAME[p.k]
      const body = hint
        ? pair(hint.because, hint.becauseZh)
        : AXIS_REASON[p.k][side(p.have)]
      return {
        kind: 'axis' as const,
        axis: p.k,
        text: pair(`${name.en} · ${body.en}`, `${name.zh} · ${body.zh}`),
      }
    })

  // (b) firm traits that speak to the dials this scenario cares about.
  const relevant = (t: Trait) => {
    if (t.kind === 'time') return true
    const axes = TRAIT_AXES[t.kind]
    return axes.length === 0 || axes.some((k) => weights[k] > 0.5)
  }
  const traitReasons: Reason[] = detail.traits
    .filter((t) => t.confidence >= 0.5)
    .sort((a, b) => Number(relevant(b)) - Number(relevant(a)) || b.confidence - a.confidence)
    .slice(0, 2)
    .map((t) => ({ kind: 'trait' as const, trait: t.kind, text: pair(t.text, t.textZh), source: t.source }))

  // (c) the clock and the walk.
  const clock = clockReason(cafe, ctx)
  const walk: Reason | undefined =
    ctx.minutesAway !== undefined
      ? { kind: 'context', text: walkText(ctx.minutesAway, ctx.anchorName) }
      : undefined
  const contextReasons: Reason[] = (
    clock.urgent ? [clock.reason, walk] : [walk, clock.reason]
  ).filter((r): r is Reason => Boolean(r))

  const reasons: Reason[] = []
  const take = (r: Reason | undefined) => {
    if (r && reasons.length < 3) reasons.push(r)
  }
  take(axisReasons[0])
  take(traitReasons[0])
  take(contextReasons[0])
  take(axisReasons[1])
  take(traitReasons[1])
  take(contextReasons[1])
  take(axisReasons[2])

  // The one honest miss.
  let tradeoff: Pair | null = null
  let worst = TRADEOFF_GAP
  for (const k of KEYS) {
    if (weights[k] <= 0.5) continue
    const have = haveOf(cafe, blended, k)
    const gap = Math.abs(have - want[k])
    if (gap > worst) {
      worst = gap
      tradeoff = TRADEOFF[k][have > want[k] ? 'high' : 'low']
    }
  }

  return { headline, reasons, tradeoff, confidence }
}

/** 0 = Sunday … 6 = Saturday, Shanghai time. */
export function shanghaiWeekday(now = new Date()): number {
  const utc = now.getTime() + now.getTimezoneOffset() * 60000
  return new Date(utc + 8 * 3600000).getDay()
}

/** Anchored rankings care about what is walkable; this is the line we draw. */
export const WALK_LIMIT_MIN = 20
/** A match this high is a room that "fits" (the 'Very close' tier of scoreVerdict). */
export const FIT_SCORE = 84

export interface SaysInput {
  compassOn: boolean
  scenario: Pair | null
  anchor: Pair | null
  hour: number
  results: { cafe: Cafe; score: number; minutes?: number }[]
}

/**
 * The one-line answer above the results — the compass talking back:
 * "For 赶稿两小时 near 陕西南路 at 14:30: 3 rooms fit within 20 min, best is X — 8 min walk".
 */
export function compassSays(input: SaysInput): Pair {
  const { compassOn, scenario, anchor, hour, results } = input
  if (!compassOn) {
    return pair(
      'Pick a scenario above or drag a dial to get recommendations.',
      '点上面的场景，或拖动滑杆，就会出现推荐。',
    )
  }
  const clock = formatHour(hour)
  const forEn = scenario ? `For ${scenario.en}` : 'For your compass'
  const forZh = scenario ? scenario.zh : '按你的罗盘'
  const whereEn = anchor ? ` near ${anchor.en}` : ''
  const whereZh = anchor ? ` · ${anchor.zh}附近` : ''
  const head = pair(`${forEn}${whereEn}, open at ${clock}: `, `${forZh}${whereZh} · ${clock} 营业中：`)

  if (results.length === 0) {
    return pair(
      `${head.en}nothing is open that also passes your filters. Move the time bar or loosen a filter.`,
      `${head.zh}没有符合条件且在营业的店。拖动时间条，或放宽筛选。`,
    )
  }
  const pool = anchor
    ? results.filter((r) => (r.minutes ?? Infinity) <= WALK_LIMIT_MIN)
    : results
  if (pool.length === 0) {
    const b = results[0]
    const m = Math.max(1, b.minutes ?? 0)
    return pair(
      `${head.en}nothing within ${WALK_LIMIT_MIN} min; nearest fit is ${b.cafe.name} — ${m} min walk.`,
      `${head.zh}${WALK_LIMIT_MIN} 分钟步行内没有；最近的合适是 ${b.cafe.nameZh}，走 ${m} 分钟。`,
    )
  }
  const fits = pool.filter((r) => r.score >= FIT_SCORE).length
  const best = pool[0]
  const walk = anchor && best.minutes !== undefined ? ` — ${Math.max(1, best.minutes)} min walk` : ''
  const walkZh = anchor && best.minutes !== undefined ? `，走 ${Math.max(1, best.minutes)} 分钟` : ''
  const scopeEn = anchor ? ` within ${WALK_LIMIT_MIN} min` : ''
  const scopeZh = anchor ? `${WALK_LIMIT_MIN} 分钟步行内` : '全城'
  const roomsEn =
    fits === 0
      ? `no strong match${scopeEn}; closest is`
      : `${fits} good ${fits === 1 ? 'match' : 'matches'}${scopeEn}, best is`
  const roomsZh = fits === 0 ? `${scopeZh}没有很合适的，最接近的是` : `${scopeZh}有 ${fits} 家合适，首选`
  return pair(
    `${head.en}${roomsEn} ${best.cafe.name}${walk}.`,
    `${head.zh}${roomsZh} ${best.cafe.nameZh}${walkZh}。`,
  )
}

/** Per-axis want vs have, for the five-bar fingerprint. */
export function fingerprint(
  cafe: Cafe,
  want: Axes,
  blended: BlendedAxes | undefined,
): { key: keyof Axes; want: number; have: number }[] {
  return KEYS.map((k) => ({ key: k, want: want[k], have: haveOf(cafe, blended, k) }))
}
