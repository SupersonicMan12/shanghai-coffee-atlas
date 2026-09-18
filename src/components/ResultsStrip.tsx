import { memo, useLayoutEffect, useRef } from 'react'
import type { Axes, Cafe } from '../data/types'
import type { Ranked } from '../lib/match'
import { scoreVerdict } from '../lib/match'
import { CLOSING_SOON_MINUTES, closenessWord, minutesToClose } from '../lib/near'
import { Glyph } from './Glyphs'
import { CLOSENESS_ZH, UI, VERDICT_ZH } from '../data/labels'
import { useI18n, type Pair } from '../lib/i18n'
import { displayNames } from '../lib/names'
import type { BlendedAxes } from '../lib/scoring'
import type { Why } from '../lib/why'
import { Fingerprint, VerdictBlock } from './Verdict'

interface Props {
  ranked: (Ranked & { minutes?: number })[]
  compassOn: boolean
  nearMode: boolean
  hour: number
  weekday: number
  selectedId: string | null
  onSelect: (id: string) => void
  visited: Set<string>
  says: Pair
  want: Axes
  blended: Map<string, BlendedAxes>
  explainFor: (cafe: Cafe, minutes?: number) => Why
  onSharePicks?: () => void
  /** Inside the mobile sheet: no heading chrome, one scrollable row. */
  embedded?: boolean
}

export const PICKS = 3
const SHOW = 24
const FLIP_MS = 280

/** Translation currently applied by an in-flight FLIP, so a re-rank mid-glide starts from where the card *is*. */
function inflight(el: HTMLElement): { x: number; y: number } {
  const tr = getComputedStyle(el).transform
  if (!tr || tr === 'none') return { x: 0, y: 0 }
  const m = tr.match(/matrix\(([^)]+)\)/)
  if (!m) return { x: 0, y: 0 }
  const p = m[1].split(',').map(Number)
  return { x: p[4] || 0, y: p[5] || 0 }
}

/**
 * FLIP the children of `rail` (anything with `data-id`) whenever their order
 * changes: remember where each card was, let React move it, then play the
 * card from its old spot to the new one with a transform only.
 */
function useFlip(rail: React.RefObject<HTMLDivElement | null>, orderKey: string) {
  const prev = useRef<Map<string, { left: number; top: number }>>(new Map())
  useLayoutEffect(() => {
    const root = rail.current
    if (!root) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const els = root.querySelectorAll<HTMLElement>('[data-id]')
    const next = new Map<string, { left: number; top: number }>()
    const moves: { el: HTMLElement; dx: number; dy: number }[] = []
    els.forEach((el) => {
      const id = el.dataset.id as string
      const was = prev.current.get(id)
      const fly = inflight(el)
      if (fly.x || fly.y) {
        el.style.transition = 'none'
        el.style.transform = ''
      }
      const rect = el.getBoundingClientRect()
      next.set(id, { left: rect.left, top: rect.top })
      if (!was) {
        if (!reduced && prev.current.size) {
          el.classList.add('enter')
          moves.push({ el, dx: 0, dy: 0 })
        }
        return
      }
      const dx = was.left + fly.x - rect.left
      const dy = was.top + fly.y - rect.top
      if (!reduced && (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5)) {
        el.style.transition = 'none'
        el.style.transform = `translate(${dx}px, ${dy}px)`
        moves.push({ el, dx, dy })
      }
    })
    prev.current = next
    if (!moves.length) return
    // Not cancelled on re-render: a drag re-ranks every frame, and each card
    // should keep gliding from wherever it is rather than freeze until the hand stops.
    requestAnimationFrame(() => {
      for (const { el } of moves) {
        el.style.transition = `transform ${FLIP_MS}ms cubic-bezier(.2,.8,.2,1), opacity ${FLIP_MS}ms ease`
        el.style.transform = ''
        el.classList.remove('enter')
      }
    })
  }, [rail, orderKey])
}

const StripCard = memo(function StripCard({
  cafe,
  score,
  minutes,
  rank,
  hour,
  weekday,
  on,
  stamped,
  compassOn,
  want,
  blended,
  why,
  onSelect,
}: {
  cafe: Cafe
  score: number
  minutes?: number
  rank: number
  hour: number
  weekday: number
  on: boolean
  stamped: boolean
  compassOn: boolean
  want: Axes
  blended: BlendedAxes | undefined
  why: Why | null
  onSelect: (id: string) => void
}) {
  const { mode, t } = useI18n()
  const zh = mode === 'zh'
  const toClose = minutesToClose(cafe, hour, weekday)
  const closingSoon = toClose !== null && toClose <= CLOSING_SOON_MINUTES
  const names = displayNames(cafe, mode)
  const pick = why !== null
  return (
    <button
      data-id={cafe.id}
      className={`strip-card${pick ? ' pick' : ''}${on ? ' on' : ''}${why?.confidence === 'sketch' ? ' sketch' : ''}`}
      onClick={() => onSelect(cafe.id)}
    >
      {pick ? (
        <span className="sc-rank" aria-label={`${t(UI.pickWord)} ${rank}`}>
          {rank}
        </span>
      ) : (
        <svg viewBox="-14 -14 28 28" className="strip-glyph">
          <Glyph archetype={cafe.archetype} color="currentColor" />
        </svg>
      )}
      <span className="sc-main">
        <span className="sc-name">
          {names.primary}
          {stamped && <span className="sc-stamped">✓</span>}
        </span>
        {names.secondary && <span className="sc-zh zh">{names.secondary}</span>}
        {why ? (
          <VerdictBlock why={why} compact />
        ) : (
          <span className="sc-where">{cafe.hood}</span>
        )}
        {minutes !== undefined && (
          <span className="sc-dist">
            {minutes} {t(UI.minWord)} ·{' '}
            {zh ? CLOSENESS_ZH[closenessWord(minutes)] ?? closenessWord(minutes) : closenessWord(minutes)}
          </span>
        )}
        {closingSoon && (
          <span className="sc-closing">
            {zh ? `还有 ${toClose} 分钟打烊` : `closes in ${toClose} min`}
            {mode === 'both' && ' 快打烊'}
          </span>
        )}
      </span>
      {compassOn && (
        <span className="sc-side">
          <span className="sc-score">
            <b>{score}</b>
            <em>{zh ? VERDICT_ZH[scoreVerdict(score)] ?? scoreVerdict(score) : scoreVerdict(score)}</em>
          </span>
          <Fingerprint cafe={cafe} want={want} blended={blended} />
        </span>
      )}
    </button>
  )
})

export function ResultsStrip({
  ranked,
  compassOn,
  nearMode,
  hour,
  weekday,
  selectedId,
  onSelect,
  visited,
  says,
  want,
  blended,
  explainFor,
  onSharePicks,
  embedded = false,
}: Props) {
  const { t, sub } = useI18n()
  const top = ranked.slice(0, SHOW)
  const railRef = useRef<HTMLDivElement | null>(null)
  useFlip(railRef, `${compassOn}|${embedded}|${top.map((r) => r.cafe.id).join('|')}`)
  const head = nearMode ? UI.nearestThatFit : compassOn ? UI.closestToCompass : UI.everythingOnMap

  return (
    <div className={`strip${embedded ? ' embedded' : ''}${compassOn ? ' has-picks' : ''}`}>
      <div className="says" role="status">
        <span className="says-label">{t(UI.compassSays)}</span>
        <span className="says-text">
          {t(says)}
          {sub(says) && <span className="zh"> {sub(says)}</span>}
        </span>
        {compassOn && onSharePicks && top.length >= PICKS && (
          <button className="says-share" onClick={onSharePicks} title={t(UI.sharePicks)}>
            {t(UI.sharePicks)}
          </button>
        )}
      </div>
      {!embedded && (
        <div className="strip-head">
          {t(head)}
          {sub(head) && <span className="zh"> {sub(head)}</span>}
          <em>{ranked.length}</em>
        </div>
      )}
      <div className="strip-rail" ref={railRef}>
        {top.length === 0 && <div className="strip-empty">{t(UI.stripEmpty)}</div>}
        {top.map(({ cafe, score, minutes }, i) => (
          <StripCard
            key={cafe.id}
            cafe={cafe}
            score={score}
            minutes={minutes}
            rank={i + 1}
            hour={hour}
            weekday={weekday}
            on={selectedId === cafe.id}
            stamped={visited.has(cafe.id)}
            compassOn={compassOn}
            want={want}
            blended={blended.get(cafe.id)}
            why={compassOn && i < PICKS ? explainFor(cafe, minutes) : null}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  )
}
