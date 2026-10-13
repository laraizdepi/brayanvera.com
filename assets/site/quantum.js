// Figuras de información cuántica, calculadas de verdad (nada precocinado):
//   Fig. 1 — Esfera de Bloch: las compuertas son rotaciones y se animan como tales.
//   Fig. 2 — Teleportación (Bennett et al., 1993) simulada sobre el vector de estado de 3 qubits.

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function setupCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: r.width, h: r.height };
}

const fmt = (v, d = 3) => (Math.abs(v) < 5e-4 ? '0' : v.toFixed(d).replace(/^(-?)0\./, '$1.'));
function fmtComplex(re, im) {
  if (Math.abs(im) < 5e-4) return fmt(re);
  if (Math.abs(re) < 5e-4) return fmt(im) + 'i';
  return fmt(re) + (im < 0 ? ' − ' : ' + ') + fmt(Math.abs(im)) + 'i';
}

// Rotación de Rodrigues del vector v alrededor del eje unitario k un ángulo a.
function rotate(v, k, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const dot = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
  const cr = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
  return [0, 1, 2].map(i => v[i] * c + cr[i] * s + k[i] * dot * (1 - c));
}

const S2 = Math.SQRT1_2;
const GATES = {
  H: { axis: [S2, 0, S2], angle: Math.PI },
  X: { axis: [1, 0, 0], angle: Math.PI },
  Y: { axis: [0, 1, 0], angle: Math.PI },
  Z: { axis: [0, 0, 1], angle: Math.PI },
  S: { axis: [0, 0, 1], angle: Math.PI / 2 },
  T: { axis: [0, 0, 1], angle: Math.PI / 4 },
};

/* ==========================================================
   Fig. 1 — Esfera de Bloch
   ========================================================== */
export const bloch = { vector: [0, 0, 1], listeners: [] };

function initBloch() {
  const canvas = document.getElementById('bloch');
  if (!canvas) return;
  const out = {
    state: document.getElementById('bloch-state'),
    probs: document.getElementById('bloch-probs'),
    hist: document.getElementById('bloch-history'),
    counts: document.getElementById('bloch-counts'),
  };
  let view = setupCanvas(canvas);
  let yaw = -0.55, pitch = 0.32;
  let anim = null;           // { axis, angle, t, from }
  let trail = [];
  let history = ['|0⟩'];
  let counts = [0, 0];
  let dirty = true;

  const project = (p, R, cx, cy) => {
    const X = p[0] * Math.cos(yaw) - p[1] * Math.sin(yaw);
    const Y = p[0] * Math.sin(yaw) + p[1] * Math.cos(yaw);
    const up = p[2] * Math.cos(pitch) + Y * Math.sin(pitch);
    const depth = Y * Math.cos(pitch) - p[2] * Math.sin(pitch);
    return [cx + X * R, cy - up * R, depth];
  };

  function readout() {
    const [x, y, z] = bloch.vector;
    const theta = Math.acos(Math.max(-1, Math.min(1, z)));
    const phi = Math.atan2(y, x);
    const a = Math.cos(theta / 2), b = Math.sin(theta / 2);
    out.state.innerHTML = `<b>|ψ⟩</b> = ${fmt(a)}|0⟩ + (${fmtComplex(b * Math.cos(phi), b * Math.sin(phi))})|1⟩`;
    out.probs.innerHTML = `P(0) = <b>${fmt((1 + z) / 2)}</b> · P(1) = <b>${fmt((1 - z) / 2)}</b> · θ = ${(theta * 180 / Math.PI).toFixed(1)}° · φ = ${(((phi * 180 / Math.PI) + 360) % 360).toFixed(1)}°`;
    out.hist.textContent = history.slice(-9).join(' → ');
    out.counts.innerHTML = counts[0] + counts[1]
      ? `mediciones: <b>0</b> × ${counts[0]} · <b>1</b> × ${counts[1]}`
      : 'mediciones: —';
    bloch.listeners.forEach(f => f(bloch.vector));
  }

  function apply(name) {
    if (anim) finish();
    const g = GATES[name];
    anim = { axis: g.axis, angle: g.angle, t: 0, from: bloch.vector.slice() };
    history.push(name);
    if (reduceMotion) finish();
    dirty = true;
  }
  function finish() {
    if (!anim) return;
    bloch.vector = anim.to || rotate(anim.from, anim.axis, anim.angle);
    anim = null;
    readout();
  }
  function measure() {
    if (anim) finish();
    const p0 = (1 + bloch.vector[2]) / 2;
    const r = Math.random() < p0 ? 0 : 1;
    counts[r]++;
    const target = r === 0 ? [0, 0, 1] : [0, 0, -1];
    // colapso: rotación mínima hacia el polo medido
    const v = bloch.vector;
    let axis = [v[1] * target[2] - v[2] * target[1], v[2] * target[0] - v[0] * target[2], v[0] * target[1] - v[1] * target[0]];
    const n = Math.hypot(...axis);
    const angle = Math.acos(Math.max(-1, Math.min(1, v[0] * target[0] + v[1] * target[1] + v[2] * target[2])));
    history.push(`M=${r}`);
    if (n < 1e-6) { bloch.vector = target; readout(); dirty = true; return; }
    axis = axis.map(c => c / n);
    anim = { axis, angle, t: 0, from: v.slice(), to: target, fast: true };
    if (reduceMotion) finish();
    dirty = true;
  }
  function reset() {
    anim = null; bloch.vector = [0, 0, 1]; trail = []; history = ['|0⟩']; counts = [0, 0];
    readout(); dirty = true;
  }

  document.querySelectorAll('[data-gate]').forEach(b => b.addEventListener('click', () => apply(b.dataset.gate)));
  document.getElementById('bloch-measure')?.addEventListener('click', measure);
  document.getElementById('bloch-reset')?.addEventListener('click', reset);

  // Arrastrar para girar la vista
  let drag = null;
  canvas.addEventListener('pointerdown', e => { drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    yaw += (e.clientX - drag[0]) * 0.008;
    pitch = Math.max(-1.2, Math.min(1.2, pitch + (e.clientY - drag[1]) * 0.006));
    drag = [e.clientX, e.clientY]; dirty = true;
  });
  canvas.addEventListener('pointerup', () => { drag = null; });

  window.addEventListener('resize', () => { view = setupCanvas(canvas); dirty = true; });
  window.addEventListener('themechange', () => { dirty = true; });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { dirty = true; });

  function draw() {
    const { ctx, w, h } = view;
    const ink = css('--ink'), ink3 = css('--ink-3'), rule = css('--rule-2'), accent = css('--accent'), indigo = css('--indigo');
    const R = Math.min(w, h) * 0.36, cx = w / 2, cy = h / 2 + 4;
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';

    // silueta
    ctx.strokeStyle = ink; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();

    // círculos máximos: ecuador (sólido delante, punteado detrás) y meridianos tenues
    const circle = (fn, color, width, dashBack) => {
      let prev = null;
      for (let i = 0; i <= 120; i++) {
        const t = i / 120 * Math.PI * 2;
        const p = project(fn(t), R, cx, cy);
        if (prev) {
          ctx.strokeStyle = color; ctx.lineWidth = width;
          ctx.setLineDash(dashBack && (p[2] + prev[2]) / 2 > 0 ? [2, 4] : []);
          ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
        }
        prev = p;
      }
      ctx.setLineDash([]);
    };
    circle(t => [Math.cos(t), Math.sin(t), 0], ink, 0.9, true);
    circle(t => [Math.cos(t), 0, Math.sin(t)], rule, 0.8, true);
    circle(t => [0, Math.cos(t), Math.sin(t)], rule, 0.8, true);

    // ejes y etiquetas
    const axes = [
      [[0, 0, 1], '|0⟩'], [[0, 0, -1], '|1⟩'], [[1, 0, 0], '|+⟩'], [[-1, 0, 0], '|−⟩'], [[0, 1, 0], '|+i⟩'], [[0, -1, 0], '|−i⟩'],
    ];
    ctx.font = `italic 15px ${css('--font') || 'serif'}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [p, label] of axes) {
      const a = project(p.map(c => c * 1.0), R, cx, cy), o = project([0, 0, 0], R, cx, cy);
      ctx.strokeStyle = ink3; ctx.lineWidth = 0.7; ctx.setLineDash(a[2] > 0 ? [2, 3] : []);
      ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(a[0], a[1]); ctx.stroke(); ctx.setLineDash([]);
      const l = project(p.map(c => c * 1.17), R, cx, cy);
      ctx.fillStyle = a[2] > 0 ? ink3 : ink;
      ctx.fillText(label, l[0], l[1]);
    }

    // estela
    if (trail.length > 1) {
      ctx.strokeStyle = accent; ctx.lineWidth = 1.2;
      for (let i = 1; i < trail.length; i++) {
        const a = project(trail[i - 1], R, cx, cy), b = project(trail[i], R, cx, cy);
        ctx.globalAlpha = 0.12 + 0.5 * i / trail.length;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // vector de Bloch, con su proyección sobre el ecuador
    const v = bloch.vector;
    const o = project([0, 0, 0], R, cx, cy), tip = project(v, R, cx, cy), foot = project([v[0], v[1], 0], R, cx, cy);
    ctx.strokeStyle = indigo; ctx.lineWidth = 0.9; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(foot[0], foot[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = accent; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(tip[0], tip[1], 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.arc(o[0], o[1], 2.2, 0, Math.PI * 2); ctx.fill();
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (anim) {
      anim.t = Math.min(1, anim.t + dt / (anim.fast ? 0.35 : 0.75));
      const e = anim.t < 0.5 ? 2 * anim.t * anim.t : 1 - Math.pow(-2 * anim.t + 2, 2) / 2;
      bloch.vector = rotate(anim.from, anim.axis, anim.angle * e);
      trail.push(bloch.vector.slice());
      if (trail.length > 260) trail.shift();
      if (anim.t >= 1) finish();
      dirty = true;
    }
    if (dirty) { draw(); dirty = false; }
    requestAnimationFrame(frame);
  }
  readout();
  requestAnimationFrame(frame);
}

/* ==========================================================
   Fig. 2 — Teleportación de un qubit
   Índice de la base: i = 4·q0 + 2·q1 + q2
   ========================================================== */
function initTeleport() {
  const svg = document.getElementById('tp-circuit');
  if (!svg) return;
  const bars = document.getElementById('tp-bars');
  const caption = document.getElementById('tp-step');
  const result = document.getElementById('tp-result');
  const thetaIn = document.getElementById('tp-theta'), phiIn = document.getElementById('tp-phi');
  const prevBtn = document.getElementById('tp-prev'), nextBtn = document.getElementById('tp-next');

  const STEPS = [
    'Alice tiene un qubit en el estado desconocido |ψ⟩. Ella y Bob tienen además dos qubits en |0⟩.',
    'Hadamard sobre q₁: superposición (|0⟩ + |1⟩)/√2.',
    'CNOT q₁ → q₂: Alice y Bob ahora comparten el par de Bell |Φ⁺⟩. Bob se lleva q₂.',
    'CNOT q₀ → q₁: Alice entrelaza |ψ⟩ con su mitad del par.',
    'Hadamard sobre q₀. El estado de Bob ya contiene a |ψ⟩, salvo una de cuatro correcciones.',
    'Alice mide q₀ y q₁ y le envía a Bob dos bits clásicos.',
    'Bob aplica X y Z según los bits recibidos. Su qubit queda exactamente en |ψ⟩.',
  ];
  let step = 0, outcome = null;
  let input = { theta: +thetaIn.value, phi: +phiIn.value };

  const mask = k => 1 << (2 - k);
  function H(s, k) { const m = mask(k); for (let i = 0; i < 8; i++) if (!(i & m)) { const j = i | m; for (let c = 0; c < 2; c++) { const a = s[2 * i + c], b = s[2 * j + c]; s[2 * i + c] = (a + b) * S2; s[2 * j + c] = (a - b) * S2; } } }
  function X(s, k) { const m = mask(k); for (let i = 0; i < 8; i++) if (!(i & m)) { const j = i | m; for (let c = 0; c < 2; c++) { const t = s[2 * i + c]; s[2 * i + c] = s[2 * j + c]; s[2 * j + c] = t; } } }
  function Z(s, k) { const m = mask(k); for (let i = 0; i < 8; i++) if (i & m) { s[2 * i] *= -1; s[2 * i + 1] *= -1; } }
  function CX(s, c, t) { const mc = mask(c), mt = mask(t); for (let i = 0; i < 8; i++) if ((i & mc) && !(i & mt)) { const j = i | mt; for (let q = 0; q < 2; q++) { const tmp = s[2 * i + q]; s[2 * i + q] = s[2 * j + q]; s[2 * j + q] = tmp; } } }

  const amps = () => {
    const a = Math.cos(input.theta / 2), b = Math.sin(input.theta / 2);
    return { a: [a, 0], b: [b * Math.cos(input.phi), b * Math.sin(input.phi)] };
  };

  function stateAt(n) {
    const s = new Float64Array(16);
    const { a, b } = amps();
    s[0] = a[0]; s[1] = a[1];            // |0⟩|0⟩|0⟩
    s[8] = b[0]; s[9] = b[1];            // |1⟩|0⟩|0⟩
    if (n >= 1) H(s, 1);
    if (n >= 2) CX(s, 1, 2);
    if (n >= 3) CX(s, 0, 1);
    if (n >= 4) H(s, 0);
    if (n >= 5) {
      if (!outcome) {
        const p = [0, 1, 2, 3].map(m => { let t = 0; for (let q = 0; q < 2; q++) { const i = 2 * m + q; t += s[2 * i] ** 2 + s[2 * i + 1] ** 2; } return t; });
        let r = Math.random(), m = 0;
        while (m < 3 && r > p[m]) { r -= p[m]; m++; }
        outcome = [m >> 1, m & 1];
      }
      const keep = 2 * (2 * outcome[0] + outcome[1]);
      let norm = 0;
      for (let i = 0; i < 8; i++) {
        if (i >> 1 !== keep >> 1) { s[2 * i] = 0; s[2 * i + 1] = 0; } else norm += s[2 * i] ** 2 + s[2 * i + 1] ** 2;
      }
      norm = Math.sqrt(norm);
      for (let i = 0; i < 16; i++) s[i] /= norm;
    }
    if (n >= 6) { if (outcome[1]) X(s, 2); if (outcome[0]) Z(s, 2); }
    return s;
  }

  // Circuito en SVG
  const NS = 'http://www.w3.org/2000/svg';
  const W = 640, Hh = 190, y = [42, 98, 154], colX = [118, 188, 258, 328, 398, 478, 548];
  function el(tag, attrs, parent = svg, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    parent.appendChild(e); return e;
  }
  function drawCircuit() {
    svg.innerHTML = '';
    svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`);
    const labels = ['q₀  |ψ⟩', 'q₁  |0⟩', 'q₂  |0⟩'];
    const owner = ['Alice', 'Alice', 'Bob'];
    labels.forEach((t, i) => {
      el('text', { x: 8, y: y[i] - 6, class: 'c-label' }, svg, t);
      el('text', { x: 8, y: y[i] + 13, class: 'c-owner' }, svg, owner[i]);
      const measured = i < 2 && step >= 5;
      el('line', { x1: 74, y1: y[i], x2: measured ? colX[4] : W - 20, y2: y[i], class: 'c-wire' });
      if (measured) {
        el('line', { x1: colX[4], y1: y[i] - 2, x2: W - 20, y2: y[i] - 2, class: 'c-wire c-classic' });
        el('line', { x1: colX[4], y1: y[i] + 2, x2: W - 20, y2: y[i] + 2, class: 'c-wire c-classic' });
      }
    });
    const st = n => (step === n ? 'c-now' : step > n ? 'c-done' : 'c-todo');
    const box = (n, wire, label) => {
      const g = el('g', { class: st(n) });
      el('rect', { x: colX[n - 1] - 15, y: y[wire] - 15, width: 30, height: 30, rx: 2, class: 'c-box' }, g);
      el('text', { x: colX[n - 1], y: y[wire] + 5, class: 'c-gate' }, g, label);
    };
    const cnot = (n, c, t) => {
      const g = el('g', { class: st(n) });
      el('line', { x1: colX[n - 1], y1: y[c], x2: colX[n - 1], y2: y[t] + 11, class: 'c-ctl' }, g);
      el('circle', { cx: colX[n - 1], cy: y[c], r: 4.5, class: 'c-dot' }, g);
      el('circle', { cx: colX[n - 1], cy: y[t], r: 11, class: 'c-target' }, g);
      el('line', { x1: colX[n - 1] - 11, y1: y[t], x2: colX[n - 1] + 11, y2: y[t], class: 'c-ctl' }, g);
      el('line', { x1: colX[n - 1], y1: y[t] - 11, x2: colX[n - 1], y2: y[t] + 11, class: 'c-ctl' }, g);
    };
    box(1, 1, 'H');
    cnot(2, 1, 2);
    cnot(3, 0, 1);
    box(4, 0, 'H');
    [0, 1].forEach(wire => {
      const g = el('g', { class: st(5) });
      el('rect', { x: colX[4] - 15, y: y[wire] - 15, width: 30, height: 30, rx: 2, class: 'c-box' }, g);
      el('path', { d: `M ${colX[4] - 9} ${y[wire] + 6} A 9 9 0 0 1 ${colX[4] + 9} ${y[wire] + 6}`, class: 'c-meter' }, g);
      el('line', { x1: colX[4], y1: y[wire] + 6, x2: colX[4] + 7, y2: y[wire] - 6, class: 'c-meter' }, g);
      if (step >= 5 && outcome) el('text', { x: colX[4] + 26, y: y[wire] - 8, class: 'c-bit' }, g, String(outcome[wire]));
    });
    // correcciones controladas clásicamente
    [[6, 'X', 1], [7, 'Z', 0]].forEach(([col, label, ctrl]) => {
      const g = el('g', { class: st(6) });
      el('line', { x1: colX[col - 1] - 1.5, y1: y[ctrl], x2: colX[col - 1] - 1.5, y2: y[2] - 15, class: 'c-classic-v' }, g);
      el('line', { x1: colX[col - 1] + 1.5, y1: y[ctrl], x2: colX[col - 1] + 1.5, y2: y[2] - 15, class: 'c-classic-v' }, g);
      el('circle', { cx: colX[col - 1], cy: y[ctrl], r: 3.5, class: 'c-dot' }, g);
      el('rect', { x: colX[col - 1] - 15, y: y[2] - 15, width: 30, height: 30, rx: 2, class: 'c-box' }, g);
      el('text', { x: colX[col - 1], y: y[2] + 5, class: 'c-gate' }, g, label);
    });
    el('text', { x: W - 18, y: y[2] - 22, class: 'c-out', 'text-anchor': 'end' }, svg, step >= 6 ? '|ψ⟩ ✓' : '');
  }

  function drawBars(s) {
    bars.innerHTML = '';
    for (let i = 0; i < 8; i++) {
      const re = s[2 * i], im = s[2 * i + 1];
      const p = re * re + im * im, ph = Math.atan2(im, re);
      const col = document.createElement('div');
      col.className = 'tp-col' + (p < 1e-9 ? ' zero' : '');
      col.innerHTML =
        `<div class="tp-phase" title="fase ${(ph * 180 / Math.PI).toFixed(0)}°"><i style="transform:rotate(${-ph}rad)"></i></div>` +
        `<div class="tp-track"><div class="tp-bar" style="height:${(p * 100).toFixed(2)}%"></div></div>` +
        `<div class="tp-p">${p < 1e-9 ? '0' : fmt(p, 2)}</div>` +
        `<div class="tp-k">|${(i >> 2) & 1}${(i >> 1) & 1}${i & 1}⟩</div>`;
      bars.appendChild(col);
    }
  }

  function render() {
    const s = stateAt(step);
    drawCircuit();
    drawBars(s);
    caption.innerHTML = `<b>Paso ${step}/6.</b> ${STEPS[step]}` + (step >= 5 && outcome ? ` Bits enviados: <b>m₀m₁ = ${outcome[0]}${outcome[1]}</b>.` : '');
    const { a, b } = amps();
    if (step === 6) {
      const k = 2 * (2 * outcome[0] + outcome[1]);
      const bob0 = [s[2 * k], s[2 * k + 1]], bob1 = [s[2 * k + 2], s[2 * k + 3]];
      const fid = (a[0] * bob0[0] + a[1] * bob0[1] + b[0] * bob1[0] + b[1] * bob1[1]) ** 2 + (a[0] * bob0[1] - a[1] * bob0[0] + b[0] * bob1[1] - b[1] * bob1[0]) ** 2;
      result.innerHTML = `Bob: ${fmtComplex(...bob0)}|0⟩ + (${fmtComplex(...bob1)})|1⟩ · original: ${fmtComplex(...a)}|0⟩ + (${fmtComplex(...b)})|1⟩ · fidelidad <b>${fid.toFixed(3)}</b>`;
    } else {
      result.innerHTML = `|ψ⟩ = ${fmtComplex(...a)}|0⟩ + (${fmtComplex(...b)})|1⟩`;
    }
    prevBtn.disabled = step === 0;
    nextBtn.disabled = step === 6;
  }

  prevBtn.addEventListener('click', () => { if (step > 0) { step--; if (step < 5) outcome = null; render(); } });
  nextBtn.addEventListener('click', () => { if (step < 6) { step++; render(); } });
  document.getElementById('tp-reset').addEventListener('click', () => { step = 0; outcome = null; render(); });
  const onInput = () => { input = { theta: +thetaIn.value, phi: +phiIn.value }; render(); };
  thetaIn.addEventListener('input', onInput);
  phiIn.addEventListener('input', onInput);
  document.getElementById('tp-from-bloch')?.addEventListener('click', () => {
    const [x, yv, z] = bloch.vector;
    thetaIn.value = Math.acos(Math.max(-1, Math.min(1, z)));
    phiIn.value = ((Math.atan2(yv, x) + 2 * Math.PI) % (2 * Math.PI));
    step = 0; outcome = null; onInput();
  });
  render();
}

initBloch();
initTeleport();
