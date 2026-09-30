// Battle map geometry, shared by the map, the ruler and the tests.
//
// A map is drawn in "picture widths": x runs 0..1 across the picture and y runs
// 0..1/aspect down it (aspect = width / height), so a square cell is `cell` wide
// and `cell` tall. Cells are counted from the grid origin (ox, oy), which are
// fractions of the picture's width and height.

export const cellHeight = (grid, aspect) => grid.cell * aspect; // fraction of the picture's height

// The cell under a point given as fractions of the picture (u across, v down).
export function cellAt(u, v, grid, aspect) {
  return {
    col: Math.floor((u - grid.ox) / grid.cell),
    row: Math.floor((v - grid.oy) / cellHeight(grid, aspect)),
  };
}

// Picture fractions to picture-width units.
export const toUnits = (u, v, aspect) => ({ x: u, y: v / aspect });

// A cell position (may be fractional) to picture-width units.
export function cellToUnits(col, row, grid, aspect) {
  return { x: grid.ox + col * grid.cell, y: grid.oy / aspect + row * grid.cell };
}

// Squares between two cells when diagonals alternate 1 and 2.
export function distanceSquares(a, b) {
  const dx = Math.abs(b.col - a.col);
  const dy = Math.abs(b.row - a.row);
  const diagonals = Math.min(dx, dy);
  const straight = Math.max(dx, dy) - diagonals;
  return straight + diagonals + Math.floor(diagonals / 2);
}

// Where a token dropped with its centre at (u, v) lands: its top left cell, kept on the map.
export function dropCell(u, v, size, grid, aspect, cols, rows) {
  const c = (u - grid.ox) / grid.cell - size / 2;
  const r = (v - grid.oy) / cellHeight(grid, aspect) - size / 2;
  return {
    col: Math.max(0, Math.min(Math.round(c), cols - size)),
    row: Math.max(0, Math.min(Math.round(r), rows - size)),
  };
}

// The outline of a spell template in picture-width units, as SVG.
// Angle 0 points right, 90 points down. `unit` is the size of one square.
export function templateShape(t, grid, aspect) {
  const o = cellToUnits(t.x, t.y, grid, aspect);
  const len = t.size * grid.cell;
  const rad = (t.angle * Math.PI) / 180;
  const dir = { x: Math.cos(rad), y: Math.sin(rad) };
  const side = { x: -dir.y, y: dir.x };
  if (t.shape === 'circle') return { type: 'circle', cx: o.x, cy: o.y, r: len };
  if (t.shape === 'square') return { type: 'rect', x: o.x - len / 2, y: o.y - len / 2, size: len };
  if (t.shape === 'line') {
    const half = grid.cell / 2;
    const p = [
      [o.x + side.x * half, o.y + side.y * half],
      [o.x + dir.x * len + side.x * half, o.y + dir.y * len + side.y * half],
      [o.x + dir.x * len - side.x * half, o.y + dir.y * len - side.y * half],
      [o.x - side.x * half, o.y - side.y * half],
    ];
    return { type: 'polygon', points: p.map((q) => q.join(',')).join(' ') };
  }
  // cone: a 90 degree wedge
  const a1 = rad - Math.PI / 4;
  const a2 = rad + Math.PI / 4;
  const p1 = [o.x + Math.cos(a1) * len, o.y + Math.sin(a1) * len];
  const p2 = [o.x + Math.cos(a2) * len, o.y + Math.sin(a2) * len];
  return { type: 'path', d: `M ${o.x} ${o.y} L ${p1[0]} ${p1[1]} A ${len} ${len} 0 0 1 ${p2[0]} ${p2[1]} Z` };
}
