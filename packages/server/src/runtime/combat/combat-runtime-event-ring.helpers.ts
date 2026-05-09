// @ts-nocheck

export function recordBoundedCombatRing(entries = [], entry = null, capacity = 200) {
  if (!Array.isArray(entries) || !entry) return entries;
  entries.push(entry);
  trimBoundedCombatRing(entries, capacity);
  return entries;
}

export function listBoundedCombatRing(entries = [], limit = 50, capacity = 200) {
  if (!Array.isArray(entries)) return [];
  const safeLimit = normalizeRingLimit(limit, capacity);
  return entries.slice(-safeLimit);
}

export function trimBoundedCombatRing(entries = [], capacity = 200) {
  if (!Array.isArray(entries)) return entries;
  const safeCapacity = normalizeRingLimit(capacity, 200);
  if (entries.length > safeCapacity) entries.splice(0, entries.length - safeCapacity);
  return entries;
}

function normalizeRingLimit(value, fallback) {
  const normalized = Math.trunc(Number(value));
  return Number.isFinite(normalized) && normalized > 0 ? Math.min(normalized, 1000) : fallback;
}
