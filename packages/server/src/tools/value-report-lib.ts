/**
 * 价值报表核心库：读取内容数据、计算装备/功法/技能/Buff 的量化价值、渲染 Markdown 表格
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  calculateTechniqueSkillQiCost,
  EquipmentEffectDef,
  ItemStack,
  TECHNIQUE_GRADE_LABELS,
  calculateBuffValue,
  compileValueStatsToActualStats,
  calculateEquipmentValue,
  calculateSkillValue,
  calculateTechniqueValue,
  resolveSkillUnlockLevel,
  SkillBuffEffectDef,
  SkillDef,
  SkillFormula,
  SkillFormulaVar,
  TechniqueGrade,
  TechniqueLayerDef,
} from '@mud/shared';

type RawTechnique = {
  id: string;
  name: string;
  grade: TechniqueGrade;
  realmLv: number;
  layers: TechniqueLayerDef[];
  skills: Array<Omit<SkillDef, 'cost'> & { cost?: number; costMultiplier?: number }>;
};

type RawEquipment = {
  itemId: string;
  name: string;
  type: string;
  grade?: TechniqueGrade;
  level?: number;
  desc: string;
  equipSlot?: string;
  equipAttrs?: ItemStack['equipAttrs'];
  equipStats?: ItemStack['equipStats'];
  equipValueStats?: ItemStack['equipStats'];
  effects?: unknown;
};

type RawMap = {
  dangerLevel?: number;
};

/** 价值报表单行数据 */
export interface ValueReportRow {
  name: string;
  grade: string;
  level: string;
  baseQuantifiedValue?: string;
  range?: string;
  damageTargets?: string;
  cooldown?: string;
  cost?: string;
  quantifiedValue: string;
  unquantifiedValue: string;
}

function getContentRoot(): string {
  return path.join(process.cwd(), 'data', 'content');
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

function readJsonEntries<T>(dirPath: string): T[] {
  const entries: T[] = [];
  for (const filePath of collectJsonFiles(dirPath)) {
    entries.push(...readJsonFile<T[]>(filePath));
  }
  return entries;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectJsonFiles(dirPath: string): string[] {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
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

function walkForItemIds(value: unknown, found: Set<string>): void {
  if (!value || typeof value !== 'object') {
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      walkForItemIds(entry, found);
    }
    return;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.itemId === 'string') {
    found.add(record.itemId);
  }
  for (const entry of Object.values(record)) {
    walkForItemIds(entry, found);
  }
}

/** 读取所有功法模板 */
export function readTechniques(): RawTechnique[] {
  return readJsonEntries<RawTechnique>(path.join(getContentRoot(), 'techniques'));
}

/** 读取所有装备类物品 */
export function readEquipmentItems(): RawEquipment[] {
  return readJsonEntries<RawEquipment>(path.join(getContentRoot(), 'items'))
    .filter((entry) => entry.type === 'equipment');
}

function compileEquipmentEffectsForReport(input: unknown): EquipmentEffectDef[] | undefined {
  if (!Array.isArray(input)) {
    return undefined;
  }

  const effects: EquipmentEffectDef[] = [];
  for (const entry of input) {
    if (!isPlainObject(entry) || typeof entry.type !== 'string') {
      continue;
    }

    if (entry.type === 'stat_aura' || entry.type === 'progress_boost') {
      effects.push({
        ...entry,
        type: entry.type as 'stat_aura' | 'progress_boost',
        stats: compileValueStatsToActualStats(entry.valueStats as ItemStack['equipStats']) ?? entry.stats as ItemStack['equipStats'] | undefined,
      } as EquipmentEffectDef);
      continue;
    }

    if (entry.type === 'timed_buff' && isPlainObject(entry.buff)) {
      effects.push({
        ...entry,
        type: 'timed_buff',
        buff: {
          ...entry.buff,
          stats: compileValueStatsToActualStats(entry.buff.valueStats as ItemStack['equipStats']) ?? entry.buff.stats as ItemStack['equipStats'] | undefined,
        },
      } as EquipmentEffectDef);
      continue;
    }

    if (entry.type === 'periodic_cost') {
      effects.push({ ...entry, type: 'periodic_cost' } as EquipmentEffectDef);
      continue;
    }
  }

  return effects.length > 0 ? effects : undefined;
}

function formatTechniqueGrade(grade: TechniqueGrade): string {
  return TECHNIQUE_GRADE_LABELS[grade] ?? grade;
}

function mapDangerToEquipmentGrade(dangerLevel: number): string {
  const mapping: Record<number, string> = {
    1: '凡阶',
    2: '黄阶',
    3: '玄阶',
    4: '地阶',
    5: '天阶',
  };
  return mapping[dangerLevel] ?? '未定';
}

function buildEquipmentMapDangerIndex(): Map<string, number> {
  const mapsDir = path.join(process.cwd(), 'data', 'maps');
  const index = new Map<string, number>();
  for (const file of fs.readdirSync(mapsDir).filter((entry) => entry.endsWith('.json')).sort()) {
    if (file === 'spawn.json' || file === 'yunlai_town.json') {
      continue;
    }
    let map: RawMap & Record<string, unknown>;
    try {
      map = readJsonFile<RawMap & Record<string, unknown>>(path.join(mapsDir, file));
    } catch {
      continue;
    }
    const found = new Set<string>();
    walkForItemIds(map, found);
    const dangerLevel = Number.isFinite(map.dangerLevel) ? Number(map.dangerLevel) : 0;
    for (const itemId of found) {
      if (!itemId.startsWith('equip.')) {
        continue;
      }
      const previous = index.get(itemId);
      if (previous === undefined || (dangerLevel > 0 && dangerLevel < previous)) {
        index.set(itemId, dangerLevel);
      }
    }
  }
  return index;
}

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

function formatSignedNumber(value: number): string {
  if (value > 0) return `+${formatNumber(value)}`;
  return formatNumber(value);
}

function formatPercent(scale: number): string {
  return `${formatNumber(scale * 100)}%`;
}

function joinUnquantified(parts: string[]): string {
  const unique = [...new Set(parts.map((entry) => entry.trim()).filter((entry) => entry.length > 0))];
  return unique.length > 0 ? unique.join('；') : '-';
}

function describeSkillBuffEffect(effect: SkillBuffEffectDef): string {
  const summary = calculateBuffValue(effect);
  const category = effect.category ?? (effect.target === 'self' ? 'buff' : 'debuff');
  const categoryLabel = category === 'debuff' ? '减益' : '增益';
  const stackText = effect.maxStacks && effect.maxStacks > 1 ? `，最多${effect.maxStacks}层` : '';
  return `${categoryLabel} ${effect.name}(${formatSignedNumber(summary.quantifiedValue)}，持续${effect.duration}息${stackText})`;
}

function buildSkillMetaParts(skill: SkillDef): string[] {
  const parts: string[] = [];
  for (const effect of skill.effects) {
    if (effect.type !== 'buff') continue;
    parts.push(describeSkillBuffEffect(effect));
  }
  return parts;
}

function parseBuffStackVariable(variable: SkillFormulaVar): { side: 'caster' | 'target'; buffId: string } | null {
  if (!variable.endsWith('.stacks')) {
    return null;
  }
  const matched = variable.match(/^(caster|target)\.buff\.(.+)\.stacks$/);
  if (!matched) {
    return null;
  }
  return {
    side: matched[1] as 'caster' | 'target',
    buffId: matched[2],
  };
}

function collectBuffStackLinks(formula: SkillFormula, found: Array<{ side: 'caster' | 'target'; buffId: string; scale: number }>): void {
  if (typeof formula === 'number') {
    return;
  }
  if ('var' in formula) {
    const parsed = parseBuffStackVariable(formula.var);
    if (parsed) {
      found.push({
        ...parsed,
        scale: formula.scale ?? 1,
      });
    }
    return;
  }
  if (formula.op === 'clamp') {
    collectBuffStackLinks(formula.value, found);
    if (formula.min !== undefined) {
      collectBuffStackLinks(formula.min, found);
    }
    if (formula.max !== undefined) {
      collectBuffStackLinks(formula.max, found);
    }
    return;
  }
  for (const arg of formula.args) {
    collectBuffStackLinks(arg, found);
  }
}

function buildTechniqueBuffNameMap(skills: Array<Pick<SkillDef, 'effects'>>): Map<string, string> {
  const buffNames = new Map<string, string>();
  for (const skill of skills) {
    for (const effect of skill.effects) {
      if (effect.type !== 'buff') {
        continue;
      }
      buffNames.set(effect.buffId, effect.name);
    }
  }
  return buffNames;
}

function buildSkillComboParts(technique: RawTechnique, skill: SkillDef): string[] {
  const links: Array<{ side: 'caster' | 'target'; buffId: string; scale: number }> = [];
  for (const effect of skill.effects) {
    if (effect.type !== 'damage') {
      continue;
    }
    collectBuffStackLinks(effect.formula, links);
  }

  if (links.length === 0) {
    return [];
  }

  const buffNames = buildTechniqueBuffNameMap(technique.skills);
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const link of links) {
    const sideLabel = link.side === 'caster' ? '自身' : '目标';
    const buffName = buffNames.get(link.buffId) ?? '状态';
    const key = `${link.side}:${link.buffId}:${link.scale}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    parts.push(`连携 ${sideLabel}${buffName}层数×${formatPercent(link.scale)}`);
  }
  return parts;
}

function resolveSkillDamageTargets(skill: SkillDef): string {
  const hasDamageEffect = skill.effects.some((effect) => effect.type === 'damage');
  if (!hasDamageEffect) {
    return '-';
  }
  if (typeof skill.targeting?.maxTargets === 'number' && skill.targeting.maxTargets > 0) {
    return String(skill.targeting.maxTargets);
  }
  return '1';
}

/** 构建装备价值报表行 */
export function buildEquipmentRows(): ValueReportRow[] {
  const dangerIndex = buildEquipmentMapDangerIndex();
  return readEquipmentItems().map((item) => {
    const summary = calculateEquipmentValue({
      ...item,
      equipStats: item.equipStats ?? compileValueStatsToActualStats(item.equipValueStats),
      equipValueStats: item.equipValueStats,
      effects: compileEquipmentEffectsForReport(item.effects),
    });
    const dangerLevel = dangerIndex.get(item.itemId);
    const grade = item.grade
      ? formatTechniqueGrade(item.grade)
      : typeof dangerLevel === 'number' && dangerLevel > 0
        ? mapDangerToEquipmentGrade(dangerLevel)
        : '未定';
    const level = Number.isFinite(item.level)
      ? String(item.level)
      : typeof dangerLevel === 'number' && dangerLevel > 0
        ? String(dangerLevel)
        : '-';
    return {
      name: item.name,
      grade,
      level,
      baseQuantifiedValue: formatNumber(summary.baseQuantifiedValue),
      quantifiedValue: formatNumber(summary.actualQuantifiedValue),
      unquantifiedValue: joinUnquantified(summary.unquantified),
    };
  });
}

/** 构建功法价值报表行 */
export function buildTechniqueRows(): ValueReportRow[] {
  return readTechniques().map((technique) => {
    const maxLevel = technique.layers[technique.layers.length - 1]?.level ?? 1;
    const summary = calculateTechniqueValue({
      level: maxLevel,
      layers: technique.layers,
    });
    return {
      name: technique.name,
      grade: formatTechniqueGrade(technique.grade),
      level: String(maxLevel),
      quantifiedValue: formatNumber(summary.quantifiedValue),
      unquantifiedValue: joinUnquantified(summary.unquantified),
    };
  });
}

/** 构建技能价值报表行 */
export function buildSkillRows(): ValueReportRow[] {
  return readTechniques().flatMap((technique) => technique.skills.map((skill) => {
    const actualCost = calculateTechniqueSkillQiCost(
      Number.isFinite(skill.costMultiplier) ? Number(skill.costMultiplier) : Math.max(0, skill.cost ?? 0),
      technique.grade,
      technique.realmLv,
    );
    const normalizedSkill: SkillDef = {
      ...skill,
      cost: actualCost,
    };
    const summary = calculateSkillValue(normalizedSkill);
    const metaParts = buildSkillMetaParts(normalizedSkill);
    const comboParts = buildSkillComboParts(technique, normalizedSkill);
    const rawDetailParts = summary.unquantified.length > 0 ? summary.unquantified : [skill.desc];
    const detailParts = rawDetailParts.filter((entry) => entry !== '基础值 1' && !/^(自身|目标)对应状态层数×/.test(entry));
    return {
      name: skill.name,
      grade: formatTechniqueGrade(technique.grade),
      level: String(resolveSkillUnlockLevel(skill)),
      range: String(skill.range),
      damageTargets: resolveSkillDamageTargets(normalizedSkill),
      cooldown: String(skill.cooldown),
      cost: String(actualCost),
      quantifiedValue: formatNumber(summary.quantifiedValue),
      unquantifiedValue: joinUnquantified([...metaParts, ...comboParts, ...detailParts]),
    };
  }));
}

/** 构建 Buff 价值报表行 */
export function buildBuffRows(): ValueReportRow[] {
  return readTechniques().flatMap((technique) => technique.skills.flatMap((skill) => skill.effects
    .filter((effect): effect is SkillBuffEffectDef => effect.type === 'buff')
    .map((effect) => {
      const summary = calculateBuffValue(effect);
      return {
        name: `${effect.name}(${skill.name})`,
        grade: formatTechniqueGrade(technique.grade),
        level: String(resolveSkillUnlockLevel(skill)),
        quantifiedValue: formatNumber(summary.quantifiedValue),
        unquantifiedValue: joinUnquantified(summary.unquantified),
      };
    })));
}

/** 将报表行渲染为 Markdown 表格 */
export function renderMarkdownTable(title: string, rows: ValueReportRow[]): string {
  const sortedRows = [...rows].sort((left, right) => {
    const leftValue = Number(left.quantifiedValue) || 0;
    const rightValue = Number(right.quantifiedValue) || 0;
    if (rightValue !== leftValue) {
      return rightValue - leftValue;
    }
    return left.name.localeCompare(right.name, 'zh-Hans-CN');
  });

  const lines = [
    `## ${title}`,
    '',
    ...(title === '技能价值报表'
      ? [
          '| 名字 | 品阶 | 等级 | 释放距离 | 伤害数量 | CD | 消耗 | 量化价值 | 无法量化价值 |',
          '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
          ...sortedRows.map((row) => `| ${escapeCell(row.name)} | ${escapeCell(row.grade)} | ${escapeCell(row.level)} | ${escapeCell(row.range ?? '-')} | ${escapeCell(row.damageTargets ?? '-')} | ${escapeCell(row.cooldown ?? '-')} | ${escapeCell(row.cost ?? '-')} | ${escapeCell(row.quantifiedValue)} | ${escapeCell(row.unquantifiedValue)} |`),
        ]
      : title === '装备价值报表'
        ? [
            '| 名字 | 品阶 | 等级 | 实际价值 | 基准价值 | 无法量化特效 |',
            '| --- | --- | --- | --- | --- | --- |',
            ...sortedRows.map((row) => `| ${escapeCell(row.name)} | ${escapeCell(row.grade)} | ${escapeCell(row.level)} | ${escapeCell(row.quantifiedValue)} | ${escapeCell(row.baseQuantifiedValue ?? '-')} | ${escapeCell(row.unquantifiedValue)} |`),
          ]
      : [
          '| 名字 | 品阶 | 等级 | 量化价值 | 无法量化价值 |',
          '| --- | --- | --- | --- | --- |',
          ...sortedRows.map((row) => `| ${escapeCell(row.name)} | ${escapeCell(row.grade)} | ${escapeCell(row.level)} | ${escapeCell(row.quantifiedValue)} | ${escapeCell(row.unquantifiedValue)} |`),
        ]),
    '',
  ];
  return lines.join('\n');
}
