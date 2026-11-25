// Minimal WebGL viewer for the generated key: flat shading, a print-bed grid, orbit with
// one finger, pinch / mouse-wheel zoom, double tap to reset.

const VS = `
attribute vec3 aPos;
attribute vec3 aNor;
uniform mat4 uMVP;
uniform mat4 uMV;
uniform mat3 uN;
varying vec3 vN;
varying vec3 vP;
void main() {
  vN = uN * aNor;
  vP = (uMV * vec4(aPos, 1.0)).xyz;
  gl_Position = uMVP * vec4(aPos, 1.0);
}`;

const FS = `
precision mediump float;
varying vec3 vN;
varying vec3 vP;
uniform vec3 uColor;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(-vP);
  vec3 l1 = normalize(vec3(0.45, 0.65, 0.9));
  vec3 l2 = normalize(vec3(-0.7, -0.2, 0.4));
  float d = max(dot(n, l1), 0.0) * 0.72 + max(dot(n, l2), 0.0) * 0.28 + 0.2;
  float s = pow(max(dot(n, normalize(l1 + v)), 0.0), 48.0) * 0.45;
  gl_FragColor = vec4(uColor * d + vec3(s), 1.0);
}`;

const LVS = `
attribute vec3 aPos;
uniform mat4 uMVP;
void main() { gl_Position = uMVP * vec4(aPos, 1.0); }`;

const LFS = `
precision mediump float;
uniform vec4 uColor;
void main() { gl_FragColor = uColor; }`;

function compile(gl, vs, fs) {
  const prog = gl.createProgram();
  for (const [type, src] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(prog, s);
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  return prog;
}

function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

function lookAt(eye, c, up) {
  let zx = eye[0] - c[0], zy = eye[1] - c[1], zz = eye[2] - c[2];
  let l = Math.hypot(zx, zy, zz);
  zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz);
  xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return new Float32Array([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
    -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
    -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
    1,
  ]);
}

function mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

export class Viewer {
  constructor(canvas) {
    this.canvas = canvas;
    const opts = { antialias: true, alpha: false, preserveDrawingBuffer: false };
    const gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
    this.gl = gl;
    if (!gl) {
      this.failed = true;
      return;
    }
    this.prog = compile(gl, VS, FS);
    this.lprog = compile(gl, LVS, LFS);
    this.posBuf = gl.createBuffer();
    this.norBuf = gl.createBuffer();
    this.gridBuf = gl.createBuffer();
    this.count = 0;
    this.gridCount = 0;
    this.color = [0.85, 0.68, 0.3];
    this.background = [0.94, 0.95, 0.97];
    this.target = [0, 0, 0];
    this.radius = 30;
    this.resetView();
    this.pointers = new Map();
    this.pending = false;
    this.bindEvents();
  }

  bindEvents() {
    const c = this.canvas;
    let lastTap = 0;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
      const now = performance.now();
      if (this.pointers.size === 1 && now - lastTap < 300) {
        this.resetView();
        this.requestDraw();
      }
      lastTap = now;
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      const prev = this.pointers.get(e.pointerId);
      if (this.pointers.size === 1) {
        this.az -= (e.clientX - prev[0]) * 0.008;
        this.el = Math.max(-1.5, Math.min(1.5, this.el + (e.clientY - prev[1]) * 0.008));
      } else if (this.pointers.size === 2) {
        const pts = [...this.pointers.values()];
        const before = Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]);
        this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
        const pts2 = [...this.pointers.values()];
        const after = Math.hypot(pts2[0][0] - pts2[1][0], pts2[0][1] - pts2[1][1]);
        if (before > 0 && after > 0) this.zoom(before / after);
      }
      this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
      this.requestDraw();
    });
    const up = (e) => this.pointers.delete(e.pointerId);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoom(Math.exp(e.deltaY * 0.0015));
        this.requestDraw();
      },
      { passive: false },
    );
  }

  zoom(f) {
    this.dist = Math.max(this.radius * 0.6, Math.min(this.radius * 12, this.dist * f));
  }

  resetView() {
    // Camera behind the head looking towards the tip: the key appears tip-up with the cuts
    // on the right, just like it lay on the screen while marking.
    this.az = Math.PI;
    this.el = 0.95;
    this.dist = this.radius / Math.sin((40 * Math.PI) / 360) * 1.1;
  }

  setMesh(positions, indices) {
    if (this.failed) return;
    const gl = this.gl;
    const n = indices.length;
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let t = 0; t < n; t += 3) {
      const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
      const P = positions;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      [a, b, c].forEach((v, k) => {
        const o = (t + k) * 3;
        pos[o] = P[v]; pos[o + 1] = P[v + 1]; pos[o + 2] = P[v + 2];
        nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
        minX = Math.min(minX, P[v]); maxX = Math.max(maxX, P[v]);
        minY = Math.min(minY, P[v + 1]); maxY = Math.max(maxY, P[v + 1]);
        minZ = Math.min(minZ, P[v + 2]); maxZ = Math.max(maxZ, P[v + 2]);
      });
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.norBuf);
    gl.bufferData(gl.ARRAY_BUFFER, nor, gl.STATIC_DRAW);
    this.count = n;

    const hadMesh = this.hasMesh;
    this.hasMesh = true;
    this.target = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
    this.radius = Math.max(5, Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2);

    // print-bed grid, 5 mm spacing
    const g = [];
    const step = 5;
    const x0 = Math.floor((minX - 8) / step) * step, x1 = Math.ceil((maxX + 8) / step) * step;
    const y0 = Math.floor((minY - 8) / step) * step, y1 = Math.ceil((maxY + 8) / step) * step;
    for (let x = x0; x <= x1 + 1e-9; x += step) g.push(x, y0, -0.02, x, y1, -0.02);
    for (let y = y0; y <= y1 + 1e-9; y += step) g.push(x0, y, -0.02, x1, y, -0.02);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gridBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g), gl.STATIC_DRAW);
    this.gridCount = g.length / 3;
    if (!hadMesh) this.resetView();
    this.requestDraw();
  }

  setTheme(dark) {
    this.background = dark ? [0.11, 0.12, 0.14] : [0.94, 0.95, 0.97];
    this.gridColor = dark ? [1, 1, 1, 0.16] : [0, 0, 0, 0.14];
    this.requestDraw();
  }

  requestDraw() {
    if (this.pending || this.failed) return;
    this.pending = true;
    requestAnimationFrame(() => {
      this.pending = false;
      this.draw();
    });
  }

  draw() {
    const gl = this.gl;
    if (!gl) return;
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(c.clientWidth * dpr));
    const h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.clearColor(...this.background, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!this.hasMesh) return;
    gl.enable(gl.DEPTH_TEST);

    const t = this.target;
    const ce = Math.cos(this.el);
    const eye = [t[0] + this.dist * ce * Math.cos(this.az), t[1] + this.dist * ce * Math.sin(this.az), t[2] + this.dist * Math.sin(this.el)];
    const view = lookAt(eye, t, [0, 0, 1]);
    const proj = perspective((40 * Math.PI) / 180, w / h, Math.max(0.1, this.dist - this.radius * 3), this.dist + this.radius * 3);
    const mvp = mul(proj, view);

    // grid
    gl.useProgram(this.lprog);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.lprog, 'uMVP'), false, mvp);
    gl.uniform4fv(gl.getUniformLocation(this.lprog, 'uColor'), this.gridColor || [0, 0, 0, 0.14]);
    const lp = gl.getAttribLocation(this.lprog, 'aPos');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gridBuf);
    gl.enableVertexAttribArray(lp);
    gl.vertexAttribPointer(lp, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.LINES, 0, this.gridCount);
    gl.disableVertexAttribArray(lp);
    gl.disable(gl.BLEND);

    // key
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.prog, 'uMVP'), false, mvp);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.prog, 'uMV'), false, view);
    const nm = new Float32Array([view[0], view[1], view[2], view[4], view[5], view[6], view[8], view[9], view[10]]);
    gl.uniformMatrix3fv(gl.getUniformLocation(this.prog, 'uN'), false, nm);
    gl.uniform3fv(gl.getUniformLocation(this.prog, 'uColor'), this.color);
    const ap = gl.getAttribLocation(this.prog, 'aPos');
    const an = gl.getAttribLocation(this.prog, 'aNor');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.enableVertexAttribArray(ap);
    gl.vertexAttribPointer(ap, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.norBuf);
    gl.enableVertexAttribArray(an);
    gl.vertexAttribPointer(an, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, this.count);
    gl.disableVertexAttribArray(ap);
    gl.disableVertexAttribArray(an);
  }
}
