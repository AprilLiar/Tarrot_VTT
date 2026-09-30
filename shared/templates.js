// Which tokens stand inside a drawn area (spell template). Same geometry as the shapes drawn on the
// map (client/src/lib/battleMath.js templateShape): everything is in "picture widths", x across and
// y down, so a square cell is `cell` wide and tall. A token counts when its centre is inside.

// template: { shape, x, y, size, angle }  (x, y in cells from the grid origin; angle 0 = right, 90 = down)
// token: { col, row, size }     grid: { cell, ox, oy }     aspect: picture width / height
export function tokenInTemplate(template, token, grid, aspect) {
  const origin = { x: grid.ox + template.x * grid.cell, y: grid.oy / aspect + template.y * grid.cell };
  const centre = { x: grid.ox + (token.col + token.size / 2) * grid.cell, y: grid.oy / aspect + (token.row + token.size / 2) * grid.cell };
  const len = template.size * grid.cell;
  const rad = (template.angle * Math.PI) / 180;
  const dir = { x: Math.cos(rad), y: Math.sin(rad) };
  const dx = centre.x - origin.x;
  const dy = centre.y - origin.y;
  const dist = Math.hypot(dx, dy);
  const eps = 1e-9;
  if (template.shape === 'circle') return dist <= len + eps;
  if (template.shape === 'square') return Math.abs(dx) <= len / 2 + eps && Math.abs(dy) <= len / 2 + eps;
  const along = dx * dir.x + dy * dir.y;
  const across = -dx * dir.y + dy * dir.x;
  if (template.shape === 'line') return along >= -eps && along <= len + eps && Math.abs(across) <= grid.cell / 2 + eps;
  // cone: a 90 degree wedge
  if (dist > len + eps) return false;
  if (dist < eps) return true;
  return Math.abs(Math.atan2(across, along)) <= Math.PI / 4 + eps;
}

export const tokensInTemplate = (template, tokens, grid, aspect) => tokens.filter((t) => tokenInTemplate(template, t, grid, aspect));
