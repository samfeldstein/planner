import test from 'node:test';
import assert from 'node:assert/strict';
import { runContract } from './adapter-contract.js';
import { createMemoryAdapter } from './memory-adapter.js';

test('memory adapter meets the adapter contract', () => runContract(createMemoryAdapter, assert));
