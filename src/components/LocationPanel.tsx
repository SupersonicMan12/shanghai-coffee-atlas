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
 * Where the ranking is measured from. One primary button (your location) and
 * one fallback (type a metro station or tap the map). Nothing else.
 */
export function LocationPanel({ anchor, geo, geoNote, onLocate, onAnchor, pinArm, onPinArm }: Props) {
  const { mode, t } = useI18n()
  const zh = mode === 'zh'
  const [other, setOther] = useState(false)
  const [q, setQ] = useState('')
  const hits = useMemo(() => findStations(q), [q])
  const label = anchor ? anchorLabel(anchor) : null
  const meOn = anchor?.kind === 'me'

  const pick = (s: MetroStation) => {
    onAnchor({ kind: 'metro', station: s })
    setQ('')
    setOther(false)
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
      {geoNote && geo === 'failed' && <p className="loc-note">{t(geoNote)}</p>}

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

      <button
        className="loc-other"
        onClick={() => {
          setOther((v) => !v)
          if (pinArm) onPinArm(false)
        }}
        aria-expanded={other}
      >
        {t(UI.otherPlace)} <span className="chev">{other ? '−' : '+'}</span>
      </button>

      {other && (
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
          <button className={`chip loc-pin${pinArm ? ' on' : ''}`} onClick={() => onPinArm(!pinArm)}>
            {pinArm ? t(UI.pinHint) : t(UI.dropPin)}
          </button>
        </div>
      )}
    </div>
  )
}
