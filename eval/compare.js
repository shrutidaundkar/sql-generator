/**
 * A row as an array in its own column order, so `{ colB: 2, colA: 1 }` with columns
 * ['colA','colB'] becomes [1, 2]. This is what makes the comparison about values: two queries
 * naming the same number `COUNT(*)` and `total` still line up.
 */
const toPositionalArray = (row, columns) => columns.map((column) => row[column] ?? null);

/** One row as text. Values keep their column order — sorting them would let a row match a
 *  different row holding the same values in different columns. */
const canonical = (row, columns) => JSON.stringify(toPositionalArray(row, columns));

/**
 * Do two results hold the same answer? Same number of columns, and the same rows in any order,
 * counting duplicates. Values are compared, column names are not.
 *
 * @param {{ columns: string[], rows: object[] }} a
 * @param {{ columns: string[], rows: object[] }} b
 * @returns {boolean}
 */
export function sameResult(a, b) {
  if (a.columns.length !== b.columns.length) return false;
  if (a.rows.length !== b.rows.length) return false;

  // Row order is not part of the answer, so both sides are sorted before comparing.
  const rowsA = a.rows.map((row) => canonical(row, a.columns)).sort();
  const rowsB = b.rows.map((row) => canonical(row, b.columns)).sort();
  return rowsA.every((row, i) => row === rowsB[i]);
}
