# Dianping feasibility trial

**Date:** 2026-08-30 · **Timebox:** 30 min · **Method:** real desktop Chrome browser, no login, no captcha/login bypass attempted (per plan).

## What was tried

Three page types on dianping.com, each attempted cold (no cookies, no account):

1. **PC search results** — `www.dianping.com/search/keyword/1/0_永康路咖啡`
   → Immediately redirected to `verify.meituan.com` with a **slider-puzzle captcha**
   (`action=spiderindefence` in the URL — the anti-crawler wall fires before any
   content renders). No shop names, ratings, or review counts visible.

2. **PC shop page** — `www.dianping.com/shop/<id>`
   → 302 to `account.dianping.com/pclogin`: a **QR-code login wall** (scan with the
   Dianping app). Zero shop content is served to anonymous desktop visitors.

3. **Mobile shop page** — `m.dianping.com/shopshare/<id>`
   → The page `<title>` is populated (`【大众点评】电话_地址_价格…`), but the body
   renders as an **empty shell**; the client-side app refuses to hydrate for
   non-app/anonymous sessions and shows no rating, review count, or 印象 tags.
   Mobile channel/list pages (`m.dianping.com/shanghai/ch10/…`) likewise redirect
   straight to the login page.

## Conclusion

**Gated.** Anonymous browsing exposes no usable signals: PC pages are behind a
login wall or spider-defence captcha, and mobile pages ship only SEO meta tags
with an empty body. There is no compliant, login-free way to read ratings,
review counts, or 印象 tags at any scale.

## Recommendation

- Do **not** build a Dianping crawler (matches the plan's assumption).
- Keep Amap (`evidence.amap`: rating, 人均 cost, hours) as the structured
  external signal, plus OSM for coordinates.
- If Dianping-grade signals ever become a hard requirement, the compliant route
  is the Meituan/Dianping open platform (merchant/partner API), not scraping.
