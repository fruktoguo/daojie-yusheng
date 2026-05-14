export function formatDisplayNumber(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (Math.abs(value - Math.round(value)) < 1e-6) return String(Math.round(value));
  return value.toFixed(2).replace(/\.?0+$/, '');
}

export function stringifyOptionalNumber(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

export function formatDropChancePercent(chance: number | undefined): string {
  if (chance === undefined) return '';
  return formatDisplayNumber(chance * 100);
}
