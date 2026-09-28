import { useEffect, useRef } from 'react';
import { useShellStore } from '../../stores/shellStore';
import { cancelClose, confirmClose } from './campaignFlow';

/** The only modal in the app (ADR 0004, Decision 2). */
export function CloseCampaignPrompt() {
  const open = useShellStore((s) => s.closePrompt);
  const keep = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) keep.current?.focus();
  }, [open]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onClick={cancelClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-campaign-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') cancelClose();
        }}
      >
        <h2 id="close-campaign-title">Something is on the player window</h2>
        <p>Closing stops sharing to the player window and ends the session.</p>
        <div className="row modal-actions">
          <button ref={keep} type="button" className="btn" onClick={cancelClose}>
            Keep running
          </button>
          <button type="button" className="btn primary" onClick={confirmClose}>
            Stop sharing and close
          </button>
        </div>
      </div>
    </div>
  );
}
