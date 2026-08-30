import type { Axes } from '../data/types'
import { AXES, type Filters } from '../lib/match'
import {
  ARCHETYPE_BLURB_ZH,
  ARCHETYPE_LABEL,
  ARCHETYPE_ORDER,
  AXIS_ENDS_ZH,
  DISTRICTS,
  DISTRICT_ZH,
  QUICK_TAGS,
  TAG_LABEL,
  TAG_ZH,
  UI,
} from '../data/labels'
import { formatHour } from '../lib/palette'
import { useI18n } from '../lib/i18n'

interface Props {
  axes: Axes
  onAxes: (a: Axes) => void
  filters: Filters
  onFilters: (f: Filters) => void
  hour: number
  onQuiz: () => void
  onReset: () => void
  resultCount: number
}

export function Compass({
  axes,
  onAxes,
  filters,
  onFilters,
  hour,
  onQuiz,
  onReset,
  resultCount,
}: Props) {
  const { mode, t, sub } = useI18n()
  const zh = mode === 'zh'
  const toggle = <T,>(list: T[], v: T): T[] =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v]

  return (
    <div className="panel-body">
      <button className="quiz-cta" onClick={onQuiz}>
        <span className="quiz-cta-kicker">{t(UI.sixQuestions)}</span>
        <span className="quiz-cta-title">{t(UI.quizTitle)}</span>
        <span className="quiz-cta-sub">{t(UI.quizSub)}</span>
      </button>

      <div className="section">
        <div className="section-head">
          <h3>{t(UI.theCompass)}</h3>
          {sub(UI.theCompass) && <span className="zh">{sub(UI.theCompass)}</span>}
        </div>
        <p className="section-note">{t(UI.compassNote)}</p>
        {AXES.map((a) => (
          <label key={a.key} className="axis">
            <span className="axis-top">
              <span className="axis-name">
                {zh ? a.labelZh : a.label}
                {mode === 'both' && <span className="zh"> {a.labelZh}</span>}
              </span>
              <span className="axis-value">{axes[a.key]}</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={axes[a.key]}
              aria-label={zh ? a.labelZh : a.label}
              onChange={(e) => onAxes({ ...axes, [a.key]: Number(e.target.value) })}
            />
            <span className="axis-ends">
              <span>{zh ? AXIS_ENDS_ZH[a.key]?.low ?? a.low : a.low}</span>
              <span>{zh ? AXIS_ENDS_ZH[a.key]?.high ?? a.high : a.high}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="section">
        <div className="section-head">
          <h3>{t(UI.hardLimits)}</h3>
          {sub(UI.hardLimits) && <span className="zh">{sub(UI.hardLimits)}</span>}
        </div>

        <input
          className="search"
          type="search"
          placeholder={t(UI.searchPlaceholder)}
          value={filters.query}
          onChange={(e) => onFilters({ ...filters, query: e.target.value })}
        />

        <div className="chips">
          {DISTRICTS.map((d) => (
            <button
              key={d}
              className={`chip${filters.districts.includes(d) ? ' on' : ''}`}
              onClick={() => onFilters({ ...filters, districts: toggle(filters.districts, d) })}
            >
              {zh ? DISTRICT_ZH[d] : d}
              {mode === 'both' && <span className="zh"> {DISTRICT_ZH[d]}</span>}
            </button>
          ))}
        </div>

        <div className="chips">
          {QUICK_TAGS.map((tag) => (
            <button
              key={tag}
              className={`chip${filters.tags.includes(tag) ? ' on' : ''}`}
              onClick={() => onFilters({ ...filters, tags: toggle(filters.tags, tag) })}
            >
              {zh ? TAG_ZH[tag] ?? tag : TAG_LABEL[tag] ?? tag}
            </button>
          ))}
        </div>

        <div className="chips">
          {([1, 2, 3] as const).map((p) => (
            <button
              key={p}
              className={`chip${filters.maxPrice === p ? ' on' : ''}`}
              onClick={() => onFilters({ ...filters, maxPrice: filters.maxPrice === p ? null : p })}
            >
              {zh ? `${'¥'.repeat(p)}${t(UI.orLess)}` : `${'¥'.repeat(p)} ${t(UI.orLess)}`}
            </button>
          ))}
          <button
            className={`chip${filters.openAt !== null ? ' on' : ''}`}
            onClick={() =>
              onFilters({ ...filters, openAt: filters.openAt === null ? hour : null })
            }
          >
            {t(UI.openAt)} {formatHour(hour)}
          </button>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h3>{t(UI.tenKinds)}</h3>
          {sub(UI.tenKinds) && <span className="zh">{sub(UI.tenKinds)}</span>}
        </div>
        <ul className="legend">
          {ARCHETYPE_ORDER.map((a) => (
            <li key={a}>
              <strong>{zh ? ARCHETYPE_LABEL[a].zh : ARCHETYPE_LABEL[a].en}</strong>
              {mode === 'both' && <span className="zh"> {ARCHETYPE_LABEL[a].zh}</span>}
              <em>{zh ? ARCHETYPE_BLURB_ZH[a] : ARCHETYPE_LABEL[a].blurb}</em>
            </li>
          ))}
        </ul>
      </div>

      <div className="panel-foot">
        <span>
          {resultCount} {t(UI.cafesMatch)}
        </span>
        <button className="link" onClick={onReset}>
          {t(UI.resetEverything)}
        </button>
      </div>
    </div>
  )
}
