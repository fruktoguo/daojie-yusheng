"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const sharedTypesPath = path.join(repoRoot, "packages/shared/src/types.ts");
const sharedIndexPath = path.join(repoRoot, "packages/shared/src/index.ts");

const DECLARATION_PATTERN = /^export\s+(?:interface|type|enum)\s+([A-Za-z0-9_]+)/gm;
const LOCAL_DECLARATION_TEMPLATE = (name) => new RegExp(`(^|\\n)\\s*(?:export\\s+)?(?:interface|type|enum)\\s+${name}\\b`, "m");
const LEGACY_IMPORT_PATTERN = /legacy\/shared|legacy\\shared/;

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function stripImports(source) {
  return source
    .replace(/^import\s+[^;]+;\s*$/gm, "")
    .replace(/^export\s+type\s+\{[^;]+;\s*$/gm, "");
}

function collectSourceFiles(relativeDir, extensions) {
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
      if (entry.isFile() && extensions.some((extension) => absolutePath.endsWith(extension))) {
        files.push(absolutePath);
      }
    }
  }
  return files.sort((left, right) => left.localeCompare(right, "en"));
}

function main() {
  const sharedTypesSource = readFile(sharedTypesPath);
  const sharedIndexSource = readFile(sharedIndexPath);
  const exportedNames = [...sharedTypesSource.matchAll(DECLARATION_PATTERN)].map((match) => match[1]);
  const clientFiles = collectSourceFiles("packages/client/src", [".ts", ".tsx", ".js", ".jsx"]);
  const serverFiles = collectSourceFiles("packages/server/src", [".ts", ".tsx", ".js", ".jsx"]);
  const failures = [];

  if (!sharedIndexSource.includes("export * from './types';")) {
    failures.push("packages/shared/src/index.ts 未继续统一导出 ./types");
  }

  const allFiles = [...clientFiles, ...serverFiles];
  for (const filePath of allFiles) {
    const source = readFile(filePath);
    if (LEGACY_IMPORT_PATTERN.test(source)) {
      failures.push(`${path.relative(repoRoot, filePath)} 仍引用 legacy/shared`);
      continue;
    }
    const stripped = stripImports(source);
    for (const exportedName of exportedNames) {
      if (LOCAL_DECLARATION_TEMPLATE(exportedName).test(stripped)) {
        failures.push(`${path.relative(repoRoot, filePath)} 重复定义共享类型 ${exportedName}`);
      }
    }
  }

  process.stdout.write("[next shared types source proof] summary\n");
  process.stdout.write(`- exported_names: ${exportedNames.length}\n`);
  process.stdout.write(`- checked_client_files: ${clientFiles.length}\n`);
  process.stdout.write(`- checked_server_files: ${serverFiles.length}\n`);

  if (failures.length > 0) {
    process.stderr.write("[next shared types source proof] failed\n");
    for (const failure of failures) {
      process.stderr.write(`- ${failure}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write("[next shared types source proof] passed\n");
}

main();
