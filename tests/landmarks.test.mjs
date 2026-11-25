import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLandmarks, cutsOnLeft } from '../js/landmarks.js';
import { defaultProject, normalizeProject } from '../js/geometry.js';
import { toScreen } from '../js/frame.js';

function truth() {
  const p = defaultProject();
  p.frame = { ox: 21.3, oy: 48.7, angle: 0.07 };
  p.blade = { length: 28.4, height: 8.6, tipY: 3.9, tipTop: 2.7, tipBack: 1.8 };
  p.cuts.points = [
    { x: 4.1, y: 6.3 },
    { x: 8.1, y: 5.2 },
    { x: 12.1, y: 7.1 },
    { x: 16.1, y: 4.9 },
    { x: 20.1, y: 6.0 },
  ];
  p.head = { ...p.head, length: 21, top: 15.9, bottom: -7.3, hole: true, holeX: -15.5, holeY: 4.3, holeD: 4.2 };
  return normalizeProject(p);
}

function landmarksOf(p) {
  const S = (x, y) => toScreen(p.frame, x, y);
  const b = p.blade;
  const h = p.head;
  const c = S(h.holeX, h.holeY);
  const r = h.holeD / 2;
  return {
    cutsSide: 'right',
    back: [S(b.length - 4, 0), S(2, 0)],
    shoulder: S(0, b.height),
    width: S(1, b.height),
    tip: S(b.length, b.tipY),
    slopeNotched: S(b.length - b.tipTop, b.height),
    slopeStraight: S(b.length - b.tipBack, 0),
    cuts: p.cuts.points.map((q) => S(q.x, q.y)),
    headEnd: S(-h.length, (h.top + h.bottom) / 2),
    headLeft: S(-h.length / 2, h.bottom),
    headRight: S(-h.length / 2, h.top),
    hole: { x0: c[0] - r, y0: c[1] - r, x1: c[0] + r, y1: c[1] + r },
  };
}

test('landmarks are turned back into the original key', () => {
  const t = truth();
  const lm = landmarksOf(t);
  assert.equal(cutsOnLeft(lm), false);
  const p = normalizeProject(defaultProject());
  applyLandmarks(p, lm);
  const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);
  near(p.frame.angle, t.frame.angle);
  near(p.blade.length, t.blade.length);
  near(p.blade.height, t.blade.height);
  near(p.blade.tipY, t.blade.tipY);
  near(p.blade.tipTop, t.blade.tipTop);
  near(p.blade.tipBack, t.blade.tipBack);
  assert.equal(p.cuts.points.length, 5);
  p.cuts.points.forEach((q, i) => {
    near(q.x, t.cuts.points[i].x);
    near(q.y, t.cuts.points[i].y);
  });
  near(p.head.length, t.head.length);
  near(p.head.top, t.head.top);
  near(p.head.bottom, t.head.bottom);
  near(p.head.holeX, t.head.holeX);
  near(p.head.holeD, t.head.holeD, 0.05);
});

test('a mirrored key is detected', () => {
  const lm = landmarksOf(truth());
  const flip = (q) => [100 - q[0], q[1]];
  const m = { ...lm, back: lm.back.map(flip), width: flip(lm.width) };
  assert.equal(cutsOnLeft(m), true);
});

test('missing essentials give a clear error', () => {
  const p = normalizeProject(defaultProject());
  assert.throws(() => applyLandmarks(p, { back: [], cuts: [] }), /kézzel/);
});
