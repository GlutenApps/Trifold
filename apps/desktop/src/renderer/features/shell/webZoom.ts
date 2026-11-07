/** Page zoom for web tabs (ADR 0011): the browser's familiar steps, saved per tab. */
export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

/** The next step up or down from `zoom`, which need not be on the list itself. */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  if (direction === 1) return ZOOM_STEPS.find((s) => s > zoom + 1e-6) ?? ZOOM_STEPS.at(-1)!;
  return [...ZOOM_STEPS].reverse().find((s) => s < zoom - 1e-6) ?? ZOOM_STEPS[0]!;
}

export function formatZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}
