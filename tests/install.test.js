import test from 'node:test';
import assert from 'node:assert/strict';
import { isLocalHost, needsInstall } from '../src/js/ui/install.js';

test('local dev hosts never need the install gate', () => {
  for (const hostname of ['localhost', '127.0.0.1', '[::1]', 'planner.localhost', '10.0.0.132', '192.168.1.20', '172.16.0.2', '172.31.255.1']) {
    assert.equal(isLocalHost(hostname), true, hostname);
    assert.equal(needsInstall({ hostname, standalone: false }), false, hostname);
  }
});

test('on the real site, only the installed app runs', () => {
  assert.equal(needsInstall({ hostname: 'someone.github.io', standalone: false }), true);
  assert.equal(needsInstall({ hostname: 'someone.github.io', standalone: true }), false);
});

test('lookalike hosts are not local', () => {
  for (const hostname of ['localhost.evil.com', 'evillocalhost', '127.0.0.1.evil.com', '10.0.0.1.evil.com', '172.32.0.1', '192.169.1.1', '8.8.8.8']) {
    assert.equal(needsInstall({ hostname, standalone: false }), true, hostname);
  }
});
