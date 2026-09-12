import { memo } from 'react'
import type { Axes, Cafe } from '../data/types'
import { UI } from '../data/labels'
import { useI18n } from '../lib/i18n'
import { AXES } from '../lib/match'
import type { BlendedAxes } from '../lib/scoring'
import { fingerprint, type Why } from '../lib/why'

/**
 * The verdict block: headline, two or three reasons, the one honest miss.
 * `compact` is the strip card version (headline + first reason only).
 */
export const VerdictBlock = memo(function VerdictBlock({
  why,
  compact = false,
}: {
  why: Why
  compact?: boolean
}) {
  const { t, sub } = useI18n()
  const reasons = compact ? why.reasons.slice(0, 1) : why.reasons
  return (
    <div className={`verdict ${why.confidence}${compact ? ' compact' : ''}`}>
      <p className="verdict-head">
        {t(why.headline)}
        {why.confidence === 'sketch' && (
          <span className="verdict-est" title={t(UI.estimateTitle)}>
            {t(UI.estimateMark)}
          </span>
        )}
      </p>
      {!compact && sub(why.headline) && <p className="verdict-head-zh zh">{sub(why.headline)}</p>}
      {reasons.length > 0 && (
        <ul className="verdict-reasons">
          {reasons.map((r, i) => (
            <li key={i} className={`vr-${r.kind}`}>
              {t(r.text)}
              {!compact && sub(r.text) && <span className="zh"> {sub(r.text)}</span>}
            </li>
          ))}
        </ul>
      )}
      {!compact && why.tradeoff && (
        <p className="verdict-tradeoff">
          <span className="vt-mark">—</span> {t(why.tradeoff)}
          {sub(why.tradeoff) && <span className="zh"> {sub(why.tradeoff)}</span>}
        </p>
      )}
    </div>
  )
})

/** Five bars, want (hollow tick) against have (ink), one per axis. */
export const Fingerprint = memo(function Fingerprint({
  cafe,
  want,
  blended,
  size = 'sm',
}: {
  cafe: Cafe
  want: Axes
  blended: BlendedAxes | undefined
  size?: 'sm' | 'md'
}) {
  const { mode } = useI18n()
  const bars = fingerprint(cafe, want, blended)
  return (
    <span className={`fp fp-${size}`} aria-hidden>
      {bars.map((b, i) => {
        const gap = Math.abs(b.have - b.want)
        const def = AXES[i]
        return (
          <span
            key={b.key}
            className={`fp-bar${gap <= 12 ? ' hit' : gap > 22 ? ' miss' : ''}`}
            title={`${mode === 'zh' ? def.labelZh : def.label} ${Math.round(b.have)} / ${b.want}`}
          >
            <span className="fp-have" style={{ height: `${Math.max(6, b.have)}%` }} />
            <span className="fp-want" style={{ bottom: `${b.want}%` }} />
          </span>
        )
      })}
    </span>
  )
})
