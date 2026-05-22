/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * GM 环境检测服务：收集服务端运行环境信息，
 * 包括 Node.js 版本、关键环境变量状态和核心依赖检测。
 */
import type { GmEnvCheckGroup, GmEnvCheckItem, GmEnvCheckResult } from '@mud/shared';
import { readTrimmedEnv } from '../../config/env-alias';

/** 需要检测的环境变量定义。 */
const ENV_VAR_CHECKS: Array<{ name: string; aliases: string[]; required: boolean; description: string; fallbackAliases?: string[]; fallbackDescription?: string }> = [
  { name: 'DATABASE_URL', aliases: ['SERVER_DATABASE_URL', 'DATABASE_URL'], required: true, description: '数据库连接地址' },
  { name: 'DATABASE_POOLER_URL', aliases: ['SERVER_DATABASE_POOLER_URL', 'DATABASE_POOLER_URL'], required: false, description: '数据库连接池地址' },
  { name: 'REDIS_URL', aliases: ['SERVER_REDIS_URL', 'REDIS_URL'], required: false, description: 'Redis 连接地址' },
  { name: 'SERVER_PORT', aliases: ['SERVER_PORT'], required: false, description: '服务端监听端口' },
  { name: 'SERVER_HOST', aliases: ['SERVER_HOST'], required: false, description: '服务端监听地址' },
  { name: 'SERVER_CORS_ORIGINS', aliases: ['SERVER_CORS_ORIGINS', 'CORS_ORIGINS'], required: false, description: 'CORS 允许来源' },
  { name: 'SERVER_RUNTIME_ENV', aliases: ['SERVER_RUNTIME_ENV', 'APP_ENV', 'NODE_ENV'], required: false, description: '运行环境标识' },
  { name: 'SERVER_PLAYER_TOKEN_SECRET', aliases: ['SERVER_PLAYER_TOKEN_SECRET'], required: true, description: '玩家 Token 签名密钥' },
  {
    name: 'SERVER_GM_AUTH_SECRET',
    aliases: ['SERVER_GM_AUTH_SECRET', 'GM_AUTH_SECRET'],
    required: false,
    description: 'GM Token 签名密钥',
    fallbackAliases: ['SERVER_PLAYER_TOKEN_SECRET', 'JWT_SECRET'],
    fallbackDescription: '未配置时复用玩家 Token 签名密钥',
  },
  {
    name: 'SERVER_SECRET_ENCRYPTION_KEY',
    aliases: ['SERVER_SECRET_ENCRYPTION_KEY', 'SECRET_ENCRYPTION_KEY'],
    required: false,
    description: 'GM 密钥管理主密钥',
    fallbackAliases: ['SERVER_PLAYER_TOKEN_SECRET', 'JWT_SECRET'],
    fallbackDescription: '未配置时复用玩家 Token 签名密钥',
  },
  { name: 'SERVER_NODE_ID', aliases: ['SERVER_NODE_ID'], required: false, description: '节点 ID' },
];

/** 需要检测的核心依赖包。 */
const DEPENDENCY_CHECKS: string[] = [
  '@mud/shared',
  '@nestjs/common',
  '@nestjs/config',
  '@nestjs/core',
  '@nestjs/platform-express',
  '@nestjs/platform-socket.io',
  '@nestjs/websockets',
  'bcryptjs',
  'pg',
  'reflect-metadata',
  'rxjs',
  'socket.io',
  'socket.io-client',
];

/** 执行完整环境检测并返回结果。 */
export function runGmEnvCheck(): GmEnvCheckResult {
  const groups: GmEnvCheckGroup[] = [];

  // 1. 运行时信息
  groups.push(buildRuntimeGroup());

  // 2. 环境变量检测
  groups.push(buildEnvVarsGroup());

  // 3. 依赖包检测
  groups.push(buildDependenciesGroup());

  // 汇总
  const allItems = groups.flatMap((g) => g.items);
  const summary = {
    total: allItems.length,
    ok: allItems.filter((i) => i.status === 'ok').length,
    warn: allItems.filter((i) => i.status === 'warn').length,
    error: allItems.filter((i) => i.status === 'error').length,
  };

  return { checkedAt: Date.now(), groups, summary };
}

/** 构建运行时信息分组。 */
function buildRuntimeGroup(): GmEnvCheckGroup {
  const items: GmEnvCheckItem[] = [];

  // Node.js 版本
  const nodeVersion = process.version;
  const nodeMajor = parseInt(nodeVersion.slice(1), 10);
  items.push({
    name: 'Node.js 版本',
    status: nodeMajor >= 18 ? 'ok' : 'error',
    value: nodeVersion,
    expected: '>=18',
  });

  // 平台信息
  items.push({
    name: '操作系统',
    status: 'ok',
    value: `${process.platform} ${process.arch}`,
  });

  // 进程运行时间
  const uptimeSec = Math.floor(process.uptime());
  const hours = Math.floor(uptimeSec / 3600);
  const minutes = Math.floor((uptimeSec % 3600) / 60);
  items.push({
    name: '进程运行时间',
    status: 'ok',
    value: `${hours}h ${minutes}m`,
  });

  // 内存使用
  const mem = process.memoryUsage();
  items.push({
    name: 'RSS 内存',
    status: mem.rss > 2 * 1024 * 1024 * 1024 ? 'warn' : 'ok',
    value: `${Math.round(mem.rss / 1024 / 1024)} MB`,
    expected: '<2048 MB',
  });

  return { title: '运行时信息', items };
}

/** 构建环境变量检测分组。 */
function buildEnvVarsGroup(): GmEnvCheckGroup {
  const items: GmEnvCheckItem[] = [];

  for (const check of ENV_VAR_CHECKS) {
    const value = readTrimmedEnv(...check.aliases);
    const fallbackValue = value.length === 0 && check.fallbackAliases
      ? readTrimmedEnv(...check.fallbackAliases)
      : '';
    const hasValue = value.length > 0 || fallbackValue.length > 0;

    let status: GmEnvCheckItem['status'];
    if (hasValue) {
      status = 'ok';
    } else if (check.required) {
      status = 'error';
    } else {
      status = 'warn';
    }

    // 敏感值脱敏显示
    const displayValue = value.length > 0
      ? maskSensitiveValue(check.name, value)
      : fallbackValue.length > 0
        ? `复用 ${resolveEnvSource(check.fallbackAliases ?? [])}：${maskSensitiveValue(check.name, fallbackValue)}`
        : '未配置';

    items.push({
      name: `${check.description} (${check.aliases[0]})`,
      status,
      value: displayValue,
      expected: check.required ? '必填' : check.fallbackDescription ?? '可选',
    });
  }

  return { title: '环境变量', items };
}

/** 返回当前生效的环境变量名，用于 GM 环境检测展示。 */
function resolveEnvSource(names: string[]): string {
  for (const name of names) {
    if (readTrimmedEnv(name)) {
      return name;
    }
  }
  return names[0] ?? 'fallback';
}

/** 构建依赖包检测分组。 */
function buildDependenciesGroup(): GmEnvCheckGroup {
  const items: GmEnvCheckItem[] = [];

  for (const pkg of DEPENDENCY_CHECKS) {
    try {
      const resolved = require.resolve(pkg);
      items.push({
        name: pkg,
        status: 'ok',
        value: resolved ? '已安装' : '已安装',
      });
    } catch {
      items.push({
        name: pkg,
        status: 'error',
        value: '未找到',
        expected: '需要安装',
      });
    }
  }

  return { title: '核心依赖', items };
}

/** 对敏感环境变量值进行脱敏。 */
function maskSensitiveValue(name: string, value: string): string {
  const sensitiveKeys = ['PASSWORD', 'SECRET', 'TOKEN', 'URL'];
  const isSensitive = sensitiveKeys.some((k) => name.toUpperCase().includes(k));
  if (!isSensitive) {
    return value;
  }
  if (value.length <= 4) {
    return '****';
  }
  return value.slice(0, 2) + '****' + value.slice(-2);
}
