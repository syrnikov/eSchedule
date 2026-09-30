// The icon font: Material Symbols Rounded (filled, weight 500), subset to the icons we use
// and served from our own site. Self-hosting means no third-party timing: the @font-face is in
// css/styles.css, so it exists before main.js checks for it (on iOS home-screen apps the
// Google Fonts stylesheet could arrive after that check, and the icons stayed hidden).
//
// Added an icon? Put it in ICONS (alphabetical), then run:
//   node scripts/icons.mjs
// which downloads the new subset to fonts/. `npm test` fails if an icon used in js/ is missing
// here, or if the font file wasn't rebuilt after ICONS changed.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const ICONS = [
  "add_box", "add_link", "arrow_back", "calendar_month", "celebration", "check_circle", "chevron_right",
  "cloud_off", "coffee", "download", "edit_note", "expand_more", "group", "history", "ios_share",
  "link_off", "lock", "notifications", "open_in_browser", "radio_button_checked", "schedule", "school",
  "science", "settings", "upload", "videocam", "warning", "weekend",
];

export const FONT_FILE = "fonts/material-symbols-rounded.woff2";
export const MANIFEST_FILE = "fonts/material-symbols-rounded.json"; // which ICONS the file was built from

async function build() {
  const css = new URL("https://fonts.googleapis.com/css2");
  css.searchParams.set("family", "Material Symbols Rounded:opsz,wght,FILL,GRAD@20..48,500,1,0");
  css.searchParams.set("icon_names", ICONS.join(","));
  css.searchParams.set("display", "block");
  // A modern desktop UA gets woff2.
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
  const text = await (await fetch(css, { headers: { "User-Agent": ua } })).text();
  const url = text.match(/src:\s*url\(([^)]+)\)\s*format\('woff2'\)/)?.[1];
  if (!url) throw new Error(`no woff2 in Google Fonts response:\n${text.slice(0, 500)}`);

  const font = Buffer.from(await (await fetch(url)).arrayBuffer());
  if (font.subarray(0, 4).toString("latin1") !== "wOF2") throw new Error("download is not a woff2 file");
  const root = new URL("../", import.meta.url);
  await writeFile(new URL(FONT_FILE, root), font);
  await writeFile(new URL(MANIFEST_FILE, root), `${JSON.stringify({ icons: ICONS }, null, 2)}\n`);
  console.log(`${FONT_FILE}: ${ICONS.length} icons, ${font.length} bytes`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await build();
