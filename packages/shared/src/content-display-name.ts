/**
 * 玩家可见内容名称的纯规则。
 *
 * 内部 ID 仍用于协议、索引和操作定位；名称缺失时不得把同一个 ID 当作展示文案。
 */

/** 规范化玩家可见名称候选。 */
export function normalizeContentDisplayNameText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** 判断候选是否可作为某个内部标识对应的玩家可见名称。 */
export function isUsableContentDisplayName(
  identifier: unknown,
  fallback: unknown,
  candidate: unknown,
): boolean {
  const normalizedCandidate = normalizeContentDisplayNameText(candidate);
  if (!normalizedCandidate) {
    return false;
  }
  const normalizedIdentifier = normalizeContentDisplayNameText(identifier);
  const normalizedFallback = normalizeContentDisplayNameText(fallback);
  return normalizedCandidate !== normalizedIdentifier && normalizedCandidate !== normalizedFallback;
}

/**
 * 从运行态、协议或本地目录候选中解析最终展示名。
 *
 * 候选按传入顺序取首个有效值；若都不可用，则返回明确的中文占位名。
 */
export function resolvePlayerFacingContentName(
  identifier: unknown,
  fallback: string,
  ...candidates: readonly unknown[]
): string {
  for (const candidate of candidates) {
    if (isUsableContentDisplayName(identifier, fallback, candidate)) {
      return normalizeContentDisplayNameText(candidate);
    }
  }
  return normalizeContentDisplayNameText(fallback) || '未知内容';
}
