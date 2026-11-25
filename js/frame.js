// Mapping between screen millimetres and key (model) coordinates.
//
// Screen mm: origin at the top-left of the viewport, X to the right, Y down.
// The frame places the key's origin (shoulder x back edge) at (ox, oy). With angle = 0 the
// blade points up the screen (model +x = screen up) and the cuts face right (model +y =
// screen right).

export function axes(angle) {
  return { ux: Math.sin(angle), uy: -Math.cos(angle), vx: Math.cos(angle), vy: Math.sin(angle) };
}

export function toScreen(f, x, y) {
  const a = axes(f.angle);
  return [f.ox + a.ux * x + a.vx * y, f.oy + a.uy * x + a.vy * y];
}

export function toModel(f, X, Y) {
  const a = axes(f.angle);
  const dx = X - f.ox;
  const dy = Y - f.oy;
  return [dx * a.ux + dy * a.uy, dx * a.vx + dy * a.vy];
}

export function deltaToModel(f, dX, dY) {
  const a = axes(f.angle);
  return [dX * a.ux + dY * a.uy, dX * a.vx + dY * a.vy];
}

/**
 * Moves the key origin by (dx, dy) model mm while every mark keeps its place on the
 * screen (used when the shoulder line or the back edge line is adjusted).
 */
export function shiftOrigin(p, dx, dy) {
  const a = axes(p.frame.angle);
  p.frame.ox += a.ux * dx + a.vx * dy;
  p.frame.oy += a.uy * dx + a.vy * dy;
  if (dx) {
    p.blade.length -= dx;
    p.head.length += dx;
    p.head.holeX -= dx;
    for (const q of p.cuts.points) q.x -= dx;
  }
  if (dy) {
    p.blade.height -= dy;
    p.blade.tipY -= dy;
    p.head.top -= dy;
    p.head.bottom -= dy;
    p.head.holeY -= dy;
    for (const q of p.cuts.points) q.y -= dy;
  }
}

/**
 * Rotates the frame about its origin. With keepScreen the point-like marks (tip, cuts,
 * key-ring hole) stay where they are on the screen; otherwise everything rotates along.
 */
export function rotateFrame(p, da, keepScreen) {
  if (!keepScreen) {
    p.frame.angle += da;
    return;
  }
  const f = p.frame;
  const pts = [[p.blade.length, p.blade.tipY], [p.head.holeX, p.head.holeY], ...p.cuts.points.map((q) => [q.x, q.y])];
  const scr = pts.map(([x, y]) => toScreen(f, x, y));
  f.angle += da;
  const back = scr.map(([X, Y]) => toModel(f, X, Y));
  [p.blade.length, p.blade.tipY] = back[0];
  [p.head.holeX, p.head.holeY] = back[1];
  p.cuts.points.forEach((q, i) => {
    [q.x, q.y] = back[i + 2];
  });
}
