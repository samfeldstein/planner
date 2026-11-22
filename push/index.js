// The push Worker: stores up to 3 phone subscriptions in KV and, once an hour, sends an empty push to
// each phone whose local hour is its chosen hour. The phone's service worker builds the notification.
// No todo data ever reaches this Worker. Deploy notes: push/README.md.

import { MAX_SUBS, audienceOf, classify, configProblem, corsHeaders, isDue, makeJwt, parseSubscribe, remove, upsert, vapidHeader } from './lib.js';

const ORIGINS = ['https://samfeldstein.github.io', 'http://localhost:8766'];
const MAX_BODY = 4096;
const TTL = 43200;

const reply = (status, headers = {}, body = null) => new Response(body, { status, headers });

const readSubs = async (env) => (await env.SUBS.get('subs', 'json')) ?? [];
const writeSubs = (env, subs) => env.SUBS.put('subs', JSON.stringify(subs));

async function readBody(req) {
  const text = await req.text();
  if (text.length > MAX_BODY) return null;
  try { return JSON.parse(text); } catch { return null; }
}

async function subscribe(req, env, cors) {
  const parsed = parseSubscribe(await readBody(req));
  if (parsed.error) return reply(400, cors, parsed.error);
  const { subs, changed } = upsert(await readSubs(env), parsed.entry, Date.now(), MAX_SUBS);
  if (changed) await writeSubs(env, subs);
  return reply(204, cors);
}

async function unsubscribe(req, env, cors) {
  const body = await readBody(req);
  if (typeof body?.endpoint !== 'string') return reply(400, cors, 'bad endpoint');
  const subs = await readSubs(env);
  const rest = remove(subs, body.endpoint);
  if (rest.length !== subs.length) await writeSubs(env, rest);
  return reply(204, cors);
}

// Apple's reason (such as BadJwtToken) is in the body of a failed push. Never the endpoint.
async function reasonOf(res) {
  try { return (await res.json()).reason ?? null; } catch { return null; }
}

// Send to one subscription. Never throws: a network error counts as a failure.
async function sendOne(env, sub, jwts, now, send, stats, gone) {
  try {
    const aud = audienceOf(sub.endpoint);
    if (!jwts.has(aud)) jwts.set(aud, await makeJwt({ aud, sub: env.VAPID_SUBJECT, exp: Math.floor(now / 1000) + 12 * 3600 }, JSON.parse(env.VAPID_PRIVATE)));
    const res = await send(sub.endpoint, {
      method: 'POST',
      headers: { TTL: String(TTL), Urgency: 'normal', Authorization: vapidHeader(jwts.get(aud), env.VAPID_PUBLIC) },
    });
    stats.statuses.push(res.status);
    const kind = classify(res.status);
    if (kind === 'gone') { gone.push(sub.endpoint); stats.removed++; return; }
    if (kind === 'sent') { stats.sent++; return; }
    const reason = await reasonOf(res);
    stats.failed++;
    stats.reasons.push(reason);
    if (res.status === 403) console.error(JSON.stringify({ status: 403, reason }));
  } catch {
    stats.failed++;
    stats.reasons.push('request failed');
  }
}

// Send to each subscription for which `due` is true. Returns the counts and writes removals back.
export async function sendAll(env, due, now = Date.now(), send = fetch) {
  const problem = await configProblem(env);
  if (problem) {
    console.error(JSON.stringify({ error: problem }));
    return { error: problem, sent: 0, removed: 0, failed: 0, statuses: [], reasons: [] };
  }
  const subs = await readSubs(env);
  const jwts = new Map();
  const stats = { sent: 0, removed: 0, failed: 0, statuses: [], reasons: [] };
  const gone = [];
  const targets = subs.filter((s) => due(s, new Date(now)));
  for (const sub of targets) await sendOne(env, sub, jwts, now, send, stats, gone);
  if (gone.length) await writeSubs(env, (await readSubs(env)).filter((s) => !gone.includes(s.endpoint)));
  if (targets.length) console.log(JSON.stringify(stats));
  return stats;
}

async function test(req, env) {
  const token = req.headers.get('x-test-token');
  if (!env.TEST_TOKEN || token !== env.TEST_TOKEN) return reply(403);
  const stats = await sendAll(env, () => true);
  return reply(stats.error ? 500 : 200, { 'content-type': 'application/json' }, JSON.stringify(stats));
}

const ROUTES = { '/subscribe': subscribe, '/unsubscribe': unsubscribe };

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
    if (req.method === 'POST' && pathname === '/test') return test(req, env);
    const route = ROUTES[pathname];
    if (!route) return reply(404);
    const cors = corsHeaders(req.headers.get('origin'), ORIGINS);
    if (req.method === 'OPTIONS') return reply(204, cors);
    if (req.method !== 'POST') return reply(405, cors);
    return route(req, env, cors);
  },

  scheduled(controller, env, ctx) {
    ctx.waitUntil(sendAll(env, isDue, controller.scheduledTime));
  },
};
