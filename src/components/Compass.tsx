import type { Axes } from '../data/types'
import { AXES, type Filters } from '../lib/match'
import {
  ARCHETYPE_LABEL,
  ARCHETYPE_ORDER,
  DISTRICTS,
  DISTRICT_ZH,
  QUICK_TAGS,
  TAG_LABEL,
} from '../data/labels'
import { formatHour } from '../lib/palette'

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
  const toggle = <T,>(list: T[], v: T): T[] =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v]

  return (
    <div className="panel-body">
      <button className="quiz-cta" onClick={onQuiz}>
        <span className="quiz-cta-kicker">Six questions</span>
        <span className="quiz-cta-title">What kind of drinker are you?</span>
        <span className="quiz-cta-sub">
          Answer honestly and the atlas repaints itself around you.
        </span>
      </button>

      <div className="section">
        <div className="section-head">
          <h3>The compass</h3>
          <span className="zh">咖啡罗盘</span>
        </div>
        <p className="section-note">
          Five spectrums instead of a search box. Drag them to describe the next hour of
          your life; every café is scored against where you land.
        </p>
        {AXES.map((a) => (
          <label key={a.key} className="axis">
            <span className="axis-top">
              <span className="axis-name">
                {a.label} <span className="zh">{a.labelZh}</span>
              </span>
              <span className="axis-value">{axes[a.key]}</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={axes[a.key]}
              aria-label={a.label}
              onChange={(e) => onAxes({ ...axes, [a.key]: Number(e.target.value) })}
            />
            <span className="axis-ends">
              <span>{a.low}</span>
              <span>{a.high}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="section">
        <div className="section-head">
          <h3>Hard limits</h3>
          <span className="zh">筛选</span>
        </div>

        <input
          className="search"
          type="search"
          placeholder="Name, street or neighbourhood…"
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
              {d} <span className="zh">{DISTRICT_ZH[d]}</span>
            </button>
          ))}
        </div>

        <div className="chips">
          {QUICK_TAGS.map((t) => (
            <button
              key={t}
              className={`chip${filters.tags.includes(t) ? ' on' : ''}`}
              onClick={() => onFilters({ ...filters, tags: toggle(filters.tags, t) })}
            >
              {TAG_LABEL[t] ?? t}
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
              {'¥'.repeat(p)} or less
            </button>
          ))}
          <button
            className={`chip${filters.openAt !== null ? ' on' : ''}`}
            onClick={() =>
              onFilters({ ...filters, openAt: filters.openAt === null ? hour : null })
            }
          >
            Open at {formatHour(hour)}
          </button>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h3>Ten kinds of room</h3>
          <span className="zh">十种空间</span>
        </div>
        <ul className="legend">
          {ARCHETYPE_ORDER.map((a) => (
            <li key={a}>
              <strong>{ARCHETYPE_LABEL[a].en}</strong>
              <span className="zh"> {ARCHETYPE_LABEL[a].zh}</span>
              <em>{ARCHETYPE_LABEL[a].blurb}</em>
            </li>
          ))}
        </ul>
      </div>

      <div className="panel-foot">
        <span>{resultCount} cafés match</span>
        <button className="link" onClick={onReset}>
          Reset everything
        </button>
      </div>
    </div>
  )
}
