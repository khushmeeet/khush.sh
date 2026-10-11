# khush.sh

Plain HTML, CSS and a little JavaScript. No build step, no dependencies, no requests to other sites.

## Files

The site lives in `public/`. `wrangler.jsonc` tells Cloudflare to serve that folder.

| File | What it holds |
| --- | --- |
| `public/index.html` | Page structure, row templates, the icon sprite and the (hidden) background picker |
| `public/content.js` | All the words and links, and which background to use. This is the file to edit |
| `public/style.css` | Layout, type, the season palettes and each background's page colours |
| `public/season.js` | Works out the season before the page paints |
| `public/render.js` | Fills the page from `content.js` |
| `public/backgrounds.js` | The six animated backgrounds |
| `public/fonts/` | Instrument Serif and Instrument Sans, with their licenses |

## Backgrounds

There are six, all drawn in code: `life` (Conway's Game of Life), `stars`, `autumn` (falling leaves of ten species), `sunlight` (leaf shadows swaying on a pale wall), `winter` (snowfall) and `garden` (a wildflower meadow). Every one moves with the page as you scroll, slower than the text, so it feels like there's more world behind it.

- **Choose the default** with `background` in `content.js`. `'season'` (the default) follows the time of year: winter in Dec–Feb, garden in Mar–May, sunlight in Jun–Aug, autumn in Sep–Nov. Or name one, e.g. `background: 'stars'`.
- **Preview** any of them by adding `?bg=winter` (or any name) to the address.
- **Try them all** by adding `?tweaks` to the address; a picker appears in the bottom-left corner.
- The round button in the bottom-right pauses all motion. Anyone with "reduce motion" turned on gets a still background.

## Common edits

- **Change text or add a section:** edit `content.js`. Sections appear in the order written; each holds either `rows` (a date or a name on the left, text on the right) or `paragraphs`.
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

The two `.woff2` files are cut down to Latin characters, which covers English plus accented letters, dashes and curly quotes, so together they're about 60 KB. Instrument Sans keeps its weight axis, so any weight from 400 to 700 works.
