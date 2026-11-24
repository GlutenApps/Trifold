import { describe, expect, it } from 'vitest';
import {
  afterPageGone,
  CONSOLE_READY_LIMIT_MS,
  describeTrouble,
  problemPage,
  RELOAD_COOLDOWN_MS,
} from './consoleHealth';

describe('afterPageGone', () => {
  it('reloads the first time the page stops', () => {
    expect(afterPageGone(null, 1_000)).toBe('reload');
  });

  it('explains instead of reloading when it stops again soon after a reload', () => {
    expect(afterPageGone(1_000, 1_000 + RELOAD_COOLDOWN_MS - 1)).toBe('explain');
  });

  it('reloads again once the last reload is long past', () => {
    expect(afterPageGone(1_000, 1_000 + RELOAD_COOLDOWN_MS)).toBe('reload');
  });
});

describe('describeTrouble', () => {
  it('names the reason and exit code when the page stops', () => {
    expect(describeTrouble({ kind: 'gone', reason: 'crashed', exitCode: 3 })).toBe(
      'console page stopped (crashed, exit code 3)',
    );
  });

  it('says how long startup waited', () => {
    expect(describeTrouble({ kind: 'slow' })).toContain(`${CONSOLE_READY_LIMIT_MS / 1000} s`);
  });

  it('holds a page error to a size', () => {
    const line = describeTrouble({ kind: 'error', message: 'x'.repeat(5000) });
    expect(line.length).toBeLessThan(2100);
  });
});

describe('problemPage', () => {
  it('shows what happened and the log folder, escaped', () => {
    const html = problemPage('The page <stopped>.', 'C:\\Users\\a&b\\logs');
    expect(html).toContain('The page &#60;stopped&#62;.');
    expect(html).toContain('C:\\Users\\a&#38;b\\logs');
    expect(html).not.toContain('<script');
  });
});
