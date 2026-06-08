const CANVAS_MIN_YEAR = -3200;
const CANVAS_MAX_YEAR = 2000;
const LEFT_MARGIN = 80;
// Scaled up from 20000 by the same ratio as the year span (4000 -> 5200)
// so pixels-per-year, and hence node spacing, stays unchanged.
const LAYOUT_WIDTH  = 26000;
const LAYOUT_HEIGHT = 4000;

// Height of the fixed button bar (matches its CSS height). The bar sits at the
// top; the year grid, info/filter panels, and graph all start below it.
const BAR_H = 44;

// Vertical layout packs each person by their *local rank* in the country order
// (regions.json, top to bottom), not an absolute country band. For a person we
// look at everyone nearby in time (a Gaussian kernel over birth years, bandwidth
// SPREAD_KERNEL_YEARS) and find where they fall in that neighbourhood's
// ordered-by-country list -- a local CDF position in [0, 1]. Because the rank
// counts only people actually present nearby, a country with nobody at that time
// leaves no gap, and the offset from centre is scaled by a per-person `spread`
// in [SPREAD_MIN, 1]: where few people live near a year everyone collapses
// toward the centre line; where many do, they fan out to the full country order.
// The spread tracks local density, normalised to its SPREAD_DENSITY_PCT
// percentile so a few ultra-dense years don't flatten the rest.
const SPREAD_MIN          = 0.06;
const SPREAD_KERNEL_YEARS = 60;
const SPREAD_DENSITY_PCT  = 0.95;

// Candidate spacings (in years) for the vertical grid; drawYearGrid picks the
// smallest one whose on-screen gap clears the label width at the current zoom.
const YEAR_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
const LABEL_SCREEN_PX = 14;

// Single typeface for all rendered text (HTML chrome, canvas grid/lifespan,
// SVG era bar, Cytoscape node labels) so nothing falls back to a stray
// default sans-serif. Mirrors --font-ui in style.css.
const FONT_STACK = "'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";

// Edge colors by relation type. Grouped into a few color families.
const RELATION_BLUE  = '#5b9bd5';
const RELATION_RED   = '#e05a5a';
const RELATION_GREEN = '#5cc98a';
const RELATION_WHITE = '#dddde8';
const RELATION_COLORS = {
  teacher:       RELATION_BLUE,
  mentor:        RELATION_BLUE,
  collaborator:  RELATION_BLUE,
  predecessor:   RELATION_BLUE,
  rival:         RELATION_RED,
  enemy:         RELATION_RED,
  ally:          RELATION_GREEN,
  patron:        RELATION_GREEN,
  friend:        RELATION_GREEN,
  family:        RELATION_WHITE,
  spouse:        RELATION_WHITE,
  romantic:      RELATION_WHITE,
};
const RELATION_DEFAULT_COLOR = '#888888';

function relationColor(type) {
  return RELATION_COLORS[type] ?? RELATION_DEFAULT_COLOR;
}

function yearToX(year, width) {
  return LEFT_MARGIN + (year - CANVAS_MIN_YEAR) / (CANVAS_MAX_YEAR - CANVAS_MIN_YEAR) * (width - LEFT_MARGIN * 2);
}

// Negative years are BC; everything else is shown as a plain number.
function formatYear(year) {
  return year < 0 ? `${-year} BC` : String(year);
}

function niceYearStep(pxPerYear, minPx) {
  for (const s of YEAR_STEPS) {
    if (s * pxPerYear >= minPx) return s;
  }
  return YEAR_STEPS[YEAR_STEPS.length - 1];
}

// Push overlapping nodes apart in Y only (X encodes birth year and is fixed).
// O(n^2) per iteration, up to 300 iterations; fine for the current dataset but
// worth revisiting if `people` grows into the thousands.
function resolveOverlaps(nodes, padding = 8) {
  for (let iter = 0; iter < 300; iter++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const minDist = (a.data.size + b.data.size) / 2 + padding;
        const dx = Math.abs(b.position.x - a.position.x);
        if (dx >= minDist) continue;
        const requiredDy = Math.sqrt(minDist * minDist - dx * dx);
        const dy = b.position.y - a.position.y;
        if (Math.abs(dy) < requiredDy) {
          const push = (requiredDy - Math.abs(dy)) / 2 + 0.5;
          if (dy >= 0) { a.position.y -= push; b.position.y += push; }
          else          { a.position.y += push; b.position.y -= push; }
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
}

// Per-person vertical placement, aligned with `people`. A single O(n^2) pass
// over birth years computes, for each person and weighted by a Gaussian time
// kernel: the local density (-> `spread`), and where the person sits in the
// neighbourhood's country order as a CDF split into `cdfLow` (weighted fraction
// of neighbours ordered before them) and `cdfEq` (weighted fraction in the same
// country, including self). A person's rank position is then somewhere in
// [cdfLow, cdfLow + cdfEq]. `spread` normalises density to a high percentile
// (not the max) so the 19th-century spike doesn't flatten everything else.
function computeVerticalPlacement(people, keys) {
  const years = people.map(p => p.birth_year);
  const n = years.length;
  const density = new Array(n);
  const cdfLow = new Array(n);
  const cdfEq = new Array(n);
  for (let i = 0; i < n; i++) {
    const yi = years[i];
    const ki = keys[i];
    let sum = 0, low = 0, eq = 0;
    for (let j = 0; j < n; j++) {
      const d = (years[j] - yi) / SPREAD_KERNEL_YEARS;
      const wgt = Math.exp(-0.5 * d * d);
      sum += wgt;
      if (keys[j] < ki) low += wgt;
      else if (keys[j] === ki) eq += wgt;
    }
    density[i] = sum;
    cdfLow[i] = low / sum;
    cdfEq[i] = eq / sum;
  }
  const sorted = [...density].sort((a, b) => a - b);
  const cap = sorted[Math.floor(SPREAD_DENSITY_PCT * (n - 1))] || 1;
  const spread = density.map(d => SPREAD_MIN + (1 - SPREAD_MIN) * Math.min(1, d / cap));
  return { cdfLow, cdfEq, spread };
}

function buildElements(people, relations, regions, w, h, colorForOccupation) {
  const hpiMin = Math.min(...people.map(p => p.hpi_score));
  const hpiMax = Math.max(...people.map(p => p.hpi_score));
  const hpiSpan = hpiMax - hpiMin || 1; // avoid divide-by-zero if all HPIs equal

  // Each person maps to a key = their country's position in the regions.json
  // order (top to bottom); missing/unlisted countries fall back to the
  // configured fallback. Keys feed the local-rank vertical layout below.
  const order = regions.order;
  const fallback = regions.fallback ?? order[0];
  const countryIndex = new Map(order.map((c, i) => [c, i]));
  const fallbackIdx = countryIndex.get(fallback);
  const keys = people.map(p =>
    countryIndex.has(p.birth_country) ? countryIndex.get(p.birth_country) : fallbackIdx);

  const { cdfLow, cdfEq, spread } = computeVerticalPlacement(people, keys);

  const nodes = people.map((p, i) => {
    // Rank position within the local country-ordered CDF; the random term
    // spreads same-country contemporaries across their share of the band.
    const r = cdfLow[i] + Math.random() * cdfEq[i];
    const t = (p.hpi_score - hpiMin) / hpiSpan;
    const size = 20 + t * 60;
    return {
      data: {
        id: p.id,
        name: p.name,
        display_name: p.display_name ?? p.name,
        birth_year: p.birth_year,
        death_year: p.death_year,
        occupation: p.occupation,
        birth_country: p.birth_country,
        hpi_score: p.hpi_score,
        color: colorForOccupation(p.occupation),
        size,
      },
      position: {
        x: yearToX(p.birth_year, w),
        y: 0.5 * h + (r - 0.5) * spread[i] * h,
      },
    };
  });

  resolveOverlaps(nodes);

  const nodeIds = new Set(people.map(p => p.id));
  const edges = relations
    .filter(r => r.source_id && r.target_id && nodeIds.has(r.source_id) && nodeIds.has(r.target_id))
    .map(r => ({
      data: {
        id: `${r.source_id}__${r.target_id}`,
        source: r.source_id,
        target: r.target_id,
        type: r.type,
        strength: r.strength,
        confidence: r.confidence,
        reason: r.reason,
      },
    }));

  return [...nodes, ...edges];
}

function drawYearGrid(canvas, cy) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  const zoom = cy.zoom();
  const pan  = cy.pan();

  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.fillStyle   = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.font = `14px ${FONT_STACK}`;
  ctx.textAlign = 'center';

  // Tick spacing adapts to zoom: pick the smallest "nice" step whose on-screen
  // gap leaves room for a year label, then align the first tick to that step.
  const pxPerYear = (LAYOUT_WIDTH - LEFT_MARGIN * 2) / (CANVAS_MAX_YEAR - CANVAS_MIN_YEAR) * zoom;
  const step = niceYearStep(pxPerYear, 70);
  const start = Math.ceil(CANVAS_MIN_YEAR / step) * step;

  for (let year = start; year <= CANVAS_MAX_YEAR; year += step) {
    const screenX = yearToX(year, LAYOUT_WIDTH) * zoom + pan.x;
    if (screenX < 0 || screenX > w) continue;
    ctx.beginPath();
    ctx.moveTo(screenX, 0);
    ctx.lineTo(screenX, h);
    ctx.stroke();
    ctx.fillText(formatYear(year), screenX, h - 6);
  }
}

// The era-bar track assignment and height never change (the `eras` data is
// static), so compute them once here and reuse the result for every pan/zoom
// redraw, which only needs to reposition x coordinates.
function prepareEraLayout(eras) {
  const ROW_H = 20;
  const LABEL_AREA = 16;

  // Assign overlapping era bands to rows via greedy interval scheduling
  const sorted = eras.filter(e => e.type === 'era').sort((a, b) => a.start_year - b.start_year);
  const trackEnds = [];
  const bands = sorted.map(era => {
    let t = trackEnds.findIndex(end => end <= era.start_year);
    if (t === -1) t = trackEnds.length;
    trackEnds[t] = era.end_year;
    return { era, track: t };
  });

  const numTracks = trackEnds.length || 1;
  const totalH = LABEL_AREA + numTracks * ROW_H;
  const events = eras.filter(e => e.type === 'event');
  return { bands, events, totalH, ROW_H, LABEL_AREA };
}

function drawEraBar(layout, svgEl, cy) {
  const { bands, events, totalH, ROW_H, LABEL_AREA } = layout;
  const zoom = cy ? cy.zoom() : 1;
  const panX = cy ? cy.pan().x : 0;
  svgEl.innerHTML = '';
  svgEl.style.height = totalH + 'px';

  const ns = 'http://www.w3.org/2000/svg';
  function el(tag, attrs) {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  }

  function toScreenX(year) {
    return yearToX(year, LAYOUT_WIDTH) * zoom + panX;
  }

  // Era bands
  for (const { era, track } of bands) {
    const x1 = toScreenX(Math.max(era.start_year, CANVAS_MIN_YEAR));
    const x2 = toScreenX(Math.min(era.end_year, CANVAS_MAX_YEAR));
    const y = LABEL_AREA + track * ROW_H;
    svgEl.appendChild(el('rect', { x: x1, y, width: Math.max(0, x2 - x1), height: ROW_H, fill: era.color }));
    const lbl = el('text', { x: x1 + 4, y: y + ROW_H / 2 + 5, fill: '#fff', 'font-size': 13, 'font-family': FONT_STACK, 'pointer-events': 'none' });
    lbl.textContent = era.label;
    svgEl.appendChild(lbl);
  }

  // Events
  for (const era of events) {
    const x = toScreenX(era.year);
    svgEl.appendChild(el('line', { x1: x, y1: 0, x2: x, y2: totalH, stroke: era.color, 'stroke-width': 1.5 }));
    const lbl = el('text', { x: x + 3, y: LABEL_AREA - 4, fill: era.color, 'font-size': 12, 'font-family': FONT_STACK, 'pointer-events': 'none' });
    lbl.textContent = era.label;
    svgEl.appendChild(lbl);
  }

  return totalH;
}

function drawLifespanBars(canvas, cy, selectedNode) {
  const ROW_H = 26;
  const PAD_V = 5;

  const neighbors = selectedNode.connectedEdges().connectedNodes().not(selectedNode);
  const people = [selectedNode, ...neighbors.toArray()];

  const totalH = PAD_V + people.length * ROW_H + PAD_V;
  canvas.width = window.innerWidth;
  canvas.height = totalH;
  canvas.style.height = totalH + 'px';

  const ctx = canvas.getContext('2d');
  const w = canvas.width;

  ctx.fillStyle = 'rgba(12, 12, 28, 0.93)';
  ctx.fillRect(0, 0, w, totalH);

  const zoom = cy.zoom();
  const pan  = cy.pan();

  people.forEach((node, i) => {
    const d = node.data();
    const rowY = PAD_V + i * ROW_H;
    const barY = rowY + 2;
    const barH = ROW_H - 4;

    const x1screen = yearToX(d.birth_year, LAYOUT_WIDTH) * zoom + pan.x;
    const x2screen = yearToX(d.death_year, LAYOUT_WIDTH) * zoom + pan.x;
    const drawX1 = Math.max(2, x1screen);
    const drawX2 = Math.min(w - 2, x2screen);

    if (drawX2 <= drawX1) return;

    const barWidth = drawX2 - drawX1;

    // Bar fill
    ctx.fillStyle = d.color + 'ee';
    ctx.fillRect(drawX1, barY, barWidth, barH);

    // Clip subsequent text to bar bounds
    ctx.save();
    ctx.beginPath();
    ctx.rect(drawX1 + 2, barY, barWidth - 4, barH);
    ctx.clip();
    ctx.lineJoin = 'round';

    function outlineText(text, x, y) {
      ctx.strokeText(text, x, y);
      ctx.fillText(text, x, y);
    }

    const midY = barY + barH / 2;

    // Name — centered in bar
    ctx.font = `15px ${FONT_STACK}`;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 4;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const age = (d.death_year && d.birth_year) ? ` (${d.death_year - d.birth_year})` : '';
    outlineText(d.display_name + age, (drawX1 + drawX2) / 2, midY);

    // Year numbers — left and right ends, only if bar is wide enough
    if (barWidth > 80) {
      ctx.font = `14px ${FONT_STACK}`;
      ctx.lineWidth = 4;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.textBaseline = 'middle';

      if (x1screen >= 2) {
        ctx.textAlign = 'left';
        outlineText(formatYear(d.birth_year), drawX1 + 6, midY);
      }
      if (x2screen <= w - 2) {
        ctx.textAlign = 'right';
        outlineText(formatYear(d.death_year), drawX2 - 6, midY);
      }
    }

    ctx.restore();
  });
}

function showInfoPanel(node, descriptions) {
  const d = node.data();
  const desc = descriptions[d.id] ?? {};

  document.getElementById('info-name').textContent = d.name;
  document.getElementById('info-meta').textContent =
    `${formatYear(d.birth_year)}–${formatYear(d.death_year)} · ${d.occupation} · ${d.birth_country}`;
  document.getElementById('info-short-desc').textContent =
    desc.short_description ?? desc.long_description ?? 'No description available.';
  document.getElementById('info-long-desc').textContent = desc.long_description ?? 'No description available.';

  const whyEl = document.getElementById('info-why-matters');
  whyEl.textContent = desc.why_they_matter ?? '';
  whyEl.hidden = !desc.why_they_matter;

  const list = document.getElementById('info-connections-list');
  list.innerHTML = '';
  node.connectedEdges().forEach(edge => {
    const other = edge.connectedNodes().not(node).first();
    if (!other.length) return;
    const li = document.createElement('li');
    const header = document.createElement('span');
    header.className = 'connection-header';
    header.textContent = `${other.data('name')} — ${edge.data('type')}`;
    li.appendChild(header);
    if (edge.data('reason')) {
      const reason = document.createElement('span');
      reason.className = 'connection-reason';
      reason.textContent = edge.data('reason');
      li.appendChild(reason);
    }
    list.appendChild(li);
  });
  document.getElementById('info-connections').hidden = list.children.length === 0;

  document.getElementById('info-panel').hidden = false;
}

function hideInfoPanel() {
  document.getElementById('info-panel').hidden = true;
}

function createCytoscape(cyEl, elements) {
  return cytoscape({
    container: cyEl,
    elements,
    layout: { name: 'preset' },
    style: [
      {
        selector: 'node',
        style: {
          'background-color': 'data(color)',
          'width': 'data(size)',
          'height': 'data(size)',
          'label': 'data(display_name)',
          'color': '#ffffff',
          'font-family': FONT_STACK,
          'font-size': 10,
          'text-valign': 'center',
          'text-halign': 'center',
          'text-outline-color': '#1a1a2e',
          'text-outline-width': 2,
          'z-index': 'data(hpi_score)',
        },
      },
      {
        selector: 'edge',
        style: {
          'width': 'mapData(strength, 0.5, 0.95, 1, 14)',
          'line-color': ele => relationColor(ele.data('type')),
          'opacity': 'mapData(confidence, 0, 1, 0.1, 1)',
          'curve-style': 'bezier',
          'target-arrow-shape': 'none',
        },
      },
      {
        selector: 'node.no-label',
        style: { 'text-opacity': 0 },
      },
      {
        selector: '.dimmed',
        style: { 'opacity': 0.08 },
      },
      {
        selector: 'node.highlighted',
        style: {
          'border-width': 3,
          'border-color': '#ffffff',
        },
      },
    ],
    userZoomingEnabled: false, // wheel zoom handled manually below
    userPanningEnabled: true,
    boxSelectionEnabled: false,
    autoungrabify: true,
  });
}

// Wire a toggle button + close button to show/hide a panel, keeping the
// toggle's aria-pressed state in sync.
function wireTogglePanel(panel, toggleBtn, closeBtn) {
  toggleBtn.addEventListener('click', () => {
    const show = panel.hidden;
    panel.hidden = !show;
    toggleBtn.setAttribute('aria-pressed', String(show));
  });
  closeBtn.addEventListener('click', () => {
    panel.hidden = true;
    toggleBtn.setAttribute('aria-pressed', 'false');
  });
}

// Height of the top button bar on mobile; must match #bottom-bar height in
// the body.mobile CSS block.
const MOBILE_BAR_H = 52;

async function main() {
  // Touch layout: button bar on top, no era timeline, no drawn edges, and the
  // info panel becomes a peek/expand bottom sheet. Decided once at load.
  const isMobile = window.matchMedia('(max-width: 700px)').matches;
  document.body.classList.toggle('mobile', isMobile);

  const [people, descriptionsRaw, relations, eras, regions, occGroups] = await Promise.all([
    fetch('data/data/people.json').then(r => r.json()),
    fetch('data/data/descriptions.json').then(r => r.json()).catch(() => []),
    fetch('data/data/relations.json').then(r => r.json()),
    fetch('settings/eras.json').then(r => r.json()),
    fetch('settings/regions.json').then(r => r.json()),
    fetch('settings/occupation_groups.json').then(r => r.json()),
  ]);

  const occGroupMap = occGroups.occupations;
  const groupColorMap = Object.fromEntries(
    Object.entries(occGroups.groups).map(([g, v]) => [g, v.color])
  );
  const colorForOccupation = occ => {
    const group = occGroupMap[occ] ?? 'Other';
    return groupColorMap[group] ?? groupColorMap['Other'] ?? '#64748B';
  };

  // Occupation-group filter. All groups start enabled; the right-hand panel
  // toggles which ones are shown. A node passes when its group is active.
  const allGroups = Object.keys(occGroups.groups);
  const activeGroups = new Set(allGroups);
  function nodeGroup(node) {
    return occGroupMap[node.data('occupation')] ?? 'Other';
  }

  // When true, every node in an active group is shown at full opacity,
  // bypassing the zoom-based progressive reveal (the group filter still applies).
  let showAll = false;

  const descriptions = Object.fromEntries(
    descriptionsRaw.map(entry => {
      const [id, data] = Object.entries(entry)[0];
      return [id, data];
    })
  );

  const cyEl = document.getElementById('cy');
  const cy = createCytoscape(
    cyEl,
    buildElements(people, relations, regions, LAYOUT_WIDTH, LAYOUT_HEIGHT, colorForOccupation)
  );

  window.cy = cy;

  function resetView() {
    // Start a touch more zoomed-in on mobile so nodes are large enough to tap.
    const zoom = isMobile ? 0.6 : 0.50;
    const x1500 = yearToX(1500, LAYOUT_WIDTH);
    cy.viewport({
      zoom,
      pan: {
        x: cy.width()  / 2 - x1500 * zoom,
        y: cy.height() / 2 - (LAYOUT_HEIGHT / 2) * zoom,
      },
    });
  }

  resetView();

  // Clamp pan so you can't scroll the data area fully off-screen. At least
  // PAN_MARGIN px of the data region must remain visible on every side.
  const PAN_MARGIN = 80;
  const DATA_X_MIN = LEFT_MARGIN;                  // model x of CANVAS_MIN_YEAR
  const DATA_X_MAX = LAYOUT_WIDTH - LEFT_MARGIN;   // model x of CANVAS_MAX_YEAR
  let _clamping = false;
  function clampPan() {
    if (_clamping) return;
    const zoom = cy.zoom();
    const W = cy.container().offsetWidth;
    const H = cy.container().offsetHeight;
    const { x, y } = cy.pan();
    const nx = Math.max(PAN_MARGIN - DATA_X_MAX * zoom,
                 Math.min(W - PAN_MARGIN - DATA_X_MIN * zoom, x));
    const ny = Math.max(PAN_MARGIN - LAYOUT_HEIGHT * zoom,
                 Math.min(H - PAN_MARGIN, y));
    if (nx !== x || ny !== y) {
      _clamping = true;
      cy.pan({ x: nx, y: ny });
      _clamping = false;
    }
  }
  cy.on('pan', clampPan);

  // Cytoscape's wheelSensitivity option is discouraged (it logs a warning and
  // zooms inconsistently across devices). Instead we disable built-in zoom and
  // handle the wheel ourselves: zoom toward the cursor at a gentle rate, with
  // deltaY normalised to pixels so mice and trackpads behave the same.
  const ZOOM_SENSITIVITY = 0.0015; // lower = slower zoom
  const MIN_ZOOM = 0.07;  // ~full timeline visible on a 1920px screen
  const MAX_ZOOM = 5.0;
  cy.container().addEventListener('wheel', evt => {
    evt.preventDefault();
    const rect = cy.container().getBoundingClientRect();
    let dy = evt.deltaY;
    if (evt.deltaMode === 1) dy *= 16;            // lines -> px
    else if (evt.deltaMode === 2) dy *= rect.height; // pages -> px
    cy.zoom({
      level: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cy.zoom() * Math.exp(-dy * ZOOM_SENSITIVITY))),
      renderedPosition: { x: evt.clientX - rect.left, y: evt.clientY - rect.top },
    });
    clampPan();
  }, { passive: false });

  // Pinch-to-zoom: track two touch points and zoom toward their midpoint.
  let pinchDist = null;
  const container = cy.container();
  container.addEventListener('touchstart', evt => {
    if (evt.touches.length === 2) {
      const t = evt.touches;
      pinchDist = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    }
  }, { passive: true });
  container.addEventListener('touchmove', evt => {
    if (evt.touches.length === 2 && pinchDist !== null) {
      evt.preventDefault();
      const t = evt.touches;
      const newDist = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
      const rect = container.getBoundingClientRect();
      const midX = (t[0].clientX + t[1].clientX) / 2 - rect.left;
      const midY = (t[0].clientY + t[1].clientY) / 2 - rect.top;
      cy.zoom({ level: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cy.zoom() * (newDist / pinchDist))), renderedPosition: { x: midX, y: midY } });
      clampPan();
      pinchDist = newDist;
    }
  }, { passive: false });
  container.addEventListener('touchend', evt => {
    if (evt.touches.length < 2) pinchDist = null;
  }, { passive: true });

  const gridCanvas = document.getElementById('year-grid');
  const lifespanCanvas = document.getElementById('lifespan-canvas');
  const infoPanel = document.getElementById('info-panel');
  let selectedNode = null;
  let hoveredNode = null;

  // Hover takes precedence over selection for what the lifespan bar, edges, and
  // forced visibility focus on.
  function focusNode() { return hoveredNode ?? selectedNode; }

  function refreshLifespan() {
    const node = focusNode();
    // No lifespan bar on mobile: screen space is tight and the bottom sheet
    // owns the bottom of the screen.
    if (node && !isMobile) {
      lifespanCanvas.hidden = false;
      drawLifespanBars(lifespanCanvas, cy, node);
    } else {
      lifespanCanvas.hidden = true;
    }
  }

  // Mobile bottom sheet: 'peek' shows the short description, 'expanded' shows
  // the full bio and connection list.
  function setSheetState(state) {
    infoPanel.classList.toggle('sheet-expanded', state === 'expanded');
    infoPanel.classList.toggle('sheet-peek', state !== 'expanded');
  }

  if (isMobile) {
    const sheetHandle = infoPanel.querySelector('.sheet-handle');
    document.getElementById('sheet-readmore')
      .addEventListener('click', () => setSheetState('expanded'));
    sheetHandle.addEventListener('click', () => {
      setSheetState(infoPanel.classList.contains('sheet-expanded') ? 'peek' : 'expanded');
    });
    // Swipe the handle up to expand; down to collapse, then dismiss.
    let swipeStartY = null;
    sheetHandle.addEventListener('touchstart', e => {
      swipeStartY = e.touches[0].clientY;
    }, { passive: true });
    sheetHandle.addEventListener('touchend', e => {
      if (swipeStartY === null) return;
      const dy = e.changedTouches[0].clientY - swipeStartY;
      swipeStartY = null;
      if (dy < -30) setSheetState('expanded');
      else if (dy > 30) {
        if (infoPanel.classList.contains('sheet-expanded')) setSheetState('peek');
        else clearSelection();
      }
    }, { passive: true });
  }

  // Single teardown for "no node selected": clears highlight/dim classes, drops
  // the focus, hides edges/info, and refreshes the lifespan bar. Order matters:
  // null the focus before updateNodeVisibility so it hides the old node's edges.
  function clearSelection() {
    cy.elements().removeClass('dimmed highlighted');
    selectedNode = null;
    hoveredNode = null;
    updateNodeVisibility();
    hideInfoPanel();
    refreshLifespan();
  }

  const svgEl = document.getElementById('era-bar');
  const eraLayout = prepareEraLayout(eras);
  let eraBarH = 0;
  let eraBarVisible = false;

  function updateLayout() {
    // #era-bar (an inline SVG) has no [hidden] CSS rule, so toggle display directly.
    svgEl.style.display = eraBarVisible ? '' : 'none';
    if (eraBarVisible) {
      eraBarH = drawEraBar(eraLayout, svgEl, cy);
    } else {
      svgEl.innerHTML = '';
      eraBarH = 0;
    }
    // The button bar sits at the top. The graph (and the fixed year-grid
    // overlay aligned to it) starts below the bar; on desktop the toggleable
    // era bar sits at the bottom, where the year-axis labels are. On mobile the
    // era bar is disabled and the info panel is a bottom sheet that owns its own
    // bottom/lifespan positioning, so those are skipped here.
    const barH = isMobile ? MOBILE_BAR_H : BAR_H;
    const topOffset = barH;
    const bottomOffset = eraBarH;
    const h = window.innerHeight - topOffset - bottomOffset;
    gridCanvas.style.top = topOffset + 'px';
    gridCanvas.width  = window.innerWidth;
    gridCanvas.height = h;
    gridCanvas.style.height = h + 'px';
    if (!isMobile) {
      const info = document.getElementById('info-panel');
      const filter = document.getElementById('filter-panel');
      info.style.top = topOffset + 'px';
      info.style.bottom = bottomOffset + 'px';
      filter.style.top = topOffset + 'px';
      filter.style.bottom = bottomOffset + 'px';
      document.getElementById('lifespan-canvas').style.bottom = bottomOffset + 'px';
    }
    drawYearGrid(gridCanvas, cy);
  }

  updateLayout();
  cy.on('pan zoom', () => {
    drawYearGrid(gridCanvas, cy);
    if (eraBarVisible) drawEraBar(eraLayout, svgEl, cy);
    refreshLifespan();
  });

  const toggleEraBtn = document.getElementById('toggle-era-btn');
  toggleEraBtn.addEventListener('click', () => {
    eraBarVisible = !eraBarVisible;
    toggleEraBtn.textContent = eraBarVisible ? 'Hide timeline' : 'Show timeline';
    toggleEraBtn.setAttribute('aria-pressed', String(eraBarVisible));
    updateLayout();
    refreshLifespan();
  });
  window.addEventListener('resize', () => {
    updateLayout();
    refreshLifespan();
  });

  function syncFontSize() {
    cy.nodes().style('font-size', LABEL_SCREEN_PX / cy.zoom());
  }
  syncFontSize();
  cy.on('zoom', syncFontSize);

  cy.on('tap', 'node', evt => {
    const node = evt.target;
    cy.elements().removeClass('highlighted').addClass('dimmed');
    node.closedNeighborhood().removeClass('dimmed');
    node.addClass('highlighted');
    selectedNode = node;
    hoveredNode = null;
    tooltip.hidden = true;
    updateNodeVisibility();
    showInfoPanel(node, descriptions);
    // Mobile: open the sheet in peek (short description) state. Desktop: the
    // info panel is already shown full by showInfoPanel above.
    if (isMobile) setSheetState('peek');
    refreshLifespan();
  });

  cy.on('tap', evt => {
    if (evt.target !== cy) return;
    clearSelection();
  });

  const tooltip = document.getElementById('tooltip');

  // While a node is selected, only fully-visible nodes (the selection's
  // neighbourhood) respond to hover; dimmed nodes stay inert.
  function hoverBlocked(node) {
    return selectedNode && Number(node.style('opacity')) < 0.99;
  }

  cy.on('mouseover', 'node', evt => {
    if (isMobile) return; // no hover tier on touch; tap drives the bottom sheet
    const node = evt.target;
    if (hoverBlocked(node)) return;
    const desc = descriptions[node.data('id')] ?? {};
    tooltip.textContent = desc.short_description ?? 'No description available.';
    tooltip.hidden = false;
    hoveredNode = node;
    updateNodeVisibility();
    refreshLifespan();
  });

  cy.on('mousemove', 'node', evt => {
    if (isMobile) return;
    if (hoverBlocked(evt.target)) return;
    const { clientX, clientY } = evt.originalEvent;
    tooltip.style.left = (clientX + 16) + 'px';
    tooltip.style.top  = (clientY + 16) + 'px';
  });

  cy.on('mouseout', 'node', evt => {
    if (isMobile) return;
    if (hoverBlocked(evt.target)) return;
    tooltip.hidden = true;
    hoveredNode = null;
    updateNodeVisibility();
    refreshLifespan();
  });

  const nodesByHpi = cy.nodes().sort((a, b) => b.data('hpi_score') - a.data('hpi_score'));

  // Visibility is viewport-aware: people are ranked by HPI *within the current
  // view* (not globally), and we always reveal at least MIN_VISIBLE of them so a
  // sparse era never shows up empty. Ranking globally meant low-HPI people in a
  // thin era (e.g. around 1400 BC) never crossed the cutoff, leaving that part
  // of the timeline blank no matter where you looked.
  const MIN_VISIBLE = 50;  // floor on how many in-view people to show (or all, if fewer)
  const FADE_WINDOW = 8;   // nodes just past the cutoff fade out rather than pop
  const VIEW_MARGIN = 0.3; // grow the "in view" box past the screen so nodes appear before scrolling in

  function updateNodeVisibility() {
    const zoom = cy.zoom();

    // Viewport in model coords, padded so nodes fade in slightly before they
    // scroll on-screen (less pop-in while panning).
    const ext = cy.extent();
    const mx = (ext.x2 - ext.x1) * VIEW_MARGIN;
    const my = (ext.y2 - ext.y1) * VIEW_MARGIN;
    const x1 = ext.x1 - mx, x2 = ext.x2 + mx;
    const y1 = ext.y1 - my, y2 = ext.y2 + my;

    // In-view nodes, still in HPI order. Their rank within this set drives the
    // fade, so the most notable people in the current view always win.
    const rankInView = new Map();
    let seen = 0;
    nodesByHpi.forEach(node => {
      if (!activeGroups.has(nodeGroup(node))) return;
      const p = node.position();
      if (p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2) {
        rankInView.set(node.id(), seen++);
      }
    });

    // Reveal at least MIN_VISIBLE of the in-view people, growing toward all of
    // them as you zoom in. When fewer than MIN_VISIBLE are in view, show them all.
    const t = Math.min(1, Math.max(0, (zoom - 0.3) / (2.5 - 0.3)));
    const target = Math.max(MIN_VISIBLE, Math.ceil(seen * t));
    const cutoff = target + FADE_WINDOW;

    // The active (hovered or selected) node forces itself and its neighbours
    // visible regardless of zoom, and is the only node whose edges are drawn.
    const focus = focusNode();
    const forcedIds = new Set(
      focus ? focus.closedNeighborhood().nodes().map(n => n.id()) : []
    );

    // batch() collapses all style writes into one repaint, which keeps
    // rendering consistent across browsers.
    cy.batch(() => {
      nodesByHpi.forEach((node) => {
        const rank = rankInView.get(node.id());
        // Out-of-view nodes (rank === undefined) get opacity 0.
        const zoomOp = rank === undefined
          ? 0
          : showAll ? 1 : Math.min(1, Math.max(0, (cutoff - rank) / FADE_WINDOW));
        // Dimmed (non-neighbourhood) nodes show faintly, but only while in view;
        // out-of-view dimmed nodes stay culled so a selection doesn't render and
        // keep interactive the entire dataset.
        const dimmedOp = node.hasClass('dimmed') ? (rank === undefined ? 0 : 0.08) : zoomOp;
        // A filtered-out group stays hidden regardless of focus or selection.
        const op = !activeGroups.has(nodeGroup(node))
          ? 0
          : forcedIds.has(node.id()) ? 1 : dimmedOp;
        node.style({
          display: 'element',
          opacity: op,
          events: op > 0 ? 'yes' : 'no',
        });
      });

      // Edges stay hidden until a node is focused; then only that node's
      // connections appear (pulling in connected people hidden by zoom).
      // Edges are never drawn on mobile; the highlighted neighbourhood and the
      // lifespan bar carry the connection information there instead.
      cy.edges().style('display', 'none');
      if (focus && !isMobile) {
        // Shown with base edge style: width from strength, opacity from confidence.
        // removeClass('dimmed') so a peeked (hovered) node's edges look the same
        // as a clicked node's, even while a different node is selected.
        focus.connectedEdges().removeClass('dimmed').style('display', 'element');
      }
    });
  }

  // Visibility now depends on pan as well as zoom (it follows the viewport), but
  // pan/zoom fire rapidly during a drag, so coalesce updates onto one frame.
  let visScheduled = false;
  function scheduleVisibility() {
    if (visScheduled) return;
    visScheduled = true;
    requestAnimationFrame(() => { visScheduled = false; updateNodeVisibility(); });
  }

  updateNodeVisibility();
  cy.on('pan zoom', scheduleVisibility);

  // ── Filter panel ──────────────────────────────────────
  const filterPanel = document.getElementById('filter-panel');
  const filterList = document.getElementById('filter-group-list');
  const toggleAllBtn = document.getElementById('filter-toggle-all');
  const toggleFilterBtn = document.getElementById('toggle-filter-btn');
  const showAllCheckbox = document.getElementById('filter-show-all');
  const hideNamesCheckbox = document.getElementById('filter-hide-names');

  showAllCheckbox.addEventListener('change', () => {
    showAll = showAllCheckbox.checked;
    updateNodeVisibility();
  });

  // Hide every node's drawn name (tooltips on hover still show it).
  hideNamesCheckbox.addEventListener('change', () => {
    cy.nodes().toggleClass('no-label', hideNamesCheckbox.checked);
  });

  // One checkbox row per group, each with its swatch color from the data.
  const groupCheckboxes = allGroups.map(group => {
    const li = document.createElement('li');
    const label = document.createElement('label');
    label.style.display = 'contents';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.value = group;

    const swatch = document.createElement('span');
    swatch.className = 'filter-swatch';
    swatch.style.background = groupColorMap[group] ?? '#64748B';

    const text = document.createElement('span');
    text.className = 'filter-label';
    text.textContent = group;

    label.append(checkbox, swatch, text);
    li.appendChild(label);
    filterList.appendChild(li);

    checkbox.addEventListener('change', () => {
      if (checkbox.checked) activeGroups.add(group);
      else activeGroups.delete(group);
      updateToggleAllLabel();
      updateNodeVisibility();
    });
    return checkbox;
  });

  function updateToggleAllLabel() {
    const allOn = groupCheckboxes.every(cb => cb.checked);
    toggleAllBtn.textContent = allOn ? 'Uncheck all' : 'Check all';
  }

  toggleAllBtn.addEventListener('click', () => {
    const turnOn = !groupCheckboxes.every(cb => cb.checked);
    groupCheckboxes.forEach(cb => {
      cb.checked = turnOn;
      if (turnOn) activeGroups.add(cb.value);
      else activeGroups.delete(cb.value);
    });
    updateToggleAllLabel();
    updateNodeVisibility();
  });

  wireTogglePanel(filterPanel, toggleFilterBtn, document.getElementById('filter-close'));

  // ── About panel ───────────────────────────────────────
  wireTogglePanel(
    document.getElementById('about-panel'),
    document.getElementById('toggle-about-btn'),
    document.getElementById('about-close')
  );

  document.getElementById('reset-btn').addEventListener('click', () => {
    resetView();
    clearSelection();
  });

  document.getElementById('info-close').addEventListener('click', () => {
    clearSelection();
  });
}

main().catch(console.error);
