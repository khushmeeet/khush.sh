// Backgrounds behind the page. Each one keeps the area under the text quiet so it stays readable.
// The default comes from content.js (SITE.background). Preview any one with ?bg=life, stars, autumn,
// sunlight, winter or garden; add ?tweaks to show a picker for switching between them.

(() => {
  const canvas = document.getElementById('backdrop');
  const panel = document.querySelector('.panel');
  const pauseButton = document.getElementById('pause');
  const root = document.documentElement;
  if (!canvas || !panel) return;

  const ctx = canvas.getContext('2d');
  // A second canvas underneath, blurred with CSS. Scenes draw soft things here (shadows, out-of-focus leaves).
  // It overhangs the screen by BLEED px on every side so the blur never fades at the edges.
  const softCanvas = document.getElementById('backdrop-soft');
  const sctx = softCanvas.getContext('2d');
  const BLEED = 16;
  const TAU = Math.PI * 2;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let w = 0, h = 0, dpr = 1;
  let running = !reduceMotion;
  let clock = 0;          // milliseconds of animation time; stands still while paused
  let text = { left: 0, right: 0, top: 0, bottom: 0 };

  const rand = Math.random;
  // Parallax: every backdrop is a world a little larger than the screen, and it moves as the page
  // scrolls, at a pace set by how far away each part of it is. `scroll` is the page's scroll position.
  let scroll = 0;
  const wrapY = (y, span) => ((y % span) + span) % span;
  // Where something at depth k (0 = fixed to the screen, 1 = moves with the page) appears on screen,
  // for a world that repeats every `span` pixels, with `pad` pixels of room above and below.
  const onScreen = (y, k, pad, span) => wrapY(y - scroll * k + pad, span + pad * 2) - pad;
  const scrollRoom = () => Math.max(0, (document.documentElement.scrollHeight || 0) - (window.innerHeight || 0)) || 0;
  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const measureText = () => { text = panel.getBoundingClientRect(); };

  // 1 out in the open, `floor` under the text, easing between over `edge` pixels.
  function quiet(x, y, floor, edge) {
    const dx = Math.max(text.left - x, 0, x - text.right);
    const dy = Math.max(text.top - y, 0, y - text.bottom);
    const d = dx > 0 || dy > 0 ? Math.hypot(dx, dy) : 0;
    return d >= edge ? 1 : floor + (1 - floor) * smooth(d / edge);
  }

  /* ==========================================================
     Life: Conway's Game of Life, busier around the text
     ========================================================== */
  function Life() {
    const BIRTH = 1 << 3, SURVIVE = (1 << 2) | (1 << 3);
    const TARGET = { around: 0.11, under: 0.02 };
    const CULL = 0.03, EDGE = 48;
    const FADE = { strength: 0.7, ghost: 0.45, decay: 8 };
    const dot = document.createElement('canvas');
    let cell = 10, cols = 0, rows = 0, grid = null, next, ghost, gen = 0, lastTick = 0;
    let color = '#6f8436', strength = 0.46;

    function drawDot() {
      const px = Math.max(2, Math.round(cell * dpr));
      dot.width = dot.height = px;
      const c = dot.getContext('2d');
      c.fillStyle = color;
      c.beginPath();
      c.arc(px / 2, px / 2, px * 0.35, 0, TAU);
      c.fill();
    }
    function soup(d, x0, y0, x1, y1) {
      for (let y = Math.max(0, y0); y < Math.min(rows, y1); y++)
        for (let x = Math.max(0, x0); x < Math.min(cols, x1); x++)
          if (rand() < d) grid[y * cols + x] = 1;
    }
    function step() {
      for (let y = 0; y < rows; y++) {
        const up = ((y + rows - 1) % rows) * cols, mid = y * cols, down = ((y + 1) % rows) * cols;
        for (let x = 0; x < cols; x++) {
          const l = (x + cols - 1) % cols, r = (x + 1) % cols;
          const n = grid[up + l] + grid[up + x] + grid[up + r] + grid[mid + l] + grid[mid + r]
                  + grid[down + l] + grid[down + x] + grid[down + r];
          const i = mid + x, alive = grid[i];
          const v = alive ? (SURVIVE >> n) & 1 : (BIRTH >> n) & 1;
          next[i] = v;
          if (alive && !v) ghost[i] = 255;
          else if (!v && ghost[i]) ghost[i] = ghost[i] > FADE.decay ? ghost[i] - FADE.decay : 0;
        }
      }
      [grid, next] = [next, grid];
      gen++;
    }
    const DEPTH = 0.3;
    // The grid wraps top to bottom, so it can slide with the page forever: grid row y sits at sy(y * cell).
    const sy = (gy) => wrapY(gy - scroll * DEPTH, rows * cell);
    function thin() {
      const half = cell / 2;
      const x0 = Math.max(0, Math.floor(text.left / cell)), x1 = Math.min(cols, Math.ceil(text.right / cell));
      for (let y = 0; y < rows; y++) {
        const cy = sy(y * cell + half);
        if (cy < text.top || cy > text.bottom) continue;
        for (let x = x0; x < x1; x++) {
          const i = y * cols + x;
          if (!grid[i]) continue;
          const cx = x * cell + half;
          const depth = Math.min(cx - text.left, text.right - cx, cy - text.top, text.bottom - cy);
          if (rand() < CULL * smooth(depth / EDGE)) { grid[i] = 0; ghost[i] = 200; }
        }
      }
    }
    function keepDensity() {
      if (gen % 8) return;
      const half = cell / 2;
      let inPop = 0, inArea = 0, outPop = 0, outArea = 0;
      for (let y = 0, i = 0; y < rows; y++) for (let x = 0; x < cols; x++, i++) {
        const cx = x * cell + half, cy = sy(y * cell + half);
        if (cx > text.left && cx < text.right && cy > text.top && cy < text.bottom) { inArea++; inPop += grid[i]; }
        else { outArea++; outPop += grid[i]; }
      }
      if (outArea && outPop < outArea * TARGET.around) {
        for (let t = 0; t < 16; t++) {
          const x = Math.floor(rand() * Math.max(1, cols - 14)), y = Math.floor(rand() * Math.max(1, rows - 10));
          const l = x * cell, tp = sy(y * cell), r = l + 140, b = tp + 100;
          if (!(r > text.left - EDGE && l < text.right + EDGE && b > text.top - EDGE && tp < text.bottom + EDGE)) { soup(0.4, x, y, x + 14, y + 10); break; }
        }
      }
      if (inArea && inPop < inArea * TARGET.under) {
        const x0 = Math.ceil((text.left + EDGE) / cell), x1 = Math.floor((text.right - EDGE) / cell);
        const top = Math.max(0, text.top + EDGE), bottom = Math.min(h, text.bottom - EDGE);
        if (x1 - x0 >= 10 && bottom - top >= 8 * cell) {
          const x = x0 + Math.floor(rand() * (x1 - x0 - 9));
          const screenY = top + rand() * (bottom - top - 8 * cell);
          const y = Math.floor(wrapY(screenY + scroll * DEPTH, rows * cell) / cell);
          soup(0.4, x, Math.min(y, rows - 8), x + 10, Math.min(y, rows - 8) + 8);
        }
      }
    }

    return {
      fps: 10,
      parallax: true,
      colors() {
        const css = getComputedStyle(root);
        color = css.getPropertyValue('--cell').trim() || color;
        strength = parseFloat(css.getPropertyValue('--dot-alpha')) || strength;
        drawDot();
      },
      resize() {
        const size = w < 700 ? 8 : 10;
        const c = Math.ceil(w / size), r = Math.ceil(h / size);
        if (grid && c === cols && r === rows && size === cell) return;
        const old = grid, oc = cols, or = rows;
        cell = size; cols = c; rows = r;
        grid = new Uint8Array(c * r); next = new Uint8Array(c * r); ghost = new Uint8Array(c * r);
        if (old) {
          for (let y = 0; y < Math.min(r, or); y++)
            for (let x = 0; x < Math.min(c, oc); x++) grid[y * c + x] = old[y * oc + x];
        } else {
          soup(0.35, 0, 0, cols, rows);
          for (let i = 0; i < 80; i++) { step(); thin(); }
          ghost.fill(0);
        }
        drawDot();
      },
      update(now) {
        if (now - lastTick < 100) return;
        lastTick = now;
        step(); thin(); keepDensity();
      },
      draw() {
        ctx.clearRect(0, 0, w, h);
        const base = strength * FADE.strength, half = cell / 2;
        let current = -1;
        for (let y = 0, i = 0; y < rows; y++) {
          const py = sy(y * cell);
          if (py > h) { i += cols; continue; }
          for (let x = 0; x < cols; x++, i++) {
            let a;
            if (grid[i]) a = base;
            else if (ghost[i]) a = (ghost[i] / 255) * FADE.ghost * base;
            else continue;
            a = Math.round(a * quiet(x * cell + half, py + half, 0.5, 56) * 50) / 50;
            if (a <= 0) continue;
            if (a !== current) { ctx.globalAlpha = a; current = a; }
            ctx.drawImage(dot, x * cell, py, cell, cell);
          }
        }
        ctx.globalAlpha = 1;
      },
      click(x, y) {
        const cx = Math.floor(x / cell), cy = Math.floor(wrapY(y + scroll * DEPTH, rows * cell) / cell);
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
          if (dx * dx + dy * dy > 16 || rand() > 0.55) continue;
          grid[(((cy + dy) % rows) + rows) % rows * cols + (((cx + dx) % cols) + cols) % cols] = 1;
        }
      },
    };
  }

  /* ==========================================================
     Shared drawing helpers
     ========================================================== */
  // Draw something once into its own canvas, to stamp many times later.
  function makeSprite(size, paint) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    paint(c.getContext('2d'), size);
    return c;
  }
  const between = ([a, b]) => a + rand() * (b - a);
  const mix = (a, b, t) => {
    const p = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const x = p(a), y = p(b);
    return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`;
  };

  // Leaf outlines and veins as vector paths about two units tall (base at the bottom, tip at the top),
  // so they stay sharp at any size.
  function leafShapes() {
    const toPath = (pts) => {
      const p = new Path2D();
      pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
      p.closePath();
      return p;
    };
    // A leaf grown along its midrib: width(t) for t from base (0) to tip (1).
    const alongRib = (width, length = 1.7) => {
      const left = [], right = [];
      for (let i = 0; i <= 140; i++) {
        const t = i / 140, y = 0.8 - length * t, half = width(t);
        left.push([-half, y]); right.push([half, y]);
      }
      return toPath([...left, ...right.reverse()]);
    };
    const ribVeins = (pairs, reach, length = 1.7) => {
      const v = new Path2D();
      v.moveTo(0, 1.05); v.lineTo(0, 0.8 - length * 0.97);
      for (let k = 1; k <= pairs; k++) {
        const t = k / (pairs + 1), y = 0.8 - length * t;
        v.moveTo(0, y); v.quadraticCurveTo(-reach(t) * 0.5, y - 0.06, -reach(t), y - 0.22);
        v.moveTo(0, y); v.quadraticCurveTo(reach(t) * 0.5, y - 0.06, reach(t), y - 0.22);
      }
      return v;
    };

    // Maple: five pointed lobes around a centre, with a toothed edge.
    const lobes = [[0, 1.0, 0.56], [1.0, 0.88, 0.52], [-1.0, 0.88, 0.52], [2.0, 0.6, 0.46], [-2.0, 0.6, 0.46]];
    const maplePts = [];
    for (let i = 0; i <= 240; i++) {
      const phi = -Math.PI + (i / 240) * TAU;
      let r = 0.4;
      for (const [angle, length, spread] of lobes) {
        const d = Math.abs(phi - angle);
        if (d < spread) r = Math.max(r, 0.4 + (length - 0.4) * Math.pow(1 - d / spread, 1.7));
      }
      if (r > 0.5) r += 0.035 * Math.abs(Math.sin(phi * 24));
      maplePts.push([Math.sin(phi) * r, -Math.cos(phi) * r + 0.15]);
    }
    const mapleVeins = new Path2D();
    mapleVeins.moveTo(0, 0.95); mapleVeins.lineTo(0, 0.15);
    for (const [angle, length] of lobes) {
      mapleVeins.moveTo(0, 0.15);
      mapleVeins.lineTo(Math.sin(angle) * length * 0.85, -Math.cos(angle) * length * 0.85 + 0.15);
    }

    // Ginkgo: a fan with a notch in the middle.
    const ginkgoPts = [[0, 0.75]];
    for (let i = 0; i <= 140; i++) {
      const a = -1.0 + (i / 140) * 2.0;
      const r = 1.45 - 0.3 * Math.exp(-(a * a) / (2 * 0.05 * 0.05)) + 0.03 * Math.sin(a * 16);
      ginkgoPts.push([Math.sin(a) * r, 0.75 - Math.cos(a) * r]);
    }
    const ginkgoVeins = new Path2D();
    for (let a = -0.85; a <= 0.86; a += 0.12) { ginkgoVeins.moveTo(0, 0.75); ginkgoVeins.lineTo(Math.sin(a) * 1.35, 0.75 - Math.cos(a) * 1.35); }
    ginkgoVeins.moveTo(0, 0.75); ginkgoVeins.lineTo(0, 1.15);

    // Linden: a heart with its point at the tip.
    const lindenPts = [];
    for (let i = 0; i <= 200; i++) {
      const t = (i / 200) * TAU;
      const x = 16 * Math.pow(Math.sin(t), 3), y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      const tooth = 1 + 0.015 * Math.sin(t * 40);
      lindenPts.push([(x / 17) * 0.82 * tooth, (-y / 17) * 1.05 * tooth + 0.1]);
    }

    return {
      maple: { outline: toPath(maplePts), veins: mapleVeins },
      oak: {
        outline: alongRib((t) => 0.4 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.04)), 0.9) * (0.7 + 0.3 * Math.abs(Math.sin(t * Math.PI * 4.5)))),
        veins: ribVeins(4, (t) => 0.3 * Math.sin(Math.PI * t)),
      },
      birch: {
        outline: alongRib((t) => 0.36 * Math.pow(Math.sin(Math.PI * t), 0.75) * (1 + 0.05 * Math.sin(t * 90))),
        veins: ribVeins(6, (t) => 0.26 * Math.sin(Math.PI * t)),
      },
      willow: {
        outline: alongRib((t) => 0.15 * Math.pow(Math.sin(Math.PI * t), 0.6), 1.9),
        veins: ribVeins(0, () => 0, 1.9),
      },
      linden: { outline: toPath(lindenPts), veins: ribVeins(4, (t) => 0.5 * Math.sin(Math.PI * t), 1.75) },
      ginkgo: { outline: toPath(ginkgoPts), veins: ginkgoVeins },
    };
  }

  /* ==========================================================
     Botany: leaves, seeds, twigs and flowers modelled on real species, each painted once
     in detail (shaded blade, vein network, blemishes, petals, florets) and then stamped.
     All shapes are drawn in "leaf units" roughly -1..1 and scaled into a sprite.
     ========================================================== */
  const Botany = (() => {
    const SIZE = 192;
    const UNIT = SIZE / 2.8;                     // pixels per leaf unit inside a sprite

    const poly = (pts) => {
      const p = new Path2D();
      pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
      p.closePath();
      return p;
    };
    const curve = (a, c, b, n = 12) => {
      const out = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n, u = 1 - t;
        out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
      }
      return out;
    };
    const rgba = (hex, a) => {
      const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return `rgba(${v[0]},${v[1]},${v[2]},${a})`;
    };
    const stroke = (g, pts, width, style) => {
      g.strokeStyle = style;
      g.lineWidth = width;
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
    };
    // A vein that thins toward its end, drawn as a few segments of falling width.
    const taper = (g, pts, w0, w1, style) => {
      g.strokeStyle = style;
      for (let i = 1; i < pts.length; i++) {
        g.lineWidth = w0 + (w1 - w0) * (i / pts.length);
        g.beginPath(); g.moveTo(pts[i - 1][0], pts[i - 1][1]); g.lineTo(pts[i][0], pts[i][1]); g.stroke();
      }
    };

    /* ---------- leaf forms ---------- */

    // Palmate leaves (maples, sweetgum): lobes radiating from the stalk, each with teeth.
    // lobes: [angle from straight up, length, half-width in radians, sharpness]
    function palmate({ lobes, base, teeth = 0.7, serr = 0, serrK = 60, centre = [0, 0.22] }) {
      const feats = [];
      for (const [a, L, hw, sharp] of lobes) {
        feats.push([a, L, hw, sharp]);
        if (teeth) for (const side of [-1, 1]) feats.push([a + side * hw * 0.55, base + (L - base) * teeth, hw * 0.2, 1]);
      }
      const pts = [];
      for (let i = 0; i <= 420; i++) {
        const phi = -Math.PI + (i / 420) * Math.PI * 2;
        let r = base;
        for (const [a, L, hw, sharp] of feats) {
          const d = Math.abs(phi - a);
          if (d < hw) r = Math.max(r, base + (L - base) * Math.pow(1 - d / hw, sharp));
        }
        if (serr && r > base + 0.06) r += serr * Math.pow(Math.abs(Math.sin(phi * serrK)), 3);
        pts.push([centre[0] + Math.sin(phi) * r, centre[1] - Math.cos(phi) * r]);
      }
      const veins = [];
      for (const [a, L] of lobes) {
        const tip = [centre[0] + Math.sin(a) * L * 0.94, centre[1] - Math.cos(a) * L * 0.94];
        const mid = [centre[0] + Math.sin(a * 0.97) * L * 0.5, centre[1] - Math.cos(a * 0.97) * L * 0.5];
        veins.push({ pts: curve(centre, mid, tip), w: [0.03, 0.008], level: 1 });
        for (const side of [-1, 1]) {
          for (const at of [0.35, 0.6]) {
            const from = [centre[0] + Math.sin(a) * L * at, centre[1] - Math.cos(a) * L * at];
            const ang = a + side * 0.75, len = L * (0.42 - at * 0.25);
            const to = [from[0] + Math.sin(ang) * len, from[1] - Math.cos(ang) * len];
            veins.push({ pts: curve(from, [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 - 0.03], to, 6), w: [0.012, 0.004], level: 2 });
          }
        }
      }
      return { outline: poly(pts), veins, attach: centre, stalk: 0.55 };
    }

    // Pinnate leaves (oaks, beech, birch, elm): a midrib with paired side veins.
    // width(t, side) gives the half-width at t (0 = base, 1 = tip) on each side.
    function pinnate({ width, length = 1.8, pairs = 7, reach = 0.18, net = true }) {
      const y = (t) => 0.9 - length * t;
      const left = [], right = [];
      for (let i = 0; i <= 260; i++) {
        const t = i / 260;
        left.push([-width(t, -1), y(t)]);
        right.push([width(t, 1), y(t)]);
      }
      const veins = [{ pts: curve([0, 0.92], [0.02, y(0.5)], [0, y(0.985)], 16), w: [0.03, 0.006], level: 1 }];
      const ends = { '-1': [], '1': [] };
      for (let k = 1; k <= pairs; k++) {
        const t = 0.06 + (0.88 * k) / (pairs + 1);
        for (const side of [-1, 1]) {
          const te = Math.min(0.99, t + reach);
          const end = [side * width(te, side) * 0.93, y(te)];
          const start = [0, y(t)];
          const ctrl = [side * width(t, side) * 0.55, y(t + reach * 0.35)];
          const pts = curve(start, ctrl, end, 10);
          veins.push({ pts, w: [0.014, 0.004], level: 2 });
          ends[side].push(pts);
        }
      }
      // A faint net of small veins between the side veins.
      if (net) {
        for (const side of [-1, 1]) {
          const list = ends[side];
          for (let k = 0; k < list.length - 1; k++) {
            for (const u of [0.35, 0.6, 0.82]) {
              const a = list[k][Math.round(u * 10)], b = list[k + 1][Math.round(u * 10)];
              const m = [(a[0] + b[0]) / 2 + (rand() - 0.5) * 0.05, (a[1] + b[1]) / 2];
              veins.push({ pts: [a, m, b], w: [0.005, 0.004], level: 3 });
            }
          }
        }
      }
      return { outline: poly([...left, ...right.reverse()]), veins, attach: [0, 0.9], stalk: 0.4 };
    }

    const env = (t, p = 0.85) => Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), p);
    const LEAVES = {
      sugarMaple: () => palmate({
        base: 0.32,
        lobes: [[0, 1.0, 0.5, 1.6], [0.95, 0.9, 0.46, 1.6], [-0.95, 0.9, 0.46, 1.6], [1.9, 0.55, 0.38, 1.4], [-1.9, 0.55, 0.38, 1.4]],
        teeth: 0.72, serr: 0.012,
      }),
      japaneseMaple: () => palmate({
        base: 0.16, teeth: 0, serr: 0.03, serrK: 70, centre: [0, 0.18],
        lobes: [[0, 1.0, 0.27, 1.25], [0.62, 0.95, 0.27, 1.25], [-0.62, 0.95, 0.27, 1.25], [1.25, 0.82, 0.26, 1.25], [-1.25, 0.82, 0.26, 1.25], [1.9, 0.55, 0.24, 1.2], [-1.9, 0.55, 0.24, 1.2]],
      }),
      sweetgum: () => palmate({
        base: 0.36, teeth: 0, serr: 0.016, serrK: 80,
        lobes: [[0, 1.0, 0.55, 0.85], [1.25, 0.95, 0.52, 0.85], [-1.25, 0.95, 0.52, 0.85], [2.45, 0.72, 0.45, 0.85], [-2.45, 0.72, 0.45, 0.85]],
      }),
      redOak: () => pinnate({
        pairs: 4, reach: 0.12,
        width: (t) => {
          const phase = (t * 3.6 + 0.3) % 1;
          return 0.52 * env(t * 1.04, 0.7) * (0.36 + 0.64 * Math.pow(1 - Math.abs(2 * phase - 1), 0.55));
        },
      }),
      whiteOak: () => pinnate({
        pairs: 4, reach: 0.1,
        width: (t) => 0.46 * env(t * 1.03, 0.8) * (0.55 + 0.45 * Math.pow(Math.abs(Math.sin(t * Math.PI * 4.2 + 0.3)), 0.7)),
      }),
      beech: () => pinnate({
        pairs: 9, reach: 0.11, net: false,
        width: (t) => 0.38 * env(t, 0.75) * (1 + 0.035 * Math.abs(Math.sin(t * Math.PI * 10))),
      }),
      birch: () => pinnate({
        pairs: 7, reach: 0.12,
        width: (t) => 0.46 * Math.pow(Math.sin(Math.PI * t), 0.65) * (1.15 - 0.65 * t) * (1 + 0.04 * Math.abs(Math.sin(t * 70)) + 0.02 * Math.abs(Math.sin(t * 150))),
      }),
      elm: () => pinnate({
        pairs: 10, reach: 0.12,
        width: (t, side) => 0.4 * env(t, 0.8) * (side < 0 && t < 0.3 ? 0.78 : 1) * (1 + 0.05 * Math.abs(Math.sin(t * 60)) + 0.025 * Math.abs(Math.sin(t * 130))),
      }),
      ginkgo: () => {
        const pts = [[0, 0.75]];
        for (let i = 0; i <= 200; i++) {
          const a = -1.05 + (i / 200) * 2.1;
          const r = 1.45 - 0.32 * Math.exp(-(a * a) / (2 * 0.045 * 0.045)) + 0.035 * Math.sin(a * 22) * (0.6 + rand() * 0.4);
          pts.push([Math.sin(a) * r, 0.75 - Math.cos(a) * r]);
        }
        const veins = [];
        // Ginkgo veins fork in two again and again, fanning out from the stalk.
        const fork = (x, y, a, len, depth) => {
          const to = [x + Math.sin(a) * len, y - Math.cos(a) * len];
          veins.push({ pts: [[x, y], to], w: [0.008, 0.005], level: depth > 1 ? 2 : 3 });
          if (depth > 0) { fork(to[0], to[1], a - 0.09, len * 0.95, depth - 1); fork(to[0], to[1], a + 0.09, len * 0.95, depth - 1); }
        };
        fork(0, 0.75, -0.55, 0.38, 3); fork(0, 0.75, 0.55, 0.38, 3); fork(0, 0.75, 0, 0.38, 3);
        return { outline: poly(pts), veins, attach: [0, 0.75], stalk: 0.55 };
      },
      linden: () => {
        const pts = [];
        for (let i = 0; i <= 260; i++) {
          const t = (i / 260) * Math.PI * 2;
          const x = 16 * Math.pow(Math.sin(t), 3), y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
          const tooth = 1 + 0.02 * Math.pow(Math.abs(Math.sin(t * 34)), 2);
          pts.push([(x / 17) * 0.85 * tooth * (x < 0 ? 0.92 : 1), (-y / 17) * 1.05 * tooth + 0.1]);
        }
        const p = pinnate({ pairs: 4, reach: 0.22, width: () => 0.6 });
        return { outline: poly(pts), veins: p.veins.map((v) => ({ ...v, pts: v.pts.map(([x, y]) => [x, y * 0.95]) })), attach: [0, 0.82], stalk: 0.5 };
      },
    };

    // Autumn colours by species: [highlight, body, edge, blotches...]
    const AUTUMN = {
      sugarMaple: [['#f46a42', '#cf3a1f', '#7c1b10', '#f6a13c', '#ffd25a'], ['#f8a64c', '#e2742a', '#9a3d14', '#ffd45a', '#d0442a'], ['#ffd96c', '#f0b42e', '#a8741a', '#f08a2a', '#b9c04a']],
      japaneseMaple: [['#e8463c', '#ad211c', '#5c0f0c', '#f26a3a', '#7a1020'], ['#f07a3c', '#d24422', '#7a1e10', '#ffb04a', '#a82a2a']],
      sweetgum: [['#c45474', '#83294d', '#3e1229', '#de5c3c', '#5a1a3a'], ['#f27c3c', '#d44a2a', '#7a2010', '#ffb44a', '#9a2a4a']],
      redOak: [['#d66c3c', '#a8461e', '#5c2410', '#7a3a1e', '#d89c4c'], ['#bb8a5c', '#8c5e34', '#4c311a', '#6a4022', '#c8a062']],
      whiteOak: [['#b5543f', '#7f2e24', '#441610', '#9a5a30', '#5a2a20'], ['#b08a62', '#86603c', '#4a321e', '#a87a46', '#5e3e22']],
      beech: [['#e4a452', '#c07a2e', '#7a4616', '#d8ba62', '#9a5a22']],
      birch: [['#ffe274', '#e8c03a', '#a88420', '#c8c84a', '#f0a030']],
      elm: [['#f0d65c', '#d2b034', '#8e7420', '#b8b444', '#e09a34']],
      ginkgo: [['#fff28c', '#f2d44a', '#c0a028', '#e8e070', '#d8b030']],
      linden: [['#ece272', '#cac042', '#8a8420', '#a8b040', '#e0a840']],
    };
    const SPECIES = Object.keys(AUTUMN);

    // Paint one leaf: shaded blade, blotches of colour, a fine texture, its vein network,
    // and now and then tar spots, a browned edge or a few insect holes.
    function autumnLeaf(kind, variant, back) {
      const def = LEAVES[kind]();
      const [hi, body, edge, ...blot] = AUTUMN[kind][variant % AUTUMN[kind].length];
      const matte = (c, t) => (back ? mix(c, '#eadcc4', t) : c);
      return makeSprite(SIZE, (g, s) => {
        g.translate(s / 2, s / 2);
        g.scale(UNIT, UNIT);
        g.lineCap = 'round';
        g.lineJoin = 'round';
        // The stalk, behind the blade.
        const [ax, ay] = def.attach;
        taper(g, curve([ax, ay], [ax + 0.05, ay + def.stalk * 0.5], [ax + 0.1, ay + def.stalk], 8), 0.05, 0.03, matte(edge, 0.3));

        const shade = g.createRadialGradient(-0.12, 0.05, 0.05, 0, 0.12, 1.4);
        shade.addColorStop(0, matte(hi, 0.4));
        shade.addColorStop(0.55, matte(body, 0.38));
        shade.addColorStop(1, matte(edge, 0.32));
        g.fillStyle = shade;
        g.fill(def.outline);

        g.save();
        g.clip(def.outline);
        // Uneven colour: soft blotches where the leaf has turned at different rates.
        for (let i = 0; i < 28; i++) {
          const x = (rand() - 0.5) * 2, y = (rand() - 0.5) * 2.2, r = 0.12 + rand() * 0.4;
          const c = pick(blot), b = g.createRadialGradient(x, y, 0, x, y, r);
          b.addColorStop(0, rgba(back ? '#e8dcc4' : c, back ? 0.12 : 0.22 + rand() * 0.28));
          b.addColorStop(1, rgba(back ? '#e8dcc4' : c, 0));
          g.fillStyle = b;
          g.fillRect(x - r, y - r, r * 2, r * 2);
        }
        // Light from the upper right: the far half of the blade a shade darker.
        const fold = g.createLinearGradient(-1.2, 0, 0.3, 0);
        fold.addColorStop(0, 'rgba(30,10,0,0.18)');
        fold.addColorStop(1, 'rgba(30,10,0,0)');
        g.fillStyle = fold;
        g.fillRect(-1.5, -1.5, 3, 3);
        // Fine surface texture.
        for (let i = 0; i < 420; i++) {
          g.fillStyle = rand() < 0.5 ? 'rgba(40,15,0,0.07)' : 'rgba(255,240,200,0.06)';
          g.fillRect((rand() - 0.5) * 2.6, (rand() - 0.5) * 2.6, 0.012 + rand() * 0.02, 0.012 + rand() * 0.02);
        }
        if (!back && kind.includes('Maple') && rand() < 0.3) {
          // Tar spots: black blots ringed with yellow, common on fallen maple leaves.
          for (let i = 0, n = 1 + Math.floor(rand() * 4); i < n; i++) {
            const x = (rand() - 0.5) * 1.1, y = (rand() - 0.5) * 1.1, r = 0.05 + rand() * 0.07;
            const halo = g.createRadialGradient(x, y, r * 0.8, x, y, r * 2.4);
            halo.addColorStop(0, 'rgba(240,200,70,0.6)');
            halo.addColorStop(1, 'rgba(240,200,70,0)');
            g.fillStyle = halo; g.fillRect(x - r * 2.5, y - r * 2.5, r * 5, r * 5);
            g.fillStyle = 'rgba(20,12,8,0.85)';
            g.beginPath();
            for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2, rr = r * (0.7 + rand() * 0.5); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
            g.closePath(); g.fill();
          }
        }
        if (rand() < 0.35) {
          // A browned, drying edge.
          g.strokeStyle = 'rgba(70,35,12,0.32)';
          g.lineWidth = 0.14;
          g.stroke(def.outline);
        }
        // The vein network: fine net first, then side veins, then the main ribs.
        const veinCol = back ? mix(hi, '#fff6e4', 0.6) : mix(hi, '#fff0c4', 0.35);
        for (const level of [3, 2, 1]) {
          for (const v of def.veins) {
            if (v.level !== level) continue;
            const alpha = level === 3 ? 0.16 : level === 2 ? 0.32 : 0.42;
            taper(g, v.pts, v.w[0], v.w[1], rgba(veinCol, back ? Math.min(0.7, alpha * 1.5) : alpha));
          }
        }
        // A dark hairline beside each main rib gives it a little relief.
        for (const v of def.veins) {
          if (v.level !== 1) continue;
          g.save(); g.translate(0.012, 0.008);
          taper(g, v.pts, v.w[0] * 0.5, v.w[1] * 0.5, 'rgba(40,12,0,0.18)');
          g.restore();
        }
        g.restore();

        if (rand() < 0.25) {
          // A few small holes, chewed by insects in summer.
          g.globalCompositeOperation = 'destination-out';
          for (let i = 0, n = 1 + Math.floor(rand() * 3); i < n; i++) {
            const x = (rand() - 0.5) * 1, y = (rand() - 0.5) * 1, r = 0.03 + rand() * 0.06;
            g.beginPath();
            for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, rr = r * (0.6 + rand() * 0.6); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
            g.closePath(); g.fill();
          }
          g.globalCompositeOperation = 'source-over';
        }
        g.strokeStyle = rgba(edge, 0.45);
        g.lineWidth = 0.012;
        g.stroke(def.outline);
      });
    }

    // A maple key: a seed with one papery, veined wing. Falls spinning like a rotor.
    function samara() {
      return makeSprite(128, (g, s) => {
        g.translate(s * 0.22, s * 0.55);
        g.scale(s / 2.4, s / 2.4);
        const wing = new Path2D();
        wing.moveTo(0.02, -0.06);
        wing.bezierCurveTo(0.35, -0.42, 0.95, -0.5, 1.32, -0.34);
        wing.bezierCurveTo(1.5, -0.24, 1.46, 0.08, 1.22, 0.14);
        wing.bezierCurveTo(0.85, 0.22, 0.4, 0.18, 0.05, 0.08);
        wing.closePath();
        const tan = g.createLinearGradient(0, -0.3, 0, 0.12);
        tan.addColorStop(0, 'rgba(170,122,70,0.9)');
        tan.addColorStop(1, 'rgba(226,196,146,0.6)');
        g.fillStyle = tan;
        g.fill(wing);
        g.save(); g.clip(wing);
        for (let i = 0; i < 16; i++) {
          const t = i / 16;
          stroke(g, curve([0.08, 0], [0.6, -0.26 + t * 0.2], [1.38, -0.32 + t * 0.48], 10), 0.007, 'rgba(110,70,30,0.4)');
        }
        g.restore();
        stroke(g, curve([0.02, -0.06], [0.6, -0.46], [1.32, -0.34], 12), 0.035, 'rgba(110,64,28,0.9)');
        // The seed: a plump, ridged nutlet.
        const nut = g.createRadialGradient(-0.03, -0.04, 0.01, 0, 0, 0.17);
        nut.addColorStop(0, '#c08a52');
        nut.addColorStop(1, '#6e4220');
        g.fillStyle = nut;
        g.beginPath(); g.ellipse(0, 0, 0.17, 0.13, -0.2, 0, Math.PI * 2); g.fill();
        for (let i = 0; i < 4; i++) stroke(g, curve([-0.12, -0.06 + i * 0.04], [0, -0.1 + i * 0.05], [0.13, -0.04 + i * 0.03], 6), 0.008, 'rgba(60,32,12,0.5)');
      });
    }

    // An acorn: a scaly cap on a glossy nut.
    function acorn() {
      return makeSprite(128, (g, s) => {
        g.translate(s / 2, s / 2);
        g.rotate(-0.4);
        g.scale(s / 2.6, s / 2.6);
        const nut = g.createLinearGradient(-0.4, 0, 0.4, 0);
        nut.addColorStop(0, '#5e3a1c'); nut.addColorStop(0.45, '#a8743c'); nut.addColorStop(0.6, '#c99550'); nut.addColorStop(1, '#4e2e14');
        g.fillStyle = nut;
        g.beginPath(); g.ellipse(0, 0.2, 0.36, 0.55, 0, 0, Math.PI * 2); g.fill();
        stroke(g, [[0.05, 0.62], [0.02, 0.8]], 0.05, '#4a2c12');
        g.fillStyle = 'rgba(255,245,220,0.25)';
        g.beginPath(); g.ellipse(0.12, 0.1, 0.05, 0.25, 0.1, 0, Math.PI * 2); g.fill();
        const cap = g.createLinearGradient(0, -0.45, 0, 0);
        cap.addColorStop(0, '#8a6a42'); cap.addColorStop(1, '#5a4024');
        g.fillStyle = cap;
        g.beginPath(); g.ellipse(0, -0.12, 0.44, 0.3, 0, Math.PI, Math.PI * 2); g.lineTo(0.44, -0.04); g.quadraticCurveTo(0, 0.06, -0.44, -0.04); g.closePath(); g.fill();
        // Overlapping scales on the cap.
        for (let row = 0; row < 4; row++) {
          for (let i = 0; i < 9; i++) {
            const x = -0.36 + (i / 8) * 0.72 + (row % 2) * 0.04, y = -0.36 + row * 0.08;
            g.strokeStyle = 'rgba(50,32,14,0.55)'; g.lineWidth = 0.012;
            g.beginPath(); g.arc(x, y, 0.045, 0.2, Math.PI - 0.2); g.stroke();
          }
        }
        stroke(g, [[0, -0.42], [0.03, -0.55]], 0.04, '#5a4024');
      });
    }

    // A fallen twig: forked, with bark texture, lenticels and a couple of buds.
    function twig() {
      const W = 256, H = 72;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      g.lineCap = 'round';
      const main = [];
      for (let i = 0; i <= 10; i++) main.push([18 + i * 22, H * 0.55 + Math.sin(i * 1.3) * 3 + (rand() - 0.5) * 3]);
      const bark = (pts, w0, w1) => {
        taper(g, pts, w0, w1, '#4a3424');
        g.save(); g.translate(0, -w0 * 0.18);
        taper(g, pts, w0 * 0.45, w1 * 0.45, 'rgba(160,128,96,0.5)');
        g.restore();
      };
      bark(main, 7, 3);
      const fork = main[4], tip = [fork[0] + 60, fork[1] - 26];
      bark(curve(fork, [fork[0] + 30, fork[1] - 4], tip, 6), 4, 1.6);
      // Lenticels and fine bark lines.
      for (let i = 0; i < 40; i++) {
        const p = pick(main);
        g.fillStyle = rand() < 0.5 ? 'rgba(200,180,150,0.6)' : 'rgba(30,20,12,0.5)';
        g.fillRect(p[0] + (rand() - 0.5) * 20, p[1] + (rand() - 0.5) * 4, 2 + rand() * 3, 0.8);
      }
      for (const b of [main[7], tip]) {
        g.fillStyle = '#6a4626';
        g.beginPath(); g.ellipse(b[0] + 4, b[1] - 3, 4, 2, -0.6, 0, Math.PI * 2); g.fill();
      }
      return c;
    }

    /* ---------- the garden ---------- */

    // Florets packed in the sunflower spiral (the golden angle), as in a daisy's centre.
    function disc(g, R, n, inner, outer, ring) {
      const glow = g.createRadialGradient(0, -R * 0.2, 0, 0, 0, R);
      glow.addColorStop(0, inner); glow.addColorStop(1, outer);
      g.fillStyle = glow;
      g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
      for (let i = 1; i < n; i++) {
        const r = R * 0.95 * Math.sqrt(i / n), a = i * 2.39996;
        g.fillStyle = i / n > 0.75 && ring ? ring : `rgba(90,50,10,${0.28 + 0.2 * (i / n)})`;
        g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, R * 0.045, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = 'rgba(255,255,230,0.25)';
      g.beginPath(); g.ellipse(-R * 0.25, -R * 0.3, R * 0.35, R * 0.2, -0.5, 0, Math.PI * 2); g.fill();
    }
    // A petal drawn along +y from r0 to r1, widest at `belly`, with an optional notched tip.
    function petal(g, r0, r1, width, belly, notch = 0, teeth = 0) {
      const p = new Path2D(), L = r1 - r0, wB = r0 + L * belly;
      p.moveTo(-width * 0.25, r0);
      p.bezierCurveTo(-width, wB, -width * 0.95, r1 - L * 0.1, -width * 0.5, r1);
      if (teeth) {
        for (let k = 0; k < teeth; k++) {
          const x0 = -width * 0.5 + (width / teeth) * k, x1 = x0 + width / teeth;
          p.lineTo((x0 + x1) / 2, r1 + L * 0.06);
          p.lineTo(x1, r1 - L * 0.02);
        }
      } else if (notch) {
        p.quadraticCurveTo(-width * 0.25, r1 + L * 0.06, 0, r1 - L * notch);
        p.quadraticCurveTo(width * 0.25, r1 + L * 0.06, width * 0.5, r1);
      } else {
        p.quadraticCurveTo(0, r1 + L * 0.1, width * 0.5, r1);
      }
      p.bezierCurveTo(width * 0.95, r1 - L * 0.1, width, wB, width * 0.25, r0);
      p.closePath();
      return p;
    }
    function fillPetal(g, path, r0, r1, c0, c1, lines, lineCol) {
      const grad = g.createLinearGradient(0, r0, 0, r1);
      grad.addColorStop(0, c0); grad.addColorStop(1, c1);
      g.fillStyle = grad;
      g.fill(path);
      if (lines) {
        g.save(); g.clip(path);
        for (let i = 0; i < lines; i++) {
          const x = (i / (lines - 1) - 0.5) * 0.6 * (r1 - r0) * 0.3;
          stroke(g, [[x * 0.3, r0], [x, (r0 + r1) / 2], [x * 1.4, r1]], (r1 - r0) * 0.012, lineCol);
        }
        g.restore();
      }
    }

    const FLOWERS = {
      // Oxeye daisy: slender white rays, each faintly grooved, around a golden spiral of florets.
      daisy: (g, R) => {
        const n = 22;
        for (let i = 0; i < n; i++) {
          g.save(); g.rotate((i / n) * Math.PI * 2 + (rand() - 0.5) * 0.08);
          const p = petal(g, R * 0.2, R * (0.92 + rand() * 0.1), R * 0.12, 0.6, 0.06);
          fillPetal(g, p, R * 0.2, R, '#e4e1d6', '#ffffff', 3, 'rgba(150,150,140,0.22)');
          g.strokeStyle = 'rgba(140,140,130,0.25)'; g.lineWidth = R * 0.008; g.stroke(p);
          g.restore();
        }
        disc(g, R * 0.24, 120, '#f6c834', '#c88a12');
      },
      // Cosmos: eight broad pink petals, notched at the tip and grooved, with a small yellow eye.
      cosmos: (g, R) => {
        for (let i = 0; i < 8; i++) {
          g.save(); g.rotate((i / 8) * Math.PI * 2 + (rand() - 0.5) * 0.1);
          const p = petal(g, R * 0.12, R * 0.98, R * 0.3, 0.72, 0, 3);
          fillPetal(g, p, R * 0.12, R, '#b8285e', '#f0a4c2', 7, 'rgba(150,30,80,0.22)');
          g.restore();
        }
        disc(g, R * 0.17, 70, '#f8d040', '#c8901a', 'rgba(110,60,10,0.6)');
      },
      // Field poppy: four papery, crinkled scarlet petals with a dark blotch at the base,
      // a ring of black stamens and a grey-green seed head.
      poppy: (g, R) => {
        const order = [0, Math.PI, Math.PI / 2, -Math.PI / 2];
        order.forEach((a, k) => {
          g.save(); g.rotate(a + (rand() - 0.5) * 0.2);
          const big = k < 2 ? 1 : 0.9;
          const pts = [];
          for (let i = 0; i <= 90; i++) {
            const t = -Math.PI / 2 - 0.95 + (i / 90) * 1.9;
            const r = R * big * (0.94 + 0.03 * Math.sin(t * 9 + k) + 0.02 * Math.sin(t * 23 + k * 2));
            pts.push([Math.cos(t) * r, Math.sin(t) * r + R * 0.05]);
          }
          const p = poly([[0, R * 0.08], ...pts]);
          const grad = g.createRadialGradient(0, 0, R * 0.05, 0, 0, R * big);
          grad.addColorStop(0, '#1c0c08'); grad.addColorStop(0.2, '#7a0f0a'); grad.addColorStop(0.32, '#d8301e'); grad.addColorStop(1, '#f2603a');
          g.globalAlpha = 0.95;
          g.fillStyle = grad; g.fill(p);
          g.save(); g.clip(p);
          for (let i = 0; i < 18; i++) {
            const t = -Math.PI / 2 - 0.9 + (i / 17) * 1.8;
            stroke(g, [[0, 0], [Math.cos(t) * R * 0.5, Math.sin(t) * R * 0.5], [Math.cos(t) * R, Math.sin(t) * R]], R * 0.006, 'rgba(120,10,0,0.25)');
          }
          g.restore();
          g.globalAlpha = 1;
          g.restore();
        });
        for (let i = 0; i < 46; i++) {
          const a = rand() * Math.PI * 2, r = R * (0.16 + rand() * 0.1);
          stroke(g, [[Math.cos(a) * R * 0.1, Math.sin(a) * R * 0.1], [Math.cos(a) * r, Math.sin(a) * r]], R * 0.008, 'rgba(15,8,8,0.8)');
          g.fillStyle = '#1a1010'; g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, R * 0.018, 0, Math.PI * 2); g.fill();
        }
        g.fillStyle = '#7a8a6a'; g.beginPath(); g.arc(0, 0, R * 0.1, 0, Math.PI * 2); g.fill();
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; stroke(g, [[0, 0], [Math.cos(a) * R * 0.1, Math.sin(a) * R * 0.1]], R * 0.012, '#2e2a3a'); }
      },
      // Cornflower: ragged blue florets, each a toothed funnel, around a cluster of purple ones.
      cornflower: (g, R) => {
        for (let i = 0; i < 9; i++) {
          g.save(); g.rotate((i / 9) * Math.PI * 2 + (rand() - 0.5) * 0.15);
          const p = petal(g, R * 0.2, R * 0.95, R * 0.26, 0.85, 0, 5);
          fillPetal(g, p, R * 0.2, R, '#2c4cb8', '#7894f2', 4, 'rgba(20,30,120,0.25)');
          g.restore();
        }
        for (let i = 0; i < 30; i++) {
          const a = rand() * Math.PI * 2, r = rand() * R * 0.24;
          g.fillStyle = rand() < 0.5 ? '#4a2470' : '#6a3a9a';
          g.beginPath(); g.ellipse(Math.cos(a) * r, Math.sin(a) * r, R * 0.035, R * 0.06, a, 0, Math.PI * 2); g.fill();
        }
      },
      // Buttercup: five glossy, cupped yellow petals, each with a bright sheen near the base.
      buttercup: (g, R) => {
        for (let i = 0; i < 5; i++) {
          g.save(); g.rotate((i / 5) * Math.PI * 2);
          const p = petal(g, R * 0.05, R * 0.9, R * 0.62, 0.7);
          fillPetal(g, p, R * 0.05, R, '#e8a812', '#ffe04a', 0);
          g.save(); g.clip(p);
          g.fillStyle = 'rgba(255,255,240,0.55)';
          g.beginPath(); g.ellipse(0, R * 0.4, R * 0.09, R * 0.22, 0, 0, Math.PI * 2); g.fill();
          g.restore();
          g.strokeStyle = 'rgba(170,110,0,0.3)'; g.lineWidth = R * 0.01; g.stroke(p);
          g.restore();
        }
        g.fillStyle = '#7a9a3a'; g.beginPath(); g.arc(0, 0, R * 0.14, 0, Math.PI * 2); g.fill();
        for (let i = 0; i < 26; i++) {
          const a = rand() * Math.PI * 2, r = R * (0.12 + rand() * 0.1);
          g.fillStyle = '#f4c21a'; g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, R * 0.022, 0, Math.PI * 2); g.fill();
        }
      },
      // Red clover: a rounded head of many small tubular florets.
      clover: (g, R) => {
        for (let i = 0; i < 70; i++) {
          const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * R * 0.62;
          const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.9;
          g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2);
          const p = petal(g, 0, R * 0.32, R * 0.07, 0.5);
          fillPetal(g, p, 0, R * 0.32, '#8a2a5a', '#f0a0c8', 0);
          g.restore();
        }
      },
      // Queen Anne's lace: a flat umbrella of tiny white florets in small clusters,
      // with a single dark purple floret at the centre.
      lace: (g, R) => {
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2 + rand() * 0.2, r = R * (0.25 + (k % 2) * 0.38) + rand() * R * 0.1;
          const cx = Math.cos(a) * r, cy = Math.sin(a) * r;
          for (let i = 0; i < 12; i++) {
            const b = rand() * Math.PI * 2, d = rand() * R * 0.14;
            g.fillStyle = rand() < 0.15 ? '#e8e4d8' : '#fbfaf4';
            g.beginPath(); g.arc(cx + Math.cos(b) * d, cy + Math.sin(b) * d, R * 0.035, 0, Math.PI * 2); g.fill();
            g.fillStyle = 'rgba(140,150,110,0.35)';
            g.beginPath(); g.arc(cx + Math.cos(b) * d, cy + Math.sin(b) * d, R * 0.01, 0, Math.PI * 2); g.fill();
          }
        }
        g.fillStyle = '#3a1a3a'; g.beginPath(); g.arc(0, 0, R * 0.05, 0, Math.PI * 2); g.fill();
      },
      // Dandelion clock: seeds on fine stalks, each ending in a parachute of hairs.
      clock: (g, R) => {
        for (let i = 0; i < 90; i++) {
          const a = rand() * Math.PI * 2, r = R * (0.82 + rand() * 0.12);
          const tx = Math.cos(a) * r, ty = Math.sin(a) * r;
          stroke(g, [[Math.cos(a) * R * 0.08, Math.sin(a) * R * 0.08], [tx, ty]], R * 0.006, 'rgba(255,255,255,0.75)');
          for (let k = 0; k < 7; k++) {
            const b = a + (k / 6 - 0.5) * 1.3;
            stroke(g, [[tx, ty], [tx + Math.cos(b) * R * 0.12, ty + Math.sin(b) * R * 0.12]], R * 0.004, 'rgba(255,255,255,0.6)');
          }
        }
        g.fillStyle = '#8a6a3a'; g.beginPath(); g.arc(0, 0, R * 0.08, 0, Math.PI * 2); g.fill();
      },
    };
    function flower(type) {
      return makeSprite(SIZE, (g, s) => {
        g.translate(s / 2, s / 2);
        FLOWERS[type](g, s * 0.46);
      });
    }

    // A bud: green sepals just opening, a hint of the petal colour at the tip.
    function bud(color) {
      return makeSprite(96, (g, s) => {
        g.translate(s / 2, s * 0.62);
        g.fillStyle = color;
        g.beginPath(); g.ellipse(0, -s * 0.2, s * 0.1, s * 0.16, 0, 0, Math.PI * 2); g.fill();
        for (const side of [-1, 0, 1]) {
          const grad = g.createLinearGradient(0, 0, 0, -s * 0.3);
          grad.addColorStop(0, '#4e6e34'); grad.addColorStop(1, '#8aa65a');
          g.fillStyle = grad;
          g.beginPath();
          g.moveTo(0, s * 0.05);
          g.quadraticCurveTo(side * s * 0.22, -s * 0.1, side * s * 0.06, -s * 0.3);
          g.quadraticCurveTo(side * s * 0.02, -s * 0.12, 0, s * 0.05);
          g.fill();
        }
      });
    }

    // Garden foliage. Each sprite is drawn pointing up from its base at the bottom centre.
    const FOLIAGE = {
      // Long and slender with parallel veins, like a grass or lily leaf.
      lance: (g, s) => {
        const p = pinnate({ pairs: 0, net: false, length: 2.4, width: (t) => 0.13 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.02)), 0.5) });
        return [p, ['#4e6e34', '#7f9c56'], 'parallel'];
      },
      // Broad and toothed with branching veins, like a nettle or mint.
      toothed: () => [pinnate({ pairs: 6, reach: 0.14, width: (t) => 0.44 * Math.pow(Math.sin(Math.PI * t), 0.7) * (1.1 - 0.5 * t) * (1 + 0.07 * Math.pow(Math.abs(Math.sin(t * 46)), 2)) }), ['#46682e', '#86a85a'], 'net'],
      // Finely cut and feathery, like cosmos, yarrow or carrot leaves.
      feathery: () => {
        const pts = [];
        const pinnae = [];
        for (let k = 0; k < 9; k++) {
          const t = 0.08 + k * 0.1, y = 0.9 - 2 * t, len = 0.5 * Math.sin(Math.PI * (t + 0.05));
          for (const side of [-1, 1]) pinnae.push([[0, y], [side * len * 0.5, y - 0.12], [side * len, y - 0.05]]);
        }
        return [{ pinnae, attach: [0, 0.9] }, ['#4a6a30', '#7e9c50'], 'feather'];
      },
      // Three heart-shaped leaflets, each with a pale chevron: clover.
      trefoil: () => [{ trefoil: true, attach: [0, 0.9] }, ['#3e6428', '#6e9446'], 'trefoil'],
      // Deeply toothed, pointing backward: a dandelion leaf.
      dandelion: () => [pinnate({
        pairs: 0, net: false, length: 2.2,
        width: (t) => 0.32 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.02)), 0.6) * (0.35 + 0.65 * Math.pow(((t * 5.5) % 1), 1.6)),
      }), ['#4a6c2e', '#7a9e4c'], 'net'],
    };
    function foliage(type) {
      return makeSprite(SIZE, (g, s) => {
        const [def, [dark, light], style] = FOLIAGE[type](g, s);
        g.translate(s / 2, s * 0.95);
        g.scale(s / 2.6, s / 2.6);
        g.translate(0, -0.9);
        g.lineCap = 'round';
        const grad = g.createLinearGradient(0, 0.9, 0, -1.4);
        grad.addColorStop(0, dark); grad.addColorStop(1, light);
        if (style === 'feather') {
          stroke(g, [[0, 0.9], [0, -1.1]], 0.04, dark);
          for (const p of def.pinnae) {
            stroke(g, p, 0.03, dark);
            for (let i = 1; i < p.length; i++) {
              const [x, y] = p[i];
              g.fillStyle = grad;
              g.beginPath(); g.ellipse(x, y, 0.07, 0.035, Math.atan2(y - p[0][1], x - p[0][0]), 0, Math.PI * 2); g.fill();
            }
          }
          return;
        }
        if (style === 'trefoil') {
          stroke(g, [[0, 0.9], [0, 0]], 0.04, dark);
          for (const a of [-1.15, 0, 1.15]) {
            g.save(); g.rotate(a);
            const leaf = new Path2D();
            leaf.moveTo(0, 0);
            leaf.bezierCurveTo(-0.5, -0.2, -0.45, -0.85, 0, -0.72);
            leaf.bezierCurveTo(0.45, -0.85, 0.5, -0.2, 0, 0);
            g.fillStyle = grad; g.fill(leaf);
            g.strokeStyle = 'rgba(230,240,210,0.55)'; g.lineWidth = 0.05;
            g.beginPath(); g.moveTo(-0.22, -0.35); g.lineTo(0, -0.25); g.lineTo(0.22, -0.35); g.stroke();
            stroke(g, [[0, 0], [0, -0.68]], 0.015, 'rgba(30,50,20,0.35)');
            g.restore();
          }
          return;
        }
        g.fillStyle = grad;
        g.fill(def.outline);
        g.save(); g.clip(def.outline);
        const light2 = g.createLinearGradient(-0.5, 0, 0.5, 0);
        light2.addColorStop(0, 'rgba(0,20,0,0.18)'); light2.addColorStop(0.5, 'rgba(0,0,0,0)'); light2.addColorStop(1, 'rgba(255,255,220,0.08)');
        g.fillStyle = light2; g.fillRect(-1.5, -2, 3, 4);
        if (style === 'parallel') {
          for (const x of [-0.06, -0.03, 0, 0.03, 0.06]) stroke(g, [[x * 0.6, 0.9], [x, -0.3], [x * 0.2, -1.45]], x ? 0.006 : 0.015, 'rgba(220,240,190,0.3)');
        } else {
          for (const v of def.veins) taper(g, v.pts, v.w[0] * 0.9, v.w[1], `rgba(220,240,190,${v.level === 1 ? 0.4 : v.level === 2 ? 0.28 : 0.12})`);
        }
        g.restore();
        g.strokeStyle = 'rgba(30,50,20,0.35)'; g.lineWidth = 0.012; g.stroke(def.outline);
      });
    }

    // A grass seed head: a nodding plume of spikelets on hair-fine branches.
    function grassHead(golden) {
      return makeSprite(SIZE, (g, s) => {
        g.translate(s / 2, s * 0.95);
        const tone = golden ? ['#9a8a4a', '#d8c47a'] : ['#6a7a42', '#a8b46a'];
        stroke(g, [[0, 0], [s * 0.02, -s * 0.5], [s * 0.08, -s * 0.85]], s * 0.008, tone[0]);
        for (let i = 0; i < 26; i++) {
          const t = 0.2 + (i / 26) * 0.75, side = i % 2 ? 1 : -1;
          const bx = s * 0.08 * t, by = -s * 0.85 * t;
          const ex = bx + side * s * (0.06 + rand() * 0.1) * (1.1 - t), ey = by + s * (0.02 + rand() * 0.06);
          stroke(g, [[bx, by], [ex, ey]], s * 0.004, tone[0]);
          for (let k = 0; k < 3; k++) {
            const u = 0.5 + k * 0.25, x = bx + (ex - bx) * u, y = by + (ey - by) * u;
            g.fillStyle = k === 2 ? tone[1] : tone[0];
            g.beginPath(); g.ellipse(x, y, s * 0.012, s * 0.026, Math.atan2(ey - by, ex - bx) + Math.PI / 2, 0, Math.PI * 2); g.fill();
          }
        }
      });
    }

    // A small white butterfly: veined wings, grey tips and a pair of spots.
    function butterflyWing() {
      return makeSprite(128, (g, s) => {
        g.translate(s * 0.05, s / 2);
        const fore = new Path2D();
        fore.moveTo(0, 0);
        fore.bezierCurveTo(s * 0.15, -s * 0.42, s * 0.62, -s * 0.48, s * 0.82, -s * 0.36);
        fore.bezierCurveTo(s * 0.86, -s * 0.18, s * 0.5, -s * 0.02, 0, 0);
        const hind = new Path2D();
        hind.moveTo(0, 0);
        hind.bezierCurveTo(s * 0.4, s * 0.02, s * 0.68, s * 0.16, s * 0.58, s * 0.36);
        hind.bezierCurveTo(s * 0.42, s * 0.48, s * 0.12, s * 0.3, 0, 0);
        for (const [wing, tint] of [[hind, '#f1efe6'], [fore, '#faf9f3']]) {
          g.fillStyle = tint; g.fill(wing);
          g.save(); g.clip(wing);
          for (let i = 0; i < 6; i++) { const a = -0.9 + i * 0.32; stroke(g, [[0, 0], [Math.cos(a) * s * 0.9, Math.sin(a) * s * 0.9]], s * 0.006, 'rgba(120,120,100,0.3)'); }
          g.restore();
          g.strokeStyle = 'rgba(110,110,90,0.4)'; g.lineWidth = s * 0.01; g.stroke(wing);
        }
        g.save(); g.clip(fore);
        g.fillStyle = 'rgba(70,70,70,0.7)';
        g.beginPath(); g.ellipse(s * 0.78, -s * 0.36, s * 0.16, s * 0.1, -0.3, 0, Math.PI * 2); g.fill();
        g.restore();
        g.fillStyle = 'rgba(60,60,60,0.75)';
        g.beginPath(); g.arc(s * 0.5, -s * 0.2, s * 0.04, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(s * 0.32, s * 0.12, s * 0.035, 0, Math.PI * 2); g.fill();
      });
    }

    return { SPECIES, AUTUMN, autumnLeaf, samara, acorn, twig, flower, bud, foliage, grassHead, butterflyWing };
  })();

  /* ==========================================================
     Stars: a night sky as a camera sees it, now and then a meteor or a satellite
     ========================================================== */
  function Stars() {
    // Real stars are faintly tinted by temperature: blue-white, white, warm white, pale orange.
    const TINTS = [['#d6e0ff', 0.2], ['#ffffff', 0.45], ['#fff2df', 0.25], ['#ffdcb8', 0.1]];
    // Each star's light: a tight bright core with a soft falloff, like a point blurred by a lens.
    const glows = TINTS.map(([color]) => makeSprite(64, (g, size) => {
      const [r, gr, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
      const rg = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      rg.addColorStop(0, `rgba(${r},${gr},${b},1)`);
      rg.addColorStop(0.07, `rgba(${r},${gr},${b},0.9)`);
      rg.addColorStop(0.18, `rgba(${r},${gr},${b},0.32)`);
      rg.addColorStop(0.4, `rgba(${r},${gr},${b},0.06)`);
      rg.addColorStop(1, `rgba(${r},${gr},${b},0)`);
      g.fillStyle = rg;
      g.fillRect(0, 0, size, size);
    }));
    let stars = [], meteor = null, nextMeteor = 6000, satellite = null, nextSatellite = 20000;

    function tint() {
      let r = rand();
      for (let i = 0; i < TINTS.length; i++) { if ((r -= TINTS[i][1]) <= 0) return i; }
      return 1;
    }
    function star(x, y) {
      const m = Math.pow(rand(), 3);                    // brightness: most stars are faint, a few are bright
      const faint = m < 0.22;
      return {
        x, y, faint, k: 0.04 + rand() * 0.18,         // depth: how fast it slides as the page scrolls
        size: faint ? 0.55 + rand() * 0.55 : 3 + m * 11,  // a crisp point, or the width of the glow
        base: faint ? 0.18 + rand() * 0.4 : 0.55 + m * 0.45,
        glow: glows[faint ? 1 : tint()],
        depth: faint ? rand() * 0.15 : 0.08 + rand() * 0.3,   // how much it twinkles
        speed: 0.05 + rand() * 0.25,                       // twinkles per second
        phase: rand() * TAU,
      };
    }

    return {
      fps: 24,
      parallax: true,
      colors() {},
      resize() {
        stars = [];
        // An even scatter of mostly faint stars.
        for (let i = 0, n = Math.round((w * h) / 800); i < n; i++) stars.push(star(rand() * w, rand() * h));
        // A handful of the brightest, with a wider bloom.
        for (let i = 0, n = 3 + Math.floor(rand() * 4); i < n; i++) {
          const s = star(rand() * w, rand() * h);
          s.faint = false; s.size = 14 + rand() * 8; s.base = 0.9; s.glow = glows[tint()];
          stars.push(s);
        }
        // A few loose clusters, the way stars bunch up in a real photo. Kept out in the open.
        for (let c = 0, clusters = 3 + Math.floor(rand() * 3); c < clusters; c++) {
          let cx = 0, cy = 0;
          for (let tries = 0; tries < 12; tries++) {
            cx = rand() * w; cy = rand() * h;
            if (quiet(cx, cy, 0, 140) > 0.9) break;
          }
          const spread = 25 + rand() * 45;
          const k = 0.04 + rand() * 0.18;
          for (let i = 0, n = 20 + Math.floor(rand() * 35); i < n; i++) {
            const s = star(cx + gauss() * spread * 1.3, cy + gauss() * spread * 1.3);
            s.k = k;
            stars.push(s);
          }
        }
      },
      update(now) {
        if (!meteor && now > nextMeteor) {
          const fromRight = rand() < 0.5;
          meteor = {
            x: fromRight ? w * (0.75 + rand() * 0.3) : w * (0.05 + rand() * 0.25),
            y: -20 + rand() * h * 0.25,
            angle: fromRight ? Math.PI * (0.72 + rand() * 0.08) : Math.PI * (0.2 + rand() * 0.08),
            start: now, life: 700 + rand() * 500, length: 90 + rand() * 90,
          };
          nextMeteor = now + 12000 + rand() * 20000;
        }
        if (meteor && now - meteor.start > meteor.life) meteor = null;
        // A satellite: a steady dot crossing the top of the sky, slowly.
        if (!satellite && now > nextSatellite) {
          const ltr = rand() < 0.5;
          satellite = { x0: ltr ? -10 : w + 10, x1: ltr ? w + 10 : -10, y0: h * (0.04 + rand() * 0.18), drop: h * (rand() * 0.12), start: now, life: 28000 + rand() * 14000 };
          nextSatellite = now + 50000 + rand() * 50000;
        }
        if (satellite && now - satellite.start > satellite.life) satellite = null;
      },
      draw(now) {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#ffffff';
        for (const s of stars) {
          const y = onScreen(s.y, s.k, 12, h);
          const twinkle = 1 - s.depth * (0.5 + 0.5 * Math.sin(now * 0.001 * s.speed * TAU + s.phase));
          const a = s.base * twinkle * quiet(s.x, y, 0.28, 100);
          if (a < 0.012) continue;
          ctx.globalAlpha = a;
          if (s.faint) ctx.fillRect(s.x - s.size / 2, y - s.size / 2, s.size, s.size);
          else ctx.drawImage(s.glow, s.x - s.size / 2, y - s.size / 2, s.size, s.size);
        }
        ctx.globalAlpha = 1;

        if (satellite) {
          const p = (now - satellite.start) / satellite.life;
          const x = satellite.x0 + (satellite.x1 - satellite.x0) * p, y = satellite.y0 + satellite.drop * p;
          ctx.globalAlpha = 0.5 * Math.min(1, p * 8, (1 - p) * 8) * quiet(x, y, 0.2, 100);
          ctx.beginPath(); ctx.arc(x, y, 0.8, 0, TAU); ctx.fill();
          ctx.globalAlpha = 1;
        }
        if (meteor) {
          const p = (now - meteor.start) / meteor.life;
          const dist = p * Math.max(w, h) * 0.4;
          const hx = meteor.x + Math.cos(meteor.angle) * dist, hy = meteor.y + Math.sin(meteor.angle) * dist;
          const tx = hx - Math.cos(meteor.angle) * meteor.length, ty = hy - Math.sin(meteor.angle) * meteor.length;
          const a = Math.sin(p * Math.PI) * 0.8 * quiet(hx, hy, 0.15, 120);
          const grad = ctx.createLinearGradient(hx, hy, tx, ty);
          grad.addColorStop(0, `rgba(255,255,255,${a})`);
          grad.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.1;
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
        }
      },
    };
  }

  /* ==========================================================
     Autumn: leaves falling at three depths, a few resting along the bottom
     ========================================================== */
  function Autumn() {
    // Mostly maples and oaks, as in a real fall, with birch, beech, elm, sweetgum, linden and ginkgo.
    const ODDS = ['sugarMaple', 'sugarMaple', 'sugarMaple', 'japaneseMaple', 'sweetgum', 'redOak', 'redOak', 'whiteOak',
      'beech', 'birch', 'birch', 'elm', 'ginkgo', 'linden'];
    const LAYERS = [
      { size: [7, 10], speed: [16, 28], alpha: 0.6, per: 1 / 24000, soft: false, under: 0.3, k: 0.12 },
      { size: [12, 18], speed: [30, 48], alpha: 0.95, per: 1 / 30000, soft: false, under: 0.3, k: 0.3 },
      { size: [26, 40], speed: [55, 80], alpha: 0.85, per: 1 / 320000, soft: true, under: 0.15, k: 0.6 },
    ];
    const SPAN = 2.8;            // a leaf sprite is this many leaf-widths across
    const sprites = new Map();
    let falling = [], keys = [], seed = null;

    // Each species and colouring is painted in detail once (two copies, so blemishes differ), then stamped.
    function leafSprite(kind, variant, back, copy) {
      const key = `${kind}|${variant}|${back}|${copy}`;
      if (!sprites.has(key)) sprites.set(key, Botany.autumnLeaf(kind, variant, back));
      return sprites.get(key);
    }
    // An out-of-focus version, blurred once instead of every frame.
    const blurred = new Map();
    function blurSprite(kind, variant, back, copy) {
      const key = `${kind}|${variant}|${back}|${copy}`;
      if (blurred.has(key)) return blurred.get(key);
      const sharp = leafSprite(kind, variant, back, copy);
      const soft = makeSprite(sharp.width, (g, size) => {
        if ('filter' in g) { g.filter = `blur(${size * 0.025}px)`; g.drawImage(sharp, 0, 0); g.filter = 'none'; }
        else { g.globalAlpha = 0.9; g.drawImage(sharp, 0, 0); }
      });
      blurred.set(key, soft);
      return soft;
    }

    function leaf(layer, anywhere) {
      const L = LAYERS[layer], kind = pick(ODDS), size = between(L.size);
      return {
        layer, kind, size, variant: Math.floor(rand() * Botany.AUTUMN[kind].length), copy: rand() < 0.5 ? 0 : 1,
        x: rand() * w * 1.1 - w * 0.05,
        y: anywhere ? rand() * h : -size * 3 - rand() * h * 0.3,
        vy: between(L.speed),
        drift: 0.6 + rand() * 0.8,
        swayA: 10 + rand() * 25, swayF: 0.15 + rand() * 0.3, phase: rand() * TAU,
        rot: rand() * TAU, spin: (rand() - 0.5) * 1.6,
        flip: rand() * TAU, flipSpeed: 0.6 + rand() * 1.8,
      };
    }
    function stamp(c, l, alpha, y = l.y) {
      const face = Math.cos(l.flip);
      const sprite = LAYERS[l.layer].soft
        ? blurSprite(l.kind, l.variant, face < 0, l.copy)
        : leafSprite(l.kind, l.variant, face < 0, l.copy);
      const d = l.size * SPAN;
      c.save();
      c.translate(l.x, y);
      c.rotate(l.rot);
      c.scale(1, Math.max(0.14, Math.abs(face)));
      c.globalAlpha = alpha;
      c.drawImage(sprite, -d / 2, -d / 2, d, d);
      c.restore();
    }

    return {
      fps: 30,
      sharpSoft: true,
      parallax: true,
      colors() {},
      resize() {
        measureText();
        seed = seed || Botany.samara();
        falling = [];
        LAYERS.forEach((L, i) => {
          const n = Math.max(i === 2 ? 2 : 4, Math.round(w * h * L.per));
          for (let k = 0; k < n; k++) falling.push(leaf(i, true));
        });
        // A few maple keys, spinning like rotors as they fall.
        for (let k = 0, n = w < 700 ? 2 : 5; k < n; k++) {
          const s = leaf(1, true);
          Object.assign(s, { kind: 'samara', size: 9 + rand() * 4, vy: 26 + rand() * 18, spin: (rand() < 0.5 ? -1 : 1) * (7 + rand() * 4), flipSpeed: 0 });
          falling.push(s);
        }
        // Fallen leaves along the bottom, painted once onto the lower canvas with a soft shadow,
        // sparse under the text column.
        const g = sctx;
        g.clearRect(-BLEED, -BLEED, w + BLEED * 2, h + BLEED * 2);
        g.save();
        g.shadowColor = 'rgba(70,45,25,0.22)';
        g.shadowBlur = 4 * dpr;
        g.shadowOffsetY = 1.5 * dpr;
        const ground = () => h - Math.pow(rand(), 1.6) * 34 + 6;
        // Twigs and acorns first, half buried under the leaves that land on top.
        const twig = Botany.twig(), nut = Botany.acorn();
        for (let i = 0, n = w < 700 ? 1 : 3; i < n; i++) {
          const x = rand() < 0.5 ? rand() * Math.max(60, text.left - 40) : text.right + 40 + rand() * Math.max(60, w - text.right - 80);
          g.save(); g.translate(x, ground() - 4); g.rotate((rand() - 0.5) * 0.5);
          g.drawImage(twig, -64, -18, 128, 36);
          g.restore();
        }
        for (let i = 0, n = Math.round(w / 12); i < n; i++) {
          const x = rand() * w;
          const inColumn = x > text.left && x < text.right;
          if (inColumn && rand() < 0.8) continue;
          const l = leaf(1, true);
          l.x = x; l.y = ground(); l.size = 11 + rand() * 10;
          l.flip = rand() < 0.75 ? 0 : Math.PI;
          stamp(g, l, inColumn ? 0.5 : 0.9);
          if (rand() < 0.08 && !inColumn) {
            g.save(); g.translate(x + 8, l.y - 2); g.rotate(rand() * TAU); g.drawImage(nut, -9, -9, 18, 18); g.restore();
          }
          if (rand() < 0.05) {
            g.save(); g.translate(x - 6, l.y); g.rotate(rand() * TAU); g.drawImage(seed, -6, -11, 22, 22); g.restore();
          }
        }
        g.restore();
      },
      update(now, dt) {
        const s = dt / 1000;
        const wind = 12 + 10 * Math.sin(now * 0.00025) + 6 * Math.sin(now * 0.0011);
        for (const l of falling) {
          l.y += l.vy * s;
          l.x += (wind * l.drift + Math.sin(now * 0.001 * l.swayF * TAU + l.phase) * l.swayA) * s;
          l.rot += l.spin * s;
          l.flip += l.flipSpeed * s;
          if (l.x > w + l.size * 3) l.x = -l.size * 3;
          l.y = wrapY(l.y, h + l.size * 8);
        }
      },
      draw() {
        ctx.clearRect(0, 0, w, h);
        ctx.imageSmoothingQuality = 'high';
        for (const l of falling) {
          const L = LAYERS[l.layer], y = onScreen(l.y, L.k, l.size * 4, h);
          if (l.kind === 'samara') {
            // Spinning around its seed, which leads the way down.
            ctx.save();
            ctx.globalAlpha = 0.95 * quiet(l.x, y, 0.3, 100);
            ctx.translate(l.x, y);
            ctx.rotate(l.rot);
            ctx.drawImage(seed, -l.size * 0.55, -l.size * 1.4, l.size * 2.5, l.size * 2.5);
            ctx.restore();
            continue;
          }
          stamp(ctx, l, L.alpha * quiet(l.x, y, L.under, 100), y);
        }
      },
    };
  }

  /* ==========================================================
     Still layers: pictures painted once and handed to the browser as plain elements,
     so it can show (and animate) them without any redrawing.
     ========================================================== */
  function layerElement(id, count = 0) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < count; i++) {
        const child = document.createElement('div');
        child.className = `${id}-${i}`;
        el.appendChild(child);
      }
      softCanvas.parentNode.insertBefore(el, softCanvas);
    }
    el.hidden = false;
    return el;
  }
  // Show a canvas as an element's background.
  function showCanvas(el, c) {
    el.__art = c;
    if (!c.toBlob) return;
    c.toBlob((blob) => {
      if (!blob) return;
      if (el.dataset.url) URL.revokeObjectURL(el.dataset.url);
      el.dataset.url = URL.createObjectURL(blob);
      el.style.backgroundImage = `url(${el.dataset.url})`;
    });
  }
  function canvasAt(cw, ch, scale) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(cw * scale)); c.height = Math.max(1, Math.round(ch * scale));
    const g = c.getContext('2d');
    g.scale(scale, scale);
    return [c, g];
  }
  function grainTile() {
    const size = 192, c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d'), img = g.createImageData(size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + gauss() * 70;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /* ==========================================================
     Sunlight: soft shadows of leaves on a pale wall, swaying in a breeze.
     Three layers of foliage at different distances from the wall: the further away, the softer
     the shadow. Each layer is painted once; the swaying is a CSS animation, so it's free to run.
     ========================================================== */
  function Sunlight() {
    const SHAPES = leafShapes();
    const LEAVES = [SHAPES.willow.outline, SHAPES.willow.outline, SHAPES.birch.outline];
    // far to near: softer and fainter further from the wall, sharper and darker close to it
    const LAYERS = [
      { blur: 34, size: 1.35, count: 6, k: 0.05 },
      { blur: 20, size: 1.0, count: 7, k: 0.09 },
      { blur: 10, size: 0.8, count: 5, k: 0.15 },
    ];
    const SHADOW = 'rgb(70,72,78)';
    let host = null;

    // Fill a set of shapes as one soft shadow: drawn far off-canvas, only the blurred shadow lands.
    function softFill(g, scale, blur, paint) {
      const OFF = 30000;
      g.save();
      g.shadowColor = SHADOW;
      g.shadowBlur = blur * scale;
      g.shadowOffsetX = OFF * scale;
      g.translate(-OFF, 0);
      g.fillStyle = SHADOW;
      g.strokeStyle = SHADOW;
      paint(g);
      g.restore();
    }

    // One layer of branches reaching in from the top right, hung with long slender leaves.
    // The layer is taller than the screen by `extra`: more of the tree, revealed as you scroll down.
    function paintLayer(L, M, extra) {
      const S = 1 / 3;                                  // the shadows are soft, so a third of the resolution is plenty
      const [c, g] = canvasAt(w + M * 2, h + M * 2 + extra, S);
      g.translate(M, M);
      const tall = (h + extra) / h;
      softFill(g, S, L.blur, (pg) => {
        for (let b = 0, n = Math.round(L.count * Math.max(1, tall * 0.8)); b < n; b++) {
          const x0 = w * (0.62 + rand() * 0.48);
          const y0 = b < L.count ? -h * 0.2 + rand() * h * 0.55 : rand() * (h + extra);
          const angle = Math.PI - 0.45 - rand() * 0.45;  // down and to the left
          const length = Math.max(w, h) * (0.32 + rand() * 0.3) * L.size;
          const dx = Math.cos(angle), dy = Math.sin(angle), nx = -dy, ny = dx;
          const bend = (rand() - 0.5) * 0.4;
          const at = (t) => {
            const bow = Math.sin(t * Math.PI) * bend * length * 0.25;
            return [x0 + dx * length * t + nx * bow, y0 + dy * length * t + ny * bow];
          };
          pg.lineCap = 'round';
          pg.lineWidth = 2.5 * L.size;
          pg.beginPath(); pg.moveTo(x0, y0);
          for (let t = 0.05; t <= 1.001; t += 0.05) { const [x, y] = at(t); pg.lineTo(x, y); }
          pg.stroke();
          // Leaves come in loose clusters, at uneven spacing, sizes and angles, some drooping.
          for (let i = 0, n = 18 + Math.floor(rand() * 16); i < n; i++) {
            const t = 0.06 + rand() * 0.94;
            const [x, y] = at(t);
            const side = rand() < 0.5 ? 1 : -1;
            const len = (16 + Math.pow(rand(), 0.7) * 40) * L.size;
            const rot = angle + side * (0.25 + rand() * 0.8) + (rand() - 0.5) * 0.4;
            pg.save();
            pg.translate(x + Math.cos(rot) * len * 0.85, y + Math.sin(rot) * len * 0.85);
            pg.rotate(rot + Math.PI / 2);
            pg.scale(len, len);
            pg.fill(pick(LEAVES));
            pg.restore();
          }
        }
      });
      return c;
    }

    // Slide each layer up as the page scrolls; the nearer the leaves, the faster they go.
    function follow() {
      if (!host) return;
      LAYERS.forEach((L, i) => { const el = host.children[i]; if (el) el.style.translate = `0 ${-scroll * L.k}px`; });
    }

    return {
      fps: 0,
      colors() {},
      resize() {
        host = layerElement('sun-layers', LAYERS.length);
        // Each layer overhangs the screen so its slow sway never shows an edge,
        // and runs on below it far enough to cover the whole scroll.
        const M = Math.round(Math.max(w, h) * 0.12);
        host.__layers = [];
        LAYERS.forEach((L, i) => {
          const extra = Math.ceil(scrollRoom() * L.k);
          const el = host.children[i] || { style: {}, dataset: {} };
          el.style.left = `${-M}px`; el.style.top = `${-M}px`;
          el.style.width = `${w + M * 2}px`; el.style.height = `${h + M * 2 + extra}px`;
          const c = paintLayer(L, M, extra);
          showCanvas(el, c);
          host.__layers.push({ c, M, k: L.k });
        });
        follow();
        sctx.clearRect(-BLEED, -BLEED, w + BLEED * 2, h + BLEED * 2);
      },
      onScroll: follow,
      update() {},
      draw() { ctx.clearRect(0, 0, w, h); },
      leave() { if (host) host.hidden = true; },
    };
  }

  /* ==========================================================
     Winter: snow falling at night, as a camera would see it. Distant flakes are soft points;
     mid-distance ones are real six-armed crystals that turn and glint as they fall; the nearest
     drift past out of focus, as soft hexagons. A cold light high on the right catches the flakes
     that pass through it, and gusts of wind push the whole fall sideways now and then.
     ========================================================== */
  function Winter() {
    const LIGHT = { x: 0.84, y: -0.08, reach: 0.75 };   // where the light comes from, as fractions of the screen
    let base = null, flakes = [], dot = null, crystals = [], softCrystals = [], bokeh = null;

    // The night behind the snow, with the light's glow and a little grain. Painted once.
    function paintBase() {
      const [c, g] = canvasAt(w, h, dpr);
      const air = g.createLinearGradient(0, 0, 0, h);
      air.addColorStop(0, '#0f161f');
      air.addColorStop(0.6, '#16202b');
      air.addColorStop(1, '#1f2a36');
      g.fillStyle = air;
      g.fillRect(0, 0, w, h);
      const lx = w * LIGHT.x, ly = h * LIGHT.y, r = Math.max(w, h) * LIGHT.reach;
      const glow = g.createRadialGradient(lx, ly, 0, lx, ly, r);
      glow.addColorStop(0, 'rgba(190,210,235,0.16)');
      glow.addColorStop(0.4, 'rgba(170,195,225,0.06)');
      glow.addColorStop(1, 'rgba(170,195,225,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, w, h);
      // Snow-laden air low down, a little paler.
      const mist = g.createLinearGradient(0, h * 0.7, 0, h);
      mist.addColorStop(0, 'rgba(150,170,190,0)');
      mist.addColorStop(1, 'rgba(150,170,190,0.07)');
      g.fillStyle = mist;
      g.fillRect(0, h * 0.7, w, h * 0.3);
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'overlay';
      g.globalAlpha = 0.07;
      g.fillStyle = g.createPattern(grainTile(), 'repeat');
      g.fillRect(0, 0, c.width, c.height);
      g.restore();
      return c;
    }

    // A snow crystal: six identical arms, each with paired side branches at 60 degrees,
    // sometimes finer twigs on those, sometimes a little plate at the tip or a hexagonal centre.
    function crystalSprite(blur) {
      return makeSprite(128, (g, s) => {
        const R = s * 0.42;
        const arm = s * (0.022 + rand() * 0.014);
        const pairs = 2 + Math.floor(rand() * 4);
        const reach = 0.22 + rand() * 0.3;
        const twigs = rand() < 0.55;
        const tipPlate = rand() < 0.35;
        const centre = rand() < 0.6 ? R * (0.1 + rand() * 0.14) : 0;
        g.translate(s / 2, s / 2);
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.strokeStyle = 'rgba(238,246,255,0.95)';
        g.fillStyle = 'rgba(238,246,255,0.75)';
        g.shadowColor = 'rgba(170,205,255,0.8)';
        g.shadowBlur = blur ? s * 0.08 : s * 0.035;
        if (blur) g.filter = `blur(${s * 0.03}px)`;
        const hex = (r) => { g.beginPath(); for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); };
        for (let k = 0; k < 6; k++) {
          g.save();
          g.rotate((k / 6) * TAU);
          g.lineWidth = arm;
          g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -R); g.stroke();
          for (let j = 1; j <= pairs; j++) {
            const t = 0.3 + (0.62 * j) / (pairs + 1);
            const len = R * reach * (1.15 - t * 0.7);
            for (const side of [-1, 1]) {
              const ex = side * Math.sin(Math.PI / 3) * len, ey = -t * R - Math.cos(Math.PI / 3) * len;
              g.lineWidth = arm * 0.7;
              g.beginPath(); g.moveTo(0, -t * R); g.lineTo(ex, ey); g.stroke();
              if (twigs) {
                g.lineWidth = arm * 0.45;
                for (const u of [0.45, 0.75]) {
                  const bx = ex * u, by = -t * R + (ey + t * R) * u, tl = len * 0.28;
                  g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + side * Math.sin(Math.PI / 3) * tl * 0.2, by - tl); g.stroke();
                }
              }
            }
          }
          if (tipPlate) {
            g.save(); g.translate(0, -R); hex(R * 0.07); g.fill(); g.restore();
          }
          g.restore();
        }
        if (centre) { hex(centre); g.fill(); g.lineWidth = arm * 0.6; g.stroke(); }
      });
    }

    function makeSprites() {
      dot = makeSprite(32, (g, s) => {
        const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        r.addColorStop(0, 'rgba(240,246,255,1)');
        r.addColorStop(0.3, 'rgba(240,246,255,0.75)');
        r.addColorStop(1, 'rgba(240,246,255,0)');
        g.fillStyle = r; g.fillRect(0, 0, s, s);
      });
      crystals = Array.from({ length: 10 }, () => crystalSprite(false));
      softCrystals = Array.from({ length: 4 }, () => crystalSprite(true));
      // A flake right in front of the lens: a soft hexagon with a slightly brighter rim, like camera bokeh.
      bokeh = makeSprite(128, (g, s) => {
        const OFF = 4000, r = s * 0.34;
        g.save();
        g.shadowColor = 'rgba(225,238,255,0.55)';
        g.shadowBlur = s * 0.07;
        g.shadowOffsetX = OFF;
        g.translate(s / 2 - OFF, s / 2);
        g.beginPath();
        for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + 0.3; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        g.closePath(); g.fill();
        g.restore();
        const rim = g.createRadialGradient(s / 2, s / 2, r * 0.5, s / 2, s / 2, r);
        rim.addColorStop(0, 'rgba(255,255,255,0)');
        rim.addColorStop(1, 'rgba(255,255,255,0.18)');
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = rim; g.fillRect(0, 0, s, s);
      });
    }

    function makeFlakes() {
      const area = w * h, few = w < 700;
      const make = (n, o) => Array.from({ length: Math.round(n) }, () => ({
        x: rand() * w, y: rand() * h,
        size: between(o.size), vy: between(o.speed), alpha: between(o.alpha), drift: o.drift,
        sway: between(o.sway), swayF: 0.2 + rand() * 0.5, phase: rand() * TAU,
        rot: rand() * TAU, spin: (rand() - 0.5) * o.spin, tumble: rand() * TAU, tumbleF: 0.3 + rand() * 1.2,
        sprite: o.sprite(), kind: o.kind, k: o.k,
      }));
      flakes = [
        // far: soft points, slow
        ...make(area / (few ? 5000 : 3200), { size: [1.3, 2.6], speed: [14, 30], alpha: [0.25, 0.6], drift: 0.45, k: 0.08, sway: [4, 10], spin: 0, sprite: () => dot, kind: 'dot' }),
        // a little nearer: clumps of flakes stuck together, too small to show their arms
        ...make(area / (few ? 16000 : 11000), { size: [3, 5.5], speed: [24, 40], alpha: [0.45, 0.75], drift: 0.6, k: 0.16, sway: [6, 14], spin: 0, sprite: () => dot, kind: 'dot' }),
        // middle distance: crystals, turning and glinting
        ...make(area / (few ? 30000 : 20000), { size: [7, 12], speed: [32, 52], alpha: [0.7, 0.95], drift: 0.75, k: 0.3, sway: [8, 18], spin: 1.2, sprite: () => pick(crystals), kind: 'crystal' }),
        // close: larger crystals, just out of focus
        ...make(area / (few ? 120000 : 80000), { size: [16, 26], speed: [60, 90], alpha: [0.6, 0.85], drift: 1, k: 0.5, sway: [12, 24], spin: 0.8, sprite: () => pick(softCrystals), kind: 'crystal' }),
        // right in front of the lens
        ...make(few ? 3 : 6, { size: [44, 80], speed: [100, 150], alpha: [0.18, 0.32], drift: 1.3, k: 0.85, sway: [16, 30], spin: 0.4, sprite: () => bokeh, kind: 'bokeh' }),
      ];
    }

    // The wind: a slow drift that swells into gusts now and then.
    const windAt = (t) => 6 + 10 * Math.sin(t * 0.00011) + 14 * Math.max(0, Math.sin(t * 0.00023 + 1.7)) * Math.sin(t * 0.0009) ** 2;

    return {
      get fps() { return w < 700 ? 30 : 60; },
      sharpSoft: true,
      parallax: true,
      colors() {},
      resize() {
        measureText();
        base = layerElement('backdrop-base');
        showCanvas(base, paintBase());
        makeSprites();
        makeFlakes();
        ctx.clearRect(0, 0, w, h);
      },
      update(now, dt) {
        const s = dt / 1000, wind = windAt(now);
        for (const f of flakes) {
          f.y += f.vy * s;
          f.x += (wind * f.drift + Math.sin(now * 0.001 * f.swayF * TAU + f.phase) * f.sway) * s;
          f.rot += f.spin * s;
          f.tumble += f.tumbleF * s;
          f.y = wrapY(f.y, h + f.size * 4 + 80);
          if (f.x > w + f.size + 40) f.x = -f.size - 20;
        }
      },
      draw() {
        const g = sctx, k = softScale, lx = w * LIGHT.x, ly = h * LIGHT.y, reach = Math.max(w, h) * LIGHT.reach;
        g.setTransform(k, 0, 0, k, BLEED * k, BLEED * k);
        g.clearRect(-BLEED, -BLEED, w + BLEED * 2, h + BLEED * 2);
        for (const f of flakes) {
          const y = onScreen(f.y, f.k, f.size * 2 + 40, h);
          // Brighter where the light catches it; quieter behind the text.
          const lit = 1 + 0.7 * Math.max(0, 1 - Math.hypot(f.x - lx, y - ly) / reach);
          let a = f.alpha * lit * quiet(f.x, y, f.kind === 'bokeh' ? 0.2 : 0.4, 90);
          if (f.kind === 'crystal') a *= 0.72 + 0.28 * Math.abs(Math.sin(f.rot * 3 + f.tumble));   // facets glint as it turns
          g.globalAlpha = Math.min(1, a);
          if (f.kind === 'dot') {
            g.drawImage(f.sprite, f.x - f.size / 2, y - f.size / 2, f.size, f.size);
            continue;
          }
          // Turn it, and tilt it in depth (a squash along one axis) as it tumbles.
          const c = Math.cos(f.rot), sn = Math.sin(f.rot), tilt = 0.35 + 0.65 * Math.abs(Math.cos(f.tumble));
          const d = f.size;
          g.setTransform(c * k, sn * k, -sn * tilt * k, c * tilt * k, (f.x + BLEED) * k, (y + BLEED) * k);
          g.drawImage(f.sprite, -d / 2, -d / 2, d, d);
          g.setTransform(k, 0, 0, k, BLEED * k, BLEED * k);
        }
        g.globalAlpha = 1;
      },
      leave() { if (base) base.hidden = true; },
    };
  }

  /* ==========================================================
     Garden: a wildflower meadow along the bottom, tall in the margins, low under the text.
     Real species (oxeye daisy, cosmos, field poppy, cornflower, buttercup, red clover, Queen
     Anne's lace, dandelion clocks, lavender), each on a stem with its own kind of leaf, among
     grasses, some gone to seed. Flowers, leaves and seed heads are painted once in detail;
     stems and blades are drawn live so everything sways in the wind.
     ========================================================== */
  function Garden() {
    const GREENS = ['#6f8a52', '#56703f', '#82a062', '#4c6636', '#7a9660', '#5f7c48'];
    const BACK_GREENS = GREENS.map((g) => mix(g, '#eef0e4', 0.55));
    // species: how tall, how big its flower, what its leaves look like, its bud colour
    const SPECIES = {
      daisy: { height: [0.55, 1], head: [11, 15], leaf: 'toothed', leaves: [2, 4], bud: '#f4f2ea' },
      cosmos: { height: [0.7, 1], head: [12, 17], leaf: 'feathery', leaves: [2, 3], bud: '#e08ab0' },
      poppy: { height: [0.5, 0.9], head: [13, 18], leaf: 'feathery', leaves: [1, 3], bud: '#c83a28' },
      cornflower: { height: [0.5, 0.85], head: [9, 12], leaf: 'lance', leaves: [2, 4], bud: '#4a62c8' },
      buttercup: { height: [0.35, 0.7], head: [8, 11], leaf: 'toothed', leaves: [1, 3], bud: '#f0c42a' },
      clover: { height: [0.15, 0.3], head: [7, 9], leaf: 'trefoil', leaves: [1, 2], bud: '#c86a9a' },
      lace: { height: [0.75, 1], head: [14, 20], leaf: 'feathery', leaves: [2, 4], bud: '#f0eee4' },
      clock: { height: [0.35, 0.6], head: [12, 16], leaf: null, leaves: [0, 0], bud: null },
      lavender: { height: [0.45, 0.75], head: [0, 0], leaf: 'lance', leaves: [2, 4], bud: null },
    };
    const ODDS = ['daisy', 'daisy', 'daisy', 'cosmos', 'cosmos', 'poppy', 'poppy', 'cornflower', 'buttercup', 'clover', 'lace', 'clock', 'lavender'];
    let plants = [], seeds = [], butterfly = null, nextButterfly = 12000, art = null;

    function paintArt() {
      if (art) return;
      art = { heads: {}, leaves: {}, buds: {}, grass: [Botany.grassHead(true), Botany.grassHead(false)], wing: Botany.butterflyWing() };
      for (const kind of Object.keys(SPECIES)) {
        if (SPECIES[kind].head[1]) art.heads[kind] = [Botany.flower(kind), Botany.flower(kind)];
        if (SPECIES[kind].bud) art.buds[kind] = Botany.bud(SPECIES[kind].bud);
      }
      for (const leaf of ['lance', 'toothed', 'feathery', 'trefoil', 'dandelion']) art.leaves[leaf] = Botany.foliage(leaf);
    }

    // How tall plants may grow at x: low under the text column, tall in the margins.
    function maxHeight(x) {
      const outside = x < text.left ? text.left - x : x > text.right ? x - text.right : -Math.min(x - text.left, text.right - x);
      return h * (0.07 + 0.43 * smooth((outside + 40) / 240));
    }
    const quad = (p0, p1, p2, t) => {
      const u = 1 - t;
      return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
    };
    const windAt = (now, x) => Math.sin(now * 0.0007 + x * 0.0035) * 0.6 + Math.sin(now * 0.0019 + x * 0.011) * 0.25;
    // The curve of a stem: rooted at the bottom, bending with the wind toward its tip.
    function bend(p, now) {
      const wind = windAt(now, p.x) * p.flex;
      const base = [p.x, h + 2];
      const tip = [p.x + (p.lean + wind * 0.35) * p.height, h - p.height * (1 - 0.04 * Math.abs(wind))];
      const ctrl = [p.x + (p.lean * 0.4 + wind * 0.1) * p.height, h - p.height * 0.55];
      return { base, ctrl, tip, wind };
    }

    function blade(x, back) {
      return {
        type: 'blade', x, back,
        height: maxHeight(x) * (back ? 0.4 + rand() * 0.5 : 0.12 + rand() * 0.42),
        width: back ? 2 + rand() * 2 : 2 + rand() * 3,
        lean: (rand() - 0.5) * 0.55, flex: 0.8 + rand() * 0.8,
        color: back ? pick(BACK_GREENS) : pick(GREENS),
      };
    }
    function grass(x) {
      return { type: 'grass', x, height: maxHeight(x) * (0.55 + rand() * 0.45), lean: (rand() - 0.5) * 0.3, flex: 1 + rand() * 0.6, head: Math.floor(rand() * 2), size: 26 + rand() * 18 };
    }
    function flower(x) {
      const kind = pick(ODDS), sp = SPECIES[kind];
      const leaves = [];
      for (let k = 0, n = Math.round(between(sp.leaves)); k < n; k++) {
        leaves.push({ t: 0.15 + rand() * 0.5, side: k % 2 ? 1 : -1, len: 12 + rand() * 12, tilt: 0.5 + rand() * 0.5 });
      }
      return {
        type: 'flower', kind, x,
        height: maxHeight(x) * between(sp.height), width: 1.1 + rand() * 0.6,
        lean: (rand() - 0.5) * 0.25, flex: 0.6 + rand() * 0.6, color: pick(GREENS), leaves,
        size: between(sp.head), copy: rand() < 0.5 ? 0 : 1, spin: rand() * TAU, face: 0.55 + rand() * 0.4,
        bud: sp.bud && rand() < 0.3 ? { t: 0.55 + rand() * 0.25, side: rand() < 0.5 ? -1 : 1 } : null,
      };
    }

    // A tapered blade, a shade lighter along its middle when it's wide enough to show it.
    function drawBlade(c, p, now) {
      const { base, ctrl, tip } = bend(p, now);
      const hw = p.width / 2;
      c.globalAlpha = 0.92 * quiet(tip[0], tip[1], 0.55, 60);
      c.fillStyle = p.color;
      c.beginPath();
      c.moveTo(base[0] - hw, base[1]);
      c.quadraticCurveTo(ctrl[0] - hw * 0.5, ctrl[1], tip[0], tip[1]);
      c.quadraticCurveTo(ctrl[0] + hw * 0.5, ctrl[1], base[0] + hw, base[1]);
      c.closePath();
      c.fill();
      if (p.width > 3 && !p.back) {
        c.strokeStyle = 'rgba(230,240,200,0.28)';
        c.lineWidth = 0.6;
        c.beginPath(); c.moveTo(base[0], base[1]); c.quadraticCurveTo(ctrl[0], ctrl[1], tip[0], tip[1]); c.stroke();
      }
    }
    // Stamp a sprite at a point along a stem, turned to follow it.
    function along(c, sprite, x, y, angle, length, anchorY = 0.95) {
      c.save();
      c.translate(x, y);
      c.rotate(angle);
      c.drawImage(sprite, -length / 2, -length * anchorY, length, length);
      c.restore();
    }
    function drawStemmed(c, p, now) {
      const { base, ctrl, tip, wind } = bend(p, now);
      c.globalAlpha = 0.95 * quiet(tip[0], tip[1], 0.55, 60);
      c.strokeStyle = p.color || '#7a8a4a';
      c.lineWidth = p.width || 1;
      c.lineCap = 'round';
      c.beginPath(); c.moveTo(base[0], base[1]); c.quadraticCurveTo(ctrl[0], ctrl[1], tip[0], tip[1]); c.stroke();
      const tangent = (t) => {
        const [x1, y1] = quad(base, ctrl, tip, t), [x2, y2] = quad(base, ctrl, tip, Math.min(1, t + 0.02));
        return Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2;     // 0 = pointing up the stem
      };
      if (p.type === 'grass') {
        along(c, art.grass[p.head], tip[0], tip[1] + p.size * 0.1, tangent(0.98) + 0.25, p.size);
        return;
      }
      const sp = SPECIES[p.kind];
      for (const l of p.leaves) {
        const [x, y] = quad(base, ctrl, tip, l.t);
        along(c, art.leaves[sp.leaf], x, y, tangent(l.t) + l.side * l.tilt, l.len);
      }
      if (p.bud) {
        const [x, y] = quad(base, ctrl, tip, p.bud.t);
        const a = tangent(p.bud.t) + p.bud.side * 0.6, len = p.height * 0.12;
        const bx = x + Math.sin(a) * len, by = y - Math.cos(a) * len;
        c.lineWidth = (p.width || 1) * 0.7;
        c.beginPath(); c.moveTo(x, y); c.lineTo(bx, by); c.stroke();
        along(c, art.buds[p.kind], bx, by, a, 14, 0.62);
      }
      if (p.kind === 'lavender') {
        // A spike of tiny buds, each a grey-violet calyx with a bright tip.
        for (let k = 0; k < 11; k++) {
          const t = 0.7 + k * 0.028;
          const [x, y] = quad(base, ctrl, tip, Math.min(1, t));
          const a = tangent(t);
          for (const side of [-1, 1]) {
            c.save(); c.translate(x, y); c.rotate(a + side * 0.6);
            c.fillStyle = '#8a7fa8'; c.beginPath(); c.ellipse(0, -2.2, 1.4, 2.6, 0, 0, TAU); c.fill();
            c.fillStyle = '#a58ee0'; c.beginPath(); c.arc(0, -4.4, 1.1, 0, TAU); c.fill();
            c.restore();
          }
        }
        return;
      }
      const head = art.heads[p.kind][p.copy], d = p.size * 2;
      c.save();
      c.translate(tip[0], tip[1]);
      c.rotate(p.spin + wind * 0.3);
      c.scale(1, p.kind === 'clock' || p.kind === 'clover' ? 1 : p.face);   // most flowers face us at an angle
      c.drawImage(head, -d / 2, -d / 2, d, d);
      c.restore();
    }

    // At the top of the page the meadow sits partly below the fold; scrolling down brings you
    // closer to the ground, and it rises into view. The back row rises less than the front.
    function follow() {
      const room = scrollRoom(), p = room ? Math.min(1, scroll / room) : 1;
      canvas.style.translate = `0 ${(1 - p) * h * 0.12}px`;
      softCanvas.style.translate = `0 ${(1 - p) * h * 0.06}px`;
    }

    return {
      fps: 20,
      sharpSoft: true,
      onScroll: follow,
      leave() { canvas.style.translate = ''; softCanvas.style.translate = ''; },
      colors() {},
      resize() {
        measureText();
        paintArt();
        plants = [];
        for (let i = 0, n = Math.round(w / 9); i < n; i++) plants.push(blade(rand() * w, true));
        for (let i = 0, n = Math.round(w / 6); i < n; i++) { const b = blade(rand() * w, false); b.height *= 0.55; b.back = true; plants.push(b); }
        for (let i = 0, n = Math.round(w / 30); i < n; i++) plants.push(grass(rand() * w));
        for (let i = 0, n = Math.round(w / 17); i < n; i++) plants.push(flower(rand() * w));
        for (let i = 0, n = Math.round(w / 5.5); i < n; i++) plants.push(blade(rand() * w, false));
        // Back row first, then taller plants, then the short grass in front.
        plants.sort((a, b) => (b.back ? 1 : 0) - (a.back ? 1 : 0) || b.height - a.height);

        // The back row and the low rosettes stand still: paint them once onto the lower canvas.
        follow();
        sctx.clearRect(-BLEED, -BLEED, w + BLEED * 2, h + BLEED * 2);
        for (const p of plants) if (p.back) drawBlade(sctx, p, 0);
        for (let i = 0, n = Math.round(w / 70); i < n; i++) {
          // Dandelion rosettes: a ring of toothed leaves flat on the ground, mostly in the margins.
          const x = rand() * w;
          if (x > text.left && x < text.right && rand() < 0.7) continue;
          for (let k = 0; k < 6; k++) {
            const a = -Math.PI / 2 + (k / 5 - 0.5) * 2.4;
            sctx.globalAlpha = 0.85;
            along(sctx, art.leaves.dandelion, x, h + 4, a + Math.PI / 2, 26 + rand() * 12);
          }
        }
        sctx.globalAlpha = 1;
        seeds = Array.from({ length: w < 700 ? 4 : 8 }, () => ({
          x: rand() * w, y: h * (0.3 + rand() * 0.7), vx: 10 + rand() * 12, vy: -(4 + rand() * 6), phase: rand() * TAU, size: 9 + rand() * 4,
        }));
      },
      update(now, dt) {
        const s = dt / 1000;
        for (const p of seeds) {
          p.x += p.vx * s + Math.sin(now * 0.0011 + p.phase) * 0.25;
          p.y += p.vy * s + Math.cos(now * 0.0013 + p.phase) * 0.2;
          if (p.x > w + 20 || p.y < -20) { p.x = -10 - rand() * w * 0.3; p.y = h * (0.5 + rand() * 0.5); }
        }
        // A butterfly visits now and then, wandering through one of the margins.
        if (!butterfly && now > nextButterfly) {
          const left = rand() < 0.5;
          const margin = left ? [0, Math.max(40, text.left)] : [Math.min(w - 40, text.right), w];
          butterfly = { margin, x: between(margin), y: h * (0.55 + rand() * 0.3), start: now, life: 9000 + rand() * 6000, seed: rand() * 100 };
          nextButterfly = now + 25000 + rand() * 30000;
        }
        if (butterfly) {
          const t = (now - butterfly.start) / 1000, b = butterfly;
          b.x += (Math.sin(t * 0.9 + b.seed) * 40 + Math.sin(t * 2.3 + b.seed * 2) * 25) * s;
          b.y += (Math.cos(t * 0.7 + b.seed) * 30 - 6) * s;
          b.x = Math.max(b.margin[0] + 10, Math.min(b.margin[1] - 10, b.x));
          if (now - b.start > b.life) butterfly = null;
        }
      },
      draw(now) {
        ctx.clearRect(0, 0, w, h);
        ctx.imageSmoothingQuality = 'high';
        for (const p of plants) {
          if (p.back) continue;                     // painted once, on the lower canvas
          if (p.type === 'blade') drawBlade(ctx, p, now);
          else drawStemmed(ctx, p, now);
        }
        // Dandelion seeds drifting up and away: a seed on a fine stalk under its parachute.
        ctx.strokeStyle = 'rgba(120,110,90,0.65)';
        ctx.lineWidth = 0.6;
        const clock = art.heads.clock[0];
        for (const p of seeds) {
          ctx.globalAlpha = 0.8 * quiet(p.x, p.y, 0.25, 80);
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y + p.size * 0.9); ctx.stroke();
          ctx.drawImage(clock, p.x - p.size * 0.35, p.y - p.size * 0.35, p.size * 0.7, p.size * 0.7);
        }
        if (butterfly) {
          const b = butterfly, t = (now - b.start) / 1000;
          const fade = Math.max(0, Math.min(1, t, b.life / 1000 - t));
          const flap = 0.2 + 0.8 * Math.abs(Math.sin(t * 9));
          ctx.globalAlpha = 0.95 * fade;
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.rotate(Math.sin(t * 1.3) * 0.25);
          for (const side of [-1, 1]) {
            ctx.save(); ctx.scale(side * flap, 1);
            ctx.drawImage(art.wing, 0, -12, 24, 24);
            ctx.restore();
          }
          ctx.fillStyle = '#3e3a32';
          ctx.beginPath(); ctx.ellipse(0, 0, 1, 6, 0, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#3e3a32'; ctx.lineWidth = 0.5;
          ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(-3, -10); ctx.moveTo(0, -5); ctx.lineTo(3, -10); ctx.stroke();
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      },
    };
  }

  /* ==========================================================
     Switching, sizing and the frame loop
     ========================================================== */
  const SCENES = {
    life: Life, stars: Stars, autumn: Autumn, garden: Garden,
    sunlight: Sunlight,
    winter: Winter,
  };
  let scene = null, sceneName = '', dirty = true, lastFrame = 0, softScale = 1;

  function size() {
    const nw = canvas.clientWidth, nh = canvas.clientHeight;
    if (!nw || !nh) return false;
    w = nw; h = nh;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }
  // The soft canvas renders at 1x when it's blurred anyway, or at full resolution when a scene
  // uses it as a sharp layer that rarely changes.
  function sizeSoft(scale) {
    softScale = scale;
    softCanvas.width = Math.round((w + BLEED * 2) * scale);
    softCanvas.height = Math.round((h + BLEED * 2) * scale);
    sctx.setTransform(scale, 0, 0, scale, BLEED * scale, BLEED * scale);
  }

  function use(name) {
    if (!SCENES[name]) name = 'life';
    if (scene && scene.leave) scene.leave();
    sceneName = name;
    root.dataset.bg = name;
    scroll = window.scrollY || 0;
    scene = SCENES[name]();
    sizeSoft(scene.sharpSoft ? dpr : 1);
    ctx.clearRect(0, 0, w, h);
    softCanvas.style.filter = scene.softBlur ? `blur(${scene.softBlur}px)` : 'none';
    measureText();
    scene.resize();
    scene.colors();
    dirty = true;
    for (const input of document.querySelectorAll('input[name="bg"]')) input.checked = input.value === name;
  }

  function loop(now) {
    const dt = Math.min(100, now - lastFrame);
    // fps 0 means a still scene: drawn once, and again only after a resize.
    if (dirty || (scene.fps && now - lastFrame >= 1000 / scene.fps)) {
      if (running) clock += dt;
      measureText();
      if (running) scene.update(clock, dt);
      scene.draw(clock);
      lastFrame = now;
      dirty = false;
    }
    requestAnimationFrame(loop);
  }

  // Follow the page: scenes drawn on canvas redraw with the new offset; scenes made of layers move them.
  window.addEventListener('scroll', () => {
    scroll = window.scrollY;
    if (scene.onScroll) scene.onScroll();
    if (scene.parallax) dirty = true;
  }, { passive: true });
  canvas.addEventListener('click', (e) => { if (scene.click) { scene.click(e.clientX, e.clientY); dirty = true; } });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { scene.colors(); dirty = true; });

  for (const input of document.querySelectorAll('input[name="bg"]')) {
    input.addEventListener('change', () => use(input.value));
  }


  function syncPause() {
    pauseButton.setAttribute('aria-label', running ? 'Pause the background animation' : 'Play the background animation');
    pauseButton.title = running ? 'Pause animation' : 'Play animation';
    const icon = pauseButton.querySelector('use');
    if (icon) icon.setAttribute('href', running ? '#icon-pause' : '#icon-play');
  }
  if (pauseButton) {
    pauseButton.addEventListener('click', () => { running = !running; syncPause(); });
    syncPause();
  }
  // CSS-driven motion (Sunlight) pauses along with everything else.
  const syncPausedClass = () => root.classList.toggle('paused', !running);
  syncPausedClass();
  if (pauseButton) {
    pauseButton.addEventListener('click', syncPausedClass);
  }

  // 'season' picks the scene for the time of year (season.js has already worked out which).
  const BY_SEASON = { winter: 'winter', spring: 'garden', summer: 'sunlight', autumn: 'autumn' };
  function chosen() {
    const asked = new URLSearchParams(location.search).get('bg');
    if (SCENES[asked]) return asked;
    const configured = (window.SITE && window.SITE.background) || 'season';
    return configured === 'season' ? BY_SEASON[root.dataset.season] || 'life' : configured;
  }

  // The picker, for trying backgrounds out: only shown with ?tweaks in the address.
  function setUpPicker() {
    const box = document.querySelector('.tweaks');
    if (!box || !new URLSearchParams(location.search).has('tweaks')) return;
    root.classList.add('show-tweaks');
    const toggle = document.getElementById('tweaks-toggle'), panel = document.getElementById('tweaks-panel');
    const set = (open) => { panel.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); toggle.textContent = open ? 'Hide' : 'Backgrounds'; };
    toggle.addEventListener('click', () => set(panel.hidden));
    set(window.innerWidth >= 900);
  }

  function start() {
    size();
    setUpPicker();
    use(chosen());
    // Rebuild only for real size changes, not a phone's toolbar sliding in and out while scrolling.
    let pending, lastW = w, lastH = h;
    new ResizeObserver(() => {
      clearTimeout(pending);
      pending = setTimeout(() => {
        const nw = canvas.clientWidth, nh = canvas.clientHeight;
        if (nw === lastW && Math.abs(nh - lastH) < lastH * 0.15) return;
        lastW = nw; lastH = nh;
        if (size()) { sizeSoft(scene.sharpSoft ? dpr : 1); scene.resize(); dirty = true; }
      }, 150);
    }).observe(canvas);
    lastFrame = performance.now();
    requestAnimationFrame(loop);
  }
  (document.fonts ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]) : Promise.resolve()).then(start);
})();
