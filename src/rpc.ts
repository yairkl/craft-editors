/** Requests belong to one webview session; disposal rejects every in-flight operation. */
export class WebviewRpc {
  private sequence = 0;
  private closed = false;
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  constructor(readonly sessionId: string, private readonly post: (value: unknown) => Thenable<boolean>, private readonly timeout = 30_000) {}
  request(operation: string, fields: Record<string, unknown> = {}): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error('The workbook view is closed.'));
    const requestId = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('The workbook did not respond in time.')); }, this.timeout);
      this.pending.set(requestId, { resolve, reject, timer });
      try {
        void this.post({ type: 'editor:request', version: 1, sessionId: this.sessionId, requestId, operation, ...fields })
          .then(delivered => { if (!delivered) this.reject(requestId, new Error('The workbook view is unavailable.')); }, () => this.reject(requestId, new Error('Could not contact the workbook view.')));
      } catch { this.reject(requestId, new Error('Could not contact the workbook view.')); }
    });
  }
  accept(message: Record<string, unknown>): boolean {
    if (message.type !== 'editor:response' || message.sessionId !== this.sessionId || message.version !== 1 || typeof message.requestId !== 'number') return false;
    const pending = this.pending.get(message.requestId);
    if (!pending) return true;
    this.pending.delete(message.requestId); clearTimeout(pending.timer);
    if (typeof message.error === 'string') pending.reject(new Error(message.error.slice(0, 500)));
    else pending.resolve(message.result);
    return true;
  }
  private reject(id: number, error: Error): void {
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id); clearTimeout(entry.timer); entry.reject(error);
  }
  dispose(): void {
    this.closed = true;
    for (const id of this.pending.keys()) this.reject(id, new Error('The workbook view is closed.'));
  }
}
