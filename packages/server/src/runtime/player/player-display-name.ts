/**
 * 玩家外显名统一处理。
 *
 * 运行时早期或旧数据可能把 name/displayName 写成 playerId；所有面向玩家或 GM 的名称字段
 * 必须把这类机器 ID 当作缺失处理，真正的 playerId 继续留在独立 id/playerId 字段里。
 */

export type PlayerDisplayNameSource = {
  playerId?: unknown;
  id?: unknown;
  displayName?: unknown;
  name?: unknown;
  playerName?: unknown;
  roleName?: unknown;
  pendingRoleName?: unknown;
  username?: unknown;
};

export function normalizeDisplayNameText(value: unknown): string {
  return typeof value === 'string' ? value.trim().normalize('NFC') : '';
}

export function isPlayerIdLikeDisplayText(value: unknown): boolean {
  const normalized = normalizeDisplayNameText(value);
  return /^p_[0-9a-f-]+(?:_\d+)?$/i.test(normalized) || /^player[:_-]/i.test(normalized);
}

export function resolvePlayerDisplayName(
  source: PlayerDisplayNameSource | null | undefined,
  options: {
    playerId?: unknown;
    fallback?: string;
  } = {},
): string {
  const playerId = normalizeDisplayNameText(options.playerId)
    || normalizeDisplayNameText(source?.playerId)
    || normalizeDisplayNameText(source?.id);
  const candidates = [
    source?.playerName,
    source?.roleName,
    source?.pendingRoleName,
    source?.name,
    source?.displayName,
    source?.username,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeDisplayNameText(candidate);
    if (normalized && normalized !== playerId && !isPlayerIdLikeDisplayText(normalized)) {
      return normalized;
    }
  }
  const fallback = normalizeDisplayNameText(options.fallback);
  return fallback && fallback !== playerId && !isPlayerIdLikeDisplayText(fallback) ? fallback : '未知玩家';
}

export function resolveSectMemberDisplayName(source: PlayerDisplayNameSource | null | undefined, playerId?: unknown): string {
  return resolvePlayerDisplayName(source, { playerId, fallback: '未知成员' });
}
