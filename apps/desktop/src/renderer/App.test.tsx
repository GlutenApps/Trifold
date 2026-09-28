import { describe, expect, it } from 'vitest';
import { routeFromHash } from './App';

describe('routeFromHash', () => {
  it('maps the player hash and defaults to the console', () => {
    expect(routeFromHash('#/player')).toBe('player');
    expect(routeFromHash('#player')).toBe('player');
    expect(routeFromHash('#/player/anything')).toBe('player');
    expect(routeFromHash('#/console')).toBe('console');
    expect(routeFromHash('')).toBe('console');
    expect(routeFromHash('#/')).toBe('console');
  });
});
