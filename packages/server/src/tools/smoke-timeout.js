"use strict";
/**
 * 用途：为单个烟测脚本安装统一超时，避免开发时被卡死用例长期阻塞。
 */

Object.defineProperty(exports, "__esModule", { value: true });
exports.installSmokeTimeout = installSmokeTimeout;
const node_path_1 = require("node:path");
/**
 * 指定单个烟测默认超时时间。
 */
const DEFAULT_SMOKE_TIMEOUT_MS = 10_000;
const ENTRY_TIMEOUT_OVERRIDES_MS = new Map([
    ['next-auth-bootstrap-smoke.js', 45_000],
    ['gm-next-smoke.js', 45_000],
    ['persistence-smoke.js', 45_000],
]);
/**
 * 解析是否关闭统一烟测超时。
 */
function isSmokeTimeoutDisabled() {
    /**
     * 读取原始开关值。
     */
    const raw = process.env.SERVER_NEXT_DISABLE_SMOKE_TIMEOUT ?? process.env.NEXT_DISABLE_SMOKE_TIMEOUT;
    return raw === '1' || raw === 'true';
}
/**
 * 解析统一烟测超时时间，非法值回退到默认值。
 */
function resolveSmokeTimeoutMs() {
    /**
     * 读取原始超时配置。
     */
    const raw = process.env.SERVER_NEXT_SMOKE_TIMEOUT_MS ?? process.env.NEXT_SMOKE_TIMEOUT_MS;
    if (!raw) {
        return DEFAULT_SMOKE_TIMEOUT_MS;
    }
    /**
     * 解析数值。
     */
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_SMOKE_TIMEOUT_MS;
    }
    return Math.trunc(parsed);
}
/**
 * 为当前烟测进程安装硬超时保护。
 */
function installSmokeTimeout(entryPath) {
    if (isSmokeTimeoutDisabled()) {
        return;
    }
    /**
     * 生成更易读的烟测标识。
     */
    const entryLabel = entryPath ? (0, node_path_1.basename)(entryPath) : (0, node_path_1.basename)(process.argv[1] ?? 'smoke');
    /**
     * 记录本次超时时长。
     */
    const timeoutMs = ENTRY_TIMEOUT_OVERRIDES_MS.get(entryLabel) ?? resolveSmokeTimeoutMs();
    /**
     * 创建硬超时定时器；若脚本挂起则直接退出。
     */
    const timer = setTimeout(() => {
        process.stderr.write(`[smoke-timeout] ${entryLabel} exceeded ${timeoutMs}ms and will exit\n`);
        process.exit(124);
    }, timeoutMs);
    timer.unref?.();
    process.once('exit', () => {
        clearTimeout(timer);
    });
}
