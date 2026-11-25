// Key geometry: turns the project description into a 2D outline and a 3D mesh.
// All lengths are millimetres.
//
// Key space (K): x runs along the blade from the shoulder (x = 0) towards the tip, y runs
// across the blade from the straight back edge (y = 0) towards the bitting (cut) edge.
// The head lies at x < 0.
//
// On the phone the key lies tip-up with the cuts facing right. Seen from above, K space is
// the mirror image of that view, so the exported model uses F space = K space with y
// negated. In F space the side of the key that faced up from the screen is the top (+z)
// side and the side that touched the screen sits on the print bed (z = 0).

import { clamp, DEG } from './util.js';
import { extrude25D } from './mesh.js';

export const MIN_MATERIAL = 0.6; // thinnest allowed blade between the two edges (mm)
const SAMPLE_STEP = 0.02; // edge sampling step (mm)

// Strength: the head does not get thicker right at the shoulder (that step would put a
// stress concentration exactly into the most loaded cross-section of the blade). It keeps
// the blade thickness for RAMP_START mm behind the shoulder and then thickens in small
// steps, where the section is already as wide as the head.
export const RAMP_START = 1.0; // mm behind the shoulder
const RAMP_STEP = 0.2; // thickness increment per step (mm)
const HOLE_MARGIN = 1.5; // solid material around the key-ring hole (mm)
const SHOULDER_SOLID = 4; // solid head material behind the shoulder before the hole (mm)

/**
 * Rough in-plane shear strength of 100% infill prints (N/mm²). Used only for the
 * indicative strength estimate, real values depend a lot on the printer and settings.
 */
export const MATERIALS = {
  pla: { name: 'PLA / PLA+', tau: 22, note: 'merev, de rideg: figyelmeztetés nélkül, hirtelen törik' },
  petg: { name: 'PETG', tau: 20, note: 'szívósabb, törés előtt kicsit enged' },
  abs: { name: 'ABS / ASA', tau: 18, note: 'közepes szilárdság' },
  pa: { name: 'Nylon (PA)', tau: 24, note: 'nagyon szívós, nehezen törik' },
  pc: { name: 'PC (polikarbonát)', tau: 30, note: 'erős és szívós' },
  cf: { name: 'PA-CF / PC-CF (szénszálas)', tau: 34, note: 'a legerősebb nyomtatható választás' },
};

export function defaultProject() {
  return {
    v: 1,
    name: 'Kulcs',
    frame: { ox: 30, oy: 75, angle: 0 },
    blade: { length: 30, height: 8.5, tipY: 4, tipTop: 3, tipBack: 1.5 },
    cuts: { style: 'v', angle: 90, flat: 0.5, doubleSided: false, points: [] },
    head: { length: 22, top: 16.75, bottom: -8.25, rFar: 9, rNear: 1, hole: true, holeX: -16.5, holeY: 4.25, holeD: 4.5 },
    profile: { thickness: 2.0, headThickness: 3.2, grooves: [] },
  };
}

const num = (v, d) => (Number.isFinite(+v) ? +v : d);

/** Fills in missing fields and clamps everything into a sane range (in place). */
export function normalizeProject(p) {
  const d = defaultProject();
  p = p && typeof p === 'object' ? p : {};
  p.v = 1;
  p.name = typeof p.name === 'string' ? p.name.slice(0, 60) : d.name;

  const f = (p.frame = { ...d.frame, ...(p.frame || {}) });
  f.ox = num(f.ox, d.frame.ox);
  f.oy = num(f.oy, d.frame.oy);
  f.angle = clamp(num(f.angle, 0), -Math.PI, Math.PI);

  const b = (p.blade = { ...d.blade, ...(p.blade || {}) });
  b.length = clamp(num(b.length, d.blade.length), 5, 90);
  b.height = clamp(num(b.height, d.blade.height), 2, 25);
  b.tipY = clamp(num(b.tipY, d.blade.tipY), 0, b.height);
  b.tipTop = clamp(num(b.tipTop, d.blade.tipTop), 0, b.length * 0.9);
  b.tipBack = clamp(num(b.tipBack, d.blade.tipBack), 0, b.length * 0.9);

  const c = (p.cuts = { ...d.cuts, ...(p.cuts || {}) });
  c.style = c.style === 'free' ? 'free' : 'v';
  c.angle = clamp(num(c.angle, 90), 30, 160);
  c.flat = clamp(num(c.flat, 0.5), 0, 5);
  c.doubleSided = !!c.doubleSided;
  c.points = (Array.isArray(c.points) ? c.points : [])
    .map((q) => ({ x: clamp(num(q && q.x, NaN), 0, b.length), y: clamp(num(q && q.y, NaN), 0, b.height) }))
    .filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y))
    .slice(0, 40);

  const h = (p.head = { ...d.head, ...(p.head || {}) });
  h.length = clamp(num(h.length, d.head.length), 3, 80);
  h.top = clamp(num(h.top, d.head.top), b.height, b.height + 40);
  h.bottom = clamp(num(h.bottom, d.head.bottom), -40, 0);
  h.rFar = clamp(num(h.rFar, d.head.rFar), 0, 40);
  h.rNear = clamp(num(h.rNear, d.head.rNear), 0, 10);
  h.hole = !!h.hole;
  h.holeX = clamp(num(h.holeX, d.head.holeX), -h.length, 0);
  h.holeY = clamp(num(h.holeY, d.head.holeY), h.bottom, h.top);
  h.holeD = clamp(num(h.holeD, d.head.holeD), 1, 20);

  const pr = (p.profile = { ...d.profile, ...(p.profile || {}) });
  pr.thickness = clamp(num(pr.thickness, d.profile.thickness), 0.8, 8);
  pr.headThickness = clamp(num(pr.headThickness, d.profile.headThickness), pr.thickness, 12);
  pr.grooves = (Array.isArray(pr.grooves) ? pr.grooves : [])
    .map((g) => ({
      side: g && g.side === 'back' ? 'back' : 'front',
      from: clamp(num(g && g.from, 1), -2, b.height + 2),
      width: clamp(num(g && g.width, 1), 0.1, b.height + 4),
      depth: clamp(num(g && g.depth, 0.4), 0.05, pr.thickness - 0.2),
    }))
    .slice(0, 12);
  return p;
}

// ---------------------------------------------------------------------------------------
// Bitting (the cut edge)

/** Returns the bitting height function h(x) and the x positions where it has corners. */
export function bitting(p) {
  const H = p.blade.height;
  const pts = p.cuts.points.map((q) => ({ x: q.x, y: q.y })).sort((a, b) => a.x - b.x);
  if (!pts.length) return { h: () => H, breaks: [] };

  if (p.cuts.style === 'free') {
    const h = (x) => {
      if (x <= pts[0].x) return pts[0].y;
      for (let i = 1; i < pts.length; i++) {
        if (x <= pts[i].x) {
          const a = pts[i - 1];
          const b = pts[i];
          const t = b.x - a.x < 1e-9 ? 1 : (x - a.x) / (b.x - a.x);
          return a.y + (b.y - a.y) * t;
        }
      }
      return pts[pts.length - 1].y;
    };
    return { h, breaks: pts.map((q) => q.x) };
  }

  // Standard V cuts: every cut has a flat bottom of width `flat` and flanks with the given
  // included angle. The edge is the lowest of all cut shapes, capped at the blade height.
  const T = Math.tan((p.cuts.angle / 2) * DEG);
  const hw = p.cuts.flat / 2;
  const h = (x) => {
    let y = H;
    for (const k of pts) {
      const v = k.y + Math.max(0, Math.abs(x - k.x) - hw) / T;
      if (v < y) y = v;
    }
    return y;
  };
  const breaks = [];
  for (const k of pts) {
    const reach = hw + (H - k.y) * T;
    breaks.push(k.x - hw, k.x + hw, k.x - reach, k.x + reach);
  }
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      breaks.push((T * (pts[j].y - pts[i].y) + pts[i].x + pts[j].x) / 2);
    }
  }
  return { h, breaks };
}

/** Top (bitting side) and bottom (back side) edge functions of the blade, 0 <= x <= L. */
export function bladeEdges(p) {
  const { length: L, height: H } = p.blade;
  const ya = clamp(p.blade.tipY, 0, H);
  const ct = p.blade.tipTop;
  const cb = p.blade.tipBack;
  const dbl = p.cuts.doubleSided;
  const bit = bitting(p);

  const topCh = (x) => (ct > 1e-6 && x > L - ct ? H + ((ya - H) * (x - (L - ct))) / ct : Infinity);
  const backCh = (x) => (cb > 1e-6 && x > L - cb ? (ya * (x - (L - cb))) / cb : -Infinity);

  const edges = (x) => {
    const hx = bit.h(x);
    const tc = topCh(x);
    const bc = backCh(x);
    let t = Math.min(hx, tc);
    let b = Math.max(dbl ? H - hx : 0, bc);
    const room = (Number.isFinite(tc) ? tc : H) - (Number.isFinite(bc) ? bc : 0);
    const need = Math.min(MIN_MATERIAL, Math.max(0, room));
    if (t - b < need) {
      if (dbl) {
        const m = (t + b) / 2;
        t = m + need / 2;
        b = m - need / 2;
      } else {
        t = b + need;
      }
    }
    return [b, t];
  };

  const xs = [];
  for (let x = 0; x < L; x += SAMPLE_STEP) xs.push(x);
  xs.push(L, L - ct, L - cb, ...bit.breaks);
  const sorted = xs.filter((x) => x >= 0 && x <= L).sort((a, b) => a - b);
  const uniq = [];
  for (const x of sorted) if (!uniq.length || x - uniq[uniq.length - 1] > 1e-7) uniq.push(x);
  if (L - uniq[uniq.length - 1] > 1e-9) uniq.push(L);
  else uniq[uniq.length - 1] = L;

  return { edges, xs: uniq, H, L };
}

function simplifyChain(pts, tol = 0.0005) {
  if (pts.length < 3) return pts.slice();
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const dx = c[0] - a[0];
    const dy = c[1] - a[1];
    const l = Math.hypot(dx, dy);
    const d = l < 1e-12 ? Math.hypot(b[0] - a[0], b[1] - a[1]) : Math.abs((b[0] - a[0]) * dy - (b[1] - a[1]) * dx) / l;
    if (d > tol) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function arcPoints(cx, cy, r, a0, a1) {
  if (r < 1e-6) return [[cx, cy]];
  const n = Math.max(2, Math.ceil((r * Math.abs(a1 - a0)) / 0.3));
  const res = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    res.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return res;
}

/** Signed distance to a rounded box with per-corner radii (negative = inside). */
function sdRoundBox(px, py, cx, cy, hx, hy, rNearTop, rNearBottom, rFar) {
  const x = px - cx;
  const y = py - cy;
  const r = x > 0 ? (y > 0 ? rNearTop : rNearBottom) : rFar;
  const qx = Math.abs(x) - hx + r;
  const qy = Math.abs(y) - hy + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

/** Head dimensions after clamping against the blade. */
export function headShape(p, t0, b0) {
  const hd = p.head;
  const Lh = hd.length;
  const ht = Math.max(hd.top, t0);
  const hb = Math.min(hd.bottom, b0);
  const rnTop = clamp(hd.rNear, 0, Math.min(ht - t0, Lh / 2));
  const rnBot = clamp(hd.rNear, 0, Math.min(b0 - hb, Lh / 2));
  const rf = clamp(hd.rFar, 0, Math.min(Lh - Math.max(rnTop, rnBot), (ht - hb) / 2));
  return { Lh, ht, hb, rnTop, rnBot, rf };
}

/**
 * Builds the key outline in K space.
 * @returns {{outer: number[][], hole: number[][]|null, t0: number, b0: number, warnings: string[], bbox: object}}
 */
export function keyOutline(p) {
  const warnings = [];
  const e = bladeEdges(p);
  const bottom = [];
  const top = [];
  for (const x of e.xs) {
    const [b, t] = e.edges(x);
    bottom.push([x, b]);
    top.push([x, t]);
  }
  const bChain = simplifyChain(bottom);
  const tChain = simplifyChain(top);
  const b0 = bChain[0][1];
  const t0 = tChain[0][1];

  const pts = [];
  const push = (q) => {
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(last[0] - q[0], last[1] - q[1]) > 1e-6) pts.push(q);
  };
  for (const q of bChain) push(q);
  for (let i = tChain.length - 1; i >= 0; i--) push(tChain[i]);

  const hs = headShape(p, t0, b0);
  const { Lh, ht, hb, rnTop, rnBot, rf } = hs;
  push([0, ht - rnTop]);
  for (const q of arcPoints(-rnTop, ht - rnTop, rnTop, 0, Math.PI / 2)) push(q);
  push([-Lh + rf, ht]);
  for (const q of arcPoints(-Lh + rf, ht - rf, rf, Math.PI / 2, Math.PI)) push(q);
  push([-Lh, hb + rf]);
  for (const q of arcPoints(-Lh + rf, hb + rf, rf, Math.PI, Math.PI * 1.5)) push(q);
  push([-rnBot, hb]);
  for (const q of arcPoints(-rnBot, hb + rnBot, rnBot, Math.PI * 1.5, Math.PI * 2)) push(q);
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= 1e-6) pts.pop();

  let hole = null;
  if (p.head.hole) {
    const r = p.head.holeD / 2;
    const { holeX: hx, holeY: hy } = p.head;
    const sd = sdRoundBox(hx, hy, -Lh / 2, (ht + hb) / 2, Lh / 2, (ht - hb) / 2, rnTop, rnBot, rf);
    const limit = holeShoulderLimit(p);
    if (hx + r > -limit) {
      warnings.push(
        `A kulcskarika lyuk túl közel van a vállhoz: a szilárdság miatt legalább ${String(limit.toFixed(1)).replace('.', ',')} mm tömör anyag kell a váll mögött, ezért a lyuk kimarad. Told a fej vége felé.`,
      );
    } else if (sd > -(r + HOLE_MARGIN)) {
      warnings.push('A kulcskarika lyuk nem fér el a fejben (körülötte legalább 1,5 mm anyag kell), ezért kimarad.');
    } else {
      hole = [];
      const n = Math.max(24, Math.ceil((2 * Math.PI * r) / 0.3));
      for (let i = 0; i < n; i++) {
        const a = (-2 * Math.PI * i) / n; // clockwise
        hole.push([hx + r * Math.cos(a), hy + r * Math.sin(a)]);
      }
    }
  }

  let minY = Infinity;
  let maxY = -Infinity;
  for (const q of pts) {
    minY = Math.min(minY, q[1]);
    maxY = Math.max(maxY, q[1]);
  }
  return { outer: pts, hole, t0, b0, head: hs, warnings, bbox: { minX: -Lh, maxX: p.blade.length, minY, maxY } };
}

/** Thickness check of the groove profile; returns an error message or null. */
export function profileProblem(p) {
  const T = p.profile.thickness;
  let front = 0;
  let back = 0;
  for (const g of p.profile.grooves) {
    if (g.side === 'front') front = Math.max(front, g.depth);
    else back = Math.max(back, g.depth);
  }
  if (front + back > T - 0.3) {
    return `A hornyok túl mélyek: az elülső és hátsó oldal legmélyebb hornya együtt legfeljebb ${(T - 0.3).toFixed(2).replace('.', ',')} mm lehet (most ${(front + back).toFixed(2).replace('.', ',')} mm).`;
  }
  return null;
}

/** The stepped thickness transition from the blade to the head. */
export function headRamp(p) {
  const Tb = p.profile.thickness;
  const Th = Math.max(p.profile.headThickness, Tb);
  const dT = Th - Tb;
  if (dT < 1e-6) return { Tb, Th, n: 0, len: 0, start: RAMP_START, end: RAMP_START };
  const n = Math.max(1, Math.ceil(dT / RAMP_STEP - 1e-9));
  const len = clamp(dT * 3, 1, 4);
  return { Tb, Th, n, len, start: RAMP_START, end: RAMP_START + len };
}

/** Distances behind the shoulder where the ramp steps up. */
function rampSteps(ramp) {
  const res = [];
  for (let k = 0; k < ramp.n; k++) res.push(ramp.start + (ramp.len * k) / ramp.n);
  return res;
}

/** Top height of the head at x < 0. */
export function headTop(ramp, x) {
  const d = -x;
  if (ramp.n === 0 || d <= ramp.start) return ramp.Tb;
  if (d >= ramp.end) return ramp.Th;
  const k = Math.min(ramp.n, Math.ceil(((d - ramp.start) / ramp.len) * ramp.n - 1e-9));
  return ramp.Tb + ((ramp.Th - ramp.Tb) * k) / ramp.n;
}

/** The key-ring hole must stay at least this far behind the shoulder (mm). */
export function holeShoulderLimit(p) {
  const ramp = headRamp(p);
  return Math.max(SHOULDER_SOLID, ramp.n ? ramp.end + HOLE_MARGIN : 0);
}

/** Height ranges [bottom, top] in F space for a point of the blade (x >= 0) or head. */
export function zRangeAt(p, x, yK) {
  const Tb = p.profile.thickness;
  if (x < 0) return [0, headTop(headRamp(p), x)];
  let front = 0;
  let back = 0;
  for (const g of p.profile.grooves) {
    if (yK > g.from && yK < g.from + g.width) {
      if (g.side === 'front') front = Math.max(front, g.depth);
      else back = Math.max(back, g.depth);
    }
  }
  return [back, Tb - front];
}

/** Keeps a partition line clear of outline vertices (avoids exact vertex hits). */
function clearOf(v, verts, axis) {
  for (let guard = 0; guard < 20; guard++) {
    if (!verts.some((q) => Math.abs(q[axis] - v) < 1e-4)) break;
    v -= 3e-4;
  }
  return v;
}

function grooveLines(p, outline) {
  const ys = [];
  const verts = outline.outer;
  for (const g of p.profile.grooves) ys.push(g.from, g.from + g.width);
  const res = [];
  for (let y of ys) {
    // Keep partition lines clear of outline vertices to avoid collinear overlaps.
    if (y <= 1e-3) y = -1e-3;
    for (let guard = 0; guard < 20; guard++) {
      if (!verts.some((q) => Math.abs(q[1] - y) < 1e-4)) break;
      y += 3e-4;
    }
    if (!res.some((v) => Math.abs(v - y) < 1e-6)) res.push(y);
  }
  return res;
}

/**
 * Builds the printable mesh (F space, z = 0 on the print bed).
 * @returns {{positions: Float32Array, indices: Uint32Array, outline: object, warnings: string[], size: number[]}}
 */
export function keyMesh(p) {
  const problem = profileProblem(p);
  if (problem) throw new Error(problem);
  const o = keyOutline(p);
  const outerF = o.outer.map(([x, y]) => [x, -y]).reverse();
  const loops = [outerF];
  if (o.hole) loops.push(o.hole.map(([x, y]) => [x, -y]).reverse());
  const parts = [
    [
      [0, -o.b0],
      [0, -o.t0],
    ],
  ];
  const xmax = p.blade.length + 1;
  for (const y of grooveLines(p, o)) {
    parts.push([
      [0, -y],
      [xmax, -y],
    ]);
  }
  const ramp = headRamp(p);
  for (const d of rampSteps(ramp)) {
    const x = clearOf(-d, o.outer, 0);
    parts.push([
      [x, -(o.head.hb - 1)],
      [x, -(o.head.ht + 1)],
    ]);
  }
  const res = extrude25D(loops, parts, (x, yF) => zRangeAt(p, x, -yF));

  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  const P = res.positions;
  for (let i = 0; i < P.length; i += 3) {
    minX = Math.min(minX, P[i]);
    maxX = Math.max(maxX, P[i]);
    minY = Math.min(minY, P[i + 1]);
    maxY = Math.max(maxY, P[i + 1]);
    minZ = Math.min(minZ, P[i + 2]);
    maxZ = Math.max(maxZ, P[i + 2]);
  }
  return { ...res, outline: o, warnings: o.warnings, size: [maxX - minX, maxY - minY, maxZ - minZ] };
}

// ---------------------------------------------------------------------------------------
// Strength estimate

/** Torsional properties of the blade cross-section at x (thin-strip approximation). */
function sectionAt(p, x, b, t) {
  const ys = [b, t];
  for (const g of p.profile.grooves) {
    for (const y of [g.from, g.from + g.width]) if (y > b && y < t) ys.push(y);
  }
  ys.sort((a, c) => a - c);
  let sum = 0;
  let tmax = 0;
  let area = 0;
  for (let i = 0; i + 1 < ys.length; i++) {
    const w = ys[i + 1] - ys[i];
    if (w <= 1e-9) continue;
    const [lo, hi] = zRangeAt(p, Math.max(x, 0), (ys[i] + ys[i + 1]) / 2);
    const th = hi - lo;
    if (th <= 0) continue;
    sum += (w * th ** 3) / 3;
    tmax = Math.max(tmax, th);
    area += w * th;
  }
  const W = t - b;
  const J = sum * Math.max(0.3, 1 - (0.63 * tmax) / Math.max(W, 1e-6));
  return { J, tmax, area, width: W };
}

/**
 * Indicative torsion strength of the blade. The torque from the head is handed over to
 * the lock gradually along the blade, so a cross-section near the shoulder carries more
 * of it than one near the tip; the weakest point is the one with the lowest capacity
 * relative to the share of the torque it has to carry.
 */
export function strengthReport(p, materialKey = 'petg') {
  const mat = MATERIALS[materialKey] || MATERIALS.petg;
  const e = bladeEdges(p);
  const L = p.blade.length;
  const end = Math.max(0, L - Math.max(p.blade.tipTop, p.blade.tipBack, 1));
  let worst = null;
  for (let x = 0; x <= end + 1e-9; x += 0.05) {
    const [b, t] = e.edges(x);
    const sec = sectionAt(p, x, b, t);
    if (!(sec.J > 0)) continue;
    const cap = (mat.tau * sec.J) / sec.tmax; // N·mm
    const share = Math.max(0.15, 1 - x / L);
    const eff = cap / share;
    if (!worst || eff < worst.eff) worst = { x, b, t, cap, eff, area: sec.area };
  }
  if (!worst) return null;
  const effNm = worst.eff / 1000;
  return {
    x: worst.x,
    b: worst.b,
    t: worst.t,
    height: worst.t - worst.b,
    area: worst.area,
    capacityNm: worst.cap / 1000,
    effectiveNm: effNm,
    rating: effNm >= 0.3 ? 'good' : effNm >= 0.15 ? 'ok' : 'weak',
    material: mat,
  };
}
