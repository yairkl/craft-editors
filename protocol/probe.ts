/** Diagnostic transport only. Editing will use a separate negotiated protocol. */
export const PROBE_VERSION = 1;
export const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024;
export type DocumentFormat = 'xlsx' | 'pdf' | 'docx' | 'pptx' | 'svg' | 'vectorcraft';

export interface Receipt {
  byteLength: number;
  sha256: string;
}

export type ProbeMessage =
  | { type: 'ready'; version: 1; sessionId: string }
  | ({ type: 'received'; version: 1; sessionId: string } & Receipt);

export function parseProbeMessage(value: unknown, sessionId: string): ProbeMessage | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const m = value as Record<string, unknown>;
  if (m.version !== PROBE_VERSION || m.sessionId !== sessionId) return undefined;
  if (m.type === 'ready') return { type: 'ready', version: 1, sessionId };
  if (m.type !== 'received' || !Number.isSafeInteger(m.byteLength) ||
      typeof m.byteLength !== 'number' || m.byteLength < 0 ||
      m.byteLength > MAX_DOCUMENT_BYTES || typeof m.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(m.sha256)) return undefined;
  return { type: 'received', version: 1, sessionId, byteLength: m.byteLength, sha256: m.sha256 };
}

/** Ignore stale sessions, duplicate ready events and unsolicited receipts. */
export class ProbeSession {
  private state: 'waiting' | 'sent' | 'verified' | 'failed' = 'waiting';

  constructor(readonly id: string, private readonly expected: Receipt) {}

  accept(value: unknown): 'send' | 'verified' | 'mismatch' | undefined {
    const message = parseProbeMessage(value, this.id);
    if (!message) return undefined;
    if (this.state === 'waiting' && message.type === 'ready') {
      this.state = 'sent';
      return 'send';
    }
    if (this.state !== 'sent' || message.type !== 'received') return undefined;
    if (message.byteLength !== this.expected.byteLength || message.sha256 !== this.expected.sha256) {
      this.state = 'failed';
      return 'mismatch';
    }
    this.state = 'verified';
    return 'verified';
  }
}
