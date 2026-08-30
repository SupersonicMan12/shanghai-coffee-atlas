# Dianping public signals — the working route

**Date:** 2026-08-30 · **Status:** shipped (`tools/dianping_harvest.py` → `src/data/dianping.json`)

An earlier 30-minute trial (kept below as an appendix) concluded that
dianping.com was fully gated: PC pages sit behind a QR-login wall or a
spider-defence captcha, and the mobile SPA ships an empty shell to anonymous
visitors. That conclusion was right about those page types — and wrong about
the site as a whole.

## The route that works

Dianping serves a **full server-rendered shop page** to its Apple Maps
integration channel:

```
https://m.dianping.com/shop/<SHOP_ID>?msource=applemaps
```

- Works with **both** numeric ids (`1101234455`) and encrypted ids
  (`l2p6Zk0OLjKMt9UG`).
- A plain `curl` with a mobile Safari User-Agent returns HTTP 200 with the
  shop data embedded as JSON in the HTML: `shopName`, `shopPowerRate` (star
  rating as a string, e.g. `"4.3"`), `avgPrice` (人均 in ¥), `categoryName`,
  `regionName`, `cityId`, plus display-count strings (`"10万+"`).
- Verified example: shop `l2p6Zk0OLjKMt9UG` = O.P.S. CAFE, rating 4.3,
  avgPrice ¥61.
- No login, no cookies, no captcha, no headless browser — this is a page
  Dianping itself offers to an external integration, addressed one shop at a
  time.

### Finding shop ids

Search engines index both `www.dianping.com/shop/<encrypted-id>/...` and
`m.dianping.com/shop/<numeric-id>?msource=applemaps` URLs. Queries of the form
`<中文名或英文名> 上海 咖啡` restricted to `dianping.com` surface candidate ids
for most cafés. Every candidate is then **verified**: the applemaps page is
fetched, the returned `shopName` is compared against the café's English and
Chinese names (brand-core comparison — generic words like “coffee”/“咖啡” and
branch suffixes like “(安福路店)” cannot carry a match), and `cityId` must be
Shanghai (1). Non-matches are recorded as not-found rather than guessed.

## Compliance rationale

- **Public, server-offered pages.** The applemaps route is content Dianping
  deliberately serves, login-free, to an external integration. We read exactly
  what any Apple Maps user is shown.
- **No auth or defence bypass.** No accounts, no cookie replay, no captcha
  solving, no headless-browser hydration tricks. If Dianping starts serving
  shells or captchas, the harvester backs off and keeps partial coverage.
- **No bulk spidering.** One page per matched café (~200 shops), sequential,
  with ≥2.5 s between requests. Search-engine results — not dianping.com
  listing pages — do the discovery.
- **Cached and resumable.** Every response is cached under
  `tools/cache/dianping/`; re-runs never re-fetch what is already on disk.
- **Minimal fields, no review text.** We keep the aggregate signals (rating,
  review volume, 人均, category, region) and never harvest review content or
  user data.

## What the signals feed

Kept deliberately narrow (see `src/lib/scoring.ts` and the “?” page):

- `avgPrice` → **spend** axis evidence, ranked through the dataset's own
  price quantiles, averaged with the Amap estimate when both exist.
- rating × log(review volume) → a **trust** factor that deepens confidence
  ink and gives **energy** a mild popularity nudge (±6 points at most).
- The general star rating is **never** used as a direct fit score on focus,
  linger or adventure — “good” is not “good *for deep work*”.

## Limits

- **Coverage is partial.** Only cafés whose shop page could be found via
  public search results and verified by name survive; see the counts in
  `tools/cache/dianping/ids.json`.
- **Display counts are coarse.** Review/photo volumes arrive as strings like
  `"4万+"` — fine for a logarithmic trust factor, useless for precision.
- **Snapshots age.** `fetchedAt` is recorded per shop; prices and ratings
  drift, and the pipeline must be re-run to refresh them.
- **The channel could close.** If Dianping gates the applemaps route, the
  data simply freezes at the last harvest — the app never fetches Dianping at
  runtime.

---

## Appendix — original feasibility trial (2026-08-30, superseded)

Three page types on dianping.com, each attempted cold (no cookies, no
account):

1. **PC search results** — `www.dianping.com/search/keyword/1/0_永康路咖啡`
   → redirected to `verify.meituan.com` with a slider-puzzle captcha
   (`action=spiderindefence`). Still true; we do not touch search pages.
2. **PC shop page** — `www.dianping.com/shop/<id>` → 302 to
   `account.dianping.com/pclogin` (QR-code login wall). Still true.
3. **Mobile shop page** — `m.dianping.com/shopshare/<id>` → SEO title only,
   empty body without app hydration. Still true for `shopshare`; the
   `shop/<id>?msource=applemaps` variant is the one that renders server-side.
