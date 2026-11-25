// Draggable marks ("handles") of the marking steps, in key (model) coordinates.

import { shiftOrigin } from './frame.js';
import { fmt, DEG } from './util.js';

/** Distance of the rotation handle beyond the tip (mm). */
export const ROT_ARM = 11;

/**
 * @returns {Array<{id: string, x: number, y: number, axis: 'x'|'y'|'xy'|'rot'}>}
 */
export function handlesFor(step, p, outline) {
  const L = p.blade.length;
  const H = p.blade.height;
  const hs = outline.head;
  if (step === 'blade') {
    return [
      { id: 'shoulder', x: 0, y: hs.ht + 4, axis: 'x' },
      { id: 'back', x: L + 5, y: 0, axis: 'y' },
      { id: 'rotate', x: L + ROT_ARM, y: 0, axis: 'rot' },
      { id: 'front', x: L + 5, y: H, axis: 'y' },
      { id: 'apex', x: L, y: p.blade.tipY, axis: 'xy' },
      { id: 'chTop', x: L - p.blade.tipTop, y: H, axis: 'x' },
      { id: 'chBack', x: L - p.blade.tipBack, y: 0, axis: 'x' },
    ];
  }
  if (step === 'cuts') {
    return p.cuts.points.map((q, i) => ({ id: 'cut:' + i, x: q.x, y: q.y, axis: 'xy' }));
  }
  if (step === 'head') {
    const list = [
      { id: 'headEnd', x: -hs.Lh, y: (hs.ht + hs.hb) / 2, axis: 'x' },
      { id: 'headTop', x: -hs.Lh / 2, y: hs.ht, axis: 'y' },
      { id: 'headBottom', x: -hs.Lh / 2, y: hs.hb, axis: 'y' },
    ];
    if (p.head.hole) list.push({ id: 'hole', x: p.head.holeX, y: p.head.holeY, axis: 'xy' });
    return list;
  }
  return [];
}

/** Applies a model-space delta to the given handle (rotation is handled by the caller). */
export function moveHandle(p, id, dx, dy) {
  const b = p.blade;
  switch (id) {
    case 'shoulder':
      shiftOrigin(p, dx, 0);
      break;
    case 'back':
      shiftOrigin(p, 0, dy);
      break;
    case 'front':
      b.height += dy;
      break;
    case 'apex':
      // the chamfer starts stay where they are on the key
      b.length += dx;
      b.tipY += dy;
      if (b.tipTop > 0) b.tipTop += dx;
      if (b.tipBack > 0) b.tipBack += dx;
      break;
    case 'chTop':
      b.tipTop -= dx;
      break;
    case 'chBack':
      b.tipBack -= dx;
      break;
    case 'headEnd':
      p.head.length -= dx;
      break;
    case 'headTop':
      p.head.top += dy;
      break;
    case 'headBottom':
      p.head.bottom += dy;
      break;
    case 'hole':
      p.head.holeX += dx;
      p.head.holeY += dy;
      break;
    default:
      if (id.startsWith('cut:')) {
        const q = p.cuts.points[+id.slice(4)];
        if (q) {
          q.x += dx;
          q.y += dy;
        }
      }
  }
}

/** Display number of a cut (counted from the shoulder). */
export function cutNumber(p, index) {
  const q = p.cuts.points[index];
  if (!q) return 0;
  return p.cuts.points.filter((r, i) => r.x < q.x || (r.x === q.x && i < index)).length + 1;
}

/** Short HTML description of a handle for the read-out line. */
export function describeHandle(p, id, outline) {
  const b = p.blade;
  const hs = outline.head;
  switch (id) {
    case 'shoulder':
      return '<b>Váll</b> – ahol a penge a fejhez ér (ütköző)';
    case 'back':
      return '<b>Hátsó él</b> – a penge egyenes, bevágás nélküli éle';
    case 'rotate':
      return `<b>Forgatás</b> – ${fmt(p.frame.angle / DEG, 2)}°`;
    case 'front':
      return `<b>Penge magassága</b> – ${fmt(b.height)} mm`;
    case 'apex':
      return `<b>Hegy</b> – hossz ${fmt(b.length)} mm · csúcs ${fmt(b.tipY)} mm`;
    case 'chTop':
      return `<b>Felső letörés</b> – ${fmt(b.tipTop)} mm`;
    case 'chBack':
      return `<b>Alsó letörés</b> – ${fmt(b.tipBack)} mm`;
    case 'headEnd':
      return `<b>Fej vége</b> – fej hossza ${fmt(hs.Lh)} mm`;
    case 'headTop':
    case 'headBottom':
      return `<b>Fej széle</b> – fej szélessége ${fmt(hs.ht - hs.hb)} mm`;
    case 'hole':
      return `<b>Kulcskarika lyuk</b> – Ø ${fmt(p.head.holeD, 1)} mm`;
    default:
      if (id && id.startsWith('cut:')) {
        const i = +id.slice(4);
        const q = p.cuts.points[i];
        if (!q) return '';
        return `<b>${cutNumber(p, i)}. bevágás</b> – ${fmt(q.x)} mm a vállól · magasság ${fmt(q.y)} · vágás ${fmt(b.height - q.y)} mm`;
      }
      return '';
  }
}
