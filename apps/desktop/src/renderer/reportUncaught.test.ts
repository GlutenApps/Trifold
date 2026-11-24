import { describe, expect, it, vi } from 'vitest';
import { reportUncaught } from './reportUncaught';

function harness(max = 3) {
  const target = new EventTarget() as unknown as Window;
  const report = vi.fn(async () => undefined);
  reportUncaught(target, report, max);
  const flush = () => new Promise((done) => setTimeout(done, 0));
  return { target, report, flush };
}

describe('reportUncaught', () => {
  it('logs an uncaught error with its stack', async () => {
    const h = harness();
    const error = new Error('boom');
    const event = Object.assign(new Event('error'), { error, message: 'boom' });
    h.target.dispatchEvent(event);
    await h.flush();
    expect(h.report).toHaveBeenCalledWith('uncaught error', expect.stringContaining('boom'));
  });

  it('logs an unhandled rejection', async () => {
    const h = harness();
    const event = Object.assign(new Event('unhandledrejection'), { reason: 'no answer' });
    h.target.dispatchEvent(event);
    await h.flush();
    expect(h.report).toHaveBeenCalledWith('unhandled rejection', 'no answer');
  });

  it('stops after the cap, so a repeating fault cannot flood the log', async () => {
    const h = harness(2);
    for (let i = 0; i < 5; i++) {
      h.target.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: i }));
    }
    await h.flush();
    expect(h.report).toHaveBeenCalledTimes(2);
  });

  it('never throws when logging fails', async () => {
    const target = new EventTarget() as unknown as Window;
    reportUncaught(target, () => Promise.reject(new Error('ipc down')));
    target.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: 'x' }));
    await new Promise((done) => setTimeout(done, 0));
  });
});
