// Runs a page in tests/browser/ in headless Chrome and exits 0 on PASS. No dependencies.
// The page POSTs its result to /__result. Run: node tools/browser-test.mjs [page.html]
// Set CHROME to a browser binary if Chrome isn't at the macOS default.

import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const page = process.argv[2] ?? 'checkoff.html';
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };

let finish;
const result = new Promise((r) => { finish = r; });

const server = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/__result') {
    let body = '';
    for await (const chunk of req) body += chunk;
    res.end('ok');
    finish(body);
    return;
  }
  const file = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try {
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { port } = server.address();

const profile = await mkdtemp(join(tmpdir(), 'planner-browser-'));
const proc = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${profile}`, `http://127.0.0.1:${port}/tests/browser/${page}`,
], { stdio: 'ignore' });
proc.on('error', (err) => finish(`FAIL\ncould not start Chrome (${chrome}): ${err.message}`));

const timeout = setTimeout(() => finish('FAIL\ntimed out after 30 s with no result'), 30000);
const out = await result;
clearTimeout(timeout);
proc.kill();
server.close();
await rm(profile, { recursive: true, force: true }).catch(() => {});

console.log(`${page}: ${out}`);
process.exit(out.startsWith('PASS') ? 0 : 1);
