import { NestFactory } from '@nestjs/core';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { AppModule } from './app.module';
import { resolveServerNextCorsOptions } from './config/server-cors';
import { DateConsoleLogger } from './logging/date-console-logger';

/** 端口冲突诊断最多采样次数。 */
const PORT_CONFLICT_SAMPLE_ATTEMPTS = 12;

/** 端口冲突诊断采样间隔。 */
const PORT_CONFLICT_SAMPLE_INTERVAL_MS = 100;

interface PortRange {
  start: number;
  end: number;
  managed: boolean;
}

interface PortConflictSample {
  lsofOutput: string;
  ssOutput: string;
  fuserOutput: string;
  text: string;
}

/** 执行一条命令并返回标准化文本，供端口冲突诊断复用。 */
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

/** 非阻塞 sleep，用于端口探测间隔。 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 判定当前进程是否运行在 WSL 环境（用于排除 Windows 端口保留误报）。 */
function isLikelyWsl(): boolean {
  if (process.platform !== 'linux') {
    return false;
  }

  if (process.env.WSL_INTEROP || process.env.WSL_DISTRO_NAME) {
    return true;
  }

  try {
    const version = readFileSync('/proc/version', 'utf8');
    return /microsoft/i.test(version);
  } catch {
    return false;
  }
}

/** 读取 Windows 下被系统排除的 TCP 端口段，支持 WSL 场景提示。 */
function readWindowsExcludedPortRanges(): PortRange[] {
  if (!isLikelyWsl()) {
    return [];
  }

  const output = readCommandOutput('cmd.exe', ['/c', 'netsh interface ipv4 show excludedportrange protocol=tcp']);
  if (!output || output.startsWith('[failed]')) {
    return [];
  }

  const ranges: PortRange[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s*(\*)?\s*$/);
    if (!match) {
      continue;
    }

    ranges.push({
      start: Number(match[1]),
      end: Number(match[2]),
      managed: Boolean(match[3]),
    });
  }

  return ranges;
}

/** 根据端口和已知保留段，输出人类可读的端口排除提示。 */
function resolveExcludedPortHint(port: number): string {
  const range = readWindowsExcludedPortRanges().find((entry) => port >= entry.start && port <= entry.end);
  if (!range) {
    return '';
  }

  return `Detected Windows excluded TCP port range ${range.start}-${range.end}${range.managed ? ' (managed)' : ''} covering ${port}. If you are running inside WSL, choose another port such as SERVER_NEXT_PORT=13020.`;
}

/** 采集一次端口监听冲突快照，用于 EADDRINUSE 附加诊断。 */
function capturePortConflictSample(port: number): PortConflictSample {
  const lsofOutput = readCommandOutput('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN']);
  const ssOutput = readCommandOutput('ss', ['-ltnp', `( sport = :${port} )`]);
  const fuserOutput = readCommandOutput('fuser', ['-v', '-n', 'tcp', String(port)]);

  return {
    lsofOutput,
    ssOutput,
    fuserOutput,
    text: [
      `lsof -nP -iTCP:${port} -sTCP:LISTEN`,
      lsofOutput,
      `ss -ltnp '( sport = :${port} )'`,
      ssOutput,
      `fuser -v -n tcp ${port}`,
      fuserOutput,
    ].join('\n'),
  };
}

/** 判断采样是否包含可读性冲突证据（lsof / ss / fuser）。 */
function hasUsefulPortConflictEvidence(sample: PortConflictSample): boolean {
  return (
    (sample.lsofOutput && sample.lsofOutput !== '[exit 1] no output')
    || (sample.fuserOutput && sample.fuserOutput !== '[exit 1] no output')
    || (
      sample.ssOutput
      && sample.ssOutput !== 'State Recv-Q Send-Q Local Address:Port Peer Address:PortProcess'
      && sample.ssOutput !== '[exit 1] no output'
    )
  );
}

/** 循环采集多次诊断样本，优先返回第一条有效证据。 */
async function collectPortConflictDiagnostics(port: number): Promise<string> {
  const samples: string[] = [];

  for (let index = 0; index < PORT_CONFLICT_SAMPLE_ATTEMPTS; index += 1) {
    const sample = capturePortConflictSample(port);
    samples.push(`[sample ${index + 1}/${PORT_CONFLICT_SAMPLE_ATTEMPTS}]\n${sample.text}`);

    if (hasUsefulPortConflictEvidence(sample)) {
      return samples.join('\n\n');
    }

    if (index + 1 < PORT_CONFLICT_SAMPLE_ATTEMPTS) {
      await sleep(PORT_CONFLICT_SAMPLE_INTERVAL_MS);
    }
  }

  return samples.join('\n\n');
}

/** 启动 Nest 应用：创建服务、启用钩子/跨域，并在端口冲突时补充诊断日志。 */
async function bootstrap(): Promise<void> {
  const logger = new DateConsoleLogger('Bootstrap');
  const app = await NestFactory.create(AppModule, { logger });

  app.enableShutdownHooks();

  const corsOptions = resolveServerNextCorsOptions();
  if (corsOptions) {
    app.enableCors(corsOptions);
  }

  const port = Number(process.env.SERVER_NEXT_PORT ?? 13001);
  const host = process.env.SERVER_NEXT_HOST ?? '0.0.0.0';

  try {
    await app.listen(port, host);
  } catch (error) {
    if (hasErrorCode(error, 'EADDRINUSE')) {
      const diagnostics = await collectPortConflictDiagnostics(port);
      const excludedPortHint = resolveExcludedPortHint(port);
      logger.error(`server-next 绑定 ${host}:${port} 时发生端口冲突${excludedPortHint ? `\n${excludedPortHint}` : ''}\n${diagnostics}`);
    }

    await app.close().catch(() => undefined);
    throw error;
  }

  logger.log(`服务端已运行于 http://${host}:${port}`);
}

function hasErrorCode(error: unknown, code: string): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

void bootstrap();
