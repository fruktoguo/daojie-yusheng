"use strict";
/** 模块实现文件，负责当前职责边界内的业务逻辑。 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveDisplayName = exports.buildDefaultRoleName = exports.validateRoleName = exports.validateDisplayName = exports.validatePassword = exports.validateUsername = exports.normalizeRoleName = exports.normalizeDisplayName = exports.normalizeUsername = void 0;
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** containsWhitespace：执行对应的业务逻辑。 */
function containsWhitespace(value) {
    return /\s/.test(value);
}
/** normalizeUsername：执行对应的业务逻辑。 */
function normalizeUsername(value) {
    return typeof value === 'string' ? value.normalize('NFC') : '';
}
exports.normalizeUsername = normalizeUsername;
/** normalizeDisplayName：执行对应的业务逻辑。 */
function normalizeDisplayName(value) {
    return typeof value === 'string' ? value.normalize('NFC') : '';
}
exports.normalizeDisplayName = normalizeDisplayName;
/** normalizeRoleName：执行对应的业务逻辑。 */
function normalizeRoleName(value) {
    return typeof value === 'string' ? value.normalize('NFC').trim() : '';
}
exports.normalizeRoleName = normalizeRoleName;
/** validateUsername：执行对应的业务逻辑。 */
function validateUsername(username) {
/** normalized：定义该变量以承载业务值。 */
    const normalized = normalizeUsername(username);
/** length：定义该变量以承载业务值。 */
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
/** validatePassword：执行对应的业务逻辑。 */
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
/** validateDisplayName：执行对应的业务逻辑。 */
function validateDisplayName(displayName) {
/** normalized：定义该变量以承载业务值。 */
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
/** validateRoleName：执行对应的业务逻辑。 */
function validateRoleName(roleName) {
/** normalized：定义该变量以承载业务值。 */
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
/** buildDefaultRoleName：执行对应的业务逻辑。 */
function buildDefaultRoleName(username) {
    return (0, shared_1.truncateRoleName)(normalizeUsername(username));
}
exports.buildDefaultRoleName = buildDefaultRoleName;
/** resolveDisplayName：执行对应的业务逻辑。 */
function resolveDisplayName(displayName, username) {
/** normalized：定义该变量以承载业务值。 */
    const normalized = normalizeDisplayName(displayName);
    if (normalized) {
        return validateDisplayName(normalized) === null ? normalized : shared_1.DEFAULT_VISIBLE_DISPLAY_NAME;
    }
    return (0, shared_1.resolveDefaultVisibleDisplayName)(normalizeUsername(username));
}
exports.resolveDisplayName = resolveDisplayName;
