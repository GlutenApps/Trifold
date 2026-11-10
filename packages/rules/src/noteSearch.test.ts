import { describe, expect, it } from 'vitest';
import { findPhrase, phraseSnippets, searchNotes, stripMarkdown } from './noteSearch';

describe('stripMarkdown', () => {
  it('drops headings, emphasis, list markers, quotes, links and fences but keeps the words', () => {
    const md = [
      '# Arrival',
      '',
      '> **Read aloud:** the *gates* are shut.',
      '',
      '- [ ] Toll of `5 gp`',
      '2. See [the warden](npc:warden)',
      '',
      '---',
      '```',
      'code here',
      '```',
    ].join('\n');
    expect(stripMarkdown(md)).toBe(
      [
        'Arrival',
        '',
        'Read aloud: the gates are shut.',
        '',
        'Toll of 5 gp',
        'See the warden',
        '',
        'code here',
      ].join('\n'),
    );
  });

  it('leaves underscores inside words and lone asterisks alone', () => {
    expect(stripMarkdown('snake_case_name and 2 * 3')).toBe('snake_case_name and 2 * 3');
  });
});

describe('findPhrase', () => {
  it('finds every case-insensitive occurrence without overlapping', () => {
    expect(findPhrase('Doll doll DOLLdoll', 'doll')).toEqual([0, 5, 10, 14]);
    expect(findPhrase('aaa', 'aa')).toEqual([0]);
    expect(findPhrase('anything', '')).toEqual([]);
  });
});

describe('searchNotes', () => {
  const notes = [
    { id: 'a', title: 'The dolls', body: 'Nothing here.' },
    {
      id: 'b',
      title: 'Path B',
      body: 'When they look at the **dolls**: the dolls are cloth. A third doll sits apart, then more dolls.',
    },
    { id: 'c', title: 'Overview', body: 'No hits.' },
  ];

  it('matches titles and bodies as a phrase, keeping note order', () => {
    const hits = searchNotes(notes, 'dolls');
    expect(hits.map((h) => [h.noteId, h.titleMatch, h.count])).toEqual([
      ['a', true, 0],
      ['b', false, 3],
    ]);
  });

  it('gives each hit a snippet with context, the match as written, and its occurrence', () => {
    const [, b] = searchNotes(notes, 'DOLLS', { context: 12 });
    expect(b?.snippets.map((s) => `${s.before}[${s.match}]${s.after}`)).toEqual([
      '…at the [dolls]: the dolls…',
      '…dolls: the [dolls] are cloth.…',
      '…then more [dolls].',
    ]);
    expect(b?.snippets.map((s) => s.occurrence)).toEqual([0, 1, 2]);
  });

  it('caps snippets but still reports the full count', () => {
    const [, b] = searchNotes(notes, 'doll', { maxSnippets: 2 });
    expect(b?.count).toBe(4);
    expect(b?.snippets).toHaveLength(2);
  });

  it('matches nothing on a blank query', () => {
    expect(searchNotes(notes, '  ')).toEqual([]);
  });
});

describe('phraseSnippets', () => {
  it('counts every occurrence in plain text and keeps the first few with context', () => {
    const text = 'Hesper runs the inn. Ask hesper about the bridge. HESPER lies.';
    const { count, snippets } = phraseSnippets(text, 'hesper', { maxSnippets: 2, context: 12 });
    expect(count).toBe(3);
    expect(snippets.map((s) => [s.match, s.occurrence])).toEqual([
      ['Hesper', 0],
      ['hesper', 1],
    ]);
    expect(snippets[1]!.before).toMatch(/Ask $/);
    expect(phraseSnippets(text, 'zzz')).toEqual({ count: 0, snippets: [] });
  });
});
