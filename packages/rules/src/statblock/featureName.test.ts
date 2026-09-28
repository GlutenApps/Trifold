import { describe, expect, it } from 'vitest';
import { parseFeatureName, parseRechargeCode } from './featureName';

describe('parseFeatureName', () => {
  it('extracts uses per day and strips them from the display name', () => {
    expect(parseFeatureName('Dominate Mind (2/Day)')).toMatchObject({
      displayName: 'Dominate Mind',
      uses: { count: 2, per: 'day' },
    });
    expect(parseFeatureName('Legendary Resistance (3/Day)').uses).toEqual({ count: 3, per: 'day' });
    expect(parseFeatureName('Legendary Actions (3/Turn)').uses).toEqual({ count: 3, per: 'turn' });
    expect(parseFeatureName('Second Wind (1/Short Rest)').uses).toEqual({
      count: 1,
      per: 'shortRest',
    });
  });

  it('extracts recharge ranges with either dash', () => {
    expect(parseFeatureName('Frightful Presence (Recharge 5–6)')).toMatchObject({
      displayName: 'Frightful Presence',
      recharge: { min: 5, max: 6 },
    });
    expect(parseFeatureName('Fire Breath (Recharge 5-6)').recharge).toEqual({ min: 5, max: 6 });
    expect(parseFeatureName('Lightning Breath (Recharge 6)').recharge).toEqual({ min: 6, max: 6 });
  });

  it('flags bonus actions, keeping other parentheticals', () => {
    const parsed = parseFeatureName(
      'Fey Step (Fey Only; Recharges after a Long Rest) (Bonus Action)',
    );
    expect(parsed.isBonusAction).toBe(true);
    expect(parsed.displayName).toBe('Fey Step (Fey Only; Recharges after a Long Rest)');
    expect(parseFeatureName('Multiattack').isBonusAction).toBe(false);
  });

  it('flags variants and legendary costs', () => {
    expect(parseFeatureName('Variant: Sunlight Sensitivity')).toMatchObject({
      displayName: 'Sunlight Sensitivity',
      isVariant: true,
    });
    expect(parseFeatureName('Wing Attack (Costs 2 Actions)')).toMatchObject({
      displayName: 'Wing Attack',
      cost: 2,
    });
  });
});

describe('parseRechargeCode', () => {
  it('maps every documented code', () => {
    expect(parseRechargeCode('D5')).toEqual({ recharge: { min: 5, max: 6 } });
    expect(parseRechargeCode('d6')).toEqual({ recharge: { min: 6, max: 6 } });
    expect(parseRechargeCode('1/DAY')).toEqual({ uses: { count: 1, per: 'day' } });
    expect(parseRechargeCode('3/TURN')).toEqual({ uses: { count: 3, per: 'turn' } });
    expect(parseRechargeCode('SHORT')).toEqual({ uses: { count: 1, per: 'shortRest' } });
  });

  it('returns null for unknown codes', () => {
    expect(parseRechargeCode('')).toBeNull();
    expect(parseRechargeCode('D9')).toBeNull();
    expect(parseRechargeCode('sometimes')).toBeNull();
  });
});
