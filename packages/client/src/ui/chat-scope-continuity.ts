/** 从聊天持久化作用域中提取角色 ID。 */
export function resolveChatScopePlayerId(scopeId: string | null | undefined): string | null {
  const normalized = typeof scopeId === 'string' ? scopeId.trim() : '';
  if (!normalized) {
    return null;
  }
  const separatorIndex = normalized.indexOf('|');
  const playerId = (separatorIndex >= 0 ? normalized.slice(0, separatorIndex) : normalized).trim();
  return playerId || null;
}

/** 同一角色切图时保留会话内战斗记录；切换角色或退出时必须清空。 */
export function shouldPreserveCombatLogSession(
  previousScopeId: string | null | undefined,
  nextScopeId: string | null | undefined,
): boolean {
  const previousPlayerId = resolveChatScopePlayerId(previousScopeId);
  const nextPlayerId = resolveChatScopePlayerId(nextScopeId);
  return Boolean(previousPlayerId && nextPlayerId && previousPlayerId === nextPlayerId);
}
