/**
 * How a café becomes a pin: the ink policy for the map layer, computed off
 * the render path. Everything here is a pure function of (zoom bucket, score
 * map, selection), so the map can memoise it and never run it mid-gesture.
 */

import type { Cafe } from '../data/types'
import type { LangMode } from './i18n'
import { displayNames } from './names'
import { project } from './projection'

export function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

/** Projected paper coordinates for a dataset, computed once. */
export interface Layout {
  cafes: Cafe[]
  xs: Float32Array
  ys: Float32Array
  index: Map<string, number>
}

export function layoutFor(cafes: Cafe[]): Layout {
  const xs = new Float32Array(cafes.length)
  const ys = new Float32Array(cafes.length)
  const index = new Map<string, number>()
  cafes.forEach((c, i) => {
    const [x, y] = project(c.lng, c.lat)
    xs[i] = x
    ys[i] = y
    index.set(c.id, i)
  })
  return { cafes, xs, ys, index }
}

/** Zoom bucketed to 1/20th so memo keys stay stable through a commit. */
export function bucketK(k: number): number {
  return Math.round(k * 20) / 20
}

/** The compass verdict on a pin: full ink, plain ink, or a fade. */
export type Tier = 'hi' | 'mid' | 'lo'

export const HI_SCORE = 90
export const LO_SCORE = 70

export function tierOf(compassOn: boolean, score: number | undefined): Tier | null {
  if (!compassOn || score === undefined) return null
  if (score >= HI_SCORE) return 'hi'
  if (score < LO_SCORE) return 'lo'
  return 'mid'
}

/** Steps of ~2.5 score points: a slider nudge then leaves most pins' ink untouched. */
const STRENGTH_STEPS = 18

export function strengthOf(compassOn: boolean, score: number | undefined): number | null {
  if (!compassOn) return null
  return Math.round(clamp(((score ?? 50) - 50) / 45, 0, 1) * STRENGTH_STEPS) / STRENGTH_STEPS
}

export function isQuietPin(k: number, cafe: Cafe, strength: number | null, active: boolean): boolean {
  return cafe.source === 'imported' && k < 1.8 && !active && !(strength !== null && strength > 0.82)
}

export const QUIET_R = 3.2

/** Ink weight for the zoom level alone; the compass adds up to 5 on top. */
export function basePinRadius(k: number): number {
  return k < 1.3 ? 7 : k < 2.4 ? 7 + ((k - 1.3) / 1.1) * 4 : 11
}

export function pinRadius(k: number, cafe: Cafe, strength: number | null, active: boolean): number {
  if (isQuietPin(k, cafe, strength, active)) return QUIET_R
  return basePinRadius(k) + (strength === null ? 1 : strength * 5)
}

/** Below this zoom, overlapping quiet pins pool into one ink blot. */
export const CLUSTER_K = 1.4

export interface Cluster {
  key: string
  x: number
  y: number
  n: number
}

export interface Density {
  /** Café ids swallowed by a blot; they are not drawn as pins. */
  hidden: Set<string>
  clusters: Cluster[]
}

const NO_DENSITY: Density = { hidden: new Set(), clusters: [] }

/**
 * Grid clustering in paper space. Only quiet pins take part; curated cafés,
 * strong matches and the selection never disappear into a blot.
 * Cells are ~44 screen px, so the blots keep a steady rhythm as you zoom out.
 */
export function clusterQuiet(
  layout: Layout,
  k: number,
  compassOn: boolean,
  scores: Map<string, number>,
  selectedId: string | null,
): Density {
  if (k >= CLUSTER_K) return NO_DENSITY
  const cell = 44 / k
  const cells = new Map<string, number[]>()
  const { cafes, xs, ys } = layout
  for (let i = 0; i < cafes.length; i++) {
    const cafe = cafes[i]
    if (cafe.source !== 'imported') continue
    const score = scores.get(cafe.id)
    if (compassOn && score !== undefined && score >= HI_SCORE) continue
    if (selectedId === cafe.id) continue
    if (!isQuietPin(k, cafe, strengthOf(compassOn, score), false)) continue
    const key = `${Math.floor(xs[i] / cell)},${Math.floor(ys[i] / cell)}`
    const list = cells.get(key)
    if (list) list.push(i)
    else cells.set(key, [i])
  }
  const hidden = new Set<string>()
  const clusters: Cluster[] = []
  cells.forEach((members, key) => {
    if (members.length < 2) return
    let x = 0
    let y = 0
    for (const i of members) {
      x += xs[i]
      y += ys[i]
      hidden.add(cafes[i].id)
    }
    clusters.push({ key, x: x / members.length, y: y / members.length, n: members.length })
  })
  return { hidden, clusters }
}

export function textWidth(text: string): number {
  const cjk = [...text].filter((char) => /[\u3400-\u9fff]/.test(char)).length
  return (text.length - cjk) * 7 + cjk * 10.5
}

export interface LabelInput {
  layout: Layout
  k: number
  scores: Map<string, number>
  compassOn: boolean
  selectedId: string | null
  topIds: string[]
  hidden: Set<string>
  mode: LangMode
}

/**
 * Which pins get a name. Priority: selection, then the top picks, then
 * strong matches, then curated cafés, then (zoomed in) the rest;
 * a greedy sweep against a 40-unit grid of pin and label boxes. Faded pins
 * (<70 when the compass is on) never get a label unless selected.
 */
export function labelSet({
  layout,
  k,
  scores,
  compassOn,
  selectedId,
  topIds,
  hidden,
  mode,
}: LabelInput): Set<string> {
  const { cafes, xs, ys, index } = layout
  const paperInv = 1 / k
  type Candidate = { id: string; priority: number; order: number }
  type Box = { x: number; y: number; w: number; h: number; id?: string }
  const candidates = new Map<string, Candidate>()
  const add = (id: string, priority: number, order: number) => {
    const current = candidates.get(id)
    if (!current || priority < current.priority || (priority === current.priority && order < current.order)) {
      candidates.set(id, { id, priority, order })
    }
  }
  if (selectedId) add(selectedId, 0, 0)
  topIds.forEach((id, i) => add(id, 1, i))
  if (compassOn) {
    cafes.forEach((cafe) => {
      const score = scores.get(cafe.id)
      if (score !== undefined && score >= 80) add(cafe.id, 3, 1000 - score)
    })
  }
  cafes.forEach((cafe) => {
    if (hidden.has(cafe.id)) return
    const score = scores.get(cafe.id)
    if (tierOf(compassOn, score) === 'lo' && cafe.id !== selectedId) return
    const evidenceOrder = cafe.evidence?.dianping ? 0 : cafe.evidence?.amap ? 1 : 2
    if (cafe.source !== 'imported') {
      add(cafe.id, 4, compassOn ? 1000 - (score ?? 0) : evidenceOrder)
    } else if (k >= 2.4) {
      add(cafe.id, 5, compassOn ? 1000 - (score ?? 0) : evidenceOrder)
    }
  })

  const sorted = [...candidates.values()].sort(
    (a, b) => a.priority - b.priority || a.order - b.order || a.id.localeCompare(b.id),
  )
  const budget = k < 1.3 ? 28 : k < 2.1 ? 90 : sorted.length
  const grid = new Map<string, Box[]>()
  const accepted = new Set<string>()
  const cellsFor = (box: Box) => {
    const cells: string[] = []
    for (let x = Math.floor(box.x / 40); x <= Math.floor((box.x + box.w) / 40); x += 1) {
      for (let y = Math.floor(box.y / 40); y <= Math.floor((box.y + box.h) / 40); y += 1) {
        cells.push(`${x},${y}`)
      }
    }
    return cells
  }
  const insert = (box: Box) => {
    cellsFor(box).forEach((cell) => {
      const list = grid.get(cell) ?? []
      list.push(box)
      grid.set(cell, list)
    })
  }
  const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  const radiusOf = (cafe: Cafe) =>
    pinRadius(k, cafe, strengthOf(compassOn, scores.get(cafe.id)), selectedId === cafe.id)
  for (let i = 0; i < cafes.length; i++) {
    const cafe = cafes[i]
    if (hidden.has(cafe.id)) continue
    if (isQuietPin(k, cafe, strengthOf(compassOn, scores.get(cafe.id)), selectedId === cafe.id)) continue
    const radius = radiusOf(cafe)
    insert({
      x: xs[i] - radius * paperInv,
      y: ys[i] - radius * paperInv,
      w: 2 * radius * paperInv,
      h: 2 * radius * paperInv,
      id: cafe.id,
    })
  }
  sorted.slice(0, budget).forEach(({ id, priority }) => {
    const i = index.get(id)
    if (i === undefined) return
    const cafe = cafes[i]
    const names = displayNames(cafe, mode)
    const lines = k >= 2.5 && names.secondary ? [names.primary, names.secondary] : [names.primary]
    const width = Math.max(...lines.map(textWidth)) + 6
    const height = lines.length === 2 ? 28 : 15
    const radius = radiusOf(cafe)
    const box = {
      x: xs[i] - (width * paperInv) / 2,
      y: ys[i] + (radius + 4) * paperInv,
      w: width * paperInv,
      h: height * paperInv,
    }
    const always = priority <= 1
    const blocked = cellsFor(box).some((cell) =>
      (grid.get(cell) ?? []).some((obstacle) => {
        if (obstacle.id === id) return false
        return overlaps(box, obstacle)
      }),
    )
    if (!blocked || always) {
      accepted.add(id)
      insert(box)
    }
  })
  return accepted
}
