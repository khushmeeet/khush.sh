# Builds public/orbits.js: how the Moon and the planets move, for the `stars` background.
#
#   python3 tools/pack_orbits.py fetch orbit-data          # downloads the sources below into orbit-data/
#   python3 tools/pack_orbits.py build orbit-data public/orbits.js
#
# Sources (all numbers in orbits.js come from these; nothing is typed in by hand):
#   Planets     JPL Solar System Dynamics, "Approximate Positions of the Planets" (E. M. Standish): the
#               Keplerian elements and their rates in Table 1 (good for 1800-2050 AD), and the
#               obliquity of the ecliptic at J2000 used to turn them into right ascension and declination
#   Brightness  JPL Horizons: each planet's apparent magnitude every 3 days from 2000 to 2050 (Horizons
#               uses Mallama & Hilton 2018), brought to 1 au from the Sun and from us, to give how
#               bright each one is at each phase angle
#   Earth       JPL, "Planetary Physical Parameters": the Earth's equatorial radius, for the Moon's parallax
#   The Moon    ELP 2000-82B (Chapront-Touze & Chapront 1988; VizieR VI/79): the main problem's series
#               for longitude, latitude and distance, and the constants in its reference routine,
#               elp82b.f (the Moon's mean arguments, their fit to DE200, and the precession to J2000)
#   Its size    JPL, "Planetary Satellite Physical Parameters": the Moon's mean radius
#   Its face    NASA's CGI Moon Kit (Ernie Wright, NASA Scientific Visualization Studio, 2019): the
#               colour map from the Lunar Reconnaissance Orbiter Camera's wide-angle mosaic, 2K
#
# This is a separate file from sky.js so either can be rebuilt without the other.

import ast
import html
import json
import math
import os
import re
import struct
import sys
import statistics
import urllib.parse
import urllib.request

# The Moon's series keep terms at least this big: longitude and latitude in arcseconds, distance in
# kilometres. The terms left out add up to well under a pixel on screen (see the check in the README).
MOON_CUT = (6.0, 6.0, 10.0)
# Planets drawn are those that can get at least this bright (the faintest stars in the scene).
FAINT_LIMIT = 6.5
# Each planet's brightness by phase angle, at points this many degrees apart.
PHASE_STEP = 5
# Horizons' numbers for the planets in JPL's Table 1.
HORIZONS_IDS = {'Mercury': 199, 'Venus': 299, 'Mars': 499, 'Jupiter': 599, 'Saturn': 699, 'Uranus': 799, 'Neptune': 899}
# The Moon's face ships as FACE x FACE pixels of brightness, one character each, darkest first.
FACE = 96
FACE_LEVELS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$'

VIZIER = ['https://cdsarc.cds.unistra.fr/ftp/VI/79/',      # CDS, Strasbourg
          'http://vizier.nao.ac.jp/ftp/cats/VI/79/']       # its mirror in Tokyo
SOURCES = {
    'approx_pos.html': ['https://ssd.jpl.nasa.gov/planets/approx_pos.html'],
    'phys_par.html': ['https://ssd.jpl.nasa.gov/planets/phys_par.html'],
    'sat_phys_par.html': ['https://ssd.jpl.nasa.gov/sats/phys_par/'],
    'ELP1': [u + 'ELP1' for u in VIZIER],
    'ELP2': [u + 'ELP2' for u in VIZIER],
    'ELP3': [u + 'ELP3' for u in VIZIER],
    'elp82b.f.gz': [u + 'elp82b.f.gz' for u in VIZIER],
    'lroc_color_poles_2k.tif': ['https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_2k.tif'],
}
for _name, _id in HORIZONS_IDS.items():
    # Apparent magnitude (9), distance from the Sun (19) and from us (20), and the phase angle (24).
    SOURCES[f'horizons_{_name}.txt'] = ['https://ssd.jpl.nasa.gov/api/horizons.api?' + urllib.parse.urlencode({
        'format': 'text', 'COMMAND': f"'{_id}'", 'OBJ_DATA': "'NO'", 'MAKE_EPHEM': "'YES'",
        'EPHEM_TYPE': "'OBSERVER'", 'CENTER': "'500@399'", 'START_TIME': "'2000-01-01'",
        'STOP_TIME': "'2050-01-01'", 'STEP_SIZE': "'3d'", 'QUANTITIES': "'9,19,20,24'", 'CSV_FORMAT': "'YES'"})]
UA = {'User-Agent': 'pack-orbits/1.0 (static site data build)'}


def fetch(folder):
    os.makedirs(folder, exist_ok=True)
    for name, urls in SOURCES.items():
        for url in urls:
            print('fetching', name, 'from', url)
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
                    data = r.read()
            except OSError as err:
                print('  failed:', err)
                continue
            # A mirror that's down can answer with an error page instead of the file.
            if (name.startswith('ELP') and not data.startswith(b'MAIN PROBLEM')) or \
                    (name.endswith('.gz') and not data.startswith(b'\x1f\x8b')) or \
                    (name.endswith('.tif') and data[:4] not in (b'II*\0', b'MM\0*')) or \
                    (name.startswith('horizons_') and b'$$SOE' not in data):
                print('  not the file asked for (an error page?)')
                continue
            open(os.path.join(folder, name), 'wb').write(data)
            break
        else:
            sys.exit(f'could not fetch {name}')


# ---------------------------------------------------------------- planets

def planet_elements(folder):
    """Table 1 of JPL's approximate positions: per planet, six elements and six rates per century."""
    page = open(os.path.join(folder, 'approx_pos.html'), encoding='utf-8').read()
    table = re.search(r'<h4>Table 1</h4>.*?<pre>(.*?)</pre>', page, re.S).group(1)
    lines = [l for l in table.splitlines() if re.match(r'\s*-?\d|[A-Z]', l)]
    planets = {}
    for head, rates in zip(lines[::2], lines[1::2]):
        m = re.match(r'([A-Za-z ]+?)\s+(-?\d.*)$', head)
        if not m:
            continue
        planets[m.group(1).strip()] = [float(v) for v in m.group(2).split()] + [float(v) for v in rates.split()]
    obliquity = re.search(r'obliquity at J2000 is .*?\\varepsilon = (\d+)\\rlap \.\{\^\{\\rm o\} (\d+)\}', page)
    return planets, float(f'{obliquity.group(1)}.{obliquity.group(2)}')


def table_cells(row):
    """The text of each cell in an HTML table row, tags and entities stripped."""
    cells = re.split(r'<t[dh][^>]*>', row)[1:]
    return [html.unescape(re.sub(r'<[^>]*>', ' ', c)).split() for c in cells]


def first_number(words):
    for w in words:
        if re.fullmatch(r'[-+]?\d+(\.\d+)?', w):
            return float(w)
    return None


def equatorial_radii(folder):
    """Each planet's equatorial radius (km)."""
    page = open(os.path.join(folder, 'phys_par.html'), encoding='utf-8').read()
    table = re.search(r'<table class="planet-phys-par">(.*?)</table>', page, re.S).group(1)
    rows = re.findall(r'<tr>(.*?)</tr>', table, re.S)
    heads = [' '.join(c) for c in table_cells(rows[0])]
    r_col = next(i for i, h in enumerate(heads) if h.startswith('Equatorial Radius'))
    found = {}
    for row in rows[1:]:
        cells = table_cells(row)
        if cells and cells[0] and cells[0][0].isalpha() and len(cells) > r_col:
            found[cells[0][0]] = first_number(cells[r_col])
    return found


def phase_curve(folder, name):
    """How bright a planet is at each phase angle, 0, PHASE_STEP, 2 PHASE_STEP... degrees, as its
    magnitude at 1 au from both the Sun and us: Horizons' magnitudes less 5 log10(r delta), the median
    of those near each point. Points it never reaches take the nearest one's value; the curve stops
    at the widest phase the planet shows us."""
    text = open(os.path.join(folder, f'horizons_{name}.txt'), encoding='utf-8').read()
    head = text.split('$$SOE')[0].strip().splitlines()[-2]
    cols = [c.strip() for c in head.split(',')]
    at = {k: cols.index(k) for k in ('APmag', 'r', 'delta', 'S-T-O')}
    near = {}
    for line in text.split('$$SOE')[1].split('$$EOE')[0].strip().splitlines():
        f = [c.strip() for c in line.split(',')]
        try:
            mag, r, delta, phase = (float(f[at[k]]) for k in ('APmag', 'r', 'delta', 'S-T-O'))
        except ValueError:
            continue                                        # "n.a.": outside the range its formula covers
        near.setdefault(round(phase / PHASE_STEP), []).append(mag - 5 * math.log10(r * delta))
    last = max(near)
    curve = [round(statistics.median(near[k]), 2) if k in near else None for k in range(last + 1)]
    for k in range(len(curve)):
        if curve[k] is None:
            curve[k] = curve[min((j for j in range(len(curve)) if curve[j] is not None), key=lambda j: abs(j - k))]
    return curve


def moon_radius(folder):
    page = open(os.path.join(folder, 'sat_phys_par.html'), encoding='utf-8').read()
    table = re.search(r'<table id="sat_phys_par".*?</table>', page, re.S).group(0)
    head = re.search(r'<thead>\s*<tr>(.*?)</tr>', table, re.S).group(1)
    col = 0
    for th in re.findall(r'<th([^>]*)>(.*?)</th>', head, re.S):
        if 'Mean Radius' in html.unescape(th[1]):
            break
        span = re.search(r'colspan="(\d+)"', th[0])
        col += int(span.group(1)) if span else 1
    row = re.search(r'<td[^>]*>\s*Moon\s*</td>(.*?)</tr>', table, re.S).group(0)
    return first_number(table_cells('<tr>' + row)[col - 1])


# ---------------------------------------------------------------- the Moon

def fortran_constants(path):
    """The assignments in elp82b.f's setup block, evaluated in order. Only numbers, names already
    assigned, and + - * / are allowed, so nothing in the file can run as code."""
    import gzip
    text = gzip.open(path, 'rt', encoding='latin-1').read()
    block = text.split('if (ideb.eq.0) then', 1)[1].split('ideb=1', 1)[0]
    env = {}

    def value(node):
        if isinstance(node, ast.Expression):
            return value(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return float(node.value)
        if isinstance(node, ast.Name):
            return env[node.id]
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
            v = value(node.operand)
            return -v if isinstance(node.op, ast.USub) else v
        if isinstance(node, ast.BinOp):
            a, b = value(node.left), value(node.right)
            if isinstance(node.op, ast.Add):
                return a + b
            if isinstance(node.op, ast.Sub):
                return a - b
            if isinstance(node.op, ast.Mult):
                return a * b
            if isinstance(node.op, ast.Div):
                return a / b
        raise ValueError('unexpected expression')

    def name(text):
        return re.sub(r'(\w+)\((\d+)(?:,(\d+))?\)', lambda m: '_'.join(filter(None, m.groups())), text)

    for line in block.splitlines():
        if not line.startswith(' ') or line.lstrip().startswith(('*', 'do', 'enddo')):
            continue
        m = re.fullmatch(r'\s+([a-z]\w*(?:\(\d+(?:,\d+)?\))?)=(.+)', line.rstrip())
        if not m:
            continue
        expr = re.sub(r'(\d\.?\d*)d([+-]?\d+)', r'\1e\2', m.group(2).replace(' ', ''))
        try:
            env[name(m.group(1))] = value(ast.parse(name(expr), mode='eval'))
        except (KeyError, ValueError, SyntaxError):
            pass                                            # loop bodies (they use the loop variable)
    return env


def elp_series(folder, number, k):
    """One main-problem file, as (D, l', l, F multipliers, amplitude) with the amplitude corrected the
    way elp82b.f does (fitting the theory to DE200), keeping the terms of at least MOON_CUT."""
    rows = []
    lines = open(os.path.join(folder, f'ELP{number}'), encoding='latin-1').read().splitlines()[1:]
    for line in lines:
        if not line.strip():
            continue
        ilu = [int(line[i:i + 3]) for i in (0, 3, 6, 9)]
        coef = [float(line[14:27])] + [float(line[29 + 12 * j:39 + 12 * j]) for j in range(6)]
        if number == 3:
            coef[0] -= 2 * coef[0] * k['delnu'] / 3
        tgv = coef[1] + k['dtasm'] * coef[5]
        x = coef[0] + tgv * (k['delnp'] - k['am'] * k['delnu']) + coef[2] * k['delg'] + coef[3] * k['dele'] \
            + coef[4] * k['delep']
        if abs(x) >= MOON_CUT[number - 1]:
            rows.append((ilu, round(x, 3)))
    return rows


def moon(folder):
    k = fortran_constants(os.path.join(folder, 'elp82b.f.gz'))
    for need in ('w_1_1', 'w_3_5', 'eart_5', 'peri_5', 'delnu', 'delep', 'am', 'dtasm', 'p5', 'q5', 'rad', 'cpi'):
        if need not in k:
            sys.exit(f'elp82b.f: no value for {need}')
    deg = 180 / k['cpi']
    poly = lambda name: [k[f'{name}_{i}'] for i in range(1, 6)]
    w1, w2, w3, eart, peri = poly('w_1'), poly('w_2'), poly('w_3'), poly('eart'), poly('peri')
    # Delaunay's arguments, as elp82b.f builds them: D, l' (the Sun's mean anomaly), l (the Moon's), F.
    D = [a - b for a, b in zip(w1, eart)]
    D[0] += k['cpi']
    args = [w1, D, [a - b for a, b in zip(eart, peri)], [a - b for a, b in zip(w1, w2)], [a - b for a, b in zip(w1, w3)]]
    series = [elp_series(folder, n, k) for n in (1, 2, 3)]
    return dict(
        args=[[float(f'{c * deg:.12g}') for c in a] for a in args],
        p=[float(f"{k[f'p{i}']:.10g}") for i in range(1, 6)],
        q=[float(f"{k[f'q{i}']:.10g}") for i in range(1, 6)],
        scale=k['a0'] / k['ath'],
        series=[[v for ilu, x in s for v in (*ilu, x)] for s in series],
    )


def lzw_decode(data):
    """TIFF's LZW: codes 9 to 12 bits wide, most significant bit first, widening one code early."""
    out, table, width, prev = bytearray(), [bytes([i]) for i in range(256)] + [b'', b''], 9, None
    buf = bits = at = 0
    while True:
        while bits < width:
            if at >= len(data):
                return bytes(out)
            buf, bits, at = (buf << 8) | data[at], bits + 8, at + 1
        bits -= width
        code = buf >> bits
        buf &= (1 << bits) - 1
        if code == 256:                                     # clear
            del table[258:]
            width, prev = 9, None
            continue
        if code == 257:                                     # end of information
            return bytes(out)
        if prev is None:
            entry = table[code]
        else:
            entry = table[code] if code < len(table) else prev + prev[:1]
            table.append(prev + entry[:1])
            if len(table) >= (1 << width) - 1 and width < 12:
                width += 1
        out += entry
        prev = entry


def read_tiff_rgb(path):
    """An 8-bit RGB TIFF (uncompressed or LZW, with or without horizontal differencing) as rows of bytes."""
    data = open(path, 'rb').read()
    order = '<' if data[:2] == b'II' else '>'
    (ifd,) = struct.unpack(order + 'I', data[4:8])
    (count,) = struct.unpack(order + 'H', data[ifd:ifd + 2])
    tags = {}
    for i in range(count):
        tag, kind, n, value = struct.unpack(order + 'HHII', data[ifd + 2 + i * 12:ifd + 14 + i * 12])
        size = {3: 2, 4: 4}.get(kind, 1)
        fmt = order + ('H' if kind == 3 else 'I') * n
        raw = data[ifd + 10 + i * 12:ifd + 10 + i * 12 + size * n] if size * n <= 4 else data[value:value + size * n]
        tags[tag] = struct.unpack(fmt, raw) if kind in (3, 4) else raw
    width, height = tags[256][0], tags[257][0]
    compression, predictor = tags.get(259, (1,))[0], tags.get(317, (1,))[0]
    if tags[258] != (8, 8, 8) or tags.get(277, (1,))[0] != 3 or compression not in (1, 5) or tags.get(284, (1,))[0] != 1:
        sys.exit(f'{path}: not an 8-bit RGB TIFF this script can read')
    pixels = bytearray()
    for offset, length in zip(tags[273], tags[279]):
        strip = data[offset:offset + length]
        pixels += lzw_decode(strip) if compression == 5 else strip
    stride = width * 3
    rows = [pixels[r * stride:(r + 1) * stride] for r in range(height)]
    if predictor == 2:                                      # each sample stored as the change from the one before
        for row in rows:
            for k in range(3, stride):
                row[k] = (row[k] + row[k - 3]) & 0xFF
    return width, height, rows


def moon_face(folder):
    """The Moon's near side as we see it, north up and east to the right, FACE pixels across: the
    brightness of NASA's LROC colour map, looked up for each pixel through an orthographic view."""
    width, height, rows = read_tiff_rgb(os.path.join(folder, 'lroc_color_poles_2k.tif'))

    def brightness(lat, lon):
        x = int(((lon + 180) / 360) * width) % width        # the map runs from longitude -180 to 180
        y = min(height - 1, int(((90 - lat) / 180) * height))
        r, g, b = rows[y][x * 3:x * 3 + 3]
        return 0.2126 * r + 0.7152 * g + 0.0722 * b

    cells, sub = [], 4                                      # 4x4 samples per pixel
    for j in range(FACE):
        for i in range(FACE):
            total = n = 0
            for sj in range(sub):
                for si in range(sub):
                    u = ((i + (si + 0.5) / sub) / FACE) * 2 - 1
                    v = ((j + (sj + 0.5) / sub) / FACE) * 2 - 1
                    rr = u * u + v * v
                    if rr > 1:                                # just past the edge: take the edge's value
                        if rr > (1 + 3 / FACE) ** 2:
                            continue
                        u, v, rr = u / math.sqrt(rr), v / math.sqrt(rr), 1
                    lat = math.degrees(math.asin(max(-1, min(1, -v))))
                    lon = math.degrees(math.atan2(u, math.sqrt(max(0, 1 - rr))))
                    total += brightness(lat, lon)
                    n += 1
            cells.append(total / n if n else None)
    inside = sorted(c for c in cells if c is not None)
    top = inside[int(len(inside) * 0.995)]                  # the brightest half percent, rays and all, as white
    return ''.join('.' if c is None else FACE_LEVELS[min(len(FACE_LEVELS) - 1, int(c / top * (len(FACE_LEVELS) - 1) + 0.5))]
                   for c in cells)


# ---------------------------------------------------------------- output

def build(folder, out):
    elements, obliquity = planet_elements(folder)
    earth_radius = equatorial_radii(folder)['Earth']
    planets = []
    earth = elements['EM Bary']
    for name, el in elements.items():
        if name == 'EM Bary':
            continue
        curve = phase_curve(folder, name)
        # An outer planet is brightest at opposition near its perihelion. (Mercury and Venus are
        # always far brighter than the limit.)
        r = el[0] * (1 - el[1])
        if r > earth[0]:
            best = curve[0] + 5 * math.log10(r * (r - earth[0]))
            if best > FAINT_LIMIT:
                print(f'leaving out {name}: never brighter than magnitude {best:.1f}')
                continue
        planets.append([name, curve] + el)
    m = moon(folder)
    face = moon_face(folder)
    radius = moon_radius(folder)

    with open(out, 'w', encoding='utf-8') as f:
        f.write('// The Moon and the planets for the stars background. Built by tools/pack_orbits.py from\n')
        f.write('// JPL\'s approximate planetary elements, JPL Horizons, the ELP 2000-82B lunar theory\n')
        f.write('// (Chapront-Touze & Chapront, VizieR VI/79) and NASA\'s LRO map of the Moon; edit that, not this.\n')
        f.write('// SKY_PLANETS: name; its magnitude at 1 au from the Sun and from us, by phase angle, every\n')
        f.write(f'// SKY_PHASE_STEP degrees from 0 (from JPL Horizons); then the Keplerian elements a (au), e, I, L,\n')
        f.write('// longitude of perihelion, longitude of the node (degrees), and the same six rates per Julian\n')
        f.write('// century: mean ecliptic and equinox of J2000, good for 1800-2050 (JPL Table 1). "Earth" is the\n')
        f.write('// Earth-Moon barycentre.\n')
        f.write('window.SKY_PLANETS = [\n')
        for p in planets:
            f.write('  ' + json.dumps(p) + ',\n')
        f.write('  ' + json.dumps(['Earth', None] + earth) + ',\n')
        f.write('];\n')
        f.write(f'window.SKY_PHASE_STEP = {PHASE_STEP};\n')
        f.write(f'window.SKY_OBLIQUITY = {obliquity};       // degrees, at J2000\n')
        f.write('// SKY_MOON: ELP 2000-82B\'s main problem, cut to terms of at least '
                f'{MOON_CUT[0]:g}" in longitude and latitude and {MOON_CUT[2]:g} km in distance.\n')
        f.write('// args: the mean longitude W1 and Delaunay\'s D, l\', l, F, as polynomials in Julian centuries\n')
        f.write('// from J2000 (degrees). p, q: the precession of the ecliptic to J2000 (Laskar). series: for\n')
        f.write('// longitude and latitude (arcseconds, sine) and distance (km, cosine), five numbers a term:\n')
        f.write('// the multiples of D, l\', l, F, and the amplitude. radius: the Moon\'s mean radius, and earth:\n')
        f.write('// the Earth\'s equatorial radius (km).\n')
        f.write('window.SKY_MOON = {\n')
        f.write(f'  radius: {radius}, earth: {earth_radius}, scale: {m["scale"]!r},\n')
        f.write(f'  args: {json.dumps(m["args"])},\n')
        f.write(f'  p: {json.dumps(m["p"])},\n  q: {json.dumps(m["q"])},\n')
        f.write('  series: [\n')
        for s in m['series']:
            f.write('    ' + json.dumps(s, separators=(',', ':')) + ',\n')
        f.write('  ],\n};\n')
        f.write(f'// SKY_MOON_FACE: the near side, north up and east right, as {FACE} rows of {FACE} pixels: each\n')
        f.write(f'// one of {len(FACE_LEVELS)} levels of brightness, darkest first ("." is off the disc), from NASA\'s CGI\n')
        f.write('// Moon Kit colour map (LRO Camera wide-angle mosaic).\n')
        f.write(f'window.SKY_MOON_FACE = [\n')
        for r in range(FACE):
            f.write(f"  '{face[r * FACE:(r + 1) * FACE]}',\n")
        f.write('];\n')
    counts = [len(s) // 5 for s in m['series']]
    print(f'{len(planets)} planets ({", ".join(p[0] for p in planets)}); obliquity {obliquity}; '
          f'Moon series {counts[0]} + {counts[1]} + {counts[2]} terms; Moon face {FACE}x{FACE}; '
          f'Moon radius {radius} km, Earth {earth_radius} km.')


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == 'fetch':
        fetch(sys.argv[2])
    elif len(sys.argv) == 4 and sys.argv[1] == 'build':
        build(sys.argv[2], sys.argv[3])
    else:
        sys.exit('usage: pack_orbits.py fetch DIR | build DIR OUT')
