"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const TARGETS = [
  path.join(repoRoot, "packages/client/src"),
  path.join(repoRoot, "packages/server/src"),
  path.join(repoRoot, "packages/shared/src"),
];
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const SKIP_SEGMENTS = [`${path.sep}tools${path.sep}`];
const LEGACY_FILE_PATTERN = /legacy\/|legacy\\/g;

function collectFiles(root) {
  const queue = [root];
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
      if (entry.isFile() && SOURCE_EXTENSIONS.some((extension) => absolutePath.endsWith(extension))) {
        files.push(absolutePath);
      }
    }
  }
  return files.sort((left, right) => left.localeCompare(right, "en"));
}

function shouldSkip(filePath) {
  return SKIP_SEGMENTS.some((segment) => filePath.includes(segment));
}

function main() {
  const failures = [];
  let checkedFiles = 0;
  for (const root of TARGETS) {
    for (const filePath of collectFiles(root)) {
      if (shouldSkip(filePath)) {
        continue;
      }
      checkedFiles += 1;
      const source = fs.readFileSync(filePath, "utf8");
      const matches = [...source.matchAll(LEGACY_FILE_PATTERN)];
      if (matches.length === 0) {
        continue;
      }
      const relativePath = path.relative(repoRoot, filePath);
      for (const match of matches) {
        const line = source.slice(0, match.index ?? 0).split(/\r?\n/).length;
        failures.push(`${relativePath}:${line} 仍通过 legacy 文件路径决定主链行为 -> ${match[0]}`);
      }
    }
  }

  process.stdout.write("[next no legacy file behavior proof] summary\n");
  process.stdout.write(`- checked_files: ${checkedFiles}\n`);
  process.stdout.write(`- skipped_segments: ${SKIP_SEGMENTS.length}\n`);

  if (failures.length > 0) {
    process.stderr.write("[next no legacy file behavior proof] failed\n");
    for (const failure of failures) {
      process.stderr.write(`- ${failure}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write("[next no legacy file behavior proof] passed\n");
}

main();
