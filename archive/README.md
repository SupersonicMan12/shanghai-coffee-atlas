# Archived features

Copies of features removed from the live app in v5, kept for reference or revival.

- `crawls/` — seven precomputed walking routes (`crawls.ts`) and the rail panel that drew them (`CrawlList.tsx`). Route rendering on the map lived in `AtlasMap.tsx` (`route`, `crawlIndex`) and the `crawl=` hash key in `App.tsx`; see git history before v5.
- `quiz/` — the six-question "what kind of drinker are you" modal and its scoring.

These files are not compiled (`tsconfig` only includes `src/`). Their imports point back into `src/` so they can be dropped back in if wanted; some `UI` label keys they reference (`crawlsNote`, `sixQuestions`, …) were removed from `src/data/labels.ts` and would need restoring.
