import type { MinorKind } from '@trifold/schema';
import { MusicTool } from '../music/MusicTool';
import { ScenesTool } from '../presenter/ScenesTool';
import type { IconName } from './icons';

export const MINOR_ICON: Record<MinorKind, IconName> = {
  music: 'music',
  scenes: 'clapper',
};

/** Minor kind → the tool that fills its dock section or flyout. */
export function MinorBody({ kind }: { kind: MinorKind }) {
  switch (kind) {
    case 'music':
      return <MusicTool />;
    case 'scenes':
      return <ScenesTool />;
  }
}
