import type { Cafe, Crawl } from '../data/types'
import { CRAWLS } from '../data/crawls'
import { haversine, walkingMinutes } from '../lib/projection'
import { formatHour } from '../lib/palette'
import { UI } from '../data/labels'
import { useI18n } from '../lib/i18n'

interface Props {
  cafesById: Map<string, Cafe>
  activeId: string | null
  onActivate: (id: string | null) => void
  onSelectCafe: (id: string) => void
  visited: Set<string>
}

function totals(crawl: Crawl, byId: Map<string, Cafe>) {
  const stops = crawl.stops.map((s) => byId.get(s.cafeId)).filter((c): c is Cafe => Boolean(c))
  let metres = 0
  for (let i = 1; i < stops.length; i++) {
    metres += haversine(stops[i - 1].lng, stops[i - 1].lat, stops[i].lng, stops[i].lat)
  }
  const walk = walkingMinutes(metres)
  // twenty minutes a stop is the honest average once you have queued and sat down
  const total = walk + stops.length * 20
  return { stops, walk, total }
}

export function CrawlList({ cafesById, activeId, onActivate, onSelectCafe, visited }: Props) {
  const { mode, t } = useI18n()
  const zh = mode === 'zh'
  return (
    <div className="panel-body">
      <p className="section-note">{t(UI.crawlsNote)}</p>

      {CRAWLS.map((crawl) => {
        const { stops, walk, total } = totals(crawl, cafesById)
        const active = activeId === crawl.id
        const done = stops.filter((s) => visited.has(s.id)).length
        return (
          <div key={crawl.id} className={`crawl${active ? ' on' : ''}`}>
            <button className="crawl-head" onClick={() => onActivate(active ? null : crawl.id)}>
              <span className="crawl-name">
                {zh ? crawl.nameZh : crawl.name}
                {mode === 'both' && <span className="zh"> {crawl.nameZh}</span>}
              </span>
              <span className="crawl-sub">{crawl.subtitle}</span>
              <span className="crawl-meta">
                {zh
                  ? `${stops.length} 站 · 步行 ${walk} 分钟 · 约 ${Math.round((total / 60) * 10) / 10} 小时`
                  : `${stops.length} stops · ${walk} min walking · about ${Math.round((total / 60) * 10) / 10} h`}
                {' · '}
                {t(UI.startWord)} {formatHour(crawl.startHour)}
                {done > 0 && ` · ${done}/${stops.length} ${t(UI.stampedWord)}`}
              </span>
            </button>
            {active && (
              <div className="crawl-body">
                <p className="crawl-blurb">{crawl.blurb}</p>
                <ol className="crawl-stops">
                  {crawl.stops.map((s, i) => {
                    const cafe = cafesById.get(s.cafeId)
                    if (!cafe) return null
                    return (
                      <li key={s.cafeId} className={visited.has(cafe.id) ? 'stamped' : ''}>
                        <button onClick={() => onSelectCafe(cafe.id)}>
                          <span className="cs-n">{i + 1}</span>
                          <span className="cs-main">
                            <span className="cs-name">
                              {zh ? cafe.nameZh : cafe.name}
                              {mode === 'both' && <span className="zh"> {cafe.nameZh}</span>}
                            </span>
                            <span className="cs-order">{s.order}</span>
                            <span className="cs-where">{cafe.street}</span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ol>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
