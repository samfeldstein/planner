import test from 'node:test';
import assert from 'node:assert/strict';
import { isLocalHost, needsInstall } from '../src/js/ui/install.js';

test('local dev hosts never need the install gate', () => {
  for (const hostname of ['localhost', '127.0.0.1', '[::1]', 'planner.localhost']) {
    assert.equal(isLocalHost(hostname), true, hostname);
    assert.equal(needsInstall({ hostname, standalone: false }), false, hostname);
  }
});

test('on the real site, only the installed app runs', () => {
  assert.equal(needsInstall({ hostname: 'someone.github.io', standalone: false }), true);
  assert.equal(needsInstall({ hostname: 'someone.github.io', standalone: true }), false);
});

test('lookalike hosts are not local', () => {
  for (const hostname of ['localhost.evil.com', 'evillocalhost', '127.0.0.1.evil.com']) {
    assert.equal(needsInstall({ hostname, standalone: false }), true, hostname);
  }
});
