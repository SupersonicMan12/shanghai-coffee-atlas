import { useCallback, useEffect, useLayoutEffect, useRef, type PointerEvent, type ReactNode } from 'react'
import { UI } from '../data/labels'
import { useI18n } from '../lib/i18n'

export type Snap = 'hidden' | 'peek' | 'half' | 'full'

interface Props {
  snap: Snap
  onSnap: (s: Snap) => void
  /** The part that must stay visible at "peek" — measured, so it can wrap. */
  peek: ReactNode
  children: ReactNode
}

const EASE = 'cubic-bezier(.2,.8,.2,1)'
const SETTLE_MS = 320
const FLICK = 0.45 // px/ms

/**
 * The phone compass: a sheet that lives over the map and snaps to three
 * heights. Only `transform` moves — the handle takes the drag with pointer
 * events (touch-action: none on the handle alone), the ends rubber-band, and
 * the map above stays live.
 */
export function BottomSheet({ snap, onSnap, peek, children }: Props) {
  const { t } = useI18n()
  const sheet = useRef<HTMLDivElement | null>(null)
  const peekRef = useRef<HTMLDivElement | null>(null)
  const drag = useRef<{
    y0: number
    start: number
    last: number
    lastT: number
    v: number
    active: boolean
  } | null>(null)
  const swallowClick = useRef(false)

  /** Sheet height in px for each snap — the sheet is as tall as the stage. */
  const heights = useCallback((): Record<Snap, number> => {
    const H = sheet.current?.offsetHeight ?? 600
    const peekH = Math.min(H - 40, (peekRef.current?.offsetHeight ?? 220) + 6)
    return {
      hidden: 0,
      peek: peekH,
      half: Math.min(H - 12, Math.max(peekH + 220, Math.round(H * 0.62))),
      full: H - 12,
    }
  }, [])

  const place = useCallback(
    (visible: number, animate: boolean) => {
      const el = sheet.current
      if (!el) return
      const H = el.offsetHeight
      el.style.transition = animate ? `transform ${SETTLE_MS}ms ${EASE}` : 'none'
      el.style.transform = `translate3d(0, ${Math.round(H - visible)}px, 0)`
    },
    [],
  )

  const settle = useCallback(
    (animate: boolean) => {
      const h = heights()
      place(h[snap], animate)
      const stage = sheet.current?.parentElement
      if (stage) stage.style.setProperty('--sheet-peek', `${h.peek}px`)
    },
    [heights, place, snap],
  )

  useLayoutEffect(() => {
    settle(true)
  }, [settle])

  useEffect(() => {
    const el = sheet.current
    if (!el) return
    const ro = new ResizeObserver(() => settle(false))
    ro.observe(el)
    if (peekRef.current) ro.observe(peekRef.current)
    return () => ro.disconnect()
  }, [settle])

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    const el = sheet.current
    if (!el) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const H = el.offsetHeight
    const m = getComputedStyle(el).transform.match(/matrix\(([^)]+)\)/)
    const ty = m ? Number(m[1].split(',')[5]) : H - heights()[snap]
    drag.current = {
      y0: e.clientY,
      start: H - ty,
      last: e.clientY,
      lastT: performance.now(),
      v: 0,
      active: true,
    }
    swallowClick.current = false
    el.style.transition = 'none'
    el.style.willChange = 'transform'
  }

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    const el = sheet.current
    if (!d || !d.active || !el) return
    const h = heights()
    let visible = d.start - (e.clientY - d.y0)
    // rubber-band past either end
    if (visible > h.full) visible = h.full + (visible - h.full) * 0.3
    if (visible < h.peek) visible = h.peek - (h.peek - visible) * 0.3
    const now = performance.now()
    const dt = Math.max(1, now - d.lastT)
    d.v = d.v * 0.6 + ((d.last - e.clientY) / dt) * 0.4 // + means moving up
    d.last = e.clientY
    d.lastT = now
    if (Math.abs(e.clientY - d.y0) > 6) swallowClick.current = true
    place(visible, false)
  }

  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    const el = sheet.current
    if (!d || !el) return
    d.active = false
    el.style.willChange = ''
    const h = heights()
    const visible = d.start - (e.clientY - d.y0)
    const v = performance.now() - d.lastT > 80 ? 0 : d.v
    const order: Snap[] = ['peek', 'half', 'full']
    let target: Snap = order.reduce((best, s) =>
      Math.abs(h[s] - visible) < Math.abs(h[best] - visible) ? s : best,
    )
    const flicked = Math.abs(e.clientY - d.y0) > 12 && Math.abs(v) > FLICK
    if (flicked) {
      const i = order.indexOf(snap)
      target = order[Math.max(0, Math.min(order.length - 1, i + (v > 0 ? 1 : -1)))]
    }
    drag.current = null
    if (target === snap) settle(true)
    else onSnap(target)
  }

  // Pointer capture on the grip means the click lands here, not on the button.
  const cycle = () => {
    if (swallowClick.current) {
      swallowClick.current = false
      return
    }
    onSnap(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'peek')
  }

  return (
    <div ref={sheet} className={`sheet snap-${snap}`} role="region" aria-label={t(UI.tabCompass)}>
      <div ref={peekRef} className="sheet-top">
        <div
          className="sheet-grip"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onClick={cycle}
        >
          <button
            className="sheet-handle"
            aria-label={snap === 'full' ? t(UI.sheetHide) : t(UI.sheetPeek)}
          />
        </div>
        <div className="sheet-peek">{peek}</div>
      </div>
      <div className="sheet-body">{children}</div>
    </div>
  )
}
