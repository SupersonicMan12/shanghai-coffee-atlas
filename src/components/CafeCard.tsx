import type { Axes, Cafe } from '../data/types'
import { CAFES } from '../data/cafes'
import { AXES, blendAllMemo, isOpenAt, scoreVerdict } from '../lib/match'
import { useCafeVotes } from '../lib/votes'
import { CLOSING_SOON_MINUTES, closenessWord, minutesToClose } from '../lib/near'
import { formatHour } from '../lib/palette'
import {
  ARCHETYPE_LABEL,
  AXIS_ENDS_ZH,
  CLOSENESS_ZH,
  DISTRICT_ZH,
  TAG_LABEL,
  TAG_ZH,
  UI,
  VERDICT_ZH,
} from '../data/labels'
import { useI18n } from '../lib/i18n'
import { displayNames } from '../lib/names'
import { CalibrateWidget } from './CalibrateWidget'

const SOURCE_WORD = {
  editorial: { en: 'editorial', zh: '编辑', both: 'editorial 编辑' },
  measured: { en: 'measured', zh: '实测', both: 'measured 实测' },
  voted: { en: 'voted', zh: '读者', both: 'voted 读者' },
} as const

interface Props {
  cafe: Cafe
  score: number | null
  want: Axes
  compassOn: boolean
  hour: number
  visited: boolean
  saved: boolean
  distanceMinutes: number | null
  distanceFrom: string
  onClose: () => void
  onStamp: () => void
  onSave: () => void
  onTaxi: () => void
  onMoreLikeThis: () => void
  onShare: () => void
  onShareCard: () => void
  shared: boolean
}

function hours(cafe: Cafe) {
  return `${formatHour(cafe.opens)} – ${formatHour(cafe.closes)}`
}

export function CafeCard({
  cafe,
  score,
  want,
  compassOn,
  hour,
  visited,
  saved,
  distanceMinutes,
  distanceFrom,
  onClose,
  onStamp,
  onSave,
  onTaxi,
  onMoreLikeThis,
  onShare,
  onShareCard,
  shared,
}: Props) {
  const open = isOpenAt(cafe, hour)
  const { mode, t } = useI18n()
  const zh = mode === 'zh'
  const names = displayNames(cafe, mode)
  const cafeVotes = useCafeVotes()
  const blended = blendAllMemo(CAFES, cafeVotes).get(cafe.id)
  const toClose = minutesToClose(cafe, hour)
  const closingSoon = toClose !== null && toClose <= CLOSING_SOON_MINUTES
  return (
    <aside className="card" key={cafe.id}>
      <button className="card-close" onClick={onClose} aria-label={t(UI.close)}>
        ×
      </button>

      <div className="card-kicker">
        {zh ? ARCHETYPE_LABEL[cafe.archetype].zh : ARCHETYPE_LABEL[cafe.archetype].en}
        {mode === 'both' && <span className="zh"> · {ARCHETYPE_LABEL[cafe.archetype].zh}</span>}
      </div>
      <h2>{names.primary}</h2>
      {names.secondary && <div className="card-zh zh">{names.secondary}</div>}

      <div className="card-where">
        {zh ? (
          <>
            {cafe.streetZh} · {DISTRICT_ZH[cafe.district]}
          </>
        ) : (
          <>
            {cafe.street} · {cafe.hood} · {cafe.district}
          </>
        )}
        {mode === 'both' && (
          <span className="zh">
            {' '}
            / {cafe.streetZh} · {DISTRICT_ZH[cafe.district]}
          </span>
        )}
      </div>

      {compassOn && score !== null && (
        <div className="card-score">
          <span className="score-num">{score}</span>
          <span className="score-verdict">
            {zh ? VERDICT_ZH[scoreVerdict(score)] ?? scoreVerdict(score) : scoreVerdict(score)}
          </span>
          <span className="score-note">{t(UI.againstCompass)}</span>
        </div>
      )}

      <p className="card-signature">“{cafe.signature}”</p>
      <p className="card-note">{cafe.note}</p>

      <div className="card-facts">
        <div>
          <dt>{t(UI.hoursWord)}</dt>
          <dd>
            {hours(cafe)}{' '}
            <em className={open ? 'open' : 'shut'}>
              {open
                ? `${t(UI.openAtHour)} ${formatHour(hour)}`
                : `${t(UI.shutAtHour)} ${formatHour(hour)}`}
            </em>
            {closingSoon && (
              <em className="closing-soon">
                {zh ? `还有 ${toClose} 分钟打烊` : `closes in ${toClose} min`}
                {mode === 'both' && ' 快打烊'}
              </em>
            )}
          </dd>
        </div>
        <div>
          <dt>{t(UI.seatsWord)}</dt>
          <dd>
            {cafe.seats === 0
              ? t(UI.seatsNone)
              : zh
                ? `${t(UI.seatsAbout)} ${cafe.seats} 个`
                : `${t(UI.seatsAbout)} ${cafe.seats}`}
          </dd>
        </div>
        <div>
          <dt>{t(UI.spendWord)}</dt>
          <dd>{'¥'.repeat(cafe.price)}</dd>
        </div>
        {distanceMinutes !== null && (
          <div>
            <dt>{distanceFrom}</dt>
            <dd>
              {distanceMinutes} {t(UI.minWalk)} ·{' '}
              {zh
                ? CLOSENESS_ZH[closenessWord(distanceMinutes)] ?? closenessWord(distanceMinutes)
                : closenessWord(distanceMinutes)}
            </dd>
          </div>
        )}
      </div>

      <div className="card-axes">
        {AXES.map((a) => {
          const ev = blended?.[a.key]
          const v = ev?.value ?? cafe.axes[a.key]
          const conf = ev?.confidence ?? 0.35
          const w = want[a.key]
          const title = ev
            ? `${Math.round(conf * 100)}% ${zh ? UI.confidence.zh : UI.confidence.en} · ${ev.sources
                .map((s) => (mode === 'both' ? SOURCE_WORD[s].both : SOURCE_WORD[s][mode]))
                .join(' + ')}`
            : undefined
          return (
            <div key={a.key} className="card-axis" title={title}>
              <span className="ca-name">{zh ? a.labelZh : a.label}</span>
              <span className="ca-track">
                <span
                  className={`ca-fill${conf < 0.5 ? ' sketch' : ''}`}
                  style={{ width: `${v}%`, opacity: 0.35 + conf * 0.65 }}
                />
                {compassOn && <span className="ca-want" style={{ left: `${w}%` }} />}
              </span>
              <span className="ca-word">
                {v > 66
                  ? zh
                    ? AXIS_ENDS_ZH[a.key]?.high ?? a.high
                    : a.high
                  : v < 34
                    ? zh
                      ? AXIS_ENDS_ZH[a.key]?.low ?? a.low
                      : a.low
                    : '—'}
              </span>
            </div>
          )
        })}
        <div className="axes-legend">
          <span className="al-swatch solid" /> {t(UI.wellEvidenced)}
          {mode === 'both' && ' 有据'}
          <span className="al-swatch faint" /> {t(UI.editorialGuess)}
          {mode === 'both' && ' 编辑判断'}
        </div>
      </div>

      <div className="card-tags">
        {cafe.tags.map((tag) => (
          <span key={tag} className="tag">
            {zh ? TAG_ZH[tag] ?? tag : TAG_LABEL[tag] ?? tag}
          </span>
        ))}
      </div>

      <div className="card-actions">
        <button className={`act${visited ? ' on' : ''}`} onClick={onStamp}>
          {visited ? t(UI.stamped) : t(UI.stampVisited)}
        </button>
        <button className={`act${saved ? ' on' : ''}`} onClick={onSave}>
          {saved ? t(UI.onYourList) : t(UI.saveForLater)}
        </button>
        <button className="act" onClick={onTaxi}>
          {t(UI.taxiCard)}
          {mode === 'both' && ' 出租车卡'}
        </button>
        <button className="act" onClick={onMoreLikeThis}>
          {t(UI.moreLikeThis)}
        </button>
        <button className="act" onClick={onShare}>
          {shared ? t(UI.linkCopied) : t(UI.share)}
        </button>
        <button className="act" onClick={onShareCard}>
          {t(UI.shareCard)}
          {mode === 'both' && ' 分享卡片'}
        </button>
      </div>

      <CalibrateWidget cafe={cafe} />
    </aside>
  )
}
