/**
 * 本文件属于服务端认证链路，负责账号、会话、token 或登录态相关逻辑。
 *
 * 维护时要优先保证鉴权边界、session fencing 和敏感信息不外泄，避免客户端自证身份。
 */
/**
 * 账号与角色名校验工具：统一处理账号、密码、显示名和角色名的合法性检查。
 * 所有校验函数返回 null 表示通过，返回中文字符串表示错误原因。
 */
import {
  ACCOUNT_MAX_LENGTH,
  ACCOUNT_MIN_LENGTH,
  containsInvisibleOnlyNameGrapheme,
  DEFAULT_VISIBLE_DISPLAY_NAME,
  getGraphemeCount,
  getRoleNameLimitText,
  hasVisibleNameGrapheme,
  isRoleNameWithinLimit,
  PASSWORD_MIN_LENGTH,
  resolveDefaultVisibleDisplayName,
  truncateRoleName,
} from '@mud/shared';

/** 是否包含空白字符，用于账号/名称和密码合法性快速校验。 */
function containsWhitespace(value: string): boolean {
  return /\s/.test(value);
}

/** 账号标准化：NFC normalize，统一输入编码。 */
export function normalizeUsername(value: unknown): string {
  return typeof value === 'string' ? value.normalize('NFC') : '';
}

/** 显示名标准化：NFC normalize，保留原显示意图。 */
export function normalizeDisplayName(value: unknown): string {
  return typeof value === 'string' ? value.normalize('NFC') : '';
}

/** 角色名标准化：NFC normalize 并 trim，后续用于重复校验与查询。 */
export function normalizeRoleName(value: unknown): string {
  return typeof value === 'string' ? value.normalize('NFC').trim() : '';
}

/** 校验账号规则（长度与空白），返回中文错误信息。 */
export function validateUsername(username: unknown): string | null {

  const normalized = normalizeUsername(username);
  const length = [...normalized].length;

  if (length < ACCOUNT_MIN_LENGTH) {
    return `账号长度不能少于 ${ACCOUNT_MIN_LENGTH} 个字符`;
  }

  if (length > ACCOUNT_MAX_LENGTH) {
    return `账号长度不能超过 ${ACCOUNT_MAX_LENGTH} 个字符`;
  }

  if (containsWhitespace(normalized)) {
    return '账号不支持空格';
  }

  return null;
}

/** 校验密码规则（长度与空白），返回中文错误信息。 */
export function validatePassword(password: unknown): string | null {

  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    return `密码长度不能少于 ${PASSWORD_MIN_LENGTH} 个字符`;
  }

  if (containsWhitespace(password)) {
    return '密码不支持空格';
  }

  return null;
}

/** 校验显示名称规则（空值、空白、可见字符），返回中文错误信息。 */
export function validateDisplayName(displayName: unknown): string | null {

  const normalized = normalizeDisplayName(displayName);

  if (!normalized) {
    return '显示名称不能为空';
  }

  if (containsWhitespace(normalized)) {
    return '显示名称不支持空格';
  }

  if (getGraphemeCount(normalized) !== 1) {
    return '显示名称必须为 1 个字符';
  }

  if (!hasVisibleNameGrapheme(normalized) || containsInvisibleOnlyNameGrapheme(normalized)) {
    return '显示名称必须为可见字符';
  }

  return null;
}

/** 校验角色名称规则（可见性、长度边界），返回中文错误信息。 */
export function validateRoleName(roleName: unknown): string | null {

  const normalized = normalizeRoleName(roleName);

  if (!normalized) {
    return '角色名称不能为空';
  }

  if (!hasVisibleNameGrapheme(normalized)) {
    return '角色名称必须包含可见字符';
  }

  if (containsInvisibleOnlyNameGrapheme(normalized)) {
    return '角色名称不支持不可见字符';
  }

  if (!isRoleNameWithinLimit(normalized)) {
    return `角色名称${getRoleNameLimitText()}`;
  }

  return null;
}

/** 从账号名派生兜底角色名（供兼容流程）。 */
export function buildDefaultRoleName(username: unknown): string {
  return truncateRoleName(normalizeUsername(username));
}

/** 解析最终显示名：优先合法显示名，否则按账号兜底。 */
export function resolveDisplayName(displayName: unknown, username: unknown): string {

  const normalized = normalizeDisplayName(displayName);

  if (normalized) {
    return validateDisplayName(normalized) === null ? normalized : DEFAULT_VISIBLE_DISPLAY_NAME;
  }

  return resolveDefaultVisibleDisplayName(normalizeUsername(username));
}
