import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  type Ref,
} from 'react'
import type { Cafe, Crawl } from '../data/types'
import type { Anchor } from '../lib/near'
import { LINE_COLOR } from '../data/metro'
import { BBOX, PAPER_HEIGHT, PAPER_WIDTH, project, walkingMinutes, haversine } from '../lib/projection'
import { sketch } from '../lib/hand'
import { BaseLayers } from './BaseLayers'
import { Glyph } from './Glyphs'
import { UI } from '../data/labels'
import { useI18n } from '../lib/i18n'

export interface View {
  x: number
  y: number
  k: number
}

const MIN_K = 0.85
const MAX_K = 7

export interface AtlasHandle {
  focusOn: (lng: number, lat: number, k?: number) => void
  reset: () => void
  zoomBy: (factor: number) => void
}

interface Props {
  cafes: Cafe[]
  scores: Map<string, number>
  compassOn: boolean
  selectedId: string | null
  onSelect: (id: string | null) => void
  visited: Set<string>
  saved: Set<string>
  crawl: Crawl | null
  crawlCafes: Cafe[]
  me: { lng: number; lat: number } | null
  anchor: Anchor | null
  pinArm: boolean
  onDropPin: (lng: number, lat: number) => void
  handleRef?: Ref<AtlasHandle>
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

export function AtlasMap({
  cafes,
  scores,
  compassOn,
  selectedId,
  onSelect,
  visited,
  saved,
  crawl,
  crawlCafes,
  me,
  anchor,
  pinArm,
  onDropPin,
  handleRef,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 })
  const [hovered, setHovered] = useState<string | null>(null)
  const viewRef = useRef(view)
  useEffect(() => {
    viewRef.current = view
  }, [view])

  // Multi-pointer gesture state: one finger pans, two fingers pinch-zoom.
  const ptrs = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{
    x: number
    y: number
    k: number
    cx: number
    cy: number
    dist: number
    moved: boolean
  } | null>(null)
  const suppressClick = useRef(false)

  const toUser = useCallback((clientX: number, clientY: number): [number, number] => {
    const svg = svgRef.current
    if (!svg) return [0, 0]
    const ctm = svg.getScreenCTM()
    if (!ctm) return [0, 0]
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
    return [pt.x, pt.y]
  }, [])

  useImperativeHandle(
    handleRef,
    () => ({
      focusOn(lng, lat, k = 3.4) {
        const [px, py] = project(lng, lat)
        setView({ k, x: PAPER_WIDTH / 2 - px * k, y: PAPER_HEIGHT / 2 - py * k })
      },
      reset() {
        setView({ x: 0, y: 0, k: 1 })
      },
      zoomBy(factor) {
        setView((v) => {
          const k = clamp(v.k * factor, MIN_K, MAX_K)
          const cx = PAPER_WIDTH / 2
          const cy = PAPER_HEIGHT / 2
          return {
            k,
            x: cx - ((cx - v.x) / v.k) * k,
            y: cy - ((cy - v.y) / v.k) * k,
          }
        })
      },
    }),
    [],
  )

  const onWheel = useCallback(
    (e: ReactWheelEvent<SVGSVGElement>) => {
      const [ux, uy] = toUser(e.clientX, e.clientY)
      setView((v) => {
        const k = clamp(v.k * Math.exp(-e.deltaY * 0.0016), MIN_K, MAX_K)
        return {
          k,
          x: ux - ((ux - v.x) / v.k) * k,
          y: uy - ((uy - v.y) / v.k) * k,
        }
      })
    },
    [toUser],
  )

  const rebaseline = useCallback(() => {
    const pts = [...ptrs.current.values()]
    if (!pts.length) {
      gesture.current = null
      return
    }
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
    const dist = pts.length >= 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0
    const v = viewRef.current
    const moved = gesture.current?.moved ?? false
    gesture.current = { x: v.x, y: v.y, k: v.k, cx, cy, dist, moved }
  }, [])

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const [ux, uy] = toUser(e.clientX, e.clientY)
    ptrs.current.set(e.pointerId, { x: ux, y: uy })
    if (ptrs.current.size === 1) suppressClick.current = false
    rebaseline()
  }

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!ptrs.current.has(e.pointerId)) return
    const [ux, uy] = toUser(e.clientX, e.clientY)
    ptrs.current.set(e.pointerId, { x: ux, y: uy })
    const g = gesture.current
    if (!g) return
    const pts = [...ptrs.current.values()]
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
    let k = g.k
    if (pts.length >= 2 && g.dist > 0) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      k = clamp((g.k * dist) / g.dist, MIN_K, MAX_K)
    }
    if (Math.abs(cx - g.cx) + Math.abs(cy - g.cy) > 4 || k !== g.k) {
      g.moved = true
      suppressClick.current = true
    }
    setView({
      k,
      x: cx - ((g.cx - g.x) / g.k) * k,
      y: cy - ((g.cy - g.y) / g.k) * k,
    })
  }

  const endDrag = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!ptrs.current.delete(e.pointerId)) return
    rebaseline()
  }

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const stop = (e: Event) => e.preventDefault()
    el.addEventListener('wheel', stop, { passive: false })
    return () => el.removeEventListener('wheel', stop)
  }, [])

  const placed = useMemo(
    () =>
      cafes.map((c) => {
        const [x, y] = project(c.lng, c.lat)
        return { cafe: c, x, y }
      }),
    [cafes],
  )

  const route = useMemo(() => {
    if (!crawl || crawlCafes.length < 2) return null
    const pts = crawlCafes.map((c) => project(c.lng, c.lat))
    const legs = crawlCafes.slice(1).map((c, i) => {
      const prev = crawlCafes[i]
      const metres = haversine(prev.lng, prev.lat, c.lng, c.lat)
      const [ax, ay] = pts[i]
      const [bx, by] = pts[i + 1]
      return {
        mins: walkingMinutes(metres),
        mid: [(ax + bx) / 2, (ay + by) / 2] as [number, number],
      }
    })
    return { d: sketch(pts, { amplitude: 4.5, wavelength: 130 }), pts, legs }
  }, [crawl, crawlCafes])

  const crawlIndex = useMemo(() => {
    const m = new Map<string, number>()
    crawlCafes.forEach((c, i) => m.set(c.id, i + 1))
    return m
  }, [crawlCafes])

  const inv = 1 / view.k
  const showAllLabels = view.k > 2.1
  const { t } = useI18n()

  const onHover = useCallback((id: string) => setHovered(id), [])
  const onLeave = useCallback(
    (id: string) => setHovered((h) => (h === id ? null : h)),
    [],
  )

  const onPick = useCallback(
    (id: string) => {
      if (!suppressClick.current) onSelect(id)
    },
    [onSelect],
  )

  const anchorPlace = useMemo(() => {
    if (!anchor) return null
    if (anchor.kind === 'me') return null // drawn by the `me` marker
    const p = anchor.kind === 'metro' ? anchor.station : anchor
    const [x, y] = project(p.lng, p.lat)
    return { x, y }
  }, [anchor])

  return (
    <svg
      ref={svgRef}
      className={`atlas${pinArm ? ' pin-arm' : ''}`}
      viewBox={`0 0 ${PAPER_WIDTH} ${PAPER_HEIGHT}`}
      preserveAspectRatio="xMidYMid slice"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={(e) => {
        if (suppressClick.current) {
          suppressClick.current = false
          return
        }
        if (pinArm) {
          const [ux, uy] = toUser(e.clientX, e.clientY)
          const px = (ux - view.x) / view.k
          const py = (uy - view.y) / view.k
          const lng = BBOX.west + (px / PAPER_WIDTH) * (BBOX.east - BBOX.west)
          const lat = BBOX.north - (py / PAPER_HEIGHT) * (BBOX.north - BBOX.south)
          onDropPin(lng, lat)
          return
        }
        if (e.target === svgRef.current) onSelect(null)
      }}
    >
      <defs>
        <filter id="grain" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="bleed" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="4" seed="19" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="softglow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <radialGradient id="vignette" cx="50%" cy="45%" r="72%">
          <stop offset="60%" stopColor="var(--paper)" stopOpacity="0" />
          <stop offset="100%" stopColor="var(--paper-edge)" stopOpacity="0.95" />
        </radialGradient>
      </defs>

      <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
        <BaseLayers />

        {route && (
          <g className="route">
            <path d={route.d} fill="none" stroke="var(--accent)" strokeWidth={4.5 * inv} opacity="0.2" />
            <path
              d={route.d}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2 * inv}
              strokeDasharray={`${1.5 * inv} ${7 * inv}`}
              strokeLinecap="round"
            />
            {route.legs.map((leg, i) => (
              <text
                key={i}
                x={leg.mid[0]}
                y={leg.mid[1]}
                className="leg-label"
                textAnchor="middle"
                fontSize={11 * inv}
              >
                {leg.mins} min
              </text>
            ))}
          </g>
        )}

        {anchorPlace && anchor && (
          <g
            transform={`translate(${anchorPlace.x},${anchorPlace.y}) scale(${inv})`}
            className="anchor-mark"
          >
            {anchor.kind === 'metro' ? (
              <>
                <circle r="20" fill="var(--glow)" opacity="0.25" filter="url(#softglow)" />
                <circle r="10.5" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.6" />
                <circle
                  r="13.5"
                  fill="none"
                  stroke={LINE_COLOR[anchor.station.lines[0]] ?? 'var(--accent)'}
                  strokeWidth="2.2"
                  strokeDasharray="5 3"
                />
                {/* the metro roundel, sketched: two legs and a crossbar */}
                <path
                  d="M-5.5 4.5 L-3.6 -4.5 L0 1.5 L3.6 -4.5 L5.5 4.5"
                  fill="none"
                  stroke="var(--ink)"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <text y="-22" textAnchor="middle" className="anchor-label">
                  {anchor.station.name}
                </text>
                <text y="32" textAnchor="middle" className="anchor-label zh">
                  {anchor.station.nameZh}
                </text>
              </>
            ) : (
              <>
                <circle r="18" fill="var(--glow)" opacity="0.25" filter="url(#softglow)" />
                <path
                  d="M0 2 C-7 -6 -6 -14 0 -14 C6 -14 7 -6 0 2 Z"
                  fill="var(--accent)"
                  stroke="var(--ink)"
                  strokeWidth="1.2"
                />
                <circle cy="-9" r="2.6" fill="var(--paper)" />
                <ellipse cy="3.4" rx="5" ry="1.4" fill="var(--ink)" opacity="0.25" />
                <text y="-20" textAnchor="middle" className="anchor-label">
                  {t(UI.yourPin)}
                </text>
              </>
            )}
          </g>
        )}

        {me && (
          <g
            transform={`translate(${project(me.lng, me.lat).join(',')}) scale(${inv})`}
            className="me"
          >
            <circle r="22" fill="var(--accent)" opacity="0.18" />
            <circle r="7" fill="var(--accent)" stroke="var(--paper)" strokeWidth="2.4" />
            <text y="-16" textAnchor="middle" className="me-label">
              {t(UI.you)}
            </text>
          </g>
        )}

        <Pins
          placed={placed}
          scores={scores}
          compassOn={compassOn}
          selectedId={selectedId}
          hovered={hovered}
          crawlOn={Boolean(crawl)}
          crawlIndex={crawlIndex}
          visited={visited}
          saved={saved}
          inv={inv}
          showAllLabels={showAllLabels}
          onHover={onHover}
          onLeave={onLeave}
          onPick={onPick}
        />
      </g>

      <rect
        x="0"
        y="0"
        width={PAPER_WIDTH}
        height={PAPER_HEIGHT}
        fill="url(#vignette)"
        pointerEvents="none"
      />
    </svg>
  )
}

interface PinsProps {
  placed: { cafe: Cafe; x: number; y: number }[]
  scores: Map<string, number>
  compassOn: boolean
  selectedId: string | null
  hovered: string | null
  crawlOn: boolean
  crawlIndex: Map<string, number>
  visited: Set<string>
  saved: Set<string>
  inv: number
  showAllLabels: boolean
  onHover: (id: string) => void
  onLeave: (id: string) => void
  onPick: (id: string) => void
}

/**
 * The pin layer is by far the widest subtree (600 cafés × several nodes), so
 * it is memoized: panning and pinching only change the parent transform and
 * skip re-rendering every pin.
 */
const Pins = memo(function Pins({
  placed,
  scores,
  compassOn,
  selectedId,
  hovered,
  crawlOn,
  crawlIndex,
  visited,
  saved,
  inv,
  showAllLabels,
  onHover,
  onLeave,
  onPick,
}: PinsProps) {
  return (
    <g>
      {placed.map(({ cafe, x, y }) => {
        const score = scores.get(cafe.id)
        const isMatch = score !== undefined
        const isSel = selectedId === cafe.id
        const isHover = hovered === cafe.id
        const inCrawl = crawlIndex.get(cafe.id)
        const strength = compassOn && score !== undefined ? clamp((score - 50) / 45, 0, 1) : 1
        const r = (11 + (compassOn ? strength * 6 : 2)) * inv
        const active = isSel || isHover
        const dim = !isMatch || (crawlOn ? !inCrawl : false)
        const label =
          isSel || isHover || showAllLabels || Boolean(inCrawl) || (compassOn && strength > 0.82)

        return (
          <g
            key={cafe.id}
            transform={`translate(${x},${y})`}
            className={`pin${dim ? ' dim' : ''}${active ? ' active' : ''}`}
            onPointerEnter={() => onHover(cafe.id)}
            onPointerLeave={() => onLeave(cafe.id)}
            onClick={(e) => {
              e.stopPropagation()
              onPick(cafe.id)
            }}
          >
                {(active || (compassOn && strength > 0.9)) && (
                  <circle r={r * 2} fill="var(--glow)" opacity="0.5" filter="url(#softglow)" />
                )}
                <circle r={r} fill="var(--pin-fill)" stroke="var(--ink)" strokeWidth={1.4 * inv} />
                <circle
                  r={r + 2.5 * inv}
                  fill="none"
                  stroke="var(--ink)"
                  strokeWidth={0.7 * inv}
                  strokeDasharray={`${1 * inv} ${3 * inv}`}
                  opacity={active ? 0.9 : 0.35}
                />
                <g transform={`scale(${(r / 11) * 0.95})`}>
                  <Glyph archetype={cafe.archetype} color="var(--ink)" />
                </g>
                {visited.has(cafe.id) && (
                  <g transform={`translate(${r * 0.72},${-r * 0.72}) scale(${inv})`}>
                    <circle r="6" fill="var(--stamp)" opacity="0.92" />
                    <path
                      d="M-2.6 0.2 l1.8 1.9 l3.5 -4"
                      fill="none"
                      stroke="var(--paper)"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                )}
                {saved.has(cafe.id) && !visited.has(cafe.id) && (
                  <g transform={`translate(${r * 0.72},${-r * 0.72}) scale(${inv})`}>
                    <circle r="5.4" fill="var(--accent)" opacity="0.9" />
                    <path
                      d="M0 -3 l0.9 2 l2.2 0.2 l-1.7 1.5 l0.5 2.2 l-1.9 -1.2 l-1.9 1.2 l0.5 -2.2 l-1.7 -1.5 l2.2 -0.2 z"
                      fill="var(--paper)"
                    />
                  </g>
                )}
                {inCrawl && (
                  <g transform={`translate(${-r * 0.9},${-r * 0.9}) scale(${inv})`}>
                    <circle r="7.5" fill="var(--accent)" />
                    <text className="crawl-num" textAnchor="middle" y="3.4">
                      {inCrawl}
                    </text>
                  </g>
                )}
                {label && (
                  <g transform={`translate(0,${r + 13 * inv}) scale(${inv})`}>
                    <text className="pin-label" textAnchor="middle">
                      {cafe.name}
                    </text>
                    <text className="pin-label zh" textAnchor="middle" y="12">
                      {cafe.nameZh}
                    </text>
                  </g>
                )}
          </g>
        )
      })}
    </g>
  )
})
