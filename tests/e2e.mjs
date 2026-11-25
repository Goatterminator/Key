// End-to-end smoke test: serves the app, walks through every step on an emulated phone,
// downloads the STL and checks that it is a valid closed mesh.
//
//   node tests/e2e.mjs            (needs Playwright with Chromium)
//   SHOTS=dir node tests/e2e.mjs  (also saves screenshots of every step)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = process.env.SHOTS;
if (shots) fs.mkdirSync(shots, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(root, url.endsWith('/') ? url + 'index.html' : url);
  if (!file.startsWith(root) || !fs.existsSync(file)) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;

const fail = (msg) => {
  console.error('FAIL:', msg);
  process.exitCode = 1;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const shot = async (name) => shots && page.screenshot({ path: path.join(shots, name + '.png') });

await page.goto(base);
await page.waitForSelector('#sheet:not([hidden])');
await shot('00-intro');
await page.click('#sheetClose');
await page.waitForSelector('#modeSheet:not([hidden])');
await shot('00b-mode');
await page.click('[data-mode="screen"]');

// calibration
await page.waitForFunction(() => document.body.dataset.step === 'calib');
await shot('01-calib');
const s0 = await page.evaluate(() => app.settings.pxPerMm);
await page.click('#calPlus');
const s1 = await page.evaluate(() => app.settings.pxPerMm);
if (!(Math.abs(s1 - s0 - 0.01) < 1e-9)) fail('calibration +');
await page.click('#calDone');
await page.waitForFunction(() => document.body.dataset.step === 'blade');
await shot('02-blade');

// select the front-edge handle by tapping on it and nudge it
const s = await page.evaluate(() => app.settings.pxPerMm);
const handlePx = (id) =>
  page.evaluate((id) => {
    const h = app.handles().find((q) => q.id === id);
    const f = app.project.frame;
    const a = { ux: Math.sin(f.angle), uy: -Math.cos(f.angle), vx: Math.cos(f.angle), vy: Math.sin(f.angle) };
    const X = f.ox + a.ux * h.x + a.vx * h.y;
    const Y = f.oy + a.uy * h.x + a.vy * h.y;
    return [X * app.settings.pxPerMm, Y * app.settings.pxPerMm];
  }, id);
let [hx, hy] = await handlePx('front');
await page.touchscreen.tap(hx, hy);
await page.waitForFunction(() => app.selected === 'front');
const H0 = await page.evaluate(() => app.project.blade.height);
await page.click('[data-nudge="right"]');
const H1 = await page.evaluate(() => app.project.blade.height);
if (!(Math.abs(H1 - H0 - 0.05) < 1e-6)) fail(`nudge changed height by ${H1 - H0}`);

// drag the shoulder handle with the mouse (relative drag)
[hx, hy] = await handlePx('shoulder');
const L0 = await page.evaluate(() => app.project.blade.length);
await page.mouse.move(hx, hy);
await page.mouse.down();
await page.mouse.move(hx, hy + 2 * s, { steps: 5 });
await page.mouse.up();
const L1 = await page.evaluate(() => app.project.blade.length);
if (!(Math.abs(L1 - L0 - 2) < 0.05)) fail(`shoulder drag: blade length ${L0} -> ${L1}`);
await page.click('#btnUndo');
const L2 = await page.evaluate(() => app.project.blade.length);
if (Math.abs(L2 - L0) > 1e-9) fail('undo');
await shot('03-blade-selected');

// cuts: tap next to the blade five times
await page.click('#btnNext');
await page.waitForFunction(() => document.body.dataset.step === 'cuts');
const cutsPx = await page.evaluate(() => {
  const f = app.project.frame;
  const s = app.settings.pxPerMm;
  const H = app.project.blade.height;
  return [5, 9, 13, 17, 21].map((x, i) => [(f.ox + (H - 1.5 - (i % 3))) * s, (f.oy - x) * s]);
});
for (const [x, y] of cutsPx) await page.touchscreen.tap(x, y);
const n = await page.evaluate(() => app.project.cuts.points.length);
if (n !== 5) fail(`expected 5 cuts, got ${n}`);
await page.click('#btnEven');
await shot('04-cuts');
await page.click('.step-panel[data-step="cuts"] details summary');
await page.waitForSelector('.cut-row');
await shot('04b-cuts-values');

// head
await page.click('#btnNext');
await page.waitForFunction(() => document.body.dataset.step === 'head');
await shot('05-head');

// profile: add two grooves
await page.click('#btnNext');
await page.waitForFunction(() => document.body.dataset.step === 'profile');
await page.click('#btnAddGroove');
await page.click('#btnAddGroove');
const depth = page.locator('.groove-row').nth(1).locator('input[data-k="depth"]');
await depth.fill('0,6');
await depth.press('Enter');
await page.waitForFunction(() => app.project.profile.grooves[1].depth === 0.6);
await shot('06-profile');

// model
await page.click('#btnNext');
await page.waitForFunction(() => document.body.dataset.step === 'model');
await page.waitForSelector('#modelInfo .ok');
await page.waitForTimeout(300);
await shot('07-model');
const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btnStl')]);
const file = await download.path();
const buf = fs.readFileSync(file);
const tris = buf.readUInt32LE(80);
if (buf.length !== 84 + tris * 50) fail('STL size mismatch');
if (tris < 500) fail('too few triangles: ' + tris);
console.log(`STL: ${download.suggestedFilename()} ${tris} triangles, ${buf.length} bytes`);

// reload: project and calibration persist
await page.reload();
await page.waitForFunction(() => document.body.dataset.step === 'model');
const persisted = await page.evaluate(() => [app.project.cuts.points.length, app.settings.calibrated]);
if (persisted[0] !== 5 || !persisted[1]) fail('state not persisted: ' + persisted);

if (errors.length) fail('page errors:\n' + errors.join('\n'));
await browser.close();
console.log(process.exitCode ? 'E2E FAILED' : 'E2E OK');

// ---- the same app inside a claude.ai artifact: saving goes through the viewer -------
{
  const browser2 = await chromium.launch();
  const ctx2 = await browser2.newContext({ ...devices['iPhone 13'] });
  await ctx2.addInitScript(() => {
    window.__saved = [];
    window.claude = {
      use: async (name) =>
        name === 'downloads'
          ? {
              save: async ({ filename, data }) => {
                const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data.buffer ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data);
                window.__saved.push({ filename, bytes: Array.from(bytes) });
                return { status: 'saved' };
              },
            }
          : null,
    };
  });
  const p2 = await ctx2.newPage();
  const errs2 = [];
  p2.on('pageerror', (e) => errs2.push(e.message));
  await p2.goto(base);
  await p2.click('#sheetClose');
  await p2.click('[data-mode="screen"]');
  await p2.click('#calDone');
  await p2.evaluate(() => {
    app.project.cuts.points = [{ x: 5, y: 6 }, { x: 9, y: 5 }];
    app.changed();
  });
  // in-page confirmation replaces confirm()
  await p2.click('#btnMenu');
  await p2.click('[data-menu="new"]');
  await p2.waitForSelector('#confirm:not([hidden])');
  await p2.click('#confirmNo');
  if ((await p2.evaluate(() => app.project.cuts.points.length)) !== 2) fail('cancel in confirm dialog changed the project');
  for (let i = 0; i < 4; i++) await p2.click('#btnNext');
  await p2.waitForSelector('#modelInfo .ok');
  if ((await p2.textContent('#btnStl')).indexOf('ZIP') < 0) fail('artifact mode label');
  await p2.click('#btnStl');
  await p2.waitForFunction(() => window.__saved.length === 1);
  const saved = await p2.evaluate(() => window.__saved[0]);
  if (!saved.filename.endsWith('.zip')) fail('expected a zip, got ' + saved.filename);
  const zip = Buffer.from(saved.bytes);
  const eocd = zip.length - 22;
  const cd = zip.readUInt32LE(eocd + 16);
  const nameLen = zip.readUInt16LE(cd + 28);
  const inner = zip.subarray(cd + 46, cd + 46 + nameLen).toString();
  const stlLen = zip.readUInt32LE(cd + 24);
  const stl = zip.subarray(30 + zip.readUInt16LE(26), 30 + zip.readUInt16LE(26) + stlLen);
  if (!inner.endsWith('.stl') || stl.length !== 84 + stl.readUInt32LE(80) * 50) fail('zip does not hold a valid STL');
  console.log(`artifact mode: ${saved.filename} -> ${inner}, ${stl.readUInt32LE(80)} triangles`);
  await p2.click('#btnSaveJson');
  await p2.waitForFunction(() => window.__saved.length === 2);
  if (errs2.length) fail('artifact page errors:\n' + errs2.join('\n'));
  await browser2.close();
  console.log(process.exitCode ? 'E2E (artifact) FAILED' : 'E2E (artifact) OK');
}

// ---- photo mode: synthetic photo of a known key + card, AI answers simulated ------------
{
  const browser3 = await chromium.launch();
  const ctx3 = await browser3.newContext({ ...devices['iPhone 13'] });
  await ctx3.addInitScript(() => {
    const json = async (prompt) => {
      const T = window.__truth;
      const n = ([x, y], w, h) => [(y / h) * 1000, (x / w) * 1000];
      if (prompt.includes('ID-1 sized card')) {
        return { card: T.card.map((q) => n(q, T.W, T.H)), tip: n(T.tip, T.W, T.H), head_end: n(T.end, T.W, T.H) };
      }
      const { cardTransforms, applyH } = await import('/js/photo.js');
      const { toMm } = cardTransforms(window.app.project.photo.points);
      const crop = window.app.crop;
      const c = (q) => n(crop.geometry.inv(...applyH(toMm, q[0], q[1])), crop.W, crop.H);
      const L = T.lm;
      const hc = crop.geometry.inv(...applyH(toMm, ...L.holeCenter));
      return {
        cuts_side: 'right',
        back_edge: L.back.map(c),
        shoulder: c(L.shoulder),
        blade_width_point: c(L.width),
        tip: c(L.tip),
        tip_slope_notched: c(L.slopeNotched),
        tip_slope_straight: c(L.slopeStraight),
        cuts: L.cuts.map(c),
        head_end: c(L.headEnd),
        head_left: c(L.headLeft),
        head_right: c(L.headRight),
        hole: [((hc[1] - L.holeR) / crop.H) * 1000, ((hc[0] - L.holeR) / crop.W) * 1000, ((hc[1] + L.holeR) / crop.H) * 1000, ((hc[0] + L.holeR) / crop.W) * 1000],
      };
    };
    const sample = async () => ({ text: '' });
    sample.json = json;
    sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 5, maxInputBytes: 2e7, mediaTypes: ['image/jpeg', 'image/png'] } });
    window.claude = { use: async (name) => (name === 'sample' ? sample : null) };
  });
  const p3 = await ctx3.newPage();
  const shot3 = async (name) => shots && p3.screenshot({ path: path.join(shots, name + '.png') });
  const errs3 = [];
  p3.on('pageerror', (e) => errs3.push(e.message));
  await p3.goto(base);
  await p3.click('#sheetClose');
  await p3.click('[data-mode="photo"]');
  await p3.waitForFunction(() => document.body.dataset.step === 'photo');
  await shot3('10-photo-empty');

  // draw the synthetic photo with the app's own geometry code and remember the truth
  const png = await p3.evaluate(async () => {
    const { defaultProject, normalizeProject, keyOutline } = await import('/js/geometry.js');
    const { toScreen } = await import('/js/frame.js');
    const t = defaultProject();
    t.blade = { length: 28.4, height: 8.6, tipY: 3.9, tipTop: 2.7, tipBack: 1.8 };
    t.cuts.points = [4.1, 8.1, 12.1, 16.1, 20.1].map((x, i) => ({ x, y: [6.3, 5.2, 7.1, 4.9, 6.0][i] }));
    t.head = { ...t.head, length: 21, top: 15.9, bottom: -7.3, hole: true, holeX: -15.5, holeY: 4.3, holeD: 4.2 };
    normalizeProject(t);
    const W = 2400, H = 1800, s = 12;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#f2f2ee';
    g.fillRect(0, 0, W, H);
    // card
    const th = 0.12, C0 = [300, 500];
    g.setTransform(s * Math.cos(th), s * Math.sin(th), -s * Math.sin(th), s * Math.cos(th), C0[0], C0[1]);
    g.fillStyle = '#2b6cb0';
    g.beginPath();
    g.roundRect(0, 0, 85.6, 53.98, 3.18);
    g.fill();
    g.setTransform(1, 0, 0, 1, 0, 0);
    const card = [[0, 0], [85.6, 0], [85.6, 53.98], [0, 53.98]].map(([u, v]) => [C0[0] + s * (u * Math.cos(th) - v * Math.sin(th)), C0[1] + s * (u * Math.sin(th) + v * Math.cos(th))]);
    // key
    const f = { ox: 140, oy: 95, angle: -0.08 };
    const P = (x, y) => toScreen(f, x, y).map((v) => v * s);
    const o = keyOutline(t);
    g.fillStyle = '#5a5a5a';
    g.beginPath();
    o.outer.forEach(([x, y], i) => (i ? g.lineTo(...P(x, y)) : g.moveTo(...P(x, y))));
    g.closePath();
    g.fill();
    g.fillStyle = '#f2f2ee';
    g.beginPath();
    g.arc(...P(t.head.holeX, t.head.holeY), (t.head.holeD / 2) * s, 0, Math.PI * 2);
    g.fill();
    const b = t.blade, h = t.head;
    window.__truth = {
      W, H, card,
      tip: P(b.length, b.tipY),
      end: P(-h.length, (h.top + h.bottom) / 2),
      lm: {
        back: [P(b.length - 4, 0), P(2, 0)],
        shoulder: P(0, b.height),
        width: P(1, b.height),
        tip: P(b.length, b.tipY),
        slopeNotched: P(b.length - b.tipTop, b.height),
        slopeStraight: P(b.length - b.tipBack, 0),
        cuts: t.cuts.points.map((q) => P(q.x, q.y)),
        headEnd: P(-h.length, (h.top + h.bottom) / 2),
        headLeft: P(-h.length / 2, h.bottom),
        headRight: P(-h.length / 2, h.top),
        holeCenter: P(h.holeX, h.holeY),
        holeR: h.holeD / 2,
      },
      project: t,
    };
    return c.toDataURL('image/png').split(',')[1];
  });
  await p3.setInputFiles('#photoPick', { name: 'kulcs.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await p3.waitForFunction(() => window.app.project.photo && Math.abs(window.app.project.photo.points.card[0][0] - 300) < 400 && document.getElementById('busy').hidden);
  await p3.waitForTimeout(300);
  await shot3('11-photo-setup');
  await p3.click('#btnNext');
  await p3.waitForFunction(() => document.body.dataset.step === 'blade');
  await p3.waitForTimeout(300);
  await shot3('12-photo-blade');
  const got = await p3.evaluate(() => ({ p: window.app.project, t: window.__truth.project }));
  const near = (a, b, what, tol = 0.02) => Math.abs(a - b) <= tol || fail(`photo ${what}: ${a} vs ${b}`);
  near(got.p.blade.length, got.t.blade.length, 'blade length');
  near(got.p.blade.height, got.t.blade.height, 'blade height');
  near(got.p.blade.tipY, got.t.blade.tipY, 'tip');
  near(got.p.blade.tipTop, got.t.blade.tipTop, 'top chamfer');
  near(got.p.head.length, got.t.head.length, 'head length');
  near(got.p.head.holeX, got.t.head.holeX, 'hole x');
  near(got.p.head.holeD, got.t.head.holeD, 'hole d', 0.1);
  if (got.p.cuts.points.length !== 5) fail('photo cuts: ' + got.p.cuts.points.length);
  got.p.cuts.points.forEach((q, i) => {
    near(q.x, got.t.cuts.points[i].x, 'cut x');
    near(q.y, got.t.cuts.points[i].y, 'cut y');
  });
  console.log(`photo mode: L=${got.p.blade.length.toFixed(3)} (${got.t.blade.length}), cuts ${got.p.cuts.points.map((q) => q.y.toFixed(2)).join(' ')}`);
  // pinch-free zoom with the wheel works on the photo view
  const k0 = await p3.evaluate(() => window.app.cropView.k);
  await p3.mouse.move(195, 300);
  await p3.mouse.wheel(0, -300);
  const k1 = await p3.evaluate(() => window.app.cropView.k);
  if (!(k1 > k0)) fail('wheel zoom on photo');
  await p3.click('#btnNext');
  await p3.click('#btnNext');
  await p3.click('#btnNext');
  await p3.click('#btnNext');
  await p3.waitForSelector('#modelInfo .ok');
  await shot3('13-photo-model');
  if (errs3.length) fail('photo page errors:\n' + errs3.join('\n'));
  await browser3.close();
  console.log(process.exitCode ? 'E2E (photo) FAILED' : 'E2E (photo) OK');
}
server.close();
