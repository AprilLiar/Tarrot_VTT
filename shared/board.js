// The battle board is the map picture plus a margin of MAP_MARGIN squares on every side (see the README, "Board margin"): the grid runs on
// through a darker ring past the picture's edges, and tokens may stand there. A token's square (col, row) may then be from -MAP_MARGIN up
// to the grid's last square + MAP_MARGIN.
export const MAP_MARGIN = 2;

// The lowest and highest top-left square a token of `size` may have.
export const colRange = (cols, size) => [-MAP_MARGIN, cols - size + MAP_MARGIN];
