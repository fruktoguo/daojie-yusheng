/**
 * 本地开发监听端口修复。
 *
 * 仅用于 WSL + Windows excludedportrange 场景，避免 dev-hot 继承 SERVER_PORT=3000 后
 * Linux 侧看不到监听进程、但 Windows 侧拒绝绑定导致服务无法启动。
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { DEFAULT_SERVER_LISTEN_PORT, resolveServerListenEndpoint } from './server-listen-endpoint';

export const LOCAL_DEVELOPMENT_STARTUP_ENV = 'SERVER_LOCAL_DEVELOPMENT_STARTUP';
export const LOCAL_DEVELOPMENT_WINDOWS_EXCLUDED_PORT_FALLBACK = 13_020;

export interface WindowsExcludedPortRange {
  start: number;
  end: number;
  managed: boolean;
}

export interface LocalDevelopmentListenEndpointRepair {
  originalPort: number;
  repairedPort: number;
  range: WindowsExcludedPortRange;
  updatedKeys: Array<'SERVER_PORT' | 'SERVER_PUBLIC_PORT'>;
}

const LOCAL_DEVELOPMENT_ENVIRONMENTS: Record<string, true> = {
  dev: true,
  development: true,
  local: true,
};

export function applyLocalDevelopmentListenEndpointRepair(
  env: NodeJS.ProcessEnv = process.env,
  excludedPortRanges?: WindowsExcludedPortRange[],
): LocalDevelopmentListenEndpointRepair | null {
  const localStartupRequested = normalizeBooleanEnv(env[LOCAL_DEVELOPMENT_STARTUP_ENV]);
  const runtimeEnvironment = firstTrimmed(env.SERVER_RUNTIME_ENV, env.APP_ENV, env.NODE_ENV);
  const shouldRepair = localStartupRequested || Boolean(LOCAL_DEVELOPMENT_ENVIRONMENTS[runtimeEnvironment]);
  if (!shouldRepair || normalizeBooleanEnv(env.SERVER_DEV_ALLOW_WINDOWS_EXCLUDED_PORT)) {
    return null;
  }

  const endpoint = resolveServerListenEndpoint(env);
  const portRanges = excludedPortRanges ?? readWindowsExcludedPortRanges();
  const range = findWindowsExcludedPortRange(endpoint.port, portRanges);
  if (!range) {
    return null;
  }

  const repairedPort = resolveLocalDevelopmentFallbackPort(portRanges, endpoint.port);
  if (repairedPort === endpoint.port) {
    return null;
  }

  const updatedKeys: LocalDevelopmentListenEndpointRepair['updatedKeys'] = ['SERVER_PORT'];
  const previousPublicPort = typeof env.SERVER_PUBLIC_PORT === 'string' ? env.SERVER_PUBLIC_PORT.trim() : '';
  env.SERVER_PORT = String(repairedPort);
  if (!previousPublicPort || previousPublicPort === String(endpoint.port)) {
    env.SERVER_PUBLIC_PORT = String(repairedPort);
    updatedKeys.push('SERVER_PUBLIC_PORT');
  }

  return {
    originalPort: endpoint.port,
    repairedPort,
    range,
    updatedKeys,
  };
}

export function formatLocalDevelopmentListenEndpointRepair(repair: LocalDevelopmentListenEndpointRepair): string {
  return `检测到本地开发端口 ${repair.originalPort} 落入 Windows 保留段 ${repair.range.start}-${repair.range.end}${repair.range.managed ? ' (managed)' : ''}，已改用 SERVER_PORT=${repair.repairedPort}`;
}

export function resolveWindowsExcludedPortHint(
  port: number,
  excludedPortRanges: WindowsExcludedPortRange[] = readWindowsExcludedPortRanges(),
): string {
  const range = findWindowsExcludedPortRange(port, excludedPortRanges);
  if (!range) {
    return '';
  }

  return `Detected Windows excluded TCP port range ${range.start}-${range.end}${range.managed ? ' (managed)' : ''} covering ${port}. If you are running inside WSL, choose another port such as SERVER_PORT=${LOCAL_DEVELOPMENT_WINDOWS_EXCLUDED_PORT_FALLBACK}.`;
}

export function parseWindowsExcludedPortRanges(output: string): WindowsExcludedPortRange[] {
  const ranges: WindowsExcludedPortRange[] = [];
  for (const line of output.split(/\r?\n/u)) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s*(\*)?\s*$/u);
    if (!match) {
      continue;
    }
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end > 65_535) {
      continue;
    }
    ranges.push({
      start,
      end,
      managed: Boolean(match[3]),
    });
  }
  return ranges;
}

function resolveLocalDevelopmentFallbackPort(excludedPortRanges: WindowsExcludedPortRange[], blockedPort: number): number {
  const preferredPorts = [
    LOCAL_DEVELOPMENT_WINDOWS_EXCLUDED_PORT_FALLBACK,
    DEFAULT_SERVER_LISTEN_PORT,
  ];
  for (const candidate of preferredPorts) {
    if (candidate !== blockedPort && !findWindowsExcludedPortRange(candidate, excludedPortRanges)) {
      return candidate;
    }
  }
  for (let candidate = LOCAL_DEVELOPMENT_WINDOWS_EXCLUDED_PORT_FALLBACK; candidate <= LOCAL_DEVELOPMENT_WINDOWS_EXCLUDED_PORT_FALLBACK + 200; candidate += 1) {
    if (candidate !== blockedPort && !findWindowsExcludedPortRange(candidate, excludedPortRanges)) {
      return candidate;
    }
  }
  for (let candidate = DEFAULT_SERVER_LISTEN_PORT; candidate <= 65_535; candidate += 1) {
    if (candidate !== blockedPort && !findWindowsExcludedPortRange(candidate, excludedPortRanges)) {
      return candidate;
    }
  }
  return DEFAULT_SERVER_LISTEN_PORT;
}

function findWindowsExcludedPortRange(
  port: number,
  excludedPortRanges: WindowsExcludedPortRange[],
): WindowsExcludedPortRange | null {
  return excludedPortRanges.find((entry) => port >= entry.start && port <= entry.end) ?? null;
}

function readWindowsExcludedPortRanges(): WindowsExcludedPortRange[] {
  if (!isLikelyWsl()) {
    return [];
  }

  const output = readCommandOutput('cmd.exe', ['/c', 'netsh interface ipv4 show excludedportrange protocol=tcp']);
  if (!output || output.startsWith('[failed]')) {
    return [];
  }

  return parseWindowsExcludedPortRanges(output);
}

function isLikelyWsl(): boolean {
  if (process.platform !== 'linux') {
    return false;
  }
  if (process.env.WSL_INTEROP || process.env.WSL_DISTRO_NAME) {
    return true;
  }
  try {
    const version = readFileSync('/proc/version', 'utf8');
    return /microsoft/iu.test(version);
  } catch {
    return false;
  }
}

function readCommandOutput(command: string, args: string[]): string {
  try {
    const result = spawnSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = typeof result.stdout === 'string' ? result.stdout.trim() : '';
    const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
    if (stdout) {
      return stdout;
    }
    if (stderr) {
      return `[stderr] ${stderr}`;
    }
    if (typeof result.status === 'number') {
      return `[exit ${result.status}] no output`;
    }
    return '[no output]';
  } catch (error) {
    return `[failed] ${error instanceof Error ? error.message : String(error)}`;
  }
}

function normalizeBooleanEnv(rawValue: string | undefined): boolean {
  const normalized = typeof rawValue === 'string' ? rawValue.trim().toLowerCase() : '';
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function firstTrimmed(...values: Array<string | undefined>): string {
  for (const value of values) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (normalized) {
      return normalized;
    }
  }
  return '';
}
