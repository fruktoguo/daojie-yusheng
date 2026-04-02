"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveDisplayName = exports.buildDefaultRoleName = exports.validateRoleName = exports.validateDisplayName = exports.validatePassword = exports.validateUsername = exports.normalizeRoleName = exports.normalizeDisplayName = exports.normalizeUsername = void 0;
const shared_1 = require("@mud/shared-next");
function containsWhitespace(value) {
    return /\s/.test(value);
}
function normalizeUsername(value) {
    return typeof value === 'string' ? value.normalize('NFC') : '';
}
exports.normalizeUsername = normalizeUsername;
function normalizeDisplayName(value) {
    return typeof value === 'string' ? value.normalize('NFC') : '';
}
exports.normalizeDisplayName = normalizeDisplayName;
function normalizeRoleName(value) {
    return typeof value === 'string' ? value.normalize('NFC').trim() : '';
}
exports.normalizeRoleName = normalizeRoleName;
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
function validateDisplayName(displayName) {
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
exports.validateDisplayName = validateDisplayName;
function validateRoleName(roleName) {
    const normalized = normalizeRoleName(roleName);
    if (!normalized) {
        return '角色名称不能为空';
    }
    if (!(0, shared_1.isRoleNameWithinLimit)(normalized)) {
        return `角色名称${(0, shared_1.getRoleNameLimitText)()}`;
    }
    return null;
}
exports.validateRoleName = validateRoleName;
function buildDefaultRoleName(username) {
    return (0, shared_1.truncateRoleName)(normalizeUsername(username));
}
exports.buildDefaultRoleName = buildDefaultRoleName;
function resolveDisplayName(displayName, username) {
    const normalized = normalizeDisplayName(displayName);
    if (normalized) {
        return normalized;
    }
    return [...normalizeUsername(username)][0] ?? '';
}
exports.resolveDisplayName = resolveDisplayName;
