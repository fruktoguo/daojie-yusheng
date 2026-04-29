import {
  ACCOUNT_MAX_LENGTH,
  ACCOUNT_MIN_LENGTH,
  containsInvisibleOnlyNameGrapheme,
  getGraphemeCount,
  getRoleNameLimitText,
  hasVisibleNameGrapheme,
  isRoleNameWithinLimit,
  PASSWORD_MIN_LENGTH,
} from '@mud/shared';

/**
 * 账号与角色信息的前端校验规则
 * 用于登录、注册、设置页面的即时输入校验
 */

function hasWhitespace(value: string): boolean {
  return /\s/.test(value);
}

/** 校验账号名，返回错误提示或 null */
export function validateAccountName(accountName: string): string | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const length = [...accountName].length;
  if (length < ACCOUNT_MIN_LENGTH) {
    return `账号长度不能少于 ${ACCOUNT_MIN_LENGTH} 个字符`;
  }
  if (length > ACCOUNT_MAX_LENGTH) {
    return `账号长度不能超过 ${ACCOUNT_MAX_LENGTH} 个字符`;
  }
  if (hasWhitespace(accountName)) {
    return '账号不支持空格';
  }
  return null;
}

/** 校验密码强度，返回错误提示或 null */
export function validatePassword(password: string): string | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (password.length < PASSWORD_MIN_LENGTH) {
    return `密码长度不能少于 ${PASSWORD_MIN_LENGTH} 个字符`;
  }
  if (hasWhitespace(password)) {
    return '密码不支持空格';
  }
  return null;
}

/** 校验显示名称（单字标识），返回错误提示或 null */
export function validateDisplayName(displayName: string): string | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!displayName) {
    return '显示名称不能为空';
  }
  if (hasWhitespace(displayName)) {
    return '显示名称不支持空格';
  }
  if (getGraphemeCount(displayName) !== 1) {
    return '显示名称必须为 1 个字符';
  }
  if (!hasVisibleNameGrapheme(displayName) || containsInvisibleOnlyNameGrapheme(displayName)) {
    return '显示名称必须为可见字符';
  }
  return null;
}

/** 校验角色名称，返回错误提示或 null */
export function validateRoleName(roleName: string): string | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const normalized = roleName.normalize('NFC').trim();
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
