// Simulaciones de la página principal:
//  1. Orbitales del átomo de hidrógeno (muestreo de |ψ_nlm|²) en el hero.
//  2. Experimento de la doble rendija con detecciones una a una.
//  3. Ilustración de una PINN aprendiendo un oscilador amortiguado.
//  4. Red neuronal con señales viajando por sus conexiones.

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isSmall = window.matchMedia('(max-width: 760px)').matches;

function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: rect.width, h: rect.height, dpr };
}

// Ejecuta `frame` solo mientras el canvas es visible.
function animateWhenVisible(canvas, frame) {
  let visible = false, raf = 0, last = performance.now();
  const loop = now => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    frame(dt, now / 1000);
    if (visible) raf = requestAnimationFrame(loop);
  };
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) { last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); }
  }).observe(canvas);
}

/* ==========================================================
   1. Orbitales del hidrógeno
   ========================================================== */

function laguerre(k, alpha, x) {
  if (k === 0) return 1;
  let l0 = 1, l1 = 1 + alpha - x;
  for (let i = 1; i < k; i++) {
    const l2 = ((2 * i + 1 + alpha - x) * l1 - (i + alpha) * l0) / (i + 1);
    l0 = l1; l1 = l2;
  }
  return l1;
}

function legendre(l, m, x) {
  let pmm = 1;
  if (m > 0) {
    const s = Math.sqrt((1 - x) * (1 + x));
    let f = 1;
    for (let i = 1; i <= m; i++) { pmm *= -f * s; f += 2; }
  }
  if (l === m) return pmm;
  let pmmp1 = x * (2 * m + 1) * pmm;
  if (l === m + 1) return pmmp1;
  let pll = 0;
  for (let ll = m + 2; ll <= l; ll++) {
    pll = (x * (2 * ll - 1) * pmmp1 - (ll + m - 1) * pmm) / (ll - m);
    pmm = pmmp1; pmmp1 = pll;
  }
  return pll;
}

const radial = (n, l, r) => {
  const rho = 2 * r / n;
  return Math.pow(rho, l) * Math.exp(-rho / 2) * laguerre(n - l - 1, 2 * l + 1, rho);
};
const angular = (l, m, u, phi) => {
  const p = legendre(l, Math.abs(m), u);
  return m > 0 ? p * Math.cos(m * phi) : m < 0 ? p * Math.sin(-m * phi) : p;
};

// Devuelve N puntos (x, y, z normalizados) y el signo de ψ en cada uno.
function sampleOrbital(n, l, m, N) {
  const rmax = 4 * n * n + 10, steps = 3000;
  const cdf = new Float64Array(steps + 1);
  for (let i = 1; i <= steps; i++) {
    const r = (i / steps) * rmax, R = radial(n, l, r);
    cdf[i] = cdf[i - 1] + r * r * R * R;
  }
  const total = cdf[steps];
  let r97 = rmax;
  for (let i = 0; i <= steps; i++) if (cdf[i] / total > 0.97) { r97 = (i / steps) * rmax; break; }

  let ymax = 0;
  for (let i = 0; i <= 180; i++) for (let j = 0; j < 180; j++) {
    const y = angular(l, m, -1 + 2 * i / 180, (j / 180) * 2 * Math.PI);
    ymax = Math.max(ymax, y * y);
  }
  ymax *= 1.05;

  const pts = new Float32Array(N * 3), sign = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    // radio por inversión de la distribución acumulada
    const target = Math.random() * total;
    let lo = 0, hi = steps;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < target) lo = mid + 1; else hi = mid; }
    const r = ((lo - 1 + Math.random()) / steps) * rmax;
    // ángulos por rechazo
    let u, phi, y;
    do {
      u = -1 + 2 * Math.random();
      phi = Math.random() * 2 * Math.PI;
      y = angular(l, m, u, phi);
    } while (Math.random() * ymax > y * y);
    const s = Math.sqrt(1 - u * u);
    pts[k * 3] = (r * s * Math.cos(phi)) / r97;
    pts[k * 3 + 1] = (r * s * Math.sin(phi)) / r97;
    pts[k * 3 + 2] = (r * u) / r97;
    sign[k] = radial(n, l, r) * y >= 0 ? 1 : 0;
  }
  return { pts, sign };
}

const ORBITALS = [
  { n: 3, l: 2, m: 0, name: '3d', sub: 'z²' },
  { n: 2, l: 1, m: 0, name: '2p', sub: 'z' },
  { n: 3, l: 2, m: 1, name: '3d', sub: 'xz' },
  { n: 4, l: 3, m: 0, name: '4f', sub: 'z³' },
  { n: 3, l: 1, m: 0, name: '3p', sub: 'z' },
  { n: 4, l: 3, m: 3, name: '4f', sub: 'x(x²−3y²)' },
  { n: 4, l: 2, m: 0, name: '4d', sub: 'z²' },
  { n: 5, l: 4, m: 2, name: '5g', sub: 'z²(x²−y²)' },
];

function initOrbital() {
  const canvas = document.getElementById('orbital');
  if (!canvas) return;
  const label = document.getElementById('orbital-label');
  const dots = document.getElementById('orbital-dots');
  const N = isSmall ? 5000 : 9000;

  let view = fitCanvas(canvas);
  window.addEventListener('resize', () => { view = fitCanvas(canvas); });

  const cache = new Map();
  const get = i => {
    if (!cache.has(i)) { const o = ORBITALS[i]; cache.set(i, sampleOrbital(o.n, o.l, o.m, N)); }
    return cache.get(i);
  };

  const cur = new Float32Array(N * 3), from = new Float32Array(N * 3);
  const col = new Float32Array(N), colFrom = new Float32Array(N);
  let index = 0, target = get(0), morph = 1, sinceSwitch = 0;
  cur.set(target.pts); col.set(target.sign);

  function setLabel() {
    const o = ORBITALS[index];
    if (label) label.innerHTML =
      `<span class="ol-psi">ψ<sub>${o.n}${o.l}${o.m}</sub></span>` +
      `<span class="ol-name">orbital ${o.name}<sub>${o.sub}</sub></span>` +
      `<span class="ol-q">n = ${o.n} · ℓ = ${o.l} · m = ${o.m}</span>`;
    if (dots) [...dots.children].forEach((d, i) => d.classList.toggle('on', i === index));
  }

  function go(i) {
    index = (i + ORBITALS.length) % ORBITALS.length;
    from.set(cur); colFrom.set(col);
    target = get(index);
    morph = 0; sinceSwitch = 0;
    setLabel();
  }

  if (dots) {
    ORBITALS.forEach((o, i) => {
      const b = document.createElement('button');
      b.setAttribute('aria-label', `Mostrar orbital ${o.name} ${o.sub}`);
      b.addEventListener('click', () => go(i));
      dots.appendChild(b);
    });
  }
  setLabel();

  // Precalcula el siguiente orbital sin bloquear el primer render.
  setTimeout(() => get(1), 600);

  let angle = 0.6, tilt = 0.35, mx = 0, my = 0, dragging = false, lastX = 0, lastY = 0, spin = 0;
  canvas.addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect();
    mx = (e.clientX - r.left) / r.width - 0.5;
    my = (e.clientY - r.top) / r.height - 0.5;
    if (dragging) {
      spin += (e.clientX - lastX) * 0.01;
      tilt = Math.max(-1.2, Math.min(1.2, tilt + (e.clientY - lastY) * 0.006));
      lastX = e.clientX; lastY = e.clientY;
    }
  });
  let downAt = 0;
  canvas.addEventListener('pointerdown', e => { dragging = true; downAt = performance.now(); lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointerup', () => { dragging = false; if (performance.now() - downAt < 200) go(index + 1); });
  canvas.addEventListener('pointerleave', () => { mx = my = 0; });

  const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  animateWhenVisible(canvas, dt => {
    const { ctx, w, h } = view;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);

    sinceSwitch += dt;
    if (!reduceMotion && sinceSwitch > 7.5) go(index + 1);
    if (morph < 1) {
      morph = Math.min(1, morph + dt / 1.6);
      const e = ease(morph);
      for (let i = 0; i < N * 3; i++) cur[i] = from[i] + (target.pts[i] - from[i]) * e;
      for (let i = 0; i < N; i++) col[i] = colFrom[i] + (target.sign[i] - colFrom[i]) * e;
    }

    if (!reduceMotion) angle += dt * 0.25;
    const a = angle + spin + mx * 0.6;
    const b = tilt + my * 0.3;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    const cx = w / 2, cy = h / 2, scale = Math.min(w, h) * 0.44;

    // núcleo
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale * 0.5);
    g.addColorStop(0, 'rgba(155,123,255,0.22)');
    g.addColorStop(1, 'rgba(155,123,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < N; i++) {
      const x = cur[i * 3], y = cur[i * 3 + 1], z = cur[i * 3 + 2];
      const X = x * ca - y * sa;
      const Y = x * sa + y * ca;
      const sy = z * cb - Y * sb;
      const depth = z * sb + Y * cb;
      const p = 1 / (1.9 - depth * 0.45);
      const px = cx + X * scale * p * 1.9;
      const py = cy - sy * scale * p * 1.9;
      const c = col[i];
      const r = Math.round(255 * (1 - c) + 94 * c);
      const gg = Math.round(95 * (1 - c) + 231 * c);
      const bb = Math.round(210 * (1 - c) + 255 * c);
      const alpha = 0.3 + 0.45 * (depth + 1) / 2;
      ctx.fillStyle = `rgba(${r},${gg},${bb},${alpha.toFixed(3)})`;
      const s = 1.2 + 1.6 * p;
      ctx.fillRect(px, py, s, s);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill();
  });
}

/* ==========================================================
   2. Doble rendija
   ========================================================== */

function wavelengthToRGB(nm) {
  let r = 0, g = 0, b = 0;
  if (nm < 440) { r = -(nm - 440) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
  else { r = 1; }
  let f = 1;
  if (nm < 420) f = 0.4 + 0.6 * (nm - 380) / 40;
  else if (nm > 680) f = 0.4 + 0.6 * (700 - nm) / 20;
  return [r * f, g * f, b * f].map(v => Math.round(255 * Math.pow(v, 0.8)));
}

function initDoubleSlit() {
  const canvas = document.getElementById('slit');
  if (!canvas) return;
  const lambdaIn = document.getElementById('slit-lambda');
  const sepIn = document.getElementById('slit-sep');
  const observeIn = document.getElementById('slit-observe');
  const resetBtn = document.getElementById('slit-reset');
  const countEl = document.getElementById('slit-count');
  const lambdaOut = document.getElementById('slit-lambda-out');
  const sepOut = document.getElementById('slit-sep-out');

  // Rejilla de baja resolución para el campo ondulatorio.
  const GW = isSmall ? 220 : 340, GH = isSmall ? 150 : 210;
  const field = document.createElement('canvas');
  field.width = GW; field.height = GH;
  const fctx = field.getContext('2d');
  const img = fctx.createImageData(GW, GH);
  const BX = Math.round(GW * 0.26), SX = Math.round(GW * 0.74), SLIT_W = 4;

  const hits = document.createElement('canvas');
  let hctx;

  let view;
  const BINS = 120;
  let bins = new Float32Array(BINS), count = 0;

  const state = { nm: 520, sep: 34, observe: false };
  const lambdaPx = () => 6 + (state.nm - 380) / 320 * 9;

  function resize() {
    view = fitCanvas(canvas);
    hits.width = canvas.width; hits.height = canvas.height;
    hctx = hits.getContext('2d');
    reset();
  }
  function reset() {
    bins = new Float32Array(BINS); count = 0;
    if (hctx) hctx.clearRect(0, 0, hits.width, hits.height);
    if (countEl) countEl.textContent = '0';
  }

  // Intensidad teórica en la pantalla (coordenada y de la rejilla).
  function intensity(gy) {
    const k = 2 * Math.PI / lambdaPx();
    const y1 = GH / 2 - state.sep / 2, y2 = GH / 2 + state.sep / 2;
    const L = SX - BX;
    const r1 = Math.hypot(L, gy - y1), r2 = Math.hypot(L, gy - y2);
    const beta = k * SLIT_W * 0.5 * (gy - GH / 2) / Math.hypot(L, gy - GH / 2);
    const env = beta === 0 ? 1 : Math.pow(Math.sin(beta) / beta, 2);
    const inc = 1 / r1 + 1 / r2;
    const val = state.observe ? inc : inc + 2 * Math.cos(k * (r1 - r2)) / Math.sqrt(r1 * r2);
    return Math.max(0, val) * env;
  }
  let imax = 1;
  function updateMax() { imax = 0; for (let y = 0; y < GH; y++) imax = Math.max(imax, intensity(y)); }

  function onChange() {
    state.nm = +lambdaIn.value;
    state.sep = +sepIn.value;
    state.observe = observeIn.checked;
    if (lambdaOut) lambdaOut.textContent = `${state.nm} nm`;
    if (sepOut) sepOut.textContent = `${state.sep}`;
    const [r, g, b] = wavelengthToRGB(state.nm);
    canvas.parentElement.style.setProperty('--wave', `rgb(${r},${g},${b})`);
    updateMax();
    reset();
  }
  [lambdaIn, sepIn, observeIn].forEach(el => el && el.addEventListener('input', onChange));
  resetBtn && resetBtn.addEventListener('click', reset);

  resize();
  onChange();
  window.addEventListener('resize', resize);

  let t = 0;
  animateWhenVisible(canvas, dt => {
    const { ctx, w, h } = view;
    t += reduceMotion ? 0 : dt;
    const [cr, cg, cb] = wavelengthToRGB(state.nm);
    const k = 2 * Math.PI / lambdaPx(), omega = 7;
    const y1 = GH / 2 - state.sep / 2, y2 = GH / 2 + state.sep / 2;
    const d = img.data;

    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        let v = 0, amp = 0;
        if (x < BX) {
          v = Math.cos(k * x - omega * t); amp = 0.55;
        } else if (x < SX) {
          const dx = x - BX;
          const r1 = Math.hypot(dx, y - y1) + 1, r2 = Math.hypot(dx, y - y2) + 1;
          const w1 = Math.cos(k * r1 - omega * t) / Math.sqrt(r1);
          const w2 = Math.cos(k * r2 - omega * t) / Math.sqrt(r2);
          const boost = 0.75 + 1.1 * dx / (SX - BX);
          if (state.observe) { v = (Math.sqrt(w1 * w1 + w2 * w2) * 2.2 - 0.6) * boost; }
          else { v = (w1 + w2) * 2.2 * boost; }
          amp = 1;
        }
        const s = Math.max(0, v) * amp;
        const iBright = Math.min(1, s * s * 0.9);
        const o = (y * GW + x) * 4;
        d[o] = cr * iBright; d[o + 1] = cg * iBright; d[o + 2] = cb * iBright; d[o + 3] = 255;
      }
    }
    fctx.putImageData(img, 0, 0);

    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(field, 0, 0, w, h);
    ctx.globalAlpha = 1;

    const sx = (x) => x / GW * w, sy = (y) => y / GH * h;

    // barrera con dos rendijas
    ctx.fillStyle = '#1a1d2b';
    const bw = Math.max(5, w * 0.008), bx = sx(BX) - bw / 2, gap = sy(SLIT_W) * 0.9;
    ctx.fillRect(bx, 0, bw, sy(y1) - gap / 2);
    ctx.fillRect(bx, sy(y1) + gap / 2, bw, sy(y2) - sy(y1) - gap);
    ctx.fillRect(bx, sy(y2) + gap / 2, bw, h - sy(y2) - gap / 2);
    if (state.observe) {
      ctx.fillStyle = '#ffc46b';
      [y1, y2].forEach(yy => { ctx.beginPath(); ctx.arc(bx - 10, sy(yy), 4, 0, Math.PI * 2); ctx.fill(); });
    }

    // pantalla detectora
    const screenX = sx(SX);
    ctx.fillStyle = 'rgba(8,9,15,0.92)';
    ctx.fillRect(screenX, 0, w - screenX, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.moveTo(screenX + 0.5, 0); ctx.lineTo(screenX + 0.5, h); ctx.stroke();

    // nuevas detecciones: cada fotón cae en un solo punto
    const perFrame = reduceMotion ? 0 : (count < 400 ? 3 : count < 3000 ? 10 : count < 12000 ? 18 : 0);
    const stripW = (w - screenX) * 0.42;
    for (let n = 0; n < perFrame; n++) {
      let gy;
      do { gy = Math.random() * GH; } while (Math.random() * imax > intensity(gy));
      const px = screenX + 4 + Math.random() * (stripW - 8), py = sy(gy);
      hctx.fillStyle = `rgba(${cr},${cg},${cb},0.55)`;
      hctx.fillRect(px * view.dpr, py * view.dpr, 1.6 * view.dpr, 1.6 * view.dpr);
      bins[Math.min(BINS - 1, Math.floor(gy / GH * BINS))]++;
      count++;
      if (n === perFrame - 1) {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (countEl && perFrame) countEl.textContent = count.toLocaleString('es');
    ctx.drawImage(hits, 0, 0, w, h);

    // histograma acumulado y curva teórica
    const hx = screenX + stripW + 10, hw = w - hx - 10;
    let bmax = 1; for (let i = 0; i < BINS; i++) bmax = Math.max(bmax, bins[i]);
    ctx.fillStyle = `rgba(${cr},${cg},${cb},0.35)`;
    for (let i = 0; i < BINS; i++) {
      const bh = h / BINS;
      ctx.fillRect(hx, i * bh, (bins[i] / bmax) * hw, bh - 0.5);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let y = 0; y <= GH; y++) {
      const px = hx + intensity(y) / imax * hw, py = sy(y);
      y === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.stroke();

    // fuente
    ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
    ctx.shadowColor = `rgb(${cr},${cg},${cb})`;
    ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.arc(10, h / 2, 5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  });
}

/* ==========================================================
   3. PINN aprendiendo un oscilador amortiguado (ilustración)
   ========================================================== */

function initPINN() {
  const canvas = document.getElementById('pinn');
  if (!canvas) return;
  const epochEl = document.getElementById('pinn-epoch');
  const lossEl = document.getElementById('pinn-loss');
  let view = fitCanvas(canvas);
  window.addEventListener('resize', () => { view = fitCanvas(canvas); });

  const gamma = 0.35, omega = 4.2, T = 6;
  const exact = t => Math.exp(-gamma * t) * Math.cos(omega * t);
  let err;
  const newError = () => {
    const c = Array.from({ length: 5 }, () => [(Math.random() - 0.5) * 1.4, 0.3 + Math.random() * 2.2, Math.random() * 6]);
    err = t => c.reduce((s, [a, f, p]) => s + a * Math.sin(f * t + p), 0) - 0.4 * Math.sin(0.6 * t + c[0][2]);
  };
  newError();
  const colloc = Array.from({ length: 28 }, (_, i) => (i + 0.5) / 28 * T);
  const data = [0, 0.15, 0.3];

  let phase = 0; // 0..1 entrenamiento, luego pausa
  animateWhenVisible(canvas, dt => {
    const { ctx, w, h } = view;
    phase += reduceMotion ? 1 : dt / 9;
    if (phase > 1.35) { phase = 0; newError(); }
    const p = Math.min(1, phase);
    const decay = Math.exp(-6 * p) * (1 - p) + 0.004 * (1 - p);
    const pred = t => exact(t) + err(t) * decay + 0.25 * (1 - p) * (1 - p) * Math.sin(t * 1.3);

    ctx.clearRect(0, 0, w, h);
    const pad = 18, X = t => pad + t / T * (w - 2 * pad), Y = u => h / 2 - u * (h / 2 - pad) * 0.8;

    // rejilla
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(X(i), pad); ctx.lineTo(X(i), h - pad); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.moveTo(pad, h / 2); ctx.lineTo(w - pad, h / 2); ctx.stroke();

    // solución exacta
    ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= 300; i++) { const t = i / 300 * T; i ? ctx.lineTo(X(t), Y(exact(t))) : ctx.moveTo(X(t), Y(exact(t))); }
    ctx.stroke(); ctx.setLineDash([]);

    // puntos de colocación (donde se impone la EDP)
    colloc.forEach(t => {
      const r = Math.abs(pred(t) - exact(t));
      ctx.fillStyle = `rgba(255,95,210,${0.25 + Math.min(0.6, r)})`;
      ctx.beginPath(); ctx.arc(X(t), h - pad + 4, 2.4, 0, Math.PI * 2); ctx.fill();
    });

    // predicción de la red
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#5ee7ff'); grad.addColorStop(0.5, '#9b7bff'); grad.addColorStop(1, '#ff5fd2');
    ctx.strokeStyle = grad; ctx.lineWidth = 2.6;
    ctx.shadowColor = 'rgba(155,123,255,0.8)'; ctx.shadowBlur = 12;
    ctx.beginPath();
    for (let i = 0; i <= 300; i++) { const t = i / 300 * T; i ? ctx.lineTo(X(t), Y(pred(t))) : ctx.moveTo(X(t), Y(pred(t))); }
    ctx.stroke(); ctx.shadowBlur = 0;

    // datos iniciales
    data.forEach(t => {
      ctx.fillStyle = '#ffc46b';
      ctx.beginPath(); ctx.arc(X(t), Y(exact(t)), 4.5, 0, Math.PI * 2); ctx.fill();
    });

    if (epochEl) epochEl.textContent = Math.round(p * 20000).toLocaleString('es');
    if (lossEl) lossEl.textContent = (decay * 0.9 + 2e-5).toExponential(2);
  });
}

/* ==========================================================
   4. Red neuronal
   ========================================================== */

function initNet() {
  const canvas = document.getElementById('net');
  if (!canvas) return;
  let view = fitCanvas(canvas);
  window.addEventListener('resize', () => { view = fitCanvas(canvas); });
  const layers = [3, 6, 6, 4, 1];
  const pulses = [];

  const nodes = () => {
    const { w, h } = view;
    return layers.map((n, li) => Array.from({ length: n }, (_, i) => ({
      x: 24 + li / (layers.length - 1) * (w - 48),
      y: h / 2 + (i - (n - 1) / 2) * Math.min(34, (h - 30) / n),
    })));
  };

  animateWhenVisible(canvas, (dt, time) => {
    const { ctx, w, h } = view;
    const N = nodes();
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1;
    for (let l = 0; l < N.length - 1; l++)
      for (const a of N[l]) for (const b of N[l + 1]) {
        ctx.strokeStyle = 'rgba(155,123,255,0.12)';
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    if (!reduceMotion && Math.random() < 0.35) {
      const l = Math.floor(Math.random() * (N.length - 1));
      pulses.push({ l, a: Math.floor(Math.random() * N[l].length), b: Math.floor(Math.random() * N[l + 1].length), t: 0 });
    }
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      p.t += dt * 1.6;
      if (p.t >= 1) { pulses.splice(i, 1); continue; }
      const A = N[p.l][p.a], B = N[p.l + 1][p.b];
      const x = A.x + (B.x - A.x) * p.t, y = A.y + (B.y - A.y) * p.t;
      ctx.fillStyle = p.l % 2 ? '#ff5fd2' : '#5ee7ff';
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    N.forEach((layer, li) => layer.forEach((n, i) => {
      const glow = 0.5 + 0.5 * Math.sin(time * 2 + li + i);
      ctx.fillStyle = '#0a0c14';
      ctx.strokeStyle = `rgba(94,231,255,${0.35 + 0.5 * glow})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(n.x, n.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }));
  });
}

/* ==========================================================
   Fondo de estrellas
   ========================================================== */

function initStars() {
  const canvas = document.getElementById('stars');
  if (!canvas) return;
  let view = fitCanvas(canvas);
  let stars = [];
  const seed = () => {
    stars = Array.from({ length: Math.round(view.w * view.h / 5000) }, () => ({
      x: Math.random() * view.w, y: Math.random() * view.h, r: Math.random() * 1.1 + 0.2, p: Math.random() * 6,
    }));
  };
  seed();
  window.addEventListener('resize', () => { view = fitCanvas(canvas); seed(); });
  animateWhenVisible(canvas, (dt, time) => {
    const { ctx, w, h } = view;
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      const a = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(time * 0.8 + s.p));
      ctx.fillStyle = `rgba(200,210,255,${a})`;
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
  });
}

initStars();
initOrbital();
initDoubleSlit();
initPINN();
initNet();
