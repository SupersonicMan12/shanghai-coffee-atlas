import type { Ranked } from '../lib/match'
import { scoreVerdict } from '../lib/match'
import { Glyph } from './Glyphs'

interface Props {
  ranked: Ranked[]
  compassOn: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  visited: Set<string>
}

export function ResultsStrip({ ranked, compassOn, selectedId, onSelect, visited }: Props) {
  const top = ranked.slice(0, 24)
  return (
    <div className="strip">
      <div className="strip-head">
        {compassOn ? 'Closest to your compass' : 'Everything on the map'}
        <span className="zh">{compassOn ? ' 最贴近你' : ' 全部'}</span>
        <em>{ranked.length}</em>
      </div>
      <div className="strip-rail">
        {top.length === 0 && (
          <div className="strip-empty">
            Nothing matches those hard limits. Loosen one — the compass is a preference,
            the filters are a wall.
          </div>
        )}
        {top.map(({ cafe, score }) => (
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
            </span>
            {compassOn && (
              <span className="sc-score">
                <b>{score}</b>
                <em>{scoreVerdict(score)}</em>
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
