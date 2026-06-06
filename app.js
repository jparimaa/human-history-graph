// Data now spans Hammurabi (~1810 BC) to people born in 1899 AD, with deaths
// reaching ~1988. The axis is padded to round millennia on both ends.
const CANVAS_MIN_YEAR = -2000;
const CANVAS_MAX_YEAR = 2000;
const LEFT_MARGIN = 80;
// Width scaled up with the ~13x larger year span so births don't pile up.
const LAYOUT_WIDTH  = 20000;
const LAYOUT_HEIGHT = 4000;

// Vertical layout "breathes" with how crowded a stretch of time is. Region
// y_bands are treated as offsets from the vertical center (0.5) and scaled by a
// per-person `spread` in [SPREAD_MIN, 1]: where few people live near a year the
// bands collapse toward the center line (contemporaries cluster regardless of
// region); where many do, they fan out to the full-height layout. Europe sits
// near 0.5 so it barely moves (the spine); Asia/Americas have the largest
// offsets so they flare out the most. Local density is a Gaussian kernel over
// birth years (bandwidth SPREAD_KERNEL_YEARS), normalised to its
// SPREAD_DENSITY_PCT percentile so a few ultra-dense years don't flatten the rest.
const SPREAD_MIN          = 0.18;
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

let occGroupMap = {};
let groupColorMap = {};

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

// Random offset in [-up, +down] (y grows downward), used to spread a region's
// people across its band without a hard top/bottom edge.
function bandOffset(span) {
  return Math.random() * (span.up + span.down) - span.up;
}

function occupationColor(occ) {
  const group = occGroupMap[occ] ?? 'Other';
  return groupColorMap[group] ?? groupColorMap['Other'] ?? '#64748B';
}

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

// Per-person vertical spread factor in [SPREAD_MIN, 1], aligned with `people`.
// Density is a Gaussian kernel over birth years; normalising to a high
// percentile (not the max) keeps the 19th-century spike from flattening
// everything else toward the center line.
function computeSpreads(people) {
  const years = people.map(p => p.birth_year);
  const densities = years.map(y0 => {
    let sum = 0;
    for (const y of years) {
      const d = (y - y0) / SPREAD_KERNEL_YEARS;
      sum += Math.exp(-0.5 * d * d);
    }
    return sum;
  });
  const sorted = [...densities].sort((a, b) => a - b);
  const cap = sorted[Math.floor(SPREAD_DENSITY_PCT * (sorted.length - 1))] || 1;
  return densities.map(d => SPREAD_MIN + (1 - SPREAD_MIN) * Math.min(1, d / cap));
}

function buildElements(people, relations, regions, w, h) {
  const hpiMin = Math.min(...people.map(p => p.hpi_score));
  const hpiMax = Math.max(...people.map(p => p.hpi_score));

  // Each region fills the space up to the midpoint with each neighbouring band
  // (so adjacent bands tile with no empty strip between them); BAND_FILL > 1
  // overshoots that midpoint slightly so neighbouring regions mingle a little
  // at their boundaries instead of forming a hard seam. The spread is
  // asymmetric: a band reaches half-way to whichever neighbour it has on each
  // side, so a large band next to a small one still uses its full share.
  const BAND_FILL = 1.12;
  const sortedBands = Object.entries(regions.regions)
    .map(([id, r]) => ({ id, y: r.y_band }))
    .sort((a, b) => a.y - b.y);
  const regionSpan = {};
  sortedBands.forEach((r, i) => {
    const prevGap = i > 0 ? r.y - sortedBands[i - 1].y : 0.08;
    const nextGap = i < sortedBands.length - 1 ? sortedBands[i + 1].y - r.y : 0.08;
    regionSpan[r.id] = {
      up:   prevGap / 2 * h * BAND_FILL,
      down: nextGap / 2 * h * BAND_FILL,
    };
  });

  const spreads = computeSpreads(people);

  const nodes = people.map((p, i) => {
    const regionId = regions.countries[p.birth_country] ?? 'europe_west';
    const yBand = regions.regions[regionId]?.y_band ?? 0.5;
    const span = regionSpan[regionId] ?? { up: 80, down: 80 };
    const spread = spreads[i];
    const t = (p.hpi_score - hpiMin) / (hpiMax - hpiMin);
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
        color: occupationColor(p.occupation),
        size,
      },
      position: {
        x: yearToX(p.birth_year, w),
        y: 0.5 * h + (yBand - 0.5) * h * spread + bandOffset(span) * spread,
      },
    };
  });

  resolveOverlaps(nodes);

  const nodeIds = new Set(people.map(p => p.id));
  const edges = relations
    .filter(r => nodeIds.has(r.source_id) && nodeIds.has(r.target_id))
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

function drawEraBar(eras, svgEl, cy) {
  const ROW_H = 20;
  const LABEL_AREA = 16;
  const zoom = cy ? cy.zoom() : 1;
  const panX = cy ? cy.pan().x : 0;
  const w = svgEl.clientWidth || window.innerWidth;
  svgEl.innerHTML = '';

  const ns = 'http://www.w3.org/2000/svg';
  function el(tag, attrs) {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  }

  // Assign overlapping era bands to rows via greedy interval scheduling
  const bands = eras.filter(e => e.type === 'era').sort((a, b) => a.start_year - b.start_year);
  const trackEnds = [];
  const trackOf = new Map();
  for (const era of bands) {
    let t = trackEnds.findIndex(end => end <= era.start_year);
    if (t === -1) t = trackEnds.length;
    trackOf.set(era.id, t);
    trackEnds[t] = era.end_year;
  }

  const numTracks = trackEnds.length || 1;
  const totalH = LABEL_AREA + numTracks * ROW_H;
  svgEl.style.height = totalH + 'px';

  function toScreenX(year) {
    return yearToX(year, LAYOUT_WIDTH) * zoom + panX;
  }

  // Era bands
  for (const era of bands) {
    const t = trackOf.get(era.id);
    const x1 = toScreenX(Math.max(era.start_year, CANVAS_MIN_YEAR));
    const x2 = toScreenX(Math.min(era.end_year, CANVAS_MAX_YEAR));
    const y = LABEL_AREA + t * ROW_H;
    svgEl.appendChild(el('rect', { x: x1, y, width: Math.max(0, x2 - x1), height: ROW_H, fill: era.color }));
    const lbl = el('text', { x: x1 + 4, y: y + ROW_H / 2 + 5, fill: '#fff', 'font-size': 13, 'font-family': FONT_STACK, 'pointer-events': 'none' });
    lbl.textContent = era.label;
    svgEl.appendChild(lbl);
  }

  // Events
  for (const era of eras.filter(e => e.type === 'event')) {
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
    outlineText(d.name + age, (drawX1 + drawX2) / 2, midY);

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

async function main() {
  const [people, descriptionsRaw, relations, eras, regions, occGroups] = await Promise.all([
    fetch('data/people.json').then(r => r.json()),
    fetch('data/descriptions.json').then(r => r.json()).catch(() => []),
    fetch('data/relations.json').then(r => r.json()),
    fetch('data/eras.json').then(r => r.json()),
    fetch('data/regions.json').then(r => r.json()),
    fetch('data/occupation_groups.json').then(r => r.json()),
  ]);

  occGroupMap = occGroups.occupations;
  groupColorMap = Object.fromEntries(
    Object.entries(occGroups.groups).map(([g, v]) => [g, v.color])
  );

  const descriptions = Object.fromEntries(
    descriptionsRaw.map(entry => {
      const [id, data] = Object.entries(entry)[0];
      return [id, data];
    })
  );

  const cyEl = document.getElementById('cy');

  const cy = cytoscape({
    container: cyEl,
    elements: buildElements(people, relations, regions, LAYOUT_WIDTH, LAYOUT_HEIGHT),
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

  window.cy = cy;
  cy.fit(undefined, 60);

  // Cytoscape's wheelSensitivity option is discouraged (it logs a warning and
  // zooms inconsistently across devices). Instead we disable built-in zoom and
  // handle the wheel ourselves: zoom toward the cursor at a gentle rate, with
  // deltaY normalised to pixels so mice and trackpads behave the same.
  const ZOOM_SENSITIVITY = 0.0015; // lower = slower zoom
  cy.container().addEventListener('wheel', evt => {
    evt.preventDefault();
    const rect = cy.container().getBoundingClientRect();
    let dy = evt.deltaY;
    if (evt.deltaMode === 1) dy *= 16;            // lines -> px
    else if (evt.deltaMode === 2) dy *= rect.height; // pages -> px
    cy.zoom({
      level: cy.zoom() * Math.exp(-dy * ZOOM_SENSITIVITY),
      renderedPosition: { x: evt.clientX - rect.left, y: evt.clientY - rect.top },
    });
  }, { passive: false });

  const gridCanvas = document.getElementById('year-grid');
  const lifespanCanvas = document.getElementById('lifespan-canvas');
  let currentLifespanNode = null;
  let hoverLifespanNode = null;

  function activeLifespanNode() { return hoverLifespanNode ?? currentLifespanNode; }

  function refreshLifespan() {
    const node = activeLifespanNode();
    if (node) {
      lifespanCanvas.hidden = false;
      drawLifespanBars(lifespanCanvas, cy, node);
    } else {
      lifespanCanvas.hidden = true;
    }
  }

  const svgEl = document.getElementById('era-bar');
  let eraBarH = 0;
  let eraBarVisible = false;

  function updateLayout() {
    svgEl.hidden = !eraBarVisible;
    svgEl.style.display = eraBarVisible ? '' : 'none';
    if (eraBarVisible) {
      eraBarH = drawEraBar(eras, svgEl, cy);
    } else {
      svgEl.innerHTML = '';
      eraBarH = 0;
    }
    const bottomOffset = 44 + eraBarH;
    const h = window.innerHeight - bottomOffset;
    gridCanvas.width  = window.innerWidth;
    gridCanvas.height = h;
    gridCanvas.style.height = h + 'px';
    document.getElementById('info-panel').style.bottom = bottomOffset + 'px';
    document.getElementById('lifespan-canvas').style.bottom = bottomOffset + 'px';
    drawYearGrid(gridCanvas, cy);
  }

  updateLayout();
  cy.on('pan zoom', () => {
    drawYearGrid(gridCanvas, cy);
    if (eraBarVisible) drawEraBar(eras, svgEl, cy);
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
    currentLifespanNode = node;
    hoverLifespanNode = null;
    tooltip.hidden = true;
    updateNodeVisibility();
    showInfoPanel(node, descriptions);
    refreshLifespan();
  });

  cy.on('tap', evt => {
    if (evt.target !== cy) return;
    cy.elements().removeClass('dimmed highlighted');
    updateNodeVisibility();
    hideInfoPanel();
    currentLifespanNode = null;
    refreshLifespan();
  });

  const tooltip = document.getElementById('tooltip');

  // While a node is selected, only fully-visible nodes (the selection's
  // neighbourhood) respond to hover; dimmed nodes stay inert.
  function hoverBlocked(node) {
    return currentLifespanNode && Number(node.style('opacity')) < 0.99;
  }

  cy.on('mouseover', 'node', evt => {
    const node = evt.target;
    if (hoverBlocked(node)) return;
    const desc = descriptions[node.data('id')] ?? {};
    tooltip.textContent = desc.short_description ?? 'No description available.';
    tooltip.hidden = false;
    hoverLifespanNode = node;
    updateNodeVisibility();
    refreshLifespan();
  });

  cy.on('mousemove', 'node', evt => {
    if (hoverBlocked(evt.target)) return;
    const { clientX, clientY } = evt.originalEvent;
    tooltip.style.left = (clientX + 16) + 'px';
    tooltip.style.top  = (clientY + 16) + 'px';
  });

  cy.on('mouseout', 'node', evt => {
    if (hoverBlocked(evt.target)) return;
    tooltip.hidden = true;
    hoverLifespanNode = null;
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
    const focusNode = hoverLifespanNode ?? currentLifespanNode;
    const forcedIds = new Set(
      focusNode ? focusNode.closedNeighborhood().nodes().map(n => n.id()) : []
    );

    // batch() collapses all style writes into one repaint, which keeps
    // rendering consistent across browsers.
    cy.batch(() => {
      nodesByHpi.forEach((node) => {
        const rank = rankInView.get(node.id());
        // Out-of-view nodes (rank === undefined) get opacity 0.
        const zoomOp = rank === undefined
          ? 0
          : Math.min(1, Math.max(0, (cutoff - rank) / FADE_WINDOW));
        const op = forcedIds.has(node.id()) ? 1 : (node.hasClass('dimmed') ? 0.08 : zoomOp);
        node.style({
          display: 'element',
          opacity: op,
          events: op > 0 ? 'yes' : 'no',
        });
      });

      // Edges stay hidden until a node is focused; then only that node's
      // connections appear (pulling in connected people hidden by zoom).
      cy.edges().style('display', 'none');
      if (focusNode) {
        // Shown with base edge style: width from strength, opacity from confidence.
        // removeClass('dimmed') so a peeked (hovered) node's edges look the same
        // as a clicked node's, even while a different node is selected.
        focusNode.connectedEdges().removeClass('dimmed').style('display', 'element');
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

  document.getElementById('reset-btn').addEventListener('click', () => {
    cy.elements().removeClass('dimmed highlighted');
    cy.fit();
    updateNodeVisibility();
    hideInfoPanel();
    currentLifespanNode = null;
    refreshLifespan();
  });

  document.getElementById('info-close').addEventListener('click', () => {
    cy.elements().removeClass('dimmed highlighted');
    updateNodeVisibility();
    hideInfoPanel();
    currentLifespanNode = null;
    refreshLifespan();
  });
}

main().catch(console.error);
