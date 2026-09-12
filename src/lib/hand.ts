/**
 * Turning honest geometry into a drawing.
 *
 * Every line on the atlas is real OpenStreetMap data, but nothing is drawn
 * straight. `sketch` walks a polyline and nudges each vertex along its normal
 * by a smooth pseudo-random amount, then emits a quadratic path so the result
 * reads as an inked stroke rather than a plotter trace. The noise is seeded by
 * the geometry itself, so a given road always wobbles the same way and the map
 * never shimmers between renders.
 */

export type Pt = [number, number]

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** Smooth 1-D value noise in [-1, 1]. */
function noise(x: number, seed: number): number {
  const i = Math.floor(x)
  const f = x - i
  const a = hash(i + seed * 57.3)
  const b = hash(i + 1 + seed * 57.3)
  const t = f * f * (3 - 2 * f)
  return (a + (b - a) * t) * 2 - 1
}

function seedOf(points: Pt[]): number {
  const [x0, y0] = points[0]
  const [xn, yn] = points[points.length - 1]
  return ((x0 * 3.7 + y0 * 11.3 + xn * 5.1 + yn * 2.9) % 97) + points.length * 0.13
}

export interface SketchOptions {
  /** Peak displacement in paper units. */
  amplitude?: number
  /** Paper units per noise period — larger means longer, lazier waves. */
  wavelength?: number
  /** Extra constant offset, used to draw a second pass of the same line. */
  pass?: number
  /** Close the path back to the start. */
  closed?: boolean
}

function displace(points: Pt[], opts: SketchOptions): Pt[] {
  const amp = opts.amplitude ?? 1.6
  const wave = opts.wavelength ?? 90
  const seed = seedOf(points) + (opts.pass ?? 0) * 13.77
  let run = 0
  const out: Pt[] = []
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i]
    if (i > 0) {
      const [px, py] = points[i - 1]
      run += Math.hypot(x - px, y - py)
    }
    const prev = points[Math.max(0, i - 1)]
    const next = points[Math.min(points.length - 1, i + 1)]
    let tx = next[0] - prev[0]
    let ty = next[1] - prev[1]
    const len = Math.hypot(tx, ty) || 1
    tx /= len
    ty /= len
    const n = noise(run / wave, seed)
    out.push([x - ty * n * amp, y + tx * n * amp])
  }
  return out
}

/** Quadratic-smoothed path data through the given points. */
function smoothPath(points: Pt[], closed: boolean): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`
  let d = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`
  for (let i = 1; i < points.length - 1; i++) {
    const [cx, cy] = points[i]
    const mx = (cx + points[i + 1][0]) / 2
    const my = (cy + points[i + 1][1]) / 2
    d += `Q${cx.toFixed(1)},${cy.toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`
  }
  const last = points[points.length - 1]
  d += `L${last[0].toFixed(1)},${last[1].toFixed(1)}`
  if (closed) d += 'Z'
  return d
}

export function sketch(points: Pt[], opts: SketchOptions = {}): string {
  if (points.length < 2) return ''
  return smoothPath(displace(points, opts), opts.closed ?? false)
}

/**
 * A closed blob that reads as a brush-filled shape: the outline is displaced
 * more generously than a road would be, and slightly differently on each pass
 * so two stacked fills bleed past each other like wet pigment.
 */
export function wash(points: Pt[], pass = 0): string {
  return sketch(points, {
    amplitude: 2.6 + pass * 1.9,
    wavelength: 150,
    pass,
    closed: true,
  })
}

/** Deterministic jitter for scattering decorative marks (trees, hatching). */
export function jitter(index: number, spread: number): [number, number] {
  return [
    (hash(index * 1.7) - 0.5) * spread,
    (hash(index * 3.1 + 9.2) - 0.5) * spread,
  ]
}

export function randomAt(index: number): number {
  return hash(index * 7.13 + 1.7)
}

/**
 * A unit-radius ink blot: a circle whose rim wobbles the way a loaded brush
 * touched down would. Scale it with a transform; the seed picks the wobble.
 */
export function blot(seed: number, sides = 14): string {
  const pts: Pt[] = []
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2
    const r = 1 + (hash(i * 3.3 + seed * 17.1) - 0.5) * 0.28
    pts.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  return smoothPath(pts, true)
}

/** Stroke glyphs on a 4×8 grid, baseline at y=0, ascender at y=-8. */
const NUMERALS: Record<string, Pt[][]> = {
  '0': [[[0.6, -6.5], [2, -8], [3.4, -6.5], [3.6, -2], [2, 0], [0.4, -2], [0.6, -6.5]]],
  '1': [[[0.8, -6.2], [2.2, -8], [2.2, 0]]],
  '2': [[[0.4, -6.6], [1.8, -8], [3.4, -6.4], [3, -4], [0.4, 0], [3.8, 0]]],
  '3': [[[0.4, -7.2], [3.2, -8], [1.8, -4.4], [3.6, -2.4], [2, 0], [0.3, -1]]],
  '4': [[[3, 0], [3, -8], [0.2, -2.6], [3.8, -2.6]]],
  '5': [[[3.6, -8], [0.8, -7.8], [0.6, -4.4], [2.4, -5], [3.6, -3], [2.4, 0], [0.4, -0.6]]],
  '6': [[[3.2, -8], [1, -5.4], [0.6, -2], [2, 0], [3.4, -1.8], [2.4, -4], [0.6, -3]]],
  '7': [[[0.4, -8], [3.8, -8], [1.6, 0]]],
  '8': [[[2, -8], [0.6, -6.2], [3.4, -2.6], [2, 0], [0.4, -2.2], [3.4, -6], [2, -8]]],
  '9': [[[3.4, -5.2], [1.6, -4.2], [0.6, -6.2], [2, -8], [3.4, -6.2], [3.2, -2.2], [1, 0]]],
  '×': [[[0.6, -5.4], [3.4, -1.2]], [[3.4, -5.4], [0.6, -1.2]]],
}
const NUMERAL_ADVANCE = 4.9

/**
 * A short count such as "×12" as a single inked path, centred on x=0 with
 * its baseline at y=0. Numbers on the sheet are drawn, not typeset, so they
 * cost nothing to re-lay out while the map moves under them.
 */
export function numerals(text: string, seed: number): string {
  const glyphs = [...text].filter((c) => c in NUMERALS)
  const width = glyphs.length * NUMERAL_ADVANCE - 0.9
  let d = ''
  glyphs.forEach((c, gi) => {
    const x0 = gi * NUMERAL_ADVANCE - width / 2
    for (const stroke of NUMERALS[c]) {
      const pts: Pt[] = stroke.map(([x, y], i) => [
        x0 + x + (hash(i * 2.9 + gi * 7.3 + seed * 31.7) - 0.5) * 0.5,
        y + (hash(i * 4.1 + gi * 5.9 + seed * 19.3) - 0.5) * 0.5,
      ])
      d += pts.length === 2 ? `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}L${pts[1][0].toFixed(1)},${pts[1][1].toFixed(1)}` : smoothPath(pts, false)
    }
  })
  return d
}

/**
 * A small pennant on a stick, drawn from the pin outward: the mast, then the
 * flag as a closed wobbly triangle. Coordinates are in counter-scaled pin
 * pixels, so the flag reads the same size at every zoom.
 */
export function pennant(seed: number): { mast: string; flag: string } {
  const j = (i: number, s: number) => (hash(i * 5.7 + seed * 23.9) - 0.5) * s
  const mast = `M${j(1, 0.6).toFixed(1)},0 L${j(2, 0.9).toFixed(1)},-22`
  const flag = smoothPath(
    [
      [0.4 + j(3, 0.5), -22 + j(4, 0.6)],
      [7 + j(5, 0.8), -20.2 + j(6, 0.6)],
      [13.5 + j(7, 0.9), -17.5 + j(8, 0.7)],
      [7.5 + j(9, 0.8), -14.4 + j(10, 0.6)],
      [0.4 + j(11, 0.5), -11.5 + j(12, 0.6)],
      [0.2, -16.8],
    ],
    true,
  )
  return { mast, flag }
}
