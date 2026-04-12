/**
 * CLI 工具：统计功法满层累计六维，并导出到 docs/量化分析/功法六维总属性统计.md
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  AttrKey,
  ATTR_KEYS,
  calcTechniqueAttrValues,
  calcTechniqueFinalAttrBonus,
  getTechniqueMaxLevel,
  TechniqueCategory,
  TechniqueGrade,
  TechniqueState,
  TechniqueAttrCurves,
  TechniqueLayerDef,
} from '@mud/shared';

/** RawTechnique：定义该类型的结构与数据语义。 */
type RawTechnique = {
/** id：定义该变量以承载业务值。 */
  id: string;
/** name：定义该变量以承载业务值。 */
  name: string;
  grade?: TechniqueGrade;
  category?: TechniqueCategory;
  realmLv?: number;
  layers?: TechniqueLayerDef[];
  attrCurves?: TechniqueAttrCurves;
};

/** TechniqueRecord：定义该类型的结构与数据语义。 */
type TechniqueRecord = RawTechnique & {
/** sourceFile：定义该变量以承载业务值。 */
  sourceFile: string;
/** realmFolder：定义该变量以承载业务值。 */
  realmFolder: string;
/** categoryFolder：定义该变量以承载业务值。 */
  categoryFolder: string;
};

/** ATTR_LABELS：定义该变量以承载业务值。 */
const ATTR_LABELS: Record<AttrKey, string> = {
  constitution: '体魄',
  spirit: '神识',
  perception: '身法',
  talent: '根骨',
  comprehension: '悟性',
  luck: '气运',
};

/** createZeroTotals：执行对应的业务逻辑。 */
function createZeroTotals(): Record<AttrKey, number> {
  return {
    constitution: 0,
    spirit: 0,
    perception: 0,
    talent: 0,
    comprehension: 0,
    luck: 0,
  };
}

/** collectJsonFiles：执行对应的业务逻辑。 */
function collectJsonFiles(dirPath: string): string[] {
/** entries：定义该变量以承载业务值。 */
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
/** files：定义该变量以承载业务值。 */
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsonFiles(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(entryPath);
    }
  }
  return files;
}

/** readTechniquesWithSource：执行对应的业务逻辑。 */
function readTechniquesWithSource(techniquesRoot: string): TechniqueRecord[] {
/** files：定义该变量以承载业务值。 */
  const files = collectJsonFiles(techniquesRoot);
/** result：定义该变量以承载业务值。 */
  const result: TechniqueRecord[] = [];
  for (const filePath of files) {
    const rel = path.relative(techniquesRoot, filePath);
    const parts = rel.split(path.sep);
/** realmFolder：定义该变量以承载业务值。 */
    const realmFolder = parts[0] ?? '未知境界';
/** categoryFolder：定义该变量以承载业务值。 */
    const categoryFolder = parts[1] ?? '未知分类';
/** parsed：定义该变量以承载业务值。 */
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
    if (!Array.isArray(parsed)) continue;
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const technique = entry as RawTechnique;
      if (typeof technique.id !== 'string' || typeof technique.name !== 'string') continue;
      result.push({
        ...technique,
        sourceFile: rel,
        realmFolder,
        categoryFolder,
      });
    }
  }
  return result;
}

/** calcTechniqueMaxAttrs：执行对应的业务逻辑。 */
function calcTechniqueMaxAttrs(technique: RawTechnique): Record<AttrKey, number> {
/** maxLevel：定义该变量以承载业务值。 */
  const maxLevel = getTechniqueMaxLevel(technique.layers, 1, technique.attrCurves);
/** attrs：定义该变量以承载业务值。 */
  const attrs = calcTechniqueAttrValues(maxLevel, technique.layers, technique.attrCurves);
/** totals：定义该变量以承载业务值。 */
  const totals = createZeroTotals();
  for (const key of ATTR_KEYS) {
    totals[key] = attrs[key] ?? 0;
  }
  return totals;
}

/** toTechniqueStateAtMaxLevel：执行对应的业务逻辑。 */
function toTechniqueStateAtMaxLevel(technique: TechniqueRecord): TechniqueState {
/** maxLevel：定义该变量以承载业务值。 */
  const maxLevel = getTechniqueMaxLevel(technique.layers, 1, technique.attrCurves);
  return {
    techId: technique.id,
    name: technique.name,
    grade: technique.grade ?? 'yellow',
    category: technique.category ?? 'internal',
    realmLv: technique.realmLv ?? 1,
    level: maxLevel,
    exp: 0,
    expToNext: 0,
    realm: 0,
    layers: technique.layers ?? [],
    attrCurves: technique.attrCurves ?? {},
    skills: [],
    skillsEnabled: true,
  };
}

/** accumulate：执行对应的业务逻辑。 */
function accumulate(target: Record<AttrKey, number>, source: Record<AttrKey, number>): void {
  for (const key of ATTR_KEYS) {
    target[key] += source[key];
  }
}

/** renderTotalsTable：执行对应的业务逻辑。 */
function renderTotalsTable(totals: Record<AttrKey, number>): string {
/** lines：定义该变量以承载业务值。 */
  const lines = ['| 六维 | 总值 |', '| --- | ---: |'];
  for (const key of ATTR_KEYS) {
    lines.push(`| ${ATTR_LABELS[key]} | ${totals[key]} |`);
  }
  return lines.join('\n');
}

/** calcFinalDecayedTotals：执行对应的业务逻辑。 */
function calcFinalDecayedTotals(techniques: TechniqueRecord[]): Record<AttrKey, number> {
/** states：定义该变量以承载业务值。 */
  const states = techniques.map(toTechniqueStateAtMaxLevel);
  return calcTechniqueFinalAttrBonus(states);
}

/** renderGroupTable：执行对应的业务逻辑。 */
function renderGroupTable(rows: Array<{ group: string; count: number; totals: Record<AttrKey, number> }>): string {
/** header：定义该变量以承载业务值。 */
  const header = [
    '| 组别 | 功法数 | 体魄 | 神识 | 身法 | 根骨 | 悟性 | 气运 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
/** body：定义该变量以承载业务值。 */
  const body = rows
    .sort((left, right) => left.group.localeCompare(right.group, 'zh-CN'))
    .map((row) => `| ${row.group} | ${row.count} | ${row.totals.constitution} | ${row.totals.spirit} | ${row.totals.perception} | ${row.totals.talent} | ${row.totals.comprehension} | ${row.totals.luck} |`);
  return [...header, ...body].join('\n');
}

/** buildGroupRows：执行对应的业务逻辑。 */
function buildGroupRows(
  techniques: TechniqueRecord[],
  groupBy: (technique: TechniqueRecord) => string,
): Array<{ group: string; count: number; totals: Record<AttrKey, number> }> {
/** map：定义该变量以承载业务值。 */
  const map = new Map<string, { count: number; totals: Record<AttrKey, number> }>();
  for (const technique of techniques) {
    const group = groupBy(technique);
    const row = map.get(group) ?? { count: 0, totals: createZeroTotals() };
    row.count += 1;
    accumulate(row.totals, calcTechniqueMaxAttrs(technique));
    map.set(group, row);
  }
  return [...map.entries()].map(([group, row]) => ({ group, count: row.count, totals: row.totals }));
}

/** formatNow：执行对应的业务逻辑。 */
function formatNow(): string {
/** now：定义该变量以承载业务值。 */
  const now = new Date();
/** date：定义该变量以承载业务值。 */
  const date = now.toISOString().slice(0, 10);
/** time：定义该变量以承载业务值。 */
  const time = now.toISOString().slice(11, 19);
  return `${date} ${time} UTC`;
}

/** generateReportMarkdown：执行对应的业务逻辑。 */
function generateReportMarkdown(techniques: TechniqueRecord[]): string {
/** playerTechniques：定义该变量以承载业务值。 */
  const playerTechniques = techniques.filter((entry) => !entry.id.startsWith('monster_'));
/** allTotals：定义该变量以承载业务值。 */
  const allTotals = createZeroTotals();
/** playerTotals：定义该变量以承载业务值。 */
  const playerTotals = createZeroTotals();
  for (const technique of techniques) {
    accumulate(allTotals, calcTechniqueMaxAttrs(technique));
  }
  for (const technique of playerTechniques) {
    accumulate(playerTotals, calcTechniqueMaxAttrs(technique));
  }
/** playerFinalTotals：定义该变量以承载业务值。 */
  const playerFinalTotals = calcFinalDecayedTotals(playerTechniques);
/** allFinalTotals：定义该变量以承载业务值。 */
  const allFinalTotals = calcFinalDecayedTotals(techniques);

/** byRealm：定义该变量以承载业务值。 */
  const byRealm = buildGroupRows(playerTechniques, (entry) => entry.realmFolder);
/** byCategory：定义该变量以承载业务值。 */
  const byCategory = buildGroupRows(playerTechniques, (entry) => entry.categoryFolder);
/** byGrade：定义该变量以承载业务值。 */
  const byGrade = buildGroupRows(playerTechniques, (entry) => entry.grade ?? '未知品阶');

  return [
    '# 功法六维总属性统计',
    '',
    `生成时间：${formatNow()}`,
    '',
    '## 统计口径',
    '',
    '- 数据源：`packages/server/data/content/techniques/**/*.json`',
    '- 计算方式：每门功法按“满层累计六维”统计（使用共享函数 `getTechniqueMaxLevel + calcTechniqueAttrValues`）',
    '- 默认主口径：排除 `monster_` 前缀功法（玩家可学功法）',
    '- 最终值口径：额外使用共享函数 `calcTechniqueFinalAttrBonus`，按当前品阶软衰减公式折算',
    '',
    `- 玩家功法数量：${playerTechniques.length}`,
    `- 全量功法数量（含怪物功法）：${techniques.length}`,
    '',
    '## 玩家功法六维总和',
    '',
    renderTotalsTable(playerTotals),
    '',
    '## 玩家功法六维最终值（按当前衰减公式）',
    '',
    renderTotalsTable(playerFinalTotals),
    '',
    '## 全量功法六维总和（含怪物功法）',
    '',
    renderTotalsTable(allTotals),
    '',
    '## 全量功法六维最终值（含怪物功法，按当前衰减公式）',
    '',
    renderTotalsTable(allFinalTotals),
    '',
    '## 玩家功法分境界目录统计',
    '',
    renderGroupTable(byRealm),
    '',
    '## 玩家功法分分类目录统计',
    '',
    renderGroupTable(byCategory),
    '',
    '## 玩家功法分品阶统计',
    '',
    renderGroupTable(byGrade),
    '',
  ].join('\n');
}

/** ensureReportLinkedInIndex：执行对应的业务逻辑。 */
function ensureReportLinkedInIndex(indexPath: string, reportFileName: string): void {
/** linkLine：定义该变量以承载业务值。 */
  const linkLine = `- [功法六维总属性统计](./${reportFileName})`;
/** current：定义该变量以承载业务值。 */
  const current = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf-8') : '';
  if (current.includes(linkLine)) return;
/** trimmed：定义该变量以承载业务值。 */
  const trimmed = current.trimEnd();
/** next：定义该变量以承载业务值。 */
  const next = trimmed.length > 0 ? `${trimmed}\n${linkLine}\n` : `# 量化分析\n\n${linkLine}\n`;
  fs.writeFileSync(indexPath, next, 'utf-8');
}

/** main：执行对应的业务逻辑。 */
function main(): void {
/** serverRoot：定义该变量以承载业务值。 */
  const serverRoot = process.cwd();
/** techniquesRoot：定义该变量以承载业务值。 */
  const techniquesRoot = path.join(serverRoot, 'data', 'content', 'techniques');
/** docsDir：定义该变量以承载业务值。 */
  const docsDir = path.join(serverRoot, '..', '..', 'docs', '量化分析');
/** reportFileName：定义该变量以承载业务值。 */
  const reportFileName = '功法六维总属性统计.md';
/** reportPath：定义该变量以承载业务值。 */
  const reportPath = path.join(docsDir, reportFileName);
/** indexPath：定义该变量以承载业务值。 */
  const indexPath = path.join(docsDir, 'README.md');

/** techniques：定义该变量以承载业务值。 */
  const techniques = readTechniquesWithSource(techniquesRoot);
/** markdown：定义该变量以承载业务值。 */
  const markdown = generateReportMarkdown(techniques);

  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(reportPath, `${markdown}\n`, 'utf-8');
  ensureReportLinkedInIndex(indexPath, reportFileName);

  process.stdout.write(`已生成：${reportPath}\n`);
}

main();

