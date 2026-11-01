import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../build.mjs';

const realSrc = fileURLToPath(new URL('../src', import.meta.url));

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'planner-build-'));
  const src = join(root, 'src');
  cpSync(realSrc, src, { recursive: true });
  return { root, src, out: join(root, 'out') };
}

test('stamps the version into sw.js and version.js and lists every asset', () => {
  const { src, out } = fixture();
  const { version, assets } = build({ src, out });
  assert.match(version, /^[0-9a-f]{10}$/);
  assert.match(readFileSync(join(out, 'sw.js'), 'utf8'), new RegExp(`const VERSION = '${version}'`));
  assert.equal(readFileSync(join(out, 'js/version.js'), 'utf8'), `export const VERSION = '${version}';\n`);
  for (const f of ['index.html', 'manifest.webmanifest', 'css/app.css', 'js/app.js', 'js/core/recur.js', 'icons/180.png']) {
    assert.ok(assets.includes(f), f);
    assert.ok(existsSync(join(out, f)), f);
  }
  assert.ok(!assets.includes('sw.js'));
  assert.ok(existsSync(join(out, '.nojekyll')));
  const listed = JSON.parse(readFileSync(join(out, 'sw.js'), 'utf8').match(/const ASSETS = (\[[\s\S]*?\]);/)[1]);
  assert.deepEqual(listed, assets);
});

test('the version is stable for the same files and changes when a file changes', () => {
  const { src, out } = fixture();
  const a = build({ src, out }).version;
  assert.equal(build({ src, out }).version, a);
  writeFileSync(join(src, 'css/app.css'), `${readFileSync(join(src, 'css/app.css'), 'utf8')}\n/* x */`);
  assert.notEqual(build({ src, out }).version, a);
});

test('anything outside the allowlist fails the build and nothing is written', () => {
  const { src, out } = fixture();
  mkdirSync(join(src, 'notes'));
  writeFileSync(join(src, 'notes/todo.md'), 'private');
  assert.throws(() => build({ src, out }), /Not allowed in a release: notes\/todo\.md/);
  assert.equal(existsSync(out), false);
});

test('a rebuild clears stale files but keeps .git', () => {
  const { src, out } = fixture();
  build({ src, out });
  mkdirSync(join(out, '.git'));
  writeFileSync(join(out, 'old.html'), 'stale');
  build({ src, out });
  assert.equal(existsSync(join(out, 'old.html')), false);
  assert.equal(existsSync(join(out, '.git')), true);
});
