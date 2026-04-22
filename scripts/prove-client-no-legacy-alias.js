"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const clientRoot = path.join(repoRoot, "packages/client/src");
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
const LEGACY_ALIAS_PATTERN = /['\"](?:s|c):[A-Za-z0-9:_-]+['\"]/g;

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

function main() {
  const files = collectFiles(clientRoot);
  const failures = [];

  for (const filePath of files) {
    const source = fs.readFileSync(filePath, "utf8");
    const matches = [...source.matchAll(LEGACY_ALIAS_PATTERN)];
    if (matches.length === 0) {
      continue;
    }
    const relativePath = path.relative(repoRoot, filePath);
    for (const match of matches) {
      const line = source.slice(0, match.index ?? 0).split(/\r?\n/).length;
      failures.push(`${relativePath}:${line} 仍写死 legacy socket alias ${match[0]}`);
    }
  }

  process.stdout.write("[next client no legacy alias proof] summary\n");
  process.stdout.write(`- checked_files: ${files.length}\n`);

  if (failures.length > 0) {
    process.stderr.write("[next client no legacy alias proof] failed\n");
    for (const failure of failures) {
      process.stderr.write(`- ${failure}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write("[next client no legacy alias proof] passed\n");
}

main();
