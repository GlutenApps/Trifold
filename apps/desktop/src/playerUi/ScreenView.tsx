import { useEffect, useState } from 'react';
import type { ClientScreen } from '@trifold/api';
import { dmNow } from './clock';

/**
 * The TV's other screens on a phone (all screen types): a title card on its backdrop, an image
 * scene fitted to the screen, or the break screen with its countdown. Nothing here can be dragged
 * or saved with a long press.
 */
export function ScreenView({ screen }: { screen: ClientScreen }) {
  if (screen.kind === 'image') {
    return (
      <div className="pc-screen image" role="img" aria-label={screen.title}>
        <img src={screen.imageUrl} alt="" draggable={false} />
      </div>
    );
  }
  if (screen.kind === 'break') {
    return (
      <div className="pc-screen title backdrop-dark" data-testid="pc-break">
        <h2>{screen.title}</h2>
        {screen.subtitle && <p>{screen.subtitle}</p>}
        {screen.endsAt !== undefined && <Countdown endsAt={screen.endsAt} />}
      </div>
    );
  }
  return (
    <div className={`pc-screen title backdrop-${screen.backdrop}`} data-testid="pc-title">
      <h2>{screen.title}</h2>
      {screen.subtitle && <p>{screen.subtitle}</p>}
    </div>
  );
}

/** Counts down on the DM's clock (`dmNow`), so it reads the same as the TV. */
function Countdown({ endsAt }: { endsAt: number }) {
  const [now, setNow] = useState(() => dmNow());
  useEffect(() => {
    const t = window.setInterval(() => setNow(dmNow()), 500);
    return () => window.clearInterval(t);
  }, []);
  const left = Math.max(0, Math.round((endsAt - now) / 1000));
  const m = Math.floor(left / 60);
  const s = String(left % 60).padStart(2, '0');
  return <p className="pc-countdown">{left ? `${m}:${s}` : 'Back now'}</p>;
}
