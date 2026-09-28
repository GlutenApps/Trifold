/**
 * Minimal shapes of Open5e v2 API records (DATA-FORMATS.md §4), verified against
 * https://api.open5e.com/v2/ on 2026-09-27. Only the fields the normalizer reads are typed;
 * everything is optional because the importer is lenient.
 */

export interface O5eNamed {
  name?: string | null;
  key?: string | null;
}

export interface O5eDocument extends O5eNamed {
  display_name?: string | null;
  publisher?: O5eNamed | null;
  permalink?: string | null;
}

export interface O5eBase {
  key: string;
  name: string;
  desc?: string | null;
  document?: O5eDocument | null;
}

export interface O5eAttack {
  name?: string | null;
  attack_type?: string | null;
  to_hit_mod?: number | null;
  reach?: number | null;
  range?: number | null;
  long_range?: number | null;
  damage_die_count?: number | null;
  damage_die_type?: string | null;
  damage_bonus?: number | null;
  damage_type?: O5eNamed | null;
  extra_damage_die_count?: number | null;
  extra_damage_die_type?: string | null;
  extra_damage_bonus?: number | null;
  extra_damage_type?: O5eNamed | null;
}

export interface O5eAction {
  name?: string | null;
  desc?: string | null;
  attacks?: O5eAttack[] | null;
  action_type?: string | null;
  legendary_action_cost?: number | null;
  usage_limits?: { type?: string | null; param?: number | null } | null;
}

export interface O5eTrait {
  name?: string | null;
  desc?: string | null;
  type?: string | null;
}

export interface O5eCreature extends O5eBase {
  type?: O5eNamed | null;
  subcategory?: string | null;
  size?: O5eNamed | null;
  challenge_rating?: number | null;
  proficiency_bonus?: number | null;
  speed?: Record<string, number | string | null> | null;
  speed_all?: Record<string, number | string | boolean | null> | null;
  alignment?: string | null;
  languages?: { as_string?: string | null } | null;
  armor_class?: number | null;
  armor_detail?: string | null;
  hit_points?: number | null;
  hit_dice?: string | null;
  experience_points?: number | null;
  ability_scores?: Record<string, number | null> | null;
  initiative_bonus?: number | null;
  saving_throws?: Record<string, number | null> | null;
  skill_bonuses?: Record<string, number | null> | null;
  passive_perception?: number | null;
  resistances_and_immunities?: {
    damage_immunities_display?: string | null;
    damage_resistances_display?: string | null;
    damage_vulnerabilities_display?: string | null;
    condition_immunities_display?: string | null;
  } | null;
  darkvision_range?: number | null;
  blindsight_range?: number | null;
  tremorsense_range?: number | null;
  truesight_range?: number | null;
  actions?: O5eAction[] | null;
  traits?: O5eTrait[] | null;
  environments?: O5eNamed[] | null;
}

export interface O5eSpell extends O5eBase {
  level?: number | null;
  school?: O5eNamed | null;
  classes?: O5eNamed[] | null;
  casting_time?: string | null;
  reaction_condition?: string | null;
  range_text?: string | null;
  ritual?: boolean | null;
  verbal?: boolean | null;
  somatic?: boolean | null;
  material?: boolean | null;
  material_specified?: string | null;
  duration?: string | null;
  concentration?: boolean | null;
  higher_level?: string | null;
  damage_roll?: string | null;
  damage_types?: O5eNamed[] | string[] | null;
  casting_options?: Array<{ type?: string | null; damage_roll?: string | null }> | null;
}

export interface O5eItem extends O5eBase {
  category?: O5eNamed | null;
  weapon?: {
    damage_type?: O5eNamed | null;
    damage_dice?: string | null;
    properties?: Array<{
      property?: { name?: string | null } | null;
      detail?: string | null;
    }> | null;
    is_martial?: boolean | null;
  } | null;
  armor?: {
    category?: string | null;
    ac_base?: number | null;
    grants_stealth_disadvantage?: boolean | null;
    strength_score_required?: number | null;
  } | null;
  weight?: string | number | null;
  cost?: string | number | null;
  rarity?: O5eNamed | string | null;
  requires_attunement?: boolean | string | null;
}

export interface O5eFeat extends O5eBase {
  prerequisite?: string | null;
  has_prerequisite?: boolean | null;
  type?: string | null;
  benefits?: Array<{ desc?: string | null }> | null;
}

export interface O5eSpecies extends O5eBase {
  is_subspecies?: boolean | null;
  subspecies_of?: O5eNamed | null;
  traits?: O5eTrait[] | null;
}

export interface O5eBackground extends O5eBase {
  benefits?: Array<{ name?: string | null; desc?: string | null; type?: string | null }> | null;
}

export interface O5eClass extends O5eBase {
  hit_dice?: string | null;
  subclass_of?: O5eNamed | null;
  saving_throws?: O5eNamed[] | null;
  caster_type?: string | null;
  features?: Array<{
    name?: string | null;
    desc?: string | null;
    feature_type?: string | null;
    gained_at?: Array<{ level?: number | null; detail?: string | null }> | null;
    data_for_class_table?: Array<{ level?: number | null; column_value?: string | null }> | null;
  }> | null;
}

export type O5eKind =
  'creatures' | 'spells' | 'items' | 'feats' | 'species' | 'backgrounds' | 'classes';

export const O5E_KINDS: readonly O5eKind[] = [
  'creatures',
  'spells',
  'items',
  'feats',
  'species',
  'backgrounds',
  'classes',
];
