import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WindowBoundary } from './WindowBoundary';

function Shell(): never {
  throw new Error('the shell broke');
}

describe('WindowBoundary', () => {
  beforeEach(() => {
    // React reports a caught error to the console; the test expects it.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(window.trifold.app.reportError).mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows the error with Reload and Open logs folder, and logs it', async () => {
    render(
      <WindowBoundary name="Console window">
        <Shell />
      </WindowBoundary>,
    );
    const alert = screen.getByTestId('window-crash');
    expect(alert).toHaveTextContent('Trifold hit a problem and stopped drawing this window.');
    expect(alert).toHaveTextContent('the shell broke');
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open logs folder' })).toBeInTheDocument();
    await waitFor(() =>
      expect(window.trifold.app.reportError).toHaveBeenCalledWith(
        'Console window',
        expect.stringContaining('the shell broke'),
      ),
    );
  });

  it('shows nothing on the TV, and still logs', async () => {
    const { container } = render(
      <WindowBoundary name="TV window" quiet>
        <Shell />
      </WindowBoundary>,
    );
    expect(container).toBeEmptyDOMElement();
    await waitFor(() =>
      expect(window.trifold.app.reportError).toHaveBeenCalledWith('TV window', expect.any(String)),
    );
  });

  it('draws its children when nothing is wrong', () => {
    render(
      <WindowBoundary name="Console window">
        <p>Console is fine</p>
      </WindowBoundary>,
    );
    expect(screen.getByText('Console is fine')).toBeInTheDocument();
  });
});
