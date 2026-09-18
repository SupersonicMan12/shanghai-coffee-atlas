import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react'
import type { Cafe } from '../data/types'
import type { Anchor } from '../lib/near'
import { LINE_COLOR } from '../data/metro'
import { BBOX, PAPER_HEIGHT, PAPER_WIDTH, project } from '../lib/projection'
import { blot, numerals, pennant } from '../lib/hand'
import { BaseLayers, BaseRaster } from './BaseLayers'
import { paletteHost, readBasemapColors, sameColors, type BasemapColors } from '../lib/basemapColors'
import { Glyph } from './Glyphs'
import { UI } from '../data/labels'
import { useI18n, type LangMode } from '../lib/i18n'
import { displayNames } from '../lib/names'
import { detailFor } from '../lib/details'
import {
  bucketK,
  clamp,
  clusterQuiet,
  isQuietPin,
  labelSet,
  layoutFor,
  pinRadius,
  basePinRadius,
  QUIET_R,
  strengthOf,
  tierOf,
  type Density,
  type Layout,
  type Tier,
} from '../lib/pins'

export interface View {
  x: number
  y: number
  k: number
}

const MIN_K = 0.85
const MAX_K = 7

/** Pointer travel (CSS px) before a press stops being a tap and becomes a drag. */
const DRAG_PX = 6
const DOUBLE_TAP_MS = 320
const DOUBLE_TAP_PX = 24
const WHEEL_SETTLE_MS = 90
const KINETIC_DECAY = 0.92
const KINETIC_STOP_PX = 0.05
const WHEEL_LERP = 0.25
const RUBBER = 0.32

export interface AtlasHandle {
  focusOn: (lng: number, lat: number, k?: number) => void
  reset: () => void
  zoomBy: (factor: number) => void
}

interface Props {
  cafes: Cafe[]
  scores: Map<string, number>
  /** Cafés shut at the selected hour; they leave the sheet (the selected one stays). */
  closed: Set<string>
  compassOn: boolean
  /** The compass's top picks, in order. Derived from `scores` when absent. */
  topIds?: string[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  visited: Set<string>
  saved: Set<string>
  me: { lng: number; lat: number } | null
  anchor: Anchor | null
  pinArm: boolean
  onDropPin: (lng: number, lat: number) => void
  handleRef?: Ref<AtlasHandle>
}

/** How the paper sits in the stage: base scale and centring offset, in CSS px. */
interface Metrics {
  s0: number
  offX: number
  offY: number
  w: number
  h: number
  left: number
  top: number
}

interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

function measure(el: HTMLElement): Metrics {
  const r = el.getBoundingClientRect()
  const w = el.clientWidth || r.width
  const h = el.clientHeight || r.height
  const s0 = Math.max(w / PAPER_WIDTH, h / PAPER_HEIGHT) || 1
  return {
    s0,
    offX: (w - PAPER_WIDTH * s0) / 2,
    offY: (h - PAPER_HEIGHT * s0) / 2,
    w,
    h,
    left: r.left,
    top: r.top,
  }
}

/** The view that shows the whole sheet, centred, with a hair of margin. */
function wholeSheet(m: Metrics): View {
  const k = Math.max(MIN_K, (Math.min(m.w / PAPER_WIDTH, m.h / PAPER_HEIGHT) / m.s0) * 0.98)
  return { k, x: (PAPER_WIDTH * (1 - k)) / 2, y: (PAPER_HEIGHT * (1 - k)) / 2 }
}

/** The part of user space (paper at k=1) currently on screen. */
function visibleRect(m: Metrics): Rect {
  return {
    left: -m.offX / m.s0,
    top: -m.offY / m.s0,
    right: (m.w - m.offX) / m.s0,
    bottom: (m.h - m.offY) / m.s0,
  }
}

function zoomAbout(v: View, k: number, ux: number, uy: number): View {
  return { k, x: ux - ((ux - v.x) / v.k) * k, y: uy - ((uy - v.y) / v.k) * k }
}

/** Where the paper is allowed to sit: never off the stage, centred when smaller than it. */
function clampView(v: View, vis: Rect): View {
  const w = PAPER_WIDTH * v.k
  const h = PAPER_HEIGHT * v.k
  const vw = vis.right - vis.left
  const vh = vis.bottom - vis.top
  const x = w >= vw ? clamp(v.x, vis.right - w, vis.left) : clamp(v.x, vis.left, vis.right - w)
  const y = h >= vh ? clamp(v.y, vis.bottom - h, vis.top) : clamp(v.y, vis.top, vis.bottom - h)
  return { k: v.k, x, y }
}

/** Soft resistance past the edge while a finger is still down. */
function rubber(v: View, vis: Rect): View {
  const c = clampView(v, vis)
  return {
    k: v.k,
    x: c.x + (v.x - c.x) * RUBBER,
    y: c.y + (v.y - c.y) * RUBBER,
  }
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

function sameView(a: View, b: View): boolean {
  return Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01 && Math.abs(a.k - b.k) < 0.0001
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

function hoverCapable(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches
}

interface Fly {
  from: View
  to: View
  t0: number
  dur: number
}

interface Motion {
  fly: Fly | null
  /** Eased wheel zoom: where we are heading and the user-space point held still. */
  targetK: number | null
  ax: number
  ay: number
  lastWheel: number
  /** Kinetic pan, user units per frame. */
  vx: number
  vy: number
  raf: number
}

interface Gesture {
  x: number
  y: number
  k: number
  cx: number
  cy: number
  dist: number
  moved: boolean
  captured: number | null
  /** Centroid samples (user units) for the release velocity. */
  trail: { t: number; x: number; y: number }[]
}

export function AtlasMap({
  cafes,
  scores,
  closed,
  compassOn,
  topIds,
  selectedId,
  onSelect,
  visited,
  saved,
  me,
  anchor,
  pinArm,
  onDropPin,
  handleRef,
}: Props) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 })
  const [hovered, setHovered] = useState<string | null>(null)
  const [colors, setColors] = useState<BasemapColors | null>(null)
  const [rasterReady, setRasterReady] = useState(false)
  const { mode, t } = useI18n()

  /** The view painted on screen right now; React's `view` trails it by one gesture. */
  const cur = useRef<View>(view)
  const metrics = useRef<Metrics>({
    s0: 1,
    offX: 0,
    offY: 0,
    w: PAPER_WIDTH,
    h: PAPER_HEIGHT,
    left: 0,
    top: 0,
  })
  const motion = useRef<Motion>({
    fly: null,
    targetK: null,
    ax: 0,
    ay: 0,
    lastWheel: 0,
    vx: 0,
    vy: 0,
    raf: 0,
  })
  const ptrs = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<Gesture | null>(null)
  const suppressClick = useRef(false)
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null)
  const reduced = useRef(false)
  const canHover = useRef(false)
  const onSelectRef = useRef(onSelect)
  /** Stage geometry mirrored into state for the few things React lays out (the tooltip). */
  const [stageBox, setStageBox] = useState<Metrics | null>(null)

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    reduced.current = prefersReducedMotion()
    canHover.current = hoverCapable()
  }, [])

  // ------------------------------------------------------------ transform ---

  // The sheet transform is driven through a paused Web Animation: an inline
  // style write makes Blink re-layerize every paint chunk under the sheet
  // (thousands of pins) per frame; a keyframe update only touches the
  // compositor transform node.
  const sheetAnim = useRef<Animation | null>(null)

  const apply = useCallback((v: View) => {
    const sheet = sheetRef.current
    if (!sheet) return
    const m = metrics.current
    const transform = `translate(${(m.offX + v.x * m.s0).toFixed(2)}px, ${(m.offY + v.y * m.s0).toFixed(2)}px) scale(${(v.k * m.s0).toFixed(5)})`
    if (typeof sheet.animate !== 'function') {
      sheet.style.transform = transform
      return
    }
    const a = sheetAnim.current
    if (a && a.effect instanceof KeyframeEffect) {
      a.effect.setKeyframes([{ transform }, { transform }])
      return
    }
    const created = sheet.animate([{ transform }, { transform }], { duration: 1000, fill: 'both' })
    created.pause()
    sheetAnim.current = created
  }, [])

  useEffect(
    () => () => {
      sheetAnim.current?.cancel()
      sheetAnim.current = null
    },
    [],
  )

  const setGesturing = useCallback((on: boolean) => {
    const sheet = sheetRef.current
    if (!sheet) return
    if (on === ('gesturing' in sheet.dataset)) return
    if (on) sheet.dataset.gesturing = ''
    else delete sheet.dataset.gesturing
  }, [])

  const commit = useCallback(() => {
    setGesturing(false)
    const v = cur.current
    setView((prev) => (sameView(prev, v) ? prev : v))
  }, [setGesturing])

  const toUser = useCallback((clientX: number, clientY: number): [number, number] => {
    const m = metrics.current
    return [(clientX - m.left - m.offX) / m.s0, (clientY - m.top - m.offY) / m.s0]
  }, [])

  const stopMotion = useCallback(() => {
    const m = motion.current
    m.fly = null
    m.targetK = null
    m.vx = 0
    m.vy = 0
  }, [])

  const schedule = useCallback(() => {
    if (motion.current.raf) return
    motion.current.raf = requestAnimationFrame(function frame() {
      const m = motion.current
      m.raf = 0
      if (gesture.current) {
        apply(cur.current)
        return
      }
      const now = performance.now()
      let v = cur.current
      let busy = false
      const vis = visibleRect(metrics.current)

      if (m.fly) {
        const t = clamp((now - m.fly.t0) / m.fly.dur, 0, 1)
        const e = easeInOut(t)
        const { from, to } = m.fly
        const k = from.k * Math.pow(to.k / from.k, e)
        const fcx = (PAPER_WIDTH / 2 - from.x) / from.k
        const fcy = (PAPER_HEIGHT / 2 - from.y) / from.k
        const tcx = (PAPER_WIDTH / 2 - to.x) / to.k
        const tcy = (PAPER_HEIGHT / 2 - to.y) / to.k
        const cx = fcx + (tcx - fcx) * e
        const cy = fcy + (tcy - fcy) * e
        v = { k, x: PAPER_WIDTH / 2 - cx * k, y: PAPER_HEIGHT / 2 - cy * k }
        if (t >= 1) {
          v = to
          m.fly = null
        } else busy = true
      } else {
        if (m.targetK !== null) {
          const close = Math.abs(m.targetK - v.k) < 0.0015
          const nk = close ? m.targetK : v.k + (m.targetK - v.k) * WHEEL_LERP
          v = zoomAbout(v, nk, m.ax, m.ay)
          if (close) m.targetK = null
          else busy = true
        }
        if (now - m.lastWheel < WHEEL_SETTLE_MS) busy = true

        if (m.vx !== 0 || m.vy !== 0) {
          v = { k: v.k, x: v.x + m.vx, y: v.y + m.vy }
          m.vx *= KINETIC_DECAY
          m.vy *= KINETIC_DECAY
          if (Math.hypot(m.vx, m.vy) * metrics.current.s0 < KINETIC_STOP_PX) {
            m.vx = 0
            m.vy = 0
          } else busy = true
        }

        const c = clampView(v, vis)
        const dx = c.x - v.x
        const dy = c.y - v.y
        if (dx !== 0 || dy !== 0) {
          if (dx !== 0) m.vx = 0
          if (dy !== 0) m.vy = 0
          if (reduced.current || Math.abs(dx) + Math.abs(dy) < 0.5 / metrics.current.s0) {
            v = c
          } else {
            v = { k: v.k, x: v.x + dx * 0.22, y: v.y + dy * 0.22 }
            busy = true
          }
        }
      }

      cur.current = v
      apply(v)
      if (busy) m.raf = requestAnimationFrame(frame)
      else commit()
    })
  }, [apply, commit])

  useEffect(() => {
    const m = motion.current
    if (m.fly || m.targetK !== null || m.vx || m.vy) schedule()
    return () => {
      if (m.raf) cancelAnimationFrame(m.raf)
      m.raf = 0
    }
  }, [schedule])

  const flyTo = useCallback(
    (to: View, baseMs: number, maxMs = baseMs) => {
      const from = cur.current
      to = clampView({ ...to, k: clamp(to.k, MIN_K, MAX_K) }, visibleRect(metrics.current))
      gesture.current = null
      ptrs.current.clear()
      stopMotion()
      if (reduced.current || sameView(from, to)) {
        cur.current = to
        apply(to)
        commit()
        return
      }
      const m = metrics.current
      const fcx = (PAPER_WIDTH / 2 - from.x) / from.k
      const fcy = (PAPER_HEIGHT / 2 - from.y) / from.k
      const tcx = (PAPER_WIDTH / 2 - to.x) / to.k
      const tcy = (PAPER_HEIGHT / 2 - to.y) / to.k
      const travel = Math.hypot(tcx - fcx, tcy - fcy) * Math.max(from.k, to.k) * m.s0
      const zoom = Math.abs(Math.log(to.k / from.k))
      const dur = clamp(baseMs + travel * 0.12 + zoom * 90, baseMs, maxMs)
      motion.current.fly = { from, to, t0: performance.now(), dur }
      setGesturing(true)
      schedule()
    },
    [apply, commit, schedule, setGesturing, stopMotion],
  )

  useImperativeHandle(
    handleRef,
    () => ({
      focusOn(lng, lat, k = 3.4) {
        const [px, py] = project(lng, lat)
        flyTo({ k, x: PAPER_WIDTH / 2 - px * k, y: PAPER_HEIGHT / 2 - py * k }, 480, 640)
      },
      reset() {
        flyTo(wholeSheet(metrics.current), 480, 640)
      },
      zoomBy(factor) {
        const v = cur.current
        flyTo(zoomAbout(v, clamp(v.k * factor, MIN_K, MAX_K), PAPER_WIDTH / 2, PAPER_HEIGHT / 2), 300)
      },
    }),
    [flyTo],
  )

  // -------------------------------------------------------------- layout ---

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    metrics.current = measure(stage)
    setStageBox(metrics.current)
    apply(cur.current)
    const ro = new ResizeObserver(() => {
      metrics.current = measure(stage)
      setStageBox(metrics.current)
      apply(cur.current)
      if (!gesture.current) schedule()
    })
    ro.observe(stage)
    return () => ro.disconnect()
  }, [apply, schedule])

  useLayoutEffect(() => {
    if (!gesture.current && !motion.current.raf) {
      cur.current = view
      apply(view)
    }
  }, [view, apply])

  // The palette lives in CSS variables the app shell sets inline for the hour;
  // the bitmap needs real colours, so read them and watch that element.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const read = () => {
      const next = readBasemapColors(stage)
      if (next) setColors((prev) => (sameColors(prev, next) ? prev : next))
    }
    read()
    const host = paletteHost(stage)
    if (!host) return
    const mo = new MutationObserver(read)
    mo.observe(host, { attributes: true, attributeFilter: ['style', 'class'] })
    return () => mo.disconnect()
  }, [])

  // ------------------------------------------------------------- pointers ---

  const rebaseline = useCallback(() => {
    const pts = [...ptrs.current.values()]
    if (!pts.length) {
      gesture.current = null
      return
    }
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
    const dist = pts.length >= 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0
    const v = cur.current
    const prev = gesture.current
    gesture.current = {
      x: v.x,
      y: v.y,
      k: v.k,
      cx,
      cy,
      dist,
      moved: prev?.moved ?? false,
      captured: prev?.captured ?? null,
      trail: [],
    }
  }, [])

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    if (ptrs.current.size === 0) {
      metrics.current = measure(e.currentTarget)
      suppressClick.current = false
      // A press that catches the paper mid-glide is a stop, not a pick.
      const gliding = Math.hypot(motion.current.vx, motion.current.vy) * metrics.current.s0 > 1.5
      const wasMoving = motion.current.fly !== null || gliding
      stopMotion()
      if (wasMoving) suppressClick.current = true
      setHovered(null)
    }
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    rebaseline()
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!ptrs.current.has(e.pointerId)) return
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
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
    if (!g.moved && (Math.hypot(cx - g.cx, cy - g.cy) > DRAG_PX || k !== g.k)) {
      g.moved = true
      suppressClick.current = true
      setGesturing(true)
    }
    if (g.moved && g.captured === null) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
        g.captured = e.pointerId
      } catch {
        // pointer already gone; nothing to hold
      }
    }
    if (!g.moved) return
    const [ux, uy] = toUser(cx, cy)
    const [ux0, uy0] = toUser(g.cx, g.cy)
    const raw: View = {
      k,
      x: ux - ((ux0 - g.x) / g.k) * k,
      y: uy - ((uy0 - g.y) / g.k) * k,
    }
    const v = rubber(raw, visibleRect(metrics.current))
    const now = performance.now()
    g.trail.push({ t: now, x: v.x, y: v.y })
    while (g.trail.length > 2 && now - g.trail[0].t > 80) g.trail.shift()
    cur.current = v
    schedule()
  }

  const release = useCallback(
    (pointerId: number, clientX?: number, clientY?: number) => {
      if (!ptrs.current.delete(pointerId)) return
      const g = gesture.current
      if (ptrs.current.size > 0) {
        rebaseline()
        return
      }
      gesture.current = null
      if (!g) return
      const m = motion.current
      if (g.moved) {
        const trail = g.trail
        const now = performance.now()
        if (trail.length >= 2 && now - trail[trail.length - 1].t < 100 && !reduced.current) {
          const a = trail[0]
          const b = trail[trail.length - 1]
          const dt = Math.max(1, b.t - a.t)
          m.vx = ((b.x - a.x) / dt) * (1000 / 60)
          m.vy = ((b.y - a.y) / dt) * (1000 / 60)
          const cap = 60 / metrics.current.s0
          const speed = Math.hypot(m.vx, m.vy)
          if (speed > cap) {
            m.vx = (m.vx / speed) * cap
            m.vy = (m.vy / speed) * cap
          }
        }
        schedule()
        return
      }
      // A clean tap. Two of them in quick succession, close together, zoom in.
      if (clientX !== undefined && clientY !== undefined) {
        const now = performance.now()
        const prev = lastTap.current
        if (prev && now - prev.t < DOUBLE_TAP_MS && Math.hypot(clientX - prev.x, clientY - prev.y) < DOUBLE_TAP_PX) {
          lastTap.current = null
          suppressClick.current = true
          const [ux, uy] = toUser(clientX, clientY)
          const v = cur.current
          flyTo(zoomAbout(v, clamp(v.k * 1.6, MIN_K, MAX_K), ux, uy), 320)
          return
        }
        lastTap.current = { t: now, x: clientX, y: clientY }
      }
      schedule()
    },
    [flyTo, rebaseline, schedule, toUser],
  )

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    release(e.pointerId, e.clientX, e.clientY)
  }

  useEffect(() => {
    const end = (e: PointerEvent) => release(e.pointerId)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [release])

  // Wheel and the iOS pinch gesture need non-passive listeners, which React
  // does not offer; keep the page still and ease the zoom toward its target.
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (gesture.current) return
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY
      if (!dy) return
      const m = motion.current
      // Measure once per burst: a layout read mid-zoom forces SVG text to re-lay out.
      if (performance.now() - m.lastWheel > WHEEL_SETTLE_MS) metrics.current = measure(el)
      setHovered(null)
      m.fly = null
      m.vx = 0
      m.vy = 0
      const base = m.targetK ?? cur.current.k
      const factor = Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0016))
      const target = clamp(base * factor, MIN_K, MAX_K)
      const [ux, uy] = toUser(e.clientX, e.clientY)
      m.ax = ux
      m.ay = uy
      m.lastWheel = performance.now()
      if (reduced.current) {
        cur.current = zoomAbout(cur.current, target, ux, uy)
        m.targetK = null
      } else {
        m.targetK = target
      }
      setGesturing(true)
      schedule()
    }
    const stop = (e: Event) => e.preventDefault()
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('gesturestart', stop)
    el.addEventListener('gesturechange', stop)
    el.addEventListener('touchmove', stop, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('gesturestart', stop)
      el.removeEventListener('gesturechange', stop)
      el.removeEventListener('touchmove', stop)
    }
  }, [schedule, setGesturing, toUser])

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    const v = cur.current
    const step = 80 / v.k
    const pan = (dx: number, dy: number) => flyTo({ k: v.k, x: v.x - dx * v.k, y: v.y - dy * v.k }, 180)
    switch (e.key) {
      case '+':
      case '=':
        flyTo(zoomAbout(v, clamp(v.k * 1.45, MIN_K, MAX_K), PAPER_WIDTH / 2, PAPER_HEIGHT / 2), 300)
        break
      case '-':
      case '_':
        flyTo(zoomAbout(v, clamp(v.k / 1.45, MIN_K, MAX_K), PAPER_WIDTH / 2, PAPER_HEIGHT / 2), 300)
        break
      case '0':
        flyTo({ x: 0, y: 0, k: 1 }, 480, 640)
        break
      case 'ArrowLeft':
        pan(-step, 0)
        break
      case 'ArrowRight':
        pan(step, 0)
        break
      case 'ArrowUp':
        pan(0, -step)
        break
      case 'ArrowDown':
        pan(0, step)
        break
      case 'Escape':
        onSelect(null)
        break
      default:
        return
    }
    e.preventDefault()
  }

  // ----------------------------------------------------------------- data ---

  const layout = useMemo(() => layoutFor(cafes), [cafes])

  const kb = bucketK(view.k)
  const inv = 1 / view.k

  // A zoom commit re-sizes every pin at once; that is a snap, not a breath,
  // so the ink transitions are held off for the frame it lands in.
  useLayoutEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return
    sheet.dataset.snap = ''
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => delete sheet.dataset.snap)
    })
    return () => {
      cancelAnimationFrame(raf)
      delete sheet.dataset.snap
    }
  }, [view.k])

  const topKey = compassOn ? (topIds ? topIds.slice(0, 3).join('|') : '') : 'off'
  const top = useMemo<string[]>(() => {
    if (topKey === 'off') return []
    if (topKey) return topKey.split('|')
    const best: { id: string; score: number }[] = []
    scores.forEach((score, id) => {
      if (best.length < 3 || score > best[best.length - 1].score) {
        best.push({ id, score })
        best.sort((a, b) => b.score - a.score)
        if (best.length > 3) best.pop()
      }
    })
    return best.map((b) => b.id)
  }, [topKey, scores])

  const density = useMemo<Density>(
    () => clusterQuiet(layout, kb, compassOn, scores, selectedId),
    [layout, kb, compassOn, scores, selectedId],
  )

  const gone = useMemo(() => {
    if (closed.size === 0) return density.hidden
    const out = new Set(density.hidden)
    closed.forEach((id) => {
      if (id !== selectedId) out.add(id)
    })
    return out
  }, [density.hidden, closed, selectedId])

  const labelIds = useMemo(
    () =>
      labelSet({
        layout,
        k: kb,
        scores,
        compassOn,
        selectedId,
        topIds: top,
        hidden: gone,
        mode,
      }),
    [layout, kb, scores, compassOn, selectedId, top, gone, mode],
  )

  // Labels that just lost their slot stay mounted for one beat so they can
  // fade out instead of popping.
  const [fading, setFading] = useState<Set<string>>(EMPTY_IDS)
  const prevLabels = useRef(labelIds)
  useEffect(() => {
    const prev = prevLabels.current
    if (prev === labelIds) return
    prevLabels.current = labelIds
    const gone = new Set<string>()
    prev.forEach((id) => {
      if (!labelIds.has(id)) gone.add(id)
    })
    setFading(gone.size ? gone : EMPTY_IDS)
    if (!gone.size) return
    const handle = window.setTimeout(() => setFading(EMPTY_IDS), 280)
    return () => window.clearTimeout(handle)
  }, [labelIds])

  const onHover = useCallback((id: string) => {
    if (canHover.current && !gesture.current && !motion.current.raf) setHovered(id)
  }, [])
  const onLeave = useCallback((id: string) => setHovered((h) => (h === id ? null : h)), [])

  const onPick = useCallback((id: string) => {
    if (!suppressClick.current) onSelectRef.current(id)
  }, [])

  const anchorPlace = useMemo(() => {
    if (!anchor) return null
    if (anchor.kind === 'me') return null // drawn by the `me` marker
    const p = anchor.kind === 'metro' ? anchor.station : anchor
    const [x, y] = project(p.lng, p.lat)
    return { x, y }
  }, [anchor])

  const tip = useMemo(() => {
    if (!hovered || !stageBox) return null
    const i = layout.index.get(hovered)
    if (i === undefined) return null
    const cafe = layout.cafes[i]
    const m = stageBox
    const names = displayNames(cafe, mode)
    const headline = detailFor(cafe).headline
    const r = pinRadius(kb, cafe, strengthOf(compassOn, scores.get(cafe.id)), true)
    const sx = m.offX + (layout.xs[i] * view.k + view.x) * m.s0
    const sy = m.offY + (layout.ys[i] * view.k + view.y) * m.s0
    const below = sy < 96
    return {
      left: sx,
      top: below ? sy + (r + 8) * m.s0 : sy - (r + 8) * m.s0,
      below,
      name: names.primary,
      sub: names.secondary,
      line: headline ? t(headline) : cafe.hood,
      isHeadline: Boolean(headline),
    }
  }, [hovered, stageBox, layout, mode, kb, compassOn, scores, view, t])

  return (
    <div
      ref={stageRef}
      className={`atlas${pinArm ? ' pin-arm' : ''}`}
      tabIndex={0}
      role="application"
      aria-label={t(UI.wholeSheet)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      onClick={(e) => {
        if (suppressClick.current) {
          suppressClick.current = false
          return
        }
        if (pinArm) {
          const [ux, uy] = toUser(e.clientX, e.clientY)
          const v = cur.current
          const px = (ux - v.x) / v.k
          const py = (uy - v.y) / v.k
          const lng = BBOX.west + (px / PAPER_WIDTH) * (BBOX.east - BBOX.west)
          const lat = BBOX.north - (py / PAPER_HEIGHT) * (BBOX.north - BBOX.south)
          onDropPin(lng, lat)
          return
        }
        onSelect(null)
      }}
    >
      <div ref={sheetRef} className="paper" style={{ width: PAPER_WIDTH, height: PAPER_HEIGHT }}>
        <BaseRaster colors={colors} k={kb} onReady={setRasterReady} />
        <svg
          className="paper-svg"
          viewBox={`0 0 ${PAPER_WIDTH} ${PAPER_HEIGHT}`}
          width={PAPER_WIDTH}
          height={PAPER_HEIGHT}
        >
          <defs>
            <radialGradient id="halo">
              <stop offset="0%" stopColor="var(--glow)" stopOpacity="0.55" />
              <stop offset="55%" stopColor="var(--glow)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--glow)" stopOpacity="0" />
            </radialGradient>
          </defs>

          <g className="viewport">
            <BaseLayers k={kb} raster={rasterReady} />

            {anchorPlace && anchor && (
              <g transform={`translate(${anchorPlace.x},${anchorPlace.y}) scale(${inv})`} className="anchor-mark">
                {anchor.kind === 'metro' ? (
                  <>
                    <circle r="26" fill="url(#halo)" />
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
                    <circle r="24" fill="url(#halo)" />
                    <path
                      d="M0 2 C-7 -6 -6 -14 0 -14 C6 -14 7 -6 0 2 Z"
                      fill="var(--accent)"
                      stroke="var(--ink)"
                      strokeWidth="1.2"
                    />
                    <circle cy="-9" r="2.6" fill="var(--paper)" />
                    <ellipse cy="3.4" rx="5" ry="1.4" fill="var(--ink)" fillOpacity="0.25" />
                    <text y="-20" textAnchor="middle" className="anchor-label">
                      {t(UI.yourPin)}
                    </text>
                  </>
                )}
              </g>
            )}

            <Blots clusters={density.clusters} inv={inv} />

            <Pins
              layout={layout}
              scores={scores}
              compassOn={compassOn}
              selectedId={selectedId}
              hovered={hovered}
              visited={visited}
              saved={saved}
              k={kb}
              inv={inv}
              labelIds={labelIds}
              fading={fading}
              topIds={top}
              hidden={gone}
              mode={mode}
              onHover={onHover}
              onLeave={onLeave}
              onPick={onPick}
            />

            {me && (
              <g
                transform={`translate(${project(me.lng, me.lat).join(',')}) scale(${inv})`}
                className="me"
                pointerEvents="none"
              >
                <circle className="me-pulse" r="18" fill="none" stroke="var(--accent)" strokeWidth="2" />
                <circle r="30" fill="var(--accent)" fillOpacity="0.14" />
                <circle r="10" fill="var(--accent)" stroke="var(--paper)" strokeWidth="3" />
                <circle r="3.2" fill="var(--paper)" />
                <text y="-24" textAnchor="middle" className="me-label">
                  {t(UI.youAreHere)}
                </text>
              </g>
            )}
          </g>
        </svg>
      </div>

      <svg className="vignette" aria-hidden="true">
        <defs>
          <radialGradient id="vignette" cx="50%" cy="45%" r="72%">
            <stop offset="60%" stopColor="var(--paper)" stopOpacity="0" />
            <stop offset="100%" stopColor="var(--paper-edge)" stopOpacity="0.95" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="url(#vignette)" />
      </svg>

      {tip && (
        <div className={`pin-tip${tip.below ? ' below' : ''}`} style={{ left: tip.left, top: tip.top }} role="tooltip">
          <strong>{tip.name}</strong>
          {tip.sub && <span className="zh">{tip.sub}</span>}
          <em className={tip.isHeadline ? 'headline' : 'hood'}>{tip.line}</em>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- pins ---

const EMPTY_IDS = new Set<string>()
const BLOTS = [0, 1, 2, 3, 4].map((seed) => blot(seed + 3))
const PENNANTS = [0, 1, 2].map((seed) => pennant(seed + 11))
const COUNTS = new Map<number, string>()
function countPath(n: number): string {
  let d = COUNTS.get(n)
  if (d === undefined) {
    d = numerals(`×${n}`, n)
    COUNTS.set(n, d)
  }
  return d
}

const Blots = memo(function Blots({ clusters, inv }: { clusters: Density['clusters']; inv: number }) {
  if (!clusters.length) return null
  return (
    <g className="blots" pointerEvents="none">
      {clusters.map((c, i) => {
        const r = (8 + Math.min(6, Math.sqrt(c.n) * 1.6)) * inv
        return (
          <g key={c.key} className="blot" transform={`translate(${c.x},${c.y})`}>
            <path d={BLOTS[i % BLOTS.length]} transform={`scale(${r})`} fill="var(--ink-soft)" fillOpacity="0.42" />
            <path d={BLOTS[(i + 2) % BLOTS.length]} transform={`scale(${r * 0.72})`} fill="var(--ink)" fillOpacity="0.35" />
            <path className="blot-n" d={countPath(c.n)} transform={`scale(${inv}) translate(0,4)`} />
          </g>
        )
      })}
    </g>
  )
})

interface PinsProps {
  layout: Layout
  scores: Map<string, number>
  compassOn: boolean
  selectedId: string | null
  hovered: string | null
  visited: Set<string>
  saved: Set<string>
  /** Bucketed committed zoom; the layer never sees mid-gesture values. */
  k: number
  inv: number
  labelIds: Set<string>
  fading: Set<string>
  topIds: string[]
  hidden: Set<string>
  mode: LangMode
  onHover: (id: string) => void
  onLeave: (id: string) => void
  onPick: (id: string) => void
}

interface PinProps {
  cafe: Cafe
  x: number
  y: number
  k: number
  inv: number
  strength: number | null
  tier: Tier | null
  isSel: boolean
  isHover: boolean
  dim: boolean
  visited: boolean
  saved: boolean
  label: boolean
  fade: boolean
  place: number | undefined
  mode: LangMode
  onHover: (id: string) => void
  onLeave: (id: string) => void
  onPick: (id: string) => void
}

/** One café. Memoised on primitives so a score update only re-renders the pins whose ink changes. */
const Pin = memo(function Pin({
  cafe,
  x,
  y,
  k,
  inv,
  strength,
  tier,
  isSel,
  isHover,
  dim,
  visited,
  saved,
  label,
  fade,
  place,
  mode,
  onHover,
  onLeave,
  onPick,
}: PinProps) {
  const active = isSel || isHover
  const quiet = isQuietPin(k, cafe, strength, active)
  // Only the inked circles follow the score; glyph, badges and label sit on
  // the zoom-level frame so a slider drag never relayouts their paths.
  const pinR = pinRadius(k, cafe, strength, active)
  const frameR = quiet ? QUIET_R : basePinRadius(k) + (strength === null ? 1 : 5)
  const r = pinR * inv
  const f = frameR * inv
  const showGlyph = frameR >= 7
  const halo = active || tier === 'hi' || place !== undefined
  const names = label || fade ? displayNames(cafe, mode) : null

  return (
    <g
      data-id={cafe.id}
      transform={`translate(${x},${y})`}
      className={`pin${quiet ? ' quiet' : ''}${dim ? ' dim' : ''}${active ? ' active' : ''}${tier ? ` ${tier}` : ''}${
        place !== undefined ? ' top' : ''
      }`}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') onHover(cafe.id)
      }}
      onPointerLeave={() => onLeave(cafe.id)}
      onClick={(e) => {
        e.stopPropagation()
        onPick(cafe.id)
      }}
    >
      {quiet && <circle r={7 * inv} fill="transparent" />}
      <circle className="halo" r={halo ? r * 2.4 : 0} fill="url(#halo)" />
      <circle
        className="body"
        r={r}
        fill="var(--pin-fill)"
        stroke="var(--ink)"
        strokeWidth={(quiet ? 0.9 : tier === 'hi' ? 1.9 : 1.4) * inv}
      />
      {(active || k >= 1.8) && (
        <circle
          className="ring"
          r={r + 2.5 * inv}
          fill="none"
          stroke="var(--ink)"
          strokeWidth={0.7 * inv}
          strokeDasharray={`${1 * inv} ${3 * inv}`}
          strokeOpacity={active ? 0.9 : 0.35}
        />
      )}
      {showGlyph && (
        <g className="glyph" transform={`scale(${(f / 11) * 0.95})`}>
          <Glyph archetype={cafe.archetype} color="var(--ink)" />
        </g>
      )}
      {visited && (
        <g transform={`translate(${f * 0.72},${-f * 0.72}) scale(${inv})`}>
          <circle r="6" fill="var(--stamp)" fillOpacity="0.92" />
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
      {saved && !visited && (
        <g transform={`translate(${f * 0.72},${-f * 0.72}) scale(${inv})`}>
          <circle r="5.4" fill="var(--accent)" fillOpacity="0.9" />
          <path
            d="M0 -3 l0.9 2 l2.2 0.2 l-1.7 1.5 l0.5 2.2 l-1.9 -1.2 l-1.9 1.2 l0.5 -2.2 l-1.7 -1.5 l2.2 -0.2 z"
            fill="var(--paper)"
          />
        </g>
      )}
      {place !== undefined && (
        <g className="flag" transform={`translate(${f * 0.55},${-f * 0.7}) scale(${inv})`}>
          <path d={PENNANTS[place].mast} fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeLinecap="round" />
          <path
            d={PENNANTS[place].flag}
            fill="var(--accent)"
            stroke="var(--ink)"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
          <text className="flag-n" x="6.4" y="-13.6" textAnchor="middle">
            {place + 1}
          </text>
        </g>
      )}
      <g className={`label${fade ? ' fading' : ''}`} transform={`translate(0,${(frameR + 4) * inv}) scale(${inv})`}>
        {names && (
          <>
            <text className="pin-label" textAnchor="middle" y="10">
              {names.primary}
            </text>
            {k >= 2.5 && names.secondary && (
              <text className="pin-label zh" textAnchor="middle" y="22">
                {names.secondary}
              </text>
            )}
          </>
        )}
      </g>
    </g>
  )
})

/**
 * The pin layer is by far the widest subtree (~600 cafés × several nodes), so
 * it is memoised on bucketed zoom, selection, hover and the identity of the
 * score map: a pan or pinch re-renders it zero times, a slider drag once per
 * score update — and then only the pins whose ink actually changes. Ink
 * follows the compass — full ink and a warm halo at ≥90, a fade below 70 —
 * through CSS transitions, so the city breathes rather than flickers.
 */
const Pins = memo(function Pins({
  layout,
  scores,
  compassOn,
  selectedId,
  hovered,
  visited,
  saved,
  k,
  inv,
  labelIds,
  fading,
  topIds,
  hidden,
  mode,
  onHover,
  onLeave,
  onPick,
}: PinsProps) {
  const { cafes, xs, ys } = layout
  const rank = new Map(topIds.map((id, i) => [id, i]))
  return (
    <g className={`pins${compassOn ? ' compass-on' : ''}`}>
      {cafes.map((cafe, i) => {
        if (hidden.has(cafe.id)) return null
        const score = scores.get(cafe.id)
        const isHover = hovered === cafe.id
        const label = labelIds.has(cafe.id) || isHover
        return (
          <Pin
            key={cafe.id}
            cafe={cafe}
            x={xs[i]}
            y={ys[i]}
            k={k}
            inv={inv}
            strength={strengthOf(compassOn, score)}
            tier={tierOf(compassOn, score)}
            isSel={selectedId === cafe.id}
            isHover={isHover}
            dim={score === undefined}
            visited={visited.has(cafe.id)}
            saved={saved.has(cafe.id)}
            label={label}
            fade={!label && fading.has(cafe.id)}
            place={rank.get(cafe.id)}
            mode={mode}
            onHover={onHover}
            onLeave={onLeave}
            onPick={onPick}
          />
        )
      })}
    </g>
  )
})
