import type { MinorKind } from '@trifold/schema';
import { QuickNotesTool } from '../campaign/QuickNotesTool';
import { MusicTool } from '../music/MusicTool';
import { ScenesTool } from '../presenter/ScenesTool';
import type { IconName } from './icons';

/**
 * The minors (ADR 0004, amended by ADR 0009): the tall tools that live in the dock, keyed by
 * the schema's `MinorKind`. This is the only place a kind meets its tool and icon; the dock and
 * the flyout go through it. Dice, Hotkeys and Layouts are pop-ups, not minors (Pop.tsx).
 */
export const MINOR_ICON: Record<MinorKind, IconName> = {
  music: 'music',
  scenes: 'clapper',
  quickNotes: 'quill',
};

/** Minor kind → the tool that fills its dock section or flyout. */
export function MinorBody({ kind }: { kind: MinorKind }) {
  switch (kind) {
    case 'music':
      return <MusicTool />;
    case 'scenes':
      return <ScenesTool />;
    case 'quickNotes':
      return <QuickNotesTool />;
  }
}
