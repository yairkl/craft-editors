import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { MAX_DOCUMENT_BYTES, parseProbeMessage, ProbeSession } from '../../protocol/probe';

const id = 'test-session';
const sha256 = 'a'.repeat(64);
const ready = { type: 'ready', version: 1, sessionId: id };
const received = { type: 'received', version: 1, sessionId: id, byteLength: 10, sha256 };

test('validates version, session, lengths and hash before accepting messages', () => {
  for (const invalid of [null, [], 'ready', {}, { ...ready, version: 2 },
    { ...ready, sessionId: 'previous' }, { ...ready, type: 'write' },
    ...[-1, 1.5, NaN, Infinity, MAX_DOCUMENT_BYTES + 1, '10'].map(byteLength => ({ ...received, byteLength })),
    { ...received, sha256: '<script>' }, { ...received, sha256: 'A'.repeat(64) }]) {
    assert.equal(parseProbeMessage(invalid, id), undefined);
  }
  assert.deepEqual(parseProbeMessage(received, id), received);
});

test('requires the current session handshake and matching bytes to verify transfer', () => {
  const session = new ProbeSession(id, { byteLength: 10, sha256 });
  assert.equal(session.accept(received), undefined);
  assert.equal(session.accept({ ...ready, sessionId: 'stale' }), undefined);
  assert.equal(session.accept(ready), 'send');
  assert.equal(session.accept(ready), undefined);
  assert.equal(session.accept(received), 'verified');
  assert.equal(session.accept(received), undefined);
});

test('mismatched digest or length fails permanently, even if a valid receipt follows', () => {
  for (const mismatch of [{ ...received, byteLength: 9 }, { ...received, sha256: 'b'.repeat(64) }]) {
    const session = new ProbeSession(id, { byteLength: 10, sha256 });
    session.accept(ready);
    assert.equal(session.accept(mismatch), 'mismatch');
    assert.equal(session.accept(received), undefined);
    assert.equal(session.accept(ready), undefined);
  }
});
