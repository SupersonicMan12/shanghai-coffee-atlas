import { useMemo, useState } from 'react'
import { LINE_COLOR, METRO_STATIONS, type MetroStation } from '../data/metro'
import { anchorLabel, type Anchor } from '../lib/near'
import { UI } from '../data/labels'
import { useI18n, type Pair } from '../lib/i18n'

export type GeoStatus = 'idle' | 'looking' | 'on' | 'failed'

interface Props {
  anchor: Anchor | null
  geo: GeoStatus
  geoNote: Pair | null
  onLocate: () => void
  onAnchor: (a: Anchor | null) => void
  pinArm: boolean
  onPinArm: (v: boolean) => void
}

const norm = (s: string) => s.toLowerCase().replace(/[\s·'’-]+/g, '')

function findStations(q: string): MetroStation[] {
  const n = norm(q)
  if (!n) return []
  return METRO_STATIONS.filter((s) => norm(s.nameZh).includes(n) || norm(s.name).includes(n)).slice(0, 6)
}

/**
 * Where the ranking is measured from: your location (primary), or a spot on
 * the map / a metro station — both one tap away, nothing folded.
 */
export function LocationPanel({ anchor, geo, geoNote, onLocate, onAnchor, pinArm, onPinArm }: Props) {
  const { mode, t } = useI18n()
  const zh = mode === 'zh'
  const [metro, setMetro] = useState(false)
  const [q, setQ] = useState('')
  const hits = useMemo(() => findStations(q), [q])
  const label = anchor ? anchorLabel(anchor) : null
  const meOn = anchor?.kind === 'me'

  const pick = (s: MetroStation) => {
    onAnchor({ kind: 'metro', station: s })
    setQ('')
    setMetro(false)
  }
  const togglePin = () => {
    setMetro(false)
    onPinArm(!pinArm)
  }
  const toggleMetro = () => {
    if (pinArm) onPinArm(false)
    setMetro((v) => !v)
  }

  return (
    <div className="section location">
      <button
        className={`loc-me${meOn ? ' on' : ''}${geo === 'looking' ? ' busy' : ''}`}
        onClick={onLocate}
        disabled={geo === 'looking'}
      >
        <span className="loc-dot" aria-hidden />
        <span>
          {geo === 'looking' ? t(UI.geoLooking) : meOn ? t(UI.locatedHere) : t(UI.useMyLocation)}
        </span>
      </button>

      <div className="loc-alt" role="group" aria-label={t(UI.otherPlace)}>
        <button
          className={`loc-alt-btn loc-pin${pinArm ? ' on' : ''}${anchor?.kind === 'pin' ? ' set' : ''}`}
          onClick={togglePin}
          aria-pressed={pinArm}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
            <path
              d="M8 1.5a4.5 4.5 0 0 1 4.5 4.5c0 3.2-4.5 8.5-4.5 8.5S3.5 9.2 3.5 6A4.5 4.5 0 0 1 8 1.5z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <circle cx="8" cy="6" r="1.6" fill="currentColor" />
          </svg>
          <span>{pinArm ? t(UI.pinHint) : t(UI.dropPin)}</span>
        </button>
        <button
          className={`loc-alt-btn loc-metro${metro ? ' on' : ''}${anchor?.kind === 'metro' ? ' set' : ''}`}
          onClick={toggleMetro}
          aria-expanded={metro}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
            <rect x="3" y="2" width="10" height="9.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M3 7.5h10M5 14l1-2.5M11 14l-1-2.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
          <span>{t(UI.metroStation)}</span>
        </button>
      </div>

      {geoNote && geo === 'failed' && <p className="loc-note">{t(geoNote)}</p>}

      {metro && (
        <div className="loc-other-body">
          <input
            className="search"
            type="search"
            placeholder={t(UI.stationPlaceholder)}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          {hits.length > 0 && (
            <ul className="loc-hits">
              {hits.map((s) => (
                <li key={s.id}>
                  <button onClick={() => pick(s)}>
                    <span className="loc-anchor-dot" style={{ background: LINE_COLOR[s.lines[0]] }} />
                    {zh ? s.nameZh : `${s.name} ${s.nameZh}`}
                    <em>{s.lines.map((l) => `${l}${zh ? '号线' : ''}`).join(' · ')}</em>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q && hits.length === 0 && <p className="loc-note">{t(UI.noStation)}</p>}
        </div>
      )}

      {anchor && !meOn && label && (
        <div className="loc-anchor">
          <span
            className="loc-anchor-dot"
            style={anchor.kind === 'metro' ? { background: LINE_COLOR[anchor.station.lines[0]] } : undefined}
          />
          <span>
            {t(UI.startingFrom)} <strong>{zh ? label.zh : label.en}</strong>
            {mode === 'both' && anchor.kind === 'metro' && <span className="zh"> {label.zh}</span>}
          </span>
          <button className="link" onClick={() => onAnchor(null)}>
            {t(UI.clear)}
          </button>
        </div>
      )}
    </div>
  )
}
