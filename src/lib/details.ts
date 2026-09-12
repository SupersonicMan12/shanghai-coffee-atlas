import type { Cafe, CafeDetail, Trait } from '../data/types'
import raw from '../data/details.json'

/**
 * Generated per-café detail (tools/enrich_*.py → src/data/details.json).
 * Everything here is evidenced — photos, public pages, Amap fields — and each
 * trait carries its own confidence, so the UI can show a faint sketch for a
 * guess and a firm line for a fact.
 */
export const DETAILS = raw as Record<string, CafeDetail>

const EMPTY: CafeDetail = { photos: [], dishes: [], traits: [] }

export function detailFor(cafe: Cafe | string): CafeDetail {
  const id = typeof cafe === 'string' ? cafe : cafe.id
  return DETAILS[id] ?? EMPTY
}

/** Traits solid enough to state as fact (confidence ≥ 0.5), strongest first. */
export function firmTraits(cafe: Cafe | string, limit = 4): Trait[] {
  return detailFor(cafe)
    .traits.filter((t) => t.confidence >= 0.5)
    .slice(0, limit)
}

/** Weekly hours for a given weekday (0 = Sunday), falling back to the flat record. */
export function hoursOn(cafe: Cafe, day: number): { open: number; close: number } {
  const week = detailFor(cafe).hours
  const hit = week?.find((h) => h.day === day)
  return hit ? { open: hit.open, close: hit.close } : { open: cafe.opens, close: cafe.closes }
}
