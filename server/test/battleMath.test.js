import { describe, it, expect } from 'vitest';
import { dropCell, pointAt, rulerDistance, rulerEnd, snapHalf } from '../../client/src/lib/battleMath.js';

// A picture twice as wide as tall with a 10 x 5 grid: a square is 0.1 of the picture's width and 0.2 of its height.
const grid = { cell: 0.1, ox: 0, oy: 0 };
const aspect = 2;

describe('free movement with the grid off', () => {
  it('a dropped token snaps to a whole square with the grid on and stays where it is dropped with it off', () => {
    // The token's centre is dropped at 0.37 across and 0.62 down (picture fractions): 3.7 and 3.1 squares.
    expect(dropCell(0.37, 0.62, 1, grid, aspect, 10, 5)).toEqual({ col: 3, row: 3 });
    expect(dropCell(0.37, 0.62, 1, grid, aspect, 10, 5, true)).toEqual({ col: 3.2, row: 2.6 });
    expect(dropCell(0.375, 0.4, 2, grid, aspect, 10, 5, true)).toEqual({ col: 2.75, row: 1 });
  });

  it('both ways keep the token on the map', () => {
    expect(dropCell(-0.2, 2, 1, grid, aspect, 10, 5, true)).toEqual({ col: 0, row: 4 });
    expect(dropCell(1.5, -1, 2, grid, aspect, 10, 5, true)).toEqual({ col: 8, row: 0 });
    expect(dropCell(1.5, -1, 2, grid, aspect, 10, 5)).toEqual({ col: 8, row: 0 });
  });

  it('areas snap to half a square with the grid on and are placed exactly with it off', () => {
    expect(snapHalf(3.37, true)).toBe(3.5);
    expect(snapHalf(3.37, false)).toBe(3.37);
    expect(snapHalf(3.3749, false)).toBe(3.37);
    const p = pointAt(0.37, 0.62, grid, aspect);
    expect(p.col).toBeCloseTo(3.7, 10);
    expect(p.row).toBeCloseTo(3.1, 10);
  });

  it('the Ruler counts squares with the grid on and measures the straight line with it off', () => {
    // The ends are the middles of the squares (0, 0) and (4, 4).
    const on = [rulerEnd(0.05, 0.1, grid, aspect, true), rulerEnd(0.45, 0.9, grid, aspect, true)];
    expect(on).toEqual([{ col: 0, row: 0 }, { col: 4, row: 4 }]);
    expect(rulerDistance(on[0], on[1], true)).toBe(6); // four diagonals: 4 + 2
    const off = [rulerEnd(0.05, 0.1, grid, aspect, false), rulerEnd(0.45, 0.9, grid, aspect, false)];
    expect(off[0].col).toBeCloseTo(0, 10); // the point (0.5, 0.5) is stored as the cell whose centre it is
    expect(off[1].row).toBeCloseTo(4, 10);
    expect(rulerDistance(off[0], off[1], false)).toBe(6); // 5.66
    const far = [rulerEnd(0.05, 0.1, grid, aspect, false), rulerEnd(0.65, 1.3, grid, aspect, false)];
    expect(rulerDistance(far[0], far[1], false)).toBe(8); // 8.49, where counting squares says 9
    expect(rulerDistance({ col: 0, row: 0 }, { col: 6, row: 6 }, true)).toBe(9);
  });
});
