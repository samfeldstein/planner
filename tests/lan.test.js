import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phoneLines } from '../tools/lan.mjs';

const v4 = (address, internal = false) => ({ family: 'IPv4', address, internal });

test('a private address gets an On your phone line', () => {
  const lines = phoneLines({ lo0: [v4('127.0.0.1', true)], en0: [v4('192.168.1.20'), { family: 'IPv6', address: 'fe80::1', internal: false }] }, 8766);
  assert.deepEqual(lines, ['On your phone (same Wi-Fi): http://192.168.1.20:8766']);
});

test('only private addresses are listed when there are others too', () => {
  const lines = phoneLines({ en0: [v4('10.0.0.5')], utun4: [v4('100.101.1.2')] }, 1);
  assert.deepEqual(lines, ['On your phone (same Wi-Fi): http://10.0.0.5:1']);
});

test('no address at all: join the Wi-Fi', () => {
  const lines = phoneLines({ lo0: [v4('127.0.0.1', true)] }, 8766);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^No network address found: connect the Mac to the same Wi-Fi/);
});

test('only non-private addresses: names them, and still says Wi-Fi', () => {
  const lines = phoneLines({ utun4: [v4('100.101.1.2')], en0: [v4('169.254.3.4')] }, 8766);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /100\.101\.1\.2, 169\.254\.3\.4/);
  assert.match(lines[0], /same Wi-Fi as the phone/);
  assert.doesNotMatch(lines[0], /On your phone/);
});

test('empty and missing interface lists', () => {
  assert.match(phoneLines({}, 1)[0], /^No network address found/);
  assert.match(phoneLines({ en0: undefined }, 1)[0], /^No network address found/);
});
