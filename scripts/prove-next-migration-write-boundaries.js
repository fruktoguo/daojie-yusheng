"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const migrateScriptPath = path.join(repoRoot, "packages/server/src/tools/migrate-next-mainline-once.js");
const source = fs.readFileSync(migrateScriptPath, "utf8");

const ALLOWED_TABLE_CONSTANTS = new Set([
  "PLAYER_AUTH_TABLE",
  "PLAYER_IDENTITY_TABLE",
  "PLAYER_SNAPSHOT_TABLE",
]);

const ALLOWED_SCOPE_CONSTANTS = new Set([
  "MAILBOX_SCOPE",
  "MARKET_ORDER_SCOPE",
  "MARKET_TRADE_SCOPE",
  "MARKET_STORAGE_SCOPE",
  "REDEEM_CODE_SCOPE",
  "SUGGESTION_SCOPE",
  "GM_AUTH_SCOPE",
  "DATABASE_BACKUP_METADATA_SCOPE",
  "DATABASE_JOB_STATE_SCOPE",
]);

function main() {
  const failures = [];

  const insertTargets = [...source.matchAll(/INSERT INTO \$\{([A-Z_]+)\}/g)].map((match) => match[1]);
  for (const target of insertTargets) {
    if (!ALLOWED_TABLE_CONSTANTS.has(target)) {
      failures.push(`发现未授权的写入表常量 ${target}`);
    }
  }

  const upsertScopeTargets = [...source.matchAll(/upsertPersistentDocument\(client,\s*([A-Z_]+)/g)].map((match) => match[1]);
  for (const target of upsertScopeTargets) {
    if (!ALLOWED_SCOPE_CONSTANTS.has(target)) {
      failures.push(`发现未授权的写入 scope 常量 ${target}`);
    }
  }

  if (!source.includes("[next mainline migrate preflight]")) {
    failures.push("缺少 write/dry-run preflight 打印标记");
  }
  if (!source.includes("inputSource") || !source.includes("mode") || !source.includes("targetTables") || !source.includes("targetScopes")) {
    failures.push("preflight 未覆盖输入来源、模式、目标表/scope");
  }
  if (!source.includes("domains: options.domains") || !source.includes("migrated: {}") || !source.includes("failed: []")) {
    failures.push("迁移摘要缺少 domains/migrated/failed 结构");
  }
  if (!/failures\.push\(\{[\s\S]*domain:[\s\S]*key:[\s\S]*error:/m.test(source)) {
    failures.push("失败清单未稳定包含 domain/key/error");
  }

  process.stdout.write("[next migration write boundaries proof] summary\n");
  process.stdout.write(`- insert_targets: ${insertTargets.join(", ")}\n`);
  process.stdout.write(`- upsert_scope_targets: ${upsertScopeTargets.join(", ")}\n`);

  if (failures.length > 0) {
    process.stderr.write("[next migration write boundaries proof] failed\n");
    for (const failure of failures) {
      process.stderr.write(`- ${failure}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write("[next migration write boundaries proof] passed\n");
}

main();
