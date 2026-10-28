import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CoalescedTask } from '../../src/coalesced-task';

test('serializes one snapshot at a time and repeats for changes during a snapshot', async () => {
  let calls = 0;
  let active = 0;
  const releases: (() => void)[] = [];
  const task = new CoalescedTask(async () => {
    calls++; active++; assert.equal(active, 1);
    await new Promise<void>(resolve => releases.push(resolve));
    active--;
  });
  task.request(); task.request(); task.request();
  assert.equal(calls, 1);
  releases.shift()!();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
  releases.shift()!();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
  task.request(); assert.equal(calls, 3);
  releases.shift()!();
  await new Promise(resolve => setImmediate(resolve));
});

test('a later edit can retry after a snapshot fails', async () => {
  let calls = 0;
  const task = new CoalescedTask(async () => { calls++; if (calls === 1) throw new Error('snapshot unavailable'); });
  task.request();
  await new Promise(resolve => setImmediate(resolve));
  task.request();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
});
