# Builds public/meteors.js: the meteor showers for the `stars` background.
#
#   python3 tools/pack_meteors.py fetch meteor-data          # downloads the sources below into meteor-data/
#   python3 tools/pack_meteors.py build meteor-data public/meteors.js
#
# Sources (all numbers in meteors.js come from these; nothing is typed in by hand):
#   Showers     The International Meteor Organization's Meteor Shower Calendar (J. Rendtel, ed.), the
#               edition for CALENDAR_YEAR: Table 5, the Working List of Visual Meteor Showers (when each
#               is active, the solar longitude of its peak, its radiant, speed, population index r and
#               peak ZHR), and Table 6, where each radiant is every five days through the year
#   Profiles    Jenniskens P., 1994, "Meteor stream activity I. The annual streams", A&A 287, 990
#               (VizieR J/A+A/287/990): how fast each shower's rate climbs to its peak and falls away,
#               as ZHR = ZHRmax 10^(-B |solar longitude - peak|), with a sharp peak on a broad base for
#               the Quadrantids, Perseids, Leonids, Geminids and Ursids; and the population index of
#               sporadic meteors
#   Dates       JPL Solar System Dynamics, "Approximate Positions of the Planets" (the same table
#               pack_orbits.py uses): the Earth's orbit, to turn the calendar's dates into the Sun's
#               longitude, which is what showers keep to from year to year
#
# The calendar is a PDF, read here with a small reader of its own (below), since the rest of the
# site's builds use nothing outside Python's standard library.

import datetime
import json
import math
import os
import re
import statistics
import sys
import urllib.request
import zlib

import pack_orbits                                      # for JPL's table of the Earth's orbit

CALENDAR_YEAR = 2027
VIZIER = ['https://cdsarc.cds.unistra.fr/ftp/J/A+A/287/990/',      # CDS, Strasbourg
          'http://vizier.nao.ac.jp/ftp/cats/J/A+A/287/990/']       # its mirror in Tokyo
SOURCES = {
    f'cal{CALENDAR_YEAR}.pdf': [f'https://www.imo.net/files/data/calendar/cal{CALENDAR_YEAR}.pdf',
                                f'https://www.imo.net/files/meteor-shower/cal{CALENDAR_YEAR}.pdf'],
    'ReadMe': [u + 'ReadMe' for u in VIZIER],
    'table3a': [u + 'table3a' for u in VIZIER],
    'table3b': [u + 'table3b' for u in VIZIER],
    'table3c': [u + 'table3c' for u in VIZIER],
    'approx_pos.html': ['https://ssd.jpl.nasa.gov/planets/approx_pos.html'],
}
UA = {'User-Agent': 'pack-meteors/1.0 (static site data build)'}

# Which of Jenniskens' streams is which of the calendar's showers (his codes are his own). Each pairing
# is checked when building: his radiant, moved along its drift to the calendar's peak, has to land
# within 10 degrees of the calendar's radiant. His "Tau" is the Taurids as one stream, so both branches
# take its profile. His Aurigids are left out: his radiant is 15 degrees from today's.
JENNISKENS = {
    'QUA': 'Boo', 'ACE': 'aCe', 'LYR': 'Lyr', 'ETA': 'eAq', 'ARI': 'Ari', 'CAP': 'Cap', 'SDA': 'dAZ',
    'PER': 'Per', 'KCG': 'kCy', 'EGE': 'Eps', 'ORI': 'Ori', 'LMI': 'LMi', 'STA': 'Tau', 'NTA': 'Tau',
    'LEO': 'Leo', 'PUP': 'PuV', 'PHO': 'Pho', 'MON': 'Mon', 'HYD': 'sHy', 'GEM': 'Gem', 'URS': 'Urs',
}
MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']


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
            # A server that's down can answer with an error page instead of the file.
            if (name.endswith('.pdf') and not data.startswith(b'%PDF')) or \
                    (name == 'ReadMe' and b'Jenniskens' not in data) or \
                    (name.startswith('table3') and data.lstrip()[:1] == b'<') or \
                    (name.endswith('.html') and b'Table 1' not in data):
                print('  not the file asked for (an error page?)')
                continue
            open(os.path.join(folder, name), 'wb').write(data)
            break
        else:
            sys.exit(f'could not fetch {name}')


# ---------------------------------------------------------------- reading the calendar

# What each glyph a TeX font names stands for, where it isn't the letter or digit itself.
GLYPHS = {
    'minus': '-', 'hyphen': '-', 'endash': '–', 'emdash': '—', 'circledot': '⊙', 'openbullet': '◦',
    'degree': '°', 'plusminus': '±', 'approxequal': '≈', 'lessequal': '≤', 'greater': '>', 'less': '<',
    'multiply': '×', 'arrowright': '→', 'quoteright': '’', 'quoteleft': '‘', 'quotedblleft': '“',
    'quotedblright': '”', 'fi': 'fi', 'fl': 'fl', 'ff': 'ff', 'ffi': 'ffi', 'ffl': 'ffl', 'infinity': '∞',
    'space': ' ', 'comma': ',', 'period': '.', 'colon': ':', 'semicolon': ';', 'slash': '/',
    'parenleft': '(', 'parenright': ')', 'bracketleft': '[', 'bracketright': ']', 'equal': '=', 'plus': '+',
    'exclam': '!', 'question': '?', 'ampersand': '&', 'at': '@', 'asterisk': '*', 'percent': '%',
    'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5', 'six': '6', 'seven': '7',
    'eight': '8', 'nine': '9', 'alpha': 'α', 'beta': 'β', 'gamma': 'γ', 'delta': 'δ', 'epsilon': 'ε',
    'epsilon1': 'ε', 'zeta': 'ζ', 'eta': 'η', 'theta': 'θ', 'iota': 'ι', 'kappa': 'κ', 'lambda': 'λ',
    'mu': 'μ', 'nu': 'ν', 'xi': 'ξ', 'pi': 'π', 'rho': 'ρ', 'sigma': 'σ', 'tau': 'τ', 'upsilon': 'υ',
    'phi': 'φ', 'phi1': 'φ', 'chi': 'χ', 'psi': 'ψ', 'omega': 'ω',
}
STRING = rb'\((?:\\.|[^\\()]|\((?:\\.|[^\\()])*\))*\)'
TOKEN = re.compile(rb'\s*(?:(' + STRING + rb')|(<[0-9A-Fa-f\s]*>)|(\[)|(\])|(/[^\s/\[\]()<>]+)'
                   rb'|([-+]?(?:\d+\.?\d*|\.\d+))|([A-Za-z\'"*]+)|(<<|>>|[{}]))', re.S)


def literal(s):
    """The bytes of a PDF (string), escapes undone."""
    out, i, s = bytearray(), 0, s[1:-1]
    while i < len(s):
        if s[i] != 0x5C:
            out.append(s[i])
            i += 1
            continue
        m = re.match(rb'[0-7]{1,3}', s[i + 1:i + 4])
        if m:
            out.append(int(m.group(0), 8) & 255)
            i += 1 + len(m.group(0))
            continue
        nxt = s[i + 1:i + 2]
        out += {b'n': b'\n', b'r': b'\r', b't': b'\t', b'b': b'\b', b'f': b'\f', b'\n': b''}.get(nxt, nxt)
        i += 2
    return bytes(out)


class Pdf:
    """Just enough of a PDF reader for the IMO calendar (TeX, put through Ghostscript): its objects,
    including any packed into object streams, Flate-compressed streams, the pages in order, and the
    text each page shows with where it sits."""

    def __init__(self, data):
        self.data = data
        self.objs = {}
        starts = [(m.start(1), int(m.group(1)), m.end()) for m in re.finditer(rb'(?:^|[\r\n])(\d+) 0 obj', data)]
        for k, (_, num, body) in enumerate(starts):
            end = starts[k + 1][0] if k + 1 < len(starts) else len(data)
            self.objs[num] = data[body:end]
        for num in list(self.objs):
            head = self.dict_of(num)
            if re.search(rb'/Type\s*/ObjStm', head):
                packed = self.stream(num)
                first = int(re.search(rb'/First\s+(\d+)', head).group(1))
                pairs = [int(v) for v in packed[:first].split()]
                for i in range(0, len(pairs), 2):
                    end = pairs[i + 3] if i + 3 < len(pairs) else len(packed) - first
                    self.objs.setdefault(pairs[i], packed[first + pairs[i + 1]:first + end])

    def dict_of(self, num):
        body = self.objs[num]
        return body.split(b'stream', 1)[0] if b'stream' in body else body

    def stream(self, num):
        body = self.objs[num]
        head, raw = body.split(b'stream', 1)
        raw = raw[2:] if raw.startswith(b'\r\n') else raw[1:]
        raw = raw[:raw.rfind(b'endstream')]
        return zlib.decompressobj().decompress(raw) if b'FlateDecode' in head else raw

    def value(self, text, key):
        """A key's value in a dictionary's text: the text of the object it refers to, or of the
        dictionary or array written in place."""
        m = re.search(rb'/' + key + rb'\s*(\d+)\s+0\s+R', text)
        if m:
            return self.dict_of(int(m.group(1)))
        m = re.search(rb'/' + key + rb'\s*(<<|\[)', text)
        if not m:
            return None
        depth, i, close = 0, m.start(1), b'>>' if m.group(1) == b'<<' else b']'
        while i < len(text):
            if text.startswith(m.group(1), i):
                depth += 1
                i += len(m.group(1))
            elif text.startswith(close, i):
                depth -= 1
                i += len(close)
                if depth == 0:
                    return text[m.start(1):i]
            else:
                i += 1
        return None

    def font(self, num):
        body = self.dict_of(num)
        first = int(re.search(rb'/FirstChar\s*(\d+)', body).group(1))
        widths = [float(w) for w in self.value(body, rb'Widths').strip(b'[]').split()]
        codes = {c: chr(c) for c in range(32, 127)}
        enc = self.value(body, rb'Encoding')
        diffs = enc and re.search(rb'/Differences\s*\[(.*?)\]', enc, re.S)
        if diffs:
            code = 0
            for tok in re.findall(rb'\d+|/[^\s/\[\]]+', diffs.group(1)):
                if tok[:1] == b'/':
                    name = tok[1:].decode()
                    codes[code] = GLYPHS.get(name, name if len(name) == 1 else '?')
                    code += 1
                else:
                    code = int(tok)
        return {'codes': codes, 'widths': {first + i: w / 1000 for i, w in enumerate(widths)}}

    def pages(self):
        catalog = next(n for n in self.objs if re.search(rb'/Type\s*/Catalog', self.dict_of(n)))
        out = []

        def walk(num):
            body = self.dict_of(num)
            if re.search(rb'/Type\s*/Pages', body):
                for kid in re.findall(rb'(\d+)\s+0\s+R', self.value(body, rb'Kids')):
                    walk(int(kid))
            else:
                out.append(num)
        walk(int(re.search(rb'/Pages\s+(\d+)\s+0\s+R', self.dict_of(catalog)).group(1)))
        return out

    def runs(self, page):
        """Each stretch of text the page shows: (x, y, size, text, x where it ends), in points."""
        body = self.dict_of(page)
        fonts_dict = self.value(self.value(body, rb'Resources') or b'', rb'Font') or b''
        fonts = {n.decode(): self.font(int(r)) for n, r in re.findall(rb'/([^\s/]+)\s*(\d+)\s+0\s+R', fonts_dict)}
        contents = self.value(body, rb'Contents')
        refs = re.findall(rb'(\d+)\s+0\s+R', contents) if contents and contents.startswith(b'[') else \
            [re.search(rb'/Contents\s*(\d+)\s+0\s+R', body).group(1)]
        content = b'\n'.join(self.stream(int(r)) for r in refs)

        def mul(a, b):
            return [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2],
                    a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]]
        ident = [1, 0, 0, 1, 0, 0]
        ctm, saved, tm, tlm = ident, [], ident, ident
        font, size, tc, tw, th, tl = None, 1, 0, 0, 1, 0
        out, stack, array = [], [], None

        def show(items):
            nonlocal tm
            for item in items:
                if not isinstance(item, bytes):
                    tm = mul([1, 0, 0, 1, -item / 1000 * size * th, 0], tm)
                    continue
                at = mul(tm, ctm)
                text = ''
                for b in item:
                    text += font['codes'].get(b, '?') if font else chr(b)
                    advance = ((font['widths'].get(b, 0) if font else 0.5) * size + tc + (tw if b == 32 else 0)) * th
                    tm = mul([1, 0, 0, 1, advance, 0], tm)
                out.append((at[4], at[5], size * math.hypot(at[2], at[3]), text, mul(tm, ctm)[4]))

        for m in TOKEN.finditer(content):
            lit, hexes, opening, closing, name, num, op, _ = m.groups()
            target = array if array is not None else stack
            if lit is not None:
                target.append(literal(lit))
            elif hexes is not None:
                h = re.sub(rb'\s', b'', hexes[1:-1])
                target.append(bytes.fromhex((h + b'0' * (len(h) % 2)).decode()))
            elif opening:
                array = []
            elif closing:
                stack.append(array)
                array = None
            elif name is not None:
                target.append(name[1:].decode())
            elif num is not None:
                target.append(float(num))
            elif op is not None:
                op = op.decode()
                a = stack
                if op == 'BT':
                    tm = tlm = ident
                elif op == 'Tf':
                    font, size = fonts.get(a[-2]), a[-1]
                elif op in ('Td', 'TD'):
                    if op == 'TD':
                        tl = -a[-1]
                    tm = tlm = mul([1, 0, 0, 1, a[-2], a[-1]], tlm)
                elif op == 'Tm':
                    tm = tlm = [float(v) for v in a[-6:]]
                elif op == 'T*':
                    tm = tlm = mul([1, 0, 0, 1, 0, -tl], tlm)
                elif op == 'TL':
                    tl = a[-1]
                elif op == 'Tc':
                    tc = a[-1]
                elif op == 'Tw':
                    tw = a[-1]
                elif op == 'Tz':
                    th = a[-1] / 100
                elif op == 'Tj':
                    show([a[-1]])
                elif op == 'TJ':
                    show(a[-1])
                elif op in ("'", '"'):
                    tm = tlm = mul([1, 0, 0, 1, 0, -tl], tlm)
                    show([a[-1]])
                elif op == 'cm':
                    ctm = mul([float(v) for v in a[-6:]], ctm)
                elif op == 'q':
                    saved.append(ctm)
                elif op == 'Q' and saved:
                    ctm = saved.pop()
                stack = []
        return out


def words(runs):
    """The page's text as lines (top first) of words: (x0, x1, text), each word being runs that touch."""
    lines = []
    for run in sorted(runs, key=lambda r: (-r[1], r[0])):
        if lines and abs(lines[-1][0] - run[1]) <= 1.5:
            lines[-1][1].append(run)
        else:
            lines.append([run[1], [run]])
    out = []
    for y, line in lines:
        line.sort(key=lambda r: r[0])
        merged = []
        for x, _, size, text, x1 in line:
            if merged and x - merged[-1][1] < 0.15 * size:
                merged[-1] = (merged[-1][0], x1, merged[-1][2] + text)
            else:
                merged.append((x, x1, text))
        out.append((y, [w for w in merged if w[2].strip()]))
    return out


def page_text(lines):
    return '\n'.join(' '.join(w[2] for w in ws) for _, ws in lines)


def working_list(lines):
    """Table 5: each shower as a dict."""
    # The column headings sit on three lines around the one with "Shower" and "Activity" (the
    # caption above uses some of the same words).
    y0 = next(y for y, ws in lines if {'Shower', 'Activity'} <= {t for _, _, t in ws})
    head = {}
    for _, ws in (line for line in lines if abs(line[0] - y0) <= 12):
        for x0, x1, t in ws:
            for key, label in (('activity', 'Activity'), ('date', 'Date'), ('lam', 'λ'), ('ra', 'α'),
                               ('dec', 'δ'), ('v', 'km/s'), ('r', 'r'), ('zhr', 'ZHR')):
                if t == label and key not in head:
                    head[key] = (x0 + x1) / 2
        if len(head) == 8:
            break
    order = sorted(head, key=head.get)
    bounds = [(order[i], (head[order[i - 1]] + head[order[i]]) / 2 if i else -1e9) for i in range(len(order))]

    def column(x):
        return [k for k, b in bounds if x >= b][-1]
    showers = []
    row = re.compile(r'^(?P<name>.+?)\s*\(\s*(?:\d+\s*)?(?P<code>[A-Z]{3})\s*\)\s*(?P<m1>[A-Z][a-z]{2})\s*(?P<d1>\d+)'
                     r'\s*[–-]\s*(?P<m2>[A-Z][a-z]{2})\s*(?P<d2>\d+)$')
    for _, ws in lines:
        cells = {}
        for x0, x1, t in ws:
            key = column((x0 + x1) / 2)
            cells[key] = cells.get(key, []) + [t]
        left = ' '.join(cells.get('activity', []))
        m = row.match(left)
        if not m:
            continue
        joined = {k: ''.join(v) for k, v in cells.items()}
        peak = re.fullmatch(r'\(?([A-Z][a-z]{2})(\d+)\)?', joined.get('date', ''))
        lam = re.fullmatch(r'\(?(\d+(?:\.\d+)?)\)?', joined.get('lam', ''))
        number = lambda k: float(joined[k].replace('–', '-')) if re.fullmatch(r'[-+–]?\d+(\.\d+)?', joined.get(k, '')) else None
        name = re.sub(r'\s+', ' ', m.group('name')).replace(' -', '-').replace('- ', '-')
        # A ZHR written "110+" is at least that: taken as written.
        zhr = re.fullmatch(r'(\d+)\+?', joined.get('zhr', ''))
        showers.append(dict(
            code=m.group('code'), name=name,
            start=(m.group('m1'), int(m.group('d1'))), end=(m.group('m2'), int(m.group('d2'))),
            peak=(peak.group(1), int(peak.group(2))) if peak else None,
            lam=float(lam.group(1)) if lam else None,
            ra=number('ra'), dec=number('dec'), v=number('v'), r=number('r'),
            zhr=float(zhr.group(1)) if zhr else None, variable=joined.get('zhr') == 'Var'))
    return showers


def radiant_table(lines):
    """Table 6: each shower's radiant every five days, as {code: [(month, day, ra, dec), ...]} in the
    order the table runs. Its columns are shared: a shower's code heads the run of positions below it,
    or, at the foot of the page, sits under it."""
    marks = sorted({round(x0, 1) for _, ws in lines for x0, x1, t in ws if t == '◦'})
    # The degree marks sit just right of each right-aligned number: α, δ, α, δ, ... across the page.
    slots = [(marks[i], marks[i + 1]) for i in range(0, len(marks) - 1, 2)]

    def slot_of(x0, x1, label):
        for k, (a, d) in enumerate(slots):
            if label and a - 20 <= (x0 + x1) / 2 <= d + 6:
                return k, None
            if not label and abs(x1 - a) < 2.5:
                return k, 'ra'
            if not label and abs(x1 - d) < 2.5:
                return k, 'dec'
        return None, None
    rows = []                                    # each: (date or None, {slot: [ra, dec]}, {slot: code})
    for _, ws in lines:
        texts = [t for _, _, t in ws if t != '◦']
        if not texts:
            continue
        date = re.fullmatch(r'([A-Z][a-z]{2})', texts[0]) and len(texts) > 1 and re.fullmatch(r'\d+', texts[1])
        values, codes = {}, {}
        for x0, x1, t in ws[2:] if date else ws:
            if re.fullmatch(r'[A-Z]{3}', t):
                k, _ = slot_of(x0, x1, True)
                if k is not None:
                    codes[k] = t
            elif re.fullmatch(r'[-+–]?\d+', t):
                k, which = slot_of(x0, x1, False)
                if k is not None:
                    values.setdefault(k, [None, None])[0 if which == 'ra' else 1] = float(t.replace('–', '-'))
        if date or codes:
            rows.append(((texts[0], int(texts[1])) if date else None, values, codes))
    data_rows = [i for i, r in enumerate(rows) if r[0]]
    tracks = {}
    for k in range(len(slots)):
        run = []

        def close(run):
            if not run:
                return
            first, last = run[0][0], run[-1][0]
            above = rows[first - 1][2].get(k) if first > 0 else None
            below = rows[last + 1][2].get(k) if last + 1 < len(rows) else None
            code = above or below
            if not code:
                sys.exit(f'Table 6: no shower code for the column of positions from {rows[first][0]}')
            tracks.setdefault(code, []).append([(rows[i][0][0], rows[i][0][1], ra, dec) for i, ra, dec in run])
        for i in data_rows:
            v = rows[i][1].get(k)
            if not v or None in v:
                close(run)
                run = []
                continue
            # A column can pass straight from one shower to the next: split where the radiant jumps
            # off the line it was moving along (by more than the table's rounding to whole degrees).
            # Steps in right ascension are measured along the sky, so they shrink toward the pole.
            if run:
                ra0, de0 = run[-1][1:]
                squeeze = math.cos(math.radians(de0))
                dra = wrap(v[0] - ra0) * squeeze
                if len(run) > 1:
                    pra = wrap(ra0 - run[-2][1]) * squeeze
                    jump = math.hypot(dra - pra, (v[1] - de0) - (de0 - run[-2][2])) > 5
                else:
                    jump = math.hypot(dra, v[1] - de0) > 15
                if jump:
                    close(run)
                    run = []
            run.append((i, v[0], v[1]))
        close(run)
    # A shower crossing the new year has a run at the foot of the table and one at its head; the foot
    # comes first.
    out = {}
    for code, runs in tracks.items():
        if len(runs) == 2 and runs[0][0][:2] == rows[data_rows[0]][0] and runs[1][-1][:2] == rows[data_rows[-1]][0]:
            runs = [runs[1], runs[0]]
        out[code] = [p for run in runs for p in run]
    return out


# ---------------------------------------------------------------- the Sun's longitude

def sun_longitude(folder):
    """A function of (year, month, day) at 0h UT giving the Sun's longitude (degrees, J2000 ecliptic),
    from JPL's elements for the Earth-Moon barycentre: the Earth seen from the Sun, turned round."""
    elements, _ = pack_orbits.planet_elements(folder)
    el = elements['EM Bary']

    def longitude(year, month, day):
        when = datetime.datetime(year, month, 1) + datetime.timedelta(days=day - 1)
        T = ((when - datetime.datetime(2000, 1, 1, 12)).total_seconds() / 86400) / 36525
        a, e, I, L, peri, node = (el[i] + el[i + 6] * T for i in range(6))
        M = math.radians((L - peri + 180) % 360 - 180)
        E = M + e * math.sin(M)
        for _ in range(6):
            E -= (E - e * math.sin(E) - M) / (1 - e * math.cos(E))
        xp, yp = a * (math.cos(E) - e), a * math.sqrt(1 - e * e) * math.sin(E)
        w, O, i = math.radians(peri - node), math.radians(node), math.radians(I)
        x = (math.cos(w) * math.cos(O) - math.sin(w) * math.sin(O) * math.cos(i)) * xp + \
            (-math.sin(w) * math.cos(O) - math.cos(w) * math.sin(O) * math.cos(i)) * yp
        y = (math.cos(w) * math.sin(O) + math.sin(w) * math.cos(O) * math.cos(i)) * xp + \
            (-math.sin(w) * math.sin(O) + math.cos(w) * math.cos(O) * math.cos(i)) * yp
        return math.degrees(math.atan2(-y, -x)) % 360
    return longitude


def wrap(d):
    """An angle (degrees) as the nearest turn either way, -180 to 180."""
    return (d + 180) % 360 - 180


# ---------------------------------------------------------------- activity profiles

def fixed(line, a, b):
    """Bytes a to b (1-based, inclusive) of a fixed-width line, as a number, or None if blank."""
    s = line[a - 1:b].strip().rstrip(')')
    return float(s) if re.fullmatch(r'[-+]?\d+\.?\d*', s) else None


def jenniskens(folder):
    """Per stream: its single profile (table3b) and, for five, the sharp peak on a broad base (table3c),
    as lists of (ZHR, B rising, B falling); and the radiant with its drift (table3a)."""
    readme = open(os.path.join(folder, 'ReadMe'), encoding='latin-1').read()
    # Slopes given only in the notes, written like "for Gem, B = 0.39(4)/0.72(10)": rising/falling.
    notes = {}
    for m in re.finditer(r'[Ff]or (\w+), (Bp?) = \(?([\d.]+)(?:\(\d+\))?(?:/([\d.]+))?', readme):
        rise = float(m.group(3))
        notes[(m.group(1), m.group(2))] = (rise, float(m.group(4)) if m.group(4) else rise)
    sporadic_r = float(re.search(r'sporadic meteors Chi = ([\d.]+)', readme).group(1))
    single, double, radiant = {}, {}, {}
    for line in open(os.path.join(folder, 'table3a'), encoding='latin-1'):
        if line.strip():
            radiant[line[0:4].strip()] = [fixed(line, a, b) for a, b in ((28, 30), (32, 34), (36, 38), (40, 43), (45, 48))]
    for line in open(os.path.join(folder, 'table3b'), encoding='latin-1'):
        name = line[0:4].strip()
        if not name:
            continue
        zhr, B = fixed(line, 20, 24), fixed(line, 35, 39)
        if line[18:19] == '<' or zhr is None:
            continue                                         # only an upper limit
        if B is None and (name, 'B') in notes:
            B = notes[(name, 'B')]
        if B is not None:
            single[name] = [(zhr, *(B if isinstance(B, tuple) else (B, B)))]
    for line in open(os.path.join(folder, 'table3c'), encoding='latin-1'):
        name = line[0:4].strip()
        if not name:
            continue
        zp, bp = fixed(line, 14, 18), fixed(line, 26, 29)
        bp = (bp, bp) if bp is not None else notes[(name, 'Bp')]
        zb, rise, fall = fixed(line, 60, 63), fixed(line, 70, 74), fixed(line, 85, 89)
        double[name] = [(zp, *bp), (zb, rise, fall)]
    return single, double, radiant, sporadic_r


def strength(parts, d):
    """The ZHR d degrees of solar longitude from the peak."""
    return sum(z * 10 ** (-(rise if d < 0 else fall) * abs(d)) for z, rise, fall in parts)


# ---------------------------------------------------------------- output

def build(folder, out):
    pdf = Pdf(open(os.path.join(folder, f'cal{CALENDAR_YEAR}.pdf'), 'rb').read())
    pages = [words(pdf.runs(p)) for p in pdf.pages()]
    texts = [page_text(p) for p in pages]
    year = int(re.search(r'(\d{4}) Meteor Shower Calendar', texts[0]).group(1))
    table5 = next(i for i, t in enumerate(texts) if re.search(r'Table 5\.\s*Working List of Visual Meteor Showers', t))
    table6 = next(i for i, t in enumerate(texts) if re.search(r'^Date(\s+[A-Z]{3})+$', t, re.M))
    showers = working_list(pages[table5])
    tracks = radiant_table(pages[table6])
    lam = sun_longitude(folder)
    on = lambda month, day: lam(year, MONTHS.index(month) + 1, day)
    single, double, j_radiant, sporadic_r = jenniskens(folder)

    # The calendar's dates against its own solar longitudes for each peak, as a check on the conversion.
    off = [wrap(s['lam'] - on(*s['peak'])) for s in showers if s['peak'] and s['lam'] is not None]
    print(f'peaks: the calendar\'s solar longitude is {min(off):+.2f} to {max(off):+.2f} degrees past 0h UT of its date')

    rows, profiled = [], []
    for s in showers:
        if s['variable'] or s['zhr'] is None:
            print(f'leaving out {s["code"]} ({s["name"]}): its rate varies from year to year')
            continue
        start = on(*s['start'])
        end = on(s['end'][0], s['end'][1] + 1)                # active through the end date
        peak = s['lam'] if s['lam'] is not None else start
        track = [(on(m, d), ra, dec) for m, d, ra, dec in tracks.get(s['code'], [])]
        # Each position should fall in or near the shower's activity (the table steps five days).
        span = wrap(end - start) % 360
        for l, _, _ in track:
            if (wrap(l - start) % 360) > span + 6 and (wrap(start - l) % 360) > 6:
                sys.exit(f'Table 6 puts {s["code"]} at solar longitude {l:.1f}, outside its activity '
                         f'({start:.1f} to {end:.1f}): a column read wrongly?')
        if not track:
            track = [(peak, s['ra'], s['dec'])]
        elif s['ra'] is not None and s['lam'] is not None and \
                (wrap(peak - track[0][0]) < -2.5 or wrap(peak - track[-1][0]) > 2.5):
            # Table 6 doesn't reach the peak (the September Lyncids, which the calendar's text says may
            # be two sources): Table 5's radiant at the peak fills it in.
            print(f'  {s["code"]}: Table 6 starts {wrap(track[0][0] - peak):+.1f} degrees from the peak; adding Table 5\'s radiant there')
            track = sorted(track + [(peak, s['ra'], s['dec'])], key=lambda p: wrap(p[0] - start) % 360)
        if s['ra'] is not None:
            # Table 6 at the peak against Table 5's radiant at the peak.
            i = min(range(len(track)), key=lambda i: abs(wrap(track[i][0] - peak)))
            d = math.degrees(math.acos(min(1, math.sin(math.radians(track[i][2])) * math.sin(math.radians(s['dec'])) +
                                         math.cos(math.radians(track[i][2])) * math.cos(math.radians(s['dec'])) *
                                         math.cos(math.radians(track[i][1] - s['ra'])))))
            if d > 6:
                print(f'  {s["code"]}: Table 6 is {d:.1f} degrees from Table 5 at the peak')
        jname = JENNISKENS.get(s['code'])
        parts = None
        if jname:
            parts = double.get(jname) or single.get(jname)
            lo, ra, dec, dra, ddec = j_radiant[jname]
            dl = wrap(peak - lo)
            sep = math.hypot(wrap(ra + dra * dl - s['ra']) * math.cos(math.radians(s['dec'])), dec + ddec * dl - s['dec'])
            if sep > 10:
                sys.exit(f'{s["code"]} and Jenniskens\' {jname} are {sep:.0f} degrees apart: not the same shower?')
        if parts:
            # His rates scaled to the calendar's peak ZHR, which is from recent returns.
            k = s['zhr'] / sum(z for z, _, _ in parts)
            parts = [(z * k, rise, fall) for z, rise, fall in parts]
            profiled.append((s, start, peak, end, parts))
        rows.append(dict(s=s, start=start, peak=peak, end=end, parts=parts, track=track))

    # The calendar's activity periods end where a shower fades into the background. For the showers
    # Jenniskens measured, see how far down that is, as a share of the peak, and give the rest
    # slopes that fade to the same share at their own ends.
    shares = []
    for s, start, peak, end, parts in profiled:
        top = strength(parts, 0)
        shares += [strength(parts, -wrap(peak - start)) / top, strength(parts, wrap(end - peak)) / top]
    share = statistics.median(shares)
    print(f'showers with measured profiles are down to {100 * share:.1f}% (median) of their peak at the ends of their activity')
    for row in rows:
        s = row['s']
        if row['parts']:
            continue
        if s['lam'] is None:                                 # no peak: a steady source (the Antihelion)
            row['parts'] = [(s['zhr'], 0, 0)]
            continue
        slope = lambda span: -math.log10(share) / max(0.5, span)
        row['parts'] = [(s['zhr'], slope(wrap(row['peak'] - row['start'])), slope(wrap(row['end'] - row['peak'])))]

    with open(out, 'w', encoding='utf-8') as f:
        f.write('// The meteor showers for the stars background. Built by tools/pack_meteors.py from the IMO Meteor\n')
        f.write(f'// Shower Calendar {year} (J. Rendtel, ed.) and Jenniskens 1994 (A&A 287, 990; VizieR J/A+A/287/990);\n')
        f.write('// edit that, not this.\n')
        f.write('// SKY_SHOWERS, one per shower: its IAU code and name; the solar longitude (degrees, J2000) where its\n')
        f.write('// activity starts, peaks and ends; the speed it meets the air at (km/s); its population index r (each\n')
        f.write('// magnitude fainter, r times as many meteors); its rate, as parts [ZHR at the peak, slope before,\n')
        f.write('// slope after] with ZHR = sum of ZHR 10^(-slope |longitude - peak|); and its radiant as [solar\n')
        f.write('// longitude, right ascension, declination] (degrees, J2000), every five days.\n')
        f.write('window.SKY_SHOWERS = [\n')
        for row in rows:
            s = row['s']
            f.write('  ' + json.dumps([
                s['code'], s['name'], round(row['start'], 1), round(row['peak'], 2), round(row['end'], 1),
                s['v'], s['r'],
                [[round(z, 1), round(a, 3), round(b, 3)] for z, a, b in row['parts']],
                [[round(l, 1), ra, dec] for l, ra, dec in row['track']],
            ], ensure_ascii=False) + ',\n')
        f.write('];\n')
        f.write(f'window.SKY_SPORADIC_R = {sporadic_r};      // the population index of sporadic meteors (Jenniskens 1994)\n')
    print(f'{len(rows)} showers ({len(profiled)} with measured profiles), from the {year} calendar.')


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == 'fetch':
        fetch(sys.argv[2])
    elif len(sys.argv) == 4 and sys.argv[1] == 'build':
        build(sys.argv[2], sys.argv[3])
    else:
        sys.exit('usage: pack_meteors.py fetch DIR | build DIR OUT')
