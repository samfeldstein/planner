import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, offset, settle } from '../src/js/core/swipe.js';

test('classify waits until the drag has moved far enough', () => {
  assert.equal(classify(0, 0), 'pending');
  assert.equal(classify(15, 9), 'pending');
  assert.equal(classify(-15, -9), 'pending');
});

test('classify: sideways is a swipe, up or down is a scroll', () => {
  assert.equal(classify(16, 0), 'swipe');
  assert.equal(classify(-20, 5), 'swipe');
  assert.equal(classify(3, 10), 'scroll');
  assert.equal(classify(20, 25), 'scroll');
  assert.equal(classify(20, 20), 'scroll'); // a diagonal goes to the page
});

test('offset follows the finger within 0..max', () => {
  assert.equal(offset(30, 80), 30);
  assert.equal(offset(-30, 80), 0);
  assert.equal(offset(200, 80), 80);
});

test('settle opens from halfway', () => {
  assert.equal(settle(39, 80), 'closed');
  assert.equal(settle(40, 80), 'open');
  assert.equal(settle(80, 80), 'open');
  assert.equal(settle(0, 0), 'closed');
});

test('row-swipe never moves pointer capture (a touch is already captured; moving it ended every swipe)', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../src/js/ui/row-swipe.js', import.meta.url), 'utf8');
  assert.ok(!/\.setPointerCapture\(|lostpointercapture['"]/.test(src));
});
