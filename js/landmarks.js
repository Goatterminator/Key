// Turns the key landmarks found on the rectified photo crop (in crop millimetres) into the
// project's frame and marks. Pure functions, so they can be tested without a browser.

import { toModel } from './frame.js';
import { normalizeProject } from './geometry.js';

const ok = (q) => Array.isArray(q) && q.length >= 2 && Number.isFinite(q[0]) && Number.isFinite(q[1]);

/**
 * @param {object} p  project (changed in place)
 * @param {object} lm landmarks with every point as [x, y] in crop mm
 * @returns {{cuts: number}} what was found
 */
export function applyLandmarks(p, lm) {
  const back = (lm.back || []).filter(ok).sort((a, b) => a[1] - b[1]); // smaller y = nearer the tip
  if (back.length < 2 || !ok(lm.tip) || !ok(lm.shoulder)) {
    throw new Error('Az AI nem találta meg a penge éleit. Jelöld be kézzel.');
  }
  const Bt = back[0];
  const Bh = back[back.length - 1];
  let ux = Bt[0] - Bh[0];
  let uy = Bt[1] - Bh[1];
  const l = Math.hypot(ux, uy);
  if (l < 3) throw new Error('Az AI által jelölt hátsó él túl rövid. Jelöld be kézzel.');
  ux /= l;
  uy /= l;
  const angle = Math.atan2(ux, -uy);
  const s = (lm.shoulder[0] - Bh[0]) * ux + (lm.shoulder[1] - Bh[1]) * uy;
  const frame = { ox: Bh[0] + ux * s, oy: Bh[1] + uy * s, angle };
  const m = (q) => toModel(frame, q[0], q[1]);

  const [L, tipY] = m(lm.tip);
  if (!(L > 5)) throw new Error('Az AI által jelölt hegy nem jó helyen van. Jelöld be kézzel.');
  const cutsModel = (lm.cuts || []).filter(ok).map(m);
  let H = ok(lm.width) ? m(lm.width)[1] : NaN;
  if (!(H > 2)) H = Math.max(p.blade.height, ...cutsModel.map((c) => c[1] + 1));

  p.frame = frame;
  p.blade.length = L;
  p.blade.height = H;
  p.blade.tipY = tipY;
  p.blade.tipTop = ok(lm.slopeNotched) ? Math.max(0, L - m(lm.slopeNotched)[0]) : p.blade.tipTop;
  p.blade.tipBack = ok(lm.slopeStraight) ? Math.max(0, L - m(lm.slopeStraight)[0]) : p.blade.tipBack;
  p.cuts.points = cutsModel.filter(([x]) => x > 0.2 && x < L - 0.2).map(([x, y]) => ({ x, y: Math.min(H, Math.max(0, y)) }));

  if (ok(lm.headEnd)) {
    const Lh = -m(lm.headEnd)[0];
    if (Lh > 3) p.head.length = Lh;
  }
  const sides = [lm.headLeft, lm.headRight].filter(ok).map((q) => m(q)[1]);
  if (sides.length === 2) {
    p.head.top = Math.max(...sides, H);
    p.head.bottom = Math.min(...sides, 0);
  }
  if (lm.hole && [lm.hole.x0, lm.hole.y0, lm.hole.x1, lm.hole.y1].every(Number.isFinite)) {
    const [hx, hy] = m([(lm.hole.x0 + lm.hole.x1) / 2, (lm.hole.y0 + lm.hole.y1) / 2]);
    const d = (Math.abs(lm.hole.x1 - lm.hole.x0) + Math.abs(lm.hole.y1 - lm.hole.y0)) / 2;
    if (d > 1) {
      p.head.hole = true;
      p.head.holeX = hx;
      p.head.holeY = hy;
      p.head.holeD = d;
    }
  } else if (lm.hole === null) {
    p.head.hole = false;
  }
  normalizeProject(p);
  return { cuts: p.cuts.points.length };
}

/** True when the notched edge is on the left of the back edge (the crop must be mirrored). */
export function cutsOnLeft(lm) {
  const back = (lm.back || []).filter(ok).sort((a, b) => a[1] - b[1]);
  if (back.length < 2 || !ok(lm.width)) return lm.cutsSide === 'left';
  const [Bt, Bh] = [back[0], back[back.length - 1]];
  const ux = Bt[0] - Bh[0];
  const uy = Bt[1] - Bh[1];
  // v = u rotated to the right (screen coordinates, y down)
  const vx = -uy;
  const vy = ux;
  return (lm.width[0] - Bh[0]) * vx + (lm.width[1] - Bh[1]) * vy < 0;
}

/** Template position for a fresh photo without AI: tip at the top margin, head to the end. */
export function placeTemplateOnCrop(p, crop, margin) {
  const L = p.blade.length;
  p.frame = { angle: 0, ox: crop.W / 2 - p.blade.height / 2, oy: margin + L };
  const total = crop.H - 2 * margin;
  if (total - L > 5) p.head.length = total - L;
  p.cuts.points = [];
  normalizeProject(p);
}
