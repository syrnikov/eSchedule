// Checks on static assets: colour contrast, the icon font subset, and the web app manifest.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { STRINGS } from "../js/strings.js";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const css = await read("css/styles.css");
const html = await read("index.html");

// --- Contrast (WCAG AA: 4.5:1 for normal text) ---

// Pulls "--name: value" pairs out of a CSS block.
function tokens(block) {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
const light = tokens(css.match(/:root \{[\s\S]*?\n\}/)[0]);
const dark = { ...light, ...tokens(css.match(/@media \(prefers-color-scheme: dark\) \{[\s\S]*?\n\}\n/)[0]) };

function parseColor(value) {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1);
  const rgba = value.match(/^rgba?\(([^)]+)\)$/);
  if (rgba) { const [r, g, b, a = 1] = rgba[1].split(",").map(Number); return [r, g, b, a]; }
  throw new Error(`can't parse colour ${value}`);
}
// Composites a (possibly translucent) colour over an opaque background.
function over(fg, bg) {
  const [r, g, b, a] = fg;
  return [0, 1, 2].map((i) => [r, g, b][i] * a + bg[i] * (1 - a)).concat(1);
}
function luminance([r, g, b]) {
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(theme, fgName, bgName, base = "card") {
  const baseColor = parseColor(theme[base]);
  const bg = over(parseColor(theme[bgName]), baseColor);
  const fg = over(parseColor(theme[fgName]), bg);
  const [l1, l2] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

// [text, background] pairs actually used in the UI.
const PAIRS = [
  ["text", "card"], ["muted", "card"],
  ["live", "card"], ["soon", "card"], ["alarm", "card"],
  ["live", "live-soft"], ["soon", "soon-soft"], ["alarm", "alarm-soft"],
  ["muted", "neutral-soft"], ["text", "input-bg"], ["muted", "input-bg"],
  ["btn-text", "btn-bg"],
];

for (const [name, theme] of [["light", light], ["dark", dark]]) {
  test(`contrast ≥ 4.5:1 in ${name} mode`, () => {
    for (const [fg, bg] of PAIRS) {
      const ratio = contrast(theme, fg, bg);
      assert.ok(ratio >= 4.5, `${fg} on ${bg}: ${ratio.toFixed(2)}`);
    }
    // Muted text also sits directly on the page gradient (date, footer).
    for (const bg of ["bg-1", "bg-2"]) {
      const ratio = contrast(theme, "muted", bg, bg);
      assert.ok(ratio >= 4.5, `muted on ${bg}: ${ratio.toFixed(2)}`);
    }
  });
}

// --- Icon font subset ---

test("every icon used in js/ is in the font subset, which is sorted", async () => {
  const subset = html.match(/icon_names=([a-z_,]+)/)[1].split(",");
  assert.deepEqual(subset, [...subset].sort(), "icon_names must be alphabetical");

  const used = new Set([...Object.values(STRINGS.data.typeIcons), STRINGS.data.defaultTypeIcon]);
  for (const file of await readdir(new URL("../js/", import.meta.url))) {
    const src = await read(`js/${file}`);
    for (const m of src.matchAll(/icon\("([a-z_]+)"/g)) used.add(m[1]);
    const statusIcons = src.match(/const STATUS_ICONS = \{([\s\S]*?)\};/);
    if (statusIcons) for (const m of statusIcons[1].matchAll(/"([a-z_]+)"/g)) used.add(m[1]);
  }
  used.add("settings"); // written directly in index.html
  for (const name of used) assert.ok(subset.includes(name), `missing from icon_names: ${name}`);
});

// --- Manifest ---

function pngSize(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test("manifest icons exist with the declared sizes", async () => {
  const manifest = JSON.parse(await read("manifest.webmanifest"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.lang, "uk");
  assert.ok(manifest.icons.some((i) => i.purpose === "maskable"));
  for (const icon of manifest.icons) {
    const buf = await readFile(new URL(`../${icon.src}`, import.meta.url));
    const { width, height } = pngSize(buf);
    assert.equal(`${width}x${height}`, icon.sizes, icon.src);
  }
  const apple = pngSize(await readFile(new URL("../icons/apple-touch-icon.png", import.meta.url)));
  assert.equal(apple.width, 180);
});
