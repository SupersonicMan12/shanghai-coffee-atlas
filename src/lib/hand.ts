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
