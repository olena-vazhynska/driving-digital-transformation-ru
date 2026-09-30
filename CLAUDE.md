# CLAUDE.md

Interactive Russian-language training simulation, «Продвижение процесса трансформации» (digital transformation in social protection, DCI). Learners steer a "vehicle" through stages, choosing responses that move dashboard gauges.

## Project shape

- The whole app is one file: `index.html`. No build step, no `package.json`, no tests, no CI.
- React 18 and ReactDOM load as UMD bundles from unpkg; fonts come from Google Fonts. Nothing else is external.
- The app code is **precompiled** — plain JS with `React.createElement(...)` calls, not JSX. There is no JSX source file.

## Rules

- **Do not reintroduce JSX or Babel Standalone.** Runtime Babel was removed because a failed CDN load rendered a blank page with no error. Write new UI as `React.createElement` in the same style as the existing code.
- Keep everything in `index.html` unless asked otherwise.
- All user-facing text is in Russian. Match existing terminology (e.g. «Доверие и сотрудничество», «Темп изменений», «Этический компас») and use «ё» where the existing text does.
- The layout must work at phone width (~360px) with no horizontal scroll.

## Where things live in `index.html`

- `CSS` — all styles, as a template string injected at runtime (design tokens on `.drv-root`).
- `INITIAL` — starting gauge values (`trust`, `speed`, `ethics`, `vision`, `morale`, `risk`, plus `learn`).
- `GAUGES` — gauge definitions; `good` is `"high"` (higher is better) or `"band"` (a middle range is best, used for `speed`).
- `STAGES` — the scenario: each stage has `title`, `body` and `choices`, each choice has a `label`, feedback `note` and `fx` (gauge deltas). Most content edits happen here.
- Components: `Gauge`, `Odometer`, `Cluster`, `Intro`, `Debrief`, `App`.

## Checking changes

- A `PostToolUse` hook (`.claude/hooks/check-index-syntax.js`) syntax-checks the inline script after every edit. If it reports an error, fix it before doing anything else — a syntax error means a blank page.
- To see the page, open `index.html` in a browser, or serve it with `python3 -m http.server` and load it in headless Chromium (Playwright is available in cloud sessions).
