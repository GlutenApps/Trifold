import { Extension } from '@tiptap/core';
import type { Node as PmNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { findPhrase } from '@trifold/rules';

/**
 * Marks every occurrence of a phrase in the editor and singles one out as active, so a search
 * hit from the notes panel can be shown in place. Matching runs per text block, across inline
 * marks, the same way the panel's snippet search reads the stripped markdown.
 */
export interface SearchHighlightState {
  phrase: string;
  active: number;
}

export interface TextMatch {
  from: number;
  to: number;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    searchHighlight: {
      /** Highlights `phrase` (empty clears) with occurrence `active` singled out. */
      setSearchHighlight: (phrase: string, active: number) => ReturnType;
    };
  }
}

export const searchHighlightKey = new PluginKey<SearchHighlightState>('searchHighlight');

/** Document positions of every occurrence of `phrase`, in reading order. */
export function findMatches(doc: PmNode, phrase: string): TextMatch[] {
  const matches: TextMatch[] = [];
  if (!phrase) return matches;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // The block's text with a document position for every character.
    let text = '';
    const positions: number[] = [];
    node.forEach((child, offset) => {
      const start = pos + 1 + offset;
      if (child.isText) {
        for (let i = 0; i < child.text!.length; i += 1) positions.push(start + i);
        text += child.text;
      } else {
        positions.push(start);
        text += '\n';
      }
    });
    for (const at of findPhrase(text, phrase)) {
      const end = at + phrase.length - 1;
      matches.push({ from: positions[at]!, to: positions[end]! + 1 });
    }
    return false;
  });
  return matches;
}

export const SearchHighlight = Extension.create({
  name: 'searchHighlight',

  addCommands() {
    return {
      setSearchHighlight:
        (phrase, active) =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(searchHighlightKey, { phrase, active });
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchHighlightState>({
        key: searchHighlightKey,
        state: {
          init: () => ({ phrase: '', active: 0 }),
          apply: (tr, prev) => (tr.getMeta(searchHighlightKey) as SearchHighlightState) ?? prev,
        },
        props: {
          decorations(state) {
            const { phrase, active } = searchHighlightKey.getState(state) ?? {
              phrase: '',
              active: 0,
            };
            if (!phrase) return null;
            return DecorationSet.create(
              state.doc,
              findMatches(state.doc, phrase).map((m, i) =>
                Decoration.inline(m.from, m.to, {
                  class: i === active ? 'search-hit active' : 'search-hit',
                }),
              ),
            );
          },
        },
      }),
    ];
  },
});
