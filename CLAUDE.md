# Human History Graph

Interactive browser-based graph of historical figures. People are nodes positioned by birth year (x-axis) and geographic region (y-axis). Edges show relationships (rivalry, influence, patronage, etc.). Built with Cytoscape.js, no backend, no build tools.

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
  people.json       - array of person objects (~80 people, Renaissance era)
  descriptions.json - array of { "id": { short, long, why, personality } }
  relations.json    - array of directed edges between people
  eras.json         - era bands and point events for the timeline ruler
  regions.json      - maps country names to y-band regions
  occupation_groups.json - maps occupations to color groups (see Occupation colors)
design/
  data_plan.md          - full schema docs, layout formulas, implementation notes
  overview.md           - product vision
rules/                  - authoring rules (display_name.md, descriptions.md, connections.md)
test/
  inspect.mjs           - opt-in Playwright behaviour checks (see Browser testing)
```

## Data schemas

See `design/data_plan.md` for full schemas. Short version:

**people.json** - array of objects:
`{ id, name, display_name, birth_year, death_year, occupation, birth_country, hpi_score }`
`display_name` is the shortened label drawn on the graph (rules in `rules/display_name.md`); `name` is the full name shown in the info panel and edge headers.

**descriptions.json** - array of single-key objects (note: NOT a flat map):
`[ { "person_id": { short_description, long_description, why_they_matter, personality } } ]`

**relations.json** - array of directed edges, one per pair (no reverse duplicates, treated as bidirectional by the app):
`{ source_id, target_id, type, strength (0-1), confidence (0-1), reason }`

Valid relation types: `teacher, student, rival, collaborator, patron, family, influence, ally, spouse, romantic, friend, enemy, mentor, successor, predecessor`

**eras.json** - array of era bands and point events, years 1300-1600:
`{ id, label, type: "era"|"event", start_year+end_year OR year, color }`

**regions.json** - keyed object with regions and country map:
```json
{ "regions": { "europe_north": { "label": "...", "y_band": 0.08 }, ... },
  "countries": { "Italy": "europe_south", ... } }
```

Eight regions: `europe_north, europe_west, europe_south, middle_east, asia, africa, americas_north, americas_south`. Unknown countries fall back to `europe_west`.

## Layout

(Exact constants and formulas live in app.js; this is the shape of it.)

- X axis: birth year mapped linearly to model X between `CANVAS_MIN_YEAR` and `CANVAS_MAX_YEAR`.
- Y axis: region `y_band` scaled to the layout height, plus random Y jitter sized from the gap to neighbouring region bands.
- Node diameter scales with the person's HPI rank across the dataset.
- Cytoscape `preset` layout (no force simulation). Nodes are locked (`autoungrabify: true`).
- After building elements, `resolveOverlaps()` pushes overlapping nodes apart in Y only.

## Key app.js behaviours

- **Zoom-based visibility**: the number of visible people grows as you zoom in. Nodes are ranked by `hpi_score` and faded in over a window. See `updateNodeVisibility()` for the exact curve.
- **Wheel zoom**: Cytoscape's built-in zoom is disabled (`userZoomingEnabled: false`); a custom `wheel` handler zooms toward the cursor at a gentle rate (`ZOOM_SENSITIVITY`), with `deltaY` normalised across `deltaMode` so mice and trackpads match. Avoids the discouraged `wheelSensitivity` option (which logs a console warning).
- **Labels**: node labels use `display_name` and are held at a fixed screen size regardless of zoom by rescaling `font-size` with `cy.zoom()` on every zoom event.
- **Year grid**: canvas overlay (`position: fixed`, behind the UI, `pointer-events: none`) redrawn on pan/zoom. Its height accounts for the bottom bar and the optional era/timeline bar (`getBoundingClientRect` does not work for a fixed canvas).
- **Era/timeline bar**: a toggleable SVG ruler; when shown it stays aligned with node X positions during pan/zoom.
- **Click node**: dims all, highlights the neighbourhood, draws that node's edges, opens the info panel (shows `long_description`).
- **Hover node**: shows a tooltip with `short_description` near the cursor and peeks the node's edges.

## Occupation colors

Each occupation maps to a broad group via the `occupations` map in `data/occupation_groups.json`, and each group has a color in the `groups` map. Unknown occupations fall back to the `Other` group.
