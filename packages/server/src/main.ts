/**
 * 服务端启动入口：创建 NestJS 应用实例，配置 CORS、安全头和端口监听。
 * 端口冲突时自动采集诊断信息（lsof/ss/fuser），辅助运维定位。
 */
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { AppModule } from './app.module';
import { WorldShutdownDrainService } from './network/world-shutdown-drain.service';
import { resolveServerCorsOptions } from './config/server-cors';
import { installConsoleLogCapture } from './logging/console-log-buffer';
import { DateConsoleLogger } from './logging/date-console-logger';
import { bootstrapLoadDbConfig } from './config/bootstrap-load-db-config';
import {
  describeServerRuntimeRole,
  resolveServerRuntimeRole,
  shouldStartHttpServer,
} from './config/runtime-role';

/** 端口冲突诊断最多采样次数。 */
const PORT_CONFLICT_SAMPLE_ATTEMPTS = 12;

/** 端口冲突诊断采样间隔。 */
const PORT_CONFLICT_SAMPLE_INTERVAL_MS = 100;
/** Windows TCP 端口排除段描述。 */
interface PortRange {
  /** 排除段起始端口。 */
  start: number;
  /** 排除段结束端口。 */
  end: number;
  /** 是否为系统管理的保留段。 */
  managed: boolean;
}
/** 单次端口冲突诊断采样结果。 */
interface PortConflictSample {
  lsofOutput: string;
  ssOutput: string;
  fuserOutput: string;
  /** 合并后的人类可读诊断文本。 */
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

  return `Detected Windows excluded TCP port range ${range.start}-${range.end}${range.managed ? ' (managed)' : ''} covering ${port}. If you are running inside WSL, choose another port such as SERVER_PORT=13020.`;
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

let bootstrapApp: INestApplicationContext | null = null;

/** 启动 Nest 应用：创建服务、启用钩子/跨域，并在端口冲突时补充诊断日志。 */
async function bootstrap(): Promise<void> {

  installConsoleLogCapture();
  const logger = new DateConsoleLogger('Bootstrap');

  // 从数据库加载游戏配置到 process.env（DB 不可用时静默跳过）
  const dbConfigCount = await bootstrapLoadDbConfig();
  if (dbConfigCount >= 0) {
    logger.log(`已从数据库加载 ${dbConfigCount} 项游戏配置`);
  }

  const role = resolveServerRuntimeRole();
  logger.log(`服务端运行角色：${describeServerRuntimeRole(role)}`);

  if (!shouldStartHttpServer(role)) {
    const app = await NestFactory.createApplicationContext(AppModule, { logger });
    bootstrapApp = app;
    app.enableShutdownHooks();
    logger.log('worker 角色已启动 Nest application context；不监听 HTTP/Socket.IO 端口');
    return;
  }

  const app = await NestFactory.create(AppModule, { logger });
  bootstrapApp = app;

  app.enableShutdownHooks();

  const corsOptions = resolveServerCorsOptions();
  if (corsOptions) {
    app.enableCors(corsOptions);
  }

  app.use((_req: unknown, res: { setHeader(name: string, value: string): void }, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  const port = Number(process.env.SERVER_PORT ?? 13001);
  const host = process.env.SERVER_HOST ?? '0.0.0.0';

  try {
    await app.listen(port, host);
  } catch (error) {
    if (hasErrorCode(error, 'EADDRINUSE')) {
      const diagnostics = await collectPortConflictDiagnostics(port);
      const excludedPortHint = resolveExcludedPortHint(port);
      logger.error(`server 绑定 ${host}:${port} 时发生端口冲突${excludedPortHint ? `\n${excludedPortHint}` : ''}\n${diagnostics}`);
    }

    await app.close().catch(() => undefined);
    throw error;
  }

  logger.log(`服务端已运行于 http://${host}:${port}`);
}
/** 类型守卫：判断 error 是否包含指定 code 字段。 */
function hasErrorCode(error: unknown, code: string): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

// ─── 全局未捕获异常兜底 ───

process.on('unhandledRejection', (reason: unknown) => {
  console.error('[致命] 未处理的 Promise 拒绝：', reason instanceof Error ? reason.stack : String(reason));
});

process.on('uncaughtException', (error: Error) => {
  console.error('[致命] 未捕获异常：', error.stack ?? error.message);
  process.exit(1);
});

// ─── Graceful shutdown 超时兜底 ───
// NestJS enableShutdownHooks 触发 onModuleDestroy 链，若某 service 阻塞则整体卡住。
// 此处注册独立超时：SIGTERM/SIGINT 后最多等 15s，超时强制退出。
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 15_000;
let shutdownTimerSet = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (shutdownTimerSet) return;
    shutdownTimerSet = true;
    void (async () => {
      try {
        const shutdownDrain = bootstrapApp?.get(WorldShutdownDrainService, { strict: false });
        await shutdownDrain?.drain(signal);
      } catch (error) {
        console.error('[关闭] 预先执行关闭排空失败：', error instanceof Error ? error.stack : String(error));
      }
      await bootstrapApp?.close().catch((error) => {
        console.error('[关闭] app.close 失败：', error instanceof Error ? error.stack : String(error));
      });
      bootstrapApp = null;
    })();
    const timer = setTimeout(() => {
      console.error(`[关闭] 优雅关闭超时 ${GRACEFUL_SHUTDOWN_TIMEOUT_MS}ms，强制退出`);
      process.exit(1);
    }, GRACEFUL_SHUTDOWN_TIMEOUT_MS);
    timer.unref();
  });
}

void bootstrap();
