import type { DisplayInfo } from '@trifold/api';

/**
 * Display names for Settings › Table display (ADR 0054). Screens are numbered 1, 2, … from left
 * to right (then top to bottom), the way the OS's own display settings lay them out, and
 * Identify shows that number on each screen. Pure, so the numbering is tested without Electron.
 */
export interface RawDisplay {
  id: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
  internal: boolean;
}

export function describeDisplays(all: readonly RawDisplay[], primaryId: number): DisplayInfo[] {
  const order = [...all].sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
  return all.map((d) => {
    const number = order.indexOf(d) + 1;
    const own = d.label.trim();
    return {
      id: d.id,
      number,
      label: own ? `Display ${number} · ${own}` : `Display ${number}`,
      bounds: d.bounds,
      scaleFactor: d.scaleFactor,
      isPrimary: d.id === primaryId,
      isInternal: d.internal,
    };
  });
}

/** How long Identify leaves the numbers up. */
export const IDENTIFY_MS = 3000;

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

/** The page Identify shows on one screen: its number, large, and its name. Self-contained. */
export function identifyPage(display: DisplayInfo): string {
  const tag = display.isPrimary
    ? 'Primary display'
    : `${display.bounds.width}×${display.bounds.height}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#14181d;color:#e6e1d6;overflow:hidden;
font-family:'Segoe UI',system-ui,sans-serif;user-select:none}
body{display:flex;flex-direction:column;align-items:center;justify-content:center;
border:4px solid #c45c45;box-sizing:border-box}
.n{font-size:140px;font-weight:600;line-height:1}
.l{margin-top:8px;font-size:18px}
.t{margin-top:4px;font-size:14px;color:#9aa3ad}
</style></head><body><div class="n">${display.number}</div>
<div class="l">${escapeHtml(display.label)}</div><div class="t">${escapeHtml(tag)}</div></body></html>`;
}
