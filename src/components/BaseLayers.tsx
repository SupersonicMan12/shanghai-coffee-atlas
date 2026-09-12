import { memo, useEffect, useRef, useState } from 'react'
import basemap from '../data/basemap.json'
import { PAPER_HEIGHT, PAPER_WIDTH, project } from '../lib/projection'
import { jitter, randomAt, sketch, wash, type Pt } from '../lib/hand'
import { BASEMAP_VARS, colorsKey, type BasemapColors } from '../lib/basemapColors'

interface RawShape {
  name?: string
  nameZh?: string
  points?: [number, number][]
  segments?: [number, number][][]
  cls?: string
}

const toPaper = (pts: [number, number][]): Pt[] => pts.map(([lng, lat]) => project(lng, lat))

function area(points: Pt[]): number {
  let a = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a) / 2
}

function centroid(points: Pt[]): Pt {
  let x = 0
  let y = 0
  for (const p of points) {
    x += p[0]
    y += p[1]
  }
  return [x / points.length, y / points.length]
}

/**
 * Everything below is computed exactly once, at module load. The watercolour
 * (paper, water, parks, plane trees, and the road ink at city scale) is then
 * painted once per palette into a bitmap, so panning and pinching move a
 * single picture instead of re-running the turbulence filters every frame.
 * Only what must stay crisp at high zoom — roads, lane hairlines, the labels
 * — remains live SVG, and those layers switch on by zoom level.
 */

const waterAreas = (basemap.water.areas as RawShape[]).map((w) => toPaper(w.points!)).filter((p) => p.length > 3)

const parks = (basemap.parks as RawShape[])
  .map((p) => ({
    name: p.name ?? '',
    nameZh: p.nameZh ?? '',
    pts: toPaper(p.points!),
  }))
  .filter((p) => p.pts.length > 3)
  .map((p) => ({ ...p, a: area(p.pts) }))

const roads = (basemap.roads as RawShape[]).map((r) => ({
  cls: r.cls!,
  pts: toPaper(r.points!),
}))

const lanes = (basemap.lanes as RawShape[]).map((l) => ({
  name: l.name ?? '',
  nameZh: l.nameZh ?? '',
  segs: (l.segments ?? []).map(toPaper),
}))

const districts = (basemap.districts as RawShape[]).map((d) => ({
  name: d.name ?? '',
  nameZh: d.nameZh ?? '',
  segs: (d.segments ?? []).map(toPaper),
}))

const waterPaths = waterAreas.map((p) => wash(p, 0))
const waterPaths2 = waterAreas.map((p) => wash(p, 1))
const waterEdges = waterAreas.map((p) => sketch(p, { amplitude: 2, wavelength: 120, closed: true }))
const parkPaths = parks.map((p) => ({
  d: wash(p.pts, 0),
  d2: wash(p.pts, 1),
  label: p.name || p.nameZh,
  at: centroid(p.pts),
  big: p.a > 26000,
}))

const roadPaths = roads.map((r) => ({
  cls: r.cls,
  d: sketch(r.pts, { amplitude: r.cls === 'secondary' ? 1.1 : 1.7, wavelength: 110 }),
}))
const roadsByClass = {
  secondary: roadPaths.filter((r) => r.cls === 'secondary').map((r) => r.d),
  primary: roadPaths.filter((r) => r.cls === 'primary').map((r) => r.d),
  trunk: roadPaths.filter((r) => r.cls === 'trunk').map((r) => r.d),
}

const lanePaths = lanes.map((l, i) => {
  const longest = l.segs.slice().sort((a, b) => b.length - a.length)[0] ?? []
  return {
    id: `lane-${i}`,
    name: l.name,
    nameZh: l.nameZh,
    ds: l.segs.map((s) => sketch(s, { amplitude: 1.3, wavelength: 80 })),
    labelD: sketch(longest, { amplitude: 1.3, wavelength: 80 }),
    labelLen: longest.reduce(
      (acc, p, idx) => (idx ? acc + Math.hypot(p[0] - longest[idx - 1][0], p[1] - longest[idx - 1][1]) : 0),
      0,
    ),
  }
})

const districtPaths = districts.map((d) => ({
  name: d.name,
  nameZh: d.nameZh,
  ds: d.segs.map((s) => sketch(s, { amplitude: 2.4, wavelength: 200 })),
  at: centroid(d.segs.flat()),
}))

/** Scattered plane-tree marks over the concession, the way an illustrator would. */
const trees = Array.from({ length: 220 }, (_, i) => {
  const [dx, dy] = jitter(i, 1)
  const x = PAPER_WIDTH * (0.18 + randomAt(i * 2.1) * 0.52) + dx * 30
  const y = PAPER_HEIGHT * (0.32 + randomAt(i * 3.7 + 5) * 0.42) + dy * 30
  const r = 2.4 + randomAt(i * 5.3) * 2.6
  return { x, y, r }
})

const CSS_VAR_COLORS: BasemapColors = Object.fromEntries(
  Object.entries(BASEMAP_VARS).map(([k, v]) => [k, `var(${v})`]),
) as unknown as BasemapColors

const paths = (ds: string[], attrs: string) => ds.map((d) => `<path d="${d}" ${attrs}/>`).join('')

/**
 * The watercolour as an SVG fragment: paper, water, parks, trees, and a
 * whisper of paper grain. Filters live here and nowhere else in the map.
 */
function washMarkup(c: BasemapColors, withFilters: boolean): string {
  const grain = withFilters ? ' filter="url(#grain)"' : ''
  const defs = withFilters
    ? `<defs>` +
      `<filter id="grain" x="-10%" y="-10%" width="120%" height="120%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="7" result="n"/>` +
      `<feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G"/>` +
      `</filter>` +
      `<filter id="paper-grain" x="0" y="0" width="100%" height="100%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="3"/>` +
      `<feColorMatrix type="matrix" values="0 0 0 0 0.25  0 0 0 0 0.18  0 0 0 0 0.12  0 0 0 0.09 0"/>` +
      `</filter>` +
      `</defs>`
    : ''
  const paperGrain = withFilters
    ? `<rect x="0" y="0" width="${PAPER_WIDTH}" height="${PAPER_HEIGHT}" filter="url(#paper-grain)" opacity="0.5"/>`
    : ''
  return (
    defs +
    `<rect x="0" y="0" width="${PAPER_WIDTH}" height="${PAPER_HEIGHT}" fill="${c.paper}"/>` +
    paperGrain +
    `<g${grain}>` +
    `<g>${paths(waterPaths, `fill="${c.water}"`)}` +
    `${paths(waterPaths2, `fill="${c.water}" fill-opacity="0.55"`)}` +
    `${paths(waterEdges, `fill="none" stroke="${c.waterEdge}" stroke-width="1.4"`)}</g>` +
    `<g>${parkPaths
      .map(
        (p) => `<path d="${p.d}" fill="${c.park}" fill-opacity="0.85"/><path d="${p.d2}" fill="${c.park}" fill-opacity="0.45"/>`,
      )
      .join('')}</g>` +
    `</g>` +
    `<g stroke="${c.parkInk}" stroke-opacity="0.5" stroke-width="0.7" fill="none">${trees
      .map(
        (t) =>
          `<circle cx="${t.x.toFixed(1)}" cy="${t.y.toFixed(1)}" r="${t.r.toFixed(1)}"/>` +
          `<path d="M${(t.x - t.r * 0.5).toFixed(1)} ${(t.y + t.r * 0.4).toFixed(1)} q${(t.r * 0.5).toFixed(1)} ${(-t.r).toFixed(1)} ${t.r.toFixed(1)} 0"/>`,
      )
      .join('')}</g>`
  )
}

const WASH_SCALE = 1.5
const INK_SCALE = 2

interface Rasters {
  /** The watercolour alone: paper, water, parks, trees, grain. */
  wash: HTMLCanvasElement
  /** Every road and lane, inked once, transparent elsewhere. */
  ink: HTMLCanvasElement
}

function svgDocument(inner: string, w: number, h: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAPER_WIDTH} ${PAPER_HEIGHT}" ` +
    `width="${w}" height="${h}">${inner}</svg>`
  )
}

function loadSvg(markup: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('basemap raster: svg failed to load'))
    }
    img.src = url
  })
}

function sheetCanvas(scale: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(PAPER_WIDTH * scale)
  canvas.height = Math.round(PAPER_HEIGHT * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('basemap raster: no 2d context')
  ctx.scale(scale, scale)
  return [canvas, ctx]
}

/**
 * Move a finished painting into a bitmap-only canvas. A 2D canvas keeps a
 * drawable backing store the compositor has to re-upload every frame it is
 * transformed; a bitmaprenderer canvas is a static texture. The source is
 * emptied to give its memory back.
 */
async function freeze(source: HTMLCanvasElement, className: string): Promise<HTMLCanvasElement> {
  const out = document.createElement('canvas')
  out.width = source.width
  out.height = source.height
  out.className = className
  const ctx = out.getContext('bitmaprenderer')
  if (!ctx) return source
  ctx.transferFromImageBitmap(await createImageBitmap(source))
  source.width = 0
  source.height = 0
  return out
}

let inkPaths: { secondary: Path2D[]; primary: Path2D[]; trunk: Path2D[]; lanes: Path2D[] } | null = null

function strokeAll(ctx: CanvasRenderingContext2D, ps: Path2D[], color: string, width: number, alpha: number) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.globalAlpha = alpha
  for (const p of ps) ctx.stroke(p)
}

const rasterCache = new Map<string, Promise<Rasters>>()

/**
 * Paint the sheet for one palette: the watercolour (with its filters) via an
 * SVG image, the roads straight onto a canvas as Path2D strokes. Cached per
 * palette so an afternoon→dusk change costs one paint, not one per frame.
 */
function rasterise(colors: BasemapColors): Promise<Rasters> {
  const key = colorsKey(colors)
  const hit = rasterCache.get(key)
  if (hit) return hit
  const job = (async () => {
    const [wash, wctx] = sheetCanvas(WASH_SCALE)
    const washImg = await loadSvg(svgDocument(washMarkup(colors, true), wash.width, wash.height))
    wctx.drawImage(washImg, 0, 0, PAPER_WIDTH, PAPER_HEIGHT)

    inkPaths ??= {
      secondary: roadsByClass.secondary.map((d) => new Path2D(d)),
      primary: roadsByClass.primary.map((d) => new Path2D(d)),
      trunk: roadsByClass.trunk.map((d) => new Path2D(d)),
      lanes: lanePaths.flatMap((l) => l.ds.map((d) => new Path2D(d))),
    }
    const [ink, ictx] = sheetCanvas(INK_SCALE)
    ictx.lineCap = 'round'
    ictx.lineJoin = 'round'
    strokeAll(ictx, inkPaths.secondary, colors.road, 1.5, 0.75)
    strokeAll(ictx, inkPaths.primary, colors.road, 2.6, 1)
    strokeAll(ictx, inkPaths.trunk, colors.roadStrong, 3.6, 1)
    strokeAll(ictx, inkPaths.lanes, colors.lane, 2.4, 0.9)
    return { wash: await freeze(wash, 'raster wash'), ink: await freeze(ink, 'raster ink lod') }
  })()
  job.catch(() => rasterCache.delete(key))
  rasterCache.set(key, job)
  return job
}

/** Zoom level below which the inked bitmap stands in for the vector roads. */
export const VECTOR_ROADS_K = 1.9
export const LANE_LABELS_K = 1.6
export const DISTRICT_LABELS_K = 2.5

interface RasterProps {
  /** Palette resolved from the page's CSS variables; null until measured. */
  colors: BasemapColors | null
  /** Bucketed zoom, used only for level-of-detail switches. */
  k: number
  onReady: (ready: boolean) => void
}

/**
 * The bitmap half of the basemap: two canvases the size of the sheet, sitting
 * under the SVG inside the same transformed element. Nothing here is touched
 * during a gesture.
 */
export const BaseRaster = memo(function BaseRaster({ colors, k, onReady }: RasterProps) {
  const host = useRef<HTMLDivElement | null>(null)
  const [rasters, setRasters] = useState<Rasters | null>(null)

  useEffect(() => {
    if (!colors) return
    let live = true
    // Let the first frame go out as plain vectors; paint the bitmap right after.
    const handle = window.setTimeout(() => {
      rasterise(colors)
        .then((r) => {
          if (live) setRasters(r)
        })
        .catch(() => undefined)
    }, 30)
    return () => {
      live = false
      window.clearTimeout(handle)
    }
  }, [colors])

  useEffect(() => {
    const el = host.current
    if (!el || !rasters) return
    el.replaceChildren(rasters.wash, rasters.ink)
    onReady(true)
  }, [rasters, onReady])

  useEffect(() => {
    rasters?.ink.classList.toggle('lod-off', k >= VECTOR_ROADS_K)
  }, [rasters, k])

  return <div ref={host} className="rasters" />
})

interface Props {
  /** Bucketed zoom, used only for level-of-detail switches. */
  k: number
  /** Whether the bitmap underneath is on screen; until then the wash is drawn as vectors. */
  raster: boolean
}

/** Every road and lane as live vectors: mounted once, the first time k crosses VECTOR_ROADS_K. */
const RoadVectors = memo(function RoadVectors() {
  return (
    <g fill="none" strokeLinecap="round">
      {roadsByClass.secondary.map((d, i) => (
        <path key={i} d={d} stroke="var(--road)" strokeWidth="1.5" strokeOpacity="0.75" />
      ))}
      {roadsByClass.primary.map((d, i) => (
        <path key={i} d={d} stroke="var(--road)" strokeWidth="2.6" />
      ))}
      {roadsByClass.trunk.map((d, i) => (
        <path key={i} d={d} stroke="var(--road-strong)" strokeWidth="3.6" />
      ))}
      {lanePaths.map((l) =>
        l.ds.map((d, j) => <path key={`${l.id}-${j}`} d={d} stroke="var(--lane)" strokeWidth="2.4" strokeOpacity="0.9" />),
      )}
    </g>
  )
})

const LaneLabels = memo(function LaneLabels() {
  return (
    <>
      <defs>
        {lanePaths.map((l) => (
          <path key={l.id} id={l.id} d={l.labelD} />
        ))}
      </defs>
      {lanePaths
        .filter((l) => l.labelLen > 120)
        .map((l) => (
          <text key={l.id} dy="-4">
            <textPath href={`#${l.id}`} startOffset="42%" textAnchor="middle">
              {l.name}
            </textPath>
          </text>
        ))}
    </>
  )
})

const DistrictInk = memo(function DistrictInk() {
  return (
    <g fill="none">
      {districtPaths.map((d) =>
        d.ds.map((seg, j) => (
          <path
            key={`${d.name}-${j}`}
            d={seg}
            stroke="var(--ink-soft)"
            strokeWidth="1.6"
            strokeDasharray="1 9"
            strokeLinecap="round"
            strokeOpacity="0.6"
          />
        )),
      )}
    </g>
  )
})

const DistrictLabels = memo(function DistrictLabels() {
  return (
    <>
      {districtPaths.map((d) => (
        <g key={d.name}>
          <text x={d.at[0]} y={d.at[1]} textAnchor="middle">
            {d.name.toUpperCase()}
          </text>
          <text x={d.at[0]} y={d.at[1] + 20} textAnchor="middle" className="zh">
            {d.nameZh}
          </text>
        </g>
      ))}
    </>
  )
})

const ParkLabels = memo(function ParkLabels() {
  return (
    <g className="park-labels">
      {parkPaths
        .filter((p) => p.big && p.label)
        .map((p, i) => (
          <text key={i} x={p.at[0]} y={p.at[1]} textAnchor="middle">
            {p.label}
          </text>
        ))}
    </g>
  )
})

const VectorWash = memo(function VectorWash() {
  return <g dangerouslySetInnerHTML={{ __html: washMarkup(CSS_VAR_COLORS, false) }} />
})

function BaseLayersInner({ k, raster }: Props) {
  const vectorRoads = k >= VECTOR_ROADS_K
  const laneLabels = k >= LANE_LABELS_K
  const districtLabels = k <= DISTRICT_LABELS_K
  // Once the vector roads have been mounted they stay; only their opacity flips.
  const [roadsMounted, setRoadsMounted] = useState(vectorRoads)
  if (vectorRoads && !roadsMounted) setRoadsMounted(true)

  return (
    <g className="basemap">
      {!raster && <VectorWash />}

      {roadsMounted && (
        <g className={`lod roads${vectorRoads ? '' : ' lod-off'}`}>
          <RoadVectors />
        </g>
      )}

      <g className={`lane-labels lod${laneLabels ? '' : ' lod-off'}`}>
        <LaneLabels />
      </g>

      <DistrictInk />

      <g className={`district-labels lod${districtLabels ? '' : ' lod-off'}`}>
        <DistrictLabels />
      </g>

      <ParkLabels />
    </g>
  )
}

export const BaseLayers = memo(BaseLayersInner)
