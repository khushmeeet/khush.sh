// The stars background, kept apart from backgrounds.js because it's the only one that needs the star
// catalog in sky.js (165 KB), the Moon's and planets' motions in orbits.js and the meteor showers in
// meteors.js. backgrounds.js loads those and this file the first time stars is picked, then calls
// Stars(kit): `kit` holds what it shares with the other backgrounds (the canvas, the window's size,
// the scroll position, where the text is, and the drawing helpers).

(() => {
  window.laterScenes = window.laterScenes || {};
  window.laterScenes.stars = Stars;

  /* ==========================================================
     The Moon and the planets: where each one is at a given moment (orbits.js)
     ========================================================== */
  const AU_KM = 149597870.7;            // the astronomical unit (IAU 2012), exact by definition
  const LIGHT_KM_S = 299792.458;        // the speed of light (SI), exact by definition
  // Returns a function of time (ms since 1970) giving the Sun, the Moon and each planet as x, y, z on
  // the J2000 equator, seen from the Earth's centre: the frame the star catalog uses, so they sit
  // among the stars where they really are. The Sun and planets come in au, the Moon in km.
  // Time is taken as UTC, though both theories run on TDB, about 69 seconds ahead: in that time the
  // Moon moves about half an arcminute, a twentieth of a pixel here.
  function Ephemeris() {
    const RAD = Math.PI / 180;
    const moon = window.SKY_MOON, rows = window.SKY_PLANETS;
    if (!moon || !rows || !window.SKY_OBLIQUITY) return null;
    const eps = window.SKY_OBLIQUITY * RAD, ce = Math.cos(eps), se = Math.sin(eps);
    const toEquator = (x, y, z) => [x, ce * y - se * z, se * y + ce * z];
    const poly = (c, T) => c[0] + T * (c[1] + T * (c[2] + T * (c[3] + T * c[4])));
    const elements = rows.map(([name, curve, ...el]) => ({ name, curve, el }));
    const STEP = window.SKY_PHASE_STEP || 5;
    // A planet's magnitude at 1 au from the Sun and from us, at a phase angle (degrees), read off its curve.
    const reduced = (curve, deg) => {
      const x = Math.min(curve.length - 1, deg / STEP), i = Math.min(curve.length - 2, Math.floor(x));
      return i < 0 ? curve[0] : curve[i] + (curve[i + 1] - curve[i]) * (x - i);
    };
    const earth = elements.find((p) => p.name === 'Earth');
    const planets = elements.filter((p) => p !== earth);

    // A planet around the Sun, on the J2000 ecliptic (au), T Julian centuries after J2000: JPL's
    // recipe for its approximate elements, solving Kepler's equation by Newton's method.
    function heliocentric(el, T) {
      const [a, e, I, L, peri, node] = [0, 1, 2, 3, 4, 5].map((i) => el[i] + el[i + 6] * T);
      const M = ((((L - peri) % 360) + 540) % 360 - 180) * RAD;
      let E = M + e * Math.sin(M);
      for (let k = 0; k < 6; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
      const w = (peri - node) * RAD, O = node * RAD, i = I * RAD;
      const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(i), si = Math.sin(i);
      return [
        (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp,
        (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp,
        sw * si * xp + cw * si * yp,
      ];
    }
    // The Moon from the Earth's centre (km): ELP 2000-82B's main problem, summed as elp82b.f does.
    function moonAt(T) {
      const [W1, D, Ms, Mm, F] = moon.args.map((c) => poly(c, T) * RAD);
      const sum = (terms, cosine) => {
        let s = 0;
        for (let i = 0; i < terms.length; i += 5) {
          const arg = terms[i] * D + terms[i + 1] * Ms + terms[i + 2] * Mm + terms[i + 3] * F;
          s += terms[i + 4] * (cosine ? Math.cos(arg) : Math.sin(arg));
        }
        return s;
      };
      const lon = W1 + (sum(moon.series[0]) / 3600) * RAD, lat = (sum(moon.series[1]) / 3600) * RAD;
      const r = sum(moon.series[2], true) * moon.scale;
      const x1 = r * Math.cos(lat) * Math.cos(lon), x2 = r * Math.cos(lat) * Math.sin(lon), x3 = r * Math.sin(lat);
      // From the ecliptic of date to the ecliptic of J2000 (Laskar's precession, as in elp82b.f).
      let pw = poly(moon.p, T) * T, qw = poly(moon.q, T) * T;
      const ra = 2 * Math.sqrt(1 - pw * pw - qw * qw), pwqw = 2 * pw * qw, pw2 = 1 - 2 * pw * pw, qw2 = 1 - 2 * qw * qw;
      pw *= ra; qw *= ra;
      return toEquator(pw2 * x1 + pwqw * x2 + pw * x3, pwqw * x1 + qw2 * x2 - qw * x3, -pw * x1 + qw * x2 + (pw2 + qw2 - 1) * x3);
    }
    return (ms) => {
      const T = (ms / 86400000 + 2440587.5 - 2451545) / 36525;
      const e = heliocentric(earth.el, T), R = Math.hypot(...e);    // the Earth-Moon barycentre stands in for the Earth
      return {
        sun: toEquator(-e[0], -e[1], -e[2]),
        moon: moonAt(T),
        planets: planets.map((p) => {
          const h = heliocentric(p.el, T), r = Math.hypot(...h);
          const at = toEquator(h[0] - e[0], h[1] - e[1], h[2] - e[2]), d = Math.hypot(...at);
          // Its brightness: dimmer with its distances from the Sun and from us, and with how much of
          // its lit side faces us (the phase angle, Sun-planet-Earth). How that last one goes is
          // measured from Horizons, so a thin crescent Venus keeps the glare it really has.
          const phase = Math.acos(Math.max(-1, Math.min(1, (r * r + d * d - R * R) / (2 * r * d))));
          return { name: p.name, at, au: d, mag: reduced(p.curve, phase / RAD) + 5 * Math.log10(r * d) };
        }),
      };
    };
  }

  /* ==========================================================
     Stars: the real sky over the Bay Area right now, with the Moon and the planets where they are,
     meteors (a few every night, and showers on their dates), and now and then a satellite
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

    /* The Moon and the planets (orbits.js), placed afresh each frame from the time-lapse time. */
    const ephemeris = Ephemeris();
    // Point o along a direction given as x, y, z on the J2000 equator.
    const toward = (o, [x, y, z]) => {
      const r = Math.hypot(x, y, z);
      o.ra = Math.atan2(y, x); o.sd = z / r; o.cd = Math.hypot(x, y) / r;
      return o;
    };
    // Each planet takes one of the star tints, picked by eye: Venus white, Mars rust, Uranus pale
    // blue, the rest the cream of sunlight off cloud tops and dust.
    const PLANET_TINT = { Mercury: 3, Venus: 2, Mars: 5, Jupiter: 3, Saturn: 3, Uranus: 1 };
    const planets = (window.SKY_PLANETS || []).filter(([name]) => name !== 'Earth').map(([name]) =>
      at(0, 0, { name, planet: true, tint: PLANET_TINT[name] ?? 3, au: 0, mag: 99, faint: true, size: 0, base: 0 }));
    // Sized and lit by magnitude like the stars, except that Venus and Jupiter can outshine Sirius.
    function lookOf(p, mag) {
      const t = Math.max(0, Math.min(1.35, (5.5 - mag) / 7));
      p.mag = mag;
      p.faint = mag > 4.5;
      p.size = p.faint ? 0.7 + t * 4 : 3.5 + Math.pow(t, 1.4) * 26;
      p.base = p.faint ? 0.35 + t * 3 : 0.7 + Math.min(1, t) * 0.3;
      p.spike = mag < 2 ? spikes[p.tint] : null;
    }
    // The Moon, drawn MOON_SIZE times its real size (the way the deep-sky objects are drawn larger than
    // life), lit from where the Sun really is, with its north toward the ecliptic's (the Moon's axis
    // stands within a degree and a half of it).
    const MOON_SIZE = 5;
    const moon = at(0, 0, { name: 'Moon', moon: true, r: 0, lit: 1, cosPhase: 1, waxing: true, km: 0, sunward: 0, north: 0 });
    const OBL = (window.SKY_OBLIQUITY || 0) * RAD;
    const ECLIPTIC_NORTH = [0, -Math.sin(OBL), Math.cos(OBL)];
    const nudge = at(0, 0);                                      // scratch
    // From the Moon (direction u), which way on screen the sky leads toward `target`, and how many
    // pixels a radian of sky takes there.
    function lean(u, target) {
      const STEP = 0.01, d = target[0] * u[0] + target[1] * u[1] + target[2] * u[2];
      const t = [target[0] - d * u[0], target[1] - d * u[1], target[2] - d * u[2]], n = Math.hypot(...t) || 1;
      project(toward(nudge, [u[0] + STEP * t[0] / n, u[1] + STEP * t[1] / n, u[2] + STEP * t[2] / n]));
      const dx = nudge.x - moon.x, dy = nudge.y - moon.y;
      return [Math.atan2(dy, dx), Math.hypot(dx, dy) / STEP];
    }
    function placeBodies() {
      if (!ephemeris) return;
      const now = ephemeris(skyTime());
      now.planets.forEach((b, i) => { const p = planets[i]; toward(p, b.at); p.au = b.au; lookOf(p, b.mag); project(p); });
      // The Sun's longitude along the ecliptic, which the meteor showers keep to.
      const [sx, sy, sz] = now.sun;
      sunLon = (Math.atan2(sy * Math.cos(OBL) + sz * Math.sin(OBL), sx) / RAD + 360) % 360;
      // The Moon is near enough that where you stand moves it, by up to a degree: seen from San
      // Francisco rather than from the Earth's centre, it sits lower in the sky.
      const g = now.moon, R = window.SKY_MOON.earth;
      const m = [g[0] - R * cosLat * Math.cos(lst), g[1] - R * cosLat * Math.sin(lst), g[2] - R * sinLat];
      moon.km = Math.hypot(...m);
      project(toward(moon, m));
      // Its phase: the angle at the Moon between the Sun and us. It's waxing while it's east of the
      // Sun, that is, counterclockwise from it seen from the ecliptic's north.
      const s = now.sun.map((v) => v * AU_KM), toSun = [s[0] - g[0], s[1] - g[1], s[2] - g[2]];
      moon.cosPhase = -(toSun[0] * g[0] + toSun[1] * g[1] + toSun[2] * g[2]) / (Math.hypot(...toSun) * Math.hypot(...g));
      moon.lit = (1 + moon.cosPhase) / 2;
      const turn = [s[1] * g[2] - s[2] * g[1], s[2] * g[0] - s[0] * g[2], s[0] * g[1] - s[1] * g[0]];
      moon.waxing = turn[0] * ECLIPTIC_NORTH[0] + turn[1] * ECLIPTIC_NORTH[1] + turn[2] * ECLIPTIC_NORTH[2] > 0;
      if (moon.alt <= 0) return;
      const u = m.map((v) => v / moon.km);
      let perRad;
      [moon.sunward, perRad] = lean(u, s);
      [moon.north] = lean(u, ECLIPTIC_NORTH);
      moon.r = Math.asin(window.SKY_MOON.radius / moon.km) * perRad * MOON_SIZE;
    }
    // The Moon's face: its near side photographed by the Lunar Reconnaissance Orbiter (orbits.js), the
    // dark seas of old lava and the bright highlands, north up and east (Mare Crisium's side) to the
    // right, as it looks in the sky. Each character is a pixel's brightness, darkest first.
    const FACE_LEVELS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$';
    const faceRows = window.SKY_MOON_FACE || [];
    const face = faceRows.length && makeSprite(faceRows.length, (g, size) => {
      const c = size / 2, img = g.createImageData(size, size), px = img.data;
      for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
          const level = FACE_LEVELS.indexOf(faceRows[j][i]);
          if (level < 0) continue;
          // The disc's edge, smoothed over a pixel, a pixel inside the sprite's so it stays round.
          const edge = Math.max(0, Math.min(1, c - 0.5 - Math.hypot(i + 0.5 - c, j + 0.5 - c)));
          const b = 0.22 + 0.78 * (level / (FACE_LEVELS.length - 1));
          const k = (j * size + i) * 4;
          px[k] = 246 * b; px[k + 1] = 242 * b; px[k + 2] = 232 * b; px[k + 3] = 255 * edge;
        }
      }
      g.putImageData(img, 0, 0);
    });
    const moonCanvas = document.createElement('canvas'), mctx2 = moonCanvas.getContext('2d');
    // The Moon as it looks now, into its own small canvas at the screen's resolution.
    function paintMoon(r, warm) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2), side = Math.ceil((r * 2 + 2) * dpr);
      if (moonCanvas.width !== side) moonCanvas.width = moonCanvas.height = side;
      mctx2.setTransform(1, 0, 0, 1, 0, 0);
      mctx2.clearRect(0, 0, side, side);
      mctx2.setTransform(dpr, 0, 0, dpr, side / 2, side / 2);
      const up = moon.north + Math.PI / 2;                       // turns the face's north to the sky's
      // Earthshine: sunlight off the Earth faintly lights the dark part, most when the Moon is a thin
      // crescent (when the Earth, seen from the Moon, is nearly full).
      mctx2.save();
      mctx2.rotate(up);
      mctx2.globalAlpha = 0.05 + 0.12 * (1 - moon.lit);
      mctx2.drawImage(face, -r, -r, r * 2, r * 2);
      mctx2.restore();
      mctx2.globalCompositeOperation = 'source-atop';
      mctx2.fillStyle = 'rgba(120,150,215,0.5)';
      mctx2.fillRect(-r - 1, -r - 1, r * 2 + 2, r * 2 + 2);
      mctx2.globalCompositeOperation = 'source-over';
      // The sunlit part: the half facing the Sun, bounded by the terminator, which is a circle seen
      // at an angle: an ellipse bulging into the dark half when gibbous, short of the middle when a crescent.
      mctx2.save();
      mctx2.rotate(moon.sunward);
      const rx = Math.max(0.001, r * Math.abs(moon.cosPhase));
      mctx2.beginPath();
      mctx2.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
      if (moon.cosPhase >= 0) mctx2.ellipse(0, 0, rx, r, 0, Math.PI / 2, Math.PI * 1.5, false);
      else mctx2.ellipse(0, 0, rx, r, 0, Math.PI / 2, -Math.PI / 2, true);
      mctx2.clip();
      mctx2.rotate(up - moon.sunward);
      mctx2.drawImage(face, -r, -r, r * 2, r * 2);
      mctx2.restore();
      // Low in the sky it's seen through more air, which takes the blue out of its light.
      if (warm > 0.02) {
        mctx2.globalCompositeOperation = 'source-atop';
        mctx2.fillStyle = `rgba(255,165,90,${0.55 * warm})`;
        mctx2.fillRect(-r - 1, -r - 1, r * 2 + 2, r * 2 + 2);
        mctx2.globalCompositeOperation = 'source-over';
      }
      return side / dpr;
    }

    // Sky time starts at the real time the scene opens and runs TIME_LAPSE times faster than the
    // animation clock from there, so it holds still while paused and picks up where it left off.
    // ?sky=2026-12-14T02:00-08:00 in the address opens on that moment instead, to see a shower ahead of time.
    let lst = 0, scale = 1, st = 1, ct = 0, clockNow = 0, clockStart = null;
    const asked = Date.parse(new URLSearchParams(location.search).get('sky') || '');
    const skyStart = Number.isFinite(asked) ? asked : Date.now();
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
    // Undo the projection: from a point on the sky's canvas (before any scrolling) back to a direction
    // in the sky, as east, north and up. Returns how far out from the view's centre it is, squared, in
    // the projection's own measure (0 at the centre, 1 at 90 degrees away).
    const look = [0, 0, 0];                                      // scratch
    function unproject(X, Y, out) {
      const u = (kit.w / 2 - X) / scale, v = (kit.h / 2 - Y) / scale, rr = u * u + v * v;
      const above = (2 * v) / (1 + rr), ahead = (1 - rr) / (1 + rr);
      out[0] = (2 * u) / (1 + rr);
      out[1] = -ahead * ct + above * st;
      out[2] = ahead * st + above * ct;
      return rr;
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
      // How much sky the window takes in (steradians), which sets how many meteors cross it.
      skySr = 0;
      const N = 48, cell = (kit.w / N) * (kit.h / N) / (scale * scale);
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const rr = unproject((i + 0.5) * kit.w / N, (j + 0.5) * kit.h / N, look);
          if (look[2] > 0) skySr += 4 * cell / ((1 + rr) * (1 + rr));   // the projection's stretch, undone
        }
      }
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
      placeBodies();
      placeGlow();
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
          unproject((i + 0.5) / MW_SCALE - MW_PAD, (j + 0.5) / MW_SCALE - MW_PAD, look);
          const east = look[0], north = look[1], up = look[2];
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
    /* The sky's own light. The Sun over the Bay Area lights the air (sun.js): the sky is blue by day,
       glows low in the west as the Sun sets (the right of this south-facing view), turns the deep
       blue of dusk, then goes black. It's shown far dimmer than it is, so the stars still stand out
       by day: black at or below GLOW_NIGHT and up to GLOW_MAX (a luminance on screen, white being 1)
       at GLOW_DAY, both log10 cd/m2. Colours look greyer the dimmer they are, so they're made
       GLOW_CHROMA times as rich to make up for it. All of these are picked by eye. */
    const sun = kit.sun;
    const GLOW_NIGHT = -2.5, GLOW_DAY = 3.5, GLOW_MAX = 0.05, GLOW_CURVE = 2, GLOW_CHROMA = 1.6;
    const WHITE_X = 0.3127, WHITE_Y = 0.329;                    // sRGB's white (D65)
    const GLOW_SCALE = 1 / 16;                                  // it's smooth: a pixel every 16 is plenty
    const glow = document.createElement('canvas'), gctx = glow.getContext('2d');
    const tone = [0, 0, 0];                                     // scratch
    let sunNow = null, glowAlt = null, glowAz = null, glowKey = '', glowLit = false, ground = '';
    // The sky's colour toward a point on the sky's canvas, as 0-255 sRGB into px at k.
    function glowAt(table, X, Y, px, k) {
      unproject(X, Y, look);
      const alt = Math.asin(Math.max(-1, Math.min(1, look[2]))) / RAD;
      let round = Math.abs(Math.atan2(look[0], look[1]) / RAD - sunNow.az) % 360;
      if (round > 180) round = 360 - round;
      const [logL, x, y] = table(alt, round, tone);
      const t = Math.pow(Math.max(0, Math.min(1, (logL - GLOW_NIGHT) / (GLOW_DAY - GLOW_NIGHT))), GLOW_CURVE);
      const rgb = sun.rgbOf(WHITE_X + GLOW_CHROMA * (x - WHITE_X), WHITE_Y + GLOW_CHROMA * (y - WHITE_Y), GLOW_MAX * t);
      for (let c = 0; c < 3; c++) px[k + c] = Math.round(255 * sun.encode(Math.max(0, Math.min(1, rgb[c]))));
      px[k + 3] = 255;
    }
    // Repainted as the Sun moves a tenth of a degree, which the time-lapse takes about half a second to do.
    function placeGlow() {
      if (!sun) return;
      sunNow = sun.at(skyTime());
      const room = skyRoom(), key = `${kit.w}|${kit.h}|${room}`;
      if (key === glowKey && Math.abs(sunNow.alt - glowAlt) < 0.1 && Math.abs(sunNow.az - glowAz) < 0.25) return;
      glowKey = key; glowAlt = sunNow.alt; glowAz = sunNow.az;
      // Dark everywhere once the Sun is far enough down: nothing to paint.
      glowLit = sunNow.alt > window.SUN_ROWS[0];
      const px = [0, 0, 0, 0];
      if (glowLit) {
        const gw = Math.ceil(kit.w * GLOW_SCALE) + 1, gh = Math.ceil((kit.h + room) * GLOW_SCALE) + 1;
        if (glow.width !== gw || glow.height !== gh) { glow.width = gw; glow.height = gh; }
        const img = gctx.createImageData(gw, gh), table = sun.sky(sunNow.alt);
        for (let j = 0; j < gh; j++) {
          for (let i = 0; i < gw; i++) glowAt(table, (i + 0.5) / GLOW_SCALE, (j + 0.5) / GLOW_SCALE, img.data, (j * gw + i) * 4);
        }
        gctx.putImageData(img, 0, 0);
        // The page behind the text takes the sky's colour there, so the halo round the letters matches it.
        glowAt(table, kit.w / 2, (kit.text.top + kit.text.bottom) / 2 + kit.scroll * SKY_K, px, 0);
      }
      const now = glowLit ? `rgb(${px[0]} ${px[1]} ${px[2]})` : '';
      if (now !== ground) {
        ground = now;
        if (now) document.documentElement.style.setProperty('--ground', now);
        else document.documentElement.style.removeProperty('--ground');
      }
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
    // For the Moon and the planets, sunlight they send back: how long ago it left them, and how far.
    function lightFrom(km) {
      const s = km / LIGHT_KM_S;
      const when = s < 60 ? `${s.toFixed(1)} seconds` : s < 5400 ? `${Math.round(s / 60)} minutes` : `${(s / 3600).toFixed(1)} hours`;
      const far = km < 1e6 ? `${(Math.round(km / 100) * 100).toLocaleString('en-US')} km`
        : km < 1e9 ? `${Math.round(km / 1e6)} million km` : `${(km / 1e9).toFixed(1)} billion km`;
      return `Light left ${when} ago · ${far}`;
    }
    function phaseOf(m) {
      const lit = `${Math.round(m.lit * 100)}% lit`;
      if (m.lit < 0.03) return `New, ${lit}`;
      if (m.lit > 0.97) return `Full, ${lit}`;
      if (Math.abs(m.lit - 0.5) < 0.04) return `${m.waxing ? 'First' : 'Last'} quarter, ${lit}`;
      return `${m.waxing ? 'Waxing' : 'Waning'} ${m.lit < 0.5 ? 'crescent' : 'gibbous'}, ${lit}`;
    }
    // The label's words. The Moon's and the planets' change as the time-lapse runs, so theirs are
    // worked out again each frame they're shown, and rewritten when they differ.
    let labelText = '';
    function fill(item) {
      const lines = [item.name, ...(item.moon ? [phaseOf(item), lightFrom(item.km)]
        : item.planet ? [lightFrom(item.au * AU_KM)] : [whenLeft(item.ly)])].filter(Boolean);
      if (lines.join('\n') === labelText) return;
      labelText = lines.join('\n');
      label.textContent = lines[0];
      for (const line of lines.slice(1)) {
        const span = document.createElement('span');
        span.textContent = line;
        label.appendChild(span);
      }
    }
    const moves = (item) => item && (item.moon || item.planet);
    function show(item, px, py) {
      if (item === hovered) {
        if (moves(item)) fill(item);
        return position(px, py);
      }
      hovered = item;
      kit.redraw();
      if (!item) { label.classList.remove('show'); return; }
      fill(item);
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
      // The planets and the Moon are in front of everything else.
      for (const p of planets) {
        if (p.alt <= 0) continue;
        const d = Math.hypot(p.x - px, p.y - top - py);
        if (d < Math.max(10, p.size * 0.3) && d < bestD + 6) { best = p; bestD = d; }
      }
      if (ephemeris && face && moon.alt > 0 && Math.hypot(moon.x - px, moon.y - top - py) < Math.max(12, moon.r + 4)) best = moon;
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
      else {
        if (moves(hovered)) fill(hovered);
        position(x, y);
      }
    }
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('pointerdown', onPointer, { passive: true });
    document.addEventListener('pointerout', onLeave);

    /* Meteors: a few every night from anywhere (sporadic meteors), and on a shower's dates many more,
       all streaking away from its radiant (meteors.js). Their numbers follow the International
       Meteor Organization's (IMO) way of counting them:
       - A shower's ZHR is how many one observer would see in an hour under a sky showing stars to
         magnitude 6.5 with the radiant straight overhead. With it at altitude h they see ZHR sin h
         (the IMO's table for a ZHR of 100: 94 at 70 degrees, 77 at 50, 50 at 30); below the horizon, none.
       - That observer takes in a field about 105 degrees across (the IMO's FAQ, which finds only 2% of
         meteors seen outside it), so a window showing more sky than that shows more meteors, in proportion.
       - Sporadic meteors: "roughly 5 to 15 sporadic meteors per hour, under excellent skies", by the
         time of day and the season (the IMO's Handbook for Meteor Observers), which puts the change
         down to where their sources sit, the busiest being the apex, the way the Earth is heading. It
         climbs from midnight to dawn; so here, 5 an hour with the apex straight down, rising to 15 with
         it straight up. Their radiants are anywhere.
       And each one where it really would be:
       - It lights up about 100 km up and burns out by about 80 (the heights the IMO's guide to minor
         showers works with), at the speed it meets the air, so its path on the sky, its length and how
         fast it crosses all come out as they would. Sporadic meteors meet the air at anything from
         11.2 km/s (falling in from rest) to 72.9 (met head on; the Handbook), faster the nearer their
         radiant is to the apex.
       - Each magnitude brighter, r times fewer (the shower's population index; 3.4 for sporadic
         meteors, Jenniskens 1994), down to the 6.5 the ZHR counts to. So most are faint.
       Moonlight, which drowns the fainter ones, is left out, as it is for the stars. */
    const FIELD = TAU * (1 - Math.cos(52.5 * RAD));             // the observer's 105-degree field, in steradians
    const SPORADIC = [5, 15];                                    // an hour: apex straight down, straight up
    const BEGIN_KM = 100, END_KM = 80;
    const SLOWEST = 11.2, FASTEST = 72.9;                        // km/s
    const LIMIT = 6.5;                                           // the faintest meteor a ZHR counts
    const SPORADIC_R = window.SKY_SPORADIC_R;
    const EARTH_KM = window.SKY_MOON ? window.SKY_MOON.earth : 0;
    // Picked by eye: how long a stretch of its path stays lit behind a meteor (seconds), and the longest
    // path drawn, for one skimming in nearly level (km).
    const TRAIL_S = 0.25, LONGEST_KM = 300;
    const showers = (window.SKY_SHOWERS || []).map(([code, name, start, peak, end, speed, r, parts, track]) =>
      ({ code, name, start, peak, end, speed, r, parts, track, hr: 0, ra: 0, dec: 0, at: [0, 0, 0] }));
    let sunLon = null, skySr = 0, sporadicHr = 0;
    const apex = [0, 0, 0];
    const nearer = (deg) => ((deg % 360) + 540) % 360 - 180;   // an angle as the shorter way round, -180 to 180
    // A shower's ZHR with the Sun at longitude `lon`: none outside its activity, and through it, each
    // part of its profile falling away from the peak at its own pace.
    function zhrOf(s, lon) {
      if ((lon - s.start + 360) % 360 > (s.end - s.start + 360) % 360) return 0;
      const d = nearer(lon - s.peak);
      let zhr = 0;
      for (const [top, before, after] of s.parts) zhr += top * Math.pow(10, -(d < 0 ? before : after) * Math.abs(d));
      return zhr;
    }
    // Where its radiant is: between the calendar's positions, or carried on past its first or last.
    function radiantOf(s, lon) {
      const t = s.track;
      if (t.length === 1) { s.ra = t[0][1]; s.dec = t[0][2]; return; }
      const from = (l) => (l - t[0][0] + 360) % 360, last = from(t[t.length - 1][0]);
      let x = from(lon);
      if (x > last + (360 - last) / 2) x -= 360;               // a little before the first
      let i = 0;
      while (i < t.length - 2 && from(t[i + 1][0]) < x) i++;
      const a = t[i], b = t[i + 1], f = (x - from(a[0])) / (from(b[0]) - from(a[0]));
      s.ra = a[1] + nearer(b[1] - a[1]) * f;
      s.dec = a[2] + (b[2] - a[2]) * f;
    }
    // A direction on the sky (degrees) as east, north and up from here, at this moment.
    function horizon(raDeg, decDeg, out) {
      const ha = lst - raDeg * RAD, cd = Math.cos(decDeg * RAD), sd = Math.sin(decDeg * RAD), ch = Math.cos(ha);
      out[0] = -cd * Math.sin(ha);
      out[1] = sd * cosLat - cd * sinLat * ch;
      out[2] = sd * sinLat + cd * cosLat * ch;
      return out;
    }
    // How many meteors an hour one observer would see right now, of each shower and sporadic.
    function meteorRates() {
      if (sunLon === null) return 0;
      let total = 0;
      for (const s of showers) {
        const zhr = zhrOf(s, sunLon);
        s.hr = 0;
        if (!zhr) continue;
        radiantOf(s, sunLon);
        const up = horizon(s.ra, s.dec, s.at)[2];               // the sine of the radiant's altitude
        if (up > 0) total += (s.hr = zhr * up);
      }
      // The apex is on the ecliptic, 90 degrees west of the Sun.
      const l = (sunLon - 90) * RAD, y = Math.sin(l) * Math.cos(OBL), z = Math.sin(l) * Math.sin(OBL);
      horizon(Math.atan2(y, Math.cos(l)) / RAD, Math.asin(z) / RAD, apex);
      sporadicHr = SPORADIC[0] + (SPORADIC[1] - SPORADIC[0]) * (1 + apex[2]) / 2;
      return total + sporadicHr;
    }
    // How many of `mean` expected things actually happen (a Poisson draw).
    function howMany(mean) {
      let n = 0, p = Math.exp(-mean), sum = p;
      const u = rand();
      while (u > sum && n < 50) { n++; p *= mean / n; sum += p; }
      return n;
    }
    const meteors = [];
    // Start the meteors due in this frame: dt of animation is dt * TIME_LAPSE of sky.
    function spawnMeteors(now, dt) {
      if (!EARTH_KM || !SPORADIC_R || !skySr) return;
      const total = meteorRates();
      for (let n = howMany(total * (skySr / FIELD) * (dt * TIME_LAPSE / 3600000)); n > 0; n--) {
        let pick = rand() * total, source = null;
        for (const s of showers) if ((pick -= s.hr) < 0) { source = s; break; }
        launch(now, source);
      }
    }
    function launch(now, shower) {
      // Where: anywhere on screen, spread evenly over the sky (the projection stretches it toward the edges).
      const top = kit.scroll * SKY_K;
      let found = false;
      for (let tries = 0; tries < 12 && !found; tries++) {
        const rr = unproject(rand() * kit.w, top + rand() * kit.h, look);
        found = look[2] > 0.03 && rand() < 1 / ((1 + rr) * (1 + rr));
      }
      if (!found) return;
      // From where, how fast, and how bright.
      let from, speed, r;
      if (shower) {
        from = shower.at; speed = shower.speed; r = shower.r;
      } else {
        // As for a shower, more of them come in from radiants high up than low down.
        const alt = Math.asin(Math.sqrt(rand())), az = rand() * TAU;
        from = [Math.cos(alt) * Math.sin(az), Math.cos(alt) * Math.cos(az), Math.sin(alt)];
        speed = SLOWEST + (FASTEST - SLOWEST) * (1 + from[0] * apex[0] + from[1] * apex[1] + from[2] * apex[2]) / 2;
        r = SPORADIC_R;
      }
      // Its path, a straight line away from the radiant through the point 90 km up in that direction,
      // from 100 km down to 80 measured from the ground beneath it (the Earth curving away).
      const mid = (BEGIN_KM + END_KM) / 2, R = EARTH_KM, u = look[2];
      const dist = -R * u + Math.sqrt(R * R * u * u + 2 * R * mid + mid * mid);
      const M = [look[0] * dist, look[1] * dist, look[2] * dist];
      const sink = (from[0] * M[0] + from[1] * M[1] + from[2] * (M[2] + R)) / Math.hypot(M[0], M[1], M[2] + R);
      if (sink <= 0) return;                                   // the radiant is below its horizon there
      const half = Math.min(LONGEST_KM, (BEGIN_KM - END_KM) / sink) / 2;
      const fast = Math.max(0, Math.min(1, (speed - 25) / 40));
      meteors.push({
        start: now, speed, life: (2 * half / speed) * 1000,
        begin: [M[0] + from[0] * half, M[1] + from[1] * half, M[2] + from[2] * half],
        heading: [-from[0], -from[1], -from[2]],
        mag: LIMIT + Math.log(1 - rand()) / Math.log(r),
        // Picked by eye: fast meteors burn green-white (magnesium, oxygen), slow ones yellow (sodium, iron).
        head: [255 - 20 * fast, 238 + 17 * fast, 205 + 35 * fast],
      });
    }
    // A point on a meteor's path (km east, north and up from here) to the screen.
    const point = [0, 0, 0], ends = [{ x: 0, y: 0, alt: 0 }, { x: 0, y: 0, alt: 0 }];
    function onScreen(m, s, o) {
      const d = m.speed * Math.max(0, s);
      for (let k = 0; k < 3; k++) point[k] = m.begin[k] + m.heading[k] * d;
      const n = Math.hypot(point[0], point[1], point[2]), east = point[0] / n, north = point[1] / n, up = point[2] / n;
      const ahead = -north * ct + up * st, above = north * st + up * ct, k = scale / (1 + ahead);
      o.x = kit.w / 2 - east * k; o.y = kit.h / 2 - above * k; o.alt = Math.asin(up);
      return o;
    }
    function drawMeteors(now, top) {
      ctx.lineCap = 'round';
      for (const m of meteors) {
        const s = (now - m.start) / 1000, p = (now - m.start) / m.life;
        if (p < 0 || p >= 1) continue;
        const [head, tail] = ends;
        onScreen(m, s, head);
        onScreen(m, s - TRAIL_S, tail);
        const hx = head.x, hy = head.y - top, tx = tail.x, ty = tail.y - top;
        // It brightens as it goes deeper, flares late, then goes out. At its brightest it's as bright
        // as a star of the same magnitude is drawn (see the faint stars), dimmed the same way by the air.
        const flare = Math.sin(Math.PI * Math.pow(p, 1.4));
        const a = Math.min(1, 0.22 + 0.3 * (LIMIT - m.mag)) * flare * air(head.alt) * quiet(hx, hy, 0.15, 120);
        if (a < 0.01) continue;
        const grad = ctx.createLinearGradient(hx, hy, tx, ty);
        grad.addColorStop(0, rgba(m.head, a));
        grad.addColorStop(0.3, rgba([255, 220, 170], a * 0.6));
        grad.addColorStop(1, rgba([255, 170, 110], 0));
        ctx.strokeStyle = grad;
        ctx.lineWidth = Math.min(3, 0.7 + 0.35 * (LIMIT - m.mag));
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
        // A bright one's head glows like a bright star's.
        if (m.mag < 2) {
          const size = Math.min(40, 4 + (2 - m.mag) * 6);
          ctx.globalAlpha = a;
          ctx.drawImage(glows[2], hx - size / 2, hy - size / 2, size, size);
          ctx.globalAlpha = 1;
        }
      }
    }

    let satellite = null, nextSatellite = 20000;
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
    // A planet is a tiny disc rather than a point, so the air doesn't make it twinkle: it shines steadily.
    function drawPlanets(top) {
      for (const p of planets) {
        if (p.alt <= 0) continue;
        const x = p.x, y = p.y - top;
        if (x < -30 || x > kit.w + 30 || y < -30 || y > kit.h + 30) continue;
        const a = Math.min(1, p.base * air(p.alt) * quiet(x, y, 0.5, 100));
        if (a < 0.012) continue;
        ctx.globalAlpha = a;
        if (p.faint) {
          ctx.fillStyle = TINTS[p.tint];
          ctx.fillRect(x - p.size / 2, y - p.size / 2, p.size, p.size);
        } else {
          ctx.drawImage(glows[p.tint], x - p.size / 2, y - p.size / 2, p.size, p.size);
          if (p.spike) { const d = p.size * 1.5; ctx.drawImage(p.spike, x - d / 2, y - d / 2, d, d); }
        }
      }
      ctx.globalAlpha = 1;
    }
    function drawMoon(top) {
      if (!ephemeris || !face || moon.alt <= 0) return;
      const x = moon.x, y = moon.y - top, r = moon.r, reach = r * 7;
      if (x < -reach || x > kit.w + reach || y < -reach || y > kit.h + reach) return;
      const fade = quiet(x, y, 0.15, 140), clear = air(moon.alt);
      ctx.save();
      // Its light scattered by the air around it. A half-lit Moon gives far less than half a full
      // one's light, so the glow is strong only near full.
      const glow = 0.16 * Math.pow(moon.lit, 3) * fade * (0.5 + 0.5 * clear);
      if (glow > 0.003) {
        const halo = ctx.createRadialGradient(x, y, r * 0.8, x, y, reach);
        halo.addColorStop(0, `rgba(225,232,255,${glow})`);
        halo.addColorStop(0.3, `rgba(225,232,255,${glow * 0.25})`);
        halo.addColorStop(1, 'rgba(225,232,255,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(x - reach, y - reach, reach * 2, reach * 2);
      }
      // It's solid: it hides the stars behind it, the dark part as much as the lit.
      ctx.globalAlpha = fade;
      ctx.fillStyle = '#000';
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      const side = paintMoon(r, 1 - clear);
      ctx.globalAlpha = fade * (0.6 + 0.4 * clear);
      ctx.drawImage(moonCanvas, x - side / 2, y - side / 2, side, side);
      ctx.restore();
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
        document.documentElement.style.removeProperty('--ground');
      },
      update(now, dt) {
        if (clockStart === null) clockStart = now;
        clockNow = now;
        placeSky();
        spawnMeteors(now, dt);
        for (let i = meteors.length - 1; i >= 0; i--) if (now - meteors[i].start >= meteors[i].life) meteors.splice(i, 1);
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
        // The sky's own light, behind the Milky Way.
        if (glowLit) {
          ctx.globalCompositeOperation = 'destination-over';
          ctx.drawImage(glow, 0, -top, glow.width / GLOW_SCALE, glow.height / GLOW_SCALE);
        }
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
        drawPlanets(top);
        drawMoon(top);

        if (hovered && hovered.alt > 0) {
          const x = hovered.x, y = hovered.y - top;
          const r = hovered.moon ? hovered.r + 4 : Math.max(7, (hovered.kind ? hovered.size * 0.35 : hovered.size * 0.22)) + 3;
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
        drawMeteors(now, top);
      },
    };
  }

})();
