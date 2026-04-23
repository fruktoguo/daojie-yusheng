"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

const TARGET_DIRECTORIES = [
  "packages/client/src",
  "packages/server/src",
  "packages/shared/src",
];

const SKIP_SEGMENTS = [
  `${path.sep}tools${path.sep}`,
];

const ALLOWED_FILES = new Set([
  path.join(repoRoot, "packages/shared/src/protocol.ts"),
]);

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const LOCAL_EVENT_TABLE_PATTERN = /(?:^|\n)\s*(?:export\s+)?const\s+(?:C2S|S2C)\s*=/m;
const EVENT_LITERAL_PATTERN = /['\"]n:[cs]:[A-Za-z0-9]+['\"]/g;

function collectFiles(relativeDir) {
  const root = path.join(repoRoot, relativeDir);
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
  if (ALLOWED_FILES.has(filePath)) {
    return true;
  }
  return SKIP_SEGMENTS.some((segment) => filePath.includes(segment));
}

function firstLineNumberForPattern(source, pattern) {
  const match = source.match(pattern);
  if (!match || typeof match.index !== "number") {
    return null;
  }
  return source.slice(0, match.index).split(/\r?\n/).length;
}

function main() {
  const failures = [];
  let checkedFiles = 0;

  for (const relativeDir of TARGET_DIRECTORIES) {
    for (const filePath of collectFiles(relativeDir)) {
      if (shouldSkip(filePath)) {
        continue;
      }
      checkedFiles += 1;
      const source = fs.readFileSync(filePath, "utf8");
      const relativePath = path.relative(repoRoot, filePath);

      const tableLine = firstLineNumberForPattern(source, LOCAL_EVENT_TABLE_PATTERN);
      if (tableLine !== null) {
        failures.push(`${relativePath}:${tableLine} 定义了本地 C2S/S2C 事件表`);
      }

      const literalMatches = [...source.matchAll(EVENT_LITERAL_PATTERN)];
      for (const match of literalMatches) {
        if (typeof match.index !== "number") {
          continue;
        }
        const line = source.slice(0, match.index).split(/\r?\n/).length;
        failures.push(`${relativePath}:${line} 直接写死协议事件字面量 ${match[0]}`);
      }
    }
  }

  process.stdout.write("[protocol source proof] summary\n");
  process.stdout.write(`- checked_files: ${checkedFiles}\n`);
  process.stdout.write(`- skipped_files: ${ALLOWED_FILES.size} explicit + tools directories\n`);

  if (failures.length > 0) {
    process.stderr.write("[protocol source proof] failed\n");
    for (const failure of failures) {
      process.stderr.write(`- ${failure}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write("[protocol source proof] passed\n");
}

main();
