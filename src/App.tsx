import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { CAFES } from './data/cafes'
import type { Axes, Cafe } from './data/types'
import { AtlasMap, type AtlasHandle } from './components/AtlasMap'
import { Compass, ScenarioChips } from './components/Compass'
import { BottomSheet, type Snap } from './components/BottomSheet'
import { CafeCard } from './components/CafeCard'
import { PassportPanel } from './components/PassportPanel'
import { Methodology } from './components/Methodology'
import { LocationPanel, type GeoStatus } from './components/LocationPanel'
import { ResultsStrip } from './components/ResultsStrip'
import { SearchBox } from './components/SearchBox'
import { ListView } from './components/ListView'
import { TaxiCard } from './components/TaxiCard'
import { ShareCardModal, type PicksShare, type ShareKind } from './components/ShareCard'
import {
  EMPTY_FILTERS,
  EVEN_WEIGHTS,
  NEUTRAL,
  blendAllMemo,
  isOpenAt,
  rank,
  type Filters,
  type Ranked,
} from './lib/match'
import {
  anchorFromHash,
  anchorLabel,
  anchorPoint,
  anchorToHash,
  minutesToClose,
  rankNear,
  type Anchor,
} from './lib/near'
import { formatHour, phaseForHour, shanghaiHour } from './lib/palette'
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
import { UI } from './data/labels'

type Panel = 'compass' | 'passport'
type View = 'map' | 'list'
type Lang = LangMode

const byId = new Map(CAFES.map((c) => [c.id, c]))
/** A café shutting sooner than this is not a recommendation, even if open. */
const MIN_MINUTES_LEFT = 30

interface HashState {
  cafe?: string
  axes?: Axes
  scenario?: string
  method?: boolean
  anchor?: Anchor
  lang?: Lang
  view?: View
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
  if (h.get('view') === 'list') out.view = 'list'
  const cafe = h.get('cafe')
  if (cafe && byId.has(cafe)) out.cafe = cafe
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
  const [panel, setPanel] = useState<Panel>('compass')
  const [selectedId, setSelectedId] = useState<string | null>(initial.cafe ?? null)
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
  const [geo, setGeo] = useState<GeoStatus>('idle')
  const [railOpen, setRailOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth > 900,
  )
  const [view, setView] = useState<View>(initial.view ?? 'map')

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
  // The time bar is a real clock: only cafés open at that hour (weekly hours
  // where known) and not about to shut are ranked; the rest stay on the map,
  // dimmed.
  const ranked = useMemo(
    () =>
      rank(CAFES, axes, filters, weights, cafeVotes, (c) => {
        const left = minutesToClose(c, hour, weekday)
        return (
          left !== null &&
          left >= MIN_MINUTES_LEFT &&
          passesScenarioFilter(c, scenario?.filter, left)
        )
      }),
    [axes, filters, weights, cafeVotes, scenario, hour, weekday],
  )
  const closedIds = useMemo(() => {
    const out = new Set<string>()
    for (const c of CAFES) if (!isOpenAt(c, hour, weekday)) out.add(c.id)
    return out
  }, [hour, weekday])
  const openCount = CAFES.length - closedIds.size
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
        results: shownRanked,
      }),
    [compassOn, scenario, anchor, hour, shownRanked],
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
    },
    [],
  )

  const topIds = useMemo(
    () => (compassOn ? shownRanked.slice(0, 3).map((r) => r.cafe.id) : []),
    [compassOn, shownRanked],
  )
  // Re-inking ~1000 pins is the slow half of a slider tick; let the strip and
  // the slider render first and the map catch up when input pauses.
  const mapScores = useDeferredValue(scores)
  const mapTopIds = useDeferredValue(topIds)

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
  const visitedSet = useMemo(
    () => new Set(passport.state.stamps.map((s) => s.cafeId)),
    [passport.state.stamps],
  )
  const savedSet = useMemo(() => new Set(passport.state.saved), [passport.state.saved])

  useEffect(() => {
    const parts: string[] = []
    if (selectedId) parts.push(`cafe=${selectedId}`)
    if (compassOn) {
      parts.push(`a=${axes.focus}-${axes.energy}-${axes.linger}-${axes.adventure}-${axes.spend}`)
    }
    if (scenarioId) parts.push(`s=${scenarioId}`)
    if (methodOpen) parts.push('method')
    // Your own position is re-read on load, not carried in the link as a pin.
    if (anchor && anchor.kind !== 'me') parts.push(`at=${anchorToHash(anchor)}`)
    if (lang !== 'both') parts.push(`lang=${lang}`)
    if (view === 'list') parts.push('view=list')
    const next = parts.length ? `#/${parts.join('&')}` : '#/'
    if (location.hash !== next) history.replaceState(null, '', next)
  }, [selectedId, compassOn, axes, scenarioId, methodOpen, anchor, lang, view])

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

  useEffect(() => {
    const cafe = initial.cafe ? byId.get(initial.cafe) : null
    if (cafe) mapRef.current?.focusOn(cafe.lng, cafe.lat, 3.6)
  }, [initial])

  useEffect(() => {
    const onHash = () => {
      const h = readHash()
      setSelectedId(h.cafe ?? null)
      setMethodOpen(Boolean(h.method))
      setAnchor(h.anchor ?? null)
      if (h.lang) setLangState(h.lang)
      setView(h.view ?? 'map')
      setScenarioId(h.scenario ?? null)
      if (h.axes) {
        setAxesNow(h.axes)
        setCompassOn(true)
      }
      const cafe = h.cafe ? byId.get(h.cafe) : null
      if (cafe) mapRef.current?.focusOn(cafe.lng, cafe.lat, 3.6)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

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

  /** `quiet` is the silent attempt on load: a miss leaves the panel untouched. */
  const locate = useCallback((quiet = false) => {
    if (!navigator.geolocation) {
      if (quiet) return
      setGeo('failed')
      setGeoNote(UI.geoNoShare)
      return
    }
    setGeo('looking')
    setGeoNote(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { longitude: lng, latitude: lat } = pos.coords
        if (lat < BBOX.south || lat > BBOX.north || lng < BBOX.west || lng > BBOX.east) {
          setMe(null)
          setGeo(quiet ? 'idle' : 'failed')
          setGeoNote(quiet ? null : UI.geoOutside)
          return
        }
        setMe({ lng, lat })
        setAnchor({ kind: 'me', lng, lat })
        setPinArm(false)
        setGeo('on')
        mapRef.current?.focusOn(lng, lat, 3.6)
        // On a phone the sheet steps down so the fly-to and the marker are seen.
        if (window.innerWidth <= 900) setSheet((s) => (s === 'hidden' ? s : 'peek'))
      },
      () => {
        setGeo(quiet ? 'idle' : 'failed')
        setGeoNote(quiet ? null : UI.geoRefused)
      },
      { timeout: 8000, maximumAge: 60_000 },
    )
  }, [])

  // Location is the default starting point: if the browser already allows it,
  // use it without asking again (a shared link with its own anchor wins).
  useEffect(() => {
    if (initial.anchor || !navigator.permissions?.query) return
    let live = true
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((p) => {
        if (live && p.state === 'granted') locate(true)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [initial.anchor, locate])

  const setAnchorAndFly = useCallback((a: Anchor | null) => {
    setAnchor(a)
    setPinArm(false)
    if (a) {
      const p = anchorPoint(a)
      mapRef.current?.focusOn(p.lng, p.lat, 3.6)
      if (window.innerWidth <= 900) setSheet((s) => (s === 'hidden' ? s : 'peek'))
    }
  }, [])

  const armPin = useCallback((v: boolean) => {
    setPinArm(v)
    if (v && window.innerWidth <= 900) setSheet('peek')
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
      <button className={panel === 'passport' ? 'on' : ''} onClick={() => setPanel('passport')}>
        {t(UI.tabPassport)}
      </button>
    </nav>
  )

  const locationPanel = (
    <LocationPanel
      anchor={anchor}
      geo={geo}
      geoNote={geoNote}
      onLocate={() => locate()}
      onAnchor={setAnchorAndFly}
      pinArm={pinArm}
      onPinArm={armPin}
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
    phaseId: phase.id,
    scenarioId,
    scenarioModified: modified,
    onScenario: pickScenario,
    onReset: () => {
      setAxesNow(NEUTRAL)
      setScenarioId(null)
      setCompassOn(false)
      setCharacter(null)
      setFilters(EMPTY_FILTERS)
      setSelectedId(null)
      setAnchor(null)
      setPinArm(false)
      mapRef.current?.reset()
    },
    resultCount: ranked.length,
  }

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
            <span className="phase-clock">{formatHour(hour)}</span>
            {hourOverride === null ? (
              <span className="phase-live">{t(UI.shanghaiNow)}</span>
            ) : (
              <button className="link phase-now" onClick={() => setHourOverride(null)}>
                {t(UI.now)}
              </button>
            )}
            <span className="phase-open">
              {openCount} {t(UI.openCount)}
            </span>
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
        </div>

        <div className="top-right">
          <SearchBox cafes={CAFES} onPick={selectCafe} />
          <button
            className="ghost lang-btn"
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
            aria-label="Language / 语言"
            title={lang === 'zh' ? 'Switch to English' : '切换到中文'}
          >
            {lang === 'zh' ? 'EN' : '中'}
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
      </header>

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
                    {locationPanel}
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
                      weekday={weekday}
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
            {panel === 'compass' && (
              <Compass
                {...compassProps}
                reveal={sheet === 'full' ? 'full' : 'half'}
                showScenarios={false}
              />
            )}
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
          {panel === 'compass' && locationPanel}
          {panel === 'compass' && <Compass {...compassProps} />}
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
            scores={mapScores}
            closed={closedIds}
            compassOn={compassOn}
            topIds={mapTopIds}
            selectedId={selectedId}
            onSelect={selectCafe}
            visited={visitedSet}
            saved={savedSet}
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
              weekday={weekday}
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
              onShareCard={() => setShareFor({ cafe: selected, kind: 'cafe' })}
            />
          )}

          {view === 'map' && !mobile && (
            <ResultsStrip
              ranked={shownRanked}
              compassOn={compassOn}
              nearMode={Boolean(anchor)}
              hour={hour}
              weekday={weekday}
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

