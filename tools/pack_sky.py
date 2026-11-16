# Builds public/sky.js, the real sky behind the `stars` background, from published catalogs.
#
#   python3 tools/pack_sky.py fetch sky-data          # downloads the sources below into sky-data/
#   python3 tools/pack_sky.py build sky-data public/sky.js
#
# Sources (all numbers in sky.js come from these; nothing is typed in by hand):
#   Stars       Yale Bright Star Catalog, 5th revised ed. (Hoffleit & Warren 1991): position, magnitude, colour
#   Distances   Hipparcos, the new reduction (van Leeuwen 2007, VizieR I/311): parallax and its error
#   Cross-match HYG database v4.1 (astronexus, CC BY-SA 4.0): which Hipparcos star each catalog star is
#   Star names  IAU Catalog of Star Names (IAU Working Group on Star Names)
#   Objects     OpenNGC (Mattia Verga, CC BY-SA 4.0): position, size, shape, angle, type, common name
#   Their dist. Wikidata, "distance from Earth" (P2583): the preferred value, else the median of those listed
#   Faint stars HYG v4.1 again: the stars between the catalog's limit and the eye's (magnitude 6.5)
#   Milky Way   Milky Way Outline Catalog (Jose R. Vieira), five brightness levels, as packaged in
#               d3-celestial (Olaf Frohn, BSD 3-clause)

import bisect
import csv
import gzip
import json
import math
import os
import re
import statistics
import sys
import urllib.parse
import urllib.request

LIMIT = 5.5         # faintest star kept (visual magnitude)
LABELLED = 4.5      # stars this bright or brighter can be hovered, so they get a name
LAT = 37.77         # San Francisco: anything that never rises here is left out
MIN_SNR = 5         # show a distance only when the parallax is at least 5x its error (within ~20%)
LY_PER_PC = 3.26156
FAINT_LIMIT = 6.5   # the faint stars go down to the naked-eye limit under a dark sky
MW_GRID = 1.0       # the Milky Way ships as a grid of this many degrees per cell...
MW_SAMPLE = 0.25    # ...worked out from the outlines at this resolution
MW_DEC0 = -52       # the grid's southern edge: below this never rises over the Bay Area
MW_LEVELS = 5
# The galactic coordinate frame (Hipparcos catalogue, vol. 1, sec. 1.5.3): the north galactic pole
# in J2000 coordinates, and the galactic longitude of the north celestial pole.
NGP_RA, NGP_DEC, NCP_L = 192.85948, 27.12825, 122.93192

SOURCES = {
    'bsc5.dat.gz': 'http://tdc-www.harvard.edu/catalogs/bsc5.dat.gz',
    'hip2.tsv': 'https://vizier.cfa.harvard.edu/viz-bin/asu-tsv?-source=I/311/hip2&-out=HIP,Plx,e_Plx'
                '&Hpmag=%3C8&-out.max=unlimited',
    'hygdata_v41.csv': 'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv',
    'IAU-CSN.txt': 'https://www.pas.rochester.edu/~emamajek/WGSN/IAU-CSN.txt',
    'NGC.csv': 'https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files/NGC.csv',
    'addendum.csv': 'https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files/addendum.csv',
    'mw.json': 'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/mw.json',
}
UA = {'User-Agent': 'pack-sky/1.0 (static site data build)'}

# Spelled-out Bayer letters and Latin genitives (IAU Style Manual), for naming stars with no proper name.
GREEK = dict(Alp='Alpha', Bet='Beta', Gam='Gamma', Del='Delta', Eps='Epsilon', Zet='Zeta', Eta='Eta',
             The='Theta', Iot='Iota', Kap='Kappa', Lam='Lambda', Mu='Mu', Nu='Nu', Xi='Xi', Omi='Omicron',
             Pi='Pi', Rho='Rho', Sig='Sigma', Tau='Tau', Ups='Upsilon', Phi='Phi', Chi='Chi', Psi='Psi',
             Ome='Omega')
GENITIVE = dict(
    And='Andromedae', Ant='Antliae', Aps='Apodis', Aqr='Aquarii', Aql='Aquilae', Ara='Arae', Ari='Arietis',
    Aur='Aurigae', Boo='Bootis', Cae='Caeli', Cam='Camelopardalis', Cnc='Cancri', CVn='Canum Venaticorum',
    CMa='Canis Majoris', CMi='Canis Minoris', Cap='Capricorni', Car='Carinae', Cas='Cassiopeiae',
    Cen='Centauri', Cep='Cephei', Cet='Ceti', Cha='Chamaeleontis', Cir='Circini', Col='Columbae',
    Com='Comae Berenices', CrA='Coronae Australis', CrB='Coronae Borealis', Crv='Corvi', Crt='Crateris',
    Cru='Crucis', Cyg='Cygni', Del='Delphini', Dor='Doradus', Dra='Draconis', Equ='Equulei', Eri='Eridani',
    For='Fornacis', Gem='Geminorum', Gru='Gruis', Her='Herculis', Hor='Horologii', Hya='Hydrae', Hyi='Hydri',
    Ind='Indi', Lac='Lacertae', Leo='Leonis', LMi='Leonis Minoris', Lep='Leporis', Lib='Librae', Lup='Lupi',
    Lyn='Lyncis', Lyr='Lyrae', Men='Mensae', Mic='Microscopii', Mon='Monocerotis', Mus='Muscae', Nor='Normae',
    Oct='Octantis', Oph='Ophiuchi', Ori='Orionis', Pav='Pavonis', Peg='Pegasi', Per='Persei', Phe='Phoenicis',
    Pic='Pictoris', Psc='Piscium', PsA='Piscis Austrini', Pup='Puppis', Pyx='Pyxidis', Ret='Reticuli',
    Sge='Sagittae', Sgr='Sagittarii', Sco='Scorpii', Scl='Sculptoris', Sct='Scuti', Ser='Serpentis',
    Sex='Sextantis', Tau='Tauri', Tel='Telescopii', Tri='Trianguli', TrA='Trianguli Australis', Tuc='Tucanae',
    UMa='Ursae Majoris', UMi='Ursae Minoris', Vel='Velorum', Vir='Virginis', Vol='Volantis', Vul='Vulpeculae')

# OpenNGC object types, as the scene draws them. Others (single stars, asterisms, duplicates) are skipped.
KINDS = {'GCl': 'globular', 'OCl': 'open', 'PN': 'planetary', 'SNR': 'remnant', 'RfN': 'reflection',
         'HII': 'nebula', 'Neb': 'nebula', 'EmN': 'nebula', 'Cl+N': 'nebula', 'G': 'galaxy'}
# Besides the Messier list, named objects at least this bright or this big are included...
EXTRA_VMAG, EXTRA_ARCMIN = 6.5, 40
# ...except open clusters so wide their stars are already in the star catalog (the Hyades, Coma),
# and entries that are a part of an object already listed.
MAX_OPEN_ARCMIN = 200
PART_OF = {'NGC1980', 'NGC1981',   # the Orion Nebula's sword
           'NGC1432',              # the Pleiades' Maia Nebula
           'NGC2237',              # a lobe of the Rosette (NGC 2238)
           'IC4703'}               # the Eagle Nebula's gas (M16)
# T Coronae Borealis is in the Bright Star Catalog at its 1866 outburst; it's usually tenth magnitude.
SKIP_HR = {5958}

WIKIDATA_UNITS = {'light-year': 1, 'light year': 1, 'parsec': LY_PER_PC, 'kiloparsec': 1e3 * LY_PER_PC,
                  'megaparsec': 1e6 * LY_PER_PC}


def fetch(folder):
    os.makedirs(folder, exist_ok=True)
    for name, url in SOURCES.items():
        print('fetching', name)
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
            open(os.path.join(folder, name), 'wb').write(r.read())
    codes = sorted({c for o in pick_objects(folder) for c in o['codes']})
    print('fetching distances for', len(codes), 'objects from Wikidata')
    values = ' '.join(json.dumps(c) for c in codes)
    query = ('SELECT ?code ?dist ?unitLabel ?rank WHERE { VALUES ?code { ' + values + ' } '
             '?item wdt:P528 ?code . ?item p:P2583 ?st . ?st wikibase:rank ?rank . '
             '?st psv:P2583 [ wikibase:quantityAmount ?dist ; wikibase:quantityUnit ?unit ] . '
             'SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }')
    url = 'https://query.wikidata.org/sparql?' + urllib.parse.urlencode({'query': query})
    req = urllib.request.Request(url, headers={**UA, 'Accept': 'text/csv'})
    with urllib.request.urlopen(req, timeout=180) as r:
        open(os.path.join(folder, 'wikidata_distances.csv'), 'wb').write(r.read())


def sexagesimal(text, hours):
    sign = -1 if text.startswith('-') else 1
    d, m, s = text.lstrip('+-').split(':')
    value = int(d) + int(m) / 60 + float(s) / 3600
    return sign * value * (15 if hours else 1)


def catalog_code(name):
    """OpenNGC's 'NGC0224' or 'IC0405' as Wikidata writes it: 'NGC 224'."""
    m = re.fullmatch(r'(NGC|IC)0*(\d+)([A-Z]?)', name)
    return f'{m.group(1)} {m.group(2)}{m.group(3)}' if m else None


def pick_objects(folder):
    rows = []
    for f in ('NGC.csv', 'addendum.csv'):
        rows += csv.DictReader(open(os.path.join(folder, f), encoding='utf-8'), delimiter=';')
    picked = []
    for r in rows:
        if r['Type'] not in KINDS or not r['Dec'] or r['Name'] in PART_OF:
            continue
        dec = sexagesimal(r['Dec'], False)
        if dec < LAT - 90:
            continue
        major = float(r['MajAx']) if r['MajAx'] else 0
        vmag = float(r['V-Mag']) if r['V-Mag'] else 99
        messier = int(r['M']) if r['M'] else 0
        common = [n.strip() for n in r['Common names'].split(',') if n.strip()]
        # A few objects list a French name first (M11, "Amas de l'Ecu de Sobieski"); use an English one.
        common.sort(key=lambda n: n.startswith('Amas '))
        if not messier:
            if not common or not (vmag <= EXTRA_VMAG or major >= EXTRA_ARCMIN):
                continue
            if r['Type'] == 'OCl' and major > MAX_OPEN_ARCMIN:
                continue
        kind = KINDS[r['Type']]
        if kind == 'galaxy':
            kind = 'elliptical' if r['Hubble'].startswith(('E', 'S0')) else 'spiral'
        code = catalog_code(r['Name'])
        name = re.sub(r'^the ', '', common[0]) if common else (f'Messier {messier}' if messier else code)
        if messier and common:
            name += f' (M{messier})'
        minor = float(r['MinAx']) if r['MinAx'] else major
        picked.append(dict(
            name=name, ra=sexagesimal(r['RA'], True), dec=dec, kind=kind,
            size=major / 60, flat=(minor / major) if major else 1,
            pa=float(r['PosAng']) if r['PosAng'] else 0,
            id=f'M{messier}' if messier else r['Name'],
            codes=[c for c in (f'M {messier}' if messier else None, code) if c],
        ))
    return picked


def object_distances(folder):
    found = {}
    for r in csv.DictReader(open(os.path.join(folder, 'wikidata_distances.csv'), encoding='utf-8')):
        unit = WIKIDATA_UNITS.get(r['unitLabel'])
        if unit is None or r['rank'].endswith('DeprecatedRank'):
            continue
        found.setdefault(r['code'], []).append((r['rank'].endswith('PreferredRank'), float(r['dist']) * unit))
    best = {}
    for code, vals in found.items():
        preferred = [v for p, v in vals if p]
        best[code] = statistics.median(preferred or [v for _, v in vals])
    return best


def star_names(folder):
    """Proper names from the IAU list, by Hipparcos number and by HR number."""
    by_hip, by_hr = {}, {}
    for line in open(os.path.join(folder, 'IAU-CSN.txt'), encoding='utf-8'):
        if line.startswith(('#', '$')) or not line.strip():
            continue
        name, tokens = line[:18].strip(), line[18:].split()
        dates = [i for i, t in enumerate(tokens) if re.fullmatch(r'\d{4}-\d{2}-\d{2}', t)]
        if not dates:
            continue
        hip = tokens[dates[0] - 4]
        if hip.isdigit():
            by_hip.setdefault(int(hip), name)
        m = re.match(r'HR (\d+)', line[36:49])
        if m:
            by_hr.setdefault(int(m.group(1)), name)
    return by_hip, by_hr


def build(folder, out):
    # Hipparcos parallaxes, and which Hipparcos star each Bright Star Catalog (HR) entry is.
    parallax = {}
    for line in open(os.path.join(folder, 'hip2.tsv'), encoding='utf-8'):
        parts = line.rstrip('\n').split('\t')
        if len(parts) == 3 and parts[0].strip().isdigit():
            parallax[int(parts[0])] = (float(parts[1]), float(parts[2]))
    hip_of, hyg = {}, []
    for r in csv.DictReader(open(os.path.join(folder, 'hygdata_v41.csv'), encoding='utf-8')):
        if r['hr'] and r['hip']:
            hip_of[int(float(r['hr']))] = int(float(r['hip']))
        hyg.append(r)
    by_hip, by_hr = star_names(folder)

    rows = []
    with gzip.open(os.path.join(folder, 'bsc5.dat.gz'), 'rt', encoding='latin-1') as f:
        for line in f:
            line = line.rstrip('\n').ljust(170)
            if not line[75:77].strip() or not line[102:107].strip():
                continue
            hr = int(line[0:4])
            ra = (int(line[75:77]) + int(line[77:79]) / 60 + float(line[79:83]) / 3600) * 15
            dec = int(line[84:86]) + int(line[86:88]) / 60 + int(line[88:90]) / 3600
            if line[83] == '-':
                dec = -dec
            mag = float(line[102:107])
            if hr in SKIP_HR or mag > LIMIT or dec < LAT - 90:
                continue
            bv = float(line[109:114]) if line[109:114].strip() else 0.6
            rows.append((mag, ra, dec, bv, hr, line))
    rows.sort(key=lambda r: r[0])

    nums, names, stats = [], [], dict(proper=0, distance=0)
    for mag, ra, dec, bv, hr, line in rows:
        hip = hip_of.get(hr)
        ly = 0
        if hip in parallax:
            plx, err = parallax[hip]
            if plx > 0 and err > 0 and plx / err >= MIN_SNR:
                ly = 1000 / plx * LY_PER_PC
        if mag <= LABELLED:
            proper = by_hip.get(hip) or by_hr.get(hr)
            names.append(proper or designation(line))
            stats['proper'] += bool(proper)
            stats['distance'] += bool(ly)
        nums += [round(ra * 100), round(dec * 100), round(mag * 100), round(bv * 100), round(ly * 10)]

    # The faint stars: in HYG, fainter than the catalog's limit and not already in it.
    kept = {hr for *_, hr, _ in rows}
    faint = []
    for r in hyg:
        if not r['mag'] or not r['ra'] or (r['hr'] and int(float(r['hr'])) in kept):
            continue
        mag, dec = float(r['mag']), float(r['dec'])
        if LIMIT < mag <= FAINT_LIMIT and dec >= LAT - 90:
            bv = float(r['ci']) if r['ci'] else 0.6
            faint += [round(float(r['ra']) * 150), round(dec * 10), round(mag * 10), round(bv * 10)]

    milky = milky_way_grid(folder)

    distances = object_distances(folder)
    objects = []
    for o in pick_objects(folder):
        ly = next((distances[c] for c in o['codes'] if c in distances), 0)
        objects.append([o['name'], round(o['ra'], 3), round(o['dec'], 3), o['kind'], round(o['size'], 3),
                        round(o['flat'], 2), round(o['pa']), round(ly, -1 if ly < 1e5 else -4), o['id']])

    with open(out, 'w', encoding='utf-8') as f:
        f.write('// The real sky for the stars background. Built by tools/pack_sky.py from published catalogs\n')
        f.write('// (Yale Bright Star Catalog, Hipparcos, IAU star names, OpenNGC, Wikidata); edit that, not this.\n')
        f.write('// HYG and OpenNGC data are CC BY-SA 4.0, so this file is too.\n')
        f.write(f'// SKY_STARS: every star brighter than magnitude {LIMIT} that ever rises over the Bay Area,\n')
        f.write('// brightest first. Five numbers per star: right ascension and declination (J2000, degrees x100),\n')
        f.write('// magnitude (x100), B-V colour (x100), distance (light years x10; 0 when not measured well enough).\n')
        f.write('window.SKY_STARS = [' + ','.join(map(str, nums)) + '];\n')
        f.write(f'// SKY_NAMES: names for the first {len(names)} stars, the ones bright enough to hover.\n')
        f.write('window.SKY_NAMES = ' + json.dumps(names, ensure_ascii=False, separators=(',', ':')) + ';\n')
        f.write('// SKY_OBJECTS: name, RA, Dec (J2000, degrees), kind, major axis (degrees), minor/major,\n')
        f.write('// position angle (degrees east of north), distance (light years; 0 unknown), catalog id.\n')
        f.write('window.SKY_OBJECTS = [\n')
        for o in objects:
            f.write('  ' + json.dumps(o, ensure_ascii=False) + ',\n')
        f.write('];\n')
        f.write(f'// SKY_FAINT: stars from magnitude {LIMIT} down to {FAINT_LIMIT}, four numbers each: RA and Dec\n')
        f.write('// (degrees x10), magnitude (x10), B-V colour (x10).\n')
        f.write('window.SKY_FAINT = [' + ','.join(map(str, faint)) + '];\n')
        f.write(f'// SKY_MILKYWAY: the Milky Way\'s brightness on a {MW_GRID}-degree grid of RA (0 to 360) by Dec\n')
        f.write(f'// ({MW_DEC0} to 90), row by row from the south, 0 (none) to {MW_LEVELS * 2} (its brightest),\n')
        f.write('// run-length encoded as value, count, value, count...\n')
        f.write('window.SKY_MILKYWAY = [' + ','.join(map(str, milky)) + '];\n')
    print(f'{len(rows)} stars; of the {len(names)} hoverable, {stats["proper"]} have IAU names and '
          f'{stats["distance"]} a good distance. {len(objects)} objects, '
          f'{sum(1 for o in objects if o[7])} with a distance. {len(faint) // 4} faint stars, '
          f'Milky Way grid in {len(milky) // 2} runs.')


def to_galactic(ra, dec):
    """J2000 right ascension and declination to galactic longitude and latitude, all in degrees."""
    a, d = math.radians(ra - NGP_RA), math.radians(dec)
    gd = math.radians(NGP_DEC)
    b = math.asin(math.sin(d) * math.sin(gd) + math.cos(d) * math.cos(gd) * math.cos(a))
    l = NCP_L - math.degrees(math.atan2(math.cos(d) * math.sin(a),
                                         math.sin(d) * math.cos(gd) - math.cos(d) * math.sin(gd) * math.cos(a)))
    return l % 360, math.degrees(b)


def milky_way_grid(folder):
    """Rasterizes the Milky Way outlines on the sphere, so the page needn't fill polygons that wrap
    around the whole sky. In galactic coordinates each outline runs around the sky like a line of
    latitude, and none of them reaches the galactic pole: so a point is inside a level when a line
    from it straight up to the pole crosses that level's outlines an odd number of times."""
    cols = int(360 / MW_SAMPLE)
    crossings = [[[] for _ in range(cols)] for _ in range(MW_LEVELS)]
    features = json.load(open(os.path.join(folder, 'mw.json')))['features']
    for level, feature in enumerate(features[:MW_LEVELS]):
        for polygon in feature['geometry']['coordinates']:
            for ring in polygon:
                pts = [to_galactic(lon % 360, lat) for lon, lat in ring]
                for (l0, b0), (l1, b1) in zip(pts, pts[1:] + pts[:1]):
                    dl = (l1 - l0 + 180) % 360 - 180          # the short way round
                    if dl == 0:
                        continue
                    lo, hi = (l0, l0 + dl) if dl > 0 else (l0 + dl, l0)
                    c = math.ceil((lo - MW_SAMPLE / 2) / MW_SAMPLE)
                    while (x := c * MW_SAMPLE + MW_SAMPLE / 2) < hi:
                        if x >= lo:
                            t = (x - l0) / dl if dl > 0 else (l0 - x) / -dl
                            crossings[level][c % cols].append(b0 + (b1 - b0) * t)
                        c += 1
    for level in crossings:
        for col in level:
            col.sort()

    def brightness(ra, dec):
        l, b = to_galactic(ra, dec)
        col = int(l / MW_SAMPLE) % cols
        return sum(len(level[col]) - bisect.bisect_right(level[col], b) & 1 for level in crossings)

    grid = []
    rows = int((90 - MW_DEC0) / MW_GRID)
    for r in range(rows):
        for c in range(int(360 / MW_GRID)):
            # Four samples per cell, so edges come out as halves rather than steps.
            total = sum(brightness((c + fx) * MW_GRID, MW_DEC0 + (r + fy) * MW_GRID)
                        for fx in (0.25, 0.75) for fy in (0.25, 0.75))
            grid.append(round(total / 2))                    # 0..MW_LEVELS*2
    runs = []
    for v in grid:
        if runs and runs[-2] == v:
            runs[-1] += 1
        else:
            runs += [v, 1]
    return runs


def designation(line):
    bayer, sup, const = line[7:10].strip(), line[10].strip(), line[11:14].strip()
    sup = sup.translate(str.maketrans('123456789', '¹²³⁴⁵⁶⁷⁸⁹'))
    if bayer in GREEK and const in GENITIVE:
        return f'{GREEK[bayer]}{sup} {GENITIVE[const]}'
    flamsteed = line[4:7].strip()
    if flamsteed and const in GENITIVE:
        return f'{flamsteed} {GENITIVE[const]}'
    return f'HR {line[0:4].strip()}'


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == 'fetch':
        fetch(sys.argv[2])
    elif len(sys.argv) == 4 and sys.argv[1] == 'build':
        build(sys.argv[2], sys.argv[3])
    else:
        sys.exit(__doc__ or 'usage: pack_sky.py fetch DIR | build DIR OUT')
