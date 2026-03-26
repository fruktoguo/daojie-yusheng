/**
 * 账号与密码校验工具 —— 用户名 / 密码 / 显示名称 / 角色名的格式校验与归一化
 */
import {
  ACCOUNT_MAX_LENGTH,
  ACCOUNT_MIN_LENGTH,
  getRoleNameLimitText,
  isRoleNameWithinLimit,
  PASSWORD_MIN_LENGTH,
  truncateRoleName,
} from '@mud/shared';

export {
  ACCOUNT_MAX_LENGTH,
  ACCOUNT_MIN_LENGTH,
  PASSWORD_MIN_LENGTH,
};

function containsWhitespace(value: string): boolean {
  return /\s/.test(value);
}

/** 对用户名做 Unicode NFC 归一化 */
export function normalizeUsername(value: string): string {
  return value.normalize('NFC');
}

/** 对显示名称做 Unicode NFC 归一化 */
export function normalizeDisplayName(value: string): string {
  return value.normalize('NFC');
}

/** 对角色名称做 Unicode NFC 归一化并去除首尾空白 */
export function normalizeRoleName(value: string): string {
  return value.normalize('NFC').trim();
}

/** 取用户名首字符作为默认显示名称 */
export function getDefaultDisplayName(username: string): string {
  return [...normalizeUsername(username)][0] ?? '';
}

/** 新角色默认名称取账号前若干字，避免账号与角色名长度约束互相冲突 */
export function buildDefaultRoleName(username: string): string {
  return truncateRoleName(normalizeUsername(username));
}

/** 优先使用自定义显示名称，为空时回退到用户名首字符 */
export function resolveDisplayName(displayName: string | null | undefined, username: string): string {
  const normalized = typeof displayName === 'string' ? normalizeDisplayName(displayName) : '';
  return normalized || getDefaultDisplayName(username);
}

/** 校验用户名格式，返回 null 表示通过，否则返回错误信息 */
export function validateUsername(username: string): string | null {
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

/** 校验密码格式 */
export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `密码长度不能少于 ${PASSWORD_MIN_LENGTH} 个字符`;
  }
  if (containsWhitespace(password)) {
    return '密码不支持空格';
  }
  return null;
}

/** 校验显示名称格式（必须为单个字符） */
export function validateDisplayName(displayName: string): string | null {
  const normalized = normalizeDisplayName(displayName);
  if (!normalized) {
    return '显示名称不能为空';
  }
  if (containsWhitespace(normalized)) {
    return '显示名称不支持空格';
  }
  if ([...normalized].length !== 1) {
    return '显示名称必须为 1 个字符';
  }
  return null;
}

/** 校验角色名称格式 */
export function validateRoleName(roleName: string): string | null {
  const normalized = normalizeRoleName(roleName);
  if (!normalized) {
    return '角色名称不能为空';
  }
  if (!isRoleNameWithinLimit(normalized)) {
    return `角色名称${getRoleNameLimitText()}`;
  }
  return null;
}
