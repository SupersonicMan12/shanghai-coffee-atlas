import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { CAFES } from './data/cafes'
import { CRAWLS } from './data/crawls'
import type { Axes, Cafe } from './data/types'
import { AtlasMap, type AtlasHandle } from './components/AtlasMap'
import { Compass, ScenarioChips } from './components/Compass'
import { BottomSheet, type Snap } from './components/BottomSheet'
import { CafeCard } from './components/CafeCard'
import { CrawlList } from './components/CrawlList'
import { PassportPanel } from './components/PassportPanel'
import { Methodology } from './components/Methodology'
import { NearMePanel } from './components/NearMePanel'
import { QuizModal } from './components/QuizModal'
import { ResultsStrip } from './components/ResultsStrip'
import { SearchBox } from './components/SearchBox'
import { ListView } from './components/ListView'
import { Onboarding } from './components/Onboarding'
import { shouldOnboard } from './lib/onboard'
import { TaxiCard } from './components/TaxiCard'
import { ShareCardModal, type PicksShare, type ShareKind } from './components/ShareCard'
import {
  EMPTY_FILTERS,
  EVEN_WEIGHTS,
  NEUTRAL,
  blendAllMemo,
  rank,
  type Filters,
  type Ranked,
} from './lib/match'
import { anchorFromHash, anchorLabel, anchorPoint, anchorToHash, rankNear, type Anchor } from './lib/near'
import { PHASES, formatHour, phaseForHour, shanghaiHour } from './lib/palette'
import { detailFor } from './lib/details'
import {
  SCENARIO_BY_ID,
  passesScenarioFilter,
  scenarioModified,
  type Scenario,
} from './lib/scenarios'
import { WALK_LIMIT_MIN, compassSays, explain, shanghaiWeekday, type Why } from './lib/why'
import { usePassport } from './lib/passport'
import { useCafeVotes } from './lib/votes'
import { BBOX, haversine, walkingMinutes } from './lib/projection'
import { I18nContext, makeI18n, readStoredLang, storeLang, type LangMode, type Pair } from './lib/i18n'
import { PHASE_LINE_ZH, UI } from './data/labels'

type Panel = 'compass' | 'crawls' | 'passport'
type Lang = LangMode

const byId = new Map(CAFES.map((c) => [c.id, c]))

interface HashState {
  cafe?: string
  axes?: Axes
  scenario?: string
  crawl?: string
  method?: boolean
  anchor?: Anchor
  lang?: Lang
}

function readHash(): HashState {
  if (typeof location === 'undefined') return {}
  const h = new URLSearchParams(location.hash.replace(/^#\/?/, ''))
  const out: HashState = {}
  if (h.has('method')) out.method = true
  const s = h.get('s')
  if (s && SCENARIO_BY_ID.has(s)) out.scenario = s
  const lang = h.get('lang')
  if (lang === 'both' || lang === 'en' || lang === 'zh') out.lang = lang
  const cafe = h.get('cafe')
  if (cafe && byId.has(cafe)) out.cafe = cafe
  const crawl = h.get('crawl')
  if (crawl && CRAWLS.some((c) => c.id === crawl)) out.crawl = crawl
  const at = h.get('at')
  if (at) {
    const anchor = anchorFromHash(at)
    if (anchor) out.anchor = anchor
  }
  const a = h.get('a')
  if (a) {
    const parts = a.split('-').map(Number)
    if (parts.length === 5 && parts.every((n) => Number.isFinite(n) && n >= 0 && n <= 100)) {
      out.axes = {
        focus: parts[0],
        energy: parts[1],
        linger: parts[2],
        adventure: parts[3],
        spend: parts[4],
      }
    }
  }
  // a scenario alone is enough to set the dials; `a=` (if present) wins
  if (!out.axes && out.scenario) out.axes = SCENARIO_BY_ID.get(out.scenario)?.axes
  return out
}

function useMobile(): boolean {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)')
    const on = () => setMobile(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return mobile
}

export default function App() {
  const initial = useMemo(() => readHash(), [])
  const mobile = useMobile()

  const [axes, setAxesNow] = useState<Axes>(initial.axes ?? NEUTRAL)
  const [compassOn, setCompassOn] = useState(Boolean(initial.axes))
  const [scenarioId, setScenarioId] = useState<string | null>(initial.scenario ?? null)
  const [sheet, setSheet] = useState<Snap>('peek')

  // Slider `input` fires faster than we want to rank; keep the newest value
  // and commit once per animation frame. The blend cache makes each rank cheap.
  const pendingAxes = useRef<Axes | null>(null)
  const axesFrame = useRef(0)
  const setAxes = useCallback((a: Axes) => {
    pendingAxes.current = a
    if (axesFrame.current) return
    axesFrame.current = requestAnimationFrame(() => {
      axesFrame.current = 0
      if (pendingAxes.current) setAxesNow(pendingAxes.current)
      pendingAxes.current = null
    })
  }, [])
  useEffect(() => () => cancelAnimationFrame(axesFrame.current), [])
  const [character, setCharacter] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [panel, setPanel] = useState<Panel>(initial.crawl ? 'crawls' : 'compass')
  const [selectedId, setSelectedId] = useState<string | null>(initial.cafe ?? null)
  const [crawlId, setCrawlId] = useState<string | null>(initial.crawl ?? null)
  const [quizOpen, setQuizOpen] = useState(false)
  const [methodOpen, setMethodOpen] = useState(Boolean(initial.method))
  const [taxiFor, setTaxiFor] = useState<Cafe | null>(null)
  const [shareFor, setShareFor] = useState<{ cafe: Cafe; kind: ShareKind; picks?: PicksShare } | null>(
    null,
  )
  const [hourOverride, setHourOverride] = useState<number | null>(null)
  const [lang, setLangState] = useState<Lang>(() => initial.lang ?? readStoredLang() ?? 'both')
  const [copied, setCopied] = useState<string | null>(null)
  const [me, setMe] = useState<{ lng: number; lat: number } | null>(null)
  const [geoNote, setGeoNote] = useState<Pair | null>(null)
  const [railOpen, setRailOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth > 900,
  )
  const [view, setView] = useState<'map' | 'list'>('map')
  const [onboard, setOnboard] = useState(() => shouldOnboard())

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    storeLang(l)
  }, [])

  const i18n = useMemo(() => makeI18n(lang), [lang])
  const t = i18n.t
  const [anchor, setAnchor] = useState<Anchor | null>(initial.anchor ?? null)
  const [pinArm, setPinArm] = useState(false)

  const mapRef = useRef<AtlasHandle | null>(null)
  const passport = usePassport()

  const nowHour = useMemo(() => shanghaiHour(), [])
  const weekday = useMemo(() => shanghaiWeekday(), [])
  const hour = hourOverride ?? nowHour
  const phase = phaseForHour(hour)

  const scenario: Scenario | null = scenarioId ? SCENARIO_BY_ID.get(scenarioId) ?? null : null
  const weights = scenario?.weights ?? EVEN_WEIGHTS
  const modified = scenario ? scenarioModified(scenario, axes) : false

  const cafeVotes = useCafeVotes()
  const blended = useMemo(() => blendAllMemo(CAFES, cafeVotes), [cafeVotes])
  const ranked = useMemo(
    () =>
      rank(
        CAFES,
        axes,
        filters,
        weights,
        cafeVotes,
        scenario?.filter ? (c) => passesScenarioFilter(c, scenario.filter, hour) : undefined,
      ),
    [axes, filters, weights, cafeVotes, scenario, hour],
  )
  const nearRanked = useMemo(
    () => (anchor ? rankNear(ranked, anchor) : null),
    [ranked, anchor],
  )
  // Anchored: the question is "from here" — rooms within a walk rank by fit
  // first, then everything further, so the picks are places you can reach.
  const shownRanked = useMemo((): (Ranked & { minutes?: number })[] => {
    if (!nearRanked) return ranked
    if (!compassOn) return nearRanked
    const near = nearRanked.filter((r) => r.minutes <= WALK_LIMIT_MIN).sort((a, b) => b.score - a.score)
    const far = nearRanked.filter((r) => r.minutes > WALK_LIMIT_MIN)
    return [...near, ...far]
  }, [ranked, nearRanked, compassOn])
  const scores = useMemo(
    () => new Map(ranked.map((r) => [r.cafe.id, r.score])),
    [ranked],
  )

  const explainFor = useCallback(
    (cafe: Cafe, minutesAway?: number): Why =>
      explain(cafe, axes, weights, blended.get(cafe.id), detailFor(cafe), {
        hour,
        weekday,
        minutesAway,
        anchorName: anchor ? anchorLabel(anchor) : undefined,
        lang,
      }),
    [axes, weights, blended, hour, weekday, anchor, lang],
  )

  const says = useMemo(
    () =>
      compassSays({
        compassOn,
        scenario: scenario?.name ?? null,
        anchor: anchor ? anchorLabel(anchor) : null,
        hour,
        openNow: filters.openAt !== null,
        results: shownRanked,
      }),
    [compassOn, scenario, anchor, hour, filters.openAt, shownRanked],
  )

  const pickScenario = useCallback(
    (s: Scenario | null) => {
      if (!s) {
        setScenarioId(null)
        return
      }
      setScenarioId(s.id)
      setAxesNow(s.axes)
      setCompassOn(true)
      setCharacter(null)
      setPanel('compass')
      if (s.filter?.openNow) setFilters((f) => ({ ...f, openAt: f.openAt ?? hour }))
    },
    [hour],
  )

  const sharePicks = useCallback(() => {
    const top = shownRanked.slice(0, 3)
    if (!top.length) return
    const picks: PicksShare = {
      scenario: scenario?.name ?? null,
      picks: top.map((r) => ({
        cafe: r.cafe,
        headline: explainFor(r.cafe, r.minutes).headline,
        score: r.score,
      })),
      want: axes,
      url: location.href,
    }
    setShareFor({ cafe: top[0].cafe, kind: 'picks', picks })
  }, [shownRanked, scenario, explainFor, axes])
  const selected = selectedId ? byId.get(selectedId) ?? null : null
  const crawl = crawlId ? CRAWLS.find((c) => c.id === crawlId) ?? null : null
  const crawlCafes = useMemo(
    () =>
      crawl
        ? crawl.stops.map((s) => byId.get(s.cafeId)).filter((c): c is Cafe => Boolean(c))
        : [],
    [crawl],
  )

  const visitedSet = useMemo(
    () => new Set(passport.state.stamps.map((s) => s.cafeId)),
    [passport.state.stamps],
  )
  const savedSet = useMemo(() => new Set(passport.state.saved), [passport.state.saved])

  useEffect(() => {
    const parts: string[] = []
    if (selectedId) parts.push(`cafe=${selectedId}`)
    if (crawlId) parts.push(`crawl=${crawlId}`)
    if (compassOn) {
      parts.push(`a=${axes.focus}-${axes.energy}-${axes.linger}-${axes.adventure}-${axes.spend}`)
    }
    if (scenarioId) parts.push(`s=${scenarioId}`)
    if (methodOpen) parts.push('method')
    if (anchor) parts.push(`at=${anchorToHash(anchor)}`)
    if (lang !== 'both') parts.push(`lang=${lang}`)
    const next = parts.length ? `#/${parts.join('&')}` : '#/'
    if (location.hash !== next) history.replaceState(null, '', next)
  }, [selectedId, crawlId, compassOn, axes, scenarioId, methodOpen, anchor, lang])

  useEffect(() => {
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`)
        .catch(() => undefined)
    }
  }, [])

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(null), 1800)
    return () => clearTimeout(t)
  }, [copied])

  const flyTo = useCallback((cafe: Cafe) => {
    mapRef.current?.focusOn(cafe.lng, cafe.lat, 3.6)
  }, [])

  const fitRoute = useCallback((stops: Cafe[]) => {
    if (!stops.length) return
    const lngs = stops.map((c) => c.lng)
    const lats = stops.map((c) => c.lat)
    const lng = (Math.min(...lngs) + Math.max(...lngs)) / 2
    const lat = (Math.min(...lats) + Math.max(...lats)) / 2
    const span = Math.max(
      Math.max(...lngs) - Math.min(...lngs),
      (Math.max(...lats) - Math.min(...lats)) * 1.17,
      0.004,
    )
    mapRef.current?.focusOn(lng, lat, Math.min(4.5, Math.max(1.6, 0.055 / span)))
  }, [])

  useEffect(() => {
    const shared = initial.crawl ? CRAWLS.find((c) => c.id === initial.crawl) : null
    if (shared) {
      fitRoute(
        shared.stops.map((s) => byId.get(s.cafeId)).filter((c): c is Cafe => Boolean(c)),
      )
      return
    }
    const cafe = initial.cafe ? byId.get(initial.cafe) : null
    if (cafe) mapRef.current?.focusOn(cafe.lng, cafe.lat, 3.6)
  }, [initial, fitRoute])

  useEffect(() => {
    const onHash = () => {
      const h = readHash()
      setSelectedId(h.cafe ?? null)
      setCrawlId(h.crawl ?? null)
      setMethodOpen(Boolean(h.method))
      setAnchor(h.anchor ?? null)
      if (h.lang) setLangState(h.lang)
      setScenarioId(h.scenario ?? null)
      if (h.axes) {
        setAxesNow(h.axes)
        setCompassOn(true)
      }
      const shared = h.crawl ? CRAWLS.find((c) => c.id === h.crawl) : null
      if (shared) {
        setPanel('crawls')
        fitRoute(
          shared.stops.map((s) => byId.get(s.cafeId)).filter((c): c is Cafe => Boolean(c)),
        )
        return
      }
      const cafe = h.cafe ? byId.get(h.cafe) : null
      if (cafe) mapRef.current?.focusOn(cafe.lng, cafe.lat, 3.6)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [fitRoute])

  const selectCafe = useCallback(
    (id: string | null) => {
      setSelectedId(id)
      if (id) {
        const cafe = byId.get(id)
        if (cafe) flyTo(cafe)
        // On a phone the card takes the bottom of the screen; the sheet steps aside.
        if (window.innerWidth <= 900) setSheet('hidden')
      } else if (window.innerWidth <= 900) {
        setSheet((s) => (s === 'hidden' ? 'peek' : s))
      }
    },
    [flyTo],
  )

  // `/` search · 1–8 scenario · Esc closes the card. Arrows live on the sliders.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const typing =
        el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if (e.key === 'Escape') {
        if (selectedId) {
          selectCafe(null)
          e.preventDefault()
        }
        return
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '/') {
        const box = document.querySelector<HTMLInputElement>('.searchbox input')
        if (box) {
          box.focus()
          box.select()
          e.preventDefault()
        }
        return
      }
      if (e.key >= '1' && e.key <= '8') {
        const s = [...SCENARIO_BY_ID.values()][Number(e.key) - 1]
        if (s) {
          pickScenario(scenarioId === s.id ? null : s)
          e.preventDefault()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, selectCafe, pickScenario, scenarioId])

  const copy = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
    } catch {
      setCopied(null)
    }
  }, [])

  const distanceMinutes = useMemo(() => {
    if (!selected) return null
    const from = anchor ? anchorPoint(anchor) : me
    if (!from) return null
    return walkingMinutes(haversine(from.lng, from.lat, selected.lng, selected.lat))
  }, [me, anchor, selected])

  const locate = () => {
    if (!navigator.geolocation) {
      setGeoNote(UI.geoNoShare)
      return
    }
    setGeoNote(UI.geoLooking)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { longitude: lng, latitude: lat } = pos.coords
        if (lat < BBOX.south || lat > BBOX.north || lng < BBOX.west || lng > BBOX.east) {
          setMe(null)
          setGeoNote(UI.geoOutside)
          return
        }
        setMe({ lng, lat })
        setAnchor({ kind: 'me', lng, lat })
        setGeoNote(null)
        mapRef.current?.focusOn(lng, lat, 3.2)
      },
      () => setGeoNote(UI.geoRefused),
      { timeout: 8000 },
    )
  }

  const setAnchorAndFly = useCallback((a: Anchor | null) => {
    setAnchor(a)
    setPinArm(false)
    if (a) {
      const p = anchorPoint(a)
      mapRef.current?.focusOn(p.lng, p.lat, 3.2)
    }
  }, [])

  const style = {
    '--paper': phase.paper,
    '--paper-edge': phase.paperEdge,
    '--ink': phase.ink,
    '--ink-soft': phase.inkSoft,
    '--water': phase.water,
    '--water-edge': phase.waterEdge,
    '--park': phase.park,
    '--park-ink': phase.inkSoft,
    '--road': phase.road,
    '--road-strong': phase.lane,
    '--lane': phase.lane,
    '--glow': phase.glow,
    '--accent': phase.accent,
    '--pin-fill': phase.paper,
    '--stamp': phase.accent,
  } as React.CSSProperties

  const railTabs = (
    <nav className="rail-tabs">
      <button className={panel === 'compass' ? 'on' : ''} onClick={() => setPanel('compass')}>
        {t(UI.tabCompass)}
      </button>
      <button className={panel === 'crawls' ? 'on' : ''} onClick={() => setPanel('crawls')}>
        {t(UI.tabCrawls)}
      </button>
      <button className={panel === 'passport' ? 'on' : ''} onClick={() => setPanel('passport')}>
        {t(UI.tabPassport)}
      </button>
    </nav>
  )

  const nearPanel = (
    <NearMePanel
      anchor={anchor}
      onAnchor={setAnchorAndFly}
      onLocate={locate}
      pinArm={pinArm}
      onPinArm={setPinArm}
      openNow={filters.openAt !== null}
      onOpenNow={() => setFilters({ ...filters, openAt: filters.openAt === null ? hour : null })}
      hour={hour}
    />
  )

  const compassProps = {
    axes,
    onAxes: (a: Axes) => {
      setAxes(a)
      setCompassOn(true)
    },
    filters,
    onFilters: setFilters,
    hour,
    phaseId: phase.id,
    scenarioId,
    scenarioModified: modified,
    onScenario: pickScenario,
    onQuiz: () => setQuizOpen(true),
    onReset: () => {
      setAxesNow(NEUTRAL)
      setScenarioId(null)
      setCompassOn(false)
      setCharacter(null)
      setFilters(EMPTY_FILTERS)
      setCrawlId(null)
      setSelectedId(null)
      setAnchor(null)
      setPinArm(false)
      mapRef.current?.reset()
    },
    resultCount: ranked.length,
  }

  const crawlPanel = (
    <CrawlList
      cafesById={byId}
      activeId={crawlId}
      onActivate={(id) => {
        setCrawlId(id)
        setSelectedId(null)
        const route = id ? CRAWLS.find((c) => c.id === id) : null
        if (!route) {
          mapRef.current?.reset()
          return
        }
        fitRoute(
          route.stops.map((s) => byId.get(s.cafeId)).filter((c): c is Cafe => Boolean(c)),
        )
      }}
      onSelectCafe={selectCafe}
      visited={visitedSet}
    />
  )

  const passportPanel = (
    <PassportPanel
      cafes={CAFES}
      stamps={passport.state.stamps}
      saved={passport.state.saved}
      onSelectCafe={selectCafe}
      onClear={passport.clear}
      shared={copied === 'passport'}
      onShare={() => {
        const lines = passport.state.stamps
          .map((s) => byId.get(s.cafeId))
          .filter((c): c is Cafe => Boolean(c))
          .map((c) => `· ${c.name} ${c.nameZh} — ${c.street}`)
        copy(
          `My Shanghai Coffee Atlas passport (${passport.state.stamps.length} stamps)\n${lines.join('\n')}`,
          'passport',
        )
      }}
    />
  )

  return (
    <I18nContext.Provider value={i18n}>
    <div className={`app phase-${phase.id} lang-${lang}${railOpen ? '' : ' rail-closed'}`} style={style}>
      <header className="top">
        <div className="brand">
          <span className="brand-mark">
            <svg viewBox="-16 -16 32 32" aria-hidden>
              <circle r="14" className="bm-ring" />
              <path d="M-6 -3 h10 v5 a5 5 0 0 1 -10 0 z" className="bm-cup" />
              <path d="M4 -2 a3.4 3.4 0 0 1 0 5.4" className="bm-cup" />
              <path d="M-8 6.5 h16" className="bm-cup" />
            </svg>
          </span>
          <span className="brand-words">
            <strong>The Shanghai Coffee Atlas</strong>
            <em className="zh">上海咖啡地图集</em>
          </span>
        </div>

        <div className="phase-bar">
          <div className="phase-line">
            <strong>{phase.label}</strong>
            <span className="zh">{phase.labelZh}</span>
            <span className="phase-clock">{formatHour(hour)}</span>
            {hourOverride === null && <span className="phase-live">{t(UI.shanghaiNow)}</span>}
          </div>
          <input
            type="range"
            min={0}
            max={23.75}
            step={0.25}
            value={hour}
            aria-label={t(UI.hourOfDay)}
            onChange={(e) => setHourOverride(Number(e.target.value))}
          />
          <div className="phase-jumps">
            {PHASES.map((p) => (
              <button
                key={p.id}
                className={p.id === phase.id ? 'on' : ''}
                onClick={() => setHourOverride(p.id === 'night' ? 21 : (p.from + p.to) / 2)}
              >
                {lang === 'zh' ? p.labelZh : p.label}
              </button>
            ))}
            <button onClick={() => setHourOverride(null)}>{t(UI.now)}</button>
          </div>
        </div>

        <div className="top-right">
          <SearchBox cafes={CAFES} onPick={selectCafe} />
          <div className="top-right-row">
            <div className="lang-toggle">
              {(['both', 'en', 'zh'] as Lang[]).map((l) => (
                <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>
                  {l === 'both' ? 'EN / 中' : l === 'en' ? 'EN' : '中文'}
                </button>
              ))}
            </div>
            <button className="ghost" onClick={locate}>
              {t(UI.whereAmI)}
            </button>
            <button
              className="ghost method-btn"
              onClick={() => setMethodOpen(true)}
              aria-label={t(UI.methodTitle)}
              title={t(UI.methodTitle)}
            >
              ?
            </button>
          </div>
        </div>
      </header>

      <p className="phase-mood">{lang === 'zh' ? PHASE_LINE_ZH[phase.id] ?? phase.line : phase.line}</p>

      <main className="stage">
        {mobile ? (
          <BottomSheet
            snap={sheet}
            onSnap={setSheet}
            peek={
              <>
                {railTabs}
                {panel === 'compass' && (
                  <>
                    <ScenarioChips
                      activeId={scenarioId}
                      modified={modified}
                      phaseId={phase.id}
                      onPick={pickScenario}
                      showTitle={false}
                    />
                    <ResultsStrip
                      ranked={shownRanked}
                      compassOn={compassOn}
                      nearMode={Boolean(anchor)}
                      hour={hour}
                      selectedId={selectedId}
                      onSelect={selectCafe}
                      visited={visitedSet}
                      says={says}
                      want={axes}
                      blended={blended}
                      explainFor={explainFor}
                      onSharePicks={sharePicks}
                      embedded
                    />
                  </>
                )}
              </>
            }
          >
            {panel === 'compass' && character && (
              <div className="character-flag">
                {t(UI.compassSetFor)} <strong>{character}</strong>
              </div>
            )}
            {geoNote && <div className="geo-note">{t(geoNote)}</div>}
            {panel === 'compass' && (
              <Compass
                {...compassProps}
                reveal={sheet === 'full' ? 'full' : 'half'}
                showScenarios={false}
              />
            )}
            {panel === 'compass' && sheet === 'full' && nearPanel}
            {panel === 'crawls' && crawlPanel}
            {panel === 'passport' && passportPanel}
          </BottomSheet>
        ) : (
        <aside className="rail">
          {railTabs}

          {character && panel === 'compass' && (
            <div className="character-flag">
              {t(UI.compassSetFor)} <strong>{character}</strong>
            </div>
          )}
          {geoNote && <div className="geo-note">{t(geoNote)}</div>}

          {panel === 'compass' && nearPanel}
          {panel === 'compass' && <Compass {...compassProps} />}
          {panel === 'crawls' && crawlPanel}
          {panel === 'passport' && passportPanel}
        </aside>
        )}

        {!mobile && (
        <button
          className="rail-handle"
          onClick={() => setRailOpen((v) => !v)}
          aria-label={t(UI.tabCompass)}
        >
          {railOpen ? '‹' : '›'}
        </button>
        )}

        <div className={`map-wrap${view === 'list' ? ' in-list' : ''}`}>
          <AtlasMap
            handleRef={mapRef}
            cafes={CAFES}
            scores={scores}
            compassOn={compassOn}
            selectedId={selectedId}
            onSelect={selectCafe}
            visited={visitedSet}
            saved={savedSet}
            crawl={crawl}
            crawlCafes={crawlCafes}
            me={me}
            anchor={anchor}
            pinArm={pinArm}
            onDropPin={(lng, lat) => setAnchorAndFly({ kind: 'pin', lng, lat })}
          />

          <div className="map-tools">
            <button onClick={() => mapRef.current?.zoomBy(1.45)} aria-label={t(UI.zoomIn)}>
              +
            </button>
            <button onClick={() => mapRef.current?.zoomBy(1 / 1.45)} aria-label={t(UI.zoomOut)}>
              −
            </button>
            <button onClick={() => mapRef.current?.reset()} aria-label={t(UI.wholeSheet)}>
              ⤢
            </button>
          </div>

          <div className="view-toggle">
            <button className={view === 'map' ? 'on' : ''} onClick={() => setView('map')}>
              {t(UI.viewMap)}
            </button>
            <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>
              {t(UI.viewList)}
            </button>
          </div>

          <div className="attribution">{t(UI.attribution)}</div>

          {view === 'list' && (
            <ListView
              ranked={shownRanked}
              compassOn={compassOn}
              nearMode={Boolean(anchor)}
              hour={hour}
              selectedId={selectedId}
              onSelect={selectCafe}
              visited={visitedSet}
              says={says}
              want={axes}
              blended={blended}
              explainFor={explainFor}
            />
          )}

          {selected && (
            <CafeCard
              cafe={selected}
              score={scores.get(selected.id) ?? null}
              want={axes}
              compassOn={compassOn}
              hour={hour}
              weekday={weekday}
              why={compassOn ? explainFor(selected, distanceMinutes ?? undefined) : null}
              visited={visitedSet.has(selected.id)}
              saved={savedSet.has(selected.id)}
              distanceMinutes={distanceMinutes}
              distanceFrom={
                anchor && anchor.kind !== 'me'
                  ? anchor.kind === 'metro'
                    ? `${t(UI.fromStation)} ${lang === 'zh' ? anchor.station.nameZh : anchor.station.name}`
                    : t(UI.fromYourPin)
                  : t(UI.fromYou)
              }
              onClose={() => selectCafe(null)}
              onStamp={() =>
                visitedSet.has(selected.id)
                  ? passport.unstamp(selected.id)
                  : passport.stamp(selected.id)
              }
              onSave={() => passport.toggleSaved(selected.id)}
              onTaxi={() => setTaxiFor(selected)}
              onMoreLikeThis={() => {
                setAxesNow(selected.axes)
                setScenarioId(null)
                setCompassOn(true)
                setCharacter(
                  lang === 'zh'
                    ? `${t(UI.roomsLike)}${selected.nameZh}`
                    : `${t(UI.roomsLike)} ${selected.name}`,
                )
                setPanel('compass')
              }}
              onShareCard={() => setShareFor({ cafe: selected, kind: 'cafe' })}
              shared={copied === 'cafe'}
              onShare={() =>
                copy(
                  `${selected.name} ${selected.nameZh} — ${selected.street}, ${selected.district}.${selected.source === 'imported' ? '' : ` ${selected.signature}.`} ${location.href}`,
                  'cafe',
                )
              }
            />
          )}

          {view === 'map' && !mobile && (
            <ResultsStrip
              ranked={shownRanked}
              compassOn={compassOn}
              nearMode={Boolean(anchor)}
              hour={hour}
              selectedId={selectedId}
              onSelect={selectCafe}
              visited={visitedSet}
              says={says}
              want={axes}
              blended={blended}
              explainFor={explainFor}
              onSharePicks={sharePicks}
            />
          )}
        </div>
      </main>

      {onboard && (
        <Onboarding
          onDone={() => setOnboard(false)}
          onScenario={(s) => {
            pickScenario(s)
            if (mobile) setSheet('half')
          }}
          phaseId={phase.id}
        />
      )}

      {quizOpen && (
        <QuizModal
          onClose={() => setQuizOpen(false)}
          onApply={(a, name) => {
            setAxesNow(a)
            setScenarioId(null)
            setCompassOn(true)
            setCharacter(name)
          }}
        />
      )}
      {methodOpen && <Methodology onClose={() => setMethodOpen(false)} />}
      {taxiFor && (
        <TaxiCard
          cafe={taxiFor}
          onClose={() => setTaxiFor(null)}
          onSaveImage={() => {
            setShareFor({ cafe: taxiFor, kind: 'taxi' })
            setTaxiFor(null)
          }}
        />
      )}
      {shareFor && (
        <ShareCardModal
          cafe={shareFor.cafe}
          kind={shareFor.kind}
          picks={shareFor.picks}
          score={scores.get(shareFor.cafe.id) ?? null}
          onClose={() => setShareFor(null)}
        />
      )}
    </div>
    </I18nContext.Provider>
  )
}

