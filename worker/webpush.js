// Web Push on Web Crypto only: payload encryption (RFC 8291, aes128gcm) and VAPID (RFC 8292).
// No Node APIs, so it runs as-is on Cloudflare Workers (and in Node 20+ for tests).

const enc = new TextEncoder();
const subtle = globalThis.crypto.subtle;

// --- base64url ---

export function b64urlDecode(text) {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function b64urlEncode(bytes) {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};

// --- Keys ---

// Uncompressed P-256 public key (65 bytes: 0x04 || x || y) -> JWK coordinates.
function publicJwk(raw) {
  if (raw.length !== 65 || raw[0] !== 4) throw new Error("webpush: bad P-256 public key");
  return { kty: "EC", crv: "P-256", x: b64urlEncode(raw.slice(1, 33)), y: b64urlEncode(raw.slice(33)) };
}

function importPrivate(publicRaw, privateB64, usage) {
  const jwk = { ...publicJwk(publicRaw), d: privateB64, ext: true };
  const algo = usage === "sign" ? { name: "ECDSA", namedCurve: "P-256" } : { name: "ECDH", namedCurve: "P-256" };
  return subtle.importKey("jwk", jwk, algo, false, [usage === "sign" ? "sign" : "deriveBits"]);
}

async function hkdf(salt, ikm, info, bytes) {
  const key = await subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

// --- RFC 8291: encrypt one message for one subscription ---
// For tests only: `fixed` = { salt, serverPublic, serverPrivate } (base64url) makes the output deterministic.
export async function encryptPayload(plaintext, { p256dh, auth }, fixed = null) {
  const uaPublic = b64urlDecode(p256dh);
  const authSecret = b64urlDecode(auth);
  if (authSecret.length !== 16) throw new Error("webpush: bad auth secret");

  let asPublic, asPrivateKey;
  if (fixed) {
    asPublic = b64urlDecode(fixed.serverPublic);
    asPrivateKey = await importPrivate(asPublic, fixed.serverPrivate, "derive");
  } else {
    const pair = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    asPublic = new Uint8Array(await subtle.exportKey("raw", pair.publicKey));
    asPrivateKey = pair.privateKey;
  }
  const salt = fixed ? b64urlDecode(fixed.salt) : crypto.getRandomValues(new Uint8Array(16));

  const uaKey = await subtle.importKey("jwk", publicJwk(uaPublic), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await subtle.deriveBits({ name: "ECDH", public: uaKey }, asPrivateKey, 256));

  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  // One record: plaintext + 0x02 (last-record delimiter), no extra padding.
  const record = concat(typeof plaintext === "string" ? enc.encode(plaintext) : plaintext, new Uint8Array([2]));
  const aesKey = await subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, record));

  // Header: salt (16) | record size (4, big-endian) | key id length (1) | server public key (65)
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}

// --- RFC 8292: VAPID Authorization header ---
export async function vapidHeader(endpoint, { publicKey, privateKey, subject }, nowSeconds = Math.floor(Date.now() / 1000)) {
  const jwtHeader = b64urlEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64urlEncode(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: nowSeconds + 12 * 3600,
    sub: subject,
  })));
  const unsigned = `${jwtHeader}.${claims}`;
  const key = await importPrivate(b64urlDecode(publicKey), privateKey, "sign");
  // Web Crypto returns the raw r||s form, which is exactly what JWS ES256 wants.
  const sig = await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(unsigned));
  return `vapid t=${unsigned}.${b64urlEncode(sig)}, k=${publicKey}`;
}

// Sends one push. Returns the push service's HTTP status (201 = accepted, 404/410 = gone).
export async function sendPush(subscription, message, vapid, { fetchImpl = fetch, ttl = 600, urgency = "high" } = {}) {
  const body = await encryptPayload(JSON.stringify(message), subscription.keys);
  const res = await fetchImpl(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidHeader(subscription.endpoint, vapid),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttl),
      Urgency: urgency,
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  return res.status;
}
