// Makes the VAPID key pair. The public key (base64url, raw 65 bytes) goes to stderr; the private key
// (JWK JSON) goes to stdout, so it can be piped straight into a Worker secret and never shown:
//   node push/make-keys.mjs | npx wrangler secret put VAPID_PRIVATE

import { toBase64Url } from './lib.js';

if (process.stdout.isTTY) {
  console.error('Pipe this into the secret so the private key stays off the screen:\n  node push/make-keys.mjs | npx wrangler secret put VAPID_PRIVATE');
  process.exit(1);
}

const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const raw = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey));
console.error(`Public key (for badge.js and wrangler.jsonc):\n${toBase64Url(raw)}`);
process.stdout.write(JSON.stringify(await crypto.subtle.exportKey('jwk', privateKey)));
