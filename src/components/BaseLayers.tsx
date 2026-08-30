import { memo } from 'react'
import basemap from '../data/basemap.json'
import { PAPER_HEIGHT, PAPER_WIDTH, project } from '../lib/projection'
import { jitter, randomAt, sketch, wash, type Pt } from '../lib/hand'

interface RawShape {
  name?: string
  nameZh?: string
  points?: [number, number][]
  segments?: [number, number][][]
  cls?: string
}

const toPaper = (pts: [number, number][]): Pt[] =>
  pts.map(([lng, lat]) => project(lng, lat))

function area(points: Pt[]): number {
  let a = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a) / 2
}

function centroid(points: Pt[]): Pt {
  let x = 0
  let y = 0
  for (const p of points) {
    x += p[0]
    y += p[1]
  }
  return [x / points.length, y / points.length]
}

/**
 * Everything below is computed exactly once, at module load, and rendered into
 * a memoised layer. Colour comes from CSS custom properties so that repainting
 * the atlas for a different hour of the day costs one style change rather than
 * three thousand React updates.
 */

const waterAreas = (basemap.water.areas as RawShape[])
  .map((w) => toPaper(w.points!))
  .filter((p) => p.length > 3)

const parks = (basemap.parks as RawShape[])
  .map((p) => ({
    name: p.name ?? '',
    nameZh: p.nameZh ?? '',
    pts: toPaper(p.points!),
  }))
  .filter((p) => p.pts.length > 3)
  .map((p) => ({ ...p, a: area(p.pts) }))

const roads = (basemap.roads as RawShape[]).map((r) => ({
  cls: r.cls!,
  pts: toPaper(r.points!),
}))

const lanes = (basemap.lanes as RawShape[]).map((l) => ({
  name: l.name ?? '',
  nameZh: l.nameZh ?? '',
  segs: (l.segments ?? []).map(toPaper),
}))

const districts = (basemap.districts as RawShape[]).map((d) => ({
  name: d.name ?? '',
  nameZh: d.nameZh ?? '',
  segs: (d.segments ?? []).map(toPaper),
}))

const waterPaths = waterAreas.map((p) => wash(p, 0))
const waterPaths2 = waterAreas.map((p) => wash(p, 1))
const parkPaths = parks.map((p) => ({
  d: wash(p.pts, 0),
  d2: wash(p.pts, 1),
  label: p.name || p.nameZh,
  at: centroid(p.pts),
  big: p.a > 26000,
}))

const roadPaths = roads.map((r) => ({
  cls: r.cls,
  d: sketch(r.pts, { amplitude: r.cls === 'secondary' ? 1.1 : 1.7, wavelength: 110 }),
}))

const lanePaths = lanes.map((l, i) => {
  const longest = l.segs.slice().sort((a, b) => b.length - a.length)[0] ?? []
  return {
    id: `lane-${i}`,
    name: l.name,
    nameZh: l.nameZh,
    ds: l.segs.map((s) => sketch(s, { amplitude: 1.3, wavelength: 80 })),
    labelD: sketch(longest, { amplitude: 1.3, wavelength: 80 }),
    labelLen: longest.reduce(
      (acc, p, idx) => (idx ? acc + Math.hypot(p[0] - longest[idx - 1][0], p[1] - longest[idx - 1][1]) : 0),
      0,
    ),
  }
})

const districtPaths = districts.map((d) => ({
  name: d.name,
  nameZh: d.nameZh,
  ds: d.segs.map((s) => sketch(s, { amplitude: 2.4, wavelength: 200 })),
  at: centroid(d.segs.flat()),
}))

/** Scattered plane-tree marks over the concession, the way an illustrator would. */
const trees = Array.from({ length: 220 }, (_, i) => {
  const [dx, dy] = jitter(i, 1)
  const x = PAPER_WIDTH * (0.18 + randomAt(i * 2.1) * 0.52) + dx * 30
  const y = PAPER_HEIGHT * (0.32 + randomAt(i * 3.7 + 5) * 0.42) + dy * 30
  const r = 2.4 + randomAt(i * 5.3) * 2.6
  return { x, y, r }
})

function BaseLayersInner() {
  return (
    <g>
      <rect
        x={-PAPER_WIDTH}
        y={-PAPER_HEIGHT}
        width={PAPER_WIDTH * 3}
        height={PAPER_HEIGHT * 3}
        fill="var(--paper)"
      />

      <g filter="url(#grain)">
        <g>
          {waterPaths.map((d, i) => (
            <path key={i} d={d} fill="var(--water)" />
          ))}
          {waterPaths2.map((d, i) => (
            <path key={i} d={d} fill="var(--water)" opacity="0.55" />
          ))}
          {waterAreas.map((p, i) => (
            <path
              key={i}
              d={sketch(p, { amplitude: 2, wavelength: 120, closed: true })}
              fill="none"
              stroke="var(--water-edge)"
              strokeWidth="1.4"
            />
          ))}
        </g>

        <g>
          {parkPaths.map((p, i) => (
            <g key={i}>
              <path d={p.d} fill="var(--park)" opacity="0.85" />
              <path d={p.d2} fill="var(--park)" opacity="0.45" />
            </g>
          ))}
        </g>
      </g>

      <g opacity="0.5">
        {trees.map((t, i) => (
          <g key={i} stroke="var(--park-ink)" strokeWidth="0.7" fill="none">
            <circle cx={t.x} cy={t.y} r={t.r} />
            <path d={`M${t.x - t.r * 0.5} ${t.y + t.r * 0.4} q${t.r * 0.5} ${-t.r} ${t.r} 0`} />
          </g>
        ))}
      </g>

      <g fill="none" strokeLinecap="round">
        {roadPaths
          .filter((r) => r.cls === 'secondary')
          .map((r, i) => (
            <path key={i} d={r.d} stroke="var(--road)" strokeWidth="1.5" opacity="0.75" />
          ))}
        {roadPaths
          .filter((r) => r.cls === 'primary')
          .map((r, i) => (
            <path key={i} d={r.d} stroke="var(--road)" strokeWidth="2.6" />
          ))}
        {roadPaths
          .filter((r) => r.cls === 'trunk')
          .map((r, i) => (
            <path key={i} d={r.d} stroke="var(--road-strong)" strokeWidth="3.6" />
          ))}
      </g>

      <g fill="none" strokeLinecap="round">
        {lanePaths.map((l) =>
          l.ds.map((d, j) => (
            <path key={`${l.id}-${j}`} d={d} stroke="var(--lane)" strokeWidth="2.4" opacity="0.9" />
          )),
        )}
      </g>

      <defs>
        {lanePaths.map((l) => (
          <path key={l.id} id={l.id} d={l.labelD} />
        ))}
      </defs>

      <g className="lane-labels">
        {lanePaths
          .filter((l) => l.labelLen > 120)
          .map((l) => (
            <text key={l.id} dy="-4">
              <textPath href={`#${l.id}`} startOffset="42%" textAnchor="middle">
                {l.name}
              </textPath>
            </text>
          ))}
      </g>

      <g fill="none">
        {districtPaths.map((d) =>
          d.ds.map((seg, j) => (
            <path
              key={`${d.name}-${j}`}
              d={seg}
              stroke="var(--ink-soft)"
              strokeWidth="1.6"
              strokeDasharray="1 9"
              strokeLinecap="round"
              opacity="0.6"
            />
          )),
        )}
      </g>

      <g className="district-labels">
        {districtPaths.map((d) => (
          <g key={d.name}>
            <text x={d.at[0]} y={d.at[1]} textAnchor="middle">
              {d.name.toUpperCase()}
            </text>
            <text x={d.at[0]} y={d.at[1] + 20} textAnchor="middle" className="zh">
              {d.nameZh}
            </text>
          </g>
        ))}
      </g>

      <g className="park-labels">
        {parkPaths
          .filter((p) => p.big && p.label)
          .map((p, i) => (
            <text key={i} x={p.at[0]} y={p.at[1]} textAnchor="middle">
              {p.label}
            </text>
          ))}
      </g>
    </g>
  )
}

export const BaseLayers = memo(BaseLayersInner)
