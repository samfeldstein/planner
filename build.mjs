// Turns src/ into a release folder (default ../public): copies an allowlist of files, stamps a
// content-hash version into sw.js and js/version.js, and writes .nojekyll. No dependencies.
// Run: node build.mjs [--out <dir>]

import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Keeps plans, notes, and tests out of the public repo.
const ALLOWED = /^(?:[^/]+\.(?:html|css|js|webmanifest)|(?:css|js)\/.+\.(?:css|js)|icons\/[^/]+\.png)$/;

function walk(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '.DS_Store') return [];
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full, base) : [full.slice(base.length + 1).split('\\').join('/')];
  }).sort();
}

export function build({ src = join(here, 'src'), out = join(here, '..', 'public') } = {}) {
  const files = walk(src);
  const bad = files.filter((f) => !ALLOWED.test(f));
  if (bad.length) throw new Error(`Not allowed in a release: ${bad.join(', ')}`);

  const hash = createHash('sha256');
  for (const f of files.filter((p) => p !== 'sw.js' && p !== 'js/version.js')) {
    hash.update(`${f}\0`).update(readFileSync(join(src, f))).update('\0');
  }
  const version = hash.digest('hex').slice(0, 10);

  mkdirSync(out, { recursive: true });
  for (const entry of readdirSync(out)) if (entry !== '.git') rmSync(join(out, entry), { recursive: true, force: true });
  for (const f of files) {
    mkdirSync(dirname(join(out, f)), { recursive: true });
    cpSync(join(src, f), join(out, f));
  }

  writeFileSync(join(out, 'js/version.js'), `export const VERSION = '${version}';\n`);

  const assets = files.filter((f) => f !== 'sw.js');
  let sw = readFileSync(join(src, 'sw.js'), 'utf8');
  if (!sw.includes("'__VERSION__'") || !sw.includes('[/*__ASSETS__*/]')) throw new Error('sw.js is missing its placeholders');
  sw = sw.replace("'__VERSION__'", `'${version}'`).replace('[/*__ASSETS__*/]', JSON.stringify(assets, null, 2));
  writeFileSync(join(out, 'sw.js'), sw);

  writeFileSync(join(out, '.nojekyll'), '');
  return { version, assets, out };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  const result = build(i > -1 ? { out: resolve(process.argv[i + 1]) } : {});
  console.log(`built ${result.assets.length + 1} files, version ${result.version} -> ${result.out}`);
  if (!existsSync(join(result.out, 'index.html'))) process.exit(1);
}
