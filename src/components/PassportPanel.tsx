import type { Cafe } from '../data/types'
import { badgesFor, type Stamp } from '../lib/passport'
import { Glyph } from './Glyphs'
import { UI } from '../data/labels'
import { useI18n } from '../lib/i18n'

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
  const { mode, t } = useI18n()
  const zh = mode === 'zh'
  const byId = new Map(cafes.map((c) => [c.id, c]))
  const badges = badgesFor(stamps, cafes)
  const earned = badges.filter((b) => b.earned).length
  const visited = stamps
    .map((s) => ({ stamp: s, cafe: byId.get(s.cafeId) }))
    .filter((x): x is { stamp: Stamp; cafe: Cafe } => Boolean(x.cafe))
    .sort((a, b) => b.stamp.on.localeCompare(a.stamp.on))

  return (
    <div className="panel-body">
      <p className="section-note">{t(UI.passportNote)}</p>

      <div className="passport-stat">
        <div>
          <strong>{stamps.length}</strong>
          <span>
            {zh ? `共 ${cafes.length} ${t(UI.ofStamped)}` : `of ${cafes.length} ${t(UI.ofStamped)}`}
          </span>
        </div>
        <div>
          <strong>{earned}</strong>
          <span>
            {zh ? `共 ${badges.length} ${t(UI.ofBadges)}` : `of ${badges.length} ${t(UI.ofBadges)}`}
          </span>
        </div>
        <div>
          <strong>{saved.length}</strong>
          <span>{t(UI.onTheList)}</span>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h3>{t(UI.badgesWord)}</h3>
          {mode === 'both' && <span className="zh">徽章</span>}
        </div>
        <ul className="badges">
          {badges.map((b) => (
            <li key={b.id} className={b.earned ? 'earned' : ''}>
              <span className="badge-name">
                {zh ? b.nameZh : b.name}
                {mode === 'both' && <span className="zh"> {b.nameZh}</span>}
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
            <h3>{t(UI.savedForLater)}</h3>
            {mode === 'both' && <span className="zh">待去</span>}
          </div>
          <ul className="mini-list">
            {saved.map((id) => {
              const cafe = byId.get(id)
              if (!cafe) return null
              return (
                <li key={id}>
                  <button onClick={() => onSelectCafe(id)}>
                    {zh ? cafe.nameZh : cafe.name}
                    {mode === 'both' && <span className="zh"> {cafe.nameZh}</span>}
                    <em>{zh ? cafe.streetZh : cafe.street}</em>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="section">
        <div className="section-head">
          <h3>{t(UI.yourStamps)}</h3>
          {mode === 'both' && <span className="zh">已打卡</span>}
        </div>
        {visited.length === 0 ? (
          <p className="empty">{t(UI.emptyStamps)}</p>
        ) : (
          <ul className="stamp-grid">
            {visited.map(({ cafe, stamp }) => (
              <li key={cafe.id}>
                <button onClick={() => onSelectCafe(cafe.id)}>
                  <svg viewBox="-14 -14 28 28" className="stamp-mark">
                    <circle r="12.5" className="stamp-ring" />
                    <Glyph archetype={cafe.archetype} color="currentColor" />
                  </svg>
                  <span className="sg-name">{zh ? cafe.nameZh : cafe.name}</span>
                  <span className="sg-date">{stamp.on}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel-foot">
        <button className="link" onClick={onShare}>
          {shared ? t(UI.copied) : t(UI.copyPassport)}
        </button>
        {stamps.length > 0 && (
          <button className="link danger" onClick={onClear}>
            {t(UI.clear)}
          </button>
        )}
      </div>
    </div>
  )
}
