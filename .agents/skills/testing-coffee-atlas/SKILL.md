---
name: testing-coffee-atlas
description: How to run and browser-test the Shanghai Coffee Atlas (Vite+React, frontend-only) – Compass, map engine, cards, mobile sheet, reduced motion – including environment gotchas.
---

# Testing the Shanghai Coffee Atlas in a browser

## Run
- `npm run dev -- --port 5173 --strictPort` → http://localhost:5173 (Node 20 prints a Vite engine warning; ignore).
- No backend, no auth. All state lives in the URL hash: `#/a=f-e-l-a-s&s=<scenarioId>&cafe=<id>&at=metro:<station>&lang=zh|en`.
  To get a neutral state, load a *new* URL (e.g. `localhost:5173/?fresh#/lang=zh`) – reusing the tab's URL restores the previous compass.
- After a lead changes code mid-run, hard-reload (Ctrl+Shift+R); Vite HMR may say "Could not Fast Refresh" for AtlasMap.tsx.
- Maximize Chrome with `DISPLAY=:0 wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz` (xdotool/wmctrl need `DISPLAY=:0`).

## Useful selectors / checks
- Scenario chips: `.scenario-row button.scenario`; sliders: `input[type=range][aria-label="专注"|"气氛"|"停留"|"风味"|"价位"]` (the first range in the DOM is the time-of-day slider).
- Picks: `.strip-card.pick .sc-rank`; map pennants: `.flag .flag-n`, café id via `closest('[data-id]')`. Pennant DOM order is spatial – compare by numeral+id, not array order.
- Card traits render as `.verdict-reasons .vr-trait` (with `a.trait-src` ↗ for web sources); `.card-traits` may be empty even when traits are visible.
- Details coverage: `src/data/details.json` is keyed by café id; ~145 of 1053 cafés have no record (no traits/photos). Check with a tsx script importing `CAFES` from `src/data/cafes`.
- Search hits: `.search-hits button`. In the night theme (app auto-switches after dark by Shanghai time) the hit text may be near-invisible – check computed color vs background.
- Time-of-day theme depends on the real Shanghai clock; "已关门" verdict notes are expected late at night.

## Gotchas in the VM
- `matchMedia('(hover: hover) and (pointer: fine)')` is **false** in the Devin Chrome, so the desktop `.pin-tip` hover tooltip never renders – mark it untested rather than failed.
- `xdotool type` of CJK text does not reach the input; search with the pinyin/English hood keys instead (`Daxue`, `Qiantan`, `Gubei`, `Zhangjiang`, `Manner`).
- Wheel: scroll **up** = zoom in, scroll **down** = zoom out. Keyboard `0`/`+`/`-`/arrows only work after clicking the map (it must be the focused element).
- Multi-action `computer` calls only return the last screenshot – to capture a mid-drag frame, hold `left_mouse_down` in one call and screenshot in the next.
- Mobile: DevTools (Ctrl+Shift+I) → Ctrl+Shift+M, type 390 × 844 in the dimension fields; "Responsive" already emulates touch (`pointer: coarse`). Screen coords ≈ `210 + cssX*0.641`, `98 + cssY*0.654` when DevTools is docked right on a 1600-wide display – read element rects via console and convert.
- Reduced motion: DevTools Command menu (Ctrl+Shift+P) → "Show Rendering" → "Emulate CSS media feature prefers-reduced-motion". Prove the glide is cut by sampling a slider's `.value` every 16 ms around a chip click (only two distinct values expected).

## Devin Secrets Needed
none
