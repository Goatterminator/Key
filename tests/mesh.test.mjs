import test from 'node:test';
import assert from 'node:assert/strict';
import { extrude25D, checkMesh } from '../js/mesh.js';
import { defaultProject, normalizeProject, keyMesh, keyOutline, bitting, profileProblem } from '../js/geometry.js';

const square = (x0, y0, x1, y1) => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

function assertSolid(res, expectedVolume, tol = 1e-3) {
  const c = checkMesh(res.positions, res.indices);
  assert.equal(c.badEdges, 0, 'non-manifold edges');
  assert.equal(c.openEdges, 0, 'open edges');
  assert.ok(c.watertight);
  if (expectedVolume !== undefined) assert.ok(Math.abs(c.volume - expectedVolume) < tol, `volume ${c.volume} != ${expectedVolume}`);
  assert.ok(c.volume > 0, 'outward orientation');
  return c;
}

test('plain box', () => {
  const res = extrude25D([square(0, 0, 10, 5)], [], () => [0, 2]);
  assertSolid(res, 100);
});

test('box split into steps of different heights', () => {
  const res = extrude25D(
    [square(0, 0, 10, 6)],
    [
      [
        [5, -1],
        [5, 7],
      ],
      [
        [5, 2],
        [12, 2],
      ],
      [
        [5, 4],
        [12, 4],
      ],
    ],
    (x, y) => (x < 5 ? [0, 3] : y < 2 ? [0, 2] : y < 4 ? [0.5, 1.5] : [0, 2]),
  );
  // left half 5*6*3 = 90, right: 5*2*2 + 5*2*1 + 5*2*2 = 50
  assertSolid(res, 140);
});

test('box with a hole and an L-shaped region', () => {
  const outer = [
    [0, 0],
    [20, 0],
    [20, 5],
    [8, 5],
    [8, 12],
    [0, 12],
  ];
  const hole = [];
  for (let i = 0; i < 32; i++) {
    const a = (-2 * Math.PI * i) / 32;
    hole.push([4 + 2 * Math.cos(a), 8 + 2 * Math.sin(a)]);
  }
  const res = extrude25D(
    [outer, hole],
    [
      [
        [8, -1],
        [8, 13],
      ],
      [
        [8, 2.5],
        [30, 2.5],
      ],
    ],
    (x, y) => (x < 8 ? [0, 2] : y < 2.5 ? [0.3, 1.5] : [0, 1.5]),
  );
  const holeArea = 32 * 0.5 * 4 * Math.sin((2 * Math.PI) / 32);
  const vol = (8 * 12 - holeArea) * 2 + 12 * 2.5 * 1.2 + 12 * 2.5 * 1.5;
  assertSolid(res, vol);
});

test('collinear partition along a boundary edge is handled', () => {
  // the partition runs exactly along the bottom edge and across the middle
  const res = extrude25D(
    [square(0, 0, 10, 4)],
    [
      [
        [-2, 0],
        [12, 0],
      ],
      [
        [-2, 2],
        [12, 2],
      ],
    ],
    (x, y) => (y < 2 ? [0, 1] : [0, 2]),
  );
  assertSolid(res, 10 * 2 * 1 + 10 * 2 * 2);
});

function sampleProject(mod = (p) => p) {
  const p = defaultProject();
  p.cuts.points = [
    { x: 5, y: 6.2 },
    { x: 9, y: 5.1 },
    { x: 13, y: 7.4 },
    { x: 17, y: 4.6 },
    { x: 21, y: 6.0 },
    { x: 25, y: 5.5 },
  ];
  return normalizeProject(mod(p));
}

test('default key without cuts is watertight', () => {
  const m = keyMesh(normalizeProject(defaultProject()));
  const c = assertSolid(m);
  assert.ok(m.size[0] > 50 && m.size[0] < 56, `length ${m.size[0]}`);
  assert.ok(Math.abs(m.size[2] - 2.6) < 1e-6);
  assert.ok(c.degenerate === 0);
});

test('key with V cuts', () => {
  const p = sampleProject();
  const b = bitting(p);
  assert.ok(Math.abs(b.h(5) - 6.2) < 1e-9);
  assert.ok(Math.abs(b.h(17.25) - 4.6) < 1e-9); // inside the flat bottom
  assert.ok(Math.abs(b.h(17.25 + 1) - 5.6) < 1e-9); // 90° flank rises 1:1
  assertSolid(keyMesh(p));
});

test('key with grooves on both sides', () => {
  const p = sampleProject((q) => {
    q.profile.grooves = [
      { side: 'front', from: 1, width: 1.2, depth: 0.6 },
      { side: 'front', from: 4.5, width: 1, depth: 0.5 },
      { side: 'back', from: 2.8, width: 1.4, depth: 0.7 },
      { side: 'back', from: 0, width: 0.6, depth: 0.4 },
      { side: 'back', from: 7.5, width: 3, depth: 0.5 },
    ];
    return q;
  });
  assert.equal(profileProblem(p), null);
  const m = keyMesh(p);
  const c = assertSolid(m);
  const plain = checkMesh(...Object.values(keyMesh(sampleProject())).slice(0, 2));
  assert.ok(c.volume < plain.volume, 'grooves remove material');
});

test('groove line exactly through a cut bottom and blade edge', () => {
  const p = sampleProject((q) => {
    q.profile.grooves = [
      { side: 'front', from: 4.6, width: 1.6, depth: 0.5 },
      { side: 'back', from: 6.2, width: 2.3, depth: 0.5 },
    ];
    return q;
  });
  assertSolid(keyMesh(p));
});

test('same head and blade thickness, no hole, flat tip', () => {
  const p = sampleProject((q) => {
    q.profile.headThickness = q.profile.thickness;
    q.head.hole = false;
    q.blade.tipTop = 0;
    q.blade.tipBack = 0;
    return q;
  });
  assertSolid(keyMesh(p));
});

test('double sided freehand key', () => {
  const p = sampleProject((q) => {
    q.cuts.doubleSided = true;
    q.cuts.style = 'free';
    q.blade.tipY = q.blade.height / 2;
    q.profile.grooves = [{ side: 'front', from: 3, width: 2.5, depth: 0.5 }];
    return q;
  });
  assertSolid(keyMesh(p));
});

test('very deep cuts are clamped to keep material', () => {
  const p = sampleProject((q) => {
    q.cuts.points = [
      { x: 10, y: 0 },
      { x: 28, y: 0 },
    ];
    return q;
  });
  const o = keyOutline(p);
  for (const [x, y] of o.outer) if (x > 0 && x < 27) assert.ok(y >= -1e-9);
  assertSolid(keyMesh(p));
});

test('hole that does not fit is dropped with a warning', () => {
  const p = sampleProject((q) => {
    q.head.holeX = -1;
    return q;
  });
  const m = keyMesh(p);
  assert.equal(m.outline.hole, null);
  assert.ok(m.warnings.length > 0);
  assertSolid(m);
});

test('too deep grooves are rejected', () => {
  const p = sampleProject((q) => {
    q.profile.grooves = [
      { side: 'front', from: 1, width: 1, depth: 1 },
      { side: 'back', from: 4, width: 1, depth: 0.9 },
    ];
    return q;
  });
  assert.ok(profileProblem(p));
  assert.throws(() => keyMesh(p));
});

test('random projects are always watertight', () => {
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let n = 0; n < 60; n++) {
    const p = defaultProject();
    p.blade.length = 20 + rnd() * 25;
    p.blade.height = 6 + rnd() * 4;
    p.blade.tipY = rnd() * p.blade.height;
    p.blade.tipTop = rnd() * 5;
    p.blade.tipBack = rnd() * 5;
    p.cuts.style = rnd() < 0.3 ? 'free' : 'v';
    p.cuts.angle = 60 + rnd() * 50;
    p.cuts.flat = rnd() * 1.2;
    p.cuts.doubleSided = rnd() < 0.2;
    const nc = Math.floor(rnd() * 8);
    p.cuts.points = [];
    for (let i = 0; i < nc; i++) p.cuts.points.push({ x: rnd() * p.blade.length, y: rnd() * p.blade.height });
    p.head.length = 10 + rnd() * 20;
    p.head.top = p.blade.height + rnd() * 12;
    p.head.bottom = -rnd() * 12;
    p.head.rFar = rnd() * 15;
    p.head.rNear = rnd() * 3;
    p.head.holeX = -p.head.length * (0.3 + rnd() * 0.5);
    p.head.holeY = (p.head.top + p.head.bottom) / 2;
    p.head.holeD = 2 + rnd() * 4;
    p.profile.thickness = 1.6 + rnd();
    p.profile.headThickness = p.profile.thickness + rnd();
    const ng = Math.floor(rnd() * 5);
    p.profile.grooves = [];
    for (let i = 0; i < ng; i++) {
      p.profile.grooves.push({
        side: rnd() < 0.5 ? 'front' : 'back',
        from: rnd() * p.blade.height,
        width: 0.3 + rnd() * 2,
        depth: 0.1 + rnd() * 0.5,
      });
    }
    normalizeProject(p);
    if (profileProblem(p)) continue;
    const m = keyMesh(p);
    const c = checkMesh(m.positions, m.indices);
    assert.ok(c.watertight, `project #${n} not watertight: ${JSON.stringify(c)}`);
    assert.ok(c.volume > 0);
  }
});
