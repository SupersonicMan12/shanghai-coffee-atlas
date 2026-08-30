import type { Cafe } from '../data/types'
import { badgesFor, type Stamp } from '../lib/passport'
import { Glyph } from './Glyphs'

interface Props {
  cafes: Cafe[]
  stamps: Stamp[]
  saved: string[]
  onSelectCafe: (id: string) => void
  onClear: () => void
  onShare: () => void
  shared: boolean
}

export function PassportPanel({
  cafes,
  stamps,
  saved,
  onSelectCafe,
  onClear,
  onShare,
  shared,
}: Props) {
  const byId = new Map(cafes.map((c) => [c.id, c]))
  const badges = badgesFor(stamps, cafes)
  const earned = badges.filter((b) => b.earned).length
  const visited = stamps
    .map((s) => ({ stamp: s, cafe: byId.get(s.cafeId) }))
    .filter((x): x is { stamp: Stamp; cafe: Cafe } => Boolean(x.cafe))
    .sort((a, b) => b.stamp.on.localeCompare(a.stamp.on))

  return (
    <div className="panel-body">
      <p className="section-note">
        The passport lives in this browser and nowhere else — no account, no server, no
        one selling your morning routine. Stamp a café from its card and it inks itself
        onto the map.
      </p>

      <div className="passport-stat">
        <div>
          <strong>{stamps.length}</strong>
          <span>of {cafes.length} stamped</span>
        </div>
        <div>
          <strong>{earned}</strong>
          <span>of {badges.length} badges</span>
        </div>
        <div>
          <strong>{saved.length}</strong>
          <span>on the list</span>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h3>Badges</h3>
          <span className="zh">徽章</span>
        </div>
        <ul className="badges">
          {badges.map((b) => (
            <li key={b.id} className={b.earned ? 'earned' : ''}>
              <span className="badge-name">
                {b.name} <span className="zh">{b.nameZh}</span>
              </span>
              <span className="badge-hint">{b.hint}</span>
              <span className="badge-bar">
                <span style={{ width: `${(b.progress / b.target) * 100}%` }} />
              </span>
              <span className="badge-count">
                {b.progress}/{b.target}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {saved.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h3>Saved for later</h3>
            <span className="zh">待去</span>
          </div>
          <ul className="mini-list">
            {saved.map((id) => {
              const cafe = byId.get(id)
              if (!cafe) return null
              return (
                <li key={id}>
                  <button onClick={() => onSelectCafe(id)}>
                    {cafe.name} <span className="zh">{cafe.nameZh}</span>
                    <em>{cafe.street}</em>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="section">
        <div className="section-head">
          <h3>Your stamps</h3>
          <span className="zh">已打卡</span>
        </div>
        {visited.length === 0 ? (
          <p className="empty">
            Nothing yet. Pick a café, drink the coffee, then stamp it — the atlas keeps
            score so you stop going to the same three places.
          </p>
        ) : (
          <ul className="stamp-grid">
            {visited.map(({ cafe, stamp }) => (
              <li key={cafe.id}>
                <button onClick={() => onSelectCafe(cafe.id)}>
                  <svg viewBox="-14 -14 28 28" className="stamp-mark">
                    <circle r="12.5" className="stamp-ring" />
                    <Glyph archetype={cafe.archetype} color="currentColor" />
                  </svg>
                  <span className="sg-name">{cafe.name}</span>
                  <span className="sg-date">{stamp.on}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel-foot">
        <button className="link" onClick={onShare}>
          {shared ? 'Copied' : 'Copy your passport as text'}
        </button>
        {stamps.length > 0 && (
          <button className="link danger" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
