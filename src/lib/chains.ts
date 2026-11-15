import type { Archetype, Axes, Cafe, District } from '../data/types'
import meta from '../data/chains.meta.json'

/**
 * The big chains. A handful of branches of each sit in cafes.ts; every other
 * branch lives in public/data/chains.json (tools/build_chains.py) and is only fetched
 * when the reader switches chains on. Chain rows carry register facts; the
 * compass reading below is one brand-level prior shared by all its branches.
 */
export interface ChainBrand {
  key: string
  en: string
  zh: string
  pattern: RegExp
  archetype: Archetype
  price: 1 | 2 | 3
  axes: Axes
  seats: number
}

const BAR: Axes = { focus: 25, energy: 55, linger: 20, adventure: 30, spend: 30 }
const ROOM: Axes = { focus: 45, energy: 48, linger: 52, adventure: 32, spend: 40 }

export const CHAIN_BRANDS: ChainBrand[] = [
  { key: 'starbucks', en: 'Starbucks', zh: '星巴克', pattern: /星巴克|starbucks/i, archetype: 'neighborhood', price: 2, axes: ROOM, seats: 22 },
  { key: 'luckin', en: 'Luckin', zh: '瑞幸', pattern: /瑞幸|luckin/i, archetype: 'standing-bar', price: 1, axes: BAR, seats: 6 },
  { key: 'manner', en: 'Manner', zh: 'Manner', pattern: /manner/i, archetype: 'standing-bar', price: 1, axes: BAR, seats: 6 },
  { key: 'cotti', en: 'Cotti', zh: '库迪', pattern: /库迪|cotti/i, archetype: 'standing-bar', price: 1, axes: BAR, seats: 6 },
  { key: 'tims', en: 'Tims', zh: 'Tims 天好', pattern: /tims|tim\s*hortons|天好咖啡/i, archetype: 'neighborhood', price: 2, axes: ROOM, seats: 22 },
  { key: 'mstand', en: 'M Stand', zh: 'M Stand', pattern: /m\s*stand/i, archetype: 'standing-bar', price: 2, axes: BAR, seats: 6 },
  { key: 'peets', en: "Peet's", zh: '皮爷', pattern: /皮爷|peet/i, archetype: 'neighborhood', price: 2, axes: ROOM, seats: 22 },
  { key: 'costa', en: 'Costa', zh: 'Costa', pattern: /costa/i, archetype: 'neighborhood', price: 2, axes: ROOM, seats: 22 },
]

export const BRAND_BY_KEY = new Map(CHAIN_BRANDS.map((b) => [b.key, b]))

const memo = new WeakMap<Cafe, string | null>()

/** Brand key of a chain branch, or null for everyone else. */
export function chainOf(cafe: Cafe): string | null {
  if (cafe.chain) return cafe.chain
  let hit = memo.get(cafe)
  if (hit === undefined) {
    const name = `${cafe.name} ${cafe.nameZh}`
    hit = CHAIN_BRANDS.find((b) => b.pattern.test(name))?.key ?? null
    memo.set(cafe, hit)
  }
  return hit
}

/** Branch counts in public/data/chains.json, known without fetching it. */
export const CHAIN_FILE_COUNTS = meta.byBrand as Record<string, number>

type Row = [
  id: string, chain: string, name: string, nameZh: string, district: District, hood: string,
  street: string, streetZh: string, lat: number, lng: number, opens: number | null, closes: number | null,
  amapId: string, rating: number | null, cost: number | null, openHours: string | null,
]

function hydrate(row: Row, fetchedAt: string): Cafe {
  const [id, chain, , nameZh, district, hood, street, streetZh, lat, lng, opens, closes, amapId, rating, cost, openHours] = row
  const brand = BRAND_BY_KEY.get(chain) as ChainBrand
  const price = cost === null ? brand.price : cost <= 20 ? 1 : cost <= 45 ? 2 : 3
  const axes: Axes = { ...brand.axes, spend: price === 1 ? 25 : price === 2 ? 45 : 65 }
  const ev = (value: number) => ({ value, confidence: 0.2, sources: ['editorial' as const] })
  return {
    id,
    // The register's branch names are Chinese only; in English the neighbourhood says more than their pinyin.
    name: `${brand.en} · ${hood}`,
    nameZh, district, hood, street, streetZh, lat, lng,
    archetype: brand.archetype,
    axes,
    tags: brand.archetype === 'standing-bar' ? ['standing-only'] : [],
    signature: `The ${brand.en} menu`,
    note: 'Chain branch from the Amap POI register; the compass reading is a brand-level estimate, not this branch.',
    opens: opens ?? 8,
    closes: closes ?? 20,
    seats: brand.seats,
    price,
    source: 'imported',
    chain,
    ...(opens === null ? { hoursUnknown: true } : {}),
    evidence: {
      axes: { focus: ev(axes.focus), energy: ev(axes.energy), linger: ev(axes.linger), adventure: ev(axes.adventure), spend: ev(axes.spend) },
      amap: {
        id: amapId,
        ...(rating !== null ? { rating } : {}),
        ...(cost !== null ? { cost } : {}),
        ...(openHours ? { openHours } : {}),
        fetchedAt,
      },
    },
  }
}

let pending: Promise<Cafe[]> | null = null

/** Every chain branch not already in cafes.ts. Fetched once, on demand. */
export function loadChains(): Promise<Cafe[]> {
  pending ??= fetch(`${import.meta.env.BASE_URL}data/chains.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`chains.json: ${res.status}`)
      return res.json() as Promise<{ fetchedAt: string; rows: Row[] }>
    })
    .then((data) => data.rows.map((r) => hydrate(r, data.fetchedAt)))
    .catch((err: unknown) => {
      pending = null
      throw err
    })
  return pending
}

const KEY = 'shca.chains.v1'

export interface ChainPrefs {
  on: boolean
  /** Brand keys the reader switched off while chains are on. */
  off: string[]
}

export function readChainPrefs(): ChainPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<ChainPrefs> | null
    if (raw && typeof raw.on === 'boolean') {
      return { on: raw.on, off: Array.isArray(raw.off) ? raw.off.filter((k) => BRAND_BY_KEY.has(k)) : [] }
    }
  } catch {
    // private mode or a corrupt entry: fall through to the default
  }
  return { on: false, off: [] }
}

export function storeChainPrefs(p: ChainPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // storage unavailable; the toggle still works for this visit
  }
}
