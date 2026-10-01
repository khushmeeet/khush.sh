// Conway's Game of Life behind the page: busier around the text, sparse beneath it.
// Colors come from style.css (--cell and --dot-alpha), so they follow the season.

(() => {
  const canvas = document.getElementById('life');
  const panel = document.querySelector('.panel');
  const pauseButton = document.getElementById('pause');
  if (!canvas || !panel) return;

  /* ---------- tunables ---------- */
  const TICK_MS = 100;                                  // one generation every 100 ms
  const BIRTH = 1 << 3, SURVIVE = (1 << 2) | (1 << 3);  // B3/S23
  const START_DENSITY = 0.35;
  const TARGET = { around: 0.11, under: 0.02 };         // share of cells alive in each zone
  const PATCH_AROUND = { w: 14, h: 10 };                // soup dropped in when a zone thins out
  const PATCH_UNDER = { w: 10, h: 8 };
  const PATCH_DENSITY = 0.4;
  const CULL = 0.03, CULL_EDGE = 48;                    // chance per step a cell under the text dies, easing in over 48px
  const QUIET = 0.5, QUIET_EDGE = 56;                   // cells under the text drawn at half strength, easing over 56px
  const FADE = { strength: 0.7, ghost: 0.45, decay: 8 }; // dying cells leave a ghost that fades over ~3 s

  const ctx = canvas.getContext('2d');
  const dot = document.createElement('canvas');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const darkMode = window.matchMedia('(prefers-color-scheme: dark)');

  let running = !reduceMotion;
  let w = 0, h = 0, dpr = 1, cell = 10, cols = 0, rows = 0;
  let grid = null, next = null, ghost = null;
  let color = '#6f8436', strength = 0.46;
  let gen = 0, lastTick = 0;
  let text = { left: 0, right: 0, top: 0, bottom: 0 };

  /* ---------- helpers ---------- */
  function mulberry32(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(Date.now() & 0xffffffff);
  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const measureText = () => { text = panel.getBoundingClientRect(); };
  const inText = (x, y) => x > text.left && x < text.right && y > text.top && y < text.bottom;

  function readColors() {
    const css = getComputedStyle(document.documentElement);
    color = css.getPropertyValue('--cell').trim() || color;
    strength = parseFloat(css.getPropertyValue('--dot-alpha')) || strength;
    drawDot();
    draw();
  }

  // One cell, drawn once and stamped everywhere.
  function drawDot() {
    const px = Math.max(2, Math.round(cell * dpr));
    dot.width = dot.height = px;
    const c = dot.getContext('2d');
    c.clearRect(0, 0, px, px);
    c.fillStyle = color;
    c.beginPath();
    c.arc(px / 2, px / 2, px * 0.35, 0, Math.PI * 2);
    c.fill();
  }

  /* ---------- the board ---------- */
  function resize() {
    const nw = canvas.clientWidth, nh = canvas.clientHeight;
    if (!nw || !nh) return;
    w = nw; h = nh;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const size = w < 700 ? 8 : 10;
    const c = Math.ceil(w / size), r = Math.ceil(h / size);
    const first = !grid;
    if (first || c !== cols || r !== rows || size !== cell) {
      // Keep what's alive when the viewport changes, e.g. a phone toolbar hiding.
      const old = grid, oldCols = cols, oldRows = rows;
      cell = size; cols = c; rows = r;
      grid = new Uint8Array(c * r);
      next = new Uint8Array(c * r);
      ghost = new Uint8Array(c * r);
      if (old) {
        for (let y = 0; y < Math.min(r, oldRows); y++)
          for (let x = 0; x < Math.min(c, oldCols); x++) grid[y * c + x] = old[y * oldCols + x];
      }
    }
    drawDot();
    if (first) seed(80);
    draw();
  }

  function soup(density, x0, y0, x1, y1) {
    for (let y = Math.max(0, y0); y < Math.min(rows, y1); y++)
      for (let x = Math.max(0, x0); x < Math.min(cols, x1); x++)
        if (rand() < density) grid[y * cols + x] = 1;
  }

  function seed(warmup) {
    grid.fill(0);
    ghost.fill(0);
    soup(START_DENSITY, 0, 0, cols, rows);
    measureText();
    for (let i = 0; i < warmup; i++) { step(); thinUnderText(); }
    ghost.fill(0);
    gen = 0;
  }

  // One generation of Life on a board that wraps at the edges.
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

  // The silhouette: now and then remove a cell under the text, more often the deeper in it is.
  function thinUnderText() {
    const x0 = Math.max(0, Math.floor(text.left / cell)), x1 = Math.min(cols, Math.ceil(text.right / cell));
    const y0 = Math.max(0, Math.floor(text.top / cell)), y1 = Math.min(rows, Math.ceil(text.bottom / cell));
    const half = cell / 2;
    for (let y = y0; y < y1; y++) {
      const cy = y * cell + half;
      for (let x = x0; x < x1; x++) {
        const i = y * cols + x;
        if (!grid[i]) continue;
        const cx = x * cell + half;
        const depth = Math.min(cx - text.left, text.right - cx, cy - text.top, text.bottom - cy);
        if (rand() < CULL * smooth(depth / CULL_EDGE)) { grid[i] = 0; ghost[i] = 200; }
      }
    }
  }

  function dropPatch(patch, x0, y0, x1, y1) {
    if (x1 - x0 < patch.w || y1 - y0 < patch.h) return;
    const x = x0 + Math.floor(rand() * (x1 - x0 - patch.w + 1));
    const y = y0 + Math.floor(rand() * (y1 - y0 - patch.h + 1));
    soup(PATCH_DENSITY, x, y, x + patch.w, y + patch.h);
  }

  // Keep each zone near its target by seeding a small patch when it thins out.
  function keepDensity() {
    if (gen % 8) return;
    const half = cell / 2;
    let underPop = 0, underArea = 0, aroundPop = 0, aroundArea = 0;
    for (let y = 0, i = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++, i++) {
        if (inText(x * cell + half, y * cell + half)) { underArea++; underPop += grid[i]; }
        else { aroundArea++; aroundPop += grid[i]; }
      }
    }

    if (aroundArea && aroundPop < aroundArea * TARGET.around) {
      for (let tries = 0; tries < 16; tries++) {
        const x = Math.floor(rand() * Math.max(1, cols - PATCH_AROUND.w));
        const y = Math.floor(rand() * Math.max(1, rows - PATCH_AROUND.h));
        const left = x * cell, top = y * cell;
        const right = left + PATCH_AROUND.w * cell, bottom = top + PATCH_AROUND.h * cell;
        const nearText = right > text.left - CULL_EDGE && left < text.right + CULL_EDGE
                      && bottom > text.top - CULL_EDGE && top < text.bottom + CULL_EDGE;
        if (!nearText) { soup(PATCH_DENSITY, x, y, x + PATCH_AROUND.w, y + PATCH_AROUND.h); break; }
      }
    }

    if (underArea && underPop < underArea * TARGET.under) {
      dropPatch(
        PATCH_UNDER,
        Math.ceil((text.left + CULL_EDGE) / cell),
        Math.max(0, Math.ceil((text.top + CULL_EDGE) / cell)),
        Math.floor((text.right - CULL_EDGE) / cell),
        Math.min(rows, Math.floor((text.bottom - CULL_EDGE) / cell)),
      );
    }
  }

  /* ---------- drawing ---------- */
  // Full strength out in the open, quieter under the text, with a soft edge between.
  function quietness(cx, cy) {
    const dx = Math.max(text.left - cx, 0, cx - text.right);
    const dy = Math.max(text.top - cy, 0, cy - text.bottom);
    const d = dx > 0 || dy > 0 ? Math.hypot(dx, dy) : 0;
    return d >= QUIET_EDGE ? 1 : QUIET + (1 - QUIET) * smooth(d / QUIET_EDGE);
  }

  function draw() {
    if (!grid) return;
    measureText();
    ctx.clearRect(0, 0, w, h);
    const base = strength * FADE.strength;
    const half = cell / 2;
    let current = -1;
    for (let y = 0, i = 0; y < rows; y++) {
      const py = y * cell;
      for (let x = 0; x < cols; x++, i++) {
        let a;
        if (grid[i]) a = base;
        else if (ghost[i]) a = (ghost[i] / 255) * FADE.ghost * base;
        else continue;
        a = Math.round(a * quietness(x * cell + half, py + half) * 50) / 50;
        if (a <= 0) continue;
        if (a !== current) { ctx.globalAlpha = a; current = a; }
        ctx.drawImage(dot, x * cell, py, cell, cell);
      }
    }
    ctx.globalAlpha = 1;
  }

  function loop(now) {
    if (running && now - lastTick >= TICK_MS) {
      lastTick = now;
      measureText();
      step();
      thinUnderText();
      keepDensity();
      draw();
    }
    requestAnimationFrame(loop);
  }

  /* ---------- wiring ---------- */
  // The quiet zone follows the text as you scroll.
  let scrollQueued = false;
  window.addEventListener('scroll', () => {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => { scrollQueued = false; draw(); });
  }, { passive: true });

  // Tapping empty space seeds a little life.
  canvas.addEventListener('click', (e) => {
    const cx = Math.floor(e.clientX / cell), cy = Math.floor(e.clientY / cell);
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        if (dx * dx + dy * dy > 16 || rand() > 0.55) continue;
        const x = (((cx + dx) % cols) + cols) % cols, y = (((cy + dy) % rows) + rows) % rows;
        grid[y * cols + x] = 1;
      }
    }
    draw();
  });

  function syncPause() {
    pauseButton.setAttribute('aria-label', running ? 'Pause the background animation' : 'Play the background animation');
    pauseButton.title = running ? 'Pause animation' : 'Play animation';
    // Swap the icon if the button has one; never let a markup mismatch stop the animation.
    const icon = pauseButton.querySelector('use');
    if (icon) icon.setAttribute('href', running ? '#icon-pause' : '#icon-play');
  }
  if (pauseButton) {
    pauseButton.addEventListener('click', () => { running = !running; syncPause(); });
    syncPause();
  }

  darkMode.addEventListener('change', readColors);

  function start() {
    resize();
    readColors();
    new ResizeObserver(() => resize()).observe(canvas);
    requestAnimationFrame(loop);
  }
  // Wait for fonts so the text column has its final size before the silhouette forms.
  (document.fonts ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]) : Promise.resolve()).then(start);
})();
