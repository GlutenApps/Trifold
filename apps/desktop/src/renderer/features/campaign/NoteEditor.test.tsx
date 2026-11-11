import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NoteEditor } from './NoteEditor';

describe('NoteEditor', () => {
  it('shows markdown as formatted text', () => {
    render(
      <NoteEditor
        markdown={'# Arrival\n\nThe **gates** are shut.\n\n- [ ] Pay the toll\n- [x] Knock'}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Arrival');
    expect(screen.getByLabelText('Body').querySelector('strong')).toHaveTextContent('gates');
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    expect(boxes[1]).toBeChecked();
  });

  // The test's own limit must cover its two 10 s waits; under the 5 s default the macOS runner
  // timed the whole test out at 5.0 s before a wait could finish.
  it(
    'hands back markdown as the text changes, and the toolbar applies formatting',
    {
      timeout: 25_000,
    },
    async () => {
      const onChange = vi.fn();
      render(<NoteEditor markdown="" onChange={onChange} autoFocus />);

      // The toolbar keeps the caret where it was, so typing lands in the new heading.
      await userEvent.click(screen.getByRole('button', { name: 'Heading 2' }));
      await userEvent.keyboard('Secrets');
      // The first keystrokes also pay for the editor's setup; a loaded CI runner needs more than
      // the 3 s default (the macOS job failed at 3.1 s once).
      await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('## Secrets'), {
        timeout: 10_000,
      });
      expect(screen.getByRole('button', { name: 'Heading 2' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );

      await userEvent.keyboard('{Enter}');
      await userEvent.click(screen.getByRole('button', { name: 'Bulleted list' }));
      await userEvent.keyboard('The warden owes the guild');
      await waitFor(
        () =>
          expect(onChange).toHaveBeenLastCalledWith('## Secrets\n\n- The warden owes the guild'),
        { timeout: 10_000 },
      );
    },
  );

  it('highlights every occurrence of a phrase and singles out the active one', () => {
    const { rerender } = render(
      <NoteEditor
        markdown={'The dolls are cloth. **Dolls** of the party, then more dolls.'}
        onChange={() => undefined}
        highlight={{ phrase: 'dolls', active: 1 }}
      />,
    );
    const hits = () => Array.from(document.querySelectorAll('.search-hit'));
    expect(hits().map((h) => h.textContent)).toEqual(['dolls', 'Dolls', 'dolls']);
    expect(hits()[1]).toHaveClass('active');

    rerender(
      <NoteEditor
        markdown={'The dolls are cloth. **Dolls** of the party, then more dolls.'}
        onChange={() => undefined}
        highlight={null}
      />,
    );
    expect(hits()).toHaveLength(0);
  });
});
