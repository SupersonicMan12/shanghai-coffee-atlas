import type { Axes, Cafe } from '../data/types'
import type { Ranked } from '../lib/match'
import { scoreVerdict } from '../lib/match'
import { CLOSING_SOON_MINUTES, closenessWord, minutesToClose } from '../lib/near'
import { CLOSENESS_ZH, UI, VERDICT_ZH } from '../data/labels'
import { useI18n, type Pair } from '../lib/i18n'
import { displayNames } from '../lib/names'
import type { BlendedAxes } from '../lib/scoring'
import type { Why } from '../lib/why'
import { Glyph } from './Glyphs'
import { Fingerprint, VerdictBlock } from './Verdict'

interface Props {
  ranked: (Ranked & { minutes?: number })[]
  compassOn: boolean
  nearMode: boolean
  hour: number
  weekday: number
  selectedId: string | null
  onSelect: (id: string) => void
  visited: Set<string>
  says: Pair
  want: Axes
  blended: Map<string, BlendedAxes>
  explainFor: (cafe: Cafe, minutes?: number) => Why
}

const MAX_ROWS = 60
const VERDICT_ROWS = 12

/**
 * The list is for people who just want the answer: the same ranking as the
 * map, read top to bottom, with the compass's verdict on the rows that matter.
 */
export function ListView({
  ranked,
  compassOn,
  nearMode,
  hour,
  weekday,
  selectedId,
  onSelect,
  visited,
  says,
  want,
  blended,
  explainFor,
}: Props) {
  const { mode, t, sub } = useI18n()
  const head = nearMode ? UI.nearestThatFit : compassOn ? UI.closestToCompass : UI.everythingOnMap
  const rows = ranked.slice(0, MAX_ROWS)
  return (
    <div className="listview">
      <div className="says" role="status">
        <span className="says-label">{t(UI.compassSays)}</span>
        <span className="says-text">
          {t(says)}
          {sub(says) && <span className="zh"> {sub(says)}</span>}
        </span>
      </div>
      <div className="strip-head">
        {t(head)}
        {sub(head) && <span className="zh">{sub(head)}</span>}
        <em>{ranked.length}</em>
      </div>
      {rows.length === 0 && <div className="strip-empty">{t(UI.stripEmpty)}</div>}
      <ol className="list-rows">
        {rows.map(({ cafe, score, minutes }, i) => {
          const toClose = minutesToClose(cafe, hour, weekday)
          const closingSoon = toClose !== null && toClose <= CLOSING_SOON_MINUTES
          const closeness = minutes !== undefined ? closenessWord(minutes) : null
          const names = displayNames(cafe, mode)
          const why = compassOn && i < VERDICT_ROWS ? explainFor(cafe, minutes) : null
          return (
            <li key={cafe.id}>
              <button
                className={`list-row${selectedId === cafe.id ? ' on' : ''}${i < 3 && compassOn ? ' pick' : ''}`}
                onClick={() => onSelect(cafe.id)}
              >
                <span className="lr-rank">{i + 1}</span>
                <svg viewBox="-14 -14 28 28" className="strip-glyph">
                  <Glyph archetype={cafe.archetype} color="currentColor" />
                </svg>
                <span className="sc-main">
                  <span className="sc-name">
                    {names.primary}
                    {visited.has(cafe.id) && <span className="sc-stamped">✓</span>}
                  </span>
                  {names.secondary && <span className="sc-zh zh">{names.secondary}</span>}
                  <span className="sc-where">
                    {cafe.street} · {cafe.hood}
                  </span>
                  {why && <VerdictBlock why={why} compact={i >= 3} />}
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
                  <span className="sc-side">
                    <span className="sc-score">
                      <b>{score}</b>
                      <em>
                        {mode === 'zh'
                          ? VERDICT_ZH[scoreVerdict(score)] ?? scoreVerdict(score)
                          : scoreVerdict(score)}
                      </em>
                    </span>
                    <Fingerprint cafe={cafe} want={want} blended={blended.get(cafe.id)} />
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
