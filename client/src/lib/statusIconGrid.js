// How many status icons of `size` (a fraction of the token's side) fit in a token's square, filled top to bottom and then
// column by column: { rows, max }. Nothing is ever cut: what does not fit is left out.
export function iconGrid(size) {
  const rows = Math.floor(1 / size + 1e-9);
  return { rows, max: rows * rows };
}
