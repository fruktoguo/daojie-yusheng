/** PostgreSQL 错误判断工具。 */

export function isRelationMissingError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes('does not exist') || (error as any).code === '42P01';
}
