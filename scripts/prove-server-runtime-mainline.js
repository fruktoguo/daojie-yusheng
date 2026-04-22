"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const runtimeRoot = path.join(repoRoot, "packages/server/src/runtime");
const SOURCE_EXTENSIONS = [".js", ".ts"];
const IMPORT_PATTERN = /require\(['\"]([^'\"]+)['\"]\)|from ['\"]([^'\"]+)['\"]/g;

const ALLOWED_RUNTIME_TO_NETWORK = new Set([
  `packages${path.sep}server${path.sep}src${path.sep}network${path.sep}world-session.service.ts`,
  `packages${path.sep}server${path.sep}src${path.sep}network${path.sep}world-client-event.service.ts`,
  `packages${path.sep}server${path.sep}src${path.sep}network${path.sep}world-player-token.service.ts`,
  `packages${path.sep}server${path.sep}src${path.sep}network${path.sep}world-sync.service.ts`,
]);

const ALLOWED_RUNTIME_TO_HTTP = new Set([
  `packages${path.sep}server${path.sep}src${path.sep}http${path.sep}next${path.sep}next-gm.constants.ts`,
  `packages${path.sep}server${path.sep}src${path.sep}http${path.sep}next${path.sep}next-gm-contract.ts`,
]);

const FORBIDDEN_NETWORK_RUNTIME_BYPASSES = [
  `packages${path.sep}server${path.sep}src${path.sep}network${path.sep}world-player-source.service.ts`,
  `packages${path.sep}server${path.sep}src${path.sep}network${path.sep}world-player-snapshot.service.ts`,
  `packages${path.sep}server${path.sep}src${path.sep}network${path.sep}world-player-auth.service.ts`,
  `packages${path.sep}server${path.sep}src${path.sep}network${path.sep}world-auth.registry.ts`,
];

function resolveImportTarget(absoluteTarget) {
  if (fs.existsSync(absoluteTarget)) {
    return absoluteTarget;
  }
  if (fs.existsSync(`${absoluteTarget}.ts`)) {
    return `${absoluteTarget}.ts`;
  }
  if (fs.existsSync(`${absoluteTarget}.js`)) {
    return `${absoluteTarget}.js`;
  }
  return absoluteTarget;
}

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

function collectImports(filePath, source) {
  const imports = [];
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const request = match[1] || match[2];
    if (!request || !request.startsWith(".")) {
      continue;
    }
    const absoluteTarget = path.resolve(path.dirname(filePath), request);
    imports.push({
      request,
      absoluteTarget: resolveImportTarget(absoluteTarget),
      line: source.slice(0, match.index ?? 0).split(/\r?\n/).length,
    });
  }
  return imports;
}

function main() {
  const runtimeFiles = collectFiles(runtimeRoot);
  const failures = [];
  let runtimeToNetworkEdges = 0;

  for (const filePath of runtimeFiles) {
    const source = fs.readFileSync(filePath, "utf8");
    const relativePath = path.relative(repoRoot, filePath);
    const imports = collectImports(filePath, source);

    for (const entry of imports) {
      const relativeTarget = path.relative(repoRoot, entry.absoluteTarget);
      if (relativeTarget.includes(`legacy${path.sep}`) || relativeTarget.includes(`compat${path.sep}`)) {
        failures.push(`${relativePath}:${entry.line} 仍依赖 legacy/compat 模块 -> ${entry.request}`);
        continue;
      }
      if (FORBIDDEN_NETWORK_RUNTIME_BYPASSES.includes(relativeTarget)) {
        failures.push(`${relativePath}:${entry.line} runtime 仍依赖会决定 next 行为的旁路 network 模块 -> ${entry.request}`);
        continue;
      }
      if (relativeTarget.startsWith(`packages${path.sep}server${path.sep}src${path.sep}http${path.sep}`)) {
        if (!ALLOWED_RUNTIME_TO_HTTP.has(relativeTarget)) {
          failures.push(`${relativePath}:${entry.line} runtime 依赖了未授权的 http 模块 -> ${entry.request}`);
        }
        continue;
      }
      if (relativeTarget.startsWith(`packages${path.sep}server${path.sep}src${path.sep}network${path.sep}`)) {
        runtimeToNetworkEdges += 1;
        if (!ALLOWED_RUNTIME_TO_NETWORK.has(relativeTarget)) {
          failures.push(`${relativePath}:${entry.line} runtime 依赖了未授权的 network 模块 -> ${entry.request}`);
        }
      }
    }
  }

  process.stdout.write("[next server runtime mainline proof] summary\n");
  process.stdout.write(`- runtime_files: ${runtimeFiles.length}\n`);
  process.stdout.write(`- allowed_runtime_to_network_edges: ${runtimeToNetworkEdges}\n`);
  process.stdout.write(`- allowed_network_modules: ${ALLOWED_RUNTIME_TO_NETWORK.size}\n`);
  process.stdout.write(`- allowed_http_modules: ${ALLOWED_RUNTIME_TO_HTTP.size}\n`);

  if (failures.length > 0) {
    process.stderr.write("[next server runtime mainline proof] failed\n");
    for (const failure of failures) {
      process.stderr.write(`- ${failure}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write("[next server runtime mainline proof] passed\n");
}

main();
