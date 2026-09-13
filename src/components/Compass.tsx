import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Axes } from '../data/types'
import { AXES, type AxisDef, type Filters } from '../lib/match'
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
import { formatHour, type PhaseId } from '../lib/palette'
import { useI18n } from '../lib/i18n'
import { SCENARIOS, type Scenario } from '../lib/scenarios'

interface Props {
  axes: Axes
  onAxes: (a: Axes) => void
  filters: Filters
  onFilters: (f: Filters) => void
  hour: number
  phaseId: PhaseId
  scenarioId: string | null
  scenarioModified: boolean
  onScenario: (s: Scenario | null) => void
  onQuiz: () => void
  onReset: () => void
  resultCount: number
  /** Which sections to draw — the mobile sheet reveals them by snap point. */
  reveal?: 'peek' | 'half' | 'full'
  /** False when the host already draws the chips (the phone sheet's peek). */
  showScenarios?: boolean
}

/* ── scenario chips ─────────────────────────────────────────────────────── */

export const ScenarioChips = memo(function ScenarioChips({
  activeId,
  modified,
  phaseId,
  onPick,
  showTitle = true,
}: {
  activeId: string | null
  modified: boolean
  phaseId: PhaseId
  onPick: (s: Scenario | null) => void
  showTitle?: boolean
}) {
  const { mode, t, sub } = useI18n()
  return (
    <div className="scenarios">
      {showTitle && (
        <div className="section-head">
          <h3>{t(UI.scenariosTitle)}</h3>
          {sub(UI.scenariosTitle) && <span className="zh">{sub(UI.scenariosTitle)}</span>}
        </div>
      )}
      <div className="scenario-row" role="listbox" aria-label={t(UI.scenariosTitle)}>
        {SCENARIOS.map((s, i) => {
          const on = s.id === activeId
          const now = s.phases.includes(phaseId)
          return (
            <button
              key={s.id}
              role="option"
              aria-selected={on}
              className={`scenario${on ? ' on' : ''}${on && modified ? ' modified' : ''}${now ? ' now' : ''}`}
              onClick={() => onPick(on ? null : s)}
              title={`${t(s.promise)}${mode === 'both' ? `\n${s.promise.zh}` : ''}`}
            >
              <span className="scenario-key" aria-hidden>
                {i + 1}
              </span>
              <span className="scenario-name">
                {t(s.name)}
                {mode === 'both' && <span className="zh"> {s.name.zh}</span>}
              </span>
              {on && modified && <span className="scenario-mod">{t(UI.scenarioModified)}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
})

/* ── sliders ────────────────────────────────────────────────────────────── */

/** cubic-bezier(.2,.8,.2,1) — the glide the brief asks for, solved for y(t). */
function glide(p: number): number {
  const x1 = 0.2
  const y1 = 0.8
  const x2 = 0.2
  const y2 = 1
  const bez = (t: number, a: number, b: number) =>
    3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t
  let t = p
  for (let i = 0; i < 6; i++) {
    const x = bez(t, x1, x2) - p
    const dx =
      3 * (1 - t) * (1 - t) * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2)
    if (Math.abs(dx) < 1e-6) break
    t -= x / dx
  }
  return bez(Math.min(1, Math.max(0, t)), y1, y2)
}

const GLIDE_MS = 320

const AxisSlider = memo(function AxisSlider({
  def,
  value,
  gliding,
  onInput,
  onDragState,
}: {
  def: AxisDef
  value: number
  gliding: boolean
  onInput: (key: keyof Axes, v: number) => void
  onDragState: (down: boolean) => void
}) {
  const { mode } = useI18n()
  const zh = mode === 'zh'
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const dir =
      e.key === 'ArrowRight' || e.key === 'ArrowUp'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
          ? -1
          : 0
    if (!dir) return
    e.preventDefault()
    onInput(def.key, Math.max(0, Math.min(100, value + dir * 5)))
  }
  return (
    <label className={`axis${gliding ? ' gliding' : ''}`}>
      <span className="axis-top">
        <span className="axis-name">
          {zh ? def.labelZh : def.label}
          {mode === 'both' && <span className="zh"> {def.labelZh}</span>}
        </span>
        <span className="axis-value">{value}</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        aria-label={zh ? def.labelZh : def.label}
        onChange={(e) => onInput(def.key, Number(e.target.value))}
        onKeyDown={onKey}
        onPointerDown={() => onDragState(true)}
        onPointerUp={() => onDragState(false)}
        onPointerCancel={() => onDragState(false)}
        onBlur={() => onDragState(false)}
      />
      <span className="axis-ends">
        <span>{zh ? AXIS_ENDS_ZH[def.key]?.low ?? def.low : def.low}</span>
        <span>{zh ? AXIS_ENDS_ZH[def.key]?.high ?? def.high : def.high}</span>
      </span>
    </label>
  )
})

const sameAxes = (a: Axes, b: Axes) => AXES.every(({ key }) => a[key] === b[key])

/**
 * The five dials. Owns what the thumbs *show* so that a scenario tap can
 * glide them to the preset (~320ms) while the ranking has already jumped;
 * a drag writes through immediately and never animates.
 */
const SliderBank = memo(function SliderBank({
  axes,
  onAxes,
}: {
  axes: Axes
  onAxes: (a: Axes) => void
}) {
  const [shown, setShown] = useState<Axes>(axes)
  const shownRef = useRef<Axes>(axes)
  const dragging = useRef(false)
  const anim = useRef(0)
  const [gliding, setGliding] = useState(false)

  const commit = useCallback((a: Axes) => {
    shownRef.current = a
    setShown(a)
  }, [])

  useEffect(() => {
    if (sameAxes(axes, shownRef.current)) return
    cancelAnimationFrame(anim.current)
    const from = shownRef.current
    const jump = Math.max(...AXES.map(({ key }) => Math.abs(axes[key] - from[key])))
    const reduced =
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
    if (dragging.current || jump < 8 || reduced) {
      commit(axes)
      return
    }
    setGliding(true)
    const t0 = performance.now()
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / GLIDE_MS)
      const e = glide(p)
      const cur = { ...from }
      for (const { key } of AXES) cur[key] = Math.round(from[key] + (axes[key] - from[key]) * e)
      commit(p >= 1 ? axes : cur)
      if (p < 1) anim.current = requestAnimationFrame(step)
      else setGliding(false)
    }
    anim.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(anim.current)
  }, [axes, commit])

  const onInput = useCallback(
    (key: keyof Axes, v: number) => {
      cancelAnimationFrame(anim.current)
      setGliding(false)
      const next = { ...shownRef.current, [key]: v }
      commit(next)
      onAxes(next)
    },
    [commit, onAxes],
  )
  const onDragState = useCallback((down: boolean) => {
    dragging.current = down
  }, [])

  return (
    <>
      {AXES.map((a) => (
        <AxisSlider
          key={a.key}
          def={a}
          value={shown[a.key]}
          gliding={gliding}
          onInput={onInput}
          onDragState={onDragState}
        />
      ))}
    </>
  )
})

/* ── hard limits ────────────────────────────────────────────────────────── */

const HardLimits = memo(function HardLimits({
  filters,
  onFilters,
  hour,
}: {
  filters: Filters
  onFilters: (f: Filters) => void
  hour: number
}) {
  const { mode, t, sub } = useI18n()
  const zh = mode === 'zh'
  const toggle = <T,>(list: T[], v: T): T[] =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
  return (
    <div className="section section-limits">
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
          onClick={() => onFilters({ ...filters, openAt: filters.openAt === null ? hour : null })}
        >
          {t(UI.openAt)} {formatHour(hour)}
        </button>
      </div>
    </div>
  )
})

const Legend = memo(function Legend() {
  const { mode, t, sub } = useI18n()
  const zh = mode === 'zh'
  return (
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
  )
})

/* ── the panel ──────────────────────────────────────────────────────────── */

export function Compass({
  axes,
  onAxes,
  filters,
  onFilters,
  hour,
  phaseId,
  scenarioId,
  scenarioModified,
  onScenario,
  onQuiz,
  onReset,
  resultCount,
  reveal = 'full',
  showScenarios = true,
}: Props) {
  const { t, sub } = useI18n()
  const active = scenarioId ? SCENARIOS.find((s) => s.id === scenarioId) ?? null : null
  const showSliders = reveal !== 'peek'
  const showLimits = reveal === 'full'

  return (
    <div className="panel-body">
      {showScenarios && (
        <ScenarioChips
          activeId={scenarioId}
          modified={scenarioModified}
          phaseId={phaseId}
          onPick={onScenario}
        />
      )}
      {showScenarios && active && (
        <p className="scenario-promise">
          {t(active.promise)}
          {sub(active.promise) && <span className="zh"> {sub(active.promise)}</span>}
        </p>
      )}

      {showSliders && (
        <div className="section section-dials">
          <div className="section-head">
            <h3>{t(UI.theCompass)}</h3>
            {sub(UI.theCompass) && <span className="zh">{sub(UI.theCompass)}</span>}
          </div>
          <p className="section-note">{t(UI.compassNote)}</p>
          <SliderBank axes={axes} onAxes={onAxes} />
          <button className="quiz-cta small" onClick={onQuiz}>
            <span className="quiz-cta-kicker">{t(UI.sixQuestions)}</span>
            <span className="quiz-cta-title">{t(UI.quizTitle)}</span>
          </button>
        </div>
      )}

      {showLimits && <HardLimits filters={filters} onFilters={onFilters} hour={hour} />}
      {showLimits && <Legend />}

      {showLimits && (
        <div className="panel-foot">
          <span>
            {resultCount} {t(UI.cafesMatch)}
          </span>
          <span className="keys-hint">{t(UI.keysHint)}</span>
          <button className="link" onClick={onReset}>
            {t(UI.resetEverything)}
          </button>
        </div>
      )}
    </div>
  )
}
