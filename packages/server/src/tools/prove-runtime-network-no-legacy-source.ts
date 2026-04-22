// @ts-nocheck

const fs = require("node:fs");
const path = require("node:path");

const packageRoot = path.resolve(__dirname, "..", "..");
const repoRoot = path.resolve(packageRoot, "..", "..");

const TARGETS = [
  {
    id: "runtime",
    directory: "packages/server/src/runtime",
    description: "runtime 主链不直接读取 legacy 文件路径",
  },
  {
    id: "network",
    directory: "packages/server/src/network",
    description: "network 主链不直接读取 legacy 文件路径",
  },
];

const FORBIDDEN_PATTERNS = [
  /from\(['\"].*legacy/,
  /require\(['\"].*legacy/,
  /legacy\//,
  /legacy\\/,
  /resolveProjectPath\([^\n]*legacy/,
  /path\.(resolve|join)\([^\n]*legacy/,
];
/**
 * listJsFiles：读取JFile并返回结果。
 * @param relativeDir 参数说明。
 * @returns 无返回值，完成JFile的读取/组装。
 */


function listJsFiles(relativeDir) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const absoluteDir = path.join(repoRoot, relativeDir);
  const queue = [absoluteDir];
  const files = [];
  while (queue.length > 0) {
    const current = queue.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(absolutePath);
        continue;
      }
      if (entry.isFile() && absolutePath.endsWith(".js")) {
        files.push(absolutePath);
      }
    }
  }
  return files.sort((left, right) => left.localeCompare(right, "en"));
}
/**
 * scanFile：判断scanFile是否满足条件。
 * @param absolutePath 参数说明。
 * @returns 无返回值，直接更新scanFile相关状态。
 */


function scanFile(absolutePath) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const source = fs.readFileSync(absolutePath, "utf8");
  const lines = source.split(/\r?\n/);
  const hits = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const pattern = FORBIDDEN_PATTERNS.find((candidate) => candidate.test(line));
    if (!pattern) {
      continue;
    }
    hits.push({
      line: index + 1,
      excerpt: line.trim(),
    });
  }
  return hits;
}
/**
 * main：执行main相关逻辑。
 * @returns 无返回值，直接更新main相关状态。
 */


function main() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const failures = [];
  const passes = [];

  for (const target of TARGETS) {
    const files = listJsFiles(target.directory);
    let hitCount = 0;
    for (const file of files) {
      const hits = scanFile(file);
      if (hits.length === 0) {
        continue;
      }
      hitCount += hits.length;
      const relativePath = path.relative(repoRoot, file);
      for (const hit of hits) {
        failures.push(`${target.id}: ${relativePath}:${hit.line} -> ${hit.excerpt}`);
      }
    }
    if (hitCount === 0) {
      passes.push(`${target.id}: ${target.description}`);
    }
  }

  if (failures.length > 0) {
    process.stderr.write("[runtime/network legacy-source proof] failed\n");
    for (const failure of failures) {
      process.stderr.write(`- ${failure}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write("[runtime/network legacy-source proof] passed\n");
  for (const pass of passes) {
    process.stdout.write(`- ${pass}\n`);
  }
}

main();
