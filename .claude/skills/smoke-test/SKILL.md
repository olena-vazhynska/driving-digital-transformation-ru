---
name: smoke-test
description: Render index.html in headless Chromium and play the simulation from intro to debrief on phone and desktop widths, failing on a blank page, JS errors, failed script loads or horizontal scroll, and saving screenshots. Use after any change to index.html (content, layout or code) and before committing, or when the user asks to test, check or preview the page.
---

# Smoke test

Runs `scripts/smoke-test.js`, which opens `index.html` in headless Chromium and, at 360px (phone) and 1280px (desktop):

1. checks the page renders (`#root` is not empty),
2. starts the simulation and plays every stage to the debrief twice — once always picking the first choice, once always the last,
3. fails on console errors, uncaught page errors, failed script/CDN loads, a stage it cannot get past, a missing debrief, or horizontal scroll at phone width,
4. saves screenshots of the intro, first stage and debrief (first-choice route).

Web fonts that fail to load are reported as warnings only — the CSS falls back to system fonts.

## Run it

```bash
node "$CLAUDE_PROJECT_DIR"/.claude/skills/smoke-test/scripts/smoke-test.js
```

Options: a path to another HTML file as the first argument; `--out <dir>` for screenshots (default: `<os tmpdir>/smoke-test`).

**If every load of `unpkg.com` fails** (e.g. `ERR_TUNNEL_CONNECTION_FAILED` in a cloud session whose network policy blocks unpkg), rerun with `--local-react`. It serves the same React 18 UMD bundles from the npm registry. Say in your report that the CDN itself was not tested.

Exit codes: `0` pass, `1` problems found, `2` the script crashed, `3` setup problem (file or Playwright missing — install with `npm install -g playwright && npx playwright install chromium`).

## After running

- On **FAIL**, fix each problem in `index.html` and rerun until it passes. A `page error` next to a `stuck at stage N` points at the code that runs when a choice is picked on that stage.
- Look at the screenshots (`phone-*.png` first) with the Read tool. Check for clipped or overlapping text, elements spilling out of their cards, and unreadable contrast — the script cannot catch those.
- Report the result in a few lines: pass/fail, stages played, any warnings, anything you saw in the screenshots.
