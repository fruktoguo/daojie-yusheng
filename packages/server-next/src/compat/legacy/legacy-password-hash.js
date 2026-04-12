"use strict";
/** 模块实现文件，负责当前职责边界内的业务逻辑。 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = exports.verifyPassword = exports.isLegacyBcryptHash = void 0;
/** node_crypto_1：定义该变量以承载业务值。 */
const node_crypto_1 = require("node:crypto");
/** node_path_1：定义该变量以承载业务值。 */
const node_path_1 = require("node:path");
/** bcryptModule：定义该变量以承载业务值。 */
let bcryptModule = undefined;
/** isLegacyBcryptHash：执行对应的业务逻辑。 */
function isLegacyBcryptHash(hash) {
    return typeof hash === 'string' && /^\$2[aby]\$/.test(hash);
}
exports.isLegacyBcryptHash = isLegacyBcryptHash;
/** verifyPassword：执行对应的业务逻辑。 */
async function verifyPassword(password, storedHash) {
/** normalizedPassword：定义该变量以承载业务值。 */
    const normalizedPassword = typeof password === 'string' ? password : '';
/** normalizedHash：定义该变量以承载业务值。 */
    const normalizedHash = typeof storedHash === 'string' ? storedHash : '';
    if (!normalizedHash) {
        return false;
    }
    if (isLegacyBcryptHash(normalizedHash)) {
/** bcrypt：定义该变量以承载业务值。 */
        const bcrypt = loadBcryptModule();
        if (!bcrypt) {
            return false;
        }
        return bcrypt.compare(normalizedPassword, normalizedHash);
    }
/** parsed：定义该变量以承载业务值。 */
    const parsed = parseScryptHash(normalizedHash);
    if (!parsed) {
        return false;
    }
/** derived：定义该变量以承载业务值。 */
    const derived = (0, node_crypto_1.scryptSync)(normalizedPassword, parsed.salt, parsed.keyLength, {
        N: parsed.cost,
        r: parsed.blockSize,
        p: parsed.parallelization,
    });
/** expected：定义该变量以承载业务值。 */
    const expected = Buffer.from(parsed.hash, 'hex');
    return derived.length === expected.length && (0, node_crypto_1.timingSafeEqual)(derived, expected);
}
exports.verifyPassword = verifyPassword;
/** hashPassword：执行对应的业务逻辑。 */
async function hashPassword(password) {
/** bcrypt：定义该变量以承载业务值。 */
    const bcrypt = loadBcryptModule();
    if (bcrypt) {
        return bcrypt.hash(password, 10);
    }
/** salt：定义该变量以承载业务值。 */
    const salt = (0, node_crypto_1.randomBytes)(16);
/** cost：定义该变量以承载业务值。 */
    const cost = 16384;
/** blockSize：定义该变量以承载业务值。 */
    const blockSize = 8;
/** parallelization：定义该变量以承载业务值。 */
    const parallelization = 1;
/** keyLength：定义该变量以承载业务值。 */
    const keyLength = 64;
/** hash：定义该变量以承载业务值。 */
    const hash = (0, node_crypto_1.scryptSync)(password, salt, keyLength, {
        N: cost,
        r: blockSize,
        p: parallelization,
    });
    return `sn1$${cost}$${blockSize}$${parallelization}$${keyLength}$${salt.toString('hex')}$${hash.toString('hex')}`;
}
exports.hashPassword = hashPassword;
/** parseScryptHash：执行对应的业务逻辑。 */
function parseScryptHash(value) {
/** parts：定义该变量以承载业务值。 */
    const parts = value.split('$');
    if (parts.length !== 7 || parts[0] !== 'sn1') {
        return null;
    }
/** cost：定义该变量以承载业务值。 */
    const cost = Number(parts[1]);
/** blockSize：定义该变量以承载业务值。 */
    const blockSize = Number(parts[2]);
/** parallelization：定义该变量以承载业务值。 */
    const parallelization = Number(parts[3]);
/** keyLength：定义该变量以承载业务值。 */
    const keyLength = Number(parts[4]);
/** salt：定义该变量以承载业务值。 */
    const salt = Buffer.from(parts[5], 'hex');
/** hash：定义该变量以承载业务值。 */
    const hash = parts[6];
    if (!Number.isFinite(cost) || cost <= 1
        || !Number.isFinite(blockSize) || blockSize <= 0
        || !Number.isFinite(parallelization) || parallelization <= 0
        || !Number.isFinite(keyLength) || keyLength <= 0
        || salt.length === 0
        || !/^[0-9a-f]+$/i.test(hash)) {
        return null;
    }
    return {
        cost: Math.trunc(cost),
        blockSize: Math.trunc(blockSize),
        parallelization: Math.trunc(parallelization),
        keyLength: Math.trunc(keyLength),
        salt,
        hash,
    };
}
/** loadBcryptModule：执行对应的业务逻辑。 */
function loadBcryptModule() {
    if (bcryptModule !== undefined) {
        return bcryptModule;
    }
    try {
/** resolved：定义该变量以承载业务值。 */
        const resolved = require.resolve('bcrypt', {
            paths: [
                (0, node_path_1.join)(process.cwd(), 'packages/server'),
                process.cwd(),
            ],
        });
        bcryptModule = require(resolved);
    }
    catch {
        try {
/** resolved：定义该变量以承载业务值。 */
            const resolved = require.resolve('bcryptjs', {
                paths: [
                    process.cwd(),
                    (0, node_path_1.join)(process.cwd(), 'packages/server-next'),
                ],
            });
            bcryptModule = require(resolved);
        }
        catch {
            bcryptModule = null;
        }
    }
    return bcryptModule;
}
