import basemap from '../data/basemap.json'

export interface BBox {
  south: number
  west: number
  north: number
  east: number
}

export const BBOX = basemap.bbox as BBox

/**
 * The atlas is a picture, so it gets a fixed "paper" size in SVG units and the
 * city is projected onto it once. Web Mercator would be overkill across 9 km;
 * an equirectangular projection scaled by cos(lat) is visually exact here and
 * keeps the maths readable.
 */
export const PAPER_WIDTH = 1600
const MID_LAT = (BBOX.north + BBOX.south) / 2
const LON_SPAN = BBOX.east - BBOX.west
const LAT_SPAN = BBOX.north - BBOX.south
const COS_MID = Math.cos((MID_LAT * Math.PI) / 180)

export const PAPER_HEIGHT = Math.round(
  (PAPER_WIDTH * LAT_SPAN) / (LON_SPAN * COS_MID),
)

export function projectX(lng: number): number {
  return ((lng - BBOX.west) / LON_SPAN) * PAPER_WIDTH
}

export function projectY(lat: number): number {
  return ((BBOX.north - lat) / LAT_SPAN) * PAPER_HEIGHT
}

export function project(lng: number, lat: number): [number, number] {
  return [projectX(lng), projectY(lat)]
}

/** Metres between two lon/lat points. */
export function haversine(
  aLng: number,
  aLat: number,
  bLng: number,
  bLat: number,
): number {
  const R = 6371000
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

/**
 * Straight-line metres, inflated for the fact that Shanghai's blocks are not
 * straight lines. 1.28 is close to the measured detour ratio for the former
 * French Concession grid.
 */
export function walkingMetres(straightMetres: number): number {
  return straightMetres * 1.28
}

/** Minutes on foot at a realistic city pace including one crossing per block. */
export function walkingMinutes(straightMetres: number): number {
  return Math.round(walkingMetres(straightMetres) / 78)
}
