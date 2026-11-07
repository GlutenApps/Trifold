import { useEffect, useState } from 'react';
import { PlayerScreen } from './features/presenter/PlayerScreen';
import { AppShell } from './features/shell/AppShell';

/**
 * The router, and the whole of it (ADR 0002): one renderer bundle serves two windows, and the
 * hash decides which. `#/player` mounts the player screen, a pure view of pushed state; anything
 * else mounts the console shell. The window title follows the route.
 */

export type Route = 'console' | 'player';

/** `#/player` → player window; anything else → console (ADR 0002). */
export function routeFromHash(hash: string): Route {
  const first = hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return first === 'player' ? 'player' : 'console';
}

export function App() {
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(routeFromHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  useEffect(() => {
    document.title = route === 'player' ? 'Trifold player' : 'Trifold';
  }, [route]);

  return route === 'player' ? <PlayerScreen /> : <AppShell />;
}
