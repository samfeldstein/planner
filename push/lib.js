// Pure helpers for the push Worker: validation, the subscription list, local-hour matching, and VAPID
// signing. No Cloudflare APIs, so Node's test runner can import it. No dependencies.

export const MAX_SUBS = 3;
const DAY_MS = 24 * 36e5;
const encoder = new TextEncoder();

// The app is iPhone-only, so only Apple's push service is accepted.
export function validEndpoint(endpoint) {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && (u.hostname === 'web.push.apple.com' || u.hostname.endsWith('.push.apple.com'));
  } catch {
    return false;
  }
}

export function validZone(tz) {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const validHour = (h) => Number.isInteger(h) && h >= 0 && h <= 23;

const isText = (v) => typeof v === 'string' && v.length > 0 && v.length < 512;

// Returns { entry } for a good /subscribe body, or { error }.
export function parseSubscribe(body) {
  const sub = body?.subscription;
  if (!isText(sub?.endpoint) || !validEndpoint(sub.endpoint)) return { error: 'bad endpoint' };
  if (!isText(sub.keys?.p256dh) || !isText(sub.keys?.auth)) return { error: 'bad keys' };
  if (!validZone(body.tz)) return { error: 'bad tz' };
  if (!validHour(body.hour)) return { error: 'bad hour' };
  return { entry: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, tz: body.tz, hour: body.hour } };
}

// Add or refresh a subscription. changed is false when nothing needs writing: same endpoint, tz, and
// hour, last seen under a day ago. Over the cap, the least recently seen are dropped.
export function upsert(subs, entry, now, max = MAX_SUBS) {
  const old = subs.find((s) => s.endpoint === entry.endpoint);
  if (old && old.tz === entry.tz && old.hour === entry.hour && now - old.seen < DAY_MS) return { subs, changed: false };
  const others = subs.filter((s) => s.endpoint !== entry.endpoint).sort((a, b) => a.seen - b.seen);
  const kept = others.slice(Math.max(0, others.length - (max - 1)));
  return { subs: [...kept, { ...entry, seen: now }], changed: true };
}

export const remove = (subs, endpoint) => subs.filter((s) => s.endpoint !== endpoint);

// The hour (0-23) it is in `tz` at `now`.
export function localHour(now, tz) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).formatToParts(now);
  return Number(parts.find((p) => p.type === 'hour').value);
}

export const isDue = (sub, now) => localHour(now, sub.tz) === sub.hour;

export function corsHeaders(origin, allowed) {
  if (!allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST',
    'access-control-allow-headers': 'content-type',
    vary: 'origin',
  };
}

export function toBase64Url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const jsonPart = (obj) => toBase64Url(encoder.encode(JSON.stringify(obj)));

export const audienceOf = (endpoint) => new URL(endpoint).origin;

// A VAPID JWT (ES256). WebCrypto's ECDSA signature is raw r||s, which is what JWS wants.
export async function makeJwt({ aud, sub, exp }, privateJwk) {
  const key = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const input = `${jsonPart({ typ: 'JWT', alg: 'ES256' })}.${jsonPart({ aud, exp, sub })}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(input));
  return `${input}.${toBase64Url(new Uint8Array(sig))}`;
}

export const vapidHeader = (jwt, publicKey) => `vapid t=${jwt}, k=${publicKey}`;

// How to treat the push service's answer: drop the subscription, count it sent, or keep it and log.
export const classify = (status) => (status === 404 || status === 410 ? 'gone' : status >= 200 && status < 300 ? 'sent' : 'failed');
