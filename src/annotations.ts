export type MarkTool = "pen" | "marker" | "line" | "arrow" | "rectangle" | "ellipse";
export type MarkPoint = [number, number];
export interface ImageMark {
  tool: MarkTool;
  color: string;
  width: number;
  points: MarkPoint[];
}

export function imagePoint(x: number, y: number, rect: { left: number; top: number; width: number; height: number }): MarkPoint {
  return [Math.max(0, Math.min(1, (x - rect.left) / rect.width)), Math.max(0, Math.min(1, (y - rect.top) / rect.height))];
}

export function markPath(mark: ImageMark, width: number, height: number) {
  const points = mark.points.map(([x, y]) => [x * width, y * height]);
  const [x, y] = points[0];
  const [endX, endY] = points.at(-1)!;
  if (mark.tool === "rectangle") return `M${x} ${y}H${endX}V${endY}H${x}Z`;
  if (mark.tool === "ellipse") {
    const rx = Math.abs(endX - x) / 2, ry = Math.abs(endY - y) / 2;
    const cx = (x + endX) / 2, cy = (y + endY) / 2;
    if (!rx || !ry) return `M${x} ${y}L${endX} ${endY}`;
    return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0`;
  }
  if (mark.tool === "arrow") {
    const angle = Math.atan2(endY - y, endX - x);
    const length = Math.min(Math.hypot(endX - x, endY - y) / 2, mark.width * width * 5);
    return `M${x} ${y}L${endX} ${endY}M${endX - Math.cos(angle - 0.5) * length} ${endY - Math.sin(angle - 0.5) * length}L${endX} ${endY}L${endX - Math.cos(angle + 0.5) * length} ${endY - Math.sin(angle + 0.5) * length}`;
  }
  if (points.length === 1) return `M${x} ${y}l0.01 0`;
  if (mark.tool === "line") return `M${x} ${y}L${endX} ${endY}`;
  return `M${x} ${y}` + points.slice(1).map(([px, py], index) => {
    const next = points[index + 2];
    return next ? `Q${px} ${py} ${(px + next[0]) / 2} ${(py + next[1]) / 2}` : `L${px} ${py}`;
  }).join("");
}
