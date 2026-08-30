export type District =
  | 'Xuhui'
  | "Jing'an"
  | 'Huangpu'
  | 'Changning'
  | 'Putuo'
  | 'Hongkou'
  | 'Pudong'

/**
 * The drawing that gets stamped on the map. Each archetype has its own
 * hand-inked marker, so the map reads as a picture before it reads as data.
 */
export type Archetype =
  | 'standing-bar'
  | 'lane-house'
  | 'roastery'
  | 'garden'
  | 'laboratory'
  | 'gallery'
  | 'riverside'
  | 'neighborhood'
  | 'bakery'
  | 'hidden-door'

export type Tag =
  | 'laptop-welcome'
  | 'no-laptops'
  | 'outdoor'
  | 'plane-trees'
  | 'standing-only'
  | 'own-roast'
  | 'single-origin'
  | 'pastry'
  | 'view'
  | 'late'
  | 'early'
  | 'dog-friendly'
  | 'english-spoken'
  | 'cash-free'
  | 'books'
  | 'natural-wine'
  | 'matcha'
  | 'step-free'

/**
 * Every axis runs 0..100. These are the dials the Vibe Compass moves, and the
 * distance between a reader's dials and a cafe's axes is the whole ranking.
 */
export interface Axes {
  /** 0 = pure conversation room, 100 = deep-work sanctuary */
  focus: number
  /** 0 = hushed, 100 = buzzing */
  energy: number
  /** 0 = grab and go, 100 = settle in for hours */
  linger: number
  /** 0 = flawless classics, 100 = fermented-mango-espresso-tonic */
  adventure: number
  /** 0 = under Y20 a cup, 100 = Y90 tasting flight */
  spend: number
}

export interface Cafe {
  id: string
  name: string
  nameZh: string
  district: District
  /** The street-level scene it belongs to. Shanghai coffee is a street sport. */
  hood: string
  street: string
  streetZh: string
  lat: number
  lng: number
  archetype: Archetype
  axes: Axes
  tags: Tag[]
  signature: string
  /** One sentence of field note. Editorial, subjective, on purpose. */
  note: string
  /** Local open/close in decimal hours, e.g. 7.5 = 07:30 */
  opens: number
  closes: number
  seats: number
  price: 1 | 2 | 3
  /** Per-axis provenance and structured signals. Absent = pure editorial. */
  evidence?: Evidence
  /** How the record entered the atlas. Absent = curated ('editorial'). */
  source?: 'editorial' | 'imported'
}

/** Where an axis value comes from, in increasing order of authority. */
export type AxisSource = 'editorial' | 'measured' | 'voted'

export interface AxisEvidence {
  /** Blended 0..100 value actually used by the compass. */
  value: number
  /** 0..1 — how much evidence sits behind the value. Rendered as ink density. */
  confidence: number
  sources: AxisSource[]
}

/** Structured signals harvested from Amap (高德) POI data. */
export interface AmapSignals {
  id: string
  rating?: number
  cost?: number
  openHours?: string
  fetchedAt: string
}

/**
 * Structured signals read from Dianping (大众点评) public shop pages served to
 * the Apple Maps integration channel. Counts arrive as display strings
 * (“4万+”) and are parsed at blend time.
 */
export interface DianpingSignals {
  shopId: string
  rating?: number
  /** 人均 in ¥. */
  avgPrice?: number
  reviewCountText?: string
  picCountStr?: string
  categoryName?: string
  regionName?: string
  fetchedAt: string
}

export interface Evidence {
  axes?: Partial<Record<keyof Axes, AxisEvidence>>
  amap?: AmapSignals
  dianping?: DianpingSignals
}

export interface CrawlStop {
  cafeId: string
  order: string
}

export interface Crawl {
  id: string
  name: string
  nameZh: string
  subtitle: string
  blurb: string
  /** Best hour of day to start, 24h decimal. */
  startHour: number
  stops: CrawlStop[]
}
