/** Run at most one task at a time, repeating once if more work arrived while it ran. */
export class CoalescedTask {
  private running = false;
  private requested = false;
  constructor(private readonly task: () => Promise<void>) {}
  request(): void {
    this.requested = true;
    if (!this.running) void this.run();
  }
  private async run(): Promise<void> {
    this.running = true;
    try {
      while (this.requested) {
        this.requested = false;
        try { await this.task(); } catch { /* A later edit can retry a failed snapshot. */ }
      }
    } finally {
      this.running = false;
      if (this.requested) void this.run();
    }
  }
}
