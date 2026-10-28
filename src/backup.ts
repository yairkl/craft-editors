/** Binary backups retain the disk digest while avoiding base64 encoding of document bytes. */
const MAGIC = Buffer.from('CRAFTB2\n', 'ascii');
const DIGEST_LENGTH = 64;
const HEADER_LENGTH = MAGIC.length + DIGEST_LENGTH + 1;
const DIGEST = /^[a-f0-9]{64}$/;

export function encodeBackup(data: Uint8Array, diskDigest: string): Uint8Array {
  if (!DIGEST.test(diskDigest)) throw new Error('This document backup is incompatible.');
  const result = Buffer.allocUnsafe(HEADER_LENGTH + data.byteLength);
  MAGIC.copy(result);
  result.write(diskDigest, MAGIC.length, DIGEST_LENGTH, 'ascii');
  result[HEADER_LENGTH - 1] = 10;
  result.set(data, HEADER_LENGTH);
  return result;
}

export function decodeBackup(data: Uint8Array): { bytes: Uint8Array; diskDigest: string } {
  const view = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (view.subarray(0, MAGIC.length).equals(MAGIC)) {
    const diskDigest = view.subarray(MAGIC.length, MAGIC.length + DIGEST_LENGTH).toString('ascii');
    if (view.length < HEADER_LENGTH || view[HEADER_LENGTH - 1] !== 10 || !DIGEST.test(diskDigest)) throw new Error('This document backup is incompatible.');
    return { bytes: view.subarray(HEADER_LENGTH), diskDigest };
  }
  // Backups produced by older versions must remain recoverable after an update.
  let legacy: unknown;
  try { legacy = JSON.parse(view.toString('utf8')); } catch { throw new Error('This document backup is incompatible.'); }
  if (typeof legacy !== 'object' || legacy === null) throw new Error('This document backup is incompatible.');
  const record = legacy as Record<string, unknown>;
  if (record.version !== 1 || typeof record.bytes !== 'string' || typeof record.diskDigest !== 'string' || !DIGEST.test(record.diskDigest)) throw new Error('This document backup is incompatible.');
  return { bytes: Buffer.from(record.bytes, 'base64'), diskDigest: record.diskDigest };
}
