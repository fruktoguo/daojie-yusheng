"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

const TARGETS = [
  {
    id: "client",
    directory: "packages/client/src",
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    description: "client 主链不直接读取 legacy 文件路径",
  },
  {
    id: "shared",
    directory: "packages/shared/src",
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    description: "shared 主链不直接读取 legacy 文件路径",
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

function listSourceFiles(relativeDir, extensions) {
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
      if (entry.isFile() && extensions.some((extension) => absolutePath.endsWith(extension))) {
        files.push(absolutePath);
      }
    }
  }
  return files.sort((left, right) => left.localeCompare(right, "en"));
}

function scanFile(absolutePath) {
  const source = fs.readFileSync(absolutePath, "utf8");
  const lines = source.split(/\r?\n/);
  const hits = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!FORBIDDEN_PATTERNS.some((pattern) => pattern.test(line))) {
      continue;
    }
    hits.push({
      line: index + 1,
      excerpt: line.trim(),
    });
  }
  return hits;
}

function main() {
  const failures = [];
  const passes = [];

  for (const target of TARGETS) {
    const files = listSourceFiles(target.directory, target.extensions);
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
    process.stderr.write("[next client/shared legacy-source proof] failed\n");
    for (const failure of failures) {
      process.stderr.write(`- ${failure}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write("[next client/shared legacy-source proof] passed\n");
  for (const pass of passes) {
    process.stdout.write(`- ${pass}\n`);
  }
}

main();
