# Пари

A personal dashboard for studying online at Odesa State Agrarian University (ОДАУ).
One calm screen that answers: **what should I be doing right now, and what's next?**

- The current or next class, with a big «Приєднатися» button for its Zoom/Meet link
- Live status: live, starting soon, break, done for today, weekend
- Pauses for air alarms in Odesa oblast, and says so when the alarm status is unknown
- Today's classes, a preview of tomorrow that opens the days ahead, and when the schedule was last updated
- **Завдання**: tasks with notes, a subject and a due date («До пари» picks the next class of that
  subject); tap one to edit it. What's due within a week shows on the home screen, and classes with
  something due get a marker
- **Викладачі**: everyone in the schedule, what they teach, and a one-tap email with the subject
  filled in once you've added their address
- A floating tab bar (Пари · Завдання · Викладачі); settings, the days ahead and `#join` stay sub-screens
- Installable on a phone's home screen, light and dark mode, Ukrainian UI
- Optional push reminders before class (5/10/15 min), and optional pushes when an alert
  starts or ends mid-class

Live site: https://syrnikov.github.io/eSchedule/

## How it works

```
GitHub Actions (every 3 h) ──> vnz.osvita.net schedule API ──> data/schedule.json (committed)
                                                                      │
GitHub Pages (static site) <──────────────────────────────────────────┘
        ├── every 60 s ──> Cloudflare Worker ──> ubilling.net.ua/aerialalerts (air alarms)
        ├── push subscription + group + prefs ──> Worker ──> D1 (no names, no links)
        └── meeting links ──> localStorage on your device only (never committed)

Worker cron (every minute) ──> schedule.json from Pages (cached 30 min in KV)
                           ──> "Через 5 хв — …" pushes (Web Push, VAPID, Web Crypto only)
```

- **No build step, no framework, no browser dependencies.** Plain HTML, CSS and ES modules.
- The OSAU page embeds a widget from vnz.osvita.net; the scraper calls its JSON API directly.
  Details (endpoint, IDs, quirks) are in [RECON.md](RECON.md).
- The alarm feed has no CORS headers, so a tiny Cloudflare Worker proxies it for this site only.
- Links often contain passcodes, so they live only in your browser. Use export/import in
  settings to back them up or move them to another device.
- «Поділитися з групою» puts the links in the URL's `#fragment` (compressed), which browsers
  never send to a server. Opening such a URL shows one page («10 посилань на пари від групи»)
  with one button; nothing is saved until the student taps it. Everything is ticked by default,
  the list of what's inside is collapsed, and links that would replace the student's own are
  counted on the page.
- First launch is a few full-screen pages: links from the group (if any), what the app does,
  "add to the home screen" (iPhone in a browser tab), the name, reminders. On iPhone the
  home-screen app has its own empty storage, so while a share is pending in a browser tab it
  stays in the address bar and the manifest is dropped: the app is then added with the share in
  its start address and imports the links itself. Each share is offered once (`pary.share.seen`).
- «Що нового» is a sheet shown once per `STRINGS.whatsNew.version` to students who already use
  the app.
- Each «Приєднатися» tap is logged in IndexedDB on the device (time, class, minutes from start,
  alert on/off). The home card says how many classes you joined through the app this week; a
  tap isn't attendance, so it never says "attendance", shows percentages, or mentions missed
  classes. Settings → Статистика clears it; the backup file includes it.
- Push messages carry only subject, type, teacher and start time. Tapping one opens the app,
  where the link is: a reminder or an all-clear opens `#join` (that class and one big
  «Приєднатися»), an alert opens the home screen. Alert and all-clear pushes also go out when a
  class starts within 15 minutes, and a reminder sent during an alert says so. `sw.js` handles pushes only: it has no fetch handler and caches nothing.

## Project layout

| Path | What it is |
|---|---|
| `index.html`, `css/styles.css` | The page and its styles (colours are CSS variables) |
| `js/main.js` | Boot, rendering, render loop, routing between main screen and settings |
| `js/status.js` | `computeStatus(now, schedule, alarm)`, a pure function; the core logic |
| `js/alarm.js` | Polls the Worker and tracks alarm state |
| `js/settings.js`, `js/links.js` | Settings screen; link storage, import/export |
| `js/voice.js` | Greeting, day summary, tomorrow’s tone, subject accent colour (pure) |
| `js/profile.js`, `js/onboarding.js` | The name to greet you by and the last «Що нового» seen (device only); first-launch pages, including links from the group |
| `js/tabbar.js` | The floating tab bar (`#`, `#tasks`, `#teachers`); tabs replace the history entry |
| `js/tasks.js`, `js/tasks-view.js` | Tasks in localStorage (`pary.tasks.v1`), grouping by due date (pure); the «Завдання» tab |
| `js/contacts.js`, `js/teachers-view.js` | Teachers' emails in localStorage (`pary.contacts.v1`, keyed like teacher links), `mailto:` building; the «Викладачі» tab |
| `js/days-view.js`, `js/join-view.js`, `js/class-row.js` | «Наступні дні» (`#days`); the screen a push opens (`#join`); the class row both lists share |
| `js/format.js` | Kyiv time and Ukrainian formatting |
| `js/strings.js` | **All UI text** |
| `js/config.js` | Worker URL and alarm region |
| `scraper/` | `scrape.mjs` (fetch + write), `parse.mjs` (pure), saved API responses in `fixtures/` |
| `worker/` | Cloudflare Worker and `wrangler.toml`: alarm proxy (`worker.js`), push API + cron (`push.js`), Web Push crypto (`webpush.js`), D1 schema (`migrations/`) |
| `js/share.js` | «Поділитися з групою»: links (and teachers' emails) in the URL #fragment, and which shares were already offered |
| `js/push.js`, `sw.js` | Browser side of push: support detection, subscribe, service worker |
| `js/stats.js`, `js/backup.js` | Local «Приєднатися» taps (IndexedDB) and the weekly card; backup file (v3 = links + stats + emails + tasks; v2 and v1 still import) |
| `.github/workflows/scrape.yml` | Scheduled scraper |
| `tests/` | `node:test` tests |

## Running locally

Needs Node 22.13+ for the tests (they use `node:sqlite`); the site itself needs nothing.

```bash
npm test                         # all tests
npm run scrape                   # refresh data/schedule.json from the live API
python -m http.server 8765       # then open http://127.0.0.1:8765
```

Debug URL parameters for checking states by hand:

- `?now=2026-09-28T08:30` pretends it's that time in Kyiv
- `?alarm=alert`, `?alarm=unknown`, `?alarm=resumed`, `?alarm=clear` fakes the alarm
- `#days` and `#join` open those screens directly (`#join` falls back to the home screen when
  there is no class to join or no link for it)

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
5. **Push reminders** (from `worker/`, once):
   ```bash
   npx wrangler d1 create pary-push              # put database_id in wrangler.toml
   npx wrangler kv namespace create CACHE        # put id in wrangler.toml
   npx wrangler d1 migrations apply pary-push --remote
   node scripts/vapid-keys.mjs                   # public key -> VAPID_PUBLIC_KEY in wrangler.toml
   npx wrangler secret put VAPID_PRIVATE_KEY     # paste the private key
   npx wrangler deploy
   ```
   Groups that may subscribe are listed under `[vars.GROUPS]` in `wrangler.toml`.
   The free plan allows 50 outgoing requests per run, so the cron sends at most 40 pushes a
   minute; the rest go out the next minute.

## Common changes

- **New academic year / different group.** The group ID changes. Follow the ID lookup in
  [RECON.md](RECON.md) and update `GROUP_ID`, `GROUP_NAME` and `SUBGROUP` in `scraper/scrape.mjs`.
- **Wording.** Everything is in `js/strings.js`. Arrays are pools of variants; `pick()` chooses one
  per day, so text varies day to day but never flickers.
- **Colours.** The tokens at the top of `css/styles.css` (light) and in the dark-mode block.
  `npm test` checks that text contrast stays at WCAG AA.
- **A new icon.** Add its name to `ICONS` in `scripts/icons.mjs` (alphabetical), then run
  `node scripts/icons.mjs` to rebuild the self-hosted font in `fonts/`. A test fails if an icon
  used in `js/` is missing, or if the font wasn't rebuilt.

## Credits

- Font [e-Ukraine](https://thedigital.gov.ua/fonts) by the Ministry of Digital Transformation of Ukraine
- Icons [Material Symbols](https://fonts.google.com/icons) by Google (Apache 2.0)
- Schedule data: [OSAU](https://osau.edu.ua/pro-universytet/pratsivnykam/rozklad-zanyat/) via vnz.osvita.net
- Air alarm data: [ubilling.net.ua/aerialalerts](https://ubilling.net.ua/aerialalerts/)

Made by Артем Сирніков.
