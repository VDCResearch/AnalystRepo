# Repository Guidelines

## Project Structure

- `calls/<TICKER>/<FY####Q#>.json`: One earnings-call brief per quarter (primary authored content).
- `templates/call.json`: Canonical brief schema/template (start here for new entries).
- `scripts/`: Node scripts that generate derived artifacts.
- `index.json`: Generated search/index payload consumed by the UI (do not hand-edit).
- `calendar.json`: Generated event feed payload (do not hand-edit).
- `assets/`: Static front-end (`app.js`, `call.js`, `styles.css`).
- `index.html` / `call.html`: Static pages that render the library and an individual brief.
- `Analyst Relations Repository/`: Source materials (transcripts/PDFs) used to write briefs.

## Build, Test, and Development Commands

Run from repo root:

- `node scripts/build-index.js`: Regenerates `index.json` from `calls/**.json` (fails if JSON is invalid).
- `set CALENDAR_FEED_URL=<icsUrl> && node scripts/build-calendar.js` (PowerShell: `$env:CALENDAR_FEED_URL=...; node scripts/build-calendar.js`): Refreshes `calendar.json`.
- `python -m http.server 8000`: Serve locally; open `http://localhost:8000/index.html`.

## Brief Data, Tags, and Naming

- File naming: `calls/AAPL/FY2026Q1.json`, `calls/005930.KS/FY2025Q4.json`, etc.
- Dates: `call_date` must be `YYYY-MM-DD`.
- `themes` are shared, cross-company tags (reuse existing taxonomy when possible; avoid quarter-specific phrasing).
- Keep `bullets` to the top 3 takeaways; keep `tldr` as a tight 1–2 sentence summary.

## Coding Style & Formatting

- JSON: 2-space indentation, double quotes, trailing newline.
- JS/CSS: follow existing file style (2-space indentation, semicolons in JS).

## Validation (No Test Suite)

There’s no automated test framework. Before pushing:

- Regenerate `index.json` and ensure the UI still loads (`python -m http.server`).
- Ensure generated files come only from scripts (don’t manually edit `index.json`/`calendar.json`).

## Commit & Pull Request Guidelines

- Commit messages are imperative and concise (e.g., “Update HON FY2025Q4 brief”).
- If editing briefs, include ticker + FYQ in the message when helpful.
- PRs should describe what changed, why, and include screenshots for UI changes (`index.html`, `call.html`, `assets/`).
