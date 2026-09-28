import type { MinorKind } from '@trifold/schema';
import { DiceRoller } from '../dice/DiceRoller';
import { MusicTool } from '../music/MusicTool';
import { ScenesTool } from '../presenter/ScenesTool';
import { TvControls } from '../presenter/TvControls';
import { HotkeysTool } from './HotkeysTool';
import type { IconName } from './icons';
import { LayoutsTool } from './LayoutsTool';

export const MINOR_ICON: Record<MinorKind, IconName> = {
  dice: 'dice',
  tv: 'tv',
  music: 'music',
  scenes: 'image',
  hotkeys: 'keys',
  layouts: 'layout',
};

/** Minor kind → the tool that fills its dock section or flyout. */
export function MinorBody({ kind }: { kind: MinorKind }) {
  switch (kind) {
    case 'dice':
      return <DiceRoller />;
    case 'tv':
      return <TvControls />;
    case 'music':
      return <MusicTool />;
    case 'scenes':
      return <ScenesTool />;
    case 'hotkeys':
      return <HotkeysTool />;
    case 'layouts':
      return <LayoutsTool />;
  }
}
