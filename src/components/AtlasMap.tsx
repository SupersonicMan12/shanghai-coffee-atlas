import {
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
import { PAPER_HEIGHT, PAPER_WIDTH, project, walkingMinutes, haversine } from '../lib/projection'
import { sketch } from '../lib/hand'
import { BaseLayers } from './BaseLayers'
import { Glyph } from './Glyphs'

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
  handleRef,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 })
  const [hovered, setHovered] = useState<string | null>(null)
  const drag = useRef<{ px: number; py: number; x: number; y: number; moved: boolean } | null>(null)

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

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const [ux, uy] = toUser(e.clientX, e.clientY)
    drag.current = { px: ux, py: uy, x: view.x, y: view.y, moved: false }
  }

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current
    if (!d) return
    const [ux, uy] = toUser(e.clientX, e.clientY)
    const dx = ux - d.px
    const dy = uy - d.py
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true
    setView((v) => ({ ...v, x: d.x + dx, y: d.y + dy }))
  }

  const endDrag = () => {
    drag.current = null
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

  return (
    <svg
      ref={svgRef}
      className="atlas"
      viewBox={`0 0 ${PAPER_WIDTH} ${PAPER_HEIGHT}`}
      preserveAspectRatio="xMidYMid slice"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      onClick={(e) => {
        if (e.target === svgRef.current && !drag.current?.moved) onSelect(null)
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

        {me && (
          <g
            transform={`translate(${project(me.lng, me.lat).join(',')}) scale(${inv})`}
            className="me"
          >
            <circle r="22" fill="var(--accent)" opacity="0.18" />
            <circle r="7" fill="var(--accent)" stroke="var(--paper)" strokeWidth="2.4" />
            <text y="-16" textAnchor="middle" className="me-label">
              You
            </text>
          </g>
        )}

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
            const dim = !isMatch || (crawl ? !inCrawl : false)
            const label =
              isSel || isHover || showAllLabels || Boolean(inCrawl) || (compassOn && strength > 0.82)

            return (
              <g
                key={cafe.id}
                transform={`translate(${x},${y})`}
                className={`pin${dim ? ' dim' : ''}${active ? ' active' : ''}`}
                onPointerEnter={() => setHovered(cafe.id)}
                onPointerLeave={() => setHovered((h) => (h === cafe.id ? null : h))}
                onClick={(e) => {
                  e.stopPropagation()
                  if (!drag.current?.moved) onSelect(cafe.id)
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
