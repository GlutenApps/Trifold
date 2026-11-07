/**
 * Asks the console to write every save still waiting on a timer (ADR 0015) and waits for its
 * answer, `app.savesFlushed`, or a timeout when the console cannot answer.
 */
export class SaveFlush {
  private waiters: (() => void)[] = [];

  request(send: () => void, timeoutMs: number): Promise<'flushed' | 'timeout'> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== done);
        resolve('timeout');
      }, timeoutMs);
      const done = () => {
        clearTimeout(timer);
        resolve('flushed');
      };
      this.waiters.push(done);
      send();
    });
  }

  acknowledge(): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const done of waiters) done();
  }
}
