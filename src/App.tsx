import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { CAFES } from './data/cafes'
import { CRAWLS } from './data/crawls'
import type { Axes, Cafe } from './data/types'
import { AtlasMap, type AtlasHandle } from './components/AtlasMap'
import { Compass } from './components/Compass'
import { CafeCard } from './components/CafeCard'
import { CrawlList } from './components/CrawlList'
import { PassportPanel } from './components/PassportPanel'
import { Methodology } from './components/Methodology'
import { NearMePanel } from './components/NearMePanel'
import { QuizModal } from './components/QuizModal'
import { ResultsStrip } from './components/ResultsStrip'
import { TaxiCard } from './components/TaxiCard'
import { ShareCardModal, type ShareKind } from './components/ShareCard'
import { EMPTY_FILTERS, NEUTRAL, rank, type Filters } from './lib/match'
import { anchorFromHash, anchorPoint, anchorToHash, rankNear, type Anchor } from './lib/near'
import { PHASES, formatHour, phaseForHour, shanghaiHour } from './lib/palette'
import { usePassport } from './lib/passport'
import { BBOX, haversine, walkingMinutes } from './lib/projection'

type Panel = 'compass' | 'crawls' | 'passport'
type Lang = 'both' | 'en' | 'zh'

const byId = new Map(CAFES.map((c) => [c.id, c]))

function readHash(): { cafe?: string; axes?: Axes; crawl?: string; method?: boolean; anchor?: Anchor } {
  if (typeof location === 'undefined') return {}
  const h = new URLSearchParams(location.hash.replace(/^#\/?/, ''))
  const out: { cafe?: string; axes?: Axes; crawl?: string; method?: boolean; anchor?: Anchor } = {}
  if (h.has('method')) out.method = true
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
  return out
}

export default function App() {
  const initial = useMemo(() => readHash(), [])

  const [axes, setAxes] = useState<Axes>(initial.axes ?? NEUTRAL)
  const [compassOn, setCompassOn] = useState(Boolean(initial.axes))
  const [character, setCharacter] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [panel, setPanel] = useState<Panel>(initial.crawl ? 'crawls' : 'compass')
  const [selectedId, setSelectedId] = useState<string | null>(initial.cafe ?? null)
  const [crawlId, setCrawlId] = useState<string | null>(initial.crawl ?? null)
  const [quizOpen, setQuizOpen] = useState(false)
  const [methodOpen, setMethodOpen] = useState(Boolean(initial.method))
  const [taxiFor, setTaxiFor] = useState<Cafe | null>(null)
  const [shareFor, setShareFor] = useState<{ cafe: Cafe; kind: ShareKind } | null>(null)
  const [hourOverride, setHourOverride] = useState<number | null>(null)
  const [lang, setLang] = useState<Lang>('both')
  const [copied, setCopied] = useState<string | null>(null)
  const [me, setMe] = useState<{ lng: number; lat: number } | null>(null)
  const [geoNote, setGeoNote] = useState<string | null>(null)
  const [railOpen, setRailOpen] = useState(true)
  const [anchor, setAnchor] = useState<Anchor | null>(initial.anchor ?? null)
  const [pinArm, setPinArm] = useState(false)

  const mapRef = useRef<AtlasHandle | null>(null)
  const passport = usePassport()

  const nowHour = useMemo(() => shanghaiHour(), [])
  const hour = hourOverride ?? nowHour
  const phase = phaseForHour(hour)

  const ranked = useMemo(() => rank(CAFES, axes, filters), [axes, filters])
  const nearRanked = useMemo(
    () => (anchor ? rankNear(ranked, anchor) : null),
    [ranked, anchor],
  )
  const scores = useMemo(
    () => new Map(ranked.map((r) => [r.cafe.id, r.score])),
    [ranked],
  )
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
    if (methodOpen) parts.push('method')
    if (anchor) parts.push(`at=${anchorToHash(anchor)}`)
    const next = parts.length ? `#/${parts.join('&')}` : '#/'
    if (location.hash !== next) history.replaceState(null, '', next)
  }, [selectedId, crawlId, compassOn, axes, methodOpen, anchor])

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
      if (h.axes) {
        setAxes(h.axes)
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
      }
    },
    [flyTo],
  )

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
      setGeoNote('This browser will not share a location.')
      return
    }
    setGeoNote('Looking…')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { longitude: lng, latitude: lat } = pos.coords
        if (lat < BBOX.south || lat > BBOX.north || lng < BBOX.west || lng > BBOX.east) {
          setMe(null)
          setGeoNote('You are outside the sheet. The atlas only covers central Shanghai.')
          return
        }
        setMe({ lng, lat })
        setAnchor({ kind: 'me', lng, lat })
        setGeoNote(null)
        mapRef.current?.focusOn(lng, lat, 3.2)
      },
      () => setGeoNote('Location refused — no problem, the atlas works without it.'),
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

  return (
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
            {hourOverride === null && <span className="phase-live">Shanghai, now</span>}
          </div>
          <input
            type="range"
            min={0}
            max={23.75}
            step={0.25}
            value={hour}
            aria-label="Hour of the day"
            onChange={(e) => setHourOverride(Number(e.target.value))}
          />
          <div className="phase-jumps">
            {PHASES.map((p) => (
              <button
                key={p.id}
                className={p.id === phase.id ? 'on' : ''}
                onClick={() => setHourOverride(p.id === 'night' ? 21 : (p.from + p.to) / 2)}
              >
                {p.label}
              </button>
            ))}
            <button onClick={() => setHourOverride(null)}>Now</button>
          </div>
        </div>

        <div className="top-right">
          <div className="lang-toggle">
            {(['both', 'en', 'zh'] as Lang[]).map((l) => (
              <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>
                {l === 'both' ? 'EN / 中' : l === 'en' ? 'EN' : '中文'}
              </button>
            ))}
          </div>
          <button className="ghost" onClick={locate}>
            Where am I?
          </button>
          <button
            className="ghost method-btn"
            onClick={() => setMethodOpen(true)}
            aria-label="Methodology 方法说明"
            title="How the compass is drawn · 方法说明"
          >
            ?
          </button>
        </div>
      </header>

      <p className="phase-mood">{phase.line}</p>

      <main className="stage">
        <aside className="rail">
          <nav className="rail-tabs">
            <button className={panel === 'compass' ? 'on' : ''} onClick={() => setPanel('compass')}>
              Compass
            </button>
            <button className={panel === 'crawls' ? 'on' : ''} onClick={() => setPanel('crawls')}>
              Crawls
            </button>
            <button className={panel === 'passport' ? 'on' : ''} onClick={() => setPanel('passport')}>
              Passport
            </button>
          </nav>

          {character && panel === 'compass' && (
            <div className="character-flag">
              Compass set for <strong>{character}</strong>
            </div>
          )}
          {geoNote && <div className="geo-note">{geoNote}</div>}

          {panel === 'compass' && (
            <NearMePanel
              anchor={anchor}
              onAnchor={setAnchorAndFly}
              onLocate={locate}
              pinArm={pinArm}
              onPinArm={setPinArm}
              openNow={filters.openAt !== null}
              onOpenNow={() =>
                setFilters({ ...filters, openAt: filters.openAt === null ? hour : null })
              }
              hour={hour}
            />
          )}
          {panel === 'compass' && (
            <Compass
              axes={axes}
              onAxes={(a) => {
                setAxes(a)
                setCompassOn(true)
              }}
              filters={filters}
              onFilters={setFilters}
              hour={hour}
              onQuiz={() => setQuizOpen(true)}
              onReset={() => {
                setAxes(NEUTRAL)
                setCompassOn(false)
                setCharacter(null)
                setFilters(EMPTY_FILTERS)
                setCrawlId(null)
                setSelectedId(null)
                setAnchor(null)
                setPinArm(false)
                mapRef.current?.reset()
              }}
              resultCount={ranked.length}
            />
          )}
          {panel === 'crawls' && (
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
                  route.stops
                    .map((s) => byId.get(s.cafeId))
                    .filter((c): c is Cafe => Boolean(c)),
                )
              }}
              onSelectCafe={selectCafe}
              visited={visitedSet}
            />
          )}
          {panel === 'passport' && (
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
          )}
        </aside>

        <button className="rail-handle" onClick={() => setRailOpen((v) => !v)}>
          {railOpen ? '‹' : '›'}
        </button>

        <div className="map-wrap">
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
            <button onClick={() => mapRef.current?.zoomBy(1.45)} aria-label="Zoom in">
              +
            </button>
            <button onClick={() => mapRef.current?.zoomBy(1 / 1.45)} aria-label="Zoom out">
              −
            </button>
            <button onClick={() => mapRef.current?.reset()} aria-label="Whole sheet">
              ⤢
            </button>
          </div>

          <div className="attribution">
            Hand-inked from OpenStreetMap geometry (ODbL). Rooms, ratings and opinions are
            the Atlas’s own.
          </div>

          {selected && (
            <CafeCard
              cafe={selected}
              score={scores.get(selected.id) ?? null}
              want={axes}
              compassOn={compassOn}
              hour={hour}
              visited={visitedSet.has(selected.id)}
              saved={savedSet.has(selected.id)}
              distanceMinutes={distanceMinutes}
              distanceFrom={
                anchor && anchor.kind !== 'me'
                  ? anchor.kind === 'metro'
                    ? `From ${anchor.station.name}`
                    : 'From your pin'
                  : 'From you'
              }
              onClose={() => setSelectedId(null)}
              onStamp={() =>
                visitedSet.has(selected.id)
                  ? passport.unstamp(selected.id)
                  : passport.stamp(selected.id)
              }
              onSave={() => passport.toggleSaved(selected.id)}
              onTaxi={() => setTaxiFor(selected)}
              onMoreLikeThis={() => {
                setAxes(selected.axes)
                setCompassOn(true)
                setCharacter(`rooms like ${selected.name}`)
                setPanel('compass')
              }}
              onShareCard={() => setShareFor({ cafe: selected, kind: 'cafe' })}
              shared={copied === 'cafe'}
              onShare={() =>
                copy(
                  `${selected.name} ${selected.nameZh} — ${selected.street}, ${selected.district}. ${selected.signature}. ${location.href}`,
                  'cafe',
                )
              }
            />
          )}

          <ResultsStrip
            ranked={nearRanked ?? ranked}
            compassOn={compassOn}
            nearMode={Boolean(anchor)}
            hour={hour}
            selectedId={selectedId}
            onSelect={selectCafe}
            visited={visitedSet}
          />
        </div>
      </main>

      {quizOpen && (
        <QuizModal
          onClose={() => setQuizOpen(false)}
          onApply={(a, name) => {
            setAxes(a)
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
          score={scores.get(shareFor.cafe.id) ?? null}
          onClose={() => setShareFor(null)}
        />
      )}
    </div>
  )
}
