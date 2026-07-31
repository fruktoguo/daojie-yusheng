/**
 * 节点注册与权威写入共用的启动配置解析。
 *
 * 所有返回值均满足数据库字段和定时器边界；显式手误只触发可观测回退，
 * 不允许同一进程的注册、租约围栏和调度状态派生出不同节点身份。
 */
import { createHash } from 'node:crypto';
import { hostname } from 'node:os';

import { resolveServerPublicPort } from './server-listen-endpoint';

const DEFAULT_NODE_ADDRESS = '127.0.0.1';
const DEFAULT_NODE_CAPACITY_WEIGHT = 1;
const DEFAULT_NODE_HEARTBEAT_INTERVAL_MS = 5_000;
const DEFAULT_NODE_SUSPECT_AFTER_MS = 15_000;
const DEFAULT_NODE_DEAD_AFTER_MS = 30_000;
const MAX_NODE_ID_LENGTH = 120;
const MAX_NODE_ADDRESS_LENGTH = 180;
const MAX_NODE_CAPACITY_WEIGHT = Number.MAX_SAFE_INTEGER;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;

export interface NodeRuntimeConfigAdjustment {
  key: string;
  configuredValue: string;
  normalizedValue: string;
  reason: string;
}

export interface NodeRuntimeConfigResolution {
  nodeId: string;
  address: string;
  port: number;
  capacityWeight: number;
  heartbeatIntervalMs: number;
  suspectAfterMs: number;
  deadAfterMs: number;
  adjustments: NodeRuntimeConfigAdjustment[];
}

export function resolveNodeRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): NodeRuntimeConfigResolution {
  const adjustments: NodeRuntimeConfigAdjustment[] = [];
  const publicPort = resolveServerPublicPort(env);
  if (publicPort.invalidPortKey && publicPort.invalidPortValue !== null) {
    adjustments.push({
      key: publicPort.invalidPortKey,
      configuredValue: publicPort.invalidPortValue,
      normalizedValue: String(publicPort.port),
      reason: '端口必须是 1..65535 的十进制整数',
    });
  }

  const nodeId = resolveNodeIdResolution(env, publicPort.port, '', adjustments);
  const address = resolveNodeAddress(env, adjustments);
  const capacityWeight = resolveBoundedIntegerEnv(
    env,
    'SERVER_NODE_CAPACITY_WEIGHT',
    DEFAULT_NODE_CAPACITY_WEIGHT,
    1,
    MAX_NODE_CAPACITY_WEIGHT,
    adjustments,
  );
  const heartbeatIntervalMs = resolveBoundedIntegerEnv(
    env,
    'SERVER_NODE_HEARTBEAT_INTERVAL_MS',
    DEFAULT_NODE_HEARTBEAT_INTERVAL_MS,
    1_000,
    60_000,
    adjustments,
  );
  const suspectAfterMs = resolveBoundedIntegerEnv(
    env,
    'SERVER_NODE_SUSPECT_AFTER_MS',
    DEFAULT_NODE_SUSPECT_AFTER_MS,
    3_000,
    120_000,
    adjustments,
  );
  const configuredDeadAfterMs = resolveBoundedIntegerEnv(
    env,
    'SERVER_NODE_DEAD_AFTER_MS',
    DEFAULT_NODE_DEAD_AFTER_MS,
    5_000,
    300_000,
    adjustments,
  );
  const deadAfterMs = Math.max(suspectAfterMs, configuredDeadAfterMs);
  if (deadAfterMs !== configuredDeadAfterMs) {
    const existingAdjustment = adjustments.find((entry) => entry.key === 'SERVER_NODE_DEAD_AFTER_MS');
    if (existingAdjustment) {
      existingAdjustment.normalizedValue = String(deadAfterMs);
      existingAdjustment.reason += '，且节点死亡阈值不能小于疑似失联阈值';
    } else {
      adjustments.push({
        key: 'SERVER_NODE_DEAD_AFTER_MS',
        configuredValue: readTrimmedEnv(env, 'SERVER_NODE_DEAD_AFTER_MS') || '(未配置)',
        normalizedValue: String(deadAfterMs),
        reason: '节点死亡阈值不能小于疑似失联阈值',
      });
    }
  }

  return {
    nodeId,
    address,
    port: publicPort.port,
    capacityWeight,
    heartbeatIntervalMs,
    suspectAfterMs,
    deadAfterMs,
    adjustments,
  };
}

/** 显式节点 ID 原样保留；超长或含控制字符时改用稳定摘要。 */
export function resolveNodeId(
  env: NodeJS.ProcessEnv = process.env,
  derivedSuffix = '',
): string {
  const publicPort = resolveServerPublicPort(env).port;
  return resolveNodeIdResolution(env, publicPort, derivedSuffix, []);
}

function resolveNodeIdResolution(
  env: NodeJS.ProcessEnv,
  publicPort: number,
  derivedSuffix: string,
  adjustments: NodeRuntimeConfigAdjustment[],
): string {
  const explicitNodeId = readTrimmedEnv(env, 'SERVER_NODE_ID');
  if (explicitNodeId) {
    if (isBoundedText(explicitNodeId, MAX_NODE_ID_LENGTH)) {
      return explicitNodeId;
    }
    const normalized = buildStableNodeId(explicitNodeId);
    adjustments.push({
      key: 'SERVER_NODE_ID',
      configuredValue: explicitNodeId,
      normalizedValue: normalized,
      reason: `节点 ID 最长 ${MAX_NODE_ID_LENGTH} 字符且不能包含控制字符`,
    });
    return normalized;
  }

  const derived = `${hostname().trim() || 'node'}:${publicPort}${derivedSuffix}`;
  return isBoundedText(derived, MAX_NODE_ID_LENGTH) ? derived : buildStableNodeId(derived);
}

function resolveNodeAddress(
  env: NodeJS.ProcessEnv,
  adjustments: NodeRuntimeConfigAdjustment[],
): string {
  const publicHost = readTrimmedEnv(env, 'SERVER_PUBLIC_HOST');
  const listenHost = readTrimmedEnv(env, 'SERVER_HOST');
  const configured = publicHost || listenHost;
  if (!configured || isBoundedText(configured, MAX_NODE_ADDRESS_LENGTH)) {
    return configured || DEFAULT_NODE_ADDRESS;
  }

  const fallback = listenHost
    && listenHost !== configured
    && isBoundedText(listenHost, MAX_NODE_ADDRESS_LENGTH)
    ? listenHost
    : DEFAULT_NODE_ADDRESS;
  adjustments.push({
    key: publicHost ? 'SERVER_PUBLIC_HOST' : 'SERVER_HOST',
    configuredValue: configured,
    normalizedValue: fallback,
    reason: `节点地址最长 ${MAX_NODE_ADDRESS_LENGTH} 字符且不能包含控制字符`,
  });
  return fallback;
}

function resolveBoundedIntegerEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  defaultValue: number,
  min: number,
  max: number,
  adjustments: NodeRuntimeConfigAdjustment[],
): number {
  const rawValue = readTrimmedEnv(env, key);
  if (!rawValue) return defaultValue;

  const parsed = Number(rawValue);
  const normalized = Number.isFinite(parsed)
    ? Math.max(min, Math.min(max, Math.trunc(parsed)))
    : defaultValue;
  if (!Number.isSafeInteger(parsed) || parsed !== normalized) {
    adjustments.push({
      key,
      configuredValue: rawValue,
      normalizedValue: String(normalized),
      reason: `必须是 ${min}..${max} 的安全整数`,
    });
  }
  return normalized;
}

function buildStableNodeId(value: string): string {
  return `node:sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function isBoundedText(value: string, maxLength: number): boolean {
  return value.length <= maxLength && !CONTROL_CHARACTER_PATTERN.test(value);
}

function readTrimmedEnv(env: NodeJS.ProcessEnv, key: string): string {
  return typeof env[key] === 'string' ? env[key]!.trim() : '';
}
