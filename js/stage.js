// The full-screen 2D canvas: calibration card, 1:1 marking view and the profile diagram.
// Everything on the marking view is drawn in real millimetres using the calibration.

import { axes, toScreen } from './frame.js';
import { zRangeAt } from './geometry.js';
import { cutNumber, ROT_ARM } from './handles.js';
import { fmt } from './util.js';

export const CARD_W = 53.98;
export const CARD_H = 85.6;
const CARD_R = 3.18;
const MARK_STEPS = ['blade', 'cuts', 'head'];

const THEMES = {
  light: {
    bg: '#f7f7f3',
    grid: ['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.11)', 'rgba(0,0,0,0.2)'],
    outline: '#e0007a',
    fill: 'rgba(255, 190, 0, 0.42)',
    guide: '#0b5cff',
    handle: '#0b5cff',
    selected: '#ff2d20',
    text: '#30343a',
    dim: 'rgba(0,0,0,0.35)',
    section: '#d6a640',
  },
  dark: {
    bg: '#050505',
    grid: ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.14)', 'rgba(255,255,255,0.26)'],
    outline: '#ff4fb0',
    fill: 'rgba(255, 190, 0, 0.35)',
    guide: '#5c9bff',
    handle: '#5c9bff',
    selected: '#ff5a4f',
    text: '#dfe3e8',
    dim: 'rgba(255,255,255,0.4)',
    section: '#d6a640',
  },
};

export class Stage {
  constructor(canvas, app) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.app = app;
    this.pid = null;
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e, false));
    canvas.addEventListener('pointercancel', (e) => this.up(e, true));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get s() {
    return this.app.settings.pxPerMm;
  }

  get theme() {
    return THEMES[this.app.settings.stageTheme] || THEMES.light;
  }

  /** Pointer position in screen millimetres. */
  mm(e) {
    return [e.clientX / this.s, e.clientY / this.s];
  }

  // ---- interaction ------------------------------------------------------------------------

  down(e) {
    if (this.pid !== null) return; // a second finger or the key itself: ignore
    const app = this.app;
    this.pid = e.pointerId;
    try {
      this.c.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const m = this.mm(e);
    this.start = m;
    this.last = m;
    this.startPx = [e.clientX, e.clientY];
    this.travel = 0;
    this.snap = app.snapshot();
    if (app.step === 'calib') {
      this.mode = 'calib';
      this.s0 = app.settings.pxPerMm;
      return;
    }
    if (!MARK_STEPS.includes(app.step)) {
      this.mode = 'none';
      return;
    }
    const hit = app.hitHandle(m[0], m[1]);
    if (app.moveAll) {
      if (hit && hit.id === 'rotate') {
        app.select('rotate');
        this.mode = 'handle';
      } else {
        this.mode = 'all';
      }
    } else if (hit) {
      app.select(hit.id);
      this.mode = 'handle';
    } else {
      this.mode = app.selected ? 'track' : 'none';
    }
  }

  move(e) {
    if (e.pointerId !== this.pid) return;
    const app = this.app;
    if (this.mode === 'calib') {
      const k = app.fine ? 0.25 : 1;
      this.travel = Math.max(this.travel, Math.hypot(e.clientX - this.startPx[0], e.clientY - this.startPx[1]) / this.s0);
      // the bottom-right corner follows the finger along the card diagonal
      const dx = e.clientX - this.startPx[0];
      const dy = e.clientY - this.startPx[1];
      app.setScale(this.s0 + ((dx * CARD_W + dy * CARD_H) * k) / (CARD_W * CARD_W + CARD_H * CARD_H));
      return;
    }
    const m = this.mm(e);
    const dX = m[0] - this.last[0];
    const dY = m[1] - this.last[1];
    this.last = m;
    this.travel = Math.max(this.travel, Math.hypot(m[0] - this.start[0], m[1] - this.start[1]));
    const k = app.fine ? 0.25 : 1;
    if (this.mode === 'all') app.translateAll(dX * k, dY * k);
    else if (this.mode === 'handle' || this.mode === 'track') app.dragSelected(dX * k, dY * k);
  }

  up(e, cancelled) {
    if (e.pointerId !== this.pid) return;
    this.pid = null;
    const app = this.app;
    if (this.mode === 'calib') {
      app.saveSettings();
      return;
    }
    const tap = !cancelled && this.travel < 1.0;
    if (tap) {
      app.restore(this.snap);
      app.tap(this.mode, this.start);
    } else {
      app.commit(this.snap);
    }
  }

  // ---- drawing ------------------------------------------------------------------------------

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(window.innerWidth * dpr);
    const h = Math.round(window.innerHeight * dpr);
    if (this.c.width !== w || this.c.height !== h) {
      this.c.width = w;
      this.c.height = h;
    }
    this.dpr = dpr;
  }

  draw() {
    this.resize();
    const ctx = this.ctx;
    const th = this.theme;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.app.step === 'calib' || MARK_STEPS.includes(this.app.step) ? th.bg : getComputedStyle(document.body).backgroundColor;
    ctx.fillRect(0, 0, this.c.width, this.c.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); // CSS pixels from here on
    if (this.app.step === 'calib') this.drawCalib(ctx, th);
    else if (MARK_STEPS.includes(this.app.step)) this.drawMarking(ctx, th);
    else if (this.app.step === 'profile') this.drawProfile(ctx);
  }

  drawCalib(ctx, th) {
    const s = this.s;
    const [x0, y0] = this.app.cardOrigin();
    const w = CARD_W * s;
    const h = CARD_H * s;
    const r = CARD_R * s;
    const lw = 2;

    ctx.fillStyle = 'rgba(11, 92, 255, 0.07)';
    roundRect(ctx, x0, y0, w, h, r);
    ctx.fill();

    // frame drawn just outside the card edge
    ctx.strokeStyle = th.guide;
    ctx.lineWidth = lw;
    roundRect(ctx, x0 - lw / 2, y0 - lw / 2, w + lw, h + lw, r + lw / 2);
    ctx.stroke();

    // corner anchor
    ctx.strokeStyle = th.selected;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x0 - 2, y0 + 28);
    ctx.lineTo(x0 - 2, y0 - 2);
    ctx.lineTo(x0 + 28, y0 - 2);
    ctx.stroke();

    // drag hint at the bottom-right corner
    ctx.fillStyle = th.guide;
    ctx.beginPath();
    ctx.arc(x0 + w, y0 + h, 7, 0, Math.PI * 2);
    ctx.fill();

    // mm scale along the top edge: lets you check (or calibrate) with a ruler as well
    ctx.strokeStyle = th.text;
    ctx.fillStyle = th.text;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i * s <= Math.min(w, window.innerWidth - x0); i++) {
      const x = x0 + i * s;
      const len = i % 10 === 0 ? 16 : i % 5 === 0 ? 11 : 6;
      ctx.lineWidth = i % 10 === 0 ? 1.2 : 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y0 + len);
      ctx.stroke();
      if (i % 10 === 0 && i > 0) ctx.fillText(`${i / 10} cm`, x, y0 + 19);
    }
    ctx.textAlign = 'start';

    // ruler along the long side
    ctx.strokeStyle = th.text;
    ctx.fillStyle = th.text;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const rx = x0 + w + 6;
    if (rx + 30 < window.innerWidth) {
      for (let i = 0; i <= CARD_H; i++) {
        const y = y0 + i * s;
        const len = i % 10 === 0 ? 12 : i % 5 === 0 ? 8 : 4;
        ctx.lineWidth = i % 10 === 0 ? 1.2 : 0.8;
        ctx.beginPath();
        ctx.moveTo(rx, y);
        ctx.lineTo(rx + len, y);
        ctx.stroke();
        if (i % 10 === 0 && i > 0 && rx + 30 < window.innerWidth) ctx.fillText(String(i / 10), rx + 14, y);
      }
    }

    ctx.fillStyle = th.text;
    ctx.textAlign = 'center';
    const cx = x0 + w / 2;
    const cy = y0 + Math.min(h / 2, (this.app.visibleRect().bottom - y0) / 2);
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.fillText('Kalibrálás', cx, cy - 64);
    ctx.font = '14px system-ui, sans-serif';
    const lines = [
      'Tegyél ide egy bankkártyát vagy',
      'személyi igazolványt (85,60 × 53,98 mm).',
      'Bal felső sarka a piros sarokhoz kerüljön.',
      'Húzással vagy a −/+ gombokkal állítsd',
      'a kék keretet a kártya széleihez.',
    ];
    lines.forEach((t, i) => ctx.fillText(t, cx, cy - 36 + i * 20));
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.fillStyle = th.guide;
    ctx.fillText(`1 mm = ${fmt(s, 3)} px`, cx, cy + 74);
    ctx.textAlign = 'start';
  }

  drawMarking(ctx, th) {
    const app = this.app;
    const p = app.project;
    const f = p.frame;
    const s = this.s;
    const o = app.outline();
    const a = axes(f.angle);
    const step = app.step;
    const L = p.blade.length;
    const H = p.blade.height;
    const hs = o.head;

    ctx.save();
    ctx.scale(s, s);
    ctx.transform(a.ux, a.uy, a.vx, a.vy, f.ox, f.oy); // model mm from here on

    if (app.settings.grid) this.drawGrid(ctx, th, f);

    const outlinePath = () => {
      ctx.beginPath();
      o.outer.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      if (o.hole) {
        o.hole.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
      }
    };

    // fill: visible only where the outline is bigger than the key
    outlinePath();
    ctx.fillStyle = th.fill;
    ctx.fill('evenodd');

    // outline stroke drawn only outside of the shape, so the inner edge of the line is
    // exactly the marked boundary
    ctx.save();
    ctx.beginPath();
    ctx.rect(-1000, -1000, 2000, 2000);
    o.outer.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    if (o.hole) {
      o.hole.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
    }
    ctx.clip('evenodd');
    outlinePath();
    ctx.strokeStyle = th.outline;
    ctx.lineWidth = Math.max(0.5, 3 / s);
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();

    // guide lines
    const line = (x1, y1, x2, y2, active) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = active ? th.selected : th.guide;
      ctx.lineWidth = (active ? 2 : 1.2) / s;
      ctx.stroke();
    };
    ctx.setLineDash([1.5, 1]);
    const sel = app.selected;
    if (step === 'blade') {
      line(0, hs.hb - 5, 0, hs.ht + 7, sel === 'shoulder');
      line(0, 0, L + ROT_ARM + 3, 0, sel === 'back' || sel === 'rotate');
      line(0, H, L + 7, H, sel === 'front');
      line(L, Math.min(0, p.blade.tipY) - 3, L, Math.max(H, p.blade.tipY) + 3, sel === 'apex');
      if (p.blade.tipTop > 0) line(L - p.blade.tipTop, H - 2.5, L - p.blade.tipTop, H + 2.5, sel === 'chTop');
      if (p.blade.tipBack > 0) line(L - p.blade.tipBack, -2.5, L - p.blade.tipBack, 2.5, sel === 'chBack');
    } else if (step === 'cuts') {
      line(0, H, L + 3, H, false);
      line(0, 0, L + 3, 0, false);
      ctx.setLineDash([0.6, 0.6]);
      p.cuts.points.forEach((q, i) => line(q.x, q.y, q.x, H + 2.2, sel === 'cut:' + i));
    } else if (step === 'head') {
      line(0, hs.hb - 4, 0, hs.ht + 4, false);
      line(-hs.Lh, hs.hb - 3, -hs.Lh, hs.ht + 3, sel === 'headEnd');
      line(-hs.Lh - 3, hs.ht, 3, hs.ht, sel === 'headTop');
      line(-hs.Lh - 3, hs.hb, 3, hs.hb, sel === 'headBottom');
    }
    ctx.setLineDash([]);
    ctx.restore();

    // ---- screen-space overlays (handles, labels) ----
    const toPx = (x, y) => {
      const [X, Y] = toScreen(f, x, y);
      return [X * s, Y * s];
    };
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (step === 'cuts') {
      p.cuts.points.forEach((q, i) => {
        const [lx, ly] = toPx(q.x, H + 3.6);
        ctx.fillStyle = sel === 'cut:' + i ? th.selected : th.handle;
        ctx.fillText(String(cutNumber(p, i)), lx, ly);
      });
    }

    const r = Math.max(7, 1.2 * s);
    for (const h of app.handles()) {
      const [px, py] = toPx(h.x, h.y);
      const active = h.id === sel;
      const dimmed = app.moveAll && h.id !== 'rotate';
      ctx.globalAlpha = dimmed ? 0.35 : 1;
      const col = active ? th.selected : th.handle;
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineWidth = active ? 3 : 2;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.stroke();
      if (active) {
        ctx.globalAlpha = 0.15;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.beginPath();
      ctx.arc(px, py, 1.6, 0, Math.PI * 2);
      ctx.fill();
      if (h.axis === 'rot') {
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, r + 5, -Math.PI * 0.8, -Math.PI * 0.2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(px, py, r + 5, Math.PI * 0.2, Math.PI * 0.8);
        ctx.stroke();
      } else if (h.axis === 'x' || h.axis === 'y') {
        // little arrows showing the drag direction
        const [ax, ay] = h.axis === 'x' ? [a.ux, a.uy] : [a.vx, a.vy];
        for (const sgn of [1, -1]) {
          const tx = px + sgn * ax * (r + 6);
          const ty = py + sgn * ay * (r + 6);
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(tx - sgn * ax * 5 + ay * 4, ty - sgn * ay * 5 - ax * 4);
          ctx.lineTo(tx - sgn * ax * 5 - ay * 4, ty - sgn * ay * 5 + ax * 4);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    if (app.moveAll) {
      const [ox, oy] = toPx(0, 0);
      ctx.strokeStyle = th.selected;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ox - 12, oy);
      ctx.lineTo(ox + 12, oy);
      ctx.moveTo(ox, oy - 12);
      ctx.lineTo(ox, oy + 12);
      ctx.stroke();
    }
    ctx.textAlign = 'start';
  }

  drawGrid(ctx, th, f) {
    // visible model-space bounds
    const W = window.innerWidth / this.s;
    const Hh = window.innerHeight / this.s;
    const a = axes(f.angle);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [X, Y] of [[0, 0], [W, 0], [0, Hh], [W, Hh]]) {
      const dx = X - f.ox;
      const dy = Y - f.oy;
      const x = dx * a.ux + dy * a.uy;
      const y = dx * a.vx + dy * a.vy;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const lw = 1 / this.s;
    for (let pass = 0; pass < 3; pass++) {
      const step = [1, 5, 10][pass];
      ctx.strokeStyle = th.grid[pass];
      ctx.lineWidth = lw * (pass === 2 ? 1.2 : 1);
      ctx.beginPath();
      for (let x = Math.ceil(minX / step) * step; x <= maxX; x += step) {
        if (pass < 2 && Math.round(x) % (pass === 0 ? 5 : 10) === 0) continue;
        ctx.moveTo(x, minY);
        ctx.lineTo(x, maxY);
      }
      for (let y = Math.ceil(minY / step) * step; y <= maxY; y += step) {
        if (pass < 2 && Math.round(y) % (pass === 0 ? 5 : 10) === 0) continue;
        ctx.moveTo(minX, y);
        ctx.lineTo(maxX, y);
      }
      ctx.stroke();
    }
  }

  drawProfile(ctx) {
    const app = this.app;
    const p = app.project;
    const th = THEMES[app.isDark() ? 'dark' : 'light'];
    const { top, bottom } = app.visibleRect();
    const W = window.innerWidth;
    const H = p.blade.height;
    const T = p.profile.thickness;
    const Th = Math.max(p.profile.headThickness, T);
    const availH = bottom - top - 80;
    const availW = W - 70;
    if (availH < 40 || availW < 60) return;
    const k = Math.min(availW / (H + 1), availH / (Th + 0.6), 60);
    const x0 = (W - H * k) / 2;
    const base = top + 46 + (availH - Th * k) / 2 + Th * k; // y of z = 0
    const X = (y) => x0 + y * k;
    const Y = (z) => base - z * k;

    // head thickness (behind the blade)
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = th.dim;
    ctx.lineWidth = 1;
    ctx.strokeRect(X(0), Y(Th), H * k, Th * k);
    ctx.setLineDash([]);

    // blade section
    const ys = new Set([0, H]);
    for (const g of p.profile.grooves) {
      for (const y of [g.from, g.from + g.width]) if (y > 0 && y < H) ys.add(y);
    }
    const br = [...ys].sort((a, b) => a - b);
    const bands = [];
    for (let i = 0; i + 1 < br.length; i++) {
      const [zlo, zhi] = zRangeAt(p, 1, (br[i] + br[i + 1]) / 2);
      bands.push({ y0: br[i], y1: br[i + 1], zlo, zhi });
    }
    ctx.beginPath();
    bands.forEach((b, i) => {
      if (i === 0) ctx.moveTo(X(b.y0), Y(b.zhi));
      else ctx.lineTo(X(b.y0), Y(b.zhi));
      ctx.lineTo(X(b.y1), Y(b.zhi));
    });
    for (let i = bands.length - 1; i >= 0; i--) {
      ctx.lineTo(X(bands[i].y1), Y(bands[i].zlo));
      ctx.lineTo(X(bands[i].y0), Y(bands[i].zlo));
    }
    ctx.closePath();
    ctx.fillStyle = th.section;
    ctx.fill();
    ctx.strokeStyle = th.text;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // groove numbers
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    p.profile.grooves.forEach((g, i) => {
      const yc = Math.min(H, Math.max(0, g.from + g.width / 2));
      const zc = g.side === 'front' ? T + 0.35 : -0.35;
      ctx.fillStyle = th.selected;
      ctx.fillText(String(i + 1), X(yc), Y(zc) + (g.side === 'front' ? -4 : 4));
    });

    // labels
    ctx.fillStyle = th.text;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('ELÖL – a képernyőn felfelé néző oldal', W / 2, Y(Th) - 24);
    ctx.fillText('HÁTUL – a képernyőhöz érő oldal', W / 2, Y(0) + 32);
    ctx.save();
    ctx.translate(X(0) - 16, (Y(0) + Y(T)) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('hátsó él', 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(X(H) + 16, (Y(0) + Y(T)) / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillText('bevágások', 0, 0);
    ctx.restore();
    ctx.fillStyle = th.dim;
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`penge keresztmetszete: ${fmt(H)} × ${fmt(T)} mm (nagyítva)`, W / 2, Y(0) + 52);
    ctx.textAlign = 'start';
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
