# Пари

A personal dashboard for studying online at Odesa State Agrarian University (ОДАУ).
One calm screen that answers: **what should I be doing right now, and what's next?**

- The current or next class, with a big «Приєднатися» button for its Zoom/Meet link
- Live status: live, starting soon, break, done for today, weekend
- Pauses for air alarms in Odesa oblast, and says so when the alarm status is unknown
- Today's classes, a preview of tomorrow, and when the schedule was last updated
- Installable on a phone's home screen, light and dark mode, Ukrainian UI

Live site: https://syrnikov.github.io/eSchedule/

## How it works

```
GitHub Actions (every 3 h) ──> vnz.osvita.net schedule API ──> data/schedule.json (committed)
                                                                      │
GitHub Pages (static site) <──────────────────────────────────────────┘
        ├── every 60 s ──> Cloudflare Worker ──> ubilling.net.ua/aerialalerts (air alarms)
        └── meeting links ──> localStorage on your device only (never committed)
```

- **No build step, no framework, no browser dependencies.** Plain HTML, CSS and ES modules.
- The OSAU page embeds a widget from vnz.osvita.net; the scraper calls its JSON API directly.
  Details (endpoint, IDs, quirks) are in [RECON.md](RECON.md).
- The alarm feed has no CORS headers, so a tiny Cloudflare Worker proxies it for this site only.
- Links often contain passcodes, so they live only in your browser. Use export/import in
  settings to back them up or move them to another device.

## Project layout

| Path | What it is |
|---|---|
| `index.html`, `css/styles.css` | The page and its styles (colours are CSS variables) |
| `js/main.js` | Boot, rendering, render loop, routing between main screen and settings |
| `js/status.js` | `computeStatus(now, schedule, alarm)`, a pure function; the core logic |
| `js/alarm.js` | Polls the Worker and tracks alarm state |
| `js/settings.js`, `js/links.js` | Settings screen; link storage, import/export |
| `js/format.js` | Kyiv time and Ukrainian formatting |
| `js/strings.js` | **All UI text** |
| `js/config.js` | Worker URL and alarm region |
| `scraper/` | `scrape.mjs` (fetch + write), `parse.mjs` (pure), saved API responses in `fixtures/` |
| `worker/` | Cloudflare Worker and `wrangler.toml` |
| `.github/workflows/scrape.yml` | Scheduled scraper |
| `tests/` | `node:test` tests |

## Running locally

Needs Node 20+ (the site itself needs nothing).

```bash
npm test                         # all tests
npm run scrape                   # refresh data/schedule.json from the live API
python -m http.server 8765       # then open http://127.0.0.1:8765
```

Debug URL parameters for checking states by hand:

- `?now=2026-09-28T08:30` pretends it's that time in Kyiv
- `?alarm=alert`, `?alarm=unknown`, `?alarm=resumed`, `?alarm=clear` fakes the alarm

Locally the alarm shows «Статус тривоги невідомий». That's expected: the Worker only
answers the GitHub Pages origin.

## Setup from scratch

1. **Repo + Pages.** Push to GitHub, then Settings → Pages → Deploy from a branch → `main`, `/ (root)`.
2. **Scraper.** Nothing to configure. Actions → «Оновлення розкладу» → Run workflow to test it.
3. **Fonts.** e-Ukraine woff2 files are already in `fonts/`. To regenerate from the official OTFs:
   `python -c "from fontTools.ttLib import TTFont as F; f=F('e-Ukraine-Regular.otf'); f.flavor='woff2'; f.save('e-Ukraine-Regular.woff2')"`
   (needs `pip install fonttools brotli`).
4. **Worker.**
   ```bash
   cd worker
   npx wrangler login
   npx wrangler deploy
   ```
   Put the printed URL in `js/config.js` (`ALARM_WORKER_URL`). If the site's address changes,
   update `ALLOWED_ORIGINS` in `worker/wrangler.toml` and deploy again.

## Common changes

- **New academic year / different group.** The group ID changes. Follow the ID lookup in
  [RECON.md](RECON.md) and update `GROUP_ID`, `GROUP_NAME` and `SUBGROUP` in `scraper/scrape.mjs`.
- **Wording.** Everything is in `js/strings.js`.
- **Colours.** The tokens at the top of `css/styles.css` (light) and in the dark-mode block.
  `npm test` checks that text contrast stays at WCAG AA.
- **A new icon.** Add its name to `icon_names` in `index.html`, in alphabetical order, and to the
  comment list above it. A test fails if an icon used in `js/` is missing.

## Credits

- Font [e-Ukraine](https://thedigital.gov.ua/fonts) by the Ministry of Digital Transformation of Ukraine
- Icons [Material Symbols](https://fonts.google.com/icons) by Google (Apache 2.0)
- Schedule data: [OSAU](https://osau.edu.ua/pro-universytet/pratsivnykam/rozklad-zanyat/) via vnz.osvita.net
- Air alarm data: [ubilling.net.ua/aerialalerts](https://ubilling.net.ua/aerialalerts/)

Made by Артем Сирніков.
