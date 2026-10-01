# khush.sh

Plain HTML, CSS and a little JavaScript. No build step, no dependencies.

## Files

The site itself lives in `public/`. `wrangler.jsonc` tells Cloudflare to serve that folder.

| File | What it holds |
| --- | --- |
| `public/index.html` | Page structure, row templates and the icon sprite |
| `public/content.js` | All the words and links. This is the file to edit |
| `public/style.css` | Layout, type and the four season palettes |
| `public/season.js` | Picks the season's palette before the page paints |
| `public/render.js` | Fills the page from `content.js` |
| `public/life.js` | The Game of Life background |

## Common edits

- **Change text or add a project:** edit `content.js`. Each list becomes rows in the order written, and any field left out is simply not shown.
- **Add a social link:** add a `<symbol id="icon-name">` to the sprite at the bottom of `index.html`, then add `{ label, url, icon: 'name' }` to `links` in `content.js`.
- **Change colors:** each season has a light and a dark block at the top of `style.css`. `--dot-alpha` sets how strong the dots are for that palette.
- **Tune the background:** the constants at the top of `life.js`. `TARGET.around` and `TARGET.under` set how busy it is around and beneath the text.

## Preview

Open `public/index.html` in a browser. It works straight from disk; the fonts need an internet connection.

To see another season's colors, add `?season=winter` (or `spring`, `summer`, `autumn`) to the URL.

## Deploy (Cloudflare Workers)

The site deploys as an assets-only Worker: no server code, just the files in `public/`.

**From GitHub (deploys on every push):** in the Cloudflare dashboard, go to Workers & Pages, choose Create, then Import a repository and pick this repo. Leave the build command empty and keep the default deploy command.

**From your machine:** run `npx wrangler deploy` in this folder.

Either way you get a `*.workers.dev` URL right away. To use your own domain, open the Worker's settings and add it under Domains & Routes. If `khush.sh` moves to Cloudflare DNS, copy over the `_atproto` TXT record so your Bluesky handle stays verified.

To drop the Google Fonts request as well, download Instrument Serif and Instrument Sans, put the `.woff2` files in `public/`, and replace the Google Fonts `<link>` in `index.html` with `@font-face` rules.
