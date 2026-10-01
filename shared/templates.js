// Which tokens stand inside a drawn area (spell template). Same geometry as the shapes drawn on the
// map (client/src/lib/battleMath.js templateShape): everything is in "picture widths", x across and
// y down, so a square cell is `cell` wide and tall. A token counts when its centre is inside, with a small
// bias towards counting more characters rather than fewer: the centre may be up to AREA_MARGIN of a square
// outside the edge of the area.

export const AREA_MARGIN = 0.25; // squares

// Distance from point (px, py) to the segment (0,0)-(sx,sy), all relative to the area's origin.
function segmentDistance(px, py, sx, sy) {
  const len2 = sx * sx + sy * sy;
  const k = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * sx + py * sy) / len2));
  return Math.hypot(px - sx * k, py - sy * k);
}

// template: { shape, x, y, size, angle }  (x, y in cells from the grid origin; angle 0 = right, 90 = down)
// token: { col, row, size }     grid: { cell, ox, oy }     aspect: picture width / height
export function tokenInTemplate(template, token, grid, aspect, margin = AREA_MARGIN) {
  const origin = { x: grid.ox + template.x * grid.cell, y: grid.oy / aspect + template.y * grid.cell };
  const centre = { x: grid.ox + (token.col + token.size / 2) * grid.cell, y: grid.oy / aspect + (token.row + token.size / 2) * grid.cell };
  const len = template.size * grid.cell;
  const m = margin * grid.cell;
  const rad = (template.angle * Math.PI) / 180;
  const dir = { x: Math.cos(rad), y: Math.sin(rad) };
  const dx = centre.x - origin.x;
  const dy = centre.y - origin.y;
  const dist = Math.hypot(dx, dy);
  const eps = 1e-9;
  if (template.shape === 'circle') return dist <= len + m + eps;
  if (template.shape === 'square') return Math.abs(dx) <= len / 2 + m + eps && Math.abs(dy) <= len / 2 + m + eps;
  const along = dx * dir.x + dy * dir.y;
  const across = -dx * dir.y + dy * dir.x;
  if (template.shape === 'line') return along >= -m - eps && along <= len + m + eps && Math.abs(across) <= grid.cell / 2 + m + eps;
  // cone: a 90 degree wedge; arc: a 180 degree one
  if (dist > len + m + eps) return false;
  if (dist < m + eps) return true;
  const half = template.shape === 'arc' ? Math.PI / 2 : Math.PI / 4;
  if (Math.abs(Math.atan2(across, along)) <= half + eps) return true;
  // Outside the wedge, but within the margin of one of its straight edges.
  const edge = (sign) => [Math.cos(half) * len, sign * Math.sin(half) * len];
  return [1, -1].some((sign) => {
    const [ex, ey] = edge(sign);
    return segmentDistance(along, across, ex, ey) <= m + eps;
  });
}

export const tokensInTemplate = (template, tokens, grid, aspect, margin = AREA_MARGIN) => tokens.filter((t) => tokenInTemplate(template, t, grid, aspect, margin));
