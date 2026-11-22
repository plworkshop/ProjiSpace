export const clampScroll = (value: number, max: number) =>
  Math.max(0, Math.min(max, value));
export const dragScroll = (
  startLeft: number,
  distance: number,
  scale: number,
  max: number,
) => clampScroll(startLeft + distance * scale, max);
export const wheelDistance = (delta: number, mode: number, viewport: number) =>
  delta * (mode === 1 ? 40 : mode === 2 ? viewport : 1);
export function stepScroll(current: number, target: number, elapsed: number) {
  return Math.abs(target - current) < 0.3
    ? target
    : current + (target - current) * (1 - Math.exp(-elapsed / 65));
}
