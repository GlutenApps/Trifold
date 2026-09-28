import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ConsoleShell } from './ConsoleShell';

describe('ConsoleShell', () => {
  it('renders the left rail with every section and loads app state', async () => {
    render(<ConsoleShell />);
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    const labels = [
      'Campaign',
      'Compendium',
      'Encounters',
      'Presenter',
      'Music',
      'Dice',
      'Settings',
    ];
    for (const label of labels) {
      expect(nav).toHaveTextContent(label);
    }
    await waitFor(() => expect(window.trifold.library.getInfo).toHaveBeenCalled());
  });

  it('switches pages from the rail', async () => {
    render(<ConsoleShell />);
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Presenter' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Presenter' })).toBeInTheDocument();
  });

  it('toggles blackout from the hotkey and pushes to main', async () => {
    render(<ConsoleShell />);
    await userEvent.keyboard('{Control>}{Shift>}b{/Shift}{/Control}');
    expect(window.trifold.presenter.push).toHaveBeenCalledWith(
      expect.objectContaining({ blackout: false }),
    );
  });
});
