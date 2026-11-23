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
| `public/stars.js` | The `stars` background. Loaded, with `sky.js`, only when that background is picked |
| `public/sky.js` | The real sky for the `stars` background: every naked-eye star, the Milky Way, and 125 galaxies, nebulae and clusters. Built by `tools/pack_sky.py`; don't edit by hand |
| `tools/pack_sky.py` | Downloads the star catalogs and builds `public/sky.js` from them (see "The sky's data" below) |
| `public/fonts/` | Doto in two weights, with its license |
| `public/favicon.svg`, `favicon.ico`, `apple-touch-icon.png` | The icon: a dot-matrix "K". The PNG and ICO are rendered from the SVG (square corners, since iOS rounds them itself) |
| `public/og.png` | The 1200×630 card shown when the link is shared. The `og:` tags in `index.html` point to it at `https://khush.sh/og.png`; regenerate it if the name or intro changes |

## Backgrounds

There are six, all drawn in code: `life` (Conway's Game of Life), `stars`, `autumn` (falling leaves of ten species), `sunlight` (leaf shadows swaying on a pale wall), `winter` (snowfall) and `garden` (a wildflower meadow). Every one moves with the page as you scroll, slower than the text, so it feels like there's more world behind it.

`stars` is the real sky over the Bay Area, facing south. It opens on the sky as it is at that moment, with the constellations where they actually are, then runs as a gentle time-lapse (a minute of sky every second, `TIME_LAPSE` in `backgrounds.js`) so you can watch it wheel west the way the Earth turns it. Paused, or with reduced motion, it holds still. Everything in it comes from published catalogs: the stars down to the faintest the eye can see, the Milky Way, and the galaxies, nebulae and star clusters (drawn larger than life, the way a long exposure shows them). Hover (or tap) a bright star or an object for its name and when the light reaching you now set out.

- **Choose the default** with `background` in `content.js`. `'season'` (the default) follows the time of year: winter in Dec–Feb, garden in Mar–May, sunlight in Jun–Aug, autumn in Sep–Nov. Or name one, e.g. `background: 'stars'`.
- **Preview** any of them by adding `?bg=winter` (or any name) to the address.
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
