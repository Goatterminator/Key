// AI assistance for photo mode: finds the card corners and the parts of the key.
//
// Two providers:
//   - Claude, through the claude.ai artifact runtime (`sample` capability), when the app
//     runs as a claude.ai artifact. No key needed; runs on the viewer's Claude account.
//   - Gemini, with the user's own API key, everywhere else. The key is kept only in this
//     browser (localStorage) and sent only to Google's Gemini API.
//
// The AI only suggests points; the user checks and corrects them on the zoomed photo.

export const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

let claudeSample;
let claudeChecked = false;

/** Resolves the Claude `sample` function if this view can send it images, else null. */
async function claudeVision() {
  if (claudeChecked) return claudeSample;
  claudeChecked = true;
  claudeSample = null;
  try {
    if (!(window.claude && typeof window.claude.use === 'function')) return null;
    const sample = await window.claude.use('sample');
    if (!sample) return null;
    const limits = await sample.limits().catch(() => null);
    if (limits && limits.images) claudeSample = sample;
  } catch {
    claudeSample = null;
  }
  return claudeSample;
}

/** Which provider is usable right now: 'claude', 'gemini' or null. */
export async function aiProvider(settings) {
  if (await claudeVision()) return 'claude';
  if (settings.geminiKey && !(window.claude && typeof window.claude.use === 'function')) return 'gemini';
  return null;
}

/** True when the page runs inside a claude.ai artifact (where Gemini cannot be reached). */
export function inArtifact() {
  return !!(window.claude && typeof window.claude.use === 'function');
}

function parseJson(text) {
  const t = String(text || '').trim();
  try {
    return JSON.parse(t);
  } catch {
    /* fall through */
  }
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try {
      return JSON.parse(fence[1]);
    } catch {
      /* fall through */
    }
  }
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error('Az AI válasza nem értelmezhető.');
}

async function blobToBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

async function askGemini(settings, prompt, image, signal) {
  const model = (settings.geminiModel || DEFAULT_GEMINI_MODEL).trim();
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: image.type || 'image/jpeg', data: await blobToBase64(image) } }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' },
  };
  let res;
  try {
    res = await fetch(GEMINI_URL + encodeURIComponent(model) + ':generateContent', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': settings.geminiKey.trim() },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    throw new Error('A Gemini nem érhető el (nincs internet, vagy ez a környezet tiltja).');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.error && data.error.message) || res.statusText;
    if (res.status === 400 && /API key/i.test(msg)) throw new Error('A Gemini API kulcs érvénytelen.');
    if (res.status === 403) throw new Error('A Gemini API kulcs nem jogosult erre (403).');
    if (res.status === 404) throw new Error(`Ismeretlen Gemini modell: ${model}.`);
    if (res.status === 429) throw new Error('Elfogyott a Gemini keret, vagy túl sok a kérés. Próbáld újra később.');
    throw new Error('Gemini hiba: ' + msg);
  }
  const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  return parseJson(parts.map((p) => p.text || '').join(''));
}

const CLAUDE_ERRORS = {
  not_granted: 'Nem engedélyezted, hogy az oldal a Claude-ot használja.',
  sampling_disabled: 'A Claude nem érhető el ehhez a fiókhoz.',
  rate_limited: 'Túl sok kérés, vagy elérted a használati keretet. Próbáld újra később.',
  image_rejected: 'A Claude nem fogadta el a képet. Próbálj másik fotót.',
  images_unavailable: 'Itt nem lehet képet küldeni a Claude-nak.',
  refused: 'A Claude ezt a kérést nem teljesítette.',
  invalid_json: 'Az AI válasza nem értelmezhető. Próbáld újra.',
  session_expired: 'Jelentkezz be újra a Claude-ba.',
};

async function ask(settings, prompt, image, signal) {
  const provider = await aiProvider(settings);
  if (provider === 'claude') {
    try {
      return await claudeSample.json(prompt, { images: image, signal, cache: false });
    } catch (err) {
      if (err && err.code === 'cancelled') throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
      throw new Error((err && CLAUDE_ERRORS[err.code]) || 'Az AI elemzés nem sikerült. Próbáld újra.');
    }
  }
  if (provider === 'gemini') return askGemini(settings, prompt, image, signal);
  throw new Error('Nincs beállítva AI.');
}

const pt = (v) => Array.isArray(v) && v.length >= 2 && v.every((n) => Number.isFinite(+n)) ? [+v[0], +v[1]] : null;

/**
 * Step 1, on the original photo: the card corners and the two ends of the key.
 * @returns {Promise<{card: number[][], tip: number[], end: number[]}>} points as [x, y] in 0..1
 */
export async function detectSetup(settings, image, signal) {
  const prompt = `This photo shows a flat metal key and an ID-1 sized card (bank card or ID card, 85.60 × 53.98 mm) lying next to each other on a flat surface, photographed from above.

Reply with only this JSON object:
{"card": [[y, x], [y, x], [y, x], [y, x]], "tip": [y, x], "head_end": [y, x]}

- "card": the 4 corners of the card. The card has rounded corners: give the points where its straight edges would meet if they were extended, not the rounded tips.
- "tip": the very tip of the key blade (the end that goes into the lock).
- "head_end": the point of the key's head (bow) that is farthest from the tip.

All coordinates are [y, x], normalized to 0-1000 over this image (0,0 is the top-left corner). If the card or the key is not visible, reply {"error": "<short reason in Hungarian>"}.`;
  const r = await ask(settings, prompt, image, signal);
  if (r && r.error) throw new Error(String(r.error));
  const card = Array.isArray(r && r.card) ? r.card.map(pt).filter(Boolean) : [];
  const tip = pt(r && r.tip);
  const end = pt(r && r.head_end);
  if (card.length !== 4 || !tip || !end) throw new Error('Az AI nem találta meg a kártyát vagy a kulcsot. Jelöld be kézzel.');
  const n = ([y, x]) => [x / 1000, y / 1000];
  return { card: card.map(n), tip: n(tip), end: n(end) };
}

/**
 * Step 2, on the rectified crop (tip up, head down): the parts of the key.
 * Points are returned as [x, y] in 0..1 of the crop image.
 */
export async function detectLandmarks(settings, image, info, signal) {
  const prompt = `The image shows a flat metal key from directly above. It was rectified to a true top-down view at ${info.pxPerMm.toFixed(1)} pixels per millimetre, so distances in it are real: the image is ${info.widthMm.toFixed(0)} mm wide and ${info.heightMm.toFixed(0)} mm tall. The blade points up (the tip is near the top) and the head (bow) is at the bottom.

The blade has one straight, un-notched long edge and one edge with notches (the cuts that lift the lock pins). Mark the key precisely, at the visible edge of the metal.

Reply with only this JSON object (coordinates [y, x] normalized to 0-1000 over this image, 0,0 = top-left):
{
  "cuts_side": "left" or "right",
  "back_edge": [[y, x], [y, x]],
  "shoulder": [y, x],
  "blade_width_point": [y, x],
  "tip": [y, x],
  "tip_slope_notched": [y, x],
  "tip_slope_straight": [y, x],
  "cuts": [[y, x], ...],
  "head_end": [y, x],
  "head_left": [y, x],
  "head_right": [y, x],
  "hole": [ymin, xmin, ymax, xmax] or null
}

- "cuts_side": which long edge of the blade, left or right in this image, has the notches.
- "back_edge": two points on the straight, un-notched edge of the blade: one close to the head, one close to the tip (before the edge starts to slope towards the tip).
- "shoulder": the inner corner where the notched edge of the blade meets the head (the step that stops the key at the lock face).
- "blade_width_point": a point on the notched edge where the blade has its full width, between the shoulder and the first notch.
- "tip": the very tip of the blade.
- "tip_slope_notched": where the notched edge starts sloping towards the tip, after the last notch.
- "tip_slope_straight": where the straight edge starts sloping towards the tip.
- "cuts": the deepest point of every notch along the notched edge, in order from the head towards the tip. Include every notch, even shallow ones.
- "head_end": the point of the head farthest from the tip.
- "head_left", "head_right": the outermost points of the head on the left and on the right.
- "hole": bounding box of the key-ring hole in the head, or null if there is none.`;
  const r = await ask(settings, prompt, image, signal);
  if (!r || typeof r !== 'object') throw new Error('Az AI válasza nem értelmezhető.');
  const n = (v) => {
    const p = pt(v);
    return p ? [p[1] / 1000, p[0] / 1000] : null;
  };
  const hole = Array.isArray(r.hole) && r.hole.length === 4 && r.hole.every((v) => Number.isFinite(+v)) ? r.hole.map(Number) : null;
  return {
    cutsSide: r.cuts_side === 'left' ? 'left' : 'right',
    back: Array.isArray(r.back_edge) ? r.back_edge.map(n).filter(Boolean) : [],
    shoulder: n(r.shoulder),
    width: n(r.blade_width_point),
    tip: n(r.tip),
    slopeNotched: n(r.tip_slope_notched),
    slopeStraight: n(r.tip_slope_straight),
    cuts: Array.isArray(r.cuts) ? r.cuts.map(n).filter(Boolean) : [],
    headEnd: n(r.head_end),
    headLeft: n(r.head_left),
    headRight: n(r.head_right),
    hole: hole ? { x0: hole[1] / 1000, y0: hole[0] / 1000, x1: hole[3] / 1000, y1: hole[2] / 1000 } : null,
  };
}
