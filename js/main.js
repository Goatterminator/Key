// Application shell: state, steps, panels, persistence.

import { defaultProject, normalizeProject, keyOutline, keyMesh, profileProblem, strengthReport, MATERIALS } from './geometry.js';
import { checkMesh } from './mesh.js';
import { toBinarySTL } from './stl.js';
import { Viewer } from './viewer.js';
import { Stage } from './stage.js';
import { handlesFor, moveHandle, describeHandle, ROT_ARM } from './handles.js';
import { toScreen, deltaToModel, rotateFrame, toModel } from './frame.js';
import { fmt, parseNum, clamp, DEG, escapeHtml } from './util.js';
import { HELP, INTRO } from './help.js';

const STEPS = ['blade', 'cuts', 'head', 'profile', 'model'];
const MARK_STEPS = ['blade', 'cuts', 'head'];
const TITLES = { calib: 'Kalibrálás', blade: 'Penge', cuts: 'Bevágások', head: 'Fej', profile: 'Profil', model: '3D modell' };
const HINTS = {
  blade: 'Igazítsd a vonalakat a kulcshoz: váll, hátsó él, magasság, hegy.',
  cuts: 'Koppints minden bevágás aljához a kulcs mellett.',
  head: 'Állítsd be a fej végét, széleit és a kulcskarika lyukat.',
};
const NUDGE_STEPS = [0.02, 0.05, 0.1, 0.5];
const LS_SETTINGS = 'kulcsmasolo.settings.v1';
const LS_PROJECT = 'kulcsmasolo.project.v1';

const $ = (id) => document.getElementById(id);
const isCoarse = matchMedia('(pointer: coarse)').matches;

function readLS(key) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

function writeLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode): the app still works for this session */
  }
}

// Numeric fields of the panels: [getter, setter, decimals]
const FIELDS = {
  'blade.length': [(p) => p.blade.length, (p, v) => (p.blade.length = v), 2],
  'blade.height': [(p) => p.blade.height, (p, v) => (p.blade.height = v), 2],
  'blade.tipY': [(p) => p.blade.tipY, (p, v) => (p.blade.tipY = v), 2],
  'blade.tipTop': [(p) => p.blade.tipTop, (p, v) => (p.blade.tipTop = v), 2],
  'blade.tipBack': [(p) => p.blade.tipBack, (p, v) => (p.blade.tipBack = v), 2],
  'frame.angle': [(p) => p.frame.angle / DEG, (p, v) => rotateFrame(p, v * DEG - p.frame.angle, true), 2],
  'cuts.angle': [(p) => p.cuts.angle, (p, v) => (p.cuts.angle = v), 1],
  'cuts.flat': [(p) => p.cuts.flat, (p, v) => (p.cuts.flat = v), 2],
  'head.length': [(p) => p.head.length, (p, v) => (p.head.length = v), 2],
  'head.width': [
    (p) => p.head.top - p.head.bottom,
    (p, v) => {
      const c = (p.head.top + p.head.bottom) / 2;
      p.head.top = c + v / 2;
      p.head.bottom = c - v / 2;
    },
    2,
  ],
  'head.rFar': [(p) => p.head.rFar, (p, v) => (p.head.rFar = v), 2],
  'head.rNear': [(p) => p.head.rNear, (p, v) => (p.head.rNear = v), 2],
  'head.holeD': [(p) => p.head.holeD, (p, v) => (p.head.holeD = v), 1],
  'profile.thickness': [(p) => p.profile.thickness, (p, v) => (p.profile.thickness = v), 2],
  'profile.headThickness': [(p) => p.profile.headThickness, (p, v) => (p.profile.headThickness = v), 2],
};

const app = {
  settings: Object.assign(
    { pxPerMm: isCoarse ? 6.3 : 96 / 25.4, calibrated: false, stageTheme: 'light', grid: true, nudge: 0.05, step: 'blade', introSeen: false, material: 'petg' },
    readLS(LS_SETTINGS) || {},
  ),
  project: null,
  step: 'blade',
  selected: null,
  moveAll: false,
  fine: false,
  undo: [],
  mesh: null,
  calibBackup: null,

  // ---- state helpers -------------------------------------------------------------------
  outline() {
    if (!this._outline || this._outlineKey !== this._version) {
      this._outline = keyOutline(this.project);
      this._outlineKey = this._version;
    }
    return this._outline;
  },
  handles() {
    return handlesFor(this.step, this.project, this.outline());
  },
  snapshot() {
    return JSON.stringify(this.project);
  },
  restore(snap) {
    if (snap === JSON.stringify(this.project)) return;
    this.project = normalizeProject(JSON.parse(snap));
    this.changed(false);
  },
  commit(before) {
    if (before !== JSON.stringify(this.project)) {
      this.undo.push(before);
      if (this.undo.length > 100) this.undo.shift();
      this._lastCommit = { t: performance.now(), sel: this.selected };
      saveProject();
    }
    updateUndo();
  },
  /** Commits an action, merging rapid repeats of the same action (e.g. nudge presses). */
  act(tag, fn) {
    const before = this.snapshot();
    fn();
    normalizeProject(this.project);
    const now = performance.now();
    const merge = this._lastAct && this._lastAct.tag === tag && now - this._lastAct.t < 1500;
    this._lastAct = { tag, t: now };
    if (merge) saveProject();
    else this.commit(before);
    this.changed(false);
  },
  changed(save = true) {
    this._version = (this._version || 0) + 1;
    if (save) saveProject();
    render();
  },
  saveSettings() {
    writeLS(LS_SETTINGS, this.settings);
  },
  setScale(s) {
    this.settings.pxPerMm = clamp(s, 2, 14);
    render();
  },
  visibleRect() {
    const tb = $('topbar');
    const top = getComputedStyle(tb).display === 'none' ? 0 : tb.getBoundingClientRect().bottom;
    const bottom = $('panel').getBoundingClientRect().top;
    return { top, bottom };
  },
  isDark() {
    return chromeDark();
  },
  cardOrigin() {
    return [14 + safeArea('left'), 14 + safeArea('top')];
  },

  // ---- marking interaction --------------------------------------------------------------
  select(id) {
    this.selected = id;
    render();
  },
  hitHandle(X, Y) {
    let best = null;
    // cuts sit ~4 mm apart, so a tap a bit further away from one adds a new cut instead
    let bestD = this.step === 'cuts' ? 2.2 : 6.5; // mm
    for (const h of this.handles()) {
      const [hx, hy] = toScreen(this.project.frame, h.x, h.y);
      const d = Math.hypot(hx - X, hy - Y);
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    return best;
  },
  translateAll(dX, dY) {
    this.project.frame.ox += dX;
    this.project.frame.oy += dY;
    this.changed(false);
  },
  dragSelected(dX, dY) {
    const id = this.selected;
    if (!id) return;
    const p = this.project;
    if (id === 'rotate') {
      const f = p.frame;
      const [hx, hy] = toScreen(f, p.blade.length + ROT_ARM, 0);
      const na = Math.atan2(hx + dX - f.ox, -(hy + dY - f.oy));
      let da = na - f.angle;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      rotateFrame(p, da, !this.moveAll);
    } else {
      const h = this.handles().find((q) => q.id === id);
      if (!h) return;
      let [dx, dy] = deltaToModel(p.frame, dX, dY);
      if (h.axis === 'x') dy = 0;
      if (h.axis === 'y') dx = 0;
      moveHandle(p, id, dx, dy);
    }
    normalizeProject(p);
    this.changed(false);
  },
  tap(mode, [X, Y]) {
    if (this.step === 'cuts' && mode !== 'handle' && mode !== 'all') {
      const p = this.project;
      const [x, y] = toModel(p.frame, X, Y);
      if (x > 0.2 && x < p.blade.length - 0.2 && y > -3 && y < p.blade.height + 7) {
        if (p.cuts.points.length >= 40) return toast('Legfeljebb 40 pont adható meg.');
        this.act('add', () => {
          p.cuts.points.push({ x, y: clamp(y, 0, p.blade.height) });
          this.selected = 'cut:' + (p.cuts.points.length - 1);
        });
        return;
      }
      toast('A bevágás pontját a penge mellé koppintsd.');
      return;
    }
    if (mode === 'track' || mode === 'none') {
      this.selected = null;
      render();
    }
  },
  nudge(dir) {
    const st = this.settings.nudge;
    const d = { left: [-st, 0], right: [st, 0], up: [0, -st], down: [0, st] }[dir];
    if (this.moveAll) {
      this.act('nudge-all', () => {
        this.project.frame.ox += d[0];
        this.project.frame.oy += d[1];
      });
      return;
    }
    if (!this.selected) return toast('Előbb koppints egy fogantyúra.');
    this.act('nudge:' + this.selected, () => this.dragSelected(d[0], d[1]));
  },
  centerTemplate() {
    const p = this.project;
    const s = this.settings.pxPerMm;
    const { top, bottom } = this.visibleRect();
    const o = keyOutline(p);
    const L = p.blade.length;
    const Lh = o.head.Lh;
    const topMm = top / s;
    const avail = bottom / s - topMm;
    const total = L + ROT_ARM + 2 + Lh + 1;
    p.frame.angle = 0;
    p.frame.ox = window.innerWidth / s / 2 - (o.head.ht + o.head.hb) / 2;
    p.frame.oy = topMm + Math.max(0.5, (avail - total) / 2) + L + ROT_ARM + 2;
    this.changed();
  },
};

// ---------------------------------------------------------------------------------------
// persistence

function loadProject() {
  const raw = readLS(LS_PROJECT);
  return raw ? normalizeProject(raw) : null;
}

let saveTimer = 0;
function saveProject() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => writeLS(LS_PROJECT, app.project), 250);
}

function safeArea(side) {
  const probe = document.createElement('div');
  probe.style.cssText = `position:fixed;visibility:hidden;padding-${side}:env(safe-area-inset-${side})`;
  document.body.appendChild(probe);
  const v = parseFloat(getComputedStyle(probe)[`padding${side[0].toUpperCase()}${side.slice(1)}`]) || 0;
  probe.remove();
  return v;
}

// ---------------------------------------------------------------------------------------
// rendering

let stage;
let viewer;
let frameReq = 0;

function render() {
  if (frameReq) return;
  frameReq = requestAnimationFrame(() => {
    frameReq = 0;
    stage.draw();
    updatePanel();
  });
}

function toast(msg, ms = 2200) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), ms);
}

function updateUndo() {
  $('btnUndo').disabled = app.undo.length === 0;
}

function setField(input) {
  const def = FIELDS[input.dataset.field];
  if (!def || document.activeElement === input) return;
  input.value = fmt(def[0](app.project), def[2]);
}

function updatePanel() {
  const p = app.project;
  const step = app.step;
  document.body.dataset.step = step;

  if (step === 'calib') {
    $('calRange').value = app.settings.pxPerMm;
    $('calCancel').hidden = !app.settings.calibrated;
    return;
  }

  const idx = STEPS.indexOf(step);
  $('stepNo').textContent = `${idx + 1}/${STEPS.length}`;
  $('stepTitle').textContent = TITLES[step];
  $('btnPrev').disabled = idx === 0;
  $('btnNext').textContent = step === 'model' ? '⬇ STL' : 'Tovább ›';
  updateUndo();

  if (MARK_STEPS.includes(step)) {
    const o = app.outline();
    let html = app.selected ? describeHandle(p, app.selected, o) : '';
    if (app.moveAll) html = '<b>Mozgat mód</b> – húzd a sablont a kulcs alá, a ⟳ fogantyúval forgass';
    $('readout').innerHTML = html || HINTS[step];
    $('btnStep').textContent = `${fmt(app.settings.nudge, 2)} mm`;
    $('btnFine').classList.toggle('on', app.fine);
    $('btnMoveAll').classList.toggle('on', app.moveAll);
  }

  document.querySelectorAll(`.step-panel[data-step="${step}"] [data-field]`).forEach(setField);

  if (step === 'cuts') {
    $('cutStyle').value = p.cuts.style;
    $('chkDouble').checked = p.cuts.doubleSided;
    $('btnDelCut').disabled = !(app.selected && app.selected.startsWith('cut:'));
    renderCutList();
  } else if (step === 'head') {
    $('chkHole').checked = p.head.hole;
  } else if (step === 'profile') {
    renderGrooveList();
    const prob = profileProblem(p);
    $('profileError').hidden = !prob;
    $('profileError').textContent = prob || '';
  }
}

function renderCutList() {
  const p = app.project;
  const list = $('cutList');
  if (!list.closest('details').open) return;
  const order = p.cuts.points.map((q, i) => i).sort((a, b) => p.cuts.points[a].x - p.cuts.points[b].x);
  const sig = order.join(',');
  if (list.dataset.sig !== sig) {
    list.dataset.sig = sig;
    list.innerHTML = order.length
      ? order
          .map(
            (i, n) => `<div class="cut-row" data-cut="${i}">
          <span class="no">${n + 1}.</span>
          <label>vállól (mm)<input data-k="x" inputmode="decimal"></label>
          <label>magasság (mm)<input data-k="y" inputmode="decimal"></label>
          <button class="row-del" data-del="${i}" aria-label="Törlés">✕</button>
        </div>`,
          )
          .join('')
      : '<span class="muted">Még nincs bevágás. Koppints a képernyőn a bevágások aljához.</span>';
  }
  list.querySelectorAll('.cut-row').forEach((row) => {
    const q = p.cuts.points[+row.dataset.cut];
    row.querySelectorAll('input').forEach((inp) => {
      if (document.activeElement !== inp) inp.value = fmt(q[inp.dataset.k], 2);
    });
  });
}

function renderGrooveList() {
  const p = app.project;
  const list = $('grooveList');
  const sig = String(p.profile.grooves.length);
  if (list.dataset.sig !== sig) {
    list.dataset.sig = sig;
    list.innerHTML = p.profile.grooves.length
      ? p.profile.grooves
          .map(
            (g, i) => `<div class="groove-row" data-groove="${i}">
          <label>${i + 1}. oldal<select data-k="side"><option value="front">elöl</option><option value="back">hátul</option></select></label>
          <label>kezdet<input data-k="from" inputmode="decimal"></label>
          <label>szélesség<input data-k="width" inputmode="decimal"></label>
          <label>mélység<input data-k="depth" inputmode="decimal"></label>
          <button class="row-del" data-del="${i}" aria-label="Törlés">✕</button>
        </div>`,
          )
          .join('')
      : '<span class="muted">Nincs horony – lapos pengét készít.</span>';
  }
  list.querySelectorAll('.groove-row').forEach((row) => {
    const g = p.profile.grooves[+row.dataset.groove];
    row.querySelectorAll('input, select').forEach((el) => {
      if (document.activeElement === el) return;
      el.value = el.dataset.k === 'side' ? g.side : fmt(g[el.dataset.k], 2);
    });
  });
}

// ---------------------------------------------------------------------------------------
// steps

function layout3D() {
  const { top, bottom } = app.visibleRect();
  const c = $('view3d');
  c.style.top = top + 'px';
  c.style.height = Math.max(80, bottom - top) + 'px';
  if (viewer) viewer.requestDraw();
}

function setStep(step) {
  if (app.step === 'calib' && step !== 'calib') app.calibBackup = null;
  app.step = step;
  if (step !== 'calib') {
    app.settings.step = step;
    app.saveSettings();
  }
  if (step !== 'blade') app.moveAll = false;
  if (app.selected && !app.handles().some((h) => h.id === app.selected)) app.selected = null;
  document.body.dataset.step = step;
  const is3d = step === 'model';
  $('view3d').hidden = !is3d;
  updatePanel();
  if (is3d) {
    if (!viewer) {
      viewer = new Viewer($('view3d'));
      if (viewer.failed) toast('A 3D előnézet nem támogatott ezen az eszközön, de az STL letölthető.', 4000);
    }
    viewer.setTheme(chromeDark());
    layout3D();
    buildModel();
  }
  render();
  checkWarnings();
}

function buildModel() {
  const p = app.project;
  $('projName').value = p.name;
  $('modelError').hidden = true;
  $('modelWarn').hidden = true;
  try {
    const t0 = performance.now();
    const m = keyMesh(p);
    const c = checkMesh(m.positions, m.indices);
    app.mesh = m;
    viewer.setMesh(m.positions, m.indices);
    const ms = Math.round(performance.now() - t0);
    $('modelInfo').innerHTML =
      `Méret: <b>${fmt(m.size[0], 1)} × ${fmt(m.size[1], 1)} × ${fmt(m.size[2], 2)} mm</b> · ` +
      `${c.triangles.toLocaleString('hu-HU')} háromszög · ${fmt(c.volume / 1000, 2)} cm³ · ` +
      (c.watertight ? '<span class="ok">✔ zárt, nyomtatható háló</span>' : '⚠ a háló nem zárt') +
      `<span class="muted"> · ${ms} ms</span>`;
    renderStrength();
    if (m.warnings.length) {
      $('modelWarn').hidden = false;
      $('modelWarn').textContent = m.warnings.join(' ');
    }
    if (!p.cuts.points.length) {
      $('modelWarn').hidden = false;
      $('modelWarn').textContent = ($('modelWarn').textContent + ' Még nincs bejelölve bevágás (2. lépés).').trim();
    }
  } catch (err) {
    app.mesh = null;
    $('modelInfo').textContent = '';
    $('modelError').hidden = false;
    $('modelError').textContent = 'Nem sikerült a modellt elkészíteni: ' + err.message;
  }
}

const RATING = {
  good: ['Jó', 'könnyen járó zárhoz elegendő.'],
  ok: ['Közepes', 'csak könnyen járó zárhoz, óvatosan.'],
  weak: ['Gyenge', 'nagy a törés veszélye.'],
};

function renderStrength() {
  const box = $('strength');
  const r = app.mesh ? strengthReport(app.project, app.settings.material) : null;
  box.hidden = !r;
  if (viewer) viewer.setMarker(null);
  if (!r) return;
  const [label, advice] = RATING[r.rating];
  $('strengthBadge').className = 'badge ' + r.rating;
  $('strengthBadge').textContent = label;
  $('strengthText').innerHTML =
    `Leggyengébb pont: <b>${fmt(r.x, 1)} mm-re a vállól</b> (piros gyűrű). ` +
    `Becsült törőnyomaték: <b>~${fmt(r.effectiveNm, 2)} N·m</b> – ${advice} ` +
    `<button class="link-btn" data-help="strength">Mit jelent?</button>`;
  if (viewer) {
    // red ring around the blade at the weakest cross-section (F space: y is negated)
    const x = r.x;
    const T = app.project.profile.thickness;
    viewer.setMarker([x, -r.b, 0, x, -r.t, 0, x, -r.t, T, x, -r.b, T]);
  }
}

function fileBase() {
  const n = (app.project.name || 'kulcs')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return n || 'kulcs';
}

function stlFile() {
  if (!app.mesh) return null;
  const buf = toBinarySTL(app.mesh.positions, app.mesh.indices, app.project.name);
  return new File([buf], fileBase() + '.stl', { type: 'model/stl' });
}

function download(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function downloadStl() {
  const f = stlFile();
  if (!f) return toast('Előbb javítsd a hibát, utána tölthető le a modell.');
  download(f);
  toast(`${f.name} letöltve`);
}

function saveJson() {
  const data = JSON.stringify(app.project, null, 2);
  download(new File([data], fileBase() + '.kulcs.json', { type: 'application/json' }));
}

function chromeDark() {
  const t = document.documentElement.dataset.theme;
  if (t) return t === 'dark';
  return matchMedia('(prefers-color-scheme: dark)').matches;
}

function showSheet(html) {
  $('sheetBody').innerHTML = html;
  $('sheet').hidden = false;
}

function closeSheet() {
  $('sheet').hidden = true;
  if (!app.settings.introSeen) {
    app.settings.introSeen = true;
    app.saveSettings();
    if (!app.settings.calibrated) startCalibration();
  }
}

function startCalibration() {
  app.calibBackup = app.settings.pxPerMm;
  setStep('calib');
}

function checkWarnings() {
  const msgs = [];
  const vv = window.visualViewport;
  if (vv && vv.scale > 1.02) msgs.push('A nézet nagyítva van – csippentéssel állítsd vissza, különben a méretek nem pontosak.');
  if (isCoarse && MARK_STEPS.concat('calib').includes(app.step) && window.innerWidth > window.innerHeight) {
    msgs.push('Fordítsd a telefont álló helyzetbe.');
  }
  if (MARK_STEPS.includes(app.step) && !app.settings.calibrated) msgs.push('A képernyő még nincs kalibrálva – a méretek nem pontosak (Menü → Kalibrálás).');
  $('banner').hidden = !msgs.length;
  $('banner').textContent = msgs.join(' ');
}

// ---------------------------------------------------------------------------------------
// wiring

function bind() {
  $('btnPrev').addEventListener('click', () => {
    const i = STEPS.indexOf(app.step);
    if (i > 0) setStep(STEPS[i - 1]);
  });
  $('btnNext').addEventListener('click', () => {
    const i = STEPS.indexOf(app.step);
    if (app.step === 'model') downloadStl();
    else setStep(STEPS[i + 1]);
  });
  $('btnUndo').addEventListener('click', () => {
    const prev = app.undo.pop();
    if (!prev) return;
    app.project = normalizeProject(JSON.parse(prev));
    app._lastAct = null;
    if (app.selected && !app.handles().some((h) => h.id === app.selected)) app.selected = null;
    app.changed();
    if (app.step === 'model') buildModel();
    updateUndo();
  });
  $('btnHelp').addEventListener('click', () => showSheet(HELP[app.step] || INTRO));
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-help]');
    if (b) showSheet(HELP[b.dataset.help]);
  });
  $('sheetClose').addEventListener('click', closeSheet);
  $('sheet').addEventListener('click', (e) => {
    if (e.target === $('sheet')) closeSheet();
  });

  // menu
  $('btnMenu').addEventListener('click', () => {
    $('themeName').textContent = app.settings.stageTheme === 'dark' ? 'sötét' : 'világos';
    $('gridName').textContent = app.settings.grid ? 'be' : 'ki';
    $('menu').hidden = false;
  });
  $('menuClose').addEventListener('click', () => ($('menu').hidden = true));
  $('menu').addEventListener('click', (e) => {
    if (e.target === $('menu')) $('menu').hidden = true;
  });
  document.querySelectorAll('[data-menu]').forEach((b) =>
    b.addEventListener('click', () => {
      $('menu').hidden = true;
      menuAction(b.dataset.menu);
    }),
  );
  $('fileInput').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const before = app.snapshot();
      app.project = normalizeProject(data);
      app.undo.push(before);
      app.selected = null;
      app.centerTemplate();
      if (app.step === 'model') buildModel();
      toast('Projekt betöltve');
    } catch {
      toast('Ez nem érvényes kulcs projekt fájl.');
    }
  });

  // calibration
  $('calRange').addEventListener('input', (e) => app.setScale(parseFloat(e.target.value)));
  $('calRange').addEventListener('change', () => app.saveSettings());
  $('calMinus').addEventListener('click', () => {
    app.setScale(app.settings.pxPerMm - 0.01);
    app.saveSettings();
  });
  $('calPlus').addEventListener('click', () => {
    app.setScale(app.settings.pxPerMm + 0.01);
    app.saveSettings();
  });
  $('calCancel').addEventListener('click', () => {
    if (app.calibBackup) app.settings.pxPerMm = app.calibBackup;
    app.saveSettings();
    setStep(app.settings.step || 'blade');
  });
  $('calDone').addEventListener('click', () => {
    const wasCalibrated = app.settings.calibrated;
    app.settings.calibrated = true;
    app.saveSettings();
    setStep(app.settings.step && app.settings.step !== 'calib' ? app.settings.step : 'blade');
    if (!wasCalibrated) app.centerTemplate();
    toast('Kalibrálás mentve');
  });

  // marking tools
  document.querySelectorAll('[data-nudge]').forEach((b) => {
    let timer = 0;
    let rep = 0;
    const stop = () => {
      clearTimeout(timer);
      clearInterval(rep);
    };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      app.nudge(b.dataset.nudge);
      timer = setTimeout(() => (rep = setInterval(() => app.nudge(b.dataset.nudge), 70)), 450);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, stop));
  });
  $('btnStep').addEventListener('click', () => {
    const i = NUDGE_STEPS.indexOf(app.settings.nudge);
    app.settings.nudge = NUDGE_STEPS[(i + 1) % NUDGE_STEPS.length];
    app.saveSettings();
    render();
  });
  $('btnCollapse').addEventListener('click', () => {
    document.body.classList.toggle('collapsed');
    app.settings.collapsed = document.body.classList.contains('collapsed');
    app.saveSettings();
  });
  $('btnFine').addEventListener('click', () => {
    app.fine = !app.fine;
    toast(app.fine ? 'Finom mód: a pont negyed sebességgel mozog' : 'Normál mozgatás');
    render();
  });
  $('btnMoveAll').addEventListener('click', () => {
    app.moveAll = !app.moveAll;
    if (app.moveAll) app.selected = null;
    render();
  });
  $('btnCenter').addEventListener('click', () => {
    const before = app.snapshot();
    app.centerTemplate();
    app.commit(before);
  });
  document.querySelectorAll('[data-rotate]').forEach((b) =>
    b.addEventListener('click', () => app.act('rotate-btn', () => rotateFrame(app.project, +b.dataset.rotate * 0.2 * DEG, !app.moveAll))),
  );

  // generic numeric fields
  document.querySelectorAll('[data-field]').forEach((inp) => {
    inp.addEventListener('change', () => {
      const def = FIELDS[inp.dataset.field];
      const v = parseNum(inp.value);
      if (!Number.isFinite(v)) {
        setField(inp);
        return;
      }
      app.act('field:' + inp.dataset.field + Math.random(), () => def[1](app.project, v));
      inp.blur();
      setField(inp);
      if (app.step === 'model') buildModel();
    });
    inp.addEventListener('focus', () => inp.select());
  });

  // cuts
  $('cutStyle').addEventListener('change', (e) => app.act('style', () => (app.project.cuts.style = e.target.value)));
  $('chkDouble').addEventListener('change', (e) => app.act('double', () => (app.project.cuts.doubleSided = e.target.checked)));
  $('btnDelCut').addEventListener('click', deleteSelectedCut);
  $('btnEven').addEventListener('click', () => {
    const pts = app.project.cuts.points;
    if (pts.length < 3) return toast('Legalább 3 bevágás kell hozzá.');
    app.act('even', () => {
      const order = pts.map((q, i) => i).sort((a, b) => pts[a].x - pts[b].x);
      const x0 = pts[order[0]].x;
      const x1 = pts[order[order.length - 1]].x;
      order.forEach((i, n) => (pts[i].x = x0 + ((x1 - x0) * n) / (order.length - 1)));
    });
    const xs = pts.map((q) => q.x);
    toast(`Bevágások távolsága: ${fmt((Math.max(...xs) - Math.min(...xs)) / (pts.length - 1), 2)} mm`);
  });
  $('btnClearCuts').addEventListener('click', () => {
    if (!app.project.cuts.points.length || !confirm('Biztosan törlöd az összes bevágást?')) return;
    app.act('clear', () => (app.project.cuts.points = []));
    app.selected = null;
  });
  $('cutList').addEventListener('change', (e) => {
    const row = e.target.closest('.cut-row');
    if (!row || !e.target.dataset.k) return;
    const v = parseNum(e.target.value);
    if (!Number.isFinite(v)) return render();
    app.act('cutfield' + Math.random(), () => (app.project.cuts.points[+row.dataset.cut][e.target.dataset.k] = v));
  });
  $('cutList').addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (!del) return;
    app.selected = 'cut:' + del.dataset.del;
    deleteSelectedCut();
  });
  $('cutList').closest('details').addEventListener('toggle', () => render());

  // head
  $('chkHole').addEventListener('change', (e) => app.act('hole', () => (app.project.head.hole = e.target.checked)));

  // profile
  $('btnAddGroove').addEventListener('click', () => {
    const g = app.project.profile.grooves;
    if (g.length >= 12) return toast('Legfeljebb 12 horony adható meg.');
    app.act('groove-add', () => g.push({ side: g.length % 2 ? 'back' : 'front', from: 1 + g.length * 1.5, width: 1, depth: 0.5 }));
  });
  $('grooveList').addEventListener('change', (e) => {
    const row = e.target.closest('.groove-row');
    if (!row || !e.target.dataset.k) return;
    const k = e.target.dataset.k;
    const g = app.project.profile.grooves[+row.dataset.groove];
    if (k === 'side') {
      app.act('groove' + Math.random(), () => (g.side = e.target.value));
      return;
    }
    const v = parseNum(e.target.value);
    if (!Number.isFinite(v)) return render();
    app.act('groove' + Math.random(), () => (g[k] = v));
  });
  $('grooveList').addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (!del) return;
    app.act('groove-del', () => app.project.profile.grooves.splice(+del.dataset.del, 1));
  });

  // model
  $('material').innerHTML = Object.entries(MATERIALS)
    .map(([k, m]) => `<option value="${k}">${escapeHtml(m.name)}</option>`)
    .join('');
  $('material').value = MATERIALS[app.settings.material] ? app.settings.material : 'petg';
  $('material').addEventListener('change', (e) => {
    app.settings.material = e.target.value;
    app.saveSettings();
    renderStrength();
    toast(MATERIALS[e.target.value].note);
  });
  $('btnStl').addEventListener('click', downloadStl);
  $('btnSaveJson').addEventListener('click', saveJson);
  $('projName').addEventListener('change', (e) => app.act('name', () => (app.project.name = e.target.value.trim() || 'Kulcs')));
  if (navigator.canShare) {
    try {
      if (navigator.canShare({ files: [new File(['x'], 'a.stl', { type: 'model/stl' })] })) $('btnShare').hidden = false;
    } catch {
      /* not supported */
    }
  }
  $('btnShare').addEventListener('click', async () => {
    const f = stlFile();
    if (!f) return;
    try {
      await navigator.share({ files: [f], title: app.project.name });
    } catch (err) {
      if (err && err.name !== 'AbortError') toast('A megosztás nem sikerült – használd a letöltést.');
    }
  });

  // keyboard (desktop)
  window.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, select, textarea')) return;
    const dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key];
    if (dir && MARK_STEPS.includes(app.step)) {
      e.preventDefault();
      app.nudge(dir);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && app.step === 'cuts') {
      deleteSelectedCut();
    } else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      $('btnUndo').click();
    }
  });

  // layout changes
  const onResize = () => {
    render();
    if (app.step === 'model') layout3D();
    checkWarnings();
  };
  window.addEventListener('resize', onResize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', checkWarnings);
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--panel-h', $('panel').offsetHeight + 'px');
    if (app.step === 'model') layout3D();
    if (app.step === 'profile') render();
  }).observe($('panel'));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (viewer) viewer.setTheme(chromeDark());
    render();
  });
  // iOS: block pinch zoom gestures outside the 3D view
  document.addEventListener('gesturestart', (e) => e.preventDefault());
}

function deleteSelectedCut() {
  const id = app.selected;
  if (!id || !id.startsWith('cut:')) return toast('Előbb koppints egy bevágásra.');
  const i = +id.slice(4);
  app.selected = null;
  app.act('del', () => app.project.cuts.points.splice(i, 1));
}

function menuAction(a) {
  switch (a) {
    case 'calib':
      startCalibration();
      break;
    case 'center': {
      const before = app.snapshot();
      app.centerTemplate();
      app.commit(before);
      if (!MARK_STEPS.includes(app.step)) setStep('blade');
      break;
    }
    case 'fullscreen': {
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (!req) {
        toast('Teljes képernyőhöz add az oldalt a kezdőképernyőhöz (Megosztás → Főképernyőhöz adás).', 4000);
        break;
      }
      if (document.fullscreenElement) document.exitFullscreen();
      else
        Promise.resolve(req.call(el))
          .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('portrait').catch(() => {}))
          .catch(() => toast('A teljes képernyő nem érhető el.'));
      break;
    }
    case 'theme':
      app.settings.stageTheme = app.settings.stageTheme === 'dark' ? 'light' : 'dark';
      app.saveSettings();
      render();
      break;
    case 'grid':
      app.settings.grid = !app.settings.grid;
      app.saveSettings();
      render();
      break;
    case 'save':
      saveJson();
      break;
    case 'load':
      $('fileInput').click();
      break;
    case 'new':
      if (!confirm('Új kulcsot kezdesz? A jelenlegi jelölések elvesznek (előtte mentheted fájlba).')) break;
      app.undo.push(app.snapshot());
      app.project = defaultProject();
      app.selected = null;
      app.centerTemplate();
      setStep('blade');
      break;
    case 'intro':
      showSheet(INTRO);
      break;
  }
}

// ---------------------------------------------------------------------------------------
// start

function start() {
  stage = new Stage($('stage'), app);
  document.body.classList.toggle('collapsed', !!app.settings.collapsed);
  const stored = loadProject();
  app.project = stored || defaultProject();
  bind();
  if (!app.settings.calibrated) {
    app.calibBackup = app.settings.pxPerMm;
    setStep('calib');
  } else {
    setStep(STEPS.includes(app.settings.step) ? app.settings.step : 'blade');
  }
  if (!stored) {
    // place the template once the panel has its final size
    requestAnimationFrame(() => {
      const prevStep = app.step;
      if (prevStep === 'calib') {
        document.body.dataset.step = 'blade';
        app.step = 'blade';
        app.centerTemplate();
        app.step = prevStep;
        document.body.dataset.step = prevStep;
      } else {
        app.centerTemplate();
      }
      render();
    });
  }
  if (!app.settings.introSeen) showSheet(INTRO);

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  window.app = app; // handy for debugging
}

start();
