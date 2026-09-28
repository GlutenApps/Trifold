import { useEffect, useState } from 'react';
import { PlayerView } from './features/presenter/PlayerView';
import { ConsoleShell } from './features/shell/ConsoleShell';

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

  return route === 'player' ? <PlayerView /> : <ConsoleShell />;
}
