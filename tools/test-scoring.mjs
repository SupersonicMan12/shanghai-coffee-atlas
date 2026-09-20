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
  hintSources,
  parseCountText,
  dianpingTrust,
  SHRINK_K,
  W_EVIDENCE,
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

test('editorial only: value = E, confidence ~0.35, single source, no reason', () => {
  const ev = blendAxis(60, undefined, undefined)
  assert.equal(ev.value, 60)
  assert.equal(ev.confidence, 0.35)
  assert.deepEqual(ev.sources, ['editorial'])
  assert.equal(ev.because, undefined)
})

const hint = (over = {}) => ({
  value: 100,
  confidence: 0.5,
  because: 'people working on laptops in the photos',
  becauseZh: '照片里有人在用电脑办公',
  sources: ['photo'],
  ...over,
})

test('an evidence hint follows the formula and carries its reason', () => {
  const ev = blendAxis(60, hint(), undefined)
  // c_h=0.5: (60 + 3·0.5·100)/(1 + 3·0.5)
  assert.equal(ev.value, Math.round((60 + W_EVIDENCE * 0.5 * 100) / (1 + W_EVIDENCE * 0.5)))
  assert.equal(ev.because, 'people working on laptops in the photos')
  assert.equal(ev.becauseZh, '照片里有人在用电脑办公')
  assert.deepEqual(ev.sources, ['editorial', 'observed'])
})

test('hint confidence scales both the pull and the ink', () => {
  const weak = blendAxis(50, hint({ confidence: 0.2 }), undefined)
  const firm = blendAxis(50, hint({ confidence: 0.9 }), undefined)
  assert.ok(weak.value > 50 && weak.value < firm.value)
  assert.ok(firm.confidence > weak.confidence && weak.confidence > 0.35)
  // confidence = 0.35 + 0.65·c_h
  assert.equal(firm.confidence, Math.round((0.35 + 0.65 * 0.9) * 100) / 100)
})

test('a zero-confidence hint is ignored entirely', () => {
  const ev = blendAxis(60, hint({ confidence: 0 }), undefined)
  assert.equal(ev.value, 60)
  assert.deepEqual(ev.sources, ['editorial'])
  assert.equal(ev.because, undefined)
})

test('listed prices are measured, photos and pages observed', () => {
  assert.deepEqual(hintSources(hint({ sources: ['amap'] })), ['measured'])
  assert.deepEqual(hintSources(hint({ sources: ['dianping', 'web'] })), ['measured', 'observed'])
  assert.deepEqual(hintSources(hint({ sources: undefined })), ['observed'])
  const ev = blendAxis(40, hint({ sources: ['amap', 'photo'] }), undefined)
  assert.deepEqual(ev.sources, ['editorial', 'measured', 'observed'])
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
  const lots = blendAxis(50, hint({ sources: ['amap'] }), { mean: 55, count: 500 })
  assert.ok(lots.confidence > 0.99 && lots.confidence <= 1)
  assert.deepEqual(lots.sources, ['editorial', 'measured', 'voted'])
})

test('shrinkage constant k is 5', () => {
  assert.equal(SHRINK_K, 5)
})

test('no evidence → the prior stands: archetype, seats, tags and hours move nothing', () => {
  const plain = blendCafe(cafe())
  const dressed = blendCafe(
    cafe({
      archetype: 'standing-bar',
      seats: 0,
      tags: ['standing-only', 'laptop-welcome', 'own-roast', 'late'],
      opens: 7,
      closes: 23,
    }),
  )
  for (const k of ['focus', 'energy', 'linger', 'adventure', 'spend']) {
    assert.equal(dressed[k].value, plain[k].value)
    assert.deepEqual(dressed[k].sources, ['editorial'])
  }
})

test('blendCafe uses a published AxisEvidence as the prior, keeping its confidence', () => {
  const published = { value: 77, confidence: 0.9, sources: ['editorial', 'measured'] }
  const c = cafe({ evidence: { axes: { focus: published } } })
  const out = blendCafe(c)
  assert.equal(out.focus.value, 77)
  assert.equal(out.focus.confidence, 0.9)
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

test('dianping trust deepens confidence without moving the value or adding a source', () => {
  const plain = blendAxis(60, hint({ sources: ['amap'] }), undefined, 0.35, 0)
  const trusted = blendAxis(60, hint({ sources: ['amap'] }), undefined, 0.35, 0.8)
  assert.equal(trusted.value, plain.value)
  assert.ok(trusted.confidence > plain.confidence)
  assert.ok(trusted.confidence <= 1)
  assert.deepEqual(trusted.sources, plain.sources)
  // a popular room is not thereby a lively one
  const hot = cafe({
    evidence: { dianping: { shopId: 's', rating: 4.8, reviewCountText: '4万+', fetchedAt: 't' } },
  })
  assert.equal(blendCafe(hot).energy.value, blendCafe(cafe()).energy.value)
})

console.log(`\n${n} tests passed`)
