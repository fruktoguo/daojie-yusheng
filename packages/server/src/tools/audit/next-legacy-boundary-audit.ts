// @ts-nocheck

/**
 * 用途：审计 server-next 与 legacy 兼容边界依赖。
 */
const fs = require("node:fs");
const path = require("node:path");
const packageRoot = path.resolve(__dirname, "..", "..", "..");
const repoRoot = path.resolve(packageRoot, "..", "..");
/**
 * 记录doc输出。
 */
const docOutput = path.join(repoRoot, "docs", "next-legacy-boundary-audit.md");

/**
 * 记录类别order。
 */
const CATEGORY_ORDER = [
  "P0 auth/bootstrap 真源",
  "P0 legacy HTTP/GM/admin",
  "P1 world sync compat",
  "P1 runtime/persistence compat",
  "目标差距: 性能/扩展",
];

/**
 * 记录checks。
 */
const CHECKS = [
  {
    id: "auth.identity.legacy_source",
    category: "P0 auth/bootstrap 真源",
    description: "玩家身份解析仍经由 legacy player source",
    file: "packages/server/src/network/world-player-auth.service.ts",
    pattern: "worldLegacyPlayerSourceService.resolvePlayerIdentityFromCompatSource(",
  },
  {
    id: "auth.snapshot.legacy_fallback",
    category: "P0 auth/bootstrap 真源",
    description: "玩家快照装载仍保留 legacy fallback",
    file: "packages/server/src/network/world-player-snapshot.service.ts",
    pattern: "loadPlayerSnapshotFromCompatSource(",
  },
  {
    id: "legacy_http.controllers",
    category: "P0 legacy HTTP/GM/admin",
    description: "AppModule 仍挂载 legacy 账号/GM/admin 控制器",
    file: "packages/server/src/app.module.ts",
    pattern: "Legacy",
    include: [
      "Controller",
    ],
  },
  {
    id: "legacy_http.providers",
    category: "P0 legacy HTTP/GM/admin",
    description: "AppModule 仍注入 legacy auth/GM compat provider",
    file: "packages/server/src/app.module.ts",
    pattern: "Legacy",
    include: [
      "Service",
      "Guard",
      "Compat",
      "Bootstrap",
    ],
    exclude: [
      "WorldLegacySyncService",
    ],
  },
  {
    id: "legacy_http.health_readiness",
    category: "P0 legacy HTTP/GM/admin",
    description: "health readiness 仍把 legacy auth / GM admin compat 作为 readiness 前提",
    file: "packages/server/src/health/health-readiness.service.ts",
    pattern: "legacy",
  },
  {
    id: "sync.compat_initial",
    category: "P1 world sync compat",
    description: "WorldSyncService 仍保留 compat 初始同步分支",
    file: "packages/server/src/network/world-sync.service.ts",
    pattern: "emitCompatInitialSync(",
  },
  {
    id: "sync.compat_delta",
    category: "P1 world sync compat",
    description: "WorldSyncService 仍保留 compat 增量同步分支",
    file: "packages/server/src/network/world-sync.service.ts",
    pattern: "emitCompatDeltaSync(",
  },
  {
    id: "sync.legacy_navigation_path",
    category: "P1 world sync compat",
    description: "compat tick 仍直接读取 legacy 导航路径",
    file: "packages/server/src/network/world-sync.service.ts",
    pattern: "getLegacyNavigationPath(",
  },
  {
    id: "sync.protocol_dual_emit",
    category: "P1 world sync compat",
    description: "低频同步仍通过 protocol-aware helper 维持 next/legacy 双发",
    file: "packages/server/src/network/world-sync.service.ts",
    pattern: "emitProtocol",
  },
  {
    id: "runtime.snapshot_legacy_bonuses",
    category: "P1 runtime/persistence compat",
    description: "持久化装载仍回读 legacyBonuses",
    file: "packages/server/src/persistence/player-persistence.service.ts",
    pattern: "legacyBonuses",
  },
  {
    id: "runtime.snapshot_legacy_logbook",
    category: "P1 runtime/persistence compat",
    description: "持久化装载仍回读 legacyCompat.pendingLogbookMessages",
    file: "packages/server/src/persistence/player-persistence.service.ts",
    pattern: "legacyCompat?.pendingLogbookMessages",
  },
  {
    id: "runtime.snapshot_legacy_bonus_source",
    category: "P1 runtime/persistence compat",
    description: "持久化规范化仍兼容 legacy:vitals_baseline 标签",
    file: "packages/server/src/persistence/player-persistence.service.ts",
    pattern: "legacy:vitals_baseline",
  },
  {
    id: "runtime.legacy_snapshot_adapter",
    category: "P1 runtime/persistence compat",
    description: "WorldPlayerSource 仍保留显式 migration snapshot 查询入口",
    file: "packages/server/src/network/world-player-source.service.ts",
    pattern: "queryMigrationSnapshotRow(",
  },
  {
    id: "perf.full_capture",
    category: "目标差距: 性能/扩展",
    description: "WorldProjector 每轮仍做整份 capture 后再 diff",
    file: "packages/server/src/network/world-projector.service.ts",
    pattern: "capture(view, player)",
  },
  {
    id: "perf.string_key_split",
    category: "目标差距: 性能/扩展",
    description: "WorldSync 仍使用字符串 tile key split(',')",
    file: "packages/server/src/network/world-sync.service.ts",
    pattern: "split(',')",
  },
  {
    id: "perf.locale_compare_sync",
    category: "目标差距: 性能/扩展",
    description: "WorldSync 热路径仍存在 localeCompare 排序",
    file: "packages/server/src/network/world-sync.service.ts",
    pattern: "localeCompare(",
  },
  {
    id: "perf.locale_compare_runtime",
    category: "目标差距: 性能/扩展",
    description: "WorldRuntime 仍存在 localeCompare 排序",
    file: "packages/server/src/runtime/world/world-runtime.service.ts",
    pattern: "localeCompare(",
  },
  {
    id: "perf.json_signature_runtime",
    category: "目标差距: 性能/扩展",
    description: "WorldRuntime 仍存在 JSON.stringify 级签名比较",
    file: "packages/server/src/runtime/world/world-runtime.service.ts",
    pattern: "JSON.stringify(",
  },
];

/**
 * 串联执行脚本主流程。
 */
function main() {
/**
 * 汇总执行结果。
 */
  const results = CHECKS.map(runCheck);
/**
 * 记录汇总。
 */
  const summary = buildSummary(results);
/**
 * 记录markdown。
 */
  const markdown = renderMarkdown(summary, results);
  fs.writeFileSync(docOutput, markdown, "utf8");
  process.stdout.write(`[next legacy boundary audit] report written to ${docOutput}\n`);
  process.stdout.write(`[next legacy boundary audit] matched ${summary.matchedChecks}/${summary.totalChecks} checks, ${summary.totalHits} code hits across ${summary.categories.length} categories\n`);
}

/**
 * 运行check。
 */
function runCheck(entry) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录absolute路径。
 */
  const absolutePath = path.join(repoRoot, entry.file);
  if (!fs.existsSync(absolutePath)) {
    return {
      ...entry,
      hits: [],
      skippedReason: `missing file: ${entry.file}`,
    };
  }
/**
 * 记录来源。
 */
  const source = fs.readFileSync(absolutePath, "utf8");
/**
 * 汇总输出行。
 */
  const lines = source.split(/\r?\n/);
/**
 * 记录hits。
 */
  const hits = [];
  for (let index = 0; index < lines.length; index += 1) {
/**
 * 记录line。
 */
    const line = lines[index];
    if (!line.includes(entry.pattern)) {
      continue;
    }
    if (Array.isArray(entry.include) && entry.include.length > 0 && !entry.include.some((token) => line.includes(token))) {
      continue;
    }
    if (Array.isArray(entry.exclude) && entry.exclude.some((token) => line.includes(token))) {
      continue;
    }
    hits.push({
      line: index + 1,
      excerpt: line.trim(),
    });
  }
  return {
    ...entry,
    hits,
    skippedReason: null,
  };
}

/**
 * 构建汇总。
 */
function buildSummary(results) {
/**
 * 记录categories。
 */
  const categories = CATEGORY_ORDER.map((name) => {
/**
 * 记录checks。
 */
    const checks = results.filter((entry) => entry.category === name);
/**
 * 记录matched。
 */
    const matched = checks.filter((entry) => entry.hits.length > 0);
    return {
      name,
      checks: checks.length,
      matchedChecks: matched.length,
      totalHits: matched.reduce((sum, entry) => sum + entry.hits.length, 0),
    };
  }).filter((entry) => entry.checks > 0);
  return {
    generatedAt: new Date().toISOString().slice(0, 10),
    totalChecks: results.length,
    matchedChecks: results.filter((entry) => entry.hits.length > 0).length,
    skippedChecks: results.filter((entry) => typeof entry.skippedReason === "string" && entry.skippedReason.length > 0).length,
    totalHits: results.reduce((sum, entry) => sum + entry.hits.length, 0),
    categories,
  };
}

/**
 * 处理rendermarkdown。
 */
function renderMarkdown(summary, results) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 汇总输出行。
 */
  const lines = [];
  lines.push("# server-next 剩余 legacy 边界自动审计");
  lines.push("");
  lines.push(`更新时间：${summary.generatedAt}`);
  lines.push("");
  lines.push("## 一句话结论");
  lines.push("");
  lines.push("- 这份报告只统计仓库里仍可见的 direct legacy 边界与性能热点，不等于 replace-ready 失败，也不代表完整替换已完成。");
  lines.push(`- 当前自动审计命中 ${summary.matchedChecks} / ${summary.totalChecks} 个检查项，共 ${summary.totalHits} 处代码证据。`);
  if (summary.skippedChecks > 0) {
    lines.push(`- 另有 ${summary.skippedChecks} 个检查项因 inventory 文件路径漂移被 fail-soft 跳过，不影响其余检查继续产出。`);
  }
  lines.push("- 保守口径不变：`next` 离“完整替换游戏整体”仍约差 `40% - 45%`。");
  lines.push("");
  lines.push("## 汇总");
  lines.push("");
  lines.push("| 类别 | 命中检查项 | 代码证据 |");
  lines.push("| --- | ---: | ---: |");
  for (const category of summary.categories) {
    lines.push(`| ${category.name} | ${category.matchedChecks} / ${category.checks} | ${category.totalHits} |`);
  }
  for (const categoryName of CATEGORY_ORDER) {
/**
 * 记录类别checks。
 */
    const categoryChecks = results.filter((entry) => entry.category === categoryName && entry.hits.length > 0);
    if (categoryChecks.length === 0) {
      continue;
    }
    lines.push("");
    lines.push(`## ${categoryName}`);
    lines.push("");
    for (const entry of categoryChecks) {
/**
 * 记录firsthit。
 */
      const firstHit = entry.hits[0];
      lines.push(`- ${entry.description}`);
      lines.push(`  - 文件：\`${entry.file}:${firstHit.line}\``);
      lines.push(`  - 命中次数：${entry.hits.length}`);
      lines.push(`  - 首个证据：\`${escapeBackticks(firstHit.excerpt)}\``);
    }
  }
/**
 * 记录跳过项。
 */
  const skippedChecks = results.filter((entry) => typeof entry.skippedReason === "string" && entry.skippedReason.length > 0);
  if (skippedChecks.length > 0) {
    lines.push("");
    lines.push("## 已跳过项");
    lines.push("");
    for (const entry of skippedChecks) {
      lines.push(`- ${entry.description}`);
      lines.push(`  - 文件：\`${entry.file}\``);
      lines.push(`  - 原因：${entry.skippedReason}`);
    }
  }
  lines.push("");
  lines.push("## 备注");
  lines.push("");
  lines.push("- 运行命令：`pnpm audit:server-next-boundaries` 或 `pnpm --filter @mud/server-next audit:legacy-boundaries`。");
  lines.push("- 报告由 `packages/server/src/tools/audit/next-legacy-boundary-audit.ts` 自动生成。");
  lines.push("- 这份审计的定位是 inventory，不是 replace-ready 验收，也不会替代 `pnpm verify:replace-ready`、`with-db`、`shadow` 或协议审计。");
  lines.push("- 清单里若仍残留已迁移路径，脚本现在会 fail-soft 跳过并把原因写进报告，而不是直接中断。");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

/**
 * 规整backticks。
 */
function escapeBackticks(value) {
  return String(value).replace(/`/g, "\\`");
}

main();
