/**
 * The atlas is painted for a time of day. Shanghai coffee is not one thing at
 * 07:30 and another at 21:00 by accident — the city genuinely changes shift —
 * so the paper, the ink and the light change with it.
 */

export type PhaseId = 'dawn' | 'morning' | 'afternoon' | 'dusk' | 'night'

export interface Phase {
  id: PhaseId
  label: string
  labelZh: string
  /** Inclusive start hour, local Shanghai time. */
  from: number
  to: number
  line: string
  paper: string
  paperEdge: string
  ink: string
  inkSoft: string
  water: string
  waterEdge: string
  park: string
  road: string
  lane: string
  glow: string
  accent: string
}

export const PHASES: Phase[] = [
  {
    id: 'dawn',
    label: 'First light',
    labelZh: '破晓',
    from: 5,
    to: 8,
    line: 'The bakers and the standing bars. Nobody is talking yet.',
    paper: '#f6ece0',
    paperEdge: '#e8d7c4',
    ink: '#4a3b32',
    inkSoft: '#8a7466',
    water: '#cdd8de',
    waterEdge: '#a8bcc6',
    park: '#d6dfc4',
    road: '#d9c8b6',
    lane: '#b79c85',
    glow: '#f4c07a',
    accent: '#c2643c',
  },
  {
    id: 'morning',
    label: 'Morning',
    labelZh: '上午',
    from: 8,
    to: 12,
    line: 'Peak espresso. Queues on Wukang Rd, laptops claiming tables.',
    paper: '#faf3e6',
    paperEdge: '#eadfc9',
    ink: '#3f342c',
    inkSoft: '#8b7a68',
    water: '#c6d6dd',
    waterEdge: '#9fb8c3',
    park: '#cddcb6',
    road: '#dfd0bb',
    lane: '#b09a80',
    glow: '#ffd79a',
    accent: '#b8542f',
  },
  {
    id: 'afternoon',
    label: 'Afternoon',
    labelZh: '午后',
    from: 12,
    to: 17,
    line: 'Plane-tree shade, second cups, the long working stretch.',
    paper: '#f7efe1',
    paperEdge: '#e6d8c0',
    ink: '#3b322b',
    inkSoft: '#87766a',
    water: '#bed2da',
    waterEdge: '#96b2bf',
    park: '#c4d6a9',
    road: '#dccdb6',
    lane: '#a98f76',
    glow: '#f6cd8c',
    accent: '#a8492b',
  },
  {
    id: 'dusk',
    label: 'Golden hour',
    labelZh: '黄昏',
    from: 17,
    to: 20,
    line: 'The handover. Espresso machines off, negroni carts out.',
    paper: '#f2e0cd',
    paperEdge: '#dcc2a6',
    ink: '#3a2b26',
    inkSoft: '#8a6b5b',
    water: '#c3bcc6',
    waterEdge: '#9d92a4',
    park: '#c3cba4',
    road: '#dcc4a8',
    lane: '#a5826a',
    glow: '#f2a35f',
    accent: '#9c3f2c',
  },
  {
    id: 'night',
    label: 'After dark',
    labelZh: '夜里',
    from: 20,
    to: 5,
    line: 'Almost everything is shut. The few that are not, are worth the trip.',
    paper: '#221e26',
    paperEdge: '#171419',
    ink: '#e8dccd',
    inkSoft: '#9c8f83',
    water: '#2b3440',
    waterEdge: '#3d4b59',
    park: '#2c3629',
    road: '#3a3239',
    lane: '#584a4c',
    glow: '#ffb545',
    accent: '#ffb545',
  },
]

export function phaseForHour(hour: number): Phase {
  for (const p of PHASES) {
    if (p.from < p.to) {
      if (hour >= p.from && hour < p.to) return p
    } else if (hour >= p.from || hour < p.to) {
      return p
    }
  }
  return PHASES[1]
}

/** Current decimal hour in Shanghai (UTC+8), wherever the reader happens to be. */
export function shanghaiHour(now = new Date()): number {
  const utc = now.getTime() + now.getTimezoneOffset() * 60000
  const sh = new Date(utc + 8 * 3600000)
  return sh.getHours() + sh.getMinutes() / 60
}

export function formatHour(hour: number): string {
  const h = Math.floor(hour) % 24
  const m = Math.round((hour - Math.floor(hour)) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
