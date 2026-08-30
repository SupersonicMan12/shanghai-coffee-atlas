import { LINE_COLOR, METRO_LINES, STATION_BY_ID, stationsOnLine } from '../data/metro'
import { anchorLabel, type Anchor } from '../lib/near'
import { formatHour } from '../lib/palette'

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

  return (
    <div className="section nearme">
      <div className="section-head">
        <h3>Near me</h3>
        <span className="zh">就在附近</span>
      </div>
      <p className="section-note">
        Anchor the atlas to a point and the ranking weighs walking time against the
        compass: a great room nearby beats a perfect one across town.
      </p>

      <div className="chips">
        <button
          className={`chip${anchor?.kind === 'me' ? ' on' : ''}`}
          onClick={onLocate}
        >
          Use my location <span className="zh">定位</span>
        </button>
        <button
          className={`chip${pinArm || anchor?.kind === 'pin' ? ' on' : ''}`}
          onClick={() => onPinArm(!pinArm)}
        >
          Drop a pin <span className="zh">丢个图钉</span>
        </button>
        <button
          className={`chip${openNow ? ' on' : ''}`}
          onClick={onOpenNow}
        >
          Open now <span className="zh">现在营业</span>
        </button>
      </div>
      {pinArm && (
        <p className="nearme-hint">Now tap the map where you are standing.</p>
      )}

      <label className="station-pick">
        <span className="station-pick-label">
          Or anchor to a metro station <span className="zh">按地铁站</span>
        </span>
        <select
          value={anchor?.kind === 'metro' ? anchor.station.id : ''}
          onChange={(e) => {
            const station = STATION_BY_ID.get(e.target.value)
            onAnchor(station ? { kind: 'metro', station } : null)
          }}
        >
          <option value="">— choose a station 选一站 —</option>
          {METRO_LINES.map((line) => (
            <optgroup key={line} label={`Line ${line} · ${line}号线`}>
              {stationsOnLine(line).map((s) => (
                <option key={`${line}-${s.id}`} value={s.id}>
                  {s.name} {s.nameZh}
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
            Anchored at <strong>{label.en}</strong> <span className="zh">{label.zh}</span>
            {openNow && <em> · open at {formatHour(hour)}</em>}
          </span>
          <button className="link" onClick={() => onAnchor(null)}>
            Clear
          </button>
        </div>
      )}
    </div>
  )
}
