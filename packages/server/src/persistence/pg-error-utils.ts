/**
 * 本文件属于持久化边界，负责数据库真源、flush、兼容转换或失败策略等可靠性逻辑。
 *
 * 维护时要优先考虑幂等、崩溃恢复和自动清理，避免在 tick 内直接引入阻塞 IO。
 */
/** PostgreSQL 错误判断工具。 */

export function isRelationMissingError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes('does not exist') || (error as any).code === '42P01';
}
