import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MyCharactersTool } from '../joined/MyCharactersTool';
import { PanelBoundary } from './PanelBoundary';

let broken = true;
function Tool() {
  if (broken) throw new Error('the tool broke');
  return <p>Tool is fine</p>;
}

describe('PanelBoundary', () => {
  beforeEach(() => {
    broken = true;
    // React reports a caught error to the console; the test expects it.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(window.trifold.app.reportError).mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('keeps a panel’s error to that panel, logs it, and tries again when asked', async () => {
    render(
      <>
        <PanelBoundary name="Initiative">
          <Tool />
        </PanelBoundary>
        <PanelBoundary name="Quick notes">
          <p>Notes are fine</p>
        </PanelBoundary>
      </>,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Initiative hit a problem and stopped.');
    expect(alert).toHaveTextContent('the tool broke');
    // The panel beside it is untouched.
    expect(screen.getByText('Notes are fine')).toBeInTheDocument();
    await waitFor(() =>
      expect(window.trifold.app.reportError).toHaveBeenCalledWith(
        'Initiative',
        expect.stringContaining('the tool broke'),
      ),
    );

    // Still broken: the message stays. Once whatever broke it is gone, Try again brings it back.
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    broken = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('Tool is fine')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();

    await userEvent.click;
  });

  it('opens the logs folder from the message', async () => {
    render(
      <PanelBoundary name="VTT">
        <Tool />
      </PanelBoundary>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open logs folder' }));
    expect(window.trifold.app.openLogsFolder).toHaveBeenCalled();
  });

  it('holds a player tool drawn with no table to read', () => {
    // What blanked the window before: My characters outside a player console's table.
    render(
      <PanelBoundary name="My characters">
        <MyCharactersTool />
      </PanelBoundary>,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('My characters hit a problem and stopped.');
    expect(alert).toHaveTextContent('usePlayerTable outside a player console');
  });
});
