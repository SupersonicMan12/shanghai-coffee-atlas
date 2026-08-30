# Shanghai Coffee Atlas — Expansion Plan (v2)

Goal: turn the prototype into something the public has a real reason to use. The differentiator is the **compass** — five subjective axes (focus / energy / linger / adventure / spend) that no mainstream map offers. v2 makes the compass *evidence-based* instead of editorial, roughly triples the dataset, and adds the practical features (nearest-from-here, etc.) that make it usable on the street.

---

## 1. Data: where accurate public opinion comes from

### 大众点评 (Dianping) — the honest assessment
Dianping has the best café opinion data in China, but:
- **No free public API.** The official data interface is enterprise-only, paid, and requires 企业资质 (business registration).
- **Scraping is actively fought**: dynamic font encryption of ratings, signed `_token` request parameters, IP bans, behavioral detection, and account bans. It is also legally grey (their ToS prohibit it, and Chinese courts have ruled against scrapers of Dianping specifically).

**Recommendation: do not scrape Dianping programmatically.** Instead:

1. **高德地图 (Amap) Web API — primary structured source.** Amap returns `rating` (0–5) and `cost` (人均消费, RMB) for dining POIs, plus canonical name/address/coords/hours. Free personal developer key (Chinese phone + real-name). Quota: 100 POI searches/day (personal) — enough to cover ~500 cafés in under a week of cached, resumable harvesting. *Needs you to register a key at https://console.amap.com and give it to me as a secret.*
2. **Manual Dianping panel — small, legal, high-value.** For the ~60 flagship cafés, a human-readable checklist (rating, review count, 环境/服务/口味 sub-scores, top “印象标签” like 适合办公 / 安静 / 出品稳定) transcribed by hand into a YAML file. Dianping impression tags are exactly our axes. This is slow but 100% accurate and safe; a child session can prepare the empty forms and I/you fill them, or a child session transcribes from screenshots you provide.
3. **OSM + published guides** (already in use) for coverage expansion to ~250 shops, including Jing'an/Changning/Hongkou/Pudong gaps.
4. **In-app feedback loop — the long-term answer.** Every café card gets a 30-second “calibrate the compass” widget (5 one-tap questions mirroring the axes). Votes stored via a tiny free backend (Cloudflare Workers + KV or Supabase free tier). Once a café has ≥5 votes, public opinion progressively replaces the editorial prior. This is what makes the app self-improving and is itself a reason to return.

### 2. The scoring model (the “?” explains this)

Each axis score is a **Bayesian blend of three evidence tiers**:

```
axis_score = (w_e·E + w_s·S + w_u·ū·n/(n+k)) / (w_e + w_s + w_u·n/(n+k))
```

- `E` — editorial prior (current curated value), weight `w_e = 1`.
- `S` — structured-signal estimate from measurable proxies, weight `w_s = 2` when available:
  - **spend** ← Amap `cost` mapped through Shanghai coffee price quantiles;
  - **linger** ← seats, opening span, archetype (standing bar caps linger);
  - **focus** ← seats/area class, tag evidence (wifi, sockets, 适合办公 impression tags);
  - **energy** ← review-count velocity + weekend/weekday hour patterns + archetype;
  - **adventure** ← menu signals (single-origin, brew methods, roaster-owned).
- `ū` — mean of in-app user votes, `n` votes, shrinkage constant `k = 5` (an empirical-Bayes prior: one loud opinion can't move a café, five consistent ones can).

Ratings from Amap feed a separate **confidence badge**, not the axes (a 4.8 says “good”, not “good *for deep work*” — conflating them is exactly what other apps do wrong).

The compass match itself stays `Σ wᵢ(1−dᵢ^0.72)` but each axis gains a **confidence value** (how much evidence sits behind it), shown as ink density: a solid stroke = well-evidenced, a faint sketch = editorial guess. Honest uncertainty is part of the brand.

A **“?” methodology page** (bilingual) documents: sources, the blend formula in plain language, what is editorial vs. measured vs. voted, and how to contribute votes.

## 3. Features that give the public a reason to use it

| Feature | Why |
|---|---|
| **Nearest from here** — geolocate (or drop a pin / pick a metro station), rank open cafés by compass-match × walking time | the #1 street use case |
| Metro-station picker (Line 1/2/7/10/12/13 stations as anchor points) | geolocation is unreliable indoors; everyone navigates by metro |
| “Open now / open late” lens with closing-soon warnings | second most common real decision |
| Compass calibration widget + vote counts | self-improving accuracy, ownership |
| Café detail: photos would be ideal — proposal: hand-inked glyph stays primary, optional single photo per flagship café (user-provided or CC-licensed) | trust without becoming a photo app |
| WeChat-friendly share cards (image export of taxi card + compass verdict) | sharing in China happens in WeChat, not URLs |
| PWA manifest + offline caching | usable in the lane with no signal |
| SEO/meta + per-café static pages (prerendered hash routes) | discoverability |

## 4. Child-session split (after your sign-off)

1. **Data harvest & pipeline** — Amap harvester (cached, quota-aware, resumable), OSM expansion to ~250 cafés, schema migration with per-axis provenance + confidence fields.
2. **Scoring engine & methodology page** — implement the Bayesian blend, confidence rendering (ink density), bilingual “?” page with the math.
3. **Street features** — nearest-from-point (geolocate/pin/metro anchors), open-now lens, walking-time ranking.
4. **Feedback loop & sharing** — calibration widget + Cloudflare Worker/Supabase backend, WeChat share-card image export, PWA.

Each child works on a branch and opens a PR; I integrate, resolve conflicts, verify (lint/build/manual pass), and redeploy Pages.

## 5. What I need from you

1. Approve/adjust this plan.
2. **Amap Web API key** (personal, free — https://console.amap.com, needs Chinese phone real-name). Without it: axes fall back to editorial + OSM proxies and the in-app vote loop becomes the sole public-opinion source.
3. Decide on the Dianping manual panel: (a) skip, (b) I prepare forms and you transcribe ~60 cafés, or (c) you send screenshots and a child session transcribes.
4. Backend choice for votes: Cloudflare Workers (needs your CF account token) or Supabase free tier (needs you to create a project) — or defer votes to v3.
