// The stars background, kept apart from backgrounds.js because it's the only one that needs the star
// catalog in sky.js (165 KB). backgrounds.js loads sky.js and this file the first time stars is picked,
// then calls Stars(kit): `kit` holds what it shares with the other backgrounds (the canvas, the
// window's size, the scroll position, where the text is, and the drawing helpers).

(() => {
  window.laterScenes = window.laterScenes || {};
  window.laterScenes.stars = Stars;

  /* ==========================================================
     Stars: the real sky over the Bay Area right now, now and then a meteor or a satellite
     ========================================================== */
  function Stars(kit) {
    const { ctx, TAU, quiet, makeSprite, rgba, scrollRoom } = kit;
    // Its own seeded random numbers, so the parts drawn from chance (the faint dust, the grain of
    // the Milky Way, the twinkling) come out the same on every visit.
    let seed = 1;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;                    // mulberry32
      let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;
    const pick = (list) => list[Math.floor(rand() * list.length)];
    const RAD = Math.PI / 180;

    // Star colour follows temperature, by B-V colour index: blue-white O and B stars through white,
    // yellow, orange, to red M stars.
    const TINTS = ['#a8bcff', '#cdd9ff', '#f6f6ff', '#fff1dc', '#ffd2a1', '#ffb27a'];
    const bvTint = (bv) => (bv < -0.1 ? 0 : bv < 0.15 ? 1 : bv < 0.45 ? 2 : bv < 0.75 ? 3 : bv < 1.2 ? 4 : 5);
    // A gradient's colour stops, as [offset, alpha] pairs, all in one colour.
    const fade = (gradient, color, stops) => {
      for (const [offset, a] of stops) gradient.addColorStop(offset, rgba(color, a));
      return gradient;
    };
    // Each star's light: a tight bright core with a soft falloff, like a point blurred by a lens.
    const glows = TINTS.map((color) => makeSprite(64, (g, size) => {
      const c = size / 2;
      g.fillStyle = fade(g.createRadialGradient(c, c, 0, c, c, c), color,
        [[0, 1], [0.08, 0.95], [0.2, 0.42], [0.45, 0.1], [1, 0]]);
      g.fillRect(0, 0, size, size);
    }));
    // Diffraction spikes: the four-pointed cross a telescope puts on a bright star.
    const spikes = TINTS.map((color) => makeSprite(96, (g, size) => {
      const c = size / 2;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        g.fillStyle = fade(g.createLinearGradient(c - dx * c, c - dy * c, c + dx * c, c + dy * c), color,
          [[0, 0], [0.5, 0.85], [1, 0]]);
        if (dx) g.fillRect(0, c - 0.6, size, 1.2); else g.fillRect(c - 0.6, 0, 1.2, size);
      }
    }));
    // A soft round puff, for the Milky Way's glow and for nebulae.
    const puff = (g, x, y, r, color, a) => {
      g.fillStyle = fade(g.createRadialGradient(x, y, 0, x, y, r), color, [[0, a], [1, 0]]);
      g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    // Points of light scattered in a sprite: the stars of a cluster, the grain of a galaxy.
    // Thousands go into each sprite, so each colour's style is made once and only set when it changes.
    // (Only grain() sets a plain colour in a sprite, so a style it set last is still the one in place.)
    const solid = new Map(), lastStyle = new WeakMap();
    const grain = (g, x, y, color, a, s) => {
      let style = solid.get(color);
      if (!style) solid.set(color, (style = rgba(color, 1)));
      if (lastStyle.get(g) !== style || typeof g.fillStyle !== 'string') { g.fillStyle = style; lastStyle.set(g, style); }
      g.globalAlpha = Math.min(1, a);
      g.fillRect(x, y, s, s);
      g.globalAlpha = 1;
    };

    /* The deep-sky objects, each painted once. Sprites are drawn along their long axis; the scene
       squashes and turns them to each object's real shape and angle on the sky. */
    // Galaxies, as grains of light. Old stars in the bulge burn yellow, young ones along the arms
    // burn blue, with the odd pink knot of glowing hydrogen where new stars are forming.
    const GALAXY_TINTS = [[255, 228, 190], [255, 236, 205], [250, 222, 185], [255, 232, 200]];
    const ARM = [[170, 195, 255], [190, 210, 255], [205, 215, 255]];
    const KNOT = [255, 140, 185];
    function galaxySprite(spiral) {
      const tint = pick(GALAXY_TINTS);
      return makeSprite(128, (g, size) => {
        const c = size / 2, R = size * 0.46;
        g.fillStyle = fade(g.createRadialGradient(c, c, 0, c, c, R), tint, [[0, 0.35], [0.35, 0.08], [1, 0]]);
        g.fillRect(0, 0, size, size);
        const arms = 2 + (rand() < 0.3 ? 1 : 0), wind = 0.28 + rand() * 0.18, twist = rand() * TAU;
        for (let i = 0; i < 2600; i++) {
          let x, y, a, col = tint;
          if (spiral && rand() < 0.78) {
            // Along a logarithmic arm, scattered more the further out it gets.
            const t = Math.pow(rand(), 0.8);
            const rad = R * 0.08 * Math.exp(t * 2.5);
            const theta = Math.log(rad / (R * 0.08)) / wind + (Math.floor(rand() * arms) / arms) * TAU + twist;
            const spread = 1.2 + rad * 0.16;
            x = c + Math.cos(theta) * rad + gauss() * spread;
            y = c + Math.sin(theta) * rad + gauss() * spread;
            a = 0.12 + 0.5 * (1 - rad / R);
            col = rand() < 0.035 ? KNOT : rand() < 0.25 + 0.6 * (rad / R) ? pick(ARM) : col;
          } else {
            // The bulge, or a whole elliptical: a dense, soft cloud around the core.
            const s = spiral ? R * 0.16 : R * 0.34;
            x = c + gauss() * s; y = c + gauss() * s;
            a = 0.1 + 0.45 * Math.exp(-Math.hypot(x - c, y - c) / s);
          }
          if (Math.hypot(x - c, y - c) > R) continue;
          grain(g, x, y, col, a * (0.5 + rand()), rand() < 0.15 ? 1.4 : 0.9);
        }
        const core = g.createRadialGradient(c, c, 0, c, c, size * 0.07);
        core.addColorStop(0, 'rgba(255,248,230,0.95)');
        core.addColorStop(1, rgba(tint, 0));
        g.fillStyle = core;
        g.fillRect(0, 0, size, size);
      });
    }
    // Glowing gas: red and pink where hydrogen glows, teal where oxygen does (Orion's heart, the
    // shells of old supernovae), blue where dust reflects starlight, orange threads for the Crab.
    const HYDROGEN = [[225, 70, 100], [240, 100, 130], [200, 60, 90]];
    const OXYGEN = [110, 215, 210];
    const DUST = [[150, 180, 255], [120, 160, 255], [180, 200, 255]];
    const CRAB = [[255, 160, 105], [255, 135, 110], [255, 185, 130]];
    // Supernova remnants seen as a shell of hydrogen and oxygen: the Jellyfish (IC 443). The Veil has
    // its own painter, veilSprite.
    const SHELLS = new Set(['IC0443']);
    // Value noise for the gas's wisps: a grid of random heights, eased between.
    function noise(cells) {
      const n = cells + 1, v = Float32Array.from({ length: n * n }, rand);
      const ease = (t) => t * t * (3 - 2 * t);
      return (u, w) => {
        const x = u * cells, y = w * cells, x0 = Math.min(cells - 1, Math.floor(x)), y0 = Math.min(cells - 1, Math.floor(y));
        const fx = ease(x - x0), fy = ease(y - y0), i = y0 * n + x0;
        const top = v[i] + (v[i + 1] - v[i]) * fx, bottom = v[i + n] + (v[i + n + 1] - v[i + n]) * fx;
        return top + (bottom - top) * fy;
      };
    }
    const BELL = Float32Array.from({ length: 401 }, (_, i) => Math.exp(-i / 64));   // exp(-d²), d² in 1/64ths
    // Painted pixel by pixel rather than as stacked gradients: a hundred overlapping gradients pile
    // their dithering into a visible checker, and saturate into a solid oval.
    // Soft enough to be painted small and drawn larger: 96 pixels, 64 for the small ones.
    function nebulaSprite(id, kind, deg) {
      const shell = SHELLS.has(id);
      const colors = kind === 'reflection' ? DUST
        : shell ? [...HYDROGEN, OXYGEN, OXYGEN]
        : kind === 'remnant' ? CRAB
        : id === 'IC0405' ? [...HYDROGEN, ...DUST]        // the Flaming Star: half glow, half reflection
        : HYDROGEN;
      // The showpieces get more pixels, for their lanes and hearts.
      return makeSprite(id === 'M42' || id === 'M20' ? 128 : deg < 0.6 ? 64 : 96, (g, size) => {
        const c = size / 2;
        // Clumps of gas, each a soft blob of one colour. `solid` ones skip the wisps (bright hearts).
        // In sprite space +x is north and +y is west, since the scene turns +x to north (for pa = 0).
        const clumps = [];
        const hole = id === 'NGC2238' ? 0.18 : 0;       // the Rosette's stars have blown out its middle
        const brightSide = rand() * TAU;                // a shell is brighter on the side it's ploughing into
        // Where the glowing gas sits and how far it spreads, north-south and east-west (fractions of the sprite).
        let [gx, gy, sx, sy] = [0, 0, 0.2, 0.2];
        // Dark lanes of dust in front of the gas, as [x0, y0, x1, y1, width].
        let lanes = [];
        if (id === 'M42') {
          // The Orion Nebula fans out south of the Trapezium. Its bright heart glows green-blue with
          // oxygen around the four stars, and the Fish's Mouth, a dark bay of dust, cuts in from the
          // east just north of them, parting it from M43.
          [gx, gy, sx, sy] = [-0.07, 0, 0.17, 0.22];
          lanes = [[0.12, -0.36, 0.06, -0.06, 0.06]];
          clumps.push({ x: c, y: c, r: size * 0.09, w: 1.2, col: [150, 255, 225], solid: true });
          clumps.push({ x: c - size * 0.05, y: c + size * 0.04, r: size * 0.07, w: 0.6, col: [255, 200, 215], solid: true });
          clumps.push({ x: c, y: c, r: size * 0.025, w: 4, col: [255, 255, 240], solid: true });
        } else if (id === 'M20') {
          // The Trifid: a round red glow split into three by lanes of dust meeting near its central
          // star, with a blue cloud of dust lit by the same star off its north side.
          [gx, gy, sx, sy] = [-0.09, 0, 0.11, 0.11];
          const lane = (bearing) => { const t = bearing * RAD; return [-0.09, 0, -0.09 + Math.cos(t) * 0.17, -Math.sin(t) * 0.17, 0.04]; };
          lanes = [lane(50), lane(175), lane(290)];        // degrees from north through east
          for (let i = 0; i < 12; i++) {
            clumps.push({ x: c + size * (0.18 + gauss() * 0.06), y: c + size * gauss() * 0.09,
              r: size * (0.05 + rand() * 0.05), w: 0.4 + rand() * 0.5, col: pick(DUST) });
          }
          clumps.push({ x: c + size * -0.09, y: c, r: size * 0.015, w: 2, col: [235, 240, 255], solid: true });
        }
        for (let i = 0, n = shell ? 70 : 30; i < n; i++) {
          let x, y, w = 0.3 + rand() * 0.7;
          const col = pick(colors);
          if (shell) {
            const th = rand() * TAU, r = size * (0.32 + gauss() * 0.03);
            x = Math.cos(th) * r; y = Math.sin(th) * r;
            w *= 0.3 + 1.7 * Math.max(0, Math.cos(th - brightSide)) ** 1.5;
          } else {
            x = size * (gx + gauss() * sx); y = size * (gy + gauss() * sy);
            if (hole && Math.hypot(x, y) < size * hole) continue;
            if (DUST.includes(col) && kind !== 'reflection') x += size * 0.14;   // the reflecting dust off to one side
          }
          const r = size * (shell ? 0.025 + rand() * 0.035 : 0.05 + rand() * (sx < 0.15 ? 0.06 : 0.11));
          clumps.push({ x: c + x, y: c + y, r, w, col });
        }
        if (kind === 'remnant' && !shell) clumps.push({ x: c, y: c, r: size * 0.12, w: 0.5, col: [150, 180, 255], solid: true });
        const coarse = noise(5), mid = noise(11), fine = noise(23);
        // Each clump adds its light to the pixels near it (out to 2.5 radii, where it's under 0.2%).
        const n = size * size, wispy = new Float32Array(n), solid = new Float32Array(n);
        // Colour summed separately for wisps and hearts, so a heart keeps its own colour.
        const rgbW = new Float32Array(n * 3), rgbS = new Float32Array(n * 3);
        for (const k of clumps) {
          const reach = k.r * 2.5;
          const i0 = Math.max(0, Math.floor(k.x - reach)), i1 = Math.min(size - 1, Math.ceil(k.x + reach));
          const j0 = Math.max(0, Math.floor(k.y - reach)), j1 = Math.min(size - 1, Math.ceil(k.y + reach));
          for (let j = j0; j <= j1; j++) {
            for (let i = i0; i <= i1; i++) {
              const d2 = ((i + 0.5 - k.x) ** 2 + (j + 0.5 - k.y) ** 2) / (k.r * k.r);
              if (d2 >= 6.25) continue;
              const v = k.w * BELL[(d2 * 64) | 0], p = j * size + i;
              const rgb = k.solid ? rgbS : rgbW;
              if (k.solid) solid[p] += v; else wispy[p] += v;
              rgb[p * 3] += v * k.col[0]; rgb[p * 3 + 1] += v * k.col[1]; rgb[p * 3 + 2] += v * k.col[2];
            }
          }
        }
        const img = g.createImageData(size, size), px = img.data;
        for (let j = 0; j < size; j++) {
          for (let i = 0; i < size; i++) {
            const p = j * size + i, sum = wispy[p] + solid[p];
            if (sum < 0.002) continue;
            const edge = Math.min(1, (size * 0.49 - Math.hypot(i + 0.5 - c, j + 0.5 - c)) / (size * 0.1));
            if (edge <= 0) continue;
            // Filaments: ridges where the noise crosses its middle, over a patchy base.
            const u = i / size, w = j / size;
            const ridge = 1 - Math.abs(2 * mid(u, w) - 1);
            const veil = 1.4 * coarse(u, w) ** 1.5 * (0.3 + 0.7 * ridge ** 3) + 0.2 * (fine(u, w) - 0.5);
            // How much a lane of dust in front blocks here. Dust isn't ruled straight: each lane wanders,
            // starts thin where the lanes meet, widens outward, and thins out again at its far end.
            // Where lanes meet, the dust is no thicker than the thickest of them.
            let block = 0;
            const wx = (mid(w, u) - 0.5) * 0.07, wy = (mid(1 - u, w) - 0.5) * 0.07;
            for (const [x0, y0, x1, y1, width] of lanes) {
              const ax = (i + 0.5 - c) / size - x0 + wx, ay = (j + 0.5 - c) / size - y0 + wy, bx = x1 - x0, by = y1 - y0;
              const t = Math.max(0, Math.min(1, (ax * bx + ay * by) / (bx * bx + by * by)));
              const wide = width * (0.55 + 0.9 * t);
              block = Math.max(block, 0.85 * (1 - t ** 3) * Math.exp(-((ax - t * bx) ** 2 + (ay - t * by) ** 2) / (wide * wide)));
            }
            const clear = 1 - block;
            // The wisps' glow, with the hearts laid over it.
            // The gaps between wisps thin the gas but never empty it: real gas has no clean holes.
            const aw = (1 - Math.exp(-wispy[p] * Math.max(0.2, shell ? 0.5 + veil : veil) * 1.04)) * 0.9;   // a shell is threads already
            const as = 1 - Math.exp(-solid[p] * 1.3);
            const a = (as + aw * (1 - as)) * clear * edge;
            if (a <= 0) continue;
            const k = p * 4, fw = wispy[p] ? aw * (1 - as) / (wispy[p] * (as + aw * (1 - as))) : 0;
            const fs = solid[p] ? as / (solid[p] * (as + aw * (1 - as))) : 0;
            for (let ch = 0; ch < 3; ch++) px[k + ch] = rgbW[p * 3 + ch] * fw + rgbS[p * 3 + ch] * fs;
            px[k + 3] = Math.round(a * 255);
          }
        }
        g.putImageData(img, 0, 0);
      });
    }
    // The Veil: the Cygnus Loop, the shell of a star that blew up some 15,000 years ago, seen as threads
    // where its shock wave runs into thin gas. Teal-blue oxygen glows right at the front of the shock,
    // red hydrogen just behind it, and the threads lie along the front, braided like combed hair.
    // Laid out in arcminutes from the loop's centre, from the catalogued places of its parts:
    // the Eastern Veil (NGC 6992, 6995, IC 1340), the Western Veil (NGC 6960) and Pickering's
    // Triangle (NGC 6979, 6974) reaching in from the north rim. Its south is a blowout, nearly empty.
    const VEIL_RIM = [100, 95, 90, 84, 86, 92, 105, 95, 76, 67, 74, 90];   // radius every 30° from north through east
    const VEIL_GLOW = [[70, 50, 1], [122, 22, 0.8], [262, 26, 0.95], [5, 32, 0.3], [318, 18, 0.22], [185, 30, 0.02]];  // [PA, spread, brightness]
    const PICKERING = [[95, -16, 38, 4], [93, 8, 46, 6], [88, -4, 55, -8]];        // [north, east] to [north, east]
    const HYDROGEN_LIGHT = [255, 45, 80], OXYGEN_LIGHT = [70, 200, 255];
    function veilSprite() {
      const salt = Math.floor(rand() * 1e6);
      const hash = (x, y) => {
        let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + salt) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
      };
      const vnoise = (x, y) => {                       // value noise over the whole plane
        const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
        const ex = fx * fx * (3 - 2 * fx), ey = fy * fy * (3 - 2 * fy);
        const top = hash(xi, yi) + (hash(xi + 1, yi) - hash(xi, yi)) * ex;
        const bottom = hash(xi, yi + 1) + (hash(xi + 1, yi + 1) - hash(xi, yi + 1)) * ex;
        return top + (bottom - top) * ey;
      };
      const ridge = (n, sharp) => (1 - Math.abs(2 * n - 1)) ** sharp;
      const bump = (a, b, spread) => { const d = Math.atan2(Math.sin(a - b), Math.cos(a - b)) / spread; return Math.exp(-d * d); };
      // Threads running along a front, `s` along it and `d` across it (arcminutes): they wander together,
      // so they braid rather than run ruled straight.
      const threads = (s, d) => {
        const dd = d + 5 * (vnoise(s / 30, 3.1) - 0.5) + 2.5 * (vnoise(s / 9, 7.7) - 0.5);
        return 0.5 * ridge(vnoise(s / 40, dd / 2.4), 3) + 0.4 * ridge(vnoise(s / 18 + 50, dd / 1.4), 4) + 0.3 * ridge(vnoise(s / 9 + 90, dd / 0.9), 4);
      };
      const NORTH = 240, WEST = 240 * 0.76;            // arcminutes across the sprite (the scene squashes west by 0.76)
      // 192 pixels: it's drawn about 150 device pixels across, at most.
      return makeSprite(192, (g, size) => {
        const c = size / 2, img = g.createImageData(size, size), px = img.data;
        for (let j = 0; j < size; j++) {
          for (let i = 0; i < size; i++) {
            const north = ((i + 0.5 - c) / size) * NORTH, east = -((j + 0.5 - c) / size) * WEST;
            const r = Math.hypot(north, east), pa = Math.atan2(east, north);
            const fade = Math.min(1, (size * 0.49 - Math.hypot(i + 0.5 - c, j + 0.5 - c)) / (size * 0.04));
            if (fade <= 0) continue;
            // The rim: where the shock front is, here, and how bright it runs.
            const k = ((pa / RAD + 360) % 360) / 30, k0 = Math.floor(k) % 12, f = k - Math.floor(k), e = (1 - Math.cos(f * Math.PI)) / 2;
            const s = pa * 90;                                       // along the rim, in about arcminutes
            const rim = VEIL_RIM[k0] + (VEIL_RIM[(k0 + 1) % 12] - VEIL_RIM[k0]) * e + 6 * (vnoise(s / 40, 1.3) - 0.5);
            const d = r - rim;
            if ((d < -25 || d > 18) && !(north > 30 && Math.abs(east) < 30)) continue;   // far from the rim and Pickering's
            let glow = 0;
            for (const [at, spread, b] of VEIL_GLOW) glow += b * bump(pa, at * RAD, spread * RAD);
            glow *= 0.2 + 1.2 * vnoise(s / 22, 9.9);                 // brighter and fainter stretches
            glow *= Math.min(1, glow);                               // faint stretches fainter still
            const t = threads(s, d);
            // Hydrogen behind the front, oxygen in a thin skin right at it, and faint outer arcs ahead of it.
            // The brighter the stretch, the thicker its band of threads and the more oxygen at its front.
            const band = 3 + 6 * Math.min(1, glow);
            let ha = 1.7 * glow * (Math.exp(-(((d + band * 0.8) / band) ** 2)) * (0.1 + 1.4 * t) + (d < 0 ? 0.1 * Math.exp(d / 12) * t : 0));
            let o3 = 2.4 * glow * Math.min(1, glow) * Math.exp(-(((d + 1.5) / 2.2) ** 2)) * (0.15 + 1.5 * t);
            if (d > 2 && d < 16) ha += glow * 0.35 * ridge(vnoise(s / 70, d / 3), 10);
            // Pickering's Triangle: threads reaching in from the north rim.
            for (const [n0, e0, n1, e1] of PICKERING) {
              const bx = n1 - n0, by = e1 - e0, len = Math.hypot(bx, by);
              const along = ((north - n0) * bx + (east - e0) * by) / len;
              if (along < -4 || along > len + 4) continue;
              const across = ((north - n0) * by - (east - e0) * bx) / len, tp = threads(along * 1.3 + 400, across);
              const ends = Math.max(0, Math.min(1, (along + 4) / 14, (len + 4 - along) / 24));   // soft at both ends
              const w = 0.3 * ends * Math.exp(-((across / 4) ** 2));
              ha += w * (0.3 + 1.3 * tp); o3 += w * 0.6 * tp;
            }
            const red = ha * HYDROGEN_LIGHT[0] + o3 * OXYGEN_LIGHT[0];
            const green = ha * HYDROGEN_LIGHT[1] + o3 * OXYGEN_LIGHT[1];
            const blue = ha * HYDROGEN_LIGHT[2] + o3 * OXYGEN_LIGHT[2];
            const m = Math.max(red, green, blue);
            if (m < 1) continue;
            // Where the two overlap their light adds up toward white; the strength becomes the alpha.
            const q = (j * size + i) * 4;
            px[q] = (red / m) * 255; px[q + 1] = (green / m) * 255; px[q + 2] = (blue / m) * 255;
            px[q + 3] = Math.round((1 - Math.exp(-m / 200)) * 255 * fade);
          }
        }
        g.putImageData(img, 0, 0);
      });
    }
    // A planetary nebula: a dying star's shed shell, seen as a ring, teal inside and red at the rim.
    const ringSprite = () => makeSprite(64, (g, size) => {
      const c = size / 2;
      g.lineWidth = size * 0.12;
      g.strokeStyle = 'rgba(255,110,120,0.55)';
      g.beginPath(); g.arc(c, c, size * 0.3, 0, TAU); g.stroke();
      g.lineWidth = size * 0.08;
      g.strokeStyle = 'rgba(140,240,220,0.6)';
      g.beginPath(); g.arc(c, c, size * 0.24, 0, TAU); g.stroke();
      puff(g, c, c, size * 0.45, [255, 120, 140], 0.15);
    });
    // Star clusters: an open cluster is a loose handful of young blue-white stars; a globular is a
    // ball of hundreds of thousands of old yellow ones, packed so tight the middle blurs into a glow.
    const OLD_STARS = [[255, 236, 200], [255, 220, 170], [255, 245, 225]];
    const YOUNG_STARS = [[200, 215, 255], [235, 240, 255], [255, 240, 215]];
    const clusterSprite = (globular) => makeSprite(128, (g, size) => {
      const c = size / 2;
      if (globular) puff(g, c, c, size * 0.3, [255, 235, 200], 0.25);
      for (let i = 0, n = globular ? 1600 : 70; i < n; i++) {
        const s = size * (globular ? 0.11 : 0.22);
        const x = c + gauss() * s * (globular ? 1 : 1.3), y = c + gauss() * s * (globular ? 1 : 1.3);
        const col = pick(globular ? OLD_STARS : YOUNG_STARS);
        grain(g, x, y, col, globular ? 0.35 + rand() * 0.5 : 0.5 + rand() * 0.5, globular ? 0.9 : rand() < 0.3 ? 2.2 : 1.4);
      }
    });

    /* The sky over the Bay Area as you'd see it facing south: the bottom of the screen a little
       above the horizon, the top reaching past the point straight overhead, east on the left. Everything is
       placed from the real time, so it turns with the Earth: Orion climbing on winter evenings,
       Scorpius low in the south in summer. */
    const LAT = 37.77 * RAD, LON = -122.42;              // San Francisco
    const SKY_K = 0.06;                                  // the whole sky slides together as the page scrolls
    const EDGE = 75 * RAD;                               // how far from the middle of the view the corners reach
    const BOTTOM_ALT = 10 * RAD;                         // how high above the horizon the bottom edge looks
    // It opens on the sky as it is now, then runs as a time-lapse, a minute of sky every second, so
    // you can watch it wheel west around the pole the way the Earth turns it. Paused, it holds still.
    const TIME_LAPSE = 60;
    const sinLat = Math.sin(LAT), cosLat = Math.cos(LAT);
    const at = (raDeg, decDeg, o = {}) => {
      o.ra = raDeg * RAD; o.cd = Math.cos(decDeg * RAD); o.sd = Math.sin(decDeg * RAD);
      o.x = 0; o.y = 0; o.alt = -1;
      return o;
    };
    // The catalog stars (sky.js).
    const data = window.SKY_STARS || [];
    const names = window.SKY_NAMES || [];
    const sky = [];
    for (let i = 0; i + 4 < data.length; i += 5) {
      const mag = data[i + 2] / 100, tint = bvTint(data[i + 3] / 100);
      const t = Math.max(0, Math.min(1, (5.5 - mag) / 7)); // 0 at the faintest, about 1 for Sirius
      const faint = mag > 4.5;
      sky.push(at(data[i] / 100, data[i + 1] / 100, {
        faint, tint, name: names[i / 5] || '', ly: data[i + 4] / 10,
        size: faint ? 0.7 + t * 4 : 3.5 + Math.pow(t, 1.4) * 26,
        base: faint ? 0.35 + t * 3 : 0.7 + t * 0.3,
        glow: glows[tint], spike: mag < 2 ? spikes[tint] : null,
        depth: faint ? rand() * 0.15 : 0.08 + rand() * 0.2,   // how much it twinkles
        speed: 0.05 + rand() * 0.25, phase: rand() * TAU,     // twinkles per second
      }));
    }
    sky.sort((a, b) => a.tint - b.tint);                       // fewer fillStyle changes when drawing

    // The faintest stars the eye can find under a dark sky, magnitude 5.5 to 6.5 (sky.js).
    const dust = [];
    const faintData = window.SKY_FAINT || [];
    for (let i = 0; i + 3 < faintData.length; i += 4) {
      const mag = faintData[i + 2] / 10;
      dust.push(at(faintData[i] / 10, faintData[i + 1] / 10, {
        tint: bvTint(faintData[i + 3] / 10), size: 0.6 + (6.5 - mag) * 0.5, base: 0.22 + (6.5 - mag) * 0.3,
        depth: rand() * 0.15, speed: 0.05 + rand() * 0.25, phase: rand() * TAU,
      }));
    }
    dust.sort((a, b) => a.tint - b.tint);

    // The Milky Way: our own galaxy's disc seen edge-on from inside, brightest toward its centre in
    // Sagittarius, split from Cygnus to Aquila by the Great Rift, a lane of dark dust. It comes as a
    // one-degree grid of brightness (sky.js), looked up for each pixel of a small canvas that is then
    // stretched over the screen, so its edges come out soft.
    const MW_COLS = 360, MW_DEC0 = -52, MW_MAX = 10;
    const mwGrid = new Uint8Array(MW_COLS * (90 - MW_DEC0));
    {
      const runs = window.SKY_MILKYWAY || [];
      for (let i = 0, n = 0; i + 1 < runs.length; i += 2) { mwGrid.fill(runs[i], n, n + runs[i + 1]); n += runs[i + 1]; }
    }
    const mwAt = (ra, dec) => {                     // brightness 0..1, blended between cell centres
      const x = ((ra % 360) + 360) % 360 - 0.5, y = dec - MW_DEC0 - 0.5;
      if (y < 0) return 0;
      const x0 = Math.floor(x), y0 = Math.min(Math.floor(y), 90 - MW_DEC0 - 2), fx = x - x0, fy = Math.min(1, y - y0);
      const cell = (cx, cy) => mwGrid[cy * MW_COLS + ((cx + MW_COLS) % MW_COLS)];
      const top = cell(x0, y0) * (1 - fx) + cell(x0 + 1, y0) * fx;
      const bottom = cell(x0, y0 + 1) * (1 - fx) + cell(x0 + 1, y0 + 1) * fx;
      return (top * (1 - fy) + bottom * fy) / MW_MAX;
    };
    const milky = document.createElement('canvas'), mctx = milky.getContext('2d');
    const MW_SCALE = 0.2, MW_PAD = 60;
    // Up close it isn't a glow but a grain of countless stars too faint to pick out, thickest where it's
    // brightest. Scattered evenly at GRAIN_PER_SQ_DEG, kept where the grid says the Milky Way is. Only
    // cells the Milky Way reaches are visited (a cell blends with its neighbours, so a cell counts if
    // any of the nine is lit); the rest, most of the sky, would keep nothing.
    const grains = [];
    const GRAIN_TINTS = ['#f4ecdf', '#e9ecf6', '#dfe6ff', '#f8e7cf'];
    const GRAIN_PER_SQ_DEG = 7.76;
    const MW_ROWS = 90 - MW_DEC0;
    const lit = (col, row) => row >= 0 && row < MW_ROWS && mwGrid[row * MW_COLS + ((col + MW_COLS) % MW_COLS)] > 0;
    for (let row = 0; row < MW_ROWS; row++) {
      const sinLo = Math.sin((MW_DEC0 + row) * RAD), sinHi = Math.sin((MW_DEC0 + row + 1) * RAD);
      const perCell = GRAIN_PER_SQ_DEG * (sinHi - sinLo) / RAD;          // a cell's area shrinks toward the pole
      for (let col = 0; col < MW_COLS; col++) {
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) near = lit(col + dx, row + dy);
        if (!near) continue;
        for (let n = Math.floor(perCell + rand()); n > 0; n--) {
          const ra = col + rand(), dec = Math.asin(sinLo + rand() * (sinHi - sinLo)) / RAD;
          const b = mwAt(ra, dec);
          if (!b || rand() > Math.pow(b, 1.3)) continue;
          grains.push(at(ra, dec, {
            b, size: 0.5 + rand() * 0.6, a: 0.08 + rand() * 0.27,
            tint: Math.floor(rand() * GRAIN_TINTS.length),
          }));
        }
      }
    }
    grains.sort((p, q) => p.tint - q.tint);

    // A few paintings shared round: galaxies and clusters are turned and squashed to each one's real
    // shape anyway, so a handful of each is plenty, and each takes thousands of points to paint.
    const shared = (count, paint) => {
      const made = [];
      let next = 0;
      return () => { const i = next++ % count; return made[i] || (made[i] = paint()); };
    };
    // The deep-sky objects (sky.js), by kind: how each is painted, and how bright it's drawn.
    const KINDS = {
      spiral:     { base: 0.9,  sprite: shared(5, () => galaxySprite(true)) },
      elliptical: { base: 0.9,  sprite: shared(3, () => galaxySprite(false)) },
      globular:   { base: 0.55, sprite: shared(4, () => clusterSprite(true)) },
      open:       { base: 0.8,  sprite: shared(6, () => clusterSprite(false)) },
      planetary:  { base: 0.75, sprite: () => ringSprite() },
      reflection: { base: 0.5,  sprite: (id, deg) => nebulaSprite(id, 'reflection', deg) },
      // The Eastern Veil is part of the Veil's painting, so it isn't painted again (it can still be hovered).
      remnant:    { base: 0.75, sprite: (id, deg) => id === 'NGC6960' ? veilSprite() : id === 'NGC6992' ? null : nebulaSprite(id, 'remnant', deg) },
      nebula:     { base: 0.75, sprite: (id, deg) => nebulaSprite(id, 'nebula', deg) },
    };
    // OpenNGC gives NGC 6960 the whole Cygnus Loop's size (210' by 160') but the place of its western
    // filament, so the loop is put at its own centre: G74.0-8.5 in Green's catalogue of supernova remnants.
    const RECENTRE = { NGC6960: [312.75, 30.667] };
    const objects = (window.SKY_OBJECTS || []).map(([name, ra, dec, kind, deg, flat, pa, ly, id]) => {
      const k = KINDS[kind] || KINDS.nebula;
      if (RECENTRE[id]) [ra, dec] = RECENTRE[id];
      return at(ra, dec, {
        name, kind, deg, flat, pa: pa * RAD, ly, angle: 0, size: 0,
        sprite: k.sprite(id, deg), base: k.base,
        speed: 0.02 + rand() * 0.04, phase: rand() * TAU,      // a slow, slight shimmer
      });
    });

    // Sky time starts at the real time the scene opens and runs TIME_LAPSE times faster than the
    // animation clock from there, so it holds still while paused and picks up where it left off.
    let lst = 0, scale = 1, st = 1, ct = 0, clockNow = 0, clockStart = null;
    const skyStart = Date.now();
    const lstAt = (ms) => {
      const days = ms / 86400000 + 2440587.5 - 2451545;              // since J2000
      return ((280.46061837 + 360.98564736629 * days + LON) % 360) * RAD;
    };
    const skyTime = () => skyStart + (clockStart === null ? 0 : clockNow - clockStart) * TIME_LAPSE;
    function project(o) {
      const ha = lst - o.ra, ch = Math.cos(ha);
      const up = o.sd * sinLat + o.cd * cosLat * ch;
      o.alt = Math.asin(up);
      if (up < -0.1) return;
      const east = -o.cd * Math.sin(ha), north = o.sd * cosLat - o.cd * sinLat * ch;
      // Stereographic, around the view's centre: it keeps the constellations' shapes true.
      const ahead = -north * ct + up * st, above = north * st + up * ct;
      const k = scale / (1 + ahead);
      o.x = kit.w / 2 - east * k;
      o.y = kit.h / 2 - above * k;
    }
    // Starlight lost on its way down through the air: about 0.2 magnitudes per airmass on a clear
    // night near sea level, with the airmass from Kasten & Young (1989). The eye judges brightness in
    // magnitudes, not light, so it's taken off on that scale: anything dimmed by 3 or more is gone.
    const EXTINCTION = 0.2;
    function air(alt) {
      if (alt <= 0) return 0;
      const mass = 1 / (Math.sin(alt) + 0.50572 * Math.pow(alt / RAD + 6.07995, -1.6364));
      return Math.max(0, 1 - EXTINCTION * (mass - 1) / 3);
    }
    // The view: how big the sky is on screen and how far it's tilted up. Depends only on the window.
    function aim() {
      scale = Math.hypot(kit.w, kit.h) / 2 / Math.tan(EDGE / 2);
      // Tilt the view up from due south until the bottom corners are a little above the horizon, where
      // the stars come out of the haze. Looking up, the horizon bends down toward the sides, so in a
      // wide window the corners sit lowest; aim for them rather than the middle of the bottom edge.
      const u = (kit.w / 2) / scale, v = (-kit.h / 2) / scale, rr = u * u + v * v;
      const above = (2 * v) / (1 + rr), ahead = (1 - rr) / (1 + rr);
      let lo = 0, hi = Math.PI / 2;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        if (ahead * Math.sin(mid) + above * Math.cos(mid) < Math.sin(BOTTOM_ALT)) lo = mid; else hi = mid;
      }
      st = Math.sin(hi); ct = Math.cos(hi);
      // Bigger than life, the way a long exposure shows them; the biggest still biggest.
      const perDeg = (scale / 2) * RAD;                                // pixels per degree, mid-screen
      for (const o of objects) o.size = (o.kind === 'planetary' ? 10 : 16) + Math.sqrt(o.deg) * 42 * (perDeg / 9.66);
    }
    // Where everything is at this moment of (time-lapse) time. Cheap enough to run every frame; the
    // Milky Way's glow, the costly part, is repainted only every quarter degree of turn (see below).
    const northward = at(0, 0);                                  // scratch, reused every frame
    function placeSky() {
      lst = lstAt(skyTime());
      for (const s of sky) project(s);
      for (const s of dust) project(s);
      for (const o of objects) {
        project(o);
        // Which way north points here, to turn the object to its true angle on the sky.
        project(at(o.ra / RAD, Math.asin(o.sd) / RAD + 0.2, northward));
        o.angle = Math.atan2(northward.y - o.y, northward.x - o.x) - o.pa;
      }
      for (const p of grains) project(p);
      project(pole);
      if (Math.abs(lst - mwLst) > 0.25 * RAD || mwW !== kit.w || mwH !== kit.h || mwRoom !== skyRoom()) paintMilkyWay();
    }
    // How far the sky can slide up over the whole page: the painted glow covers all of it.
    const skyRoom = () => Math.ceil(scrollRoom() * SKY_K);
    // Between repaints the painted glow is turned about the pole's place on screen. That's not exact
    // in this projection (off by a pixel or so per quarter degree), but the glow is soft enough to hide it.
    const pole = at(0, 90), mwRef = at(0, 0);
    let mwLst = -10, mwW = 0, mwH = 0, mwRoom = -1, mwRefAngle = 0;
    function mwTurn() {
      mwRef.ra = mwLst; project(mwRef);
      return Math.atan2(mwRef.y - pole.y, mwRef.x - pole.x) - mwRefAngle;
    }
    function paintMilkyWay() {
      mwLst = lst; mwW = kit.w; mwH = kit.h; mwRoom = skyRoom();
      mwRef.ra = lst; project(mwRef);
      mwRefAngle = Math.atan2(mwRef.y - pole.y, mwRef.x - pole.x);
      // The screen plus the whole scroll range, with MW_PAD all round so turning it between
      // repaints never bares an edge.
      milky.width = Math.ceil((kit.w + MW_PAD * 2) * MW_SCALE);
      milky.height = Math.ceil((kit.h + mwRoom + MW_PAD * 2) * MW_SCALE);
      const img = mctx.createImageData(milky.width, milky.height), px = img.data;
      for (let j = 0; j < milky.height; j++) {
        for (let i = 0; i < milky.width; i++) {
          // Undo the projection: from this pixel back to a direction in the sky.
          const X = (i + 0.5) / MW_SCALE - MW_PAD, Y = (j + 0.5) / MW_SCALE - MW_PAD;
          const u = (kit.w / 2 - X) / scale, v = (kit.h / 2 - Y) / scale, rr = u * u + v * v;
          const east = (2 * u) / (1 + rr), above = (2 * v) / (1 + rr), ahead = (1 - rr) / (1 + rr);
          const north = -ahead * ct + above * st, up = ahead * st + above * ct;
          if (up <= 0) continue;
          const dec = Math.asin(Math.max(-1, Math.min(1, north * cosLat + up * sinLat)));
          const ha = Math.atan2(-east, up * cosLat - north * sinLat);
          const b = mwAt((lst - ha) / RAD, dec / RAD);
          if (!b) continue;
          // Fainter low down, seen through more air. (Quieting behind the text happens at draw
          // time, in screen space, since the text and the sky scroll at different speeds.)
          const a = 0.07 * b * air(Math.asin(up));
          const k = (j * milky.width + i) * 4;
          px[k] = 215; px[k + 1] = 222; px[k + 2] = 255; px[k + 3] = Math.round(a * 255);
        }
      }
      mctx.putImageData(img, 0, 0);
    }
    // What to take out of the glow behind the text: 1 - quiet(), painted in screen space and
    // redone only when the text box or the window moves.
    const hush = document.createElement('canvas'), hctx = hush.getContext('2d');
    let hushKey = '';
    function paintHush() {
      const key = `${kit.w}|${kit.h}|${kit.text.left}|${kit.text.top}|${kit.text.right}|${kit.text.bottom}`;
      if (key === hushKey) return;
      hushKey = key;
      hush.width = Math.ceil(kit.w * MW_SCALE);
      hush.height = Math.ceil(kit.h * MW_SCALE);
      const img = hctx.createImageData(hush.width, hush.height), px = img.data;
      for (let j = 0; j < hush.height; j++) {
        for (let i = 0; i < hush.width; i++) {
          const a = 1 - quiet((i + 0.5) / MW_SCALE, (j + 0.5) / MW_SCALE, 0.45, 160);
          if (a > 0) px[(j * hush.width + i) * 4 + 3] = Math.round(a * 255);
        }
      }
      hctx.putImageData(img, 0, 0);
    }
    // The grain is sharp, so it's drawn where it is exactly, every frame.
    function drawGrain(top) {
      let fill = -1;
      for (const p of grains) {
        const y = p.y - top;
        if (p.alt <= 0 || p.x < 0 || p.x > kit.w || y < 0 || y > kit.h) continue;
        const a = p.a * (0.4 + 0.6 * p.b) * air(p.alt) * quiet(p.x, y, 0.3, 140);
        if (a < 0.01) continue;
        if (fill !== p.tint) { fill = p.tint; ctx.fillStyle = GRAIN_TINTS[fill]; }
        ctx.globalAlpha = a;
        ctx.fillRect(p.x, y, p.size, p.size);
      }
      ctx.globalAlpha = 1;
    }

    /* Hover a star or an object for its name and when the light reaching you now set out. */
    const label = document.createElement('div');
    label.className = 'sky-label';
    label.setAttribute('aria-hidden', 'true');
    document.body.appendChild(label);
    let hovered = null;
    function whenLeft(ly) {
      if (!ly) return '';
      const now = new Date();
      const year = now.getFullYear() + (now - new Date(now.getFullYear(), 0, 1)) / 31557600000;
      const far = ly < 10 ? ly.toFixed(1) : Math.round(ly).toLocaleString('en-US');
      if (ly >= 1e6) return `Light left ${+(ly / 1e6).toFixed(1)} million years ago`;
      if (ly >= 10000) return `Light left ${(Math.round(ly / 1000) * 1000).toLocaleString('en-US')} years ago`;
      let step = ly < 100 ? 1 : ly < 1000 ? 10 : 100;
      let left = Math.round((year - ly) / step) * step;
      if (left === 0) { step = 10; left = Math.round((year - ly) / 10) * 10 || 1; }   // there's no year 0
      const era = left < 0 ? `${-left} BC` : left < 1000 ? `${left} AD` : `${left}`;
      return `Light left ${step === 1 ? 'in' : 'around'} ${era} · ${far} light years`;
    }
    function show(item, px, py) {
      if (item === hovered) return position(px, py);
      hovered = item;
      kit.redraw();
      if (!item) { label.classList.remove('show'); return; }
      label.textContent = item.name;
      const line = whenLeft(item.ly);
      if (line) { const span = document.createElement('span'); span.textContent = line; label.appendChild(span); }
      label.classList.add('show');
      position(px, py);
    }
    function position(px, py) {
      if (!hovered) return;
      const r = label.getBoundingClientRect();
      const x = Math.min(px + 14, window.innerWidth - r.width - 8), y = py + 18 + r.height > window.innerHeight - 8 ? py - r.height - 12 : py + 18;
      label.style.transform = `translate(${Math.max(8, x)}px, ${y}px)`;
    }
    function find(px, py) {
      if (quiet(px, py, 0, 40) < 0.5) return null;               // not through the text
      let best = null, bestD = Infinity;
      const top = kit.scroll * SKY_K;
      for (const o of objects) {
        if (o.alt <= 0) continue;
        const d = Math.hypot(o.x - px, o.y - top - py);
        if (d < Math.max(12, o.size * 0.3) && d < bestD) { best = o; bestD = d; }
      }
      for (const s of sky) {
        if (s.faint || !s.name || s.alt <= 0) continue;
        const d = Math.hypot(s.x - px, s.y - top - py);
        if (d < Math.max(10, s.size * 0.3) && d < bestD + 4) { best = s; bestD = d; }
      }
      return best;
    }
    // Where a mouse is resting over open sky, to look again as the sky turns under it. Null for a
    // finger, over a link, or outside the window.
    let mouse = null;
    const onPointer = (e) => {
      const over = e.target.closest && e.target.closest('a, button, input, label, .tweaks');
      mouse = !over && e.pointerType === 'mouse' ? { x: e.clientX, y: e.clientY } : null;
      show(over ? null : find(e.clientX, e.clientY), e.clientX, e.clientY);
    };
    // A mouse leaving the window clears it. A finger lifting fires the same event, but a tapped
    // star should keep its label until the next tap.
    const onLeave = (e) => { if (!e.relatedTarget && e.pointerType === 'mouse') { mouse = null; show(null); } };
    // The sky keeps turning (and sliding as the page scrolls), so the label is checked each frame.
    // Under a mouse it's whatever is under the pointer now. A tapped one's label follows it until
    // it sets, leaves the screen, or slips behind the text.
    function keepLabel(top) {
      if (mouse) return show(find(mouse.x, mouse.y), mouse.x, mouse.y);
      if (!hovered) return;
      const x = hovered.x, y = hovered.y - top;
      if (hovered.alt <= 0 || x < 0 || x > kit.w || y < 0 || y > kit.h || quiet(x, y, 0, 40) < 0.5) show(null);
      else position(x, y);
    }
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('pointerdown', onPointer, { passive: true });
    document.addEventListener('pointerout', onLeave);

    let meteor = null, nextMeteor = 6000, satellite = null, nextSatellite = 20000;
    function drawPoints(list, now, fill, top) {
      for (const s of list) {
        if (s.alt <= 0) continue;
        const x = s.x, y = s.y - top;
        if (x < -30 || x > kit.w + 30 || y < -30 || y > kit.h + 30) continue;
        // Low stars are seen through more air: dimmer, and twinkling harder.
        const low = 1 - s.alt / (Math.PI / 2);
        const twinkle = 1 - (s.depth + low * 0.15) * (0.5 + 0.5 * Math.sin(now * 0.001 * s.speed * TAU + s.phase));
        const a = Math.min(1, s.base * twinkle * air(s.alt) * quiet(x, y, 0.5, 100));
        if (a < 0.012) continue;
        ctx.globalAlpha = a;
        if (s.glow === undefined || s.faint) {
          if (fill !== s.tint) { fill = s.tint; ctx.fillStyle = TINTS[fill]; }
          ctx.fillRect(x - s.size / 2, y - s.size / 2, s.size, s.size);
        } else {
          ctx.drawImage(s.glow, x - s.size / 2, y - s.size / 2, s.size, s.size);
          if (s.spike) { const d = s.size * 1.5; ctx.drawImage(s.spike, x - d / 2, y - d / 2, d, d); }
        }
      }
      return fill;
    }

    return {
      fps: 24,
      parallax: true,
      colors() {},
      resize() { aim(); placeSky(); },
      leave() {
        window.removeEventListener('pointermove', onPointer);
        window.removeEventListener('pointerdown', onPointer);
        document.removeEventListener('pointerout', onLeave);
        label.remove();
      },
      update(now) {
        if (clockStart === null) clockStart = now;
        clockNow = now;
        placeSky();
        if (!meteor && now > nextMeteor) {
          const fromRight = rand() < 0.5;
          meteor = {
            x: fromRight ? kit.w * (0.75 + rand() * 0.3) : kit.w * (0.05 + rand() * 0.25),
            y: -20 + rand() * kit.h * 0.25,
            angle: fromRight ? Math.PI * (0.72 + rand() * 0.08) : Math.PI * (0.2 + rand() * 0.08),
            start: now, life: 700 + rand() * 500, length: 90 + rand() * 90,
          };
          nextMeteor = now + 12000 + rand() * 20000;
        }
        if (meteor && now - meteor.start > meteor.life) meteor = null;
        // A satellite: a steady dot crossing the top of the sky, slowly.
        if (!satellite && now > nextSatellite) {
          const ltr = rand() < 0.5;
          satellite = { x0: ltr ? -10 : kit.w + 10, x1: ltr ? kit.w + 10 : -10, y0: kit.h * (0.04 + rand() * 0.18), drop: kit.h * (rand() * 0.12), start: now, life: 28000 + rand() * 14000 };
          nextSatellite = now + 50000 + rand() * 50000;
        }
        if (satellite && now - satellite.start > satellite.life) satellite = null;
      },
      draw(now) {
        const top = kit.scroll * SKY_K;                    // how far the sky has slid up with the page
        keepLabel(top);
        ctx.clearRect(0, 0, kit.w, kit.h);
        ctx.save();
        const py = pole.y - top;
        ctx.translate(pole.x, py); ctx.rotate(mwTurn()); ctx.translate(-pole.x, -py);
        ctx.drawImage(milky, -MW_PAD, -MW_PAD - top, milky.width / MW_SCALE, milky.height / MW_SCALE);
        ctx.restore();
        // Quiet the glow behind the text. Only the glow is on the canvas yet, so this touches nothing else.
        paintHush();
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.drawImage(hush, 0, 0, hush.width / MW_SCALE, hush.height / MW_SCALE);
        ctx.restore();
        drawGrain(top);
        for (const o of objects) {
          if (o.alt <= 0 || !o.sprite) continue;
          const x = o.x, y = o.y - top;
          if (x < -o.size || x > kit.w + o.size || y < -o.size || y > kit.h + o.size) continue;
          const a = o.base * (0.88 + 0.12 * Math.sin(now * 0.001 * o.speed * TAU + o.phase))
            * air(o.alt) * quiet(x, y, 0.15, 140);
          if (a < 0.012) continue;
          ctx.save();
          ctx.globalAlpha = a;
          ctx.translate(x, y);
          ctx.rotate(o.angle);
          ctx.scale(1, o.flat);
          ctx.drawImage(o.sprite, -o.size / 2, -o.size / 2, o.size, o.size);
          ctx.restore();
        }
        drawPoints(sky, now, drawPoints(dust, now, -1, top), top);
        ctx.globalAlpha = 1;

        if (hovered && hovered.alt > 0) {
          const x = hovered.x, y = hovered.y - top, r = Math.max(7, (hovered.kind ? hovered.size * 0.35 : hovered.size * 0.22)) + 3;
          ctx.strokeStyle = 'rgba(255,255,255,0.45)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
        }
        if (satellite) {
          const p = (now - satellite.start) / satellite.life;
          const x = satellite.x0 + (satellite.x1 - satellite.x0) * p, y = satellite.y0 + satellite.drop * p;
          ctx.fillStyle = '#ffffff';
          ctx.globalAlpha = 0.5 * Math.min(1, p * 8, (1 - p) * 8) * quiet(x, y, 0.2, 100);
          ctx.beginPath(); ctx.arc(x, y, 0.8, 0, TAU); ctx.fill();
          ctx.globalAlpha = 1;
        }
        if (meteor) {
          const p = (now - meteor.start) / meteor.life;
          const dist = p * Math.max(kit.w, kit.h) * 0.4;
          const hx = meteor.x + Math.cos(meteor.angle) * dist, hy = meteor.y + Math.sin(meteor.angle) * dist;
          const tx = hx - Math.cos(meteor.angle) * meteor.length, ty = hy - Math.sin(meteor.angle) * meteor.length;
          const a = Math.sin(p * Math.PI) * 0.8 * quiet(hx, hy, 0.15, 120);
          const grad = ctx.createLinearGradient(hx, hy, tx, ty);
          // A hot white-green head (burning metals) cooling to an orange trail.
          grad.addColorStop(0, `rgba(235,255,240,${a})`);
          grad.addColorStop(0.3, `rgba(255,220,170,${a * 0.6})`);
          grad.addColorStop(1, 'rgba(255,170,110,0)');
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.1;
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
        }
      },
    };
  }

})();
