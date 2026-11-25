# Builds public/sun.js: where the Sun is over the Bay Area, and the colour of its light and of the sky
# at every height it reaches, for the `sunlight` and `stars` backgrounds.
#
#   python3 tools/pack_sun.py fetch sun-data          # downloads the sources below into sun-data/
#   python3 tools/pack_sun.py build sun-data public/sun.js
#
# Sources (every measured number behind sun.js comes from these):
#   Sunlight    The TSIS-1 Hybrid Solar Reference Spectrum, 0.1 nm version (Coddington et al. 2021,
#               Geophys. Res. Lett. 48, e2020GL091709), from LASP's LISIRD: the Sun's light above the air
#   The eye     The CIE 1931 colour-matching functions, 2 degree observer (CIE 2019, doi:10.25039/CIE.DS.xvudnb9b)
#   Ozone       Serdyuchenko et al. 2014 (Atmos. Meas. Tech. 7, 625), IUP Bremen: how strongly ozone absorbs
#               each colour, at 223 K, the temperature of the ozone layer. Its Chappuis band, in the
#               orange, is why the sky overhead stays blue at dusk instead of going grey
#   The haze    AERONET (NASA GSFC), Version 3, at NASA Ames, Moffett Field, the station in the Bay Area:
#               how hazy the air is (aerosol optical depth at 500 nm, Level 2.0 daily means) and how that
#               changes with colour (the 440-870 nm Angstrom exponent); how the haze throws light
#               forward (asymmetry factor) and how much it absorbs (single-scattering albedo), from the
#               Level 1.5 almucantar inversions; and the total ozone AERONET takes for the site
#   The air     NOAA GML ozonesondes from Trinidad Head, California, one a month for ten years: how the
#               air thins with height, and where the ozone is
#   The Sun     JPL, "Approximate Positions of the Planets" (as in pack_orbits.py): the Earth's orbit,
#               so the page can work out where the Sun is
#   The Earth   JPL, "Planetary Physical Parameters": its radius
#
# Formulas, from the papers named where they're used: Rayleigh optical depth (Bodhaine et al. 1999),
# refraction (Saemundsson 1986), the haze's scattering (Henyey & Greenstein 1941), light scattered more
# than once (Hillaire 2020), and the sRGB colour space (IEC 61966-2-1).
#
# The model: sunlight comes down through air, haze and ozone in layers over a round Earth, and is
# scattered toward the eye. It's worked out colour by colour, every 10 nm from 380 to 780 nm. Left
# out: clouds, water vapour and other gases that absorb a little, and light off the ground.

import base64
import concurrent.futures
import io
import json
import math
import os
import re
import statistics
import sys
import urllib.request
import zipfile

import pack_orbits                                      # for JPL's Earth: its orbit and its radius

AERONET = 'https://aeronet.gsfc.nasa.gov/cgi-bin/'
SITE = 'NASA_Ames'
FIRST, LAST = 2000, 2025                                # the years of AERONET's record to use
OZONE_YEAR = 2024                                       # a year to read AERONET's ozone for, mid-month
SONDES = 'https://gml.noaa.gov/aftp/data/ozwv/Ozonesonde/Trinidad%20Head,%20California/100%20Meter%20Average%20Files/'
SONDE_YEARS = range(2015, 2025)
SOURCES = {
    'tsis1_hsrs_p1nm.csv': ['https://lasp.colorado.edu/lisird/latis/dap/tsis1_hsrs_p1nm.csv?wavelength%3E=370&wavelength%3C=790'],
    'CIE_xyz_1931_2deg.csv': ['https://files.cie.co.at/Publications-datasets/CIE_xyz_1931_2deg.csv'],
    'serdyuchenko_o3.zip': ['https://www.iup.uni-bremen.de/gruppen/molspec/downloads/serdyuchenkogorshelevversionjuly2013.zip'],
    'aeronet_aod.csv': [f'{AERONET}print_web_data_v3?site={SITE}&year={FIRST}&month=1&day=1&year2={LAST}'
                        f'&month2=12&day2=31&AOD20=1&AVG=20&if_no_html=1'],
    'aeronet_asy.csv': [f'{AERONET}print_web_data_inv_v3?site={SITE}&year={FIRST}&month=1&day=1&year2={LAST}'
                        f'&month2=12&day2=31&product=ASY&AVG=20&ALM15=1&if_no_html=1'],
    'aeronet_ssa.csv': [f'{AERONET}print_web_data_inv_v3?site={SITE}&year={FIRST}&month=1&day=1&year2={LAST}'
                        f'&month2=12&day2=31&product=SSA&AVG=20&ALM15=1&if_no_html=1'],
    'approx_pos.html': ['https://ssd.jpl.nasa.gov/planets/approx_pos.html'],
    'phys_par.html': ['https://ssd.jpl.nasa.gov/planets/phys_par.html'],
}
for _m in range(1, 13):
    # Every measurement (AVG=10) for five days mid-month: each carries the ozone AERONET assumed.
    # Cloudy days have none, so a month can come back empty.
    SOURCES[f'aeronet_ozone_{_m:02}.csv'] = [
        f'{AERONET}print_web_data_v3?site={SITE}&year={OZONE_YEAR}&month={_m}&day=13&year2={OZONE_YEAR}'
        f'&month2={_m}&day2=17&AOD20=1&AVG=10&if_no_html=1']
UA = {'User-Agent': 'pack-sun/1.0 (static site data build)'}

# Colours worked out: 10 nm bands centred on 380, 390 ... 780 nm.
BANDS = list(range(380, 781, 10))
# The Sun's heights (true altitude, degrees) the tables are worked out for: closest together around
# sunset, where the colour changes fastest.
ROWS = [-18, -15, -12, -10, -8, -7, -6, -5, -4, -3, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6,
        8, 10, 13, 16, 20, 25, 30, 40, 50, 60, 75, 90]
# The sky table's directions: altitude (degrees above the horizon) and how far round from the Sun.
SKY_ALT = [3, 7, 12, 18, 25, 33, 42, 52, 64, 77, 90]
SKY_AZ = [0, 10, 20, 35, 50, 70, 90, 110, 135, 160, 180]
# Choices of the model's, not measurements: the top of the air, and how quickly the haze thins with
# height (a scale height of 1.2 km, as in Bruneton & Neyret 2008; the Bay Area's haze sits low, in
# the marine layer).
TOP = 100.0
HAZE_HEIGHT = 1.2
# The IAU's nominal solar radius (2015 Resolution B3) and the au, for the size of the Sun's disc.
SUN_RADIUS_KM, AU_KM = 695700.0, 149597870.7
# 1 Dobson unit, in molecules per cm^2 (the definition: 0.01 mm of the gas at 0 C and 1 atm).
DU = 2.6867e16
# The luminous efficacy of 555 nm light, lm/W (the SI's definition of the candela).
KM = 683.0
# The sRGB colour space's primaries and white point (IEC 61966-2-1), as CIE xy.
SRGB = [(0.64, 0.33), (0.30, 0.60), (0.15, 0.06)]
D65 = (0.3127, 0.3290)


def fetch(folder):
    os.makedirs(folder, exist_ok=True)
    for name, urls in SOURCES.items():
        for url in urls:
            print('fetching', name, 'from', url)
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r:
                    data = r.read()
            except OSError as err:
                print('  failed:', err)
                continue
            # A server that's down can answer with an error page instead of the file.
            if (name.endswith('.zip') and not data.startswith(b'PK')) or \
                    (name.startswith('tsis') and not data.startswith(b'wavelength')) or \
                    (name.startswith('CIE') and not re.match(rb'3[68]\d,', data)) or \
                    (name.startswith('aeronet') and b'Date(dd:mm:yyyy)' not in data) or \
                    (name.endswith('.html') and b'<html' not in data[:2000].lower()):
                print('  not the file asked for (an error page?)')
                continue
            open(os.path.join(folder, name), 'wb').write(data)
            break
        else:
            if not name.startswith('aeronet_ozone'):
                sys.exit(f'could not fetch {name}')
    # The soundings: the first of each month, for SONDE_YEARS.
    with urllib.request.urlopen(urllib.request.Request(SONDES, headers=UA), timeout=120) as r:
        listing = r.read().decode('latin-1')
    chosen = {}
    for name in sorted(set(re.findall(r'href="(th\d+_(\d{4})_(\d\d)_\d\d_\d\d\.l100)"', listing))):
        if int(name[1]) in SONDE_YEARS:
            chosen.setdefault((name[1], name[2]), name[0])
    os.makedirs(os.path.join(folder, 'sondes'), exist_ok=True)
    for name in sorted(chosen.values()):
        path = os.path.join(folder, 'sondes', name)
        if os.path.exists(path):
            continue
        print('fetching sonde', name)
        with urllib.request.urlopen(urllib.request.Request(SONDES + name, headers=UA), timeout=120) as r:
            data = r.read()
        if b'Ozone Sonde' not in data:
            sys.exit(f'{name}: not a sounding')
        open(path, 'wb').write(data)


# ---------------------------------------------------------------- reading the sources

def band_means(points, lo=None):
    """Average (wavelength, value) points over each band: [centre - 5, centre + 5) nm."""
    sums, counts = [0.0] * len(BANDS), [0] * len(BANDS)
    for wl, v in points:
        i = int((wl - BANDS[0] + 5) // 10)
        if 0 <= i < len(BANDS):
            sums[i] += v
            counts[i] += 1
    if not all(counts):
        sys.exit('a band with no data')
    return [s / n for s, n in zip(sums, counts)]


def solar_spectrum(folder):
    """The Sun's irradiance above the air, W/m^2/nm, per band."""
    lines = open(os.path.join(folder, 'tsis1_hsrs_p1nm.csv'), encoding='latin-1').read().splitlines()
    return band_means((float(a), float(b)) for a, b, *_ in (l.split(',') for l in lines[1:] if l.strip()))


def colour_matching(folder):
    """x-bar, y-bar, z-bar per band."""
    rows = [l.split(',') for l in open(os.path.join(folder, 'CIE_xyz_1931_2deg.csv'), encoding='utf-8-sig').read().split()]
    return [band_means((float(r[0]), float(r[k])) for r in rows) for k in (1, 2, 3)]


def ozone_cross_section(folder):
    """Ozone's absorption cross-section at 223 K, cm^2 per molecule, per band."""
    with zipfile.ZipFile(os.path.join(folder, 'serdyuchenko_o3.zip')) as z:
        text = z.read(z.namelist()[0]).decode('latin-1')
    col = int(re.search(r'COLUMN\s+(\d+):[^\n]*@223K', text).group(1)) - 1
    points = []
    for line in text.splitlines():
        f = line.replace(',', '.').split()                 # it writes decimal commas
        if len(f) > col and re.fullmatch(r'\d+\.\d+', f[0]):
            wl = float(f[0])
            if 370 <= wl < 790:
                points.append((wl, float(f[col])))
    return band_means(points)


def aeronet(folder, name):
    """AERONET's table as a list of {column: value}, with its missing values (-999) left out."""
    text = re.sub(r'<[^>]*>', '\n', open(os.path.join(folder, name), encoding='latin-1').read())
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    head = next(i for i, l in enumerate(lines) if 'Date(dd:mm:yyyy)' in l)
    cols = lines[head].split(',')
    rows = []
    for line in lines[head + 1:]:
        f = line.split(',')
        if len(f) < len(cols) - 1:
            continue
        row = {}
        for c, v in zip(cols, f):
            try:
                x = float(v)
            except ValueError:
                continue
            if x > -999:
                row[c] = x
        rows.append(row)
    return rows


def median_of(rows, col):
    values = [r[col] for r in rows if col in r]
    if not values:
        sys.exit(f'AERONET: no {col}')
    return statistics.median(values), len(values)


def soundings(folder):
    """The median sounding, every 0.1 km: pressure (hPa), temperature (K), ozone (molecules/cm^3),
    as far up as at least half the soundings reach; and the ozone above that (DU), from the column
    the soundings add on for the air above their highest point."""
    names = sorted(os.listdir(os.path.join(folder, 'sondes')))
    levels, residuals = {}, {}
    for name in names:
        text = open(os.path.join(folder, 'sondes', name), encoding='latin-1').read().splitlines()
        start = next(i for i, l in enumerate(text) if l.split()[:3] == ['Num', 'hPa', 'km']) + 1
        for line in text[start:]:
            f = line.split()
            if len(f) < 13:
                continue
            try:
                p, z, t, o3, res = float(f[1]), float(f[2]), float(f[4]), float(f[11]), float(f[12])
            except ValueError:
                continue
            if not (0 < p < 1100 and -100 < t < 60 and 0 <= o3 < 100 and 0 <= z < 60):
                continue
            k = round(z * 10)
            levels.setdefault(k, []).append((p, t + 273.15, o3 * 1e11))
            if 0 <= res < 600:
                residuals.setdefault(k, []).append(res)
    n = len(names)
    profile = []
    for k in range(0, 600):
        got = levels.get(k, [])
        if len(got) < n / 2:
            if k > 10:
                break
            continue
        profile.append((k / 10, statistics.median(g[0] for g in got), statistics.median(g[1] for g in got),
                        statistics.median(g[2] for g in got)))
    residual = statistics.median(residuals[round(profile[-1][0] * 10)])
    return profile, residual, n


# ---------------------------------------------------------------- the atmosphere

def rayleigh_depth(wl_nm, pressure):
    """The Rayleigh optical depth of the whole air column at this pressure (hPa): Bodhaine et al. 1999,
    "On Rayleigh optical depth calculations", J. Atmos. Oceanic Technol. 16, 1854, eq. 30."""
    l2 = (wl_nm / 1000) ** 2
    t = 0.0021520 * (1.0455996 - 341.29061 / l2 - 0.90230850 * l2) / (1 + 0.0027059889 / l2 - 85.968563 * l2)
    return t * pressure / 1013.25


def refraction(h):
    """How far the air lifts the Sun at true altitude h (degrees): Saemundsson 1986, as in Meeus,
    Astronomical Algorithms, eq. 16.4, for air at 10 C and 1010 hPa."""
    return 1.02 / math.tan(math.radians(h + 10.3 / (h + 5.11))) / 60


def make_model(folder):
    E0 = solar_spectrum(folder)
    cmf = colour_matching(folder)
    sigma_o3 = ozone_cross_section(folder)

    aod = aeronet(folder, 'aeronet_aod.csv')
    tau500, days = median_of(aod, 'AOD_500nm')
    alpha, _ = median_of(aod, '440-870_Angstrom_Exponent')
    asy = aeronet(folder, 'aeronet_asy.csv')
    ssa = aeronet(folder, 'aeronet_ssa.csv')
    g_at = {wl: median_of(asy, f'Asymmetry_Factor-Total[{wl}nm]')[0] for wl in (440, 675, 870)}
    w_at = {wl: median_of(ssa, f'Single_Scattering_Albedo[{wl}nm]')[0] for wl in (440, 675, 870)}
    ozone_rows = []
    for m in range(1, 13):
        path = f'aeronet_ozone_{m:02}.csv'
        if os.path.exists(os.path.join(folder, path)):    # not if there were no measurements those days
            ozone_rows += aeronet(folder, path)
    ozone_du, _ = median_of(ozone_rows, 'Ozone(Dobson)')

    profile, residual, n_sondes = soundings(folder)
    surface_p = profile[0][1]
    print(f'haze at {SITE}: optical depth {tau500:.3f} at 500 nm (median of {days} days, {FIRST}-{LAST}), '
          f'Angstrom exponent {alpha:.2f}, asymmetry {g_at[440]:.2f}/{g_at[675]:.2f}/{g_at[870]:.2f}, '
          f'single-scattering albedo {w_at[440]:.3f}/{w_at[675]:.3f}/{w_at[870]:.3f} (440/675/870 nm)')
    print(f'ozone: {ozone_du:.0f} DU; soundings: {n_sondes}, median up to {profile[-1][0]:.1f} km, '
          f'{residual:.0f} DU above that; surface pressure {surface_p:.1f} hPa')

    # Density profiles every 0.1 km to TOP, each scaled to a column of 1, so a path's integral of
    # one is its airmass for that constituent.
    NZ = int(TOP * 10) + 1
    air = [0.0] * NZ
    o3 = [0.0] * NZ
    for z, p, t, n3 in profile:
        k = round(z * 10)
        air[k] = p / t                                    # proportional to the number of molecules
        o3[k] = n3
    # Below the first level, and any level missing in between: the nearest level's value.
    known = [round(z * 10) for z, *_ in profile]
    for k in range(known[-1]):
        if not air[k]:
            j = min(known, key=lambda j: abs(j - k))
            air[k], o3[k] = air[j], o3[j]
    # Above the soundings: the air thins at the rate it did over their top 5 km; the ozone falls
    # away exponentially, holding the column the soundings put above their top.
    k_top = known[-1]
    k_lo = k_top - 50
    h_air = (k_top - k_lo) / 10 / math.log(air[k_lo] / air[k_top])
    h_o3 = residual * DU / o3[k_top] / 1e5                 # km
    for k in range(k_top + 1, NZ):
        dz = (k - k_top) / 10
        air[k] = air[k_top] * math.exp(-dz / h_air)
        o3[k] = o3[k_top] * math.exp(-dz / h_o3)
    haze = [math.exp(-k / 10 / HAZE_HEIGHT) for k in range(NZ)]

    def unit(f):
        total = (sum(f) - (f[0] + f[-1]) / 2) * 0.1
        return [v / total for v in f]
    o3_total = (sum(o3) - (o3[0] + o3[-1]) / 2) * 0.1 * 1e5 / DU
    print(f'  the soundings\' own median ozone column: {o3_total:.0f} DU (scaled to AERONET\'s)')

    def interp(at, wl):
        keys = sorted(at)
        if wl <= keys[0]:
            return at[keys[0]]
        for a, b in zip(keys, keys[1:]):
            if wl <= b:
                return at[a] + (at[b] - at[a]) * (wl - a) / (b - a)
        return at[keys[-1]]

    TR = [rayleigh_depth(wl, surface_p) for wl in BANDS]
    TA = [tau500 * (wl / 500) ** -alpha for wl in BANDS]
    OM = [interp(w_at, wl) for wl in BANDS]
    G = [interp(g_at, wl) for wl in BANDS]
    TO = [s * ozone_du * DU for s in sigma_o3]
    i550, i600 = BANDS.index(550), BANDS.index(600)
    print(f'optical depths at 550 nm: air {TR[i550]:.4f}, haze {TA[i550]:.4f}, ozone {TO[i550]:.4f} '
          f'(ozone at 600 nm: {TO[i600]:.4f})')
    elements, obliquity = pack_orbits.planet_elements(folder)
    return dict(E0=E0, cmf=cmf, TR=TR, TA=TA, OMA=[o * t for o, t in zip(OM, TA)], G=G, TO=TO,
                air=unit(air), o3=unit(o3), haze=unit(haze),
                R=pack_orbits.equatorial_radii(folder)['Earth'],
                earth=elements['EM Bary'], obliquity=obliquity,
                about=dict(tau500=tau500, alpha=alpha, ozone=ozone_du, g=g_at, ssa=w_at, days=days,
                           sondes=n_sondes, pressure=surface_p))


# ---------------------------------------------------------------- light through the air
# Everything below runs in worker processes too, each holding the model in these globals.

M = None
NB = len(BANDS)
# The sun-path table: airmass of air, haze and ozone from a point up to the Sun, by the point's height
# (km) and the Sun's elevation there (degrees). Blocked by the Earth: BLOCKED.
LUT_Z = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 31,
         35, 40, 45, 50, 55, 60, 70, 80, 90, 100]
LUT_E = [-20 + 0.25 * i for i in range(121)] + list(range(11, 91))
BLOCKED = (1e4, 1e4, 1e4)
LUT = None
# Light scattered more than once: Psi per band, by height and the Sun's elevation there.
MS_Z = [0, 0.5, 1, 2, 3, 5, 7, 10, 13, 16, 20, 25, 30, 40, 50, 60]
MS_E = [-20, -15, -12, -10, -8, -6, -4, -2, 0, 2, 4, 7, 10, 15, 20, 30, 45, 60, 90]
MS = None


def setup(model, lut=None, ms=None):
    global M, LUT, MS
    M, LUT, MS = model, lut, ms


def density(z):
    """Air, haze and ozone at height z (km), each per km of a unit column."""
    x = z * 10.0
    air, haze, o3 = M['air'], M['haze'], M['o3']
    if x <= 0:
        return air[0], haze[0], o3[0]
    i = int(x)
    if i >= len(air) - 1:
        return 0.0, 0.0, 0.0
    w = x - i
    return (air[i] + (air[i + 1] - air[i]) * w, haze[i] + (haze[i + 1] - haze[i]) * w, o3[i] + (o3[i + 1] - o3[i]) * w)


def path_mass(z, e):
    """Airmass of air, haze and ozone from height z (km) to space, heading up at e degrees; None if the
    path hits the ground. Integrated in two parts either side of its lowest point, steps bunched
    where the air is thickest."""
    R = M['R']
    r = R + z
    mu = math.sin(math.radians(e))
    if mu < 0 and r * r * (1 - mu * mu) < R * R:
        return None
    rt = R + TOP
    s_low = max(0.0, -r * mu)                             # where the path is lowest
    s_end = -r * mu + math.sqrt(max(0.0, r * r * mu * mu - r * r + rt * rt))
    total = [0.0, 0.0, 0.0]
    N = 96
    for a, b, toward_a in ((0.0, s_low, False), (s_low, s_end, True)):
        span = b - a
        if span <= 0:
            continue
        for k in range(N):
            u = (k + 0.5) / N
            ds = span * 2 * u / N
            s = a + span * u * u if toward_a else b - span * u * u
            h = math.sqrt(r * r + s * s + 2 * r * s * mu) - R
            d = density(h)
            total[0] += d[0] * ds
            total[1] += d[1] * ds
            total[2] += d[2] * ds
    return tuple(total)


def lut_row(z):
    return [path_mass(z, e) or BLOCKED for e in LUT_E]


def sun_mass(z, e):
    """path_mass, from the table."""
    if e < LUT_E[0]:
        return BLOCKED
    if z >= LUT_Z[-1]:
        return (0.0, 0.0, 0.0)
    z = max(z, 0.0)
    j = 0
    while LUT_Z[j + 1] <= z:
        j += 1
    wz = (z - LUT_Z[j]) / (LUT_Z[j + 1] - LUT_Z[j])
    x = (e + 20) * 4 if e <= 10 else 110 + e
    i = min(int(x), len(LUT_E) - 2)
    we = min(1.0, x - i)
    a, b, c, d = LUT[j][i], LUT[j][i + 1], LUT[j + 1][i], LUT[j + 1][i + 1]
    return tuple((a[k] * (1 - we) + b[k] * we) * (1 - wz) + (c[k] * (1 - we) + d[k] * we) * wz for k in range(3))


def ms_at(z, e):
    """Psi, light scattered more than once, per band, at height z and local solar elevation e."""
    z = min(max(z, 0.0), MS_Z[-1])
    e = min(max(e, MS_E[0]), MS_E[-1])
    j = 0
    while j < len(MS_Z) - 2 and MS_Z[j + 1] <= z:
        j += 1
    i = 0
    while i < len(MS_E) - 2 and MS_E[i + 1] <= e:
        i += 1
    wz = (z - MS_Z[j]) / (MS_Z[j + 1] - MS_Z[j])
    we = (e - MS_E[i]) / (MS_E[i + 1] - MS_E[i])
    a, b, c, d = MS[j][i], MS[j][i + 1], MS[j + 1][i], MS[j + 1][i + 1]
    return [(a[k] * (1 - we) + b[k] * we) * (1 - wz) + (c[k] * (1 - we) + d[k] * we) * wz for k in range(NB)]


def ray_end(r, mu):
    """How far a ray from radius r, heading up at cos(zenith) mu, goes before leaving the air or
    hitting the ground, and whether it hits the ground."""
    R = M['R']
    if mu < 0 and r * r * (1 - mu * mu) < R * R:
        return -r * mu - math.sqrt(R * R - r * r * (1 - mu * mu)), True
    rt = R + TOP
    return -r * mu + math.sqrt(max(0.0, r * r * mu * mu - r * r + rt * rt)), False


def ms_row(z):
    """Hillaire 2020 ("A Scalable and Production Ready Sky and Atmosphere Rendering Technique",
    EGSR): at height z, for each solar elevation, the light reaching a point after being scattered
    once on its way, treated as scattering equally every way, summed over every further bounce as a
    geometric series: Psi = L2 / (1 - f)."""
    TR, TA, TO, OMA, E0 = M['TR'], M['TA'], M['TO'], M['OMA'], M['E0']
    R = M['R']
    r = R + z
    ND, NS = 64, 24
    golden = math.pi * (3 - math.sqrt(5))
    dirs = []
    for k in range(ND):                                    # evenly over the sphere
        uz = 1 - 2 * (k + 0.5) / ND
        rho = math.sqrt(1 - uz * uz)
        dirs.append((rho * math.cos(golden * k), rho * math.sin(golden * k), uz))
    row = []
    for e in MS_E:
        sx, sz = math.cos(math.radians(e)), math.sin(math.radians(e))
        L2 = [0.0] * NB
        f = [0.0] * NB
        for dx, dy, dz in dirs:
            end, _ = ray_end(r, dz)
            mv = [0.0, 0.0, 0.0]
            for k in range(NS):
                u = (k + 0.5) / NS
                dt = end * 2 * u / NS
                t = end * u * u
                px, py, pz = dx * t, dy * t, r + dz * t
                pr = math.sqrt(px * px + py * py + pz * pz)
                h = pr - R
                da, dh, do = density(h)
                ma, mh, mo = mv[0] + da * dt / 2, mv[1] + dh * dt / 2, mv[2] + do * dt / 2
                mv[0] += da * dt
                mv[1] += dh * dt
                mv[2] += do * dt
                es = math.degrees(math.asin(max(-1.0, min(1.0, (sx * px + sz * pz) / pr))))
                sa, sh, so = sun_mass(h, es)
                for i in range(NB):
                    scat = TR[i] * da + OMA[i] * dh
                    tv = math.exp(-(TR[i] * ma + TA[i] * mh + TO[i] * mo))
                    f[i] += tv * scat * dt
                    L2[i] += tv * scat * dt * E0[i] * math.exp(-(TR[i] * sa + TA[i] * sh + TO[i] * so)) / (4 * math.pi)
        row.append([L2[i] / ND / (1 - f[i] / ND) for i in range(NB)])
    return row


def sky(h, alt, az):
    """The sky's radiance (W/m^2/sr/nm, per band) in a direction alt degrees up and az degrees round
    from the Sun, with the Sun at true altitude h, seen from sea level."""
    TR, TA, TO, OMA, E0, G = M['TR'], M['TA'], M['TO'], M['OMA'], M['E0'], M['G']
    R = M['R']
    sh, ch = math.sin(math.radians(h)), math.cos(math.radians(h))
    sa, ca = math.sin(math.radians(alt)), math.cos(math.radians(alt))
    vx, vy, vz = ca * math.cos(math.radians(az)), ca * math.sin(math.radians(az)), sa
    cos_t = vx * ch + vz * sh                              # the scattering angle's cosine
    PR = 3 / (16 * math.pi) * (1 + cos_t * cos_t)          # Rayleigh
    PA = [(1 - g * g) / (4 * math.pi * (1 + g * g - 2 * g * cos_t) ** 1.5) for g in G]   # Henyey-Greenstein
    end, _ = ray_end(R, vz)
    N = 64
    L = [0.0] * NB
    mv = [0.0, 0.0, 0.0]
    for k in range(N):
        u = (k + 0.5) / N
        dt = end * 2 * u / N
        t = end * u * u
        px, py, pz = vx * t, vy * t, R + vz * t
        pr = math.sqrt(px * px + py * py + pz * pz)
        z = pr - R
        da, dh, do = density(z)
        ma, mh, mo = mv[0] + da * dt / 2, mv[1] + dh * dt / 2, mv[2] + do * dt / 2
        mv[0] += da * dt
        mv[1] += dh * dt
        mv[2] += do * dt
        es = math.degrees(math.asin(max(-1.0, min(1.0, (ch * px + sh * pz) / pr))))
        s1, s2, s3 = sun_mass(z, es)
        psi = ms_at(z, es)
        for i in range(NB):
            tv = math.exp(-(TR[i] * ma + TA[i] * mh + TO[i] * mo))
            ts = math.exp(-(TR[i] * s1 + TA[i] * s2 + TO[i] * s3))
            ray, hz = TR[i] * da, OMA[i] * dh
            L[i] += tv * dt * ((ray * PR + hz * PA[i]) * E0[i] * ts + (ray + hz) * psi[i])
    return L


def direct(h):
    """The Sun's own light at sea level (W/m^2/nm, per band, on a surface facing it), at true altitude h:
    lifted by refraction, and only the part of its disc that's above the horizon."""
    TR, TA, TO, E0 = M['TR'], M['TA'], M['TO'], M['E0']
    if h < -2:
        return [0.0] * NB
    app = h + refraction(h)
    rho = math.degrees(math.atan(SUN_RADIUS_KM / AU_KM))
    if app <= -rho:
        return [0.0] * NB
    seen = 1.0 if app >= rho else 1 - (2 * math.acos(app / rho) - math.sin(2 * math.acos(app / rho))) / (2 * math.pi)
    m = sun_mass(0.0, max(app, 0.0))
    return [E0[i] * seen * math.exp(-(TR[i] * m[0] + TA[i] * m[1] + TO[i] * m[2])) for i in range(NB)]


# The sky's light on a wall facing the Sun: a sum over the sky in cells 10 degrees square.
WALL_ALT = [5 + 10 * j for j in range(9)]
WALL_AZ = [5 + 10 * k for k in range(18)]


def row_of(h):
    """Everything for the Sun at true altitude h: its direct light, the sky's light on a surface facing
    it (upright once it's set) and on the ground, and the sky table's radiances."""
    sh, ch = math.sin(math.radians(h)), math.cos(math.radians(h))
    nx, nz = (ch, sh) if h > 0 else (1.0, 0.0)             # the surface faces the Sun
    wall = [0.0] * NB
    ground = [0.0] * NB
    cell = math.radians(10) ** 2
    for alt in WALL_ALT:
        sa, ca = math.sin(math.radians(alt)), math.cos(math.radians(alt))
        for az in WALL_AZ:
            L = sky(h, alt, az)
            facing = max(0.0, nx * ca * math.cos(math.radians(az)) + nz * sa)
            w = 2 * ca * cell                               # both sides of the Sun, and the cell's solid angle
            for i in range(NB):
                wall[i] += L[i] * facing * w
                ground[i] += L[i] * sa * w
    table = [[sky(h, alt, az) for az in SKY_AZ] for alt in SKY_ALT]
    zenith = sky(h, 90, 0)
    return dict(h=h, direct=direct(h), wall=wall, ground=ground, table=table, zenith=zenith)


# ---------------------------------------------------------------- colour

def xyz(spectrum, cmf):
    return [sum(s * c for s, c in zip(spectrum, bar)) * 10 for bar in cmf]


def chroma(X, Y, Z):
    s = X + Y + Z
    return (X / s, Y / s) if s > 0 else D65


def cct(x, y):
    """Correlated colour temperature (K), McCamy 1992's approximation; for the printout only."""
    n = (x - 0.3320) / (0.1858 - y)
    return 449 * n ** 3 + 3525 * n ** 2 + 6823.3 * n + 5520.33


def srgb_matrix():
    """XYZ to linear sRGB, from the primaries and white point (IEC 61966-2-1)."""
    P = [[x / y, 1.0, (1 - x - y) / y] for x, y in SRGB]          # each primary's XYZ at Y = 1
    W = [D65[0] / D65[1], 1.0, (1 - D65[0] - D65[1]) / D65[1]]
    cols = [[P[j][i] for j in range(3)] for i in range(3)]        # rows X, Y, Z; columns r, g, b
    inv = invert(cols)
    S = [sum(inv[i][k] * W[k] for k in range(3)) for i in range(3)]
    to_xyz = [[cols[i][j] * S[j] for j in range(3)] for i in range(3)]
    return invert(to_xyz)


def invert(m):
    a, b, c = m[0]
    d, e, f = m[1]
    g, h, i = m[2]
    det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
    return [[(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det],
            [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det],
            [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det]]


# The sky table packs each direction as three bytes: log10 of its luminance, and its CIE x and y.
LOG_RANGE = (-7.0, 5.5)
X_RANGE = (0.15, 0.6)
Y_RANGE = (0.15, 0.5)


def byte(v, lo, hi, what):
    if not lo <= v <= hi:
        print(f'  {what} {v:.3f} outside {lo}..{hi}: clipped')
    return max(0, min(255, round((v - lo) / (hi - lo) * 255)))


def build(folder, out):
    model = make_model(folder)
    cmf = model['cmf']
    workers = os.cpu_count() or 4
    with concurrent.futures.ProcessPoolExecutor(workers, initializer=setup, initargs=(model,)) as pool:
        lut = list(pool.map(lut_row, LUT_Z))
    print('worked out the sun-path table')
    with concurrent.futures.ProcessPoolExecutor(workers, initializer=setup, initargs=(model, lut)) as pool:
        ms = list(pool.map(ms_row, MS_Z))
    print('worked out multiple scattering')
    with concurrent.futures.ProcessPoolExecutor(workers, initializer=setup, initargs=(model, lut, ms)) as pool:
        rows = list(pool.map(row_of, ROWS))
    print('worked out the sky')

    light, packed = [], bytearray()
    print('  sun    direct      on a wall facing it     shadow      zenith     ground')
    for row in rows:
        d = xyz(row['direct'], cmf)
        w = xyz(row['wall'], cmf)
        lit = [a + b for a, b in zip(d, w)]
        g = xyz([a * max(0.0, math.sin(math.radians(row['h']))) + b for a, b in zip(row['direct'], row['ground'])], cmf)
        zen = xyz(row['zenith'], cmf)
        lx, ly = chroma(*lit)
        wx, wy = chroma(*w)
        light.append([round(lx, 4), round(ly, 4), round(wx, 4), round(wy, 4), round(w[1] / lit[1], 4)])
        dk = f'{cct(*chroma(*d)):5.0f} K' if d[1] > 0 else '     -  '
        print(f'  {row["h"]:5}  {dk}  {cct(lx, ly):5.0f} K {KM * lit[1]:9.3g} lx  {cct(wx, wy):6.0f} K'
              f'  {KM * zen[1]:9.3g} cd/m2  {KM * g[1]:9.3g} lx')
        for alt_row in row['table']:
            for L in alt_row:
                X, Y, Z = xyz(L, cmf)
                x, y = chroma(X, Y, Z)
                packed += bytes([byte(math.log10(max(KM * Y, 1e-12)), *LOG_RANGE, 'log luminance'),
                                 byte(x, *X_RANGE, 'x'), byte(y, *Y_RANGE, 'y')])
    a = model['about']
    with open(out, 'w', encoding='utf-8') as f:
        f.write('// The Sun over the Bay Area, for the sunlight and stars backgrounds: where it is, and the colour of its\n')
        f.write('// light and of the sky at every height it reaches. Built by tools/pack_sun.py from the TSIS-1 solar\n')
        f.write('// spectrum, the CIE 1931 observer, ozone absorption (Serdyuchenko et al. 2014), AERONET at NASA Ames,\n')
        f.write('// NOAA\'s Trinidad Head ozonesondes and JPL\'s planetary elements; edit that, not this.\n')
        f.write(f'// The air: haze of optical depth {a["tau500"]:.3f} at 500 nm, Angstrom exponent {a["alpha"]:.2f};'
                f' {a["ozone"]:.0f} DU of ozone.\n')
        f.write('// SUN_EARTH: the Earth-Moon barycentre\'s Keplerian elements a (au), e, I, L, longitude of perihelion,\n')
        f.write('// longitude of the node (degrees), and the same six rates per Julian century (JPL Table 1, J2000).\n')
        f.write(f'window.SUN_EARTH = {json.dumps(model["earth"])};\n')
        f.write(f'window.SUN_OBLIQUITY = {model["obliquity"]};\n')
        f.write('// SUN_ROWS: the Sun\'s true altitudes (degrees) the tables below are worked out for.\n')
        f.write(f'window.SUN_ROWS = {json.dumps(ROWS)};\n')
        f.write('// SUN_LIGHT, per row: the CIE xy of the light on a wall facing the Sun (sunlight and skylight),\n')
        f.write('// the xy of the skylight alone (the light in a shadow on it), and how bright the shadow is\n')
        f.write('// against the sunlit wall.\n')
        f.write(f'window.SUN_LIGHT = {json.dumps(light)};\n')
        f.write('// SUN_SKY: the sky\'s colour from sea level, for each row, at altitudes SUN_SKY_ALT (degrees), and\n')
        f.write('// SUN_SKY_AZ degrees round from the Sun: three bytes each, base64, log10 of the luminance (cd/m2)\n')
        f.write('// and CIE x and y, each from the low to the high end of SUN_SKY_RANGE over 0 to 255.\n')
        f.write(f'window.SUN_SKY_ALT = {json.dumps(SKY_ALT)};\n')
        f.write(f'window.SUN_SKY_AZ = {json.dumps(SKY_AZ)};\n')
        f.write(f'window.SUN_SKY_RANGE = {json.dumps([LOG_RANGE, X_RANGE, Y_RANGE])};\n')
        f.write(f'window.SUN_SKY = "{base64.b64encode(bytes(packed)).decode()}";\n')
        f.write('// From CIE XYZ to linear sRGB.\n')
        f.write(f'window.SUN_XYZ_TO_RGB = {json.dumps([[round(v, 6) for v in r] for r in srgb_matrix()])};\n')
    print(f'wrote {out}: {len(ROWS)} heights of the Sun, {len(packed) // 3} sky directions')


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == 'fetch':
        fetch(sys.argv[2])
    elif len(sys.argv) == 4 and sys.argv[1] == 'build':
        build(sys.argv[2], sys.argv[3])
    else:
        sys.exit('usage: pack_sun.py fetch DIR | build DIR OUT')
