import { geometryBounds } from './geometry.js';

export function computeGeometryViewport(entries, width = 1000, height = 560, padding = 36) {
  const boundsList = entries.map((entry) => geometryBounds(entry.geometry)).filter(Boolean);
  if (!boundsList.length) return null;

  const bounds = {
    minX: Math.min(...boundsList.map((item) => item.minX)),
    minY: Math.min(...boundsList.map((item) => item.minY)),
    maxX: Math.max(...boundsList.map((item) => item.maxX)),
    maxY: Math.max(...boundsList.map((item) => item.maxY)),
  };
  const dx = Math.max(bounds.maxX - bounds.minX, Number.EPSILON);
  const dy = Math.max(bounds.maxY - bounds.minY, Number.EPSILON);
  const scale = Math.min((width - padding * 2) / dx, (height - padding * 2) / dy);
  const renderedWidth = dx * scale;
  const renderedHeight = dy * scale;
  const offsetX = (width - renderedWidth) / 2;
  const offsetY = (height - renderedHeight) / 2;

  return {
    bounds,
    scale,
    width,
    height,
    padding,
    project: ([x, y]) => [
      offsetX + (x - bounds.minX) * scale,
      height - (offsetY + (y - bounds.minY) * scale),
    ],
  };
}
