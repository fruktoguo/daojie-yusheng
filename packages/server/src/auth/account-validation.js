"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveDisplayName = exports.buildDefaultRoleName = exports.validateRoleName = exports.validateDisplayName = exports.validatePassword = exports.validateUsername = exports.normalizeRoleName = exports.normalizeDisplayName = exports.normalizeUsername = void 0;
const shared_1 = require("@mud/shared-next");

/** 是否包含空白字符，用于账号/名称和密码合法性快速校验。 */
function containsWhitespace(value) {
    return /\s/.test(value);
}

/** 账号标准化：NFC normalize，统一输入编码。 */
function normalizeUsername(value) {
    return typeof value === 'string' ? value.normalize('NFC') : '';
}
exports.normalizeUsername = normalizeUsername;

/** 显示名标准化：NFC normalize，保留原显示意图。 */
function normalizeDisplayName(value) {
    return typeof value === 'string' ? value.normalize('NFC') : '';
}
exports.normalizeDisplayName = normalizeDisplayName;

/** 角色名标准化：NFC normalize 并 trim，后续用于重复校验与查询。 */
function normalizeRoleName(value) {
    return typeof value === 'string' ? value.normalize('NFC').trim() : '';
}
exports.normalizeRoleName = normalizeRoleName;

/** 校验账号规则（长度与空白），返回中文错误信息。 */
function validateUsername(username) {
    const normalized = normalizeUsername(username);
    const length = [...normalized].length;
    if (length < shared_1.ACCOUNT_MIN_LENGTH) {
        return `账号长度不能少于 ${shared_1.ACCOUNT_MIN_LENGTH} 个字符`;
    }
    if (length > shared_1.ACCOUNT_MAX_LENGTH) {
        return `账号长度不能超过 ${shared_1.ACCOUNT_MAX_LENGTH} 个字符`;
    }
    if (containsWhitespace(normalized)) {
        return '账号不支持空格';
    }
    return null;
}
exports.validateUsername = validateUsername;

/** 校验密码规则（长度与空白），返回中文错误信息。 */
function validatePassword(password) {
    if (typeof password !== 'string' || password.length < shared_1.PASSWORD_MIN_LENGTH) {
        return `密码长度不能少于 ${shared_1.PASSWORD_MIN_LENGTH} 个字符`;
    }
    if (containsWhitespace(password)) {
        return '密码不支持空格';
    }
    return null;
}
exports.validatePassword = validatePassword;

/** 校验显示名称规则（空值、空白、可见字符），返回中文错误信息。 */
function validateDisplayName(displayName) {
    const normalized = normalizeDisplayName(displayName);
    if (!normalized) {
        return '显示名称不能为空';
    }
    if (containsWhitespace(normalized)) {
        return '显示名称不支持空格';
    }
    if ((0, shared_1.getGraphemeCount)(normalized) !== 1) {
        return '显示名称必须为 1 个字符';
    }
    if (!(0, shared_1.hasVisibleNameGrapheme)(normalized) || (0, shared_1.containsInvisibleOnlyNameGrapheme)(normalized)) {
        return '显示名称必须为可见字符';
    }
    return null;
}
exports.validateDisplayName = validateDisplayName;

/** 校验角色名称规则（可见性、长度边界），返回中文错误信息。 */
function validateRoleName(roleName) {
    const normalized = normalizeRoleName(roleName);
    if (!normalized) {
        return '角色名称不能为空';
    }
    if (!(0, shared_1.hasVisibleNameGrapheme)(normalized)) {
        return '角色名称必须包含可见字符';
    }
    if ((0, shared_1.containsInvisibleOnlyNameGrapheme)(normalized)) {
        return '角色名称不支持不可见字符';
    }
    if (!(0, shared_1.isRoleNameWithinLimit)(normalized)) {
        return `角色名称${(0, shared_1.getRoleNameLimitText)()}`;
    }
    return null;
}
exports.validateRoleName = validateRoleName;

/** 从账号名派生兜底角色名（供兼容流程）。 */
function buildDefaultRoleName(username) {
    return (0, shared_1.truncateRoleName)(normalizeUsername(username));
}
exports.buildDefaultRoleName = buildDefaultRoleName;

/** 解析最终显示名：优先合法显示名，否则按账号兜底。 */
function resolveDisplayName(displayName, username) {
    const normalized = normalizeDisplayName(displayName);
    if (normalized) {
        return validateDisplayName(normalized) === null ? normalized : shared_1.DEFAULT_VISIBLE_DISPLAY_NAME;
    }
    return (0, shared_1.resolveDefaultVisibleDisplayName)(normalizeUsername(username));
}
exports.resolveDisplayName = resolveDisplayName;


