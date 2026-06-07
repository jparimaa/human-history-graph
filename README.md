# Human History Graph

An interactive, browser-based graph of historical figures spanning antiquity to ~1900. Each person is a node placed by **birth year** (x-axis) and **geographic region** (y-axis); edges show relationships between them (teacher/student, rival, collaborator, patron, family, influence, and more). Node size reflects historical prominence (HPI score from the Pantheon dataset).

Built with [Cytoscape.js](https://js.cytoscape.org/). No backend, no build step, no framework: just static HTML, CSS, and an ES-module `app.js` reading JSON data files.

## Features

- **Birth-year timeline** with an adaptive year grid that re-labels itself as you zoom (BC/AD aware).
- **Progressive reveal**: the number of visible people grows as you zoom in. Ranking is viewport-aware, so the most prominent figures in the part of history you are looking at always show, and sparse eras never appear empty.
- **Relationships on demand**: hover or click a person to reveal their connections, colour-coded by relationship family.
- **Info panel** with a longer description, why the person matters, and a list of their connections.
- **Lifespan bar**: birth-to-death bars for the selected person and their neighbours, aligned to the timeline.
- **Occupation filter**: toggle which occupation groups (each with its own colour) are shown, or show everyone at once.
- **Era/timeline ruler**: a toggleable bar of historical eras and point events.
- **Smooth cursor-anchored wheel zoom** tuned to behave consistently across mice and trackpads.

## Running locally

The page fetches JSON over HTTP, so it must be served (opening `index.html` via `file://` will not work):

```
python -m http.server 8000
```

Then open http://localhost:8000.

## Project layout

```
index.html          single-page shell
app.js              all application logic (ES module)
style.css           dark theme
data/               people, descriptions, relations, eras, regions, occupation groups (JSON)
rules/              authoring rules for names, descriptions, relations, eras
scripts/            Python helpers for editing and validating the data
test/               opt-in Playwright behaviour checks (inspect.mjs)
```

For data schemas, layout formulas, and the exact behaviour of the visibility/zoom logic, see `CLAUDE.md`.

## Data and attribution

People, birth and death years, and node sizes come from the [Pantheon dataset](https://pantheon.world/data/datasets) (with small modifications).

> Yu, A. Z., et al. (2016). Pantheon 1.0, a manually verified dataset of globally famous biographies. *Scientific Data* 2:150075. doi: 10.1038/sdata.2015.75

Pantheon by Datawheel is licensed under a [Creative Commons Attribution-ShareAlike 4.0 International License](https://creativecommons.org/licenses/by-sa/4.0/).

**AI-generated content.** Display names, descriptions, the relationships between people, and the timeline entries are mostly AI-generated (Claude Code by Anthropic). They likely contain historical errors, many of the claims are debatable, and the data is incomplete: many descriptions and relations are still missing.
