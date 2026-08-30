import type { Ranked } from '../lib/match'
import { scoreVerdict } from '../lib/match'
import { CLOSING_SOON_MINUTES, closenessWord, minutesToClose } from '../lib/near'
import { Glyph } from './Glyphs'

interface Props {
  ranked: (Ranked & { minutes?: number })[]
  compassOn: boolean
  nearMode: boolean
  hour: number
  selectedId: string | null
  onSelect: (id: string) => void
  visited: Set<string>
}

export function ResultsStrip({
  ranked,
  compassOn,
  nearMode,
  hour,
  selectedId,
  onSelect,
  visited,
}: Props) {
  const top = ranked.slice(0, 24)
  const head = nearMode
    ? { en: 'Nearest that fit', zh: ' 就在附近' }
    : compassOn
      ? { en: 'Closest to your compass', zh: ' 最贴近你' }
      : { en: 'Everything on the map', zh: ' 全部' }
  return (
    <div className="strip">
      <div className="strip-head">
        {head.en}
        <span className="zh">{head.zh}</span>
        <em>{ranked.length}</em>
      </div>
      <div className="strip-rail">
        {top.length === 0 && (
          <div className="strip-empty">
            Nothing matches those hard limits. Loosen one — the compass is a preference,
            the filters are a wall.
          </div>
        )}
        {top.map(({ cafe, score, minutes }) => {
          const toClose = minutesToClose(cafe, hour)
          const closingSoon = toClose !== null && toClose <= CLOSING_SOON_MINUTES
          return (
            <button
              key={cafe.id}
              className={`strip-card${selectedId === cafe.id ? ' on' : ''}`}
              onClick={() => onSelect(cafe.id)}
            >
              <svg viewBox="-14 -14 28 28" className="strip-glyph">
                <Glyph archetype={cafe.archetype} color="currentColor" />
              </svg>
              <span className="sc-main">
                <span className="sc-name">
                  {cafe.name}
                  {visited.has(cafe.id) && <span className="sc-stamped">✓</span>}
                </span>
                <span className="sc-zh zh">{cafe.nameZh}</span>
                <span className="sc-where">{cafe.hood}</span>
                {minutes !== undefined && (
                  <span className="sc-dist">
                    {minutes} min · {closenessWord(minutes)}
                  </span>
                )}
                {closingSoon && (
                  <span className="sc-closing">closes in {toClose} min 快打烊</span>
                )}
              </span>
              {compassOn && (
                <span className="sc-score">
                  <b>{score}</b>
                  <em>{scoreVerdict(score)}</em>
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
