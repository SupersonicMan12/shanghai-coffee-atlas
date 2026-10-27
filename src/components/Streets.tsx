import { memo, useEffect, useMemo, useState } from 'react'
import { project } from '../lib/projection'
import { sketch, type Pt } from '../lib/hand'

/**
 * The street grid between the arterials, drawn only once a reader is down at
 * block scale. The geometry (tools/build_streets.py) is a separate file the
 * browser fetches the first time the zoom crosses TERTIARY_K, and only the
 * streets inside the visible window are mounted, so a few hundred paths are
 * live at any time rather than eight thousand.
 */

interface RawStreet {
  cls: string
  name?: string
  nameZh?: string
  points: [number, number][]
}

export interface Street {
  id: string
  cls: string
  name: string
  nameZh: string
  d: string
  pts: Pt[]
  len: number
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Visible part of the sheet, in paper units. */
export interface Window {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Zoom (old-sheet units, see AtlasMap) at which each class joins the drawing. */
export const TERTIARY_K = 2.2
export const STREETS_K = 3.2
export const STREET_LABELS_K = 4.6

const WIDTH: Record<string, number> = {
  tertiary: 1.6,
  unclassified: 1.0,
  residential: 1.0,
  living_street: 0.8,
  pedestrian: 0.6,
}

let loading: Promise<Street[]> | null = null

function prepare(raw: RawStreet[]): Street[] {
  return raw.map((s, i) => {
    const pts: Pt[] = s.points.map(([lng, lat]) => project(lng, lat))
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    let len = 0
    pts.forEach((p, j) => {
      if (p[0] < x0) x0 = p[0]
      if (p[1] < y0) y0 = p[1]
      if (p[0] > x1) x1 = p[0]
      if (p[1] > y1) y1 = p[1]
      if (j) len += Math.hypot(p[0] - pts[j - 1][0], p[1] - pts[j - 1][1])
    })
    return {
      id: `st-${i}`,
      cls: s.cls,
      name: s.name ?? '',
      nameZh: s.nameZh ?? '',
      d: sketch(pts, { amplitude: s.cls === 'tertiary' ? 1.0 : 0.7, wavelength: 70 }),
      pts,
      len,
      x0,
      y0,
      x1,
      y1,
    }
  })
}

function loadStreets(): Promise<Street[]> {
  loading ??= import('../data/streets.json').then((m) => prepare((m.default as { streets: RawStreet[] }).streets))
  return loading
}

interface Props {
  /** Bucketed zoom in old-sheet units. */
  k: number
  /** Paper units per CSS px at the current zoom; keeps labels a constant size. */
  inv: number
  window: Window | null
  /** Which name to print under a street: English first or Chinese first. */
  zhFirst: boolean
}

const PAD = 60

function StreetsInner({ k, inv, window: win, zhFirst }: Props) {
  const [streets, setStreets] = useState<Street[] | null>(null)
  const wanted = k >= TERTIARY_K

  useEffect(() => {
    if (!wanted || streets) return
    let live = true
    loadStreets()
      .then((s) => {
        if (live) setStreets(s)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [wanted, streets])

  const visible = useMemo(() => {
    if (!streets || !win || !wanted) return []
    const minor = k >= STREETS_K
    const out: Street[] = []
    for (const s of streets) {
      if (!minor && s.cls !== 'tertiary') continue
      if (s.x1 < win.x0 - PAD || s.x0 > win.x1 + PAD || s.y1 < win.y0 - PAD || s.y0 > win.y1 + PAD) continue
      out.push(s)
    }
    return out
  }, [streets, win, wanted, k])

  if (!visible.length) return null
  const labels = k >= STREET_LABELS_K
  // A label needs about 90 CSS px of street to sit on.
  const minLabelLen = 110 * inv

  return (
    <g className="streets" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {visible.map((s) => (
        <path key={s.id} className={`street ${s.cls}`} d={s.d} strokeWidth={WIDTH[s.cls] ?? 1} />
      ))}
      {labels && (
        // Labels live in CSS-px space (the group undoes the zoom) so the type
        // is set at a readable size; the guide path is the street rescaled.
        <g className="street-labels" transform={`scale(${inv})`}>
          <defs>
            {visible.map((s) =>
              (s.name || s.nameZh) && s.len >= minLabelLen ? (
                <path key={s.id} id={s.id} d={sketch(s.pts.map((p): Pt => [p[0] / inv, p[1] / inv]), { amplitude: 0 })} />
              ) : null,
            )}
          </defs>
          {visible.map((s) => {
            if (!(s.name || s.nameZh) || s.len < minLabelLen) return null
            const text = zhFirst ? s.nameZh || s.name : s.name || s.nameZh
            return (
              <text key={s.id} dy="-3">
                <textPath href={`#${s.id}`} startOffset="50%" textAnchor="middle">
                  {text}
                </textPath>
              </text>
            )
          })}
        </g>
      )}
    </g>
  )
}

export const Streets = memo(StreetsInner)
