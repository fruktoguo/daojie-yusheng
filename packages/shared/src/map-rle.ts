/** 地图分层 RLE 编解码（预留）。 */
const NULL_TOKEN = '_';
export function encodeRleRow(row: readonly (string | null)[]): string {
  if (row.length === 0) return '';
  const segments: string[] = [];
  let current = row[0] ?? null;
  let count = 1;
  for (let i = 1; i < row.length; i++) {
    const value = row[i] ?? null;
    if (value === current) { count++; } else { segments.push(fmtSeg(count, current)); current = value; count = 1; }
  }
  segments.push(fmtSeg(count, current));
  if (segments.length === 1 && current === null) return '';
  return segments.join(',');
}
export function decodeRleRow(encoded: string, width: number): (string | null)[] {
  if (!encoded || encoded.trim() === '') return new Array(width).fill(null);
  const result: (string | null)[] = [];
  for (const seg of encoded.split(',')) {
    const t = seg.trim(); if (!t) continue;
    const star = t.indexOf('*');
    const [count, value] = star > 0 ? [parseInt(t.substring(0, star), 10), parseToken(t.substring(star + 1))] : [1, parseToken(t)];
    for (let i = 0; i < count; i++) result.push(value);
  }
  return result;
}
function fmtSeg(count: number, value: string | null): string { const token = value === null ? NULL_TOKEN : value; return count === 1 ? token : `${count}*${token}`; }
function parseToken(token: string): string | null { return token === NULL_TOKEN ? null : token; }
