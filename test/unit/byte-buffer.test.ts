import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { exactArrayBuffer } from '../../src/byte-buffer';

test('reuses a complete ArrayBuffer and isolates a partial or pooled view', () => {
  const whole = Uint8Array.of(1, 2, 3);
  assert.equal(exactArrayBuffer(whole), whole.buffer);
  const pooled = Uint8Array.of(9, 1, 2, 3, 8);
  const result = exactArrayBuffer(pooled.subarray(1, 4));
  assert.notEqual(result, pooled.buffer);
  assert.deepEqual([...new Uint8Array(result)], [1, 2, 3]);
});
