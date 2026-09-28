// Prints a new VAPID key pair for Web Push.
//   node scripts/vapid-keys.mjs
// Put the public key in wrangler.toml (VAPID_PUBLIC_KEY) and the private one in a secret:
//   npx wrangler secret put VAPID_PRIVATE_KEY
// Changing keys later invalidates every existing subscription (students re-enable reminders).

import { b64urlEncode } from "../webpush.js";

const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const publicKey = b64urlEncode(await crypto.subtle.exportKey("raw", pair.publicKey));
const { d } = await crypto.subtle.exportKey("jwk", pair.privateKey);

console.log(`VAPID_PUBLIC_KEY  ${publicKey}`);
console.log(`VAPID_PRIVATE_KEY ${d}`);
