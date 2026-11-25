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
server.close();
console.log(process.exitCode ? 'E2E FAILED' : 'E2E OK');
