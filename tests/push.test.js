import test from 'node:test';
import assert from 'node:assert/strict';
import { audienceOf, classify, corsHeaders, isDue, localHour, makeJwt, parseSubscribe, remove, toBase64Url, upsert, validEndpoint, validHour, validZone, vapidHeader } from '../push/lib.js';
import { readFileSync } from 'node:fs';
import worker, { sendAll } from '../push/index.js';
import { configProblem } from '../push/lib.js';

const APPLE = 'https://web.push.apple.com/abc123';
const keys = { p256dh: 'k1', auth: 'k2' };
const body = (over = {}) => ({ subscription: { endpoint: APPLE, keys }, tz: 'America/Chicago', hour: 7, ...over });
const entry = (n, over = {}) => ({ endpoint: `https://web.push.apple.com/${n}`, keys, tz: 'UTC', hour: 7, ...over });

test('only https Apple push endpoints pass', () => {
  assert.ok(validEndpoint(APPLE));
  assert.ok(validEndpoint('https://api.sandbox.push.apple.com/x'));
  for (const bad of ['http://web.push.apple.com/x', 'https://push.apple.com.evil.com/x', 'https://evilpush.apple.com.example/x', 'https://fcm.googleapis.com/x', 'nope', '']) {
    assert.equal(validEndpoint(bad), false, bad);
  }
});

test('time zones and hours are validated', () => {
  assert.ok(validZone('Australia/Lord_Howe'));
  for (const bad of ['Nowhere/City', '', null, 5]) assert.equal(validZone(bad), false);
  assert.ok(validHour(0) && validHour(23));
  for (const bad of [-1, 24, 7.5, '7', null]) assert.equal(validHour(bad), false);
});

test('parseSubscribe returns an entry or the first problem', () => {
  assert.equal(parseSubscribe(body()).entry.tz, 'America/Chicago');
  assert.equal(parseSubscribe(body({ tz: 'x/y' })).error, 'bad tz');
  assert.equal(parseSubscribe(body({ hour: 30 })).error, 'bad hour');
  assert.equal(parseSubscribe(body({ subscription: { endpoint: 'https://example.com/x', keys } })).error, 'bad endpoint');
  assert.equal(parseSubscribe(body({ subscription: { endpoint: APPLE } })).error, 'bad keys');
  assert.equal(parseSubscribe(null).error, 'bad endpoint');
});

test('the local hour follows the time zone across a DST change', () => {
  const ny = 'America/New_York';
  assert.equal(localHour(new Date('2026-03-07T12:00:00Z'), ny), 7); // EST
  assert.equal(localHour(new Date('2026-03-08T11:00:00Z'), ny), 7); // EDT, the day DST starts
  assert.equal(localHour(new Date('2026-03-08T12:00:00Z'), ny), 8);
  assert.equal(localHour(new Date('2026-11-01T05:30:00Z'), ny), 1);
  assert.equal(localHour(new Date('2026-01-01T00:00:00Z'), 'UTC'), 0);
  assert.ok(isDue({ tz: ny, hour: 7 }, new Date('2026-03-08T11:00:00Z')));
  assert.equal(isDue({ tz: ny, hour: 7 }, new Date('2026-03-08T12:00:00Z')), false);
});

test('upsert adds, skips an unchanged recent write, and refreshes an old one', () => {
  const day = 24 * 36e5;
  const a = upsert([], entry(1), 1000);
  assert.equal(a.changed, true);
  assert.equal(a.subs[0].seen, 1000);
  assert.equal(upsert(a.subs, entry(1), 1000 + day - 1).changed, false);
  assert.equal(upsert(a.subs, entry(1), 1000 + day).changed, true);
  assert.equal(upsert(a.subs, entry(1, { hour: 8 }), 2000).changed, true);
  assert.equal(upsert(a.subs, entry(1, { tz: 'Europe/Berlin' }), 2000).subs[0].tz, 'Europe/Berlin');
});

test('upsert keeps at most 3 and drops the least recently seen', () => {
  let subs = [];
  for (const n of [1, 2, 3]) subs = upsert(subs, entry(n), n * 1000).subs;
  subs = upsert(subs, entry(1), 10 * 36e5 * 24).subs; // 1 comes back, now the newest
  subs = upsert(subs, entry(4), 11 * 36e5 * 24).subs;
  assert.equal(subs.length, 3);
  assert.deepEqual(subs.map((s) => s.endpoint.split('/').pop()).sort(), ['1', '3', '4']);
});

test('remove drops one endpoint', () => {
  assert.deepEqual(remove([entry(1), entry(2)], entry(1).endpoint).map((s) => s.endpoint), [entry(2).endpoint]);
});

test('CORS headers only for the allowed origins', () => {
  const allowed = ['https://a.example'];
  assert.equal(corsHeaders('https://a.example', allowed)['access-control-allow-origin'], 'https://a.example');
  assert.deepEqual(corsHeaders('https://b.example', allowed), {});
  assert.deepEqual(corsHeaders(null, allowed), {});
});

test('classify', () => {
  assert.deepEqual([201, 404, 410, 403, 500].map(classify), ['sent', 'failed', 'gone', 'failed', 'failed']);
});

const P256 = { name: 'ECDSA', namedCurve: 'P-256' };

test('a VAPID JWT has the right header and claims, and its signature verifies', async () => {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(P256, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', privateKey);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey));
  assert.equal(raw.length, 65);
  const claims = { aud: audienceOf(APPLE), sub: 'mailto:me@example.com', exp: 1800000000 };
  const jwt = await makeJwt(claims, jwk);
  const [h, c, s] = jwt.split('.');
  const dec = (part) => JSON.parse(Buffer.from(part, 'base64url').toString());
  assert.deepEqual(dec(h), { typ: 'JWT', alg: 'ES256' });
  assert.deepEqual(dec(c), claims);
  assert.equal(Buffer.from(s, 'base64url').length, 64);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, Buffer.from(s, 'base64url'), new TextEncoder().encode(`${h}.${c}`));
  assert.ok(ok);
  assert.equal(vapidHeader(jwt, toBase64Url(raw)), `vapid t=${jwt}, k=${toBase64Url(raw)}`);
});

// A fake KV and a fake push service, to run the Worker's routes and cron.
async function makeEnv(subs = []) {
  const { privateKey } = await crypto.subtle.generateKey(P256, true, ['sign', 'verify']);
  const store = new Map(subs.length ? [['subs', JSON.stringify(subs)]] : []);
  let writes = 0;
  return {
    store,
    writes: () => writes,
    SUBS: { get: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null), put: async (k, v) => { writes++; store.set(k, v); } },
    VAPID_PRIVATE: JSON.stringify(await crypto.subtle.exportKey('jwk', privateKey)),
    VAPID_PUBLIC: 'pub',
    VAPID_SUBJECT: 'mailto:x@example.com',
    TEST_TOKEN: 'secret',
  };
}

const post = (path, payload, headers = {}) => new Request(`https://w.test${path}`, { method: 'POST', headers, body: JSON.stringify(payload) });

test('the preflight answers 204 with the matching origin', async () => {
  const env = await makeEnv();
  const res = await worker.fetch(new Request('https://w.test/subscribe', { method: 'OPTIONS', headers: { origin: 'https://samfeldstein.github.io' } }), env);
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://samfeldstein.github.io');
  assert.equal(res.headers.get('access-control-allow-methods'), 'POST');
  assert.equal(res.headers.get('access-control-allow-headers'), 'content-type');
  const other = await worker.fetch(new Request('https://w.test/subscribe', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }), env);
  assert.equal(other.headers.get('access-control-allow-origin'), null);
});

test('subscribe stores once, skips an unchanged repeat, rejects bad bodies, and unsubscribe removes', async () => {
  const env = await makeEnv();
  assert.equal((await worker.fetch(post('/subscribe', body()), env)).status, 204);
  assert.equal((await worker.fetch(post('/subscribe', body()), env)).status, 204);
  assert.equal(env.writes(), 1);
  assert.equal((await worker.fetch(post('/subscribe', body({ hour: 99 })), env)).status, 400);
  assert.equal((await worker.fetch(new Request('https://w.test/subscribe', { method: 'POST', body: 'x'.repeat(5000) }), env)).status, 400);
  assert.equal((await worker.fetch(new Request('https://w.test/subscribe', { method: 'GET' }), env)).status, 405);
  assert.equal((await worker.fetch(post('/unsubscribe', { endpoint: APPLE }), env)).status, 204);
  assert.deepEqual(JSON.parse(env.store.get('subs')), []);
});

test('/test needs the token', async () => {
  const env = await makeEnv([{ ...entry(1), seen: 1 }]);
  assert.equal((await worker.fetch(post('/test', {}), env)).status, 403);
  assert.equal((await worker.fetch(post('/test', {}, { 'x-test-token': 'wrong' }), env)).status, 403);
});

test('a send goes to due phones with the VAPID header, and a 410 removes the subscription', async () => {
  const subs = [{ ...entry(1), seen: 1 }, { ...entry(2, { hour: 9 }), seen: 1 }, { ...entry(3), seen: 1 }];
  const env = await makeEnv(subs);
  const calls = [];
  const send = async (url, init) => { calls.push([url, init]); return new Response(null, { status: url.endsWith('/3') ? 410 : 201 }); };
  const stats = await sendAll(env, isDue, Date.parse('2026-06-01T07:00:00Z'), send);
  assert.deepEqual(calls.map(([u]) => u), [entry(1).endpoint, entry(3).endpoint]);
  assert.equal(calls[0][1].headers.TTL, '43200');
  assert.match(calls[0][1].headers.Authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=pub$/);
  assert.equal(calls[0][1].body, undefined);
  assert.equal(calls[0][1].headers.Authorization, calls[1][1].headers.Authorization); // one JWT per audience
  assert.equal(stats.sent, 1);
  assert.equal(stats.removed, 1);
  assert.deepEqual(JSON.parse(env.store.get('subs')).map((s) => s.endpoint), [entry(1).endpoint, entry(2, { hour: 9 }).endpoint]);
});

test('a 403 keeps the subscription and records Apple\'s reason', async () => {
  const env = await makeEnv([{ ...entry(1), seen: 1 }]);
  const send = async () => new Response(JSON.stringify({ reason: 'BadJwtToken' }), { status: 403 });
  const stats = await sendAll(env, () => true, Date.now(), send);
  assert.deepEqual([stats.failed, stats.reasons], [1, ['BadJwtToken']]);
  assert.equal(JSON.parse(env.store.get('subs')).length, 1);
});

test('one send that throws does not stop the others, and removals are still saved and logged', async () => {
  const env = await makeEnv([{ ...entry(1), seen: 1 }, { ...entry(2), seen: 1 }, { ...entry(3), seen: 1 }]);
  const send = async (url) => {
    if (url.endsWith('/1')) throw new Error('network');
    return new Response(null, { status: url.endsWith('/2') ? 410 : 201 });
  };
  const logged = [];
  const log = console.log;
  console.log = (line) => logged.push(line);
  let stats;
  try { stats = await sendAll(env, () => true, Date.now(), send); } finally { console.log = log; }
  assert.deepEqual([stats.sent, stats.removed, stats.failed], [1, 1, 1]);
  assert.deepEqual(JSON.parse(env.store.get('subs')).map((s) => s.endpoint), [entry(1).endpoint, entry(3).endpoint]);
  assert.equal(logged.length, 1);
});

test('a 403 is logged with its reason at error level', async () => {
  const env = await makeEnv([{ ...entry(1), seen: 1 }]);
  const errors = [];
  const error = console.error;
  console.error = (line) => errors.push(line);
  try { await sendAll(env, () => true, Date.now(), async () => new Response('{"reason":"BadJwtToken"}', { status: 403 })); } finally { console.error = error; }
  assert.equal(errors.length, 1);
  assert.match(errors[0], /BadJwtToken/);
});

test('a placeholder or empty config sends nothing and logs an error', async () => {
  const good = await makeEnv([{ ...entry(1), seen: 1 }]);
  assert.equal(await configProblem(good), null);
  for (const bad of ['not json', '{}', '{"kty":"EC"}']) assert.match(await configProblem({ ...good, VAPID_PRIVATE: bad }), /VAPID_PRIVATE/);
  for (const over of [{ VAPID_SUBJECT: 'mailto:CHANGE-ME' }, { VAPID_PUBLIC: '' }, { VAPID_PRIVATE: 'garbage' }]) {
    const env = { ...good, ...over };
    let called = 0;
    const errors = [];
    const error = console.error;
    console.error = (line) => errors.push(line);
    let stats;
    try { stats = await sendAll(env, () => true, Date.now(), async () => { called++; return new Response(null, { status: 201 }); }); } finally { console.error = error; }
    assert.equal(called, 0);
    assert.ok(stats.error);
    assert.equal(errors.length, 1);
    assert.equal((await worker.fetch(post('/test', {}, { 'x-test-token': 'secret' }), env)).status, 500);
  }
});

test("badge.js's VAPID_PUBLIC equals the Worker's var once it is set", () => {
  const badge = readFileSync(new URL('../src/js/features/badge.js', import.meta.url), 'utf8');
  const wrangler = readFileSync(new URL('../push/wrangler.jsonc', import.meta.url), 'utf8');
  const page = badge.match(/export const VAPID_PUBLIC = '([^']*)'/)[1];
  const worker_ = wrangler.match(/"VAPID_PUBLIC":\s*"([^"]*)"/)[1];
  if (page) assert.equal(worker_, page, 'VAPID_PUBLIC differs between badge.js and push/wrangler.jsonc');
});

test('PUSH_URL and VAPID_PUBLIC in badge.js are both set or both empty', () => {
  const badge = readFileSync(new URL('../src/js/features/badge.js', import.meta.url), 'utf8');
  const url = badge.match(/export const PUSH_URL = '([^']*)'/)[1];
  const key = badge.match(/export const VAPID_PUBLIC = '([^']*)'/)[1];
  assert.equal(Boolean(url), Boolean(key), 'set PUSH_URL and VAPID_PUBLIC together');
});
