// 2.5D mesher.
//
// Builds a closed, watertight triangle mesh for a solid whose footprint is a planar
// region (an outer loop plus optional holes) that partition segments split into cells.
// Every cell is a vertical prism between its own bottom and top height. A key with a
// thicker head and milled grooves along the blade is exactly such a solid, so this lets
// us produce a clean STL without a general CSG library.
//
// Outline:
//   1. Split the loop edges and partition segments at all their intersections.
//   2. Keep the partition pieces that lie inside the region and build a planar graph.
//   3. Walk the graph faces: those are the cells (holes are attached to their cell).
//   4. Ask zRange(x, y) for the height range of every cell.
//   5. Emit top and bottom faces per cell plus vertical walls wherever the material on
//      the two sides of an edge differs. Wall polygons are subdivided at every height
//      level used around their end vertices, so the mesh has no T-junctions.

import earcut from '../vendor/earcut.js';

const SNAP = 1e5; // points are merged on a 10 nm grid
const TOL = 1e-6; // geometric tolerance (mm)
const ZTOL = 1e-7; // tolerance between height levels (mm)

/**
 * @param {Array<Array<[number, number]>>} loops  loops[0] is the outer boundary (CCW),
 *        the others are holes (CW). Loops must be simple and must not touch each other.
 * @param {Array<[[number, number], [number, number]]>} partitions  straight segments that
 *        split the region into cells. They may extend outside the region.
 * @param {(x: number, y: number) => [number, number]} zRange  bottom/top height of the
 *        cell that contains the given (interior) point.
 * @returns {{positions: Float32Array, indices: Uint32Array, cellCount: number}}
 */
export function extrude25D(loops, partitions, zRange) {
  const vx = [];
  const vy = [];
  const vHole = [];
  const vmap = new Map();

  const vid = (x, y, hole) => {
    const key = Math.round(x * SNAP) + ':' + Math.round(y * SNAP);
    let id = vmap.get(key);
    if (id === undefined) {
      id = vx.length;
      vx.push(x);
      vy.push(y);
      vHole.push(!!hole);
      vmap.set(key, id);
    }
    return id;
  };

  // ---- 1. segments ------------------------------------------------------------------
  const segs = [];
  const addSeg = (a, b, boundary, hole) => {
    const ida = vid(a[0], a[1], hole);
    const idb = vid(b[0], b[1], hole);
    if (ida === idb) return;
    segs.push({ ax: vx[ida], ay: vy[ida], bx: vx[idb], by: vy[idb], ida, idb, boundary, hole, cuts: [] });
  };
  loops.forEach((loop, li) => {
    for (let i = 0; i < loop.length; i++) addSeg(loop[i], loop[(i + 1) % loop.length], true, li > 0);
  });
  for (const [a, b] of partitions) addSeg(a, b, false, false);

  const splitAtPoint = (S, id) => {
    const rx = S.bx - S.ax;
    const ry = S.by - S.ay;
    const l2 = rx * rx + ry * ry;
    const t = ((vx[id] - S.ax) * rx + (vy[id] - S.ay) * ry) / l2;
    const e = TOL / Math.sqrt(l2);
    if (t > e && t < 1 - e) S.cuts.push([t, id]);
  };

  const intersect = (A, B) => {
    if (
      Math.max(A.ax, A.bx) < Math.min(B.ax, B.bx) - TOL ||
      Math.min(A.ax, A.bx) > Math.max(B.ax, B.bx) + TOL ||
      Math.max(A.ay, A.by) < Math.min(B.ay, B.by) - TOL ||
      Math.min(A.ay, A.by) > Math.max(B.ay, B.by) + TOL
    ) {
      return;
    }
    const rx = A.bx - A.ax;
    const ry = A.by - A.ay;
    const sx = B.bx - B.ax;
    const sy = B.by - B.ay;
    const lr = Math.hypot(rx, ry);
    const ls = Math.hypot(sx, sy);
    const qx = B.ax - A.ax;
    const qy = B.ay - A.ay;
    const den = rx * sy - ry * sx;
    if (Math.abs(den) <= 1e-12 * lr * ls) {
      // Parallel. Only collinear overlaps matter: split both at each other's endpoints.
      if (Math.abs(qx * ry - qy * rx) / lr > TOL) return;
      splitAtPoint(A, B.ida);
      splitAtPoint(A, B.idb);
      splitAtPoint(B, A.ida);
      splitAtPoint(B, A.idb);
      return;
    }
    const t = (qx * sy - qy * sx) / den;
    const u = (qx * ry - qy * rx) / den;
    const et = TOL / lr;
    const eu = TOL / ls;
    if (t < -et || t > 1 + et || u < -eu || u > 1 + eu) return;
    let id;
    if (t <= et) id = A.ida;
    else if (t >= 1 - et) id = A.idb;
    else if (u <= eu) id = B.ida;
    else if (u >= 1 - eu) id = B.idb;
    else id = vid(A.ax + t * rx, A.ay + t * ry, A.hole || B.hole);
    if (t > et && t < 1 - et) A.cuts.push([t, id]);
    if (u > eu && u < 1 - eu) B.cuts.push([u, id]);
  };

  for (let i = 0; i < segs.length; i++) {
    if (segs[i].boundary) continue;
    for (let j = 0; j < segs.length; j++) {
      if (j === i || (!segs[j].boundary && j < i)) continue;
      intersect(segs[i], segs[j]);
    }
  }

  // ---- 2. planar graph ----------------------------------------------------------------
  const edges = new Map();
  const ekey = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a);
  const partEdges = [];
  for (const S of segs) {
    S.cuts.sort((p, q) => p[0] - q[0]);
    const chain = [S.ida, ...S.cuts.map((c) => c[1]), S.idb];
    for (let k = 0; k + 1 < chain.length; k++) {
      const a = chain[k];
      const b = chain[k + 1];
      if (a === b) continue;
      if (S.boundary) edges.set(ekey(a, b), { a, b, boundary: true });
      else partEdges.push([a, b]);
    }
  }
  for (const [a, b] of partEdges) {
    const k = ekey(a, b);
    if (edges.has(k)) continue;
    if (!insideRegion((vx[a] + vx[b]) / 2, (vy[a] + vy[b]) / 2, loops)) continue;
    edges.set(k, { a, b, boundary: false });
  }

  // Remove dangling partition pieces (they would not bound any cell).
  const degree = new Map();
  const bump = (v, d) => degree.set(v, (degree.get(v) || 0) + d);
  for (const e of edges.values()) {
    bump(e.a, 1);
    bump(e.b, 1);
  }
  for (let changed = true; changed; ) {
    changed = false;
    for (const [k, e] of edges) {
      if (e.boundary || (degree.get(e.a) > 1 && degree.get(e.b) > 1)) continue;
      edges.delete(k);
      bump(e.a, -1);
      bump(e.b, -1);
      changed = true;
    }
  }

  const nbr = new Map();
  const link = (a, b) => {
    if (!nbr.has(a)) nbr.set(a, []);
    nbr.get(a).push(b);
  };
  for (const e of edges.values()) {
    link(e.a, e.b);
    link(e.b, e.a);
  }
  for (const [v, list] of nbr) {
    const ang = new Map(list.map((w) => [w, Math.atan2(vy[w] - vy[v], vx[w] - vx[v])]));
    list.sort((p, q) => ang.get(p) - ang.get(q));
  }

  // ---- 3. faces -------------------------------------------------------------------------
  const M = vx.length;
  const visited = new Set();
  const cycles = [];
  for (const e of edges.values()) {
    for (const [s, t] of [
      [e.a, e.b],
      [e.b, e.a],
    ]) {
      if (visited.has(s * M + t)) continue;
      const cyc = [];
      let a = s;
      let b = t;
      let guard = 0;
      do {
        visited.add(a * M + b);
        cyc.push(a);
        const list = nbr.get(b);
        const c = list[(list.indexOf(a) - 1 + list.length) % list.length];
        a = b;
        b = c;
        if (++guard > 1e6) throw new Error('Mesh: face walk did not close');
      } while (a !== s || b !== t);
      cycles.push(cyc);
    }
  }

  const ringArea = (r) => {
    let s = 0;
    for (let i = 0; i < r.length; i++) {
      const j = (i + 1) % r.length;
      s += vx[r[i]] * vy[r[j]] - vx[r[j]] * vy[r[i]];
    }
    return s / 2;
  };

  const cells = [];
  const holeRings = [];
  for (const cyc of cycles) {
    const area = ringArea(cyc);
    const allHole = cyc.every((v) => vHole[v]);
    if (area > 0) {
      if (!allHole) cells.push({ outer: cyc, holes: [], area });
    } else if (allHole) {
      holeRings.push(cyc);
    }
  }
  for (const h of holeRings) {
    const px = vx[h[0]];
    const py = vy[h[0]];
    let best = null;
    for (const c of cells) {
      if ((!best || c.area < best.area) && pointInRing(px, py, c.outer, vx, vy)) best = c;
    }
    if (best) best.holes.push(h);
  }

  // ---- 4. triangulate cells & sample their heights --------------------------------------
  const triArea = (a, b, c) => ((vx[b] - vx[a]) * (vy[c] - vy[a]) - (vx[c] - vx[a]) * (vy[b] - vy[a])) / 2;

  for (const c of cells) {
    c.rings = [c.outer, ...c.holes];
    const flat = [];
    const ids = [];
    const holeIdx = [];
    c.rings.forEach((r, ri) => {
      if (ri > 0) holeIdx.push(ids.length);
      for (const v of r) {
        flat.push(vx[v], vy[v]);
        ids.push(v);
      }
    });
    const tri = earcut(flat, holeIdx.length ? holeIdx : null, 2);
    let tris = [];
    for (let k = 0; k < tri.length; k += 3) tris.push([ids[tri[k]], ids[tri[k + 1]], ids[tri[k + 2]]]);
    let sum = 0;
    for (const t of tris) sum += triArea(t[0], t[1], t[2]);
    if (sum < 0) {
      tris = tris.map(([a, b, d]) => [a, d, b]);
      sum = -sum;
    }
    const expected = c.rings.reduce((s, r) => s + ringArea(r), 0);
    if (Math.abs(sum - expected) > 1e-6 * Math.max(1, expected)) {
      throw new Error('Mesh: triangulation failed (self-intersecting outline?)');
    }
    c.tris = repairTJunctions(tris, c.rings);

    let best = -1;
    let cx = 0;
    let cy = 0;
    for (const [a, b, d] of c.tris) {
      const ar = triArea(a, b, d);
      if (ar > best) {
        best = ar;
        cx = (vx[a] + vx[b] + vx[d]) / 3;
        cy = (vy[a] + vy[b] + vy[d]) / 3;
      }
    }
    const [zlo, zhi] = zRange(cx, cy);
    c.zlo = zlo;
    c.zhi = zhi;
    c.empty = !(zhi - zlo > 1e-6);
  }

  // ---- 5. emit faces --------------------------------------------------------------------
  const heCell = new Map();
  cells.forEach((c, ci) => {
    for (const r of c.rings) for (let i = 0; i < r.length; i++) heCell.set(r[i] * M + r[(i + 1) % r.length], ci);
  });

  const levels = new Map();
  for (const c of cells) {
    if (c.empty) continue;
    for (const r of c.rings) {
      for (const v of r) {
        if (!levels.has(v)) levels.set(v, []);
        levels.get(v).push(c.zlo, c.zhi);
      }
    }
  }
  for (const [v, l] of levels) {
    l.sort((a, b) => a - b);
    const u = [l[0]];
    for (let i = 1; i < l.length; i++) if (l[i] - u[u.length - 1] > ZTOL) u.push(l[i]);
    levels.set(v, u);
  }

  const pos = [];
  const vIndex = new Map();
  const mv = (v, z) => {
    const L = levels.get(v);
    let li = -1;
    for (let i = 0; i < L.length; i++) {
      if (Math.abs(L[i] - z) <= ZTOL * 10) {
        li = i;
        break;
      }
    }
    if (li < 0) throw new Error('Mesh: missing height level');
    const key = v * 64 + li;
    let idx = vIndex.get(key);
    if (idx === undefined) {
      idx = pos.length / 3;
      pos.push(vx[v], vy[v], L[li]);
      vIndex.set(key, idx);
    }
    return idx;
  };

  const out = [];
  const wall = (a, b, lo, hi) => {
    const U = levels.get(a).filter((z) => z >= lo - ZTOL && z <= hi + ZTOL);
    const V = levels.get(b).filter((z) => z >= lo - ZTOL && z <= hi + ZTOL);
    let i = 0;
    let j = 0;
    while (i < U.length - 1 || j < V.length - 1) {
      if (i < U.length - 1 && (j === V.length - 1 || U[i + 1] <= V[j + 1])) {
        out.push(mv(a, U[i + 1]), mv(a, U[i]), mv(b, V[j]));
        i++;
      } else {
        out.push(mv(a, U[i]), mv(b, V[j]), mv(b, V[j + 1]));
        j++;
      }
    }
  };

  for (const c of cells) {
    if (c.empty) continue;
    for (const [a, b, d] of c.tris) {
      out.push(mv(a, c.zhi), mv(b, c.zhi), mv(d, c.zhi));
      out.push(mv(a, c.zlo), mv(d, c.zlo), mv(b, c.zlo));
    }
    for (const r of c.rings) {
      for (let i = 0; i < r.length; i++) {
        const a = r[i];
        const b = r[(i + 1) % r.length];
        const ri = heCell.get(b * M + a);
        const R = ri === undefined || cells[ri].empty ? null : cells[ri];
        for (const [lo, hi] of subtractInterval(c.zlo, c.zhi, R)) wall(a, b, lo, hi);
      }
    }
  }

  return { positions: Float32Array.from(pos), indices: Uint32Array.from(out), cellCount: cells.length };
}

function subtractInterval(l0, l1, R) {
  if (!R || R.zhi <= l0 + ZTOL || R.zlo >= l1 - ZTOL) return [[l0, l1]];
  const res = [];
  if (R.zlo > l0 + ZTOL) res.push([l0, R.zlo]);
  if (R.zhi < l1 - ZTOL) res.push([R.zhi, l1]);
  return res;
}

// Earcut drops exactly collinear boundary vertices. Walls still use those vertices, so we
// put them back by splitting the triangle that spans them into a fan.
function repairTJunctions(tris, rings) {
  const used = new Set();
  for (const t of tris) for (const v of t) used.add(v);
  let result = tris;
  for (const r of rings) {
    const n = r.length;
    if (r.every((v) => used.has(v))) continue;
    for (let i = 0; i < n; i++) {
      if (!used.has(r[i]) || used.has(r[(i + 1) % n])) continue;
      const q = r[i];
      const run = [];
      let j = i + 1;
      while (!used.has(r[j % n])) {
        run.push(r[j % n]);
        j++;
      }
      const rr = r[j % n];
      let found = -1;
      let w = -1;
      for (let k = 0; k < result.length; k++) {
        const [a, b, c] = result[k];
        if (a === q && b === rr) w = c;
        else if (b === q && c === rr) w = a;
        else if (c === q && a === rr) w = b;
        else continue;
        found = k;
        break;
      }
      if (found < 0) throw new Error('Mesh: T-junction repair failed');
      const chain = [q, ...run, rr];
      const fan = [];
      for (let k = 0; k + 1 < chain.length; k++) fan.push([chain[k], chain[k + 1], w]);
      result = result.slice(0, found).concat(fan, result.slice(found + 1));
      for (const v of run) used.add(v);
    }
  }
  return result;
}

function pointInRing(px, py, ring, vx, vy) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = vx[ring[i]];
    const yi = vy[ring[i]];
    const xj = vx[ring[j]];
    const yj = vy[ring[j]];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Even-odd point-in-polygon test over several loops. */
export function insideRegion(px, py, loops) {
  let inside = false;
  for (const loop of loops) {
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      const [xi, yi] = loop[i];
      const [xj, yj] = loop[j];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/**
 * Topology & volume check: every directed edge must be used exactly once and its
 * reverse exactly once (closed, consistently oriented 2-manifold).
 */
export function checkMesh(positions, indices) {
  const nV = positions.length / 3;
  const half = new Map();
  for (let i = 0; i < indices.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = indices[i + k];
      const b = indices[i + ((k + 1) % 3)];
      const key = a * nV + b;
      half.set(key, (half.get(key) || 0) + 1);
    }
  }
  let open = 0;
  let bad = 0;
  for (const [key, n] of half) {
    const a = Math.floor(key / nV);
    const b = key - a * nV;
    if (n !== 1) bad++;
    if (!half.has(b * nV + a)) open++;
  }
  let vol = 0;
  let degenerate = 0;
  const p = positions;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const wx = p[c] - p[a], wy = p[c + 1] - p[a + 1], wz = p[c + 2] - p[a + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    if (Math.hypot(nx, ny, nz) < 1e-12) degenerate++;
    vol += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) -
      p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) +
      p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
  }
  return { watertight: open === 0 && bad === 0, openEdges: open, badEdges: bad, degenerate, volume: vol, triangles: indices.length / 3 };
}
