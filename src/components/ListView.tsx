import type { Ranked } from '../lib/match'
import { scoreVerdict } from '../lib/match'
import { CLOSING_SOON_MINUTES, closenessWord, minutesToClose } from '../lib/near'
import { CLOSENESS_ZH, UI, VERDICT_ZH } from '../data/labels'
import { useI18n } from '../lib/i18n'
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

const MAX_ROWS = 60

/**
 * The list is for people who just want the answer: the same ranking as the
 * map, read top to bottom, with walking minutes when an anchor is set.
 */
export function ListView({
  ranked,
  compassOn,
  nearMode,
  hour,
  selectedId,
  onSelect,
  visited,
}: Props) {
  const { mode, t, sub } = useI18n()
  const head = nearMode ? UI.nearestThatFit : compassOn ? UI.closestToCompass : UI.everythingOnMap
  const rows = ranked.slice(0, MAX_ROWS)
  return (
    <div className="listview">
      <div className="strip-head">
        {t(head)}
        {sub(head) && <span className="zh">{sub(head)}</span>}
        <em>{ranked.length}</em>
      </div>
      {rows.length === 0 && <div className="strip-empty">{t(UI.stripEmpty)}</div>}
      <ol className="list-rows">
        {rows.map(({ cafe, score, minutes }, i) => {
          const toClose = minutesToClose(cafe, hour)
          const closingSoon = toClose !== null && toClose <= CLOSING_SOON_MINUTES
          const closeness = minutes !== undefined ? closenessWord(minutes) : null
          return (
            <li key={cafe.id}>
              <button
                className={`list-row${selectedId === cafe.id ? ' on' : ''}`}
                onClick={() => onSelect(cafe.id)}
              >
                <span className="lr-rank">{i + 1}</span>
                <svg viewBox="-14 -14 28 28" className="strip-glyph">
                  <Glyph archetype={cafe.archetype} color="currentColor" />
                </svg>
                <span className="sc-main">
                  <span className="sc-name">
                    {cafe.name}
                    {visited.has(cafe.id) && <span className="sc-stamped">✓</span>}
                  </span>
                  <span className="sc-zh zh">{cafe.nameZh}</span>
                  <span className="sc-where">
                    {cafe.street} · {cafe.hood}
                  </span>
                  {minutes !== undefined && closeness && (
                    <span className="sc-dist">
                      {minutes} {t(UI.minWalk)} ·{' '}
                      {mode === 'zh' ? CLOSENESS_ZH[closeness] ?? closeness : closeness}
                    </span>
                  )}
                  {closingSoon && (
                    <span className="sc-closing">
                      {t(UI.closesIn)} {toClose} {t(UI.minShut)}
                    </span>
                  )}
                </span>
                {compassOn && (
                  <span className="sc-score">
                    <b>{score}</b>
                    <em>
                      {mode === 'zh'
                        ? VERDICT_ZH[scoreVerdict(score)] ?? scoreVerdict(score)
                        : scoreVerdict(score)}
                    </em>
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
