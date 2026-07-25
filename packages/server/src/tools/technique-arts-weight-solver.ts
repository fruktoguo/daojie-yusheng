/**
 * 术法权重反推 CLI。
 *
 * 只读取请求 JSON 并输出正式展开器的搜索结果，不连接数据库、不发布功法。
 */
import fs from 'node:fs';
import path from 'node:path';

import { solveTechniqueArtsWeights } from './lib/technique-arts-weight-solver';

interface CliOptions {
  requestPath: string | null;
  compact: boolean;
  help: boolean;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }
  if (!options.requestPath) {
    printUsage();
    process.exitCode = 1;
    return;
  }
  const rawText = options.requestPath === '-'
    ? fs.readFileSync(0, 'utf8')
    : fs.readFileSync(path.resolve(process.cwd(), options.requestPath), 'utf8');
  let request: unknown;
  try {
    request = JSON.parse(rawText);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`请求 JSON 解析失败: ${message}`);
  }
  const result = solveTechniqueArtsWeights(request);
  process.stdout.write(`${JSON.stringify(result, null, options.compact ? 0 : 2)}\n`);
  if (result.ok === false) process.exitCode = 1;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { requestPath: null, compact: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--request') {
      options.requestPath = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--compact') {
      options.compact = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    throw new Error(`未知参数: ${arg}`);
  }
  return options;
}

function printUsage(): void {
  process.stderr.write([
    '用法:',
    '  pnpm solve:technique-arts-weights -- --request <request.json>',
    '  pnpm solve:technique-arts-weights -- --request - < request.json',
    '',
    '说明:',
    '  --request -    从标准输入读取 JSON',
    '  --compact      输出单行 JSON',
    '  工具只做预览计算，不读取或修改数据库。',
    '',
  ].join('\n'));
}

try {
  main();
} catch (error: unknown) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
