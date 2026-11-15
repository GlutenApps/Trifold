import { mediaUrl } from '@trifold/api';
import type { EntityRef, NPC, PCCard } from '@trifold/schema';
import { creatureArtUrl } from '../../stores/artStore';
import { useCampaignStore } from '../../stores/campaignStore';

/**
 * Which picture a token shows (ADR 0033), the same on the console and the TV:
 *
 * 1. its own art (Set art… › This token), or none at all when it is set empty (Remove art… ›
 *    This token, while the creature keeps its picture);
 * 2. a PC's or NPC's portrait, set once for every token of them;
 * 3. the compendium creature's art, Library-wide (an NPC falls back to its stat block's);
 * 4. otherwise nothing, and the token draws its game-icons glyph.
 */
export interface ArtSources {
  slug: string;
  pcs: readonly Pick<PCCard, 'id' | 'portrait'>[];
  npcs: readonly Pick<NPC, 'id' | 'portrait' | 'recordRef'>[];
  creature(key: string): string | undefined;
}

export function resolveTokenArt(
  token: { art?: string | undefined; ref: EntityRef },
  sources: ArtSources,
): string | undefined {
  // An empty `art` is this token's art removed while its creature keeps one: no picture here.
  if (token.art !== undefined) return token.art ? mediaUrl(sources.slug, token.art) : undefined;
  const ref = token.ref;
  if (ref.kind === 'pc') {
    const portrait = sources.pcs.find((p) => p.id === ref.pcId)?.portrait;
    return portrait ? mediaUrl(sources.slug, portrait) : undefined;
  }
  if (ref.kind === 'npc') {
    const npc = sources.npcs.find((n) => n.id === ref.npcId);
    if (npc?.portrait) return mediaUrl(sources.slug, npc.portrait);
    return npc?.recordRef ? sources.creature(npc.recordRef.key) : undefined;
  }
  if (ref.kind === 'record') return sources.creature(ref.ref.key);
  return undefined;
}

/** The open campaign and the Library's creature art, as the resolver needs them. */
export function currentArtSources(slug?: string): ArtSources {
  const current = useCampaignStore.getState().current;
  return {
    slug: slug ?? current?.campaign.slug ?? '',
    pcs: current?.pcs ?? [],
    npcs: current?.npcs ?? [],
    creature: (key) => creatureArtUrl('monster', key),
  };
}

/** A token's picture in the open campaign. */
export const tokenArtUrl = (token: { art?: string | undefined; ref: EntityRef }, slug?: string) =>
  resolveTokenArt(token, currentArtSources(slug));
