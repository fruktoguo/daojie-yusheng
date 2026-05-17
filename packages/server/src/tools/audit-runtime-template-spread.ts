/**
 * 审计运行时/网络/持久化路径下「直接 spread / Object.assign / structuredClone 模板对象」的违规点。
 *
 * 触发条件：源代码命中下列模式且变量名暗示是模板（template / Def / Ref / Registry.getRef / Catalog 等）。
 * 主要目的是防止"统一对象管理器改造"完成之后，再有人随手 spread 模板字段。
 *
 * 例外通过 `packages/server/src/tools/audit-runtime-template-spread.allowlist.json` 显式放行：
 *   每条必须包含 `file`、`line`、`reason`，且 `reason` 不能为空字符串。
 *   超过 30 条例外即视为重构未完成。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

interface Violation {
  file: string;
  line: number;
  pattern: string;
  excerpt: string;
}

interface AllowlistEntry {
  file: string;
  line: number;
  pattern: string;
  reason: string;
}

interface ScanRule {
  id: string;
  // 出现 template-like 变量名（大小写不敏感）+ 命中关键词时报警。
  regex: RegExp;
  description: string;
}

const TEMPLATE_NAME_HINT_TOKEN = '(?:[A-Za-z0-9_]*(?:Template|TemplateRef|Def|DefRef|Catalog|Prototype|Schema|Manifest))';

const SCAN_RULES: ScanRule[] = [
  {
    id: 'spread-template-literal',
    description: '对象字面量中直接 spread 模板：{ ...xxxTemplate }',
    regex: new RegExp(`\\{\\s*\\.\\.\\.\\s*${TEMPLATE_NAME_HINT_TOKEN}\\s*[,}]`),
  },
  {
    id: 'object-assign-template',
    description: 'Object.assign({}, xxxTemplate, ...)',
    regex: new RegExp(`Object\\.assign\\s*\\(\\s*\\{\\s*\\}\\s*,\\s*${TEMPLATE_NAME_HINT_TOKEN}`),
  },
  {
    id: 'json-parse-stringify-template',
    description: 'JSON.parse(JSON.stringify(xxxTemplate))',
    regex: new RegExp(`JSON\\.parse\\s*\\(\\s*JSON\\.stringify\\s*\\(\\s*${TEMPLATE_NAME_HINT_TOKEN}\\s*\\)\\s*\\)`),
  },
  {
    id: 'structured-clone-template',
    description: 'structuredClone(xxxTemplate)',
    regex: new RegExp(`structuredClone\\s*\\(\\s*${TEMPLATE_NAME_HINT_TOKEN}\\s*\\)`),
  },
  {
    id: 'spread-registry-getref',
    description: '直接 spread `xxxRegistry.getRef(...)` 返回值',
    regex: /\{\s*\.\.\.\s*[A-Za-z0-9_]*Registry\.(?:getRef|tryGetRef)\s*\(/,
  },
];

const SCAN_DIRS = [
  'packages/server/src/runtime',
  'packages/server/src/network',
  'packages/server/src/persistence',
];

const ALLOWLIST_FILE = 'packages/server/src/tools/audit-runtime-template-spread.allowlist.json';
const MAX_ALLOWLIST_ENTRIES = 30;

function repoRoot(): string {
  return path.resolve(__dirname, '..', '..', '..', '..');
}

function readAllowlist(): AllowlistEntry[] {
  const filePath = path.join(repoRoot(), ALLOWLIST_FILE);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  if (!Array.isArray(raw)) {
    throw new Error(`allowlist 必须是数组：${ALLOWLIST_FILE}`);
  }
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`allowlist 含非对象条目：${ALLOWLIST_FILE}`);
    }
    if (typeof entry.file !== 'string' || !entry.file.trim()) {
      throw new Error(`allowlist 条目缺少 file：${JSON.stringify(entry)}`);
    }
    if (!Number.isInteger(entry.line) || entry.line <= 0) {
      throw new Error(`allowlist 条目缺少 line：${JSON.stringify(entry)}`);
    }
    if (typeof entry.pattern !== 'string' || !entry.pattern.trim()) {
      throw new Error(`allowlist 条目缺少 pattern：${JSON.stringify(entry)}`);
    }
    if (typeof entry.reason !== 'string' || !entry.reason.trim()) {
      throw new Error(`allowlist 条目缺少 reason：${JSON.stringify(entry)}`);
    }
  }
  if (raw.length > MAX_ALLOWLIST_ENTRIES) {
    throw new Error(
      `allowlist 例外条数 ${raw.length} > ${MAX_ALLOWLIST_ENTRIES}，视为重构未完成：${ALLOWLIST_FILE}`,
    );
  }
  return raw as AllowlistEntry[];
}

function isAllowed(violation: Violation, allowlist: AllowlistEntry[]): boolean {
  return allowlist.some((entry) => entry.file === violation.file
    && entry.line === violation.line
    && entry.pattern === violation.pattern);
}

function collectTsFiles(root: string): string[] {
  const result: string[] = [];
  if (!fs.existsSync(root)) {
    return result;
  }
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectTsFiles(full));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (!entry.name.endsWith('.ts')) {
      continue;
    }
    if (entry.name.endsWith('.d.ts')) {
      continue;
    }
    if (entry.name.endsWith('.spec.ts') || entry.name.endsWith('.test.ts')) {
      continue;
    }
    result.push(full);
  }
  return result;
}

function scanFile(filePath: string, repoRel: string): Violation[] {
  const violations: Violation[] = [];
  const source = fs.readFileSync(filePath, 'utf-8');
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trim().startsWith('//') || line.trim().startsWith('*')) {
      continue;
    }
    for (const rule of SCAN_RULES) {
      if (rule.regex.test(line)) {
        violations.push({
          file: repoRel,
          line: index + 1,
          pattern: rule.id,
          excerpt: line.trim().slice(0, 200),
        });
      }
    }
  }
  return violations;
}

function main(): void {
  const root = repoRoot();
  const allowlist = readAllowlist();
  const violations: Violation[] = [];
  for (const dir of SCAN_DIRS) {
    const absDir = path.join(root, dir);
    for (const file of collectTsFiles(absDir)) {
      const repoRel = path.relative(root, file).replace(/\\/g, '/');
      violations.push(...scanFile(file, repoRel));
    }
  }
  const reportable = violations.filter((violation) => !isAllowed(violation, allowlist));
  if (reportable.length === 0) {
    process.stdout.write(`audit-runtime-template-spread: 0 violations (allowlisted=${allowlist.length})\n`);
    process.exit(0);
  }
  process.stderr.write(`audit-runtime-template-spread: ${reportable.length} 处违规（allowlisted=${allowlist.length}）：\n`);
  for (const violation of reportable) {
    process.stderr.write(`  ${violation.file}:${violation.line} [${violation.pattern}] ${violation.excerpt}\n`);
  }
  process.exit(1);
}

main();
