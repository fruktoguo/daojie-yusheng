/**
 * 价值报表核心库：读取内容数据、计算装备/功法/技能/Buff 的量化价值、渲染 Markdown 表格
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  calculateAttrBonusValue,
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
  getTechniqueMaxLevel,
  TechniqueGrade,
  TechniqueLayerDef,
} from '@mud/shared';

/** RawTechnique：定义该类型的结构与数据语义。 */
type RawTechnique = {
/** id：定义该变量以承载业务值。 */
  id: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** grade：定义该变量以承载业务值。 */
  grade: TechniqueGrade;
/** realmLv：定义该变量以承载业务值。 */
  realmLv: number;
/** layers：定义该变量以承载业务值。 */
  layers: TechniqueLayerDef[];
/** skills：定义该变量以承载业务值。 */
  skills: Array<Omit<SkillDef, 'cost'> & { cost?: number; costMultiplier?: number }>;
};

/** RawEquipment：定义该类型的结构与数据语义。 */
type RawEquipment = {
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** type：定义该变量以承载业务值。 */
  type: string;
  grade?: TechniqueGrade;
  level?: number;
/** desc：定义该变量以承载业务值。 */
  desc: string;
  equipSlot?: string;
  equipAttrs?: ItemStack['equipAttrs'];
  equipStats?: ItemStack['equipStats'];
  equipValueStats?: ItemStack['equipStats'];
  effects?: unknown;
};

/** RawMap：定义该类型的结构与数据语义。 */
type RawMap = {
  dangerLevel?: number;
};

/** RealmLevelEntry：定义该类型的结构与数据语义。 */
type RealmLevelEntry = {
/** realmLv：定义该变量以承载业务值。 */
  realmLv: number;
  displayName?: string | null;
  name?: string | null;
};

/** RealmLevelsConfig：定义该类型的结构与数据语义。 */
type RealmLevelsConfig = {
  levels?: RealmLevelEntry[];
};

/** 价值报表单行数据 */
export interface ValueReportRow {
/** name：定义该变量以承载业务值。 */
  name: string;
/** grade：定义该变量以承载业务值。 */
  grade: string;
  realm?: string;
/** level：定义该变量以承载业务值。 */
  level: string;
  baseQuantifiedValue?: string;
  range?: string;
  damageTargets?: string;
  cooldown?: string;
  cost?: string;
/** quantifiedValue：定义该变量以承载业务值。 */
  quantifiedValue: string;
/** unquantifiedValue：定义该变量以承载业务值。 */
  unquantifiedValue: string;
}

/**
 * 记录json文件cache。
 */
const jsonFileCache = new Map<string, unknown>();
/**
 * 记录jsonentriescache。
 */
const jsonEntriesCache = new Map<string, unknown[]>();
/**
 * 记录compiledequipmenteffectscache。
 */
const compiledEquipmentEffectsCache = new WeakMap<object, EquipmentEffectDef[] | undefined>();

/**
 * 记录techniquescache。
 */
let techniquesCache: RawTechnique[] | null = null;
/**
 * 记录equipmentitemscache。
 */
let equipmentItemsCache: RawEquipment[] | null = null;
/**
 * 记录equipment地图危险度索引cache。
 */
let equipmentMapDangerIndexCache: Map<string, number> | null = null;

/**
 * 获取content根目录。
 */
function getContentRoot(): string {
  return path.join(process.cwd(), 'data', 'content');
}

/**
 * 读取json文件。
 */
function readJsonFile<T>(filePath: string): T {
/**
 * 记录cached。
 */
  const cached = jsonFileCache.get(filePath);
  if (cached !== undefined) {
    return cached as T;
  }
/**
 * 记录parsed。
 */
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  jsonFileCache.set(filePath, parsed);
  return parsed;
}

/**
 * 读取jsonentries。
 */
function readJsonEntries<T>(dirPath: string): T[] {
/**
 * 记录cached。
 */
  const cached = jsonEntriesCache.get(dirPath);
  if (cached) {
    return cached as T[];
  }

/**
 * 汇总当前条目列表。
 */
  const entries: T[] = [];
  for (const filePath of collectJsonFiles(dirPath)) {
    entries.push(...readJsonFile<T[]>(filePath));
  }
  jsonEntriesCache.set(dirPath, entries);
  return entries;
}

/**
 * 判断是否plainobject。
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 收集json文件列表。
 */
function collectJsonFiles(dirPath: string): string[] {
/**
 * 汇总当前条目列表。
 */
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
/**
 * 汇总待处理文件列表。
 */
  const files: string[] = [];
  for (const entry of entries) {
/**
 * 记录entry路径。
 */
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

/**
 * 递归遍历for物品ids。
 */
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
/**
 * 记录record。
 */
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
  if (techniquesCache) {
    return techniquesCache;
  }
  techniquesCache = readJsonEntries<RawTechnique>(path.join(getContentRoot(), 'techniques'));
  return techniquesCache;
}

/** 读取所有装备类物品 */
export function readEquipmentItems(): RawEquipment[] {
  if (equipmentItemsCache) {
    return equipmentItemsCache;
  }
  equipmentItemsCache = readJsonEntries<RawEquipment>(path.join(getContentRoot(), 'items'))
    .filter((entry) => entry.type === 'equipment');
  return equipmentItemsCache;
}

/**
 * 处理compileequipmenteffectsfor报表。
 */
function compileEquipmentEffectsForReport(input: unknown): EquipmentEffectDef[] | undefined {
  if (!Array.isArray(input)) {
    return undefined;
  }

  if (compiledEquipmentEffectsCache.has(input)) {
    return compiledEquipmentEffectsCache.get(input);
  }

/**
 * 记录effects。
 */
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

/**
 * 累计当前结果。
 */
  const result = effects.length > 0 ? effects : undefined;
  compiledEquipmentEffectsCache.set(input, result);
  return result;
}

/**
 * 格式化功法品阶。
 */
function formatTechniqueGrade(grade: TechniqueGrade): string {
  return TECHNIQUE_GRADE_LABELS[grade] ?? grade;
}

/**
 * 处理地图危险度toequipment品阶。
 */
function mapDangerToEquipmentGrade(dangerLevel: number): string {
/**
 * 记录mapping。
 */
  const mapping: Record<number, string> = {
    1: '凡阶',
    2: '黄阶',
    3: '玄阶',
    4: '地阶',
    5: '天阶',
  };
  return mapping[dangerLevel] ?? '未定';
}

/**
 * 记录境界等级名称索引cache。
 */
let realmLevelNameIndexCache: Map<number, string> | null = null;

/**
 * 获取境界等级名称索引。
 */
function getRealmLevelNameIndex(): Map<number, string> {
  if (realmLevelNameIndexCache) {
    return realmLevelNameIndexCache;
  }

/**
 * 记录配置。
 */
  const config = readJsonFile<RealmLevelsConfig>(path.join(getContentRoot(), 'realm-levels.json'));
/**
 * 记录索引。
 */
  const index = new Map<number, string>();
  for (const level of config.levels ?? []) {
    if (!Number.isFinite(level.realmLv)) {
      continue;
    }
/**
 * 记录label。
 */
    const label = level.displayName ?? level.name;
    if (typeof label === 'string' && label.trim().length > 0) {
      index.set(level.realmLv, label.trim());
    }
  }
  realmLevelNameIndexCache = index;
  return index;
}

/**
 * 格式化功法境界。
 */
function formatTechniqueRealm(realmLv: number): string {
/**
 * 记录normalized境界lv。
 */
  const normalizedRealmLv = Math.max(1, Math.floor(realmLv));
/**
 * 记录label。
 */
  const label = getRealmLevelNameIndex().get(normalizedRealmLv);
  return label ? `${label}(${normalizedRealmLv})` : String(normalizedRealmLv);
}

/**
 * 处理calculate功法baseline价值。
 */
function calculateTechniqueBaselineValue(totalValue: number, realmLv: number): number {
/**
 * 记录normalized境界lv。
 */
  const normalizedRealmLv = Math.max(1, Math.floor(realmLv));
  return totalValue / Math.pow(1.15, normalizedRealmLv - 1);
}

/**
 * 判断是否怪物功法。
 */
function isMonsterTechnique(technique: Pick<RawTechnique, 'id'>): boolean {
  return technique.id.startsWith('monster_');
}

/**
 * 构建equipment地图危险度索引。
 */
function buildEquipmentMapDangerIndex(): Map<string, number> {
  if (equipmentMapDangerIndexCache) {
    return equipmentMapDangerIndexCache;
  }
/**
 * 记录地图目录。
 */
  const mapsDir = path.join(process.cwd(), 'data', 'maps');
/**
 * 记录索引。
 */
  const index = new Map<string, number>();
  for (const filePath of collectJsonFiles(mapsDir).sort((left, right) => left.localeCompare(right, 'zh-CN'))) {
/**
 * 记录文件。
 */
    const file = path.basename(filePath);
    if (file === 'spawn.json' || file === 'yunlai_town.json') {
      continue;
    }/**
 * 保存map映射。
 */

    let map: RawMap & Record<string, unknown>;
    try {
      map = readJsonFile<RawMap & Record<string, unknown>>(filePath);
    } catch {
      continue;
    }
/** found：定义该变量以承载业务值。 */
    const found = new Set<string>();
    walkForItemIds(map, found);
/**
 * 记录危险度等级。
 */
    const dangerLevel = Number.isFinite(map.dangerLevel) ? Number(map.dangerLevel) : 0;
    for (const itemId of found) {
      if (!itemId.startsWith('equip.')) {
        continue;
      }
/**
 * 记录previous。
 */
      const previous = index.get(itemId);
      if (previous === undefined || (dangerLevel > 0 && dangerLevel < previous)) {
        index.set(itemId, dangerLevel);
      }
    }
  }
  equipmentMapDangerIndexCache = index;
  return index;
}

/**
 * 规整cell。
 */
function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

/**
 * 格式化number。
 */
function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * 格式化signednumber。
 */
function formatSignedNumber(value: number): string {
  if (value > 0) return `+${formatNumber(value)}`;
  return formatNumber(value);
}

/**
 * 格式化percent。
 */
function formatPercent(scale: number): string {
  return `${formatNumber(scale * 100)}%`;
}

/**
 * 处理joinunquantified。
 */
function joinUnquantified(parts: string[]): string {
/**
 * 记录unique。
 */
  const unique = [...new Set(parts.map((entry) => entry.trim()).filter((entry) => entry.length > 0))];
  return unique.length > 0 ? unique.join('；') : '-';
}

/**
 * 处理describe技能Buffeffect。
 */
function describeSkillBuffEffect(effect: SkillBuffEffectDef): string {
/**
 * 记录汇总。
 */
  const summary = calculateBuffValue(effect);
/**
 * 记录类别。
 */
  const category = effect.category ?? (effect.target === 'self' ? 'buff' : 'debuff');
/**
 * 记录类别label。
 */
  const categoryLabel = category === 'debuff' ? '减益' : '增益';
/**
 * 记录stacktext。
 */
  const stackText = effect.maxStacks && effect.maxStacks > 1 ? `，最多${effect.maxStacks}层` : '';
  return `${categoryLabel} ${effect.name}(${formatSignedNumber(summary.quantifiedValue)}，持续${effect.duration}息${stackText})`;
}

/**
 * 构建技能metaparts。
 */
function buildSkillMetaParts(skill: SkillDef): string[] {
/**
 * 记录parts。
 */
  const parts: string[] = [];
  for (const effect of skill.effects) {
    if (effect.type !== 'buff') continue;
    parts.push(describeSkillBuffEffect(effect));
  }
  return parts;
}

/**
 * 解析Buffstackvariable。
 */
function parseBuffStackVariable(variable: SkillFormulaVar): { side: 'caster' | 'target'; buffId: string } | null {
  if (!variable.endsWith('.stacks')) {
    return null;
  }
/**
 * 记录matched。
 */
  const matched = variable.match(/^(caster|target)\.buff\.(.+)\.stacks$/);
  if (!matched) {
    return null;
  }
  return {
    side: matched[1] as 'caster' | 'target',
    buffId: matched[2],
  };
}

/**
 * 收集Buffstacklinks。
 */
function collectBuffStackLinks(formula: SkillFormula, found: Array<{ side: 'caster' | 'target'; buffId: string; scale: number }>): void {
  if (typeof formula === 'number') {
    return;
  }
  if ('var' in formula) {
/**
 * 记录parsed。
 */
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

/**
 * 构建功法Buff名称地图。
 */
function buildTechniqueBuffNameMap(skills: Array<Pick<SkillDef, 'effects'>>): Map<string, string> {
/**
 * 记录Buffnames。
 */
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

/**
 * 构建技能comboparts。
 */
function buildSkillComboParts(technique: RawTechnique, skill: SkillDef): string[] {
/**
 * 记录links。
 */
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

/**
 * 记录Buffnames。
 */
  const buffNames = buildTechniqueBuffNameMap(technique.skills);
/**
 * 记录seen。
 */
  const seen = new Set<string>();
/**
 * 记录parts。
 */
  const parts: string[] = [];
  for (const link of links) {
/**
 * 记录sidelabel。
 */
    const sideLabel = link.side === 'caster' ? '自身' : '目标';
/**
 * 记录Buff名称。
 */
    const buffName = buffNames.get(link.buffId) ?? '状态';
/**
 * 记录key。
 */
    const key = `${link.side}:${link.buffId}:${link.scale}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    parts.push(`连携 ${sideLabel}${buffName}层数×${formatPercent(link.scale)}`);
  }
  return parts;
}

/**
 * 解析技能damagetargets。
 */
function resolveSkillDamageTargets(skill: SkillDef): string {/**
 * 标记是否已damageeffect。
 */

  const hasDamageEffect = skill.effects.some((effect) => effect.type === 'damage');
  if (!hasDamageEffect) {
    return '-';
  }
  if (typeof skill.targeting?.maxTargets === 'number' && skill.targeting.maxTargets > 0) {
    return String(skill.targeting.maxTargets);
  }
  return '1';
}

/**
 * 解析equipment运行态属性字段。
 */
function resolveEquipmentRuntimeStats(item: Pick<RawEquipment, 'equipStats' | 'equipValueStats'>): ItemStack['equipStats'] | undefined {
  return item.equipStats ?? compileValueStatsToActualStats(item.equipValueStats);
}

/**
 * 处理summarizeequipmentfor报表。
 */
function summarizeEquipmentForReport(item: RawEquipment): {
/** runtimeQuantifiedValue：定义该变量以承载业务值。 */
  runtimeQuantifiedValue: number;
/** baseQuantifiedValue：定义该变量以承载业务值。 */
  baseQuantifiedValue: number;
/** unquantified：定义该变量以承载业务值。 */
  unquantified: string[];
} {
/**
 * 记录equip属性字段。
 */
  const equipStats = resolveEquipmentRuntimeStats(item);
/**
 * 记录effects。
 */
  const effects = compileEquipmentEffectsForReport(item.effects);
/**
 * 记录运行态汇总。
 */
  const runtimeSummary = calculateAttrBonusValue({
    attrs: item.equipAttrs ?? {},
    stats: equipStats,
  });
/**
 * 记录analytical汇总。
 */
  const analyticalSummary = calculateEquipmentValue({
    ...item,
    equipStats,
    equipValueStats: item.equipValueStats,
    effects,
  });

  return {
    runtimeQuantifiedValue: runtimeSummary.quantifiedValue,
    baseQuantifiedValue: analyticalSummary.baseQuantifiedValue,
    unquantified: analyticalSummary.unquantified,
  };
}

/** 构建装备价值报表行 */
export function buildEquipmentRows(): ValueReportRow[] {
/** dangerIndex：定义该变量以承载业务值。 */
  const dangerIndex = buildEquipmentMapDangerIndex();
  return readEquipmentItems().map((item) => {
/** summary：定义该变量以承载业务值。 */
    const summary = summarizeEquipmentForReport(item);
/**
 * 记录危险度等级。
 */
    const dangerLevel = dangerIndex.get(item.itemId);
/**
 * 记录品阶。
 */
    const grade = item.grade
      ? formatTechniqueGrade(item.grade)
      : typeof dangerLevel === 'number' && dangerLevel > 0
        ? mapDangerToEquipmentGrade(dangerLevel)
        : '未定';
/**
 * 记录等级。
 */
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
      quantifiedValue: formatNumber(summary.runtimeQuantifiedValue),
      unquantifiedValue: joinUnquantified(summary.unquantified),
    };
  });
}

/** 构建功法价值报表行 */
export function buildTechniqueRows(): ValueReportRow[] {
  return readTechniques()
    .filter((technique) => !isMonsterTechnique(technique))
    .map((technique) => {
/** maxLevel：定义该变量以承载业务值。 */
      const maxLevel = getTechniqueMaxLevel(technique.layers);
/**
 * 记录汇总。
 */
      const summary = calculateTechniqueValue({
        level: maxLevel,
        layers: technique.layers,
      });
/**
 * 记录total价值。
 */
      const totalValue = summary.quantifiedValue;
      return {
        name: technique.name,
        grade: formatTechniqueGrade(technique.grade),
        realm: formatTechniqueRealm(technique.realmLv),
        level: String(maxLevel),
        baseQuantifiedValue: formatNumber(calculateTechniqueBaselineValue(totalValue, technique.realmLv)),
        quantifiedValue: formatNumber(totalValue),
        unquantifiedValue: joinUnquantified(summary.unquantified),
      };
    });
}

/** 构建技能价值报表行 */
export function buildSkillRows(): ValueReportRow[] {
  return readTechniques().flatMap((technique) => technique.skills.map((skill) => {
/** actualCost：定义该变量以承载业务值。 */
    const actualCost = calculateTechniqueSkillQiCost(
      Number.isFinite(skill.costMultiplier) ? Number(skill.costMultiplier) : Math.max(0, skill.cost ?? 0),
      technique.grade,
      technique.realmLv,
    );
/**
 * 记录normalized技能。
 */
    const normalizedSkill: SkillDef = {
      ...skill,
      cost: actualCost,
    };
/**
 * 记录汇总。
 */
    const summary = calculateSkillValue(normalizedSkill);
/**
 * 记录metaparts。
 */
    const metaParts = buildSkillMetaParts(normalizedSkill);
/**
 * 记录comboparts。
 */
    const comboParts = buildSkillComboParts(technique, normalizedSkill);
/**
 * 记录rawdetailparts。
 */
    const rawDetailParts = summary.unquantified.length > 0 ? summary.unquantified : [skill.desc];
/**
 * 记录detailparts。
 */
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
/**
 * 记录汇总。
 */
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
/** sortedRows：定义该变量以承载业务值。 */
  const sortedRows = [...rows].sort((left, right) => {
/** leftValue：定义该变量以承载业务值。 */
    const leftValue = Number(left.quantifiedValue) || 0;
/**
 * 记录right价值。
 */
    const rightValue = Number(right.quantifiedValue) || 0;
    if (rightValue !== leftValue) {
      return rightValue - leftValue;
    }
    return left.name.localeCompare(right.name, 'zh-Hans-CN');
  });

/**
 * 汇总输出行。
 */
  const lines = [
    `## ${title}`,
    '',
    ...(title === '技能价值报表'
      ? [
          '| 名字 | 品阶 | 等级 | 释放距离 | 伤害数量 | CD | 消耗 | 量化价值 | 无法量化价值 |',
          '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
          ...sortedRows.map((row) => `| ${escapeCell(row.name)} | ${escapeCell(row.grade)} | ${escapeCell(row.level)} | ${escapeCell(row.range ?? '-')} | ${escapeCell(row.damageTargets ?? '-')} | ${escapeCell(row.cooldown ?? '-')} | ${escapeCell(row.cost ?? '-')} | ${escapeCell(row.quantifiedValue)} | ${escapeCell(row.unquantifiedValue)} |`),
        ]
      : title === '功法价值报表'
        ? [
            '| 名字 | 品阶 | 功法境界 | 等级 | 总价值 | 基准量化值 | 无法量化价值 |',
            '| --- | --- | --- | --- | --- | --- | --- |',
            ...sortedRows.map((row) => `| ${escapeCell(row.name)} | ${escapeCell(row.grade)} | ${escapeCell(row.realm ?? '-')} | ${escapeCell(row.level)} | ${escapeCell(row.quantifiedValue)} | ${escapeCell(row.baseQuantifiedValue ?? '-')} | ${escapeCell(row.unquantifiedValue)} |`),
          ]
      : title === '装备价值报表'
        ? [
            '| 名字 | 品阶 | 等级 | 运行时价值 | 配置预算 | 无法量化特效 |',
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

