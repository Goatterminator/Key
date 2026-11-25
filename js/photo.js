// Photo mode: a photo of the key next to an ID-1 card (bank card), taken from above.
// The card's four corners give the scale and remove the perspective; the key is then cut
// out into an upright, rectified "crop" image in millimetres that the marking steps use
// as their background (instead of the physical key lying on the screen).

export const CARD_LONG = 85.6;
export const CARD_SHORT = 53.98;
export const CARD_RADIUS = 3.18;
const MAX_SIDE = 3200; // the original photo is kept at most this large (px)
const CROP_SCALE = 20; // px per mm of the rectified crop
const CROP_WIDTH = 50; // mm across the key axis
export const CROP_MARGIN = 9; // mm beyond the tip and the end of the head

/** Loads an image file into a canvas, honouring EXIF orientation and limiting the size. */
export async function loadImageFile(file) {
  let src;
  try {
    src = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    src = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('A képet nem sikerült megnyitni.'));
      img.src = URL.createObjectURL(file);
    });
  }
  const w0 = src.width || src.naturalWidth;
  const h0 = src.height || src.naturalHeight;
  const k = Math.min(1, MAX_SIDE / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.round(w0 * k);
  c.height = Math.round(h0 * k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  if (src.close) src.close();
  return c;
}

/** JPEG blob of a canvas, scaled so that its longer side is at most maxSide px. */
export function canvasToJpeg(canvas, maxSide = 1600, quality = 0.88) {
  const k = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  let c = canvas;
  if (k < 1) {
    c = document.createElement('canvas');
    c.width = Math.round(canvas.width * k);
    c.height = Math.round(canvas.height * k);
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(canvas, 0, 0, c.width, c.height);
  }
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', quality));
}

// ---- projective geometry ---------------------------------------------------------------

/** 3x3 homography (row-major, h33 = 1) mapping the four src points onto the four dst points. */
export function homography(src, dst) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solve(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

export function applyH(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) throw new Error('A kártya sarkai nem adnak érvényes négyszöget.');
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * Orders the four marked card corners around the card and assigns their positions on the
 * card in mm (the longer sides become 85.6 mm).
 * @returns {{img: number[][], mm: number[][]}}
 */
export function cardCorners(pts) {
  const cx = pts.reduce((s, p) => s + p[0], 0) / 4;
  const cy = pts.reduce((s, p) => s + p[1], 0) / 4;
  const ord = pts.slice().sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  const len = (i) => Math.hypot(ord[(i + 1) % 4][0] - ord[i][0], ord[(i + 1) % 4][1] - ord[i][1]);
  const start = len(0) + len(2) >= len(1) + len(3) ? 0 : 1;
  const img = [0, 1, 2, 3].map((i) => ord[(start + i) % 4]);
  const mm = [
    [0, 0],
    [CARD_LONG, 0],
    [CARD_LONG, CARD_SHORT],
    [0, CARD_SHORT],
  ];
  return { img, mm };
}

/** Image px <-> card mm transforms for the marked corners. */
export function cardTransforms(points) {
  const { img, mm } = cardCorners(points.card);
  return { toMm: homography(img, mm), toImg: homography(mm, img), img, mm };
}

/**
 * Geometry of the rectified crop: crop mm (X right, Y down, tip at the top) -> card mm.
 * @returns {{W: number, H: number, map: (X: number, Y: number) => number[], inv: (x: number, y: number) => number[]}}
 */
export function cropGeometry(points, mirrored) {
  const { toMm } = cardTransforms(points);
  const T = applyH(toMm, ...points.tip);
  const E = applyH(toMm, ...points.end);
  const len = Math.hypot(T[0] - E[0], T[1] - E[1]);
  if (!(len > 10)) throw new Error('Jelöld be a kulcs hegyét és a fej végét.');
  const d = [(T[0] - E[0]) / len, (T[1] - E[1]) / len]; // towards the tip
  let r = [-d[1], d[0]]; // to the right when the tip points up
  if (mirrored) r = [-r[0], -r[1]];
  const W = CROP_WIDTH;
  const H = len + 2 * CROP_MARGIN;
  const C = [(T[0] + E[0]) / 2, (T[1] + E[1]) / 2];
  const map = (X, Y) => [C[0] + (X - W / 2) * r[0] - (Y - H / 2) * d[0], C[1] + (X - W / 2) * r[1] - (Y - H / 2) * d[1]];
  const inv = (x, y) => {
    const px = x - C[0];
    const py = y - C[1];
    return [W / 2 + px * r[0] + py * r[1], H / 2 - (px * d[0] + py * d[1])];
  };
  return { W, H, map, inv, length: len };
}

/** Renders the rectified, upright crop of the key (bilinear sampling of the photo). */
export function renderCrop(photo, points, mirrored) {
  const g = cropGeometry(points, mirrored);
  const { toImg } = cardTransforms(points);
  let scale = CROP_SCALE;
  while (g.W * g.H * scale * scale > 5e6) scale *= 0.85;
  const w = Math.round(g.W * scale);
  const h = Math.round(g.H * scale);
  const src = photo.getContext('2d').getImageData(0, 0, photo.width, photo.height);
  const sw = src.width;
  const sh = src.height;
  const sd = src.data;
  const out = new ImageData(w, h);
  const od = out.data;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const [mx, my] = g.map((i + 0.5) / scale, (j + 0.5) / scale);
      const [ix, iy] = applyH(toImg, mx, my);
      const o = (j * w + i) * 4;
      const x0 = Math.floor(ix - 0.5);
      const y0 = Math.floor(iy - 0.5);
      if (x0 < 0 || y0 < 0 || x0 + 1 >= sw || y0 + 1 >= sh) {
        od[o] = od[o + 1] = od[o + 2] = 128;
        od[o + 3] = 255;
        continue;
      }
      const fx = ix - 0.5 - x0;
      const fy = iy - 0.5 - y0;
      const a = (y0 * sw + x0) * 4;
      const b = a + 4;
      const c = a + sw * 4;
      const d = c + 4;
      for (let k = 0; k < 3; k++) {
        const top = sd[a + k] + (sd[b + k] - sd[a + k]) * fx;
        const bot = sd[c + k] + (sd[d + k] - sd[c + k]) * fx;
        od[o + k] = top + (bot - top) * fy;
      }
      od[o + 3] = 255;
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').putImageData(out, 0, 0);
  return { canvas, scale, W: g.W, H: g.H, geometry: g };
}

/** Reasonable starting points when no AI is available: card on the left, key on the right. */
export function defaultPoints(w, h) {
  const cw = w * 0.3;
  const ch = cw * (CARD_LONG / CARD_SHORT);
  const x0 = w * 0.1;
  const y0 = (h - ch) / 2;
  return {
    card: [
      [x0, y0],
      [x0 + cw, y0],
      [x0 + cw, y0 + ch],
      [x0, y0 + ch],
    ],
    tip: [w * 0.7, h * 0.2],
    end: [w * 0.7, h * 0.8],
  };
}

// ---- storage of the photo (IndexedDB; the app still works if it is unavailable) ----------

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('kulcsmasolo', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function storePhoto(blob) {
  try {
    const db = await idb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put(blob, 'photo');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
  }
}

export async function loadStoredPhoto() {
  try {
    const db = await idb();
    return await new Promise((resolve, reject) => {
      const req = db.transaction('files').objectStore('files').get('photo');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}
