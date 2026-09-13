/**
 * The basemap bitmap is painted with real colours, not `var()` references,
 * so the map reads its palette off the CSS custom properties the app shell
 * sets for the current hour and hands the values down.
 */

export interface BasemapColors {
  paper: string
  water: string
  waterEdge: string
  park: string
  parkInk: string
  road: string
  roadStrong: string
  lane: string
}

export const BASEMAP_VARS: Record<keyof BasemapColors, string> = {
  paper: '--paper',
  water: '--water',
  waterEdge: '--water-edge',
  park: '--park',
  parkInk: '--park-ink',
  road: '--road',
  roadStrong: '--road-strong',
  lane: '--lane',
}

export const BASEMAP_KEYS = Object.keys(BASEMAP_VARS) as (keyof BasemapColors)[]

export function readBasemapColors(el: Element): BasemapColors | null {
  const cs = getComputedStyle(el)
  const out = {} as BasemapColors
  for (const key of BASEMAP_KEYS) {
    const v = cs.getPropertyValue(BASEMAP_VARS[key]).trim()
    if (!v) return null
    out[key] = v
  }
  return out
}

export function sameColors(a: BasemapColors | null, b: BasemapColors | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return BASEMAP_KEYS.every((key) => a[key] === b[key])
}

export function colorsKey(c: BasemapColors): string {
  return BASEMAP_KEYS.map((key) => c[key]).join('|')
}

/** The nearest ancestor that sets the palette inline (the app shell's phase style). */
export function paletteHost(el: Element): HTMLElement | null {
  let node: HTMLElement | null = el instanceof HTMLElement ? el : el.parentElement
  while (node) {
    if (node.style.getPropertyValue('--paper')) return node
    node = node.parentElement
  }
  return null
}
