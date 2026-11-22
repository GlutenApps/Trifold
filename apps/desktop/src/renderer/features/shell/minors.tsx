import { QuickNotesTool } from '../campaign/QuickNotesTool';
import { CountersTool } from '../counters/CountersTool';
import { TimersTool } from '../timers/TimersTool';
import { MusicTool } from '../music/MusicTool';
import { ScenesTool } from '../presenter/ScenesTool';
import { InitiativeTool } from '../joined/InitiativeTool';
import { MyCharactersTool } from '../joined/MyCharactersTool';
import type { ToolKind } from '../../stores/shellLayout';
import type { IconName } from './icons';

/**
 * The minors (ADR 0004, amended by ADR 0009): the tall tools that live in the dock, keyed by
 * the schema's `MinorKind` for the GM's console and `PlayerMinorKind` for the player's
 * (docs/PLAYER-MODE.md). This is the only place a kind meets its tool and icon; the dock and
 * the flyout go through it. Dice, Hotkeys and Layouts are pop-ups, not minors (Pop.tsx).
 */
export const MINOR_ICON: Record<ToolKind, IconName> = {
  music: 'music',
  scenes: 'clapper',
  quickNotes: 'quill',
  counters: 'tally',
  timers: 'stopwatch',
  myCharacters: 'party',
  initiative: 'combat',
};

/** Minor kind → the tool that fills its dock section or flyout. */
export function MinorBody({ kind }: { kind: ToolKind }) {
  switch (kind) {
    case 'music':
      return <MusicTool />;
    case 'scenes':
      return <ScenesTool />;
    case 'quickNotes':
      return <QuickNotesTool />;
    case 'counters':
      return <CountersTool />;
    case 'timers':
      return <TimersTool />;
    case 'myCharacters':
      return <MyCharactersTool />;
    case 'initiative':
      return <InitiativeTool />;
  }
}
