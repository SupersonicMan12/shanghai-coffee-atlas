import type { Axes, Cafe } from '../data/types'
import type { Pair } from './i18n'
import type { Weights } from './match'
import type { PhaseId } from './palette'

/**
 * A scenario is the whole compass set in one tap: "the next hour is for
 * this". Each carries a preset for the five dials, a weight per axis (which
 * dials actually decide the situation; the rest fade to SOFT), an optional
 * hard filter, and the hours of the day it tends to belong to.
 */
export interface ScenarioFilter {
  /** Must be open right now (resolved against the atlas hour). */
  openNow?: boolean
  /** Opens at or before this hour (decimal), e.g. 8.5. */
  opensBy?: number
  /** Still open at this hour (decimal), e.g. 21.5. */
  openUntil?: number
  maxPrice?: 1 | 2 | 3
  /** Only cafés the atlas has field-checked (no `source: 'imported'`). */
  curatedOnly?: boolean
}

export interface Scenario {
  id: string
  /** Short name, as it reads on a chip. */
  name: Pair
  /** One line: what the scenario promises. */
  promise: Pair
  axes: Axes
  weights: Weights
  filter?: ScenarioFilter
  /** Hours of the day this is usually asked. Used to order the chips. */
  phases: PhaseId[]
}

/** Weight of an axis that does not decide the scenario. */
export const SOFT = 0.35

const w = (over: Partial<Weights>): Weights => ({
  focus: SOFT,
  energy: SOFT,
  linger: SOFT,
  adventure: SOFT,
  spend: SOFT,
  ...over,
})

export const SCENARIOS: Scenario[] = [
  {
    id: 'deadline',
    name: { en: 'Deadline', zh: '赶稿两小时' },
    promise: {
      en: 'Two hours, head down, nobody bothering you.',
      zh: '两小时埋头干活，没人来打扰。',
    },
    axes: { focus: 90, energy: 25, linger: 85, adventure: 35, spend: 40 },
    weights: w({ focus: 1, energy: 1, linger: 1 }),
    phases: ['morning', 'afternoon'],
  },
  {
    id: 'first-date',
    name: { en: 'First date', zh: '第一次约会' },
    promise: {
      en: 'Easy to talk, nice to look at, a menu worth a comment.',
      zh: '好聊、好看、菜单有话题。',
    },
    axes: { focus: 20, energy: 45, linger: 65, adventure: 60, spend: 65 },
    weights: w({ focus: 1, energy: 1, adventure: 1, spend: 1 }),
    phases: ['afternoon', 'dusk'],
  },
  {
    id: 'sunday-drift',
    name: { en: 'Sunday drift', zh: '周末发呆' },
    promise: {
      en: 'A second cup, a slow room, no plan at all.',
      zh: '第二杯，慢房间，什么都不安排。',
    },
    axes: { focus: 35, energy: 30, linger: 90, adventure: 45, spend: 45 },
    weights: w({ linger: 1, energy: 1, focus: 0.6 }),
    phases: ['morning', 'afternoon'],
  },
  {
    id: 'talk-business',
    name: { en: 'Talk business', zh: '谈事' },
    promise: {
      en: 'Quiet enough to hear, serious enough to be taken seriously.',
      zh: '安静得听得清，体面得撑得住场。',
    },
    axes: { focus: 40, energy: 35, linger: 55, adventure: 30, spend: 60 },
    weights: w({ focus: 1, energy: 1, spend: 1, linger: 0.5 }),
    phases: ['morning', 'afternoon'],
  },
  {
    id: 'first-cup',
    name: { en: 'First cup, early', zh: '早起第一杯' },
    promise: {
      en: 'Open before 8:30, quick, cheap, done well.',
      zh: '八点半前开门，快、便宜、出品稳。',
    },
    axes: { focus: 30, energy: 45, linger: 20, adventure: 50, spend: 30 },
    weights: w({ linger: 1, spend: 1, adventure: 0.8 }),
    filter: { opensBy: 8.5 },
    phases: ['dawn', 'morning'],
  },
  {
    id: 'show-visitor',
    name: { en: 'Show a visitor', zh: '带客人看上海' },
    promise: {
      en: 'A room that is itself a reason to come to Shanghai.',
      zh: '一间本身就值得来上海一趟的店。',
    },
    axes: { focus: 20, energy: 78, linger: 60, adventure: 45, spend: 74 },
    weights: w({ energy: 1, spend: 1, focus: 0.7, linger: 0.5 }),
    filter: { curatedOnly: true },
    phases: ['afternoon', 'dusk'],
  },
  {
    id: 'late-night',
    name: { en: 'Late night', zh: '深夜续命' },
    promise: {
      en: 'Still pouring after 21:30, and not rushing you out.',
      zh: '九点半后还在出杯，也不赶人。',
    },
    axes: { focus: 55, energy: 40, linger: 70, adventure: 40, spend: 40 },
    weights: w({ linger: 1, focus: 1 }),
    filter: { openUntil: 21.5 },
    phases: ['dusk', 'night'],
  },
  {
    id: 'great-beans',
    name: { en: 'Just great beans', zh: '只想喝好豆子' },
    promise: {
      en: 'The cup is the whole point. Everything else is furniture.',
      zh: '杯子才是重点，其余都是家具。',
    },
    axes: { focus: 35, energy: 45, linger: 40, adventure: 80, spend: 65 },
    weights: w({ adventure: 2, spend: 0.5 }),
    phases: ['morning', 'afternoon'],
  },
]

export const SCENARIO_BY_ID = new Map(SCENARIOS.map((s) => [s.id, s]))

export function scenarioFromHash(id: string | null): Scenario | null {
  return id ? SCENARIO_BY_ID.get(id) ?? null : null
}

/** Chips in an order that puts what people ask at this hour first. */
export function scenariosForPhase(phase: PhaseId): Scenario[] {
  return [...SCENARIOS].sort(
    (a, b) => Number(b.phases.includes(phase)) - Number(a.phases.includes(phase)),
  )
}

export function passesScenarioFilter(
  cafe: Cafe,
  f: ScenarioFilter | undefined,
  hour?: number,
): boolean {
  if (!f) return true
  if (f.openNow && hour !== undefined) {
    const close = cafe.closes <= cafe.opens ? cafe.closes + 24 : cafe.closes
    const h = hour < cafe.opens ? hour + 24 : hour
    if (h < cafe.opens || h >= close) return false
  }
  if (f.opensBy !== undefined && cafe.opens > f.opensBy) return false
  if (f.openUntil !== undefined) {
    const close = cafe.closes <= cafe.opens ? cafe.closes + 24 : cafe.closes
    if (close < f.openUntil) return false
  }
  if (f.maxPrice !== undefined && cafe.price > f.maxPrice) return false
  if (f.curatedOnly && cafe.source === 'imported') return false
  return true
}

/** True when the reader has moved a dial off the scenario's preset. */
export function scenarioModified(s: Scenario, axes: Axes): boolean {
  return (Object.keys(s.axes) as (keyof Axes)[]).some((k) => s.axes[k] !== axes[k])
}
