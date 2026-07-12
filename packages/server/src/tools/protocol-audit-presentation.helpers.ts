/**
 * 协议审计的人类可读名称与 Markdown 报告投影。
 */

type AnyRecord = Record<string, any>;

function normalizeDisplayNameText(value: unknown): string {
  return typeof value === 'string' ? value.trim().normalize('NFC') : '';
}

function isPlayerIdLikeDisplayText(value: unknown): boolean {
  const normalized = normalizeDisplayNameText(value);
  return /^p_[0-9a-f-]+(?:_\d+)?$/i.test(normalized) || /^player[:_-]/i.test(normalized);
}

export function resolveAuditPlayerDisplayName(source: AnyRecord | null | undefined, playerId: unknown): string {
  const normalizedPlayerId = normalizeDisplayNameText(playerId)
    || normalizeDisplayNameText(source?.playerId)
    || normalizeDisplayNameText(source?.id);
  const candidates = [
    source?.playerName,
    source?.roleName,
    source?.pendingRoleName,
    source?.name,
    source?.displayName,
    source?.username,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeDisplayNameText(candidate);
    if (normalized && normalized !== normalizedPlayerId && !isPlayerIdLikeDisplayText(normalized)) {
      return normalized;
    }
  }
  return '未知玩家';
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(2)} KB`;
}

export function renderProtocolAuditReport(report: AnyRecord): string {
  const lines = [
    '# 协议审计报告',
    '',
    `- 生成时间: ${report.generatedAt}`,
    `- 目标服务: ${report.baseUrl}`,
    `- 运行模式: ${report.serverMode}`,
    '- 统计口径: 应用层 payload bytes；对象载荷按 `JSON.stringify(payload)` 的 UTF-8 字节数计算，二进制载荷按 `byteLength` 计算；流量明细按单个包体逐条记录，不做事件级合并。',
    '- 覆盖基线: 以 `server` 当前已声明并实际接线的主线 socket 事件面为准；仍依赖 legacy 的归档兼容流量不计入这份审计。',
    '',
    '## 用例结果',
    '',
    '| 用例 | 时长(ms) | C2S 观测 | S2C 观测 |',
    '| --- | ---: | --- | --- |',
  ];
  report.caseResults.forEach((entry) => {
    lines.push(`| ${entry.name} | ${entry.durationMs} | ${entry.c2s.join('<br>') || '-'} | ${entry.s2c.join('<br>') || '-'} |`);
  });
  lines.push('', '## 客户端到服务端覆盖', '', '| 事件名 | Wire Event | 已覆盖 | 次数 | 总流量 | 平均流量 | 用例 |', '| --- | --- | --- | ---: | ---: | ---: | --- |');
  report.c2sRows.forEach((row) => {
    lines.push(`| ${row.eventName} | \`${row.event}\` | ${row.covered ? '是' : '否'} | ${row.count} | ${formatBytes(row.totalBytes)} | ${formatBytes(row.averageBytes)} | ${row.caseNames.join('<br>') || '-'} |`);
  });
  lines.push('', '## 服务端到客户端覆盖', '', '| 事件名 | Wire Event | 已覆盖 | 次数 | 总流量 | 平均流量 | 用例 |', '| --- | --- | --- | ---: | ---: | ---: | --- |');
  report.s2cRows.forEach((row) => {
    lines.push(`| ${row.eventName} | \`${row.event}\` | ${row.covered ? '是' : '否'} | ${row.count} | ${formatBytes(row.totalBytes)} | ${formatBytes(row.averageBytes)} | ${row.caseNames.join('<br>') || '-'} |`);
  });
  lines.push('', '## 流量明细', '', '| 序号 | 方向 | 事件名 | Wire Event | 包体大小 | 用例 | Socket |', '| ---: | --- | --- | --- | ---: | --- | --- |');
  report.trafficRows.forEach((row) => {
    lines.push(`| ${row.index} | ${row.direction} | ${row.eventName} | \`${row.event}\` | ${formatBytes(row.bytes)} | ${row.caseName || '-'} | ${row.socketLabel || '-'} |`);
  });
  lines.push('', '## 未覆盖项', '');
  if (report.missing.length === 0) {
    lines.push('- 无。');
  } else {
    report.missing.forEach((entry) => {
      lines.push(`- ${entry.direction}.${entry.eventName}: \`${entry.event}\``);
    });
  }
  lines.push('', '## 备注', '', '- 报告由 `packages/server/src/tools/protocol-audit.ts` 自动生成。', '- 本次审计主要是黑盒协议回归，不覆盖浏览器 UI、深色模式、手机布局。', '');
  return lines.join('\n');
}
