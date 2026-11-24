# khush.sh

Plain HTML, CSS and a little JavaScript. No build step, no dependencies, no requests to other sites.

## Files

The site lives in `public/`. `wrangler.jsonc` tells Cloudflare to serve that folder.

| File | What it holds |
| --- | --- |
| `public/index.html` | Page structure, the link template, the icon sprite and the (hidden) background picker |
| `public/content.js` | All the words and links, and which background to use. This is the file to edit |
| `public/style.css` | Layout, type, the season palettes and each background's page colours |
| `public/season.js` | Works out the season before the page paints |
| `public/render.js` | Fills the page from `content.js` |
| `public/backgrounds.js` | The animated backgrounds, and switching between them |
| `public/stars.js` | The `stars` background, including where the Moon and planets are at any moment, and the meteors. Loaded, with `sky.js`, `orbits.js` and `meteors.js`, only when that background is picked |
| `public/sky.js` | The real sky for the `stars` background: every naked-eye star, the Milky Way, and 125 galaxies, nebulae and clusters. Built by `tools/pack_sky.py`; don't edit by hand |
| `tools/pack_sky.py` | Downloads the star catalogs and builds `public/sky.js` from them (see "The sky's data" below) |
| `public/orbits.js` | How the Moon and planets move, and the Moon's face, for the `stars` background. Built by `tools/pack_orbits.py`; don't edit by hand |
| `tools/pack_orbits.py` | Downloads JPL's planet tables, the ELP 2000-82B lunar theory and NASA's map of the Moon, and builds `public/orbits.js` from them |
| `public/meteors.js` | The meteor showers for the `stars` background: when each is active, how strong, and where its radiant is. Built by `tools/pack_meteors.py`; don't edit by hand |
| `tools/pack_meteors.py` | Downloads the IMO's meteor shower calendar and the measurements of how each shower rises and falls, and builds `public/meteors.js` from them |
| `public/fonts/` | Doto in two weights, with its license |
| `public/favicon.svg`, `favicon.ico`, `apple-touch-icon.png` | The icon: a dot-matrix "K". The PNG and ICO are rendered from the SVG (square corners, since iOS rounds them itself) |
| `public/og.png` | The 1200×630 card shown when the link is shared. The `og:` tags in `index.html` point to it at `https://khush.sh/og.png`; regenerate it if the name or intro changes |

## Backgrounds

There are six, all drawn in code: `life` (Conway's Game of Life), `stars`, `autumn` (falling leaves of ten species), `sunlight` (leaf shadows swaying on a pale wall), `winter` (snowfall) and `garden` (a wildflower meadow). Every one moves with the page as you scroll, slower than the text, so it feels like there's more world behind it.

`stars` is the real sky over the Bay Area, facing south. It opens on the sky as it is at that moment, with the constellations where they actually are, then runs as a gentle time-lapse (a minute of sky every second, `TIME_LAPSE` in `stars.js`) so you can watch it wheel west the way the Earth turns it. Paused, or with reduced motion, it holds still. Everything in it comes from published catalogs: the stars down to the faintest the eye can see, the Milky Way, and the galaxies, nebulae and star clusters (drawn larger than life, the way a long exposure shows them).

The Moon and the planets are there too, worked out for the moment on screen. The Moon shows its real phase, lit from where the Sun is, with its dark part faintly lit by earthshine and a glow around it near full. It's placed as seen from San Francisco rather than the Earth's centre, which moves it by up to a degree. Its face is NASA's photograph of the near side. It's drawn five times its real size (`MOON_SIZE` in `stars.js`), like the galaxies, and it hides whatever is behind it. Mercury, Venus, Mars, Jupiter, Saturn and Uranus are sized by how bright they are right then, and shine steadily instead of twinkling, the way planets do. Neptune is left out: it never gets bright enough to see. Colours are picked by eye.

Meteors cross it as often as you'd really see them. Most nights that's a few an hour from anywhere in the sky (sporadic meteors), more toward dawn. On a shower's dates there are many more, all flying out from the shower's radiant: the Geminids from Gemini in mid-December, the Perseids from Perseus in August. A shower builds and fades over its dates, and you see more of it the higher its radiant is, none while it's below the horizon. Each meteor's path, length, speed and brightness are worked out as the real one's would be: most are faint, a few are bright. The time-lapse runs an hour of sky every minute, so a shower's peak night is busy. At the Geminids' best that's two or three a second.

Hover (or tap) a bright star or an object for its name and when the light reaching you now set out. The Moon also shows its phase, and the Moon and planets show their distance.

- **Choose the default** with `background` in `content.js`. `'season'` (the default) follows the time of year: winter in Dec–Feb, garden in Mar–May, sunlight in Jun–Aug, autumn in Sep–Nov. Or name one, e.g. `background: 'stars'`.
- **Preview** any of them by adding `?bg=winter` (or any name) to the address. For `stars`, add `&sky=` and a moment to open on it instead of now, e.g. `?bg=stars&sky=2026-12-14T02:00-08:00` for the Geminids' peak.
- **Try them all** by adding `?tweaks` to the address; a picker appears in the bottom-left corner.
- The round button in the bottom-right pauses all motion. Anyone with "reduce motion" turned on gets a still background.

## The sky's data

`public/sky.js` is built from these, nothing typed in by hand:

| What | Source |
| --- | --- |
| Stars to magnitude 5.5: position, brightness, colour | [Yale Bright Star Catalog](http://tdc-www.harvard.edu/catalogs/bsc5.html), 5th revised edition (Hoffleit & Warren 1991) |
| Fainter stars, to magnitude 6.5, and the Hipparcos cross-match | [HYG database](https://github.com/astronexus/HYG-Database) v4.1 (CC BY-SA 4.0) |
| Distances to stars | Hipparcos, new reduction (van Leeuwen 2007, VizieR I/311). Shown only when the parallax is at least 5× its error, so some stars, like Alnilam, show no distance |
| Star names | [IAU Catalog of Star Names](https://www.pas.rochester.edu/~emamajek/WGSN/IAU-CSN.txt) |
| Galaxies, nebulae, clusters: position, size, shape, angle, name | [OpenNGC](https://github.com/mattiaverga/OpenNGC) (CC BY-SA 4.0): all Messier objects, plus named ones brighter than magnitude 6.5 or wider than 40′ |
| Their distances | Wikidata "distance from Earth" (P2583): the preferred value, else the median of those listed |
| The Milky Way | Milky Way Outline Catalog (José R. Vieira), as packaged in [d3-celestial](https://github.com/ofrohn/d3-celestial) (BSD 3-clause) |

Because HYG and OpenNGC are CC BY-SA 4.0, `sky.js` is too. To rebuild it:

```sh
python3 tools/pack_sky.py fetch sky-data     # downloads the sources (about 40 MB)
python3 tools/pack_sky.py build sky-data public/sky.js
```

`public/orbits.js`, the Moon and the planets, has its own build so either file can be rebuilt without the other:

| What | Source |
| --- | --- |
| Planet orbits | JPL, [Approximate Positions of the Planets](https://ssd.jpl.nasa.gov/planets/approx_pos.html) (E. M. Standish): Keplerian elements and their rates (Table 1, good for 1800–2050), and the obliquity used to turn them into sky coordinates |
| Planet brightness | [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/): each planet's magnitude every 3 days from 2000 to 2050 (Horizons uses Mallama & Hilton 2018), brought to 1 au to give a curve of brightness against phase angle. A thin crescent Venus keeps its real glare; Saturn's rings are averaged over their tilts |
| The Earth's radius | JPL, [Planetary Physical Parameters](https://ssd.jpl.nasa.gov/planets/phys_par.html), for the Moon's parallax |
| The Moon's motion | [ELP 2000-82B](https://cdsarc.cds.unistra.fr/viz-bin/cat/VI/79) (Chapront-Touzé & Chapront 1988, VizieR VI/79): the main problem's series, cut to terms of at least 6″ (longitude, latitude) and 10 km (distance), with the constants from its reference routine `elp82b.f` |
| The Moon's size | JPL, [Planetary Satellite Physical Parameters](https://ssd.jpl.nasa.gov/sats/phys_par/): its mean radius |
| The Moon's face | NASA's [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/) (Ernie Wright, NASA Scientific Visualization Studio): the LRO Camera colour map, as 96×96 levels of brightness |

```sh
python3 tools/pack_orbits.py fetch orbit-data     # downloads the sources (about 8 MB)
python3 tools/pack_orbits.py build orbit-data public/orbits.js
```

Checked against [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) from 2000 to 2050, the Moon lands within 2′ of where it really is, as seen from San Francisco. That's a third of a pixel in a 1440×900 window. Mercury, Venus, Mars, Uranus and the Sun (which sets the phase) are within 3′. Jupiter and Saturn are within 11′, the accuracy JPL gives for these tables, about 1.7 pixels. The tables run out in 2050.

`public/meteors.js`, the meteor showers, has a build of its own as well:

| What | Source |
| --- | --- |
| Showers: when each is active and peaks (as the Sun's longitude, which they keep to year after year), its radiant and how that drifts, its speed, how many faint meteors to each bright one (the population index) and its peak ZHR | The International Meteor Organization's [Meteor Shower Calendar](https://www.imo.net/calendar/) for 2027 (J. Rendtel, ed.): Table 5, the Working List of Visual Meteor Showers, and Table 6, each radiant every five days. The four it marks as variable from year to year are left out |
| How fast each shower's rate climbs to its peak and falls away | Jenniskens 1994, "Meteor stream activity I. The annual streams" (A&A 287, 990; [VizieR J/A+A/287/990](https://cdsarc.cds.unistra.fr/viz-bin/cat/J/A+A/287/990)), measured for 20 of the showers, with a sharp peak on a broad base for the Quadrantids, Perseids, Leonids, Geminids and Ursids. The rest fade to the same share of their peak by the ends of their dates as the measured ones do (2.6%, the median) |
| The calendar's dates as the Sun's longitude | JPL, [Approximate Positions of the Planets](https://ssd.jpl.nasa.gov/planets/approx_pos.html), as for `orbits.js` |

`stars.js` turns a shower's ZHR into what you'd see the way the IMO does: ZHR × the sine of the radiant's altitude, for an observer taking in a field 105° across (from the IMO's [FAQ](https://www.imo.net/resources/faq/)), scaled to the sky the window shows. A few other numbers there come from the IMO too: 5 to 15 sporadic meteors an hour depending on the time of night (its [Handbook for Meteor Observers](https://www.imo.net/resources/free-meteor-books/)), here following the height of the apex, the direction the Earth is heading; meteors lighting up at about 100 km and burning out by 80 (its [guide to minor showers](https://www.imo.net/observations/methods/visual-observation/minor/)); and speeds through the air from 11.2 to 72.9 km/s (Handbook). How long a stretch of each streak stays lit, and its colours, are picked by eye. Moonlight, which drowns the fainter meteors, is left out, as it is for the stars.

```sh
python3 tools/pack_meteors.py fetch meteor-data     # downloads the sources (about 1 MB)
python3 tools/pack_meteors.py build meteor-data public/meteors.js
```

The IMO publishes each year's calendar in the autumn before. To move to a new one, set `CALENDAR_YEAR` at the top of `tools/pack_meteors.py` and rebuild.

## Common edits

- **Change the text:** edit `name` and `intro` in `content.js`. `intro` can be one string, or a list to force each entry onto its own line. The capitalised text links under it are `pages`.
- **Add a social link:** add a `<symbol id="icon-name">` to the sprite at the bottom of `index.html`, then add `{ label, url, icon: 'name' }` to `links` in `content.js`.
- **Change colours:** the season palettes are at the top of `style.css`; each background's page colours are near the bottom (`html[data-bg="…"]`).
- **Tune a background:** each scene in `backgrounds.js` starts with a comment and its own constants (how many leaves, how fast the snow falls, and so on).

## Preview locally

Open `public/index.html` in a browser. If the fonts don't show when opened straight from disk, serve the folder instead: `npx serve public` or `python3 -m http.server -d public`.

## Deploy (Cloudflare Workers)

The site deploys as an assets-only Worker: no server code, just the files in `public/`.

**From GitHub (deploys on every push):** in the Cloudflare dashboard, go to Workers & Pages, choose Create, then Import a repository and pick this repo. Leave the build command empty and keep the default deploy command.

**From your machine:** run `npx wrangler deploy` in this folder.

Either way you get a `*.workers.dev` URL right away. To use your own domain, open the Worker's settings and add it under Domains & Routes. If `khush.sh` moves to Cloudflare DNS, copy over the `_atproto` TXT record so your Bluesky handle stays verified.

## Fonts

Everything is set in [Doto](https://fonts.google.com/specimen/Doto), a dot-matrix monospace under the OFL: weight 800 for the name, 500 for everything else. The files are its Latin subsets from [Fontsource](https://fontsource.org/fonts/doto), about 8 KB together.
