// Dev server for src/: static files on all interfaces (so a phone on the same Wi-Fi can load it),
// plus live reload. It injects a tiny script into index.html at serve time and pushes a "reload"
// event when a file changes, so nothing here ever reaches a release. No dependencies.
// Run: node tools/dev-server.mjs [--port 8766]

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', 'src');
const portArg = process.argv.indexOf('--port');
const port = portArg > 0 ? Number(process.argv[portArg + 1]) : 8766;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
};

const CLIENT = `new EventSource('/__reload').addEventListener('reload', () => location.reload());`;

const clients = new Set();
let timer = null;
watch(root, { recursive: true }, (_event, file) => {
  if (!file || file.split(/[\\/]/).some((part) => part.startsWith('.'))) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    for (const res of clients) res.write('event: reload\ndata: 1\n\n');
  }, 60);
});

const send = (res, status, type, body) => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
};

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');

  if (pathname === '/__reload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write('retry: 1000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (pathname === '/__reload.js') return send(res, 200, TYPES['.js'], CLIENT);

  try {
    let file = normalize(join(root, decodeURIComponent(pathname)));
    if (file !== root && !file.startsWith(root + sep)) return send(res, 403, 'text/plain', 'Forbidden');
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    const type = TYPES[extname(file)] ?? 'application/octet-stream';
    if (extname(file) === '.html') {
      const html = body.toString().replace('</head>', '<script src="/__reload.js"></script>\n</head>');
      return send(res, 200, type, html);
    }
    send(res, 200, type, body);
  } catch (err) {
    if (err instanceof URIError) return send(res, 400, 'text/plain', 'Bad request');
    send(res, 404, 'text/plain', 'Not found');
  }
}).listen(port, '0.0.0.0', () => console.log(`Planner dev server on http://0.0.0.0:${port} (live reload on)`));
