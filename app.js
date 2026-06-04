const CANVAS_MIN_YEAR = 1300;
const CANVAS_MAX_YEAR = 1600;
const LEFT_MARGIN = 80;
const LAYOUT_WIDTH  = 4000;
const LAYOUT_HEIGHT = 4000;
const LABEL_SCREEN_PX = 14;

const OCCUPATION_COLORS = {
  'POLITICIAN':         '#C0392B',
  'RELIGIOUS FIGURE':   '#F39C12',
  'WRITER':             '#2980B9',
  'PHILOSOPHER':        '#7B68EE',
  'PAINTER':            '#E67E22',
  'PHYSICIST':          '#27AE60',
  'COMPOSER':           '#E91E63',
  'MATHEMATICIAN':      '#00BCD4',
  'NOBLEMAN':           '#795548',
  'MILITARY PERSONNEL': '#8E44AD',
  'COMPANION':          '#90A4AE',
  'EXPLORER':           '#16A085',
  'INVENTOR':           '#8BC34A',
  'ASTRONOMER':         '#1565C0',
  'PHYSICIAN':          '#4CAF50',
  'CHEMIST':            '#CDDC39',
  'ARCHITECT':          '#FF7043',
  'BIOLOGIST':          '#2E7D32',
  'HISTORIAN':          '#FF8F00',
  'SOCIAL ACTIVIST':    '#FF5722',
  'ECONOMIST':          '#00ACC1',
  'PSYCHOLOGIST':       '#9C27B0',
  'OTHER':              '#607D8B',
};

function yearToX(year, width) {
  return LEFT_MARGIN + (year - CANVAS_MIN_YEAR) / (CANVAS_MAX_YEAR - CANVAS_MIN_YEAR) * (width - LEFT_MARGIN * 2);
}

function jitter(range) {
  return (Math.random() - 0.5) * 2 * range;
}

function occupationColor(occ) {
  return OCCUPATION_COLORS[occ] ?? OCCUPATION_COLORS['OTHER'];
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

function buildElements(people, relations, regions, w, h) {
  const hpiMin = Math.min(...people.map(p => p.hpi_score));
  const hpiMax = Math.max(...people.map(p => p.hpi_score));

  // Compute per-region jitter span: 75% of half the gap to the nearest neighbour band
  const sortedBands = Object.entries(regions.regions)
    .map(([id, r]) => ({ id, y: r.y_band }))
    .sort((a, b) => a.y - b.y);
  const regionJitter = {};
  sortedBands.forEach((r, i) => {
    const prevGap = i > 0 ? r.y - sortedBands[i - 1].y : 0.08;
    const nextGap = i < sortedBands.length - 1 ? sortedBands[i + 1].y - r.y : 0.08;
    regionJitter[r.id] = Math.min(prevGap, nextGap) / 2 * h;
  });

  const nodes = people.map(p => {
    const regionId = regions.countries[p.birth_country] ?? 'europe_west';
    const yBand = regions.regions[regionId]?.y_band ?? 0.5;
    const span = regionJitter[regionId] ?? 80;
    const t = (p.hpi_score - hpiMin) / (hpiMax - hpiMin);
    const size = 20 + t * 60;
    return {
      data: {
        id: p.id,
        name: p.name,
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
        y: yBand * h + jitter(span),
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
  ctx.fillStyle   = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';

  for (let year = CANVAS_MIN_YEAR; year <= CANVAS_MAX_YEAR; year += 10) {
    const screenX = yearToX(year, LAYOUT_WIDTH) * zoom + pan.x;
    if (screenX < 0 || screenX > w) continue;
    ctx.beginPath();
    ctx.moveTo(screenX, 0);
    ctx.lineTo(screenX, h);
    ctx.stroke();
    ctx.fillText(year, screenX, h - 6);
  }
}

function drawEraBar(eras, svgEl) {
  const w = svgEl.clientWidth;
  const h = svgEl.clientHeight;
  svgEl.innerHTML = '';

  const ns = 'http://www.w3.org/2000/svg';
  function el(tag, attrs) {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  }

  for (const era of eras) {
    if (era.type === 'era') {
      const x1 = yearToX(Math.max(era.start_year, CANVAS_MIN_YEAR), w);
      const x2 = yearToX(Math.min(era.end_year, CANVAS_MAX_YEAR), w);
      svgEl.appendChild(el('rect', { x: x1, y: 0, width: Math.max(0, x2 - x1), height: h, fill: era.color }));
      const t = el('text', { x: x1 + 4, y: h / 2 + 4, fill: '#fff', 'font-size': 10, 'font-family': 'sans-serif', 'pointer-events': 'none' });
      t.textContent = era.label;
      svgEl.appendChild(t);
    } else {
      const x = yearToX(era.year, w);
      svgEl.appendChild(el('line', { x1: x, y1: 0, x2: x, y2: h, stroke: era.color, 'stroke-width': 1.5 }));
      const t = el('text', { x: x + 3, y: h - 6, fill: era.color, 'font-size': 9, 'font-family': 'sans-serif', transform: `rotate(-45 ${x + 3} ${h - 6})`, 'pointer-events': 'none' });
      t.textContent = era.label;
      svgEl.appendChild(t);
    }
  }
}

function drawLifespanBars(canvas, cy, selectedNode) {
  const ROW_H = 52;
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
    const isSelected = node.id() === selectedNode.id();
    const rowY = PAD_V + i * ROW_H;
    const barY = rowY + 4;
    const barH = ROW_H - 8;

    const x1screen = yearToX(d.birth_year, LAYOUT_WIDTH) * zoom + pan.x;
    const x2screen = yearToX(d.death_year, LAYOUT_WIDTH) * zoom + pan.x;
    const drawX1 = Math.max(2, x1screen);
    const drawX2 = Math.min(w - 2, x2screen);

    if (drawX2 <= drawX1) return;

    const barWidth = drawX2 - drawX1;

    // Bar fill
    ctx.fillStyle = d.color + (isSelected ? 'ee' : '55');
    ctx.fillRect(drawX1, barY, barWidth, barH);
    if (isSelected) {
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(drawX1 + 0.75, barY + 0.75, barWidth - 1.5, barH - 1.5);
    }

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
    ctx.font = isSelected ? 'bold 17px sans-serif' : '15px sans-serif';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 4;
    ctx.fillStyle = isSelected ? '#ffffff' : '#ddddee';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    outlineText(d.name, (drawX1 + drawX2) / 2, midY);

    // Year numbers — left and right ends, only if bar is wide enough
    if (barWidth > 80) {
      ctx.font = isSelected ? 'bold 17px sans-serif' : '15px sans-serif';
      ctx.lineWidth = 4;
      ctx.fillStyle = isSelected ? 'rgba(255,255,255,0.9)' : 'rgba(200,200,220,0.75)';
      ctx.textBaseline = 'middle';

      if (x1screen >= 2) {
        ctx.textAlign = 'left';
        outlineText(d.birth_year, drawX1 + 6, midY);
      }
      if (x2screen <= w - 2) {
        ctx.textAlign = 'right';
        outlineText(d.death_year, drawX2 - 6, midY);
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
    `${d.birth_year}–${d.death_year} · ${d.occupation} · ${d.birth_country}`;
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
  const [people, descriptionsRaw, relations, eras, regions] = await Promise.all([
    fetch('data/people.json').then(r => r.json()),
    fetch('data/descriptions.json').then(r => r.json()).catch(() => []),
    fetch('data/relations.json').then(r => r.json()),
    fetch('data/eras.json').then(r => r.json()),
    fetch('data/regions.json').then(r => r.json()),
  ]);

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
          'label': 'data(name)',
          'color': '#ffffff',
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
          'width': 'mapData(strength, 0, 1, 1, 12)',
          'line-color': '#888888',
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
      {
        selector: 'edge.hover-highlighted',
        style: {
          'line-color': '#ffffff',
          'width': 3,
          'opacity': 1,
        },
      },
    ],
    userZoomingEnabled: true,
    userPanningEnabled: true,
    boxSelectionEnabled: false,
    autoungrabify: true,
    wheelSensitivity: 0.05,
  });

  cy.fit(undefined, 60);

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

  function resizeGrid() {
    gridCanvas.width  = window.innerWidth;
    gridCanvas.height = window.innerHeight - 40 - 44;
    drawYearGrid(gridCanvas, cy);
  }
  resizeGrid();
  cy.on('pan zoom', () => {
    drawYearGrid(gridCanvas, cy);
    refreshLifespan();
  });
  window.addEventListener('resize', () => {
    resizeGrid();
    refreshLifespan();
  });

  function syncFontSize() {
    cy.nodes().style('font-size', LABEL_SCREEN_PX / cy.zoom());
  }
  syncFontSize();
  cy.on('zoom', syncFontSize);

  const svgEl = document.getElementById('era-bar');
  drawEraBar(eras, svgEl);
  window.addEventListener('resize', () => drawEraBar(eras, svgEl));

  cy.on('tap', 'node', evt => {
    const node = evt.target;
    cy.elements().removeClass('highlighted').addClass('dimmed');
    node.closedNeighborhood().removeClass('dimmed');
    node.addClass('highlighted');
    updateNodeVisibility();
    showInfoPanel(node, descriptions);
    currentLifespanNode = node;
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

  cy.on('mouseover', 'node', evt => {
    const node = evt.target;
    const desc = descriptions[node.data('id')] ?? {};
    tooltip.textContent = desc.short_description ?? 'No description available.';
    tooltip.hidden = false;
    node.connectedEdges().addClass('hover-highlighted');
    hoverLifespanNode = node;
    refreshLifespan();
  });

  cy.on('mousemove', 'node', evt => {
    const { clientX, clientY } = evt.originalEvent;
    tooltip.style.left = (clientX + 16) + 'px';
    tooltip.style.top  = (clientY + 16) + 'px';
  });

  cy.on('mouseout', 'node', () => {
    tooltip.hidden = true;
    cy.edges().removeClass('hover-highlighted');
    hoverLifespanNode = null;
    refreshLifespan();
  });

  let minDegreeFilter = 0;

  const nodesByHpi = cy.nodes().sort((a, b) => b.data('hpi_score') - a.data('hpi_score'));

  function updateNodeVisibility() {
    const zoom  = cy.zoom();
    const total = nodesByHpi.length;
    const FADE_WINDOW = 8;
    const t = Math.min(1, Math.max(0, (zoom - 0.3) / (2.5 - 0.3)));
    // Offset start by FADE_WINDOW so top nodes are always at full opacity
    const hpiCutoff = 4 + FADE_WINDOW + t * (total - 4);

    nodesByHpi.forEach((node, i) => {
      if (node.degree() < minDegreeFilter) {
        node.style('display', 'none');
        return;
      }

      const zoomOp = Math.min(1, Math.max(0, (hpiCutoff - i) / FADE_WINDOW));

      if (zoomOp <= 0) {
        node.style('display', 'none');
      } else {
        // Inline opacity must be set explicitly — it beats class-based opacity (.dimmed)
        node.style({ display: 'element', opacity: node.hasClass('dimmed') ? 0.08 : zoomOp });
      }
    });
  }

  updateNodeVisibility();
  cy.on('zoom', updateNodeVisibility);

  const slider = document.getElementById('degree-slider');
  const degreeLabel = document.getElementById('degree-value');
  slider.addEventListener('input', () => {
    minDegreeFilter = parseInt(slider.value, 10);
    degreeLabel.textContent = minDegreeFilter;
    updateNodeVisibility();
  });

  document.getElementById('reset-btn').addEventListener('click', () => {
    cy.elements().removeClass('dimmed highlighted');
    minDegreeFilter = 0;
    slider.value = 0;
    degreeLabel.textContent = '0';
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
