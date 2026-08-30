import { LINE_COLOR, METRO_LINES, STATION_BY_ID, stationsOnLine } from '../data/metro'
import { anchorLabel, type Anchor } from '../lib/near'
import { formatHour } from '../lib/palette'
import { UI } from '../data/labels'
import { useI18n } from '../lib/i18n'

interface Props {
  anchor: Anchor | null
  onAnchor: (a: Anchor | null) => void
  onLocate: () => void
  pinArm: boolean
  onPinArm: (v: boolean) => void
  openNow: boolean
  onOpenNow: () => void
  hour: number
}

export function NearMePanel({
  anchor,
  onAnchor,
  onLocate,
  pinArm,
  onPinArm,
  openNow,
  onOpenNow,
  hour,
}: Props) {
  const label = anchor ? anchorLabel(anchor) : null
  const { mode, t } = useI18n()
  const zh = mode === 'zh'

  return (
    <div className="section nearme">
      <div className="section-head">
        <h3>{t(UI.nearMe)}</h3>
        {mode === 'both' && <span className="zh">就在附近</span>}
      </div>
      <p className="section-note">{t(UI.nearMeNote)}</p>

      <div className="chips">
        <button
          className={`chip${anchor?.kind === 'me' ? ' on' : ''}`}
          onClick={onLocate}
        >
          {t(UI.useMyLocation)} {mode === 'both' && <span className="zh">定位</span>}
        </button>
        <button
          className={`chip${pinArm || anchor?.kind === 'pin' ? ' on' : ''}`}
          onClick={() => onPinArm(!pinArm)}
        >
          {t(UI.dropPin)} {mode === 'both' && <span className="zh">丢个图钉</span>}
        </button>
        <button
          className={`chip${openNow ? ' on' : ''}`}
          onClick={onOpenNow}
        >
          {t(UI.openNow)} {mode === 'both' && <span className="zh">现在营业</span>}
        </button>
      </div>
      {pinArm && <p className="nearme-hint">{t(UI.pinHint)}</p>}

      <label className="station-pick">
        <span className="station-pick-label">
          {t(UI.orAnchorMetro)} {mode === 'both' && <span className="zh">按地铁站</span>}
        </span>
        <select
          value={anchor?.kind === 'metro' ? anchor.station.id : ''}
          onChange={(e) => {
            const station = STATION_BY_ID.get(e.target.value)
            onAnchor(station ? { kind: 'metro', station } : null)
          }}
        >
          <option value="">{mode === 'both' ? '— choose a station 选一站 —' : t(UI.chooseStation)}</option>
          {METRO_LINES.map((line) => (
            <optgroup key={line} label={zh ? `${line}号线` : `Line ${line} · ${line}号线`}>
              {stationsOnLine(line).map((s) => (
                <option key={`${line}-${s.id}`} value={s.id}>
                  {zh ? s.nameZh : `${s.name} ${s.nameZh}`}
                  {s.lines.length > 1 ? ` (${s.lines.map((l) => `L${l}`).join('/')})` : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      {anchor && label && (
        <div className="nearme-anchor">
          <span
            className="nearme-dot"
            style={
              anchor.kind === 'metro'
                ? { background: LINE_COLOR[anchor.station.lines[0]] }
                : undefined
            }
          />
          <span>
            {t(UI.anchoredAt)} <strong>{zh ? label.zh : label.en}</strong>{' '}
            {mode === 'both' && <span className="zh">{label.zh}</span>}
            {openNow && (
              <em>
                {' '}
                · {t(UI.openAtWord)} {formatHour(hour)}
              </em>
            )}
          </span>
          <button className="link" onClick={() => onAnchor(null)}>
            {t(UI.clear)}
          </button>
        </div>
      )}
    </div>
  )
}
