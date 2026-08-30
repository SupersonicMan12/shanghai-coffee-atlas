import type { Cafe } from '../data/types'
import { STATION_BY_ID, type MetroStation } from '../data/metro'
import type { Ranked } from './match'
import { BBOX, haversine, walkingMinutes } from './projection'

/**
 * "Near me" is an anchor, not a mode: a point on the sheet that every ranking
 * is measured from. It can be the reader (geolocation), a pin they dropped, or
 * a metro station — because indoors the GPS lies and everyone thinks in
 * stations anyway.
 */
export type Anchor =
  | { kind: 'me'; lng: number; lat: number }
  | { kind: 'pin'; lng: number; lat: number }
  | { kind: 'metro'; station: MetroStation }

export function anchorPoint(a: Anchor): { lng: number; lat: number } {
  return a.kind === 'metro' ? { lng: a.station.lng, lat: a.station.lat } : { lng: a.lng, lat: a.lat }
}

export function anchorLabel(a: Anchor): { en: string; zh: string } {
  if (a.kind === 'metro') return { en: a.station.name, zh: a.station.nameZh }
  if (a.kind === 'pin') return { en: 'your pin', zh: '图钉' }
  return { en: 'you', zh: '你' }
}

export function minutesFrom(a: Anchor, cafe: Cafe): number {
  const p = anchorPoint(a)
  return walkingMinutes(haversine(p.lng, p.lat, cafe.lng, cafe.lat))
}

/**
 * Proximity decay. e^(−minutes/25): a café 25 minutes away needs to be ~2.7×
 * the compass match of one next door to outrank it. Steep enough to feel like
 * "near me", soft enough that a perfect room a lane away still wins.
 */
export function proximity(minutes: number): number {
  return Math.exp(-minutes / 25)
}

export interface NearRanked extends Ranked {
  minutes: number
  combined: number
}

export function rankNear(ranked: Ranked[], anchor: Anchor): NearRanked[] {
  return ranked
    .map((r) => {
      const minutes = minutesFrom(anchor, r.cafe)
      return { ...r, minutes, combined: r.score * proximity(minutes) }
    })
    .sort((a, b) => b.combined - a.combined || a.minutes - b.minutes)
}

export function closenessWord(minutes: number): string {
  if (minutes <= 3) return 'Right there'
  if (minutes <= 8) return 'Very close'
  if (minutes <= 15) return 'A short walk'
  if (minutes <= 25) return 'A proper walk'
  return 'A trek'
}

/** Minutes until the café shuts, or null if it is not open at this hour. */
export function minutesToClose(cafe: Cafe, hour: number): number | null {
  const close = cafe.closes <= cafe.opens ? cafe.closes + 24 : cafe.closes
  const h = hour < cafe.opens ? hour + 24 : hour
  if (h < cafe.opens || h >= close) return null
  return Math.round((close - h) * 60)
}

export const CLOSING_SOON_MINUTES = 45

const inBBox = (lng: number, lat: number) =>
  lat >= BBOX.south && lat <= BBOX.north && lng >= BBOX.west && lng <= BBOX.east

/** Hash form: `metro:<station id>` or `pin:<lng>,<lat>` (geolocation shares as a pin). */
export function anchorToHash(a: Anchor): string {
  if (a.kind === 'metro') return `metro:${a.station.id}`
  return `pin:${a.lng.toFixed(5)},${a.lat.toFixed(5)}`
}

export function anchorFromHash(s: string): Anchor | null {
  if (s.startsWith('metro:')) {
    const station = STATION_BY_ID.get(s.slice(6))
    return station ? { kind: 'metro', station } : null
  }
  if (s.startsWith('pin:')) {
    const [lng, lat] = s.slice(4).split(',').map(Number)
    if (Number.isFinite(lng) && Number.isFinite(lat) && inBBox(lng, lat)) {
      return { kind: 'pin', lng, lat }
    }
  }
  return null
}
