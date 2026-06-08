# Human History Graph

Interactive browser-based graph of historical figures, spanning antiquity to ~1900. People are nodes positioned by birth year (x-axis) and geographic region (y-axis). Edges show relationships (rivalry, influence, patronage, etc.). Built with Cytoscape.js, no backend, no build tools.

## Python scripts

All data files use UTF-8. Always open them with `encoding="utf-8"`. On Windows the default cp1252 codec will crash on non-ASCII characters in names.

## Running locally

```
python -m http.server 8000
```

Open http://localhost:8000. Fetch calls require HTTP, not file://.

## Browser testing (opt-in, not run by default)

There is a headless-browser harness for verifying interaction behaviour (zoom-based visibility, hover/click connection reveal, edge styling, wheel zoom, etc.) by actually driving the page in real browser engines and asserting on the live Cytoscape/DOM state. **Do not run or set this up unless the user explicitly asks to verify behaviour in a browser.** Most changes do not need it; default to normal code edits and only reach for this when asked to "test", "verify it works", or check cross-browser behaviour.

It is intentionally kept out of git (see `.gitignore`: `node_modules/`, `package.json`, `package-lock.json`, `test/*.png`) to preserve the "no backend, no build tools" nature of the repo. Only `test/inspect.mjs` is tracked.

Setup (one time, if `node_modules/` is absent):

```
npm install -D playwright
npx playwright install chromium        # add `firefox webkit` for cross-browser runs
```

Run (the static server must be up on :8000):

```
python -m http.server 8000
node test/inspect.mjs
```

`test/inspect.mjs` loads the page, manipulates zoom, performs real mouse hovers/clicks/wheel events, reads back live element state (opacity, display, style, classes, canvas sizes), prints `PASS`/`FAIL` per check plus an overall result, exits non-zero on failure, and saves screenshots into `test/` for visual confirmation. It captures `console` and `pageerror` so it also catches runtime errors and unwanted warnings. Extend it by adding `check(name, condition, detail)` calls. To run across engines, import `firefox`/`webkit` from `playwright` and loop (an earlier version did this); Chromium alone covers both Chrome and Edge since they share the engine.

## File structure

```
index.html          - single page shell
app.js              - all application logic (ES module)
style.css           - dark theme layout
data/
  people.json       - array of person objects (~1070 people, ~1800 BC to 1900)
  descriptions.json - array of { "id": { short, long, why, personality } }
  relations.json    - array of directed edges between people
  completed_relations.json - array of person ids whose relations have been authored (progress tracker for scripts/skills)
  eras.json         - era bands and point events for the timeline ruler
  regions.json      - ordered country list (top-to-bottom y placement) + fallback country
  occupation_groups.json - maps occupations to color groups (see Occupation colors)
rules/                  - authoring rules (display_name.md, descriptions.md, relations.md, eras.md)
scripts/                - Python data helpers (add/check relations, find missing data, csv->json)
test/
  inspect.mjs           - opt-in Playwright behaviour checks (see Browser testing)
```

## Data schemas

Short version of the data schemas:

**people.json** - array of objects:
`{ id, name, display_name, birth_year, death_year, occupation, birth_country, hpi_score }`
`display_name` is the shortened label drawn on the graph (rules in `rules/display_name.md`); `name` is the full name shown in the info panel and edge headers.

**descriptions.json** - array of single-key objects (note: NOT a flat map):
`[ { "person_id": { short_description, long_description, why_they_matter, personality } } ]`

**relations.json** - array of directed edges, one per pair (no reverse duplicates, treated as bidirectional by the app):
`{ source_id, target_id, type, strength (0-1), confidence (0-1), reason }`

Valid relation types: `teacher, student, rival, collaborator, patron, family, influence, ally, spouse, romantic, friend, enemy, mentor, successor, predecessor`

**eras.json** - array of era bands and point events, spanning ~3150 BC to 1900:
`{ id, label, type: "era"|"event", start_year+end_year OR year, color }`

**regions.json** - an ordered list of countries plus a fallback:
```json
{ "fallback": "Italy", "order": ["Iceland", "Finland", ..., "Saint Lucia"] }
```

`order` defines only the top-to-bottom country *ordering*; there are no fixed bands. A person's vertical position is their local rank in that ordering among the people near them in time (see Layout). A person whose `birth_country` is missing or not in `order` is placed at the `fallback` country.

## Layout

(Exact constants and formulas live in app.js; this is the shape of it.)

- X axis: birth year mapped linearly to model X between `CANVAS_MIN_YEAR` and `CANVAS_MAX_YEAR`.
- Y axis: local-rank packing, not fixed country bands (`computeVerticalPlacement()`). Each person maps to a key = their country's index in the `regions.json` order. For each person, a Gaussian time kernel (bandwidth `SPREAD_KERNEL_YEARS`) weights everyone nearby in birth year; the person is placed at their weighted rank within that neighbourhood's country ordering (a local CDF in [0, 1]). Because only people actually present nearby count, a country with nobody at that time leaves no vertical gap. The offset from the center line is scaled by a per-person `spread` in [`SPREAD_MIN`, 1] that grows with local density (normalised to the `SPREAD_DENSITY_PCT` percentile): sparse stretches of time collapse everyone toward the center, crowded ones fan out to the full country order. Net effect: a horizontal spindle that stays tight where people are few and flares open where they are many.
- Node diameter scales with the person's `hpi_score` (min-max normalised across the dataset), not rank.
- Cytoscape `preset` layout (no force simulation). Nodes are locked (`autoungrabify: true`).
- After building elements, `resolveOverlaps()` pushes overlapping nodes apart in Y only.

## Key app.js behaviours

- **Zoom-based visibility**: the number of visible people grows as you zoom in. Ranking is viewport-aware: in-view nodes are ranked by `hpi_score` and faded in over a window, with a floor (`MIN_VISIBLE`) so a sparse era never shows up empty. The occupation-group filter and the "show all" toggle also gate visibility. Coalesced onto one animation frame since it follows pan as well as zoom. See `updateNodeVisibility()`.
- **Wheel zoom**: Cytoscape's built-in zoom is disabled (`userZoomingEnabled: false`); a custom `wheel` handler zooms toward the cursor at a gentle rate (`ZOOM_SENSITIVITY`), with `deltaY` normalised across `deltaMode` so mice and trackpads match. Avoids the discouraged `wheelSensitivity` option (which logs a console warning).
- **Labels**: node labels use `display_name` and are held at a fixed screen size regardless of zoom by rescaling `font-size` with `cy.zoom()` on every zoom event.
- **Year grid**: canvas overlay (`position: fixed`, behind the UI, `pointer-events: none`) redrawn on pan/zoom. It starts below the top button bar (`top` offset) and its height also leaves room for the optional era/timeline bar at the bottom (`getBoundingClientRect` does not work for a fixed canvas).
- **Era/timeline bar**: a toggleable SVG ruler; when shown it stays aligned with node X positions during pan/zoom.
- **Click node** (desktop): dims all, highlights the neighbourhood, draws that node's edges, opens the info panel (shows `long_description` and the connection list), and shows the lifespan bar. `clearSelection()` is the single teardown used by the background tap, the reset button, and the info-panel close. On mobile, tap drives the bottom sheet instead (see Mobile).
- **Hover node** (desktop only): shows a tooltip with `short_description` near the cursor, peeks the node's edges, and shows the lifespan bar (hover takes precedence over the current selection via `focusNode()`). The hover handlers early-return on mobile.
- **Lifespan bar**: bottom canvas drawing birth-to-death bars for the focused node and its connected neighbours, aligned to the year axis (`drawLifespanBars()`).
- **Filter panel**: per-group checkboxes (with swatches) toggle which occupation groups are shown, plus check/uncheck-all and a "show all people" override that bypasses the zoom-based reveal.
- **About panel**: dataset attribution (Pantheon).
- **Reset button**: `resetView()` returns to the default framing (centred on year 1500 at a fixed zoom) and clears any selection.

## Mobile (touch)

A `max-width: 700px` media check at load adds a `body.mobile` class, the single source of truth shared by the CSS and `app.js` (`isMobile`). The touch layout rethinks interaction from scratch rather than bolting onto the desktop one:

- **Button bar on top**: the bar lives at the top on every viewport (`order: -1`; the constant is `BAR_H`). On mobile it is taller for touch (`MOBILE_BAR_H`, kept in sync with the `body.mobile` CSS) and drops the timeline button. The year grid, panels, and graph all start below it.
- **Peek-then-expand bottom sheet** replaces hover+click. Tapping a node opens the info panel as a bottom sheet in *peek* state (name, dates, `short_description`); a "Read more" tap, a tap on the grab handle, or a swipe up *expands* it to the full bio, why-they-matter, and connection list. Swipe/handle down collapses then dismisses; a background tap dismisses. The two states are just `sheet-peek`/`sheet-expanded` classes toggled by `setSheetState()`.
- **Disabled on mobile**: drawn edges, the era/timeline bar, the lifespan bar, and the entire hover tier are all off (tight screen, no cursor). Connections are conveyed by the highlighted neighbourhood plus the text connection list in the expanded sheet.
- **Bigger tap targets**: `resetView()` starts at a higher zoom on mobile so visible nodes are large enough to tap. Pinch-to-zoom (two-touch midpoint) and one-finger pan are handled by the container touch handlers / Cytoscape.

## Occupation colors

Each occupation maps to a broad group via the `occupations` map in `data/occupation_groups.json`, and each group has a color in the `groups` map. Unknown occupations fall back to the `Other` group.
