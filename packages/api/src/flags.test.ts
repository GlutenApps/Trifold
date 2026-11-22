import { describe, expect, it } from 'vitest';
import { FEATURE_FLAG_ENV, featureFlags } from './index';

describe('featureFlags', () => {
  it('leaves every flag off unless its variable is exactly 1', () => {
    expect(featureFlags({})).toEqual({ playerMode: false });
    expect(featureFlags({ [FEATURE_FLAG_ENV.playerMode]: 'true' })).toEqual({ playerMode: false });
    expect(featureFlags({ [FEATURE_FLAG_ENV.playerMode]: '1' })).toEqual({ playerMode: true });
  });
});
