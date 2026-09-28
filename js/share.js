// Sharing links with the group, with no server: the links travel inside the URL's #fragment,
// which browsers never send anywhere. Format after "#share=":
//   "z" + base64url(deflate-raw(JSON))   when CompressionStream exists (all current browsers)
//   "j" + base64url(JSON)                fallback
// JSON = { v: 1, links: { "@Teacher": "https://…", "Discipline|Type": "https://…" } }
//
// Everything that arrives is untrusted: sizes are capped before and after decompressing, the
// shape is checked, only https links survive, and the UI renders it all as text.

import { isValidUrl } from "./links.js";

export const SHARE_PREFIX = "#share=";
const VERSION = 1;
export const MAX_FRAGMENT_LENGTH = 32_000; // characters after "#share="
export const MAX_JSON_BYTES = 100_000; // after decompressing (a zip bomb stops here)
export const MAX_ENTRIES = 300;
const MAX_KEY_LENGTH = 300;

// Errors carry a code the UI can explain: "broken" | "unsupported".
const fail = (code) => Object.assign(new Error(`share: ${code}`), { code, fromShare: true });

// --- base64url ---

function toB64url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(text) {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw fail("broken");
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
  try {
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch {
    throw fail("broken");
  }
}

// --- Streams ---

async function readAll(stream, cap) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > cap) {
      await reader.cancel().catch(() => {});
      throw fail("broken");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

const through = (bytes, transform) => new Blob([bytes]).stream().pipeThrough(transform);

// --- Keys ---

// A link key is "@Teacher" or "Discipline|Type" (see links.js).
export function isLinkKey(key) {
  if (typeof key !== "string" || key.length > MAX_KEY_LENGTH || key !== key.trim()) return false;
  if (key.startsWith("@")) return key.length > 1;
  const [discipline, type, ...rest] = key.split("|");
  return rest.length === 0 && Boolean(discipline?.trim()) && type !== undefined;
}

// "@Дядюра К. О." -> { kind: "teacher", title: "Дядюра К. О.", sub: "" }
export function describeKey(key) {
  if (key.startsWith("@")) return { kind: "teacher", title: key.slice(1), sub: "" };
  const [discipline, type] = key.split("|");
  return { kind: "pair", title: discipline, sub: type };
}

// Keeps only well-formed "key -> https URL" pairs, capped in number.
export function validateShared(data) {
  if (!data || typeof data !== "object" || data.v !== VERSION) throw fail("broken");
  const links = data.links;
  if (!links || typeof links !== "object" || Array.isArray(links)) throw fail("broken");
  const out = {};
  let count = 0;
  for (const [key, url] of Object.entries(links)) {
    if (++count > MAX_ENTRIES) break;
    if (isLinkKey(key) && isValidUrl(url)) out[key] = url;
  }
  if (Object.keys(out).length === 0) throw fail("broken");
  return out;
}

// --- Encode / decode ---

export async function encodeShare(links) {
  const sorted = Object.fromEntries(Object.entries(links).sort(([a], [b]) => a.localeCompare(b, "uk")));
  const bytes = new TextEncoder().encode(JSON.stringify({ v: VERSION, links: sorted }));
  if (typeof CompressionStream === "function") {
    const packed = await readAll(through(bytes, new CompressionStream("deflate-raw")), Infinity);
    return `z${toB64url(packed)}`;
  }
  return `j${toB64url(bytes)}`;
}

export async function decodeShare(fragment) {
  if (typeof fragment !== "string" || fragment.length < 2 || fragment.length > MAX_FRAGMENT_LENGTH) throw fail("broken");
  const kind = fragment[0];
  const bytes = fromB64url(fragment.slice(1));
  let json;
  if (kind === "z") {
    if (typeof DecompressionStream !== "function") throw fail("unsupported");
    try {
      json = await readAll(through(bytes, new DecompressionStream("deflate-raw")), MAX_JSON_BYTES);
    } catch (err) {
      throw err.fromShare ? err : fail("broken"); // anything else: corrupt deflate data
    }
  } else if (kind === "j") {
    if (bytes.length > MAX_JSON_BYTES) throw fail("broken");
    json = bytes;
  } else {
    throw fail("broken");
  }
  let data;
  try {
    data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(json));
  } catch {
    throw fail("broken");
  }
  return validateShared(data);
}

export const shareUrl = (base, encoded) => `${base}${SHARE_PREFIX}${encoded}`;

// What importing would do, entry by entry. Teachers first, then per-class links, by name.
// status: "new" | "replace" (you have a different link) | "same" (you already have this one)
export function diffShare(incoming, current) {
  return Object.entries(incoming)
    .map(([key, url]) => {
      const mine = current[key];
      const status = !mine ? "new" : mine === url ? "same" : "replace";
      return { key, url, status, current: mine ?? null, ...describeKey(key) };
    })
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "teacher" ? -1 : 1) ||
      a.title.localeCompare(b.title, "uk") || a.sub.localeCompare(b.sub, "uk"));
}
