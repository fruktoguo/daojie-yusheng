/**
 * 战斗运行时事件环形缓冲区工具。
 *
 * 职责：
 * - 维护一个固定容量的环形数组，用于存储最近的战斗事件记录
 * - 超出容量时自动裁剪最旧的条目（FIFO）
 * - 查询时返回最近 N 条记录
 *
 * 使用场景：
 * - 战斗日志回放、诊断面板、GM 查询最近战斗事件
 * - 避免无限增长的内存占用，适合长时间运行的服务端
 */

/**
 * 向环形缓冲区追加一条战斗事件，超出容量时裁剪最旧条目。
 * @param entries 当前事件数组（原地修改）
 * @param entry 要追加的事件记录
 * @param capacity 环形缓冲区最大容量，默认 200
 */
export function recordBoundedCombatRing(entries = [], entry = null, capacity = 200) {
  if (!Array.isArray(entries) || !entry) return entries;
  entries.push(entry);
  trimBoundedCombatRing(entries, capacity);
  return entries;
}

/**
 * 从环形缓冲区尾部取出最近的 N 条事件。
 * @param entries 当前事件数组
 * @param limit 返回条数上限，默认 50
 * @param capacity 用于约束 limit 的最大值，默认 200
 */
export function listBoundedCombatRing(entries = [], limit = 50, capacity = 200) {
  if (!Array.isArray(entries)) return [];
  const safeLimit = normalizeRingLimit(limit, capacity);
  return entries.slice(-safeLimit);
}

/**
 * 裁剪环形缓冲区，保留最新的 capacity 条记录。
 * 使用 splice 原地修改数组，避免重新分配。
 */
export function trimBoundedCombatRing(entries = [], capacity = 200) {
  if (!Array.isArray(entries)) return entries;
  const safeCapacity = normalizeRingLimit(capacity, 200);
  if (entries.length > safeCapacity) entries.splice(0, entries.length - safeCapacity);
  return entries;
}

/** 将 limit/capacity 值规范化为正整数，上限 1000 防止滥用。 */
function normalizeRingLimit(value, fallback) {
  const normalized = Math.trunc(Number(value));
  return Number.isFinite(normalized) && normalized > 0 ? Math.min(normalized, 1000) : fallback;
}
