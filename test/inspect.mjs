// Verifies: edges hidden until focus; edge width<-strength, opacity<-confidence;
// hover disabled while a node is selected; lifespan rows use the thinner ROW_H.
// Usage: node test/inspect.mjs   (static server must serve project root at :8000)
import { chromium } from 'playwright';

const URL = process.env.URL ?? 'http://localhost:8000';
const ROW_H = 34, PAD_V = 5; // must match drawLifespanBars
const approx = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;
const checks = [];
const check = (name, cond, detail = '') => { checks.push({ name, cond, detail }); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
const consoleMsgs = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => consoleMsgs.push(m.text()));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.cy && window.cy.nodes().length > 0, { timeout: 15000 });

// --- Wheel zoom: no warning, gentle, cursor-anchored ---
check('no wheel-sensitivity warning in console',
  !consoleMsgs.some(t => /wheel sensitivity/i.test(t)), consoleMsgs.find(t => /wheel/i.test(t)) || '');
{
  const cx = 700, cy0 = 400;
  await page.mouse.move(cx, cy0);
  const rect = await page.evaluate(() => {
    const r = window.cy.container().getBoundingClientRect();
    return { left: r.left, top: r.top };
  });
  const rx = cx - rect.left, ry = cy0 - rect.top;
  const pre = await page.evaluate(() => ({ z: window.cy.zoom(), px: window.cy.pan().x, py: window.cy.pan().y }));
  await page.mouse.wheel(0, -100); // scroll up = zoom in
  await page.waitForTimeout(60);
  const post = await page.evaluate(() => ({ z: window.cy.zoom(), px: window.cy.pan().x, py: window.cy.pan().y }));
  const ratio = post.z / pre.z;
  const modelBefore = { x: (rx - pre.px) / pre.z, y: (ry - pre.py) / pre.z };
  const modelAfter  = { x: (rx - post.px) / post.z, y: (ry - post.py) / post.z };
  check('wheel: scroll up zooms in', post.z > pre.z, `ratio=${ratio.toFixed(3)}`);
  check('wheel: gentle (<=1.3x per notch)', ratio > 1 && ratio <= 1.3, `ratio=${ratio.toFixed(3)}`);
  check('wheel: cursor-anchored', approx(modelBefore.x, modelAfter.x, 0.5) && approx(modelBefore.y, modelAfter.y, 0.5),
    `dx=${(modelAfter.x - modelBefore.x).toFixed(3)} dy=${(modelAfter.y - modelBefore.y).toFixed(3)}`);
}

const focus = await page.evaluate(() => {
  const cy = window.cy;
  let best = null, bestDeg = -1;
  cy.nodes().forEach(n => { const d = n.connectedEdges().length; if (d > bestDeg) { bestDeg = d; best = n; } });
  return { id: best.id(), name: best.data('name'), degree: bestDeg };
});

await page.evaluate(() => { window.cy.zoom(0.2); window.cy.center(); });
await page.waitForTimeout(150);

const edgesShown = () => page.evaluate(() =>
  window.cy.edges().filter(e => e.style('display') === 'element').length);

// A different node that is visible in the default zoomed-out state and is NOT
// connected to the focus node. Picked now, before any dimming happens.
const other = await page.evaluate(id => {
  const cy = window.cy;
  const sel = cy.getElementById(id);
  const cand = cy.nodes().filter(n => n.id() !== id && Number(n.style('opacity')) > 0.5
    && sel.edgesWith(n).length === 0).first();
  if (!cand.length) return null;
  const rp = cand.renderedPosition();
  const r = document.getElementById('cy').getBoundingClientRect();
  return { id: cand.id(), x: r.left + rp.x, y: r.top + rp.y };
}, focus.id);
check('found a visible non-neighbor node to hover', other !== null);

// --- Default: no edges ---
check('default: 0 edges drawn', (await edgesShown()) === 0);

// --- Real hover reveals edges with data-driven style ---
const pt = await page.evaluate(id => {
  const rp = window.cy.getElementById(id).renderedPosition();
  const r = document.getElementById('cy').getBoundingClientRect();
  return { x: r.left + rp.x, y: r.top + rp.y };
}, focus.id);
await page.mouse.move(pt.x, pt.y);
await page.waitForTimeout(200);

check('hover: focus edges drawn', (await edgesShown()) === focus.degree, `shown=${await edgesShown()} deg=${focus.degree}`);

const edgeStyles = await page.evaluate(id => {
  const n = window.cy.getElementById(id);
  return n.connectedEdges().map(e => ({
    strength: e.data('strength'), confidence: e.data('confidence'),
    width: parseFloat(e.style('width')), opacity: parseFloat(e.style('opacity')),
    color: e.style('line-color'),
  }));
}, focus.id);
const styleOK = edgeStyles.every(e =>
  approx(e.width, 1 + e.strength * 11, 0.05) &&
  approx(e.opacity, 0.1 + e.confidence * 0.9, 0.02) &&
  e.color !== 'rgb(255,255,255)' && e.color !== '#ffffff');
check('hover: width<-strength, opacity<-confidence, not white', styleOK,
  JSON.stringify(edgeStyles[0]));

await page.screenshot({ path: 'test/after-hover.png' });

// --- Select a node (click): info panel opens; hover disabled for dimmed nodes ---
await page.mouse.click(pt.x, pt.y);
await page.waitForTimeout(200);
const panelOpen = await page.evaluate(() => !document.getElementById('info-panel').hidden);
check('click: info panel open', panelOpen);

// Hover a DIFFERENT visible node; tooltip must stay hidden and focus must not change.
await page.mouse.move(other.x, other.y);
await page.waitForTimeout(200);
const tooltipHidden = await page.evaluate(() => document.getElementById('tooltip').hidden);
const edgesStillFocus = (await edgesShown()) === focus.degree;
check('selected: hover does not show tooltip', tooltipHidden);
check('selected: hover does not change focus edges', edgesStillFocus, `shown=${await edgesShown()}`);

// --- Lifespan canvas uses thinner rows ---
const lif = await page.evaluate(() => {
  const c = document.getElementById('lifespan-canvas');
  return { hidden: c.hidden, height: c.height };
});
const expectedH = PAD_V + (focus.degree + 1) * ROW_H + PAD_V;
check('lifespan: thinner ROW_H applied', !lif.hidden && lif.height === expectedH,
  `height=${lif.height} expected=${expectedH}`);

// --- While selected, hover a FULLY-VISIBLE neighbor: should respond ---
const nb = await page.evaluate(id => {
  const cy = window.cy;
  const sel = cy.getElementById(id);
  const cand = sel.connectedEdges().connectedNodes().not(sel)
    .filter(n => Number(n.style('opacity')) > 0.99).first();
  if (!cand.length) return null;
  const rp = cand.renderedPosition();
  const r = document.getElementById('cy').getBoundingClientRect();
  return { id: cand.id(), deg: cand.connectedEdges().length, x: r.left + rp.x, y: r.top + rp.y };
}, focus.id);
check('found a fully-visible neighbor to hover', nb !== null);
await page.mouse.move(5, 5);
await page.mouse.move(nb.x, nb.y);
await page.waitForTimeout(200);
await page.screenshot({ path: 'test/peek.png' });
const nbTooltip = await page.evaluate(() => !document.getElementById('tooltip').hidden);
const nbEdges = await edgesShown();
check('selected: hover on fully-visible neighbor shows tooltip', nbTooltip);
check('selected: hover on neighbor previews its edges', nbEdges === nb.deg, `shown=${nbEdges} nbDeg=${nb.deg}`);

// Peeked node's edges must look like a clicked node's: data-driven opacity, not dimmed.
const nbEdgeStyles = await page.evaluate(id => {
  const n = window.cy.getElementById(id);
  return n.connectedEdges().map(e => ({
    confidence: e.data('confidence'),
    opacity: parseFloat(e.style('opacity')),
    dimmed: e.hasClass('dimmed'),
  }));
}, nb.id);
const nbEdgesUndimmed = nbEdgeStyles.every(e =>
  !e.dimmed && approx(e.opacity, 0.1 + e.confidence * 0.9, 0.02));
check('selected: peeked node edges are undimmed (match clicked look)', nbEdgesUndimmed,
  JSON.stringify(nbEdgeStyles));

// --- Close panel: hover re-enabled ---
await page.click('#info-close');
await page.waitForTimeout(150);
await page.mouse.move(5, 5);
await page.mouse.move(other.x, other.y);
await page.waitForTimeout(200);
const tooltipBack = await page.evaluate(() => !document.getElementById('tooltip').hidden);
check('after close: hover re-enabled (tooltip shows)', tooltipBack);

await browser.close();

let allPass = errors.length === 0;
for (const c of checks) {
  if (!c.cond) allPass = false;
  console.log(`  ${c.cond ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? '  (' + c.detail + ')' : ''}`);
}
if (errors.length) console.log('  pageerrors: ' + errors.join(' | '));
console.log(allPass ? '\nALL PASS' : '\nFAILURES');
process.exit(allPass ? 0 : 1);
