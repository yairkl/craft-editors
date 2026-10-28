import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { decodeBackup, encodeBackup } from '../../src/backup';

const digest = 'a'.repeat(64);
test('binary backup decodes without copying and respects typed-array offsets', () => {
  const data = Uint8Array.from([1, 2, 3]);
  const encoded = encodeBackup(data, digest);
  const padded = new Uint8Array(encoded.length + 4); padded.set(encoded, 2);
  const input = padded.subarray(2, -2);
  const decoded = decodeBackup(input);
  assert.deepEqual([...decoded.bytes], [...data]);
  assert.equal(decoded.diskDigest, digest);
  assert.equal(decoded.bytes.buffer, input.buffer);
});
test('legacy JSON backup remains recoverable', () => {
  const legacy = Buffer.from(JSON.stringify({ version: 1, diskDigest: digest, bytes: Buffer.from([1, 2, 3]).toString('base64') }));
  assert.deepEqual([...decodeBackup(legacy).bytes], [1, 2, 3]);
});
test('rejects damaged or incompatible backups', () => {
  const broken = Buffer.from(encodeBackup(Uint8Array.of(1), digest)); broken[8] = 33;
  for (const input of [broken, Buffer.from('CRAFTB2\n'), Buffer.from('{}'), Buffer.from('not-json')]) assert.throws(() => decodeBackup(input), /incompatible/);
});
