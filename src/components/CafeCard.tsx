import type { Axes, Cafe } from '../data/types'
import { AXES, isOpenAt, scoreVerdict } from '../lib/match'
import { formatHour } from '../lib/palette'
import { ARCHETYPE_LABEL, DISTRICT_ZH, TAG_LABEL } from '../data/labels'

interface Props {
  cafe: Cafe
  score: number | null
  want: Axes
  compassOn: boolean
  hour: number
  visited: boolean
  saved: boolean
  distanceMinutes: number | null
  onClose: () => void
  onStamp: () => void
  onSave: () => void
  onTaxi: () => void
  onMoreLikeThis: () => void
  onShare: () => void
  shared: boolean
}

function hours(cafe: Cafe) {
  return `${formatHour(cafe.opens)} – ${formatHour(cafe.closes)}`
}

export function CafeCard({
  cafe,
  score,
  want,
  compassOn,
  hour,
  visited,
  saved,
  distanceMinutes,
  onClose,
  onStamp,
  onSave,
  onTaxi,
  onMoreLikeThis,
  onShare,
  shared,
}: Props) {
  const open = isOpenAt(cafe, hour)
  return (
    <aside className="card" key={cafe.id}>
      <button className="card-close" onClick={onClose} aria-label="Close">
        ×
      </button>

      <div className="card-kicker">
        {ARCHETYPE_LABEL[cafe.archetype].en}
        <span className="zh"> · {ARCHETYPE_LABEL[cafe.archetype].zh}</span>
      </div>
      <h2>{cafe.name}</h2>
      <div className="card-zh zh">{cafe.nameZh}</div>

      <div className="card-where">
        {cafe.street} · {cafe.hood} · {cafe.district}
        <span className="zh">
          {' '}
          / {cafe.streetZh} · {DISTRICT_ZH[cafe.district]}
        </span>
      </div>

      {compassOn && score !== null && (
        <div className="card-score">
          <span className="score-num">{score}</span>
          <span className="score-verdict">{scoreVerdict(score)}</span>
          <span className="score-note">against your compass</span>
        </div>
      )}

      <p className="card-signature">“{cafe.signature}”</p>
      <p className="card-note">{cafe.note}</p>

      <div className="card-facts">
        <div>
          <dt>Hours</dt>
          <dd>
            {hours(cafe)}{' '}
            <em className={open ? 'open' : 'shut'}>
              {open ? `open at ${formatHour(hour)}` : `shut at ${formatHour(hour)}`}
            </em>
          </dd>
        </div>
        <div>
          <dt>Seats</dt>
          <dd>{cafe.seats === 0 ? 'None — standing' : `about ${cafe.seats}`}</dd>
        </div>
        <div>
          <dt>Spend</dt>
          <dd>{'¥'.repeat(cafe.price)}</dd>
        </div>
        {distanceMinutes !== null && (
          <div>
            <dt>From you</dt>
            <dd>{distanceMinutes} min walk</dd>
          </div>
        )}
      </div>

      <div className="card-axes">
        {AXES.map((a) => {
          const v = cafe.axes[a.key]
          const w = want[a.key]
          return (
            <div key={a.key} className="card-axis">
              <span className="ca-name">{a.label}</span>
              <span className="ca-track">
                <span className="ca-fill" style={{ width: `${v}%` }} />
                {compassOn && <span className="ca-want" style={{ left: `${w}%` }} />}
              </span>
              <span className="ca-word">{v > 66 ? a.high : v < 34 ? a.low : '—'}</span>
            </div>
          )
        })}
      </div>

      <div className="card-tags">
        {cafe.tags.map((t) => (
          <span key={t} className="tag">
            {TAG_LABEL[t] ?? t}
          </span>
        ))}
      </div>

      <div className="card-actions">
        <button className={`act${visited ? ' on' : ''}`} onClick={onStamp}>
          {visited ? 'Stamped' : 'Stamp as visited'}
        </button>
        <button className={`act${saved ? ' on' : ''}`} onClick={onSave}>
          {saved ? 'On your list' : 'Save for later'}
        </button>
        <button className="act" onClick={onTaxi}>
          Taxi card 出租车卡
        </button>
        <button className="act" onClick={onMoreLikeThis}>
          More like this
        </button>
        <button className="act" onClick={onShare}>
          {shared ? 'Link copied' : 'Share'}
        </button>
      </div>
    </aside>
  )
}
