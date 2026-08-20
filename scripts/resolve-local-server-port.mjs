import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const DEFAULT_LOCAL_SERVER_PORT = 13_001;
export const WINDOWS_EXCLUDED_PORT_FALLBACK = 13_020;

export function parseWindowsExcludedPortRanges(output) {
  const ranges = [];
  for (const line of String(output ?? '').split(/\r?\n/u)) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s*(\*)?\s*$/u);
    if (!match) continue;
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end > 65_535) {
      continue;
    }
    ranges.push({ start, end, managed: Boolean(match[3]) });
  }
  return ranges;
}

export function resolveLocalServerPort(requestedPort, excludedPortRanges) {
  const parsedPort = /^\d+$/u.test(String(requestedPort ?? '').trim())
    ? Number(String(requestedPort).trim())
    : Number.NaN;
  const port = Number.isSafeInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65_535
    ? parsedPort
    : DEFAULT_LOCAL_SERVER_PORT;
  const blockedRange = excludedPortRanges.find((range) => port >= range.start && port <= range.end);
  if (!blockedRange) {
    return { requestedPort: port, port, blockedRange: null };
  }

  for (const candidate of [WINDOWS_EXCLUDED_PORT_FALLBACK, DEFAULT_LOCAL_SERVER_PORT]) {
    if (candidate !== port && !excludedPortRanges.some((range) => candidate >= range.start && candidate <= range.end)) {
      return { requestedPort: port, port: candidate, blockedRange };
    }
  }
  for (let candidate = WINDOWS_EXCLUDED_PORT_FALLBACK; candidate <= 65_535; candidate += 1) {
    if (candidate !== port && !excludedPortRanges.some((range) => candidate >= range.start && candidate <= range.end)) {
      return { requestedPort: port, port: candidate, blockedRange };
    }
  }
  for (let candidate = 1_024; candidate < WINDOWS_EXCLUDED_PORT_FALLBACK; candidate += 1) {
    if (candidate !== port && !excludedPortRanges.some((range) => candidate >= range.start && candidate <= range.end)) {
      return { requestedPort: port, port: candidate, blockedRange };
    }
  }
  throw new Error('没有可用的本地 TCP 监听端口');
}

function readWindowsExcludedPortRanges() {
  if (!isLikelyWsl()) return [];
  try {
    const output = execFileSync(
      'cmd.exe',
      ['/c', 'netsh interface ipv4 show excludedportrange protocol=tcp'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return parseWindowsExcludedPortRanges(output);
  } catch {
    return [];
  }
}

function isLikelyWsl() {
  if (process.platform !== 'linux') return false;
  if (process.env.WSL_INTEROP || process.env.WSL_DISTRO_NAME) return true;
  try {
    return /microsoft/iu.test(readFileSync('/proc/version', 'utf8'));
  } catch {
    return false;
  }
}

function main() {
  const rawPort = process.argv[2] ?? String(DEFAULT_LOCAL_SERVER_PORT);
  const resolution = resolveLocalServerPort(rawPort, readWindowsExcludedPortRanges());
  if (resolution.blockedRange) {
    const managed = resolution.blockedRange.managed ? ' (managed)' : '';
    console.error(
      `==> 本地端口 ${resolution.requestedPort} 落入 Windows 保留段 ${resolution.blockedRange.start}-${resolution.blockedRange.end}${managed}，改用 ${resolution.port}`,
    );
  }
  process.stdout.write(String(resolution.port));
}

const entryPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (entryPath === import.meta.url) {
  main();
}
