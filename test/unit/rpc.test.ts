import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { WebviewRpc } from '../../src/rpc';
test('matches response IDs and sessions, ignoring stale messages', async () => {
  let sent: Record<string, unknown> = {};
  const rpc = new WebviewRpc('current', async value => { sent = value as Record<string, unknown>; return true; });
  const request = rpc.request('serialize');
  assert.equal(rpc.accept({ type: 'editor:response', version: 1, sessionId: 'stale', requestId: sent.requestId, result: 'wrong' }), false);
  rpc.accept({ type: 'editor:response', version: 1, sessionId: 'current', requestId: sent.requestId, result: 'correct' });
  assert.equal(await request, 'correct'); rpc.dispose();
});
test('view disposal rejects outstanding operations and future requests', async () => {
  const rpc = new WebviewRpc('current', async () => true);
  const pending = rpc.request('serialize');
  rpc.dispose();
  await assert.rejects(pending, /closed/);
  await assert.rejects(rpc.request('serialize'), /closed/);
});
test('undelivered and timed-out requests fail explicitly', async () => {
  const missing = new WebviewRpc('current', async () => false);
  await assert.rejects(missing.request('serialize'), /unavailable/); missing.dispose();
  const stalled = new WebviewRpc('current', async () => true, 5);
  await assert.rejects(stalled.request('serialize'), /time/); stalled.dispose();
});
