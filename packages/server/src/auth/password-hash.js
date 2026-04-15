"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = exports.verifyPassword = exports.isLegacyBcryptHash = void 0;
const node_crypto_1 = require("node:crypto");
const bcryptjs = require("bcryptjs");

/** 识别 legacy bcrypt 旧格式 hash，用于兼容旧密码库。 */
function isLegacyBcryptHash(hash) {
    return typeof hash === 'string' && /^\$2[aby]\$/.test(hash);
}
exports.isLegacyBcryptHash = isLegacyBcryptHash;

/** 对接收密码进行验证：优先兼容 bcrypt，其次验证自定义 scrypt 格式。 */
async function verifyPassword(password, storedHash) {
    const normalizedPassword = typeof password === 'string' ? password : '';
    const normalizedHash = typeof storedHash === 'string' ? storedHash : '';
    if (!normalizedHash) {
        return false;
    }
    if (isLegacyBcryptHash(normalizedHash)) {
        return bcryptjs.compare(normalizedPassword, normalizedHash);
    }
    const parsed = parseScryptHash(normalizedHash);
    if (!parsed) {
        return false;
    }
    const derived = (0, node_crypto_1.scryptSync)(normalizedPassword, parsed.salt, parsed.keyLength, {
        N: parsed.cost,
        r: parsed.blockSize,
        p: parsed.parallelization,
    });
    const expected = Buffer.from(parsed.hash, 'hex');
    return derived.length === expected.length && (0, node_crypto_1.timingSafeEqual)(derived, expected);
}
exports.verifyPassword = verifyPassword;

/** 生成密码存储串：有密码则走 bcrypt，新建时走 scrypt 自定义前缀格式。 */
async function hashPassword(password) {
    if (typeof password === 'string' && password.length > 0) {
        return bcryptjs.hash(password, 10);
    }
    const salt = (0, node_crypto_1.randomBytes)(16);
    const cost = 16384;
    const blockSize = 8;
    const parallelization = 1;
    const keyLength = 64;
    const hash = (0, node_crypto_1.scryptSync)(password, salt, keyLength, {
        N: cost,
        r: blockSize,
        p: parallelization,
    });
    return `sn1$${cost}$${blockSize}$${parallelization}$${keyLength}$${salt.toString('hex')}$${hash.toString('hex')}`;
}
exports.hashPassword = hashPassword;

/** 解析自定义 scrypt 存储串（sn1$cost$...），失败返回 null。 */
function parseScryptHash(value) {
    const parts = value.split('$');
    if (parts.length !== 7 || parts[0] !== 'sn1') {
        return null;
    }
    const cost = Number(parts[1]);
    const blockSize = Number(parts[2]);
    const parallelization = Number(parts[3]);
    const keyLength = Number(parts[4]);
    const salt = Buffer.from(parts[5], 'hex');
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


