/** Damage math (DESIGN.md §6.4): temp HP first, resist/immune/vulnerable by type. */

export interface DamageProfile {
  vulnerabilities: readonly string[];
  resistances: readonly string[];
  immunities: readonly string[];
}

export interface DamageMultiplier {
  multiplier: 0 | 0.5 | 1 | 2;
  reason: 'immune' | 'resistant' | 'vulnerable' | 'normal';
  /** The matching list entry carried a qualifier (e.g. "from nonmagical attacks"); the DM decides. */
  qualified: boolean;
  entry?: string;
}

function matches(entry: string, type: string): { hit: boolean; qualified: boolean } {
  const e = entry.toLowerCase();
  const t = type.toLowerCase();
  const words = e.split(/[^a-z]+/).filter(Boolean);
  const hit = words.includes(t) || (t === 'nonmagical' && e.includes('nonmagical'));
  const qualified = /\b(from|that|while|except|unless|nonmagical|silvered|adamantine)\b/.test(e);
  return { hit, qualified };
}

/** Immunity wins over vulnerability, which wins over resistance. No type → normal damage. */
export function damageMultiplier(
  type: string | undefined,
  profile: DamageProfile,
): DamageMultiplier {
  if (!type) return { multiplier: 1, reason: 'normal', qualified: false };
  const find = (list: readonly string[]) => {
    for (const entry of list) {
      const m = matches(entry, type);
      if (m.hit) return { entry, qualified: m.qualified };
    }
    return null;
  };
  const immune = find(profile.immunities);
  if (immune)
    return { multiplier: 0, reason: 'immune', qualified: immune.qualified, entry: immune.entry };
  const vulnerable = find(profile.vulnerabilities);
  if (vulnerable)
    return {
      multiplier: 2,
      reason: 'vulnerable',
      qualified: vulnerable.qualified,
      entry: vulnerable.entry,
    };
  const resistant = find(profile.resistances);
  if (resistant)
    return {
      multiplier: 0.5,
      reason: 'resistant',
      qualified: resistant.qualified,
      entry: resistant.entry,
    };
  return { multiplier: 1, reason: 'normal', qualified: false };
}

export interface HitPoints {
  current: number;
  max: number;
  temp: number;
}

export interface DamageOutcome {
  hp: HitPoints;
  /** Damage after the multiplier, before temp HP. */
  adjusted: number;
  absorbedByTemp: number;
  dealt: number;
  /** Damage remaining after reaching 0 equals or exceeds max HP (instant death rule hint). */
  massive: boolean;
}

export function applyDamage(hp: HitPoints, amount: number, multiplier: number = 1): DamageOutcome {
  const adjusted = Math.max(0, Math.floor(Math.max(0, amount) * multiplier));
  const absorbedByTemp = Math.min(hp.temp, adjusted);
  const remaining = adjusted - absorbedByTemp;
  const dealt = Math.min(Math.max(hp.current, 0), remaining);
  const overflow = remaining - dealt;
  return {
    hp: {
      current: Math.max(0, hp.current - remaining),
      max: hp.max,
      temp: hp.temp - absorbedByTemp,
    },
    adjusted,
    absorbedByTemp,
    dealt,
    massive: hp.current > 0 && hp.current - remaining <= 0 && overflow >= hp.max,
  };
}

export function applyHealing(hp: HitPoints, amount: number): HitPoints {
  return { ...hp, current: Math.min(hp.max, Math.max(0, hp.current) + Math.max(0, amount)) };
}

/** Temp HP does not stack: keep the higher value. */
export function grantTempHp(hp: HitPoints, amount: number): HitPoints {
  return { ...hp, temp: Math.max(hp.temp, Math.max(0, amount)) };
}

/** DC 10 or half the damage taken, whichever is higher (2024 rules). */
export function concentrationDc(damage: number): number {
  return Math.max(10, Math.floor(damage / 2));
}
