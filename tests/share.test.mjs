// Sharing links through the URL #fragment: round trip, hostile input, and the import diff.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import {
  encodeShare, decodeShare, validateShared, diffShare, isLinkKey, describeKey, shareUrl,
  SHARE_PREFIX, MAX_ENTRIES, MAX_FRAGMENT_LENGTH,
  shareId, rememberShare,
} from "../js/share.js";
import { exportJson, parseImport } from "../js/links.js";

const LINKS = {
  "@Дядюра К. О.": "https://us02web.zoom.us/j/123?pwd=abc",
  "@Насакіна С. В.": "https://meet.google.com/abc-defg-hij",
  "Кураторська година|Лекції": "https://zoom.us/j/999",
};
const b64url = (buf) => Buffer.from(buf).toString("base64url");
const raw = (obj) => `j${b64url(JSON.stringify(obj))}`;
const zipped = (obj) => `z${b64url(deflateRawSync(JSON.stringify(obj)))}`;
const code = async (fragment) => {
  try { await decodeShare(fragment); return "ok"; } catch (err) { return err.code; }
};

test("round trip: compressed, URL-safe, fragment only", async () => {
  const encoded = await encodeShare(LINKS);
  assert.equal(encoded[0], "z");
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(await decodeShare(encoded), LINKS);
  const url = shareUrl("https://syrnikov.github.io/eSchedule/", encoded);
  assert.equal(new URL(url).hash, `${SHARE_PREFIX}${encoded}`);
  assert.equal(new URL(url).search, "", "nothing in the part that reaches the server");
});

test("uncompressed fallback decodes too", async () => {
  assert.deepEqual(await decodeShare(raw({ v: 1, links: LINKS })), LINKS);
});

test("drops bad entries: non-https, javascript:, odd keys", async () => {
  const links = await decodeShare(raw({
    v: 1,
    links: {
      ...LINKS,
      "@Evil": "javascript:alert(1)",
      "@Plain": "http://zoom.us/j/1",
      "@Html": "https://x.test/<img src=x onerror=alert(1)>", // valid URL: kept, and rendered as text
      "no-separator": "https://zoom.us/j/2",
      "a|b|c": "https://zoom.us/j/3",
      "@": "https://zoom.us/j/4",
      " @Spaces": "https://zoom.us/j/5",
      "__proto__": "https://zoom.us/j/6",
    },
  }));
  assert.deepEqual(Object.keys(links).sort(), [...Object.keys(LINKS), "@Html"].sort());
  assert.equal(Object.getPrototypeOf(links), Object.prototype);
});

test("rejects broken, wrong-version, empty and oversized payloads", async () => {
  assert.equal(await code(""), "broken");
  assert.equal(await code("x123"), "broken");
  assert.equal(await code("z!!!"), "broken");
  assert.equal(await code("zAAAA"), "broken"); // not deflate data
  assert.equal(await code(raw({ v: 2, links: LINKS })), "broken");
  assert.equal(await code(raw({ v: 1, links: [] })), "broken");
  assert.equal(await code(raw({ v: 1, links: { "@A": "http://x" } })), "broken"); // nothing valid left
  assert.equal(await code(raw([1, 2])), "broken");
  assert.equal(await code(`j${b64url("not json")}`), "broken");
  assert.equal(await code(`j${"A".repeat(MAX_FRAGMENT_LENGTH)}`), "broken");
});

test("a zip bomb is stopped at the size cap", async () => {
  const bomb = { v: 1, links: { "@A": `https://x.test/${"a".repeat(500_000)}` } };
  const fragment = zipped(bomb);
  assert.ok(fragment.length < MAX_FRAGMENT_LENGTH, "small enough to pass the first check");
  assert.equal(await code(fragment), "broken");
});

test("entry count is capped", () => {
  const many = Object.fromEntries(Array.from({ length: MAX_ENTRIES + 50 }, (_, i) => [`@T${i}`, `https://zoom.us/j/${i}`]));
  assert.equal(Object.keys(validateShared({ v: 1, links: many })).length, MAX_ENTRIES);
});

test("link keys and their labels", () => {
  assert.ok(isLinkKey("@Дядюра К. О."));
  assert.ok(isLinkKey("Трактори і автомобілі|Практичні"));
  assert.ok(!isLinkKey("@"));
  assert.ok(!isLinkKey("|Лекції"));
  assert.ok(!isLinkKey("x".repeat(400)));
  assert.deepEqual(describeKey("@Дядюра К. О."), { kind: "teacher", title: "Дядюра К. О.", sub: "" });
  assert.deepEqual(describeKey("Кураторська година|Лекції"), { kind: "pair", title: "Кураторська година", sub: "Лекції" });
});

test("diff: new, replace (keeps yours visible), same; teachers first", () => {
  const mine = { "@Дядюра К. О.": "https://zoom.us/j/old", "@Насакіна С. В.": LINKS["@Насакіна С. В."] };
  const diff = diffShare(LINKS, mine);
  assert.deepEqual(diff.map((d) => [d.key, d.status]), [
    ["@Дядюра К. О.", "replace"],
    ["@Насакіна С. В.", "same"],
    ["Кураторська година|Лекції", "new"],
  ]);
  assert.equal(diff[0].current, "https://zoom.us/j/old");
});

test("the JSON export/import format is unchanged", () => {
  assert.deepEqual(parseImport(exportJson(LINKS)), LINKS);
});

test("a share is recognised again by a short id, not by its links", async () => {
  const a = await encodeShare({ "@Дядюра К. О.": "https://zoom.us/j/1?pwd=secret" });
  const b = await encodeShare({ "@Дядюра К. О.": "https://zoom.us/j/2?pwd=secret" });
  assert.equal(shareId(a), shareId(a));
  assert.notEqual(shareId(a), shareId(b));
  assert.ok(shareId(a).length < 20);
  assert.doesNotMatch(shareId(a), /secret|zoom/);
});

test("rememberShare keeps the newest ids, without duplicates", () => {
  assert.deepEqual(rememberShare(["a", "b"], "a"), ["b", "a"]);
  const many = Array.from({ length: 30 }, (_, i) => `id${i}`);
  const kept = many.reduce(rememberShare, []);
  assert.equal(kept.length, 20);
  assert.equal(kept.at(-1), "id29");
});
