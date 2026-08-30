// Tiny node-run tests for the pure functions in src/lib/scoring.ts.
// Usage: node tools/test-scoring.mjs   (bundles scoring.ts with rolldown, then asserts)
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'tools', '.test-dist')

// Bundle scoring.ts (plus its dianping.json data import) into one ESM file.
execSync(
  `npx rolldown src/lib/scoring.ts --format esm --file ${JSON.stringify(
    path.join(dist, 'scoring.mjs'),
  )}`,
  { cwd: root, stdio: 'inherit' },
)

const {
  blendAxis,
  blendCafe,
  blendAll,
  buildContext,
  percentile,
  structuredSignals,
  parseCountText,
  dianpingTrust,
  SHRINK_K,
} = await import(path.join(dist, 'scoring.mjs'))

const cafe = (over = {}) => ({
  id: 'x',
  name: 'X',
  nameZh: 'X',
  district: 'Xuhui',
  hood: 'h',
  street: 's',
  streetZh: 's',
  lat: 31.2,
  lng: 121.4,
  archetype: 'neighborhood',
  axes: { focus: 60, energy: 50, linger: 55, adventure: 40, spend: 50 },
  tags: [],
  signature: '',
  note: '',
  opens: 8,
  closes: 20,
  seats: 20,
  price: 2,
  ...over,
})

let n = 0
const test = (name, fn) => {
  fn()
  n++
  console.log(`ok ${n} - ${name}`)
}

test('editorial only: value = E, confidence ~0.35, single source', () => {
  const ev = blendAxis(60, undefined, undefined)
  assert.equal(ev.value, 60)
  assert.equal(ev.confidence, 0.35)
  assert.deepEqual(ev.sources, ['editorial'])
})

test('editorial + structured follows the formula, confidence 0.7', () => {
  const ev = blendAxis(60, 90, undefined)
  assert.equal(ev.value, Math.round((1 * 60 + 2 * 90) / 3))
  assert.equal(ev.confidence, 0.7)
  assert.deepEqual(ev.sources, ['editorial', 'measured'])
})

test('votes are shrunk: one vote moves less than five consistent ones', () => {
  const one = blendAxis(50, undefined, { mean: 100, count: 1 })
  const five = blendAxis(50, undefined, { mean: 100, count: 5 })
  assert.ok(one.value > 50 && one.value < five.value)
  // n=1, k=5: shrink 1/6 → (50 + 3·100/6)/(1 + 3/6) = 100/1.5
  assert.equal(one.value, Math.round(100 / 1.5))
  assert.ok(five.confidence > one.confidence)
})

test('confidence is asymptotic to 1 with many votes', () => {
  const lots = blendAxis(50, 60, { mean: 55, count: 500 })
  assert.ok(lots.confidence > 0.99 && lots.confidence <= 1)
  assert.deepEqual(lots.sources, ['editorial', 'measured', 'voted'])
})

test('shrinkage constant k is 5', () => {
  assert.equal(SHRINK_K, 5)
})

test('percentile ranks with ties split', () => {
  assert.equal(percentile([10, 20, 30, 40], 25), 0.5)
  assert.equal(percentile([10, 20, 20, 40], 20), 0.5)
  assert.equal(percentile([], 20), 0.5)
})

test('standing bar caps the linger signal at 25', () => {
  const s = structuredSignals(
    cafe({ archetype: 'standing-bar', seats: 6, tags: ['standing-only'] }),
    { costsSorted: [] },
  )
  assert.ok(s.linger <= 25)
})

test('adventure/focus/spend signals are omitted without evidence', () => {
  const s = structuredSignals(cafe(), { costsSorted: [] })
  assert.equal(s.adventure, undefined)
  assert.equal(s.focus, undefined)
  assert.equal(s.spend, undefined)
  assert.ok(typeof s.linger === 'number' && typeof s.energy === 'number')
})

test('spend maps Amap cost through dataset quantiles', () => {
  const cafes = [30, 40, 50, 60, 100].map((cost, i) =>
    cafe({ id: `c${i}`, evidence: { amap: { id: `a${i}`, cost, fetchedAt: 't' } } }),
  )
  const ctx = buildContext(cafes)
  const cheap = structuredSignals(cafes[0], ctx)
  const dear = structuredSignals(cafes[4], ctx)
  assert.ok(cheap.spend < 50 && dear.spend > 50)
})

test('blendCafe prefers a published AxisEvidence from the data pipeline', () => {
  const published = { value: 77, confidence: 0.9, sources: ['editorial', 'measured'] }
  const c = cafe({ evidence: { axes: { focus: published } } })
  const out = blendCafe(c, { costsSorted: [] })
  assert.deepEqual(out.focus, published)
})

test('blendAll is memoized on the cafes array identity', () => {
  const cafes = [cafe()]
  assert.equal(blendAll(cafes), blendAll(cafes))
})

test('parseCountText reads Dianping display counts', () => {
  assert.equal(parseCountText('8549'), 8549)
  assert.equal(parseCountText('4万+'), 40000)
  assert.equal(parseCountText('1.2万'), 12000)
  assert.equal(parseCountText(undefined), 0)
  assert.equal(parseCountText(''), 0)
})

test('dianpingTrust grows with rating and review volume', () => {
  const dp = (over = {}) => ({
    shopId: 's',
    rating: 4.5,
    reviewCountText: '4万+',
    fetchedAt: 't',
    ...over,
  })
  const strong = dianpingTrust(dp())
  const fewer = dianpingTrust(dp({ reviewCountText: '30' }))
  const worse = dianpingTrust(dp({ rating: 3.0 }))
  assert.ok(strong > 0 && strong <= 1)
  assert.ok(fewer < strong)
  assert.ok(worse < strong)
  assert.equal(dianpingTrust(undefined), 0)
  assert.equal(dianpingTrust(dp({ rating: undefined })), 0)
  assert.equal(dianpingTrust(dp({ reviewCountText: undefined })), 0)
  // photo count works as a fallback volume proxy
  assert.ok(
    dianpingTrust(dp({ reviewCountText: undefined, picCountStr: '10万+' })) > 0,
  )
})

test('dianping trust deepens confidence without moving the value', () => {
  const plain = blendAxis(60, 80, undefined)
  const trusted = blendAxis(60, 80, undefined, 0.8)
  assert.equal(trusted.value, plain.value)
  assert.ok(trusted.confidence > plain.confidence)
  assert.ok(trusted.confidence <= 1)
  assert.deepEqual(trusted.sources, plain.sources)
})

test('dianping avgPrice feeds the spend signal through quantiles', () => {
  const dp = (price) => ({
    shopId: 's',
    avgPrice: price,
    fetchedAt: 't',
  })
  const cafes = [30, 40, 50, 60, 100].map((price, i) =>
    cafe({ id: `c${i}`, evidence: { dianping: dp(price) } }),
  )
  const ctx = buildContext(cafes)
  assert.equal(ctx.dpPricesSorted.length, 5)
  const cheap = structuredSignals(cafes[0], ctx)
  const dear = structuredSignals(cafes[4], ctx)
  assert.ok(cheap.spend < 50 && dear.spend > 50)
})

test('amap and dianping spend estimates average when both speak', () => {
  const mk = (i, cost, price) =>
    cafe({
      id: `c${i}`,
      evidence: {
        amap: { id: `a${i}`, cost, fetchedAt: 't' },
        dianping: { shopId: `s${i}`, avgPrice: price, fetchedAt: 't' },
      },
    })
  // Amap says cheapest, Dianping says dearest — the estimate lands between.
  const cafes = [
    mk(0, 30, 100),
    mk(1, 40, 60),
    mk(2, 50, 50),
    mk(3, 60, 40),
    mk(4, 100, 30),
  ]
  const ctx = buildContext(cafes)
  const s = structuredSignals(cafes[0], ctx)
  assert.ok(s.spend > 10 && s.spend < 90)
})

test('a popular well-rated room gets a mild energy nudge', () => {
  const hot = cafe({
    evidence: {
      dianping: {
        shopId: 's',
        rating: 4.8,
        reviewCountText: '4万+',
        fetchedAt: 't',
      },
    },
  })
  const quiet = cafe()
  const ctx = { costsSorted: [], dpPricesSorted: [] }
  const sHot = structuredSignals(hot, ctx)
  const sQuiet = structuredSignals(quiet, ctx)
  assert.ok(sHot.energy > sQuiet.energy)
  assert.ok(sHot.energy - sQuiet.energy <= 8)
})

console.log(`\n${n} tests passed`)
