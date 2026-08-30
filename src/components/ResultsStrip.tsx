import type { Ranked } from '../lib/match'
import { scoreVerdict } from '../lib/match'
import { CLOSING_SOON_MINUTES, closenessWord, minutesToClose } from '../lib/near'
import { Glyph } from './Glyphs'
import { CLOSENESS_ZH, UI, VERDICT_ZH } from '../data/labels'
import { useI18n } from '../lib/i18n'

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
  const { mode, t, sub } = useI18n()
  const zh = mode === 'zh'
  const top = ranked.slice(0, 24)
  const head = nearMode ? UI.nearestThatFit : compassOn ? UI.closestToCompass : UI.everythingOnMap
  return (
    <div className="strip">
      <div className="strip-head">
        {t(head)}
        {sub(head) && <span className="zh"> {sub(head)}</span>}
        <em>{ranked.length}</em>
      </div>
      <div className="strip-rail">
        {top.length === 0 && <div className="strip-empty">{t(UI.stripEmpty)}</div>}
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
                    {minutes} {t(UI.minWord)} ·{' '}
                    {zh ? CLOSENESS_ZH[closenessWord(minutes)] ?? closenessWord(minutes) : closenessWord(minutes)}
                  </span>
                )}
                {closingSoon && (
                  <span className="sc-closing">
                    {zh ? `还有 ${toClose} 分钟打烊` : `closes in ${toClose} min`}
                    {mode === 'both' && ' 快打烊'}
                  </span>
                )}
              </span>
              {compassOn && (
                <span className="sc-score">
                  <b>{score}</b>
                  <em>{zh ? VERDICT_ZH[scoreVerdict(score)] ?? scoreVerdict(score) : scoreVerdict(score)}</em>
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
