/**
 * 本文件负责客户端内容索引、模板读取或本地展示数据解析。
 *
 * 维护时要区分展示缓存与正式配置真源，避免在客户端内容层重新裁定掉落、资产或战斗规则。
 */
import {
  calculateTechniqueSkillQiCost,
  deriveTechniqueRealm,
  expandTechniqueAttrRatio,
  expandTechniqueExpCurve,
  expandTechniqueLayerGains,
  type GmEditorItemOption,
  type GmEditorRealmOption,
  type GmEditorTechniqueOption,
  type ItemStack,
  type QuestState,
  type SkillDef,
  type TechniqueCategory,
  type TechniqueGrade,
  type TechniqueLayerDef,
  type TechniqueState,
  resolveSkillRequiresTarget,
} from '@mud/shared';
import { LOCAL_EDITOR_CATALOG } from './editor-catalog';
import { contentResolver, type LocalBuffTemplate } from './content-resolver';
import { isUsableClientItemNameCandidate } from './item-name-utils';

// 本地目录只用于预览补齐与离线辅助，不参与正式玩法真源判定。
// 以下 Map 保留用于 resolvePreview 系列函数中的功法层级展开等复杂逻辑。
const techniqueTemplateMap = new Map(LOCAL_EDITOR_CATALOG.techniques.map((technique) => [technique.id, technique] as const));
/** 记录所有神通系技能名称，供预览时识别。 */
const divineSkillNameSet = new Set(
  LOCAL_EDITOR_CATALOG.techniques.flatMap((technique) => {
    const category = resolveTechniqueCategoryFromTemplate(technique);
    if (category !== 'divine') {
      return [];
    }
    return (technique.skills ?? []).map((skill) => skill.name.trim()).filter((name) => name.length > 0);
  }),
);
/** 从功法书物品 ID 反查功法类别。 */
const techniqueCategoryByBookItemId = new Map<string, TechniqueCategory>();
const DEFAULT_TECHNIQUE_REALM_LEVEL_BY_GRADE: Record<TechniqueGrade, number> = {
  mortal: 1,
  yellow: 13,
  mystic: 25,
  earth: 37,
  heaven: 49,
  spirit: 61,
  saint: 73,
  emperor: 85,
};

const CLIENT_ITEM_TEMPLATE_ALIASES = new Map<string, string>([
  ['fate_stone.qizhen_crossing', 'fate_stone'],
  ['fate_stone.yunlai_town', 'fate_stone'],
]);

/** 对目录条目做深拷贝，避免调用方修改原始常量。 */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** 从模板推断功法类别。 */
function resolveTechniqueCategoryFromTemplate(template: GmEditorTechniqueOption | undefined): TechniqueCategory | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!template) {
    return null;
  }
  return template.category ?? ((template.skills?.length ?? 0) > 0 ? 'arts' : 'internal');
}

/** 从书籍物品 ID 里拆出对应的功法 ID。 */
export function resolveTechniqueIdFromBookItemId(itemId: string): string | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (itemId.startsWith('book.')) {
    return itemId.slice(5);
  }
  if (itemId.startsWith('book_')) {
    return itemId.slice(5);
  }
  return null;
}

for (const item of LOCAL_EDITOR_CATALOG.items) {
  if (item.type !== 'skill_book') {
    continue;
  }
  const techniqueId = resolveTechniqueIdFromBookItemId(item.itemId);
  const category = resolveTechniqueCategoryFromTemplate(
    techniqueId ? techniqueTemplateMap.get(techniqueId) : undefined,
  );
  if (category) {
    techniqueCategoryByBookItemId.set(item.itemId, category);
  }
}

/** 读取本地物品模板（委托给 ContentResolver）。 */
export function getLocalItemTemplate(itemId: string): GmEditorItemOption | null {
  const normalizedItemId = itemId.trim();
  return contentResolver.getItem(normalizedItemId)
    ?? contentResolver.getItem(CLIENT_ITEM_TEMPLATE_ALIASES.get(normalizedItemId) ?? '');
}

/** 读取本地功法模板（委托给 ContentResolver）。 */
export function getLocalTechniqueTemplate(techId: string): GmEditorTechniqueOption | null {
  return contentResolver.getTechnique(techId);
}

/** 根据书籍物品 ID 读取功法类别。 */
export function getLocalTechniqueCategoryForBookItem(itemId: string): TechniqueCategory | null {
  return techniqueCategoryByBookItemId.get(itemId) ?? null;
}

/** 读取本地境界等级配置（委托给 ContentResolver）。 */
export function getLocalRealmLevelEntry(realmLv: number | undefined): GmEditorRealmOption | null {
  return contentResolver.getRealmLevel(realmLv);
}

/** 读取本地技能模板（委托给 ContentResolver）。 */
export function getLocalSkillTemplate(skillId: string): SkillDef | null {
  return contentResolver.getSkill(skillId);
}

/** 读取本地 Buff 模板（委托给 ContentResolver）。 */
export function getLocalBuffTemplate(buffId: string): LocalBuffTemplate | null {
  return contentResolver.getBuff(buffId);
}

/** 读取本地任务模板（委托给 ContentResolver）。 */
export function getLocalQuestTemplate(questId: string): QuestState | null {
  return contentResolver.getQuest(questId);
}

/** 判断某个技能名是否属于本地神通系技能。 */
export function isLocalDivineSkillName(skillName: string): boolean {
  const normalizedName = skillName.trim();
  return normalizedName.length > 0 && divineSkillNameSet.has(normalizedName);
}

/** 计算功法预览时应使用的境界等级。 */
function resolveTechniqueRealmLevel(realmLv: number | undefined, grade: TechniqueGrade | undefined): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (Number.isFinite(realmLv)) {
    return Math.max(1, Math.floor(Number(realmLv)));
  }
  if (grade) {
    return DEFAULT_TECHNIQUE_REALM_LEVEL_BY_GRADE[grade] ?? 1;
  }
  return 1;
}

/** 用本地模板补齐物品预览字段。 */
export function resolvePreviewItem(item: ItemStack): ItemStack {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const sourceItem = stripInvalidPreviewInstanceId(item);
  const template = getLocalItemTemplate(sourceItem.itemId);
  const sourceName = isUsableClientItemNameCandidate(sourceItem.itemId, sourceItem.name)
    ? sourceItem.name
    : undefined;
  if (!template) {
    return sourceName ? sourceItem : { ...sourceItem, name: sourceItem.itemId };
  }
  return {
    ...sourceItem,
    itemInstanceId: sourceItem.itemInstanceId,
    name: sourceName ?? template.name,
    type: sourceItem.type || template.type,
    desc: sourceItem.desc || template.desc || '',
    groundLabel: sourceItem.groundLabel ?? template.groundLabel,
    grade: sourceItem.grade ?? template.grade,
    level: sourceItem.level ?? template.level,
    materialCategory: sourceItem.materialCategory ?? template.materialCategory,
    materialValues: sourceItem.materialValues ?? template.materialValues,
    equipSlot: template.equipSlot ?? sourceItem.equipSlot,
    equipAttrs: sourceItem.equipAttrs ?? template.equipAttrs,
    equipStats: sourceItem.equipStats ?? template.equipStats,
    equipValueStats: sourceItem.equipValueStats ?? template.equipValueStats,
    equipSpecialStats: template.equipSpecialStats ?? sourceItem.equipSpecialStats,
    effects: sourceItem.effects ?? template.effects,
    healAmount: sourceItem.healAmount ?? template.healAmount,
    healPercent: sourceItem.healPercent ?? template.healPercent,
    baselineHealPercent: sourceItem.baselineHealPercent ?? template.baselineHealPercent,
    baselineQiPercent: sourceItem.baselineQiPercent ?? template.baselineQiPercent,
    qiPercent: sourceItem.qiPercent ?? template.qiPercent,
    cooldown: sourceItem.cooldown ?? template.cooldown,
    enhanceLevel: sourceItem.enhanceLevel ?? template.enhanceLevel,
    alchemySuccessRate: sourceItem.alchemySuccessRate ?? template.alchemySuccessRate,
    alchemySpeedRate: sourceItem.alchemySpeedRate ?? template.alchemySpeedRate,
    enhancementSuccessRate: sourceItem.enhancementSuccessRate ?? template.enhancementSuccessRate,
    enhancementSpeedRate: sourceItem.enhancementSpeedRate ?? template.enhancementSpeedRate,
    miningDamageRate: sourceItem.miningDamageRate ?? template.miningDamageRate,
    miningDropRate: sourceItem.miningDropRate ?? template.miningDropRate,
    buildingSpeedRate: sourceItem.buildingSpeedRate ?? template.buildingSpeedRate,
    consumeBuffs: sourceItem.consumeBuffs ?? template.consumeBuffs,
    tags: sourceItem.tags ?? template.tags,
    contextActions: sourceItem.contextActions ?? template.contextActions,
    mapUnlockId: sourceItem.mapUnlockId ?? template.mapUnlockId,
    mapUnlockIds: sourceItem.mapUnlockIds ?? template.mapUnlockIds,
    respawnBindMapId: sourceItem.respawnBindMapId ?? template.respawnBindMapId,
    tileAuraGainAmount: sourceItem.tileAuraGainAmount ?? template.tileAuraGainAmount,
    tileResourceGains: sourceItem.tileResourceGains ?? template.tileResourceGains,
    useBehavior: sourceItem.useBehavior ?? template.useBehavior,
    allowBatchUse: sourceItem.allowBatchUse ?? template.allowBatchUse,
  };
}

function stripInvalidPreviewInstanceId(item: ItemStack): ItemStack {
  if (!Object.prototype.hasOwnProperty.call(item, 'instanceId')) {
    return item;
  }
  const sanitized = { ...item } as ItemStack & { instanceId?: unknown };
  delete sanitized.instanceId;
  return sanitized;
}

/** 用本地模板补齐任务展示字段，保留服务端运行态字段。 */
export function resolvePreviewQuest(quest: QuestState): QuestState {
  const template = getLocalQuestTemplate(quest.id);
  const required = normalizeQuestPreviewNumber(quest.required ?? template?.required, 1, 1);
  const progress = quest.status === 'completed'
    ? required
    : normalizeQuestPreviewNumber(quest.progress ?? template?.progress, 0, 0);
  const merged = template
    ? {
      ...template,
      ...quest,
      status: quest.status ?? template.status,
      progress,
      required,
    }
    : {
      ...quest,
      progress,
      required,
    };
  return {
    ...merged,
    rewardItemIds: Array.isArray(merged.rewardItemIds) ? merged.rewardItemIds.slice() : [],
    rewards: (merged.rewards ?? []).map((item) => resolvePreviewItem(item)),
  };
}

function normalizeQuestPreviewNumber(value: unknown, fallback: number, minimum: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(minimum, Math.trunc(numeric));
}

/** 批量补齐任务展示字段。 */
export function resolvePreviewQuests(quests: QuestState[] | undefined): QuestState[] {
  return (quests ?? []).map((quest) => resolvePreviewQuest(quest));
}

/** 用本地模板补齐技能预览字段。 */
export function resolvePreviewSkill(skill: SkillDef): SkillDef {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const template = getLocalSkillTemplate(skill.id);
  if (!template) {
    return skill;
  }
  const resolved = {
    ...skill,
    name: skill.name || template.name,
    desc: skill.desc || template.desc,
    cooldown: skill.cooldown ?? template.cooldown,
    cost: skill.cost ?? template.cost,
    costMultiplier: skill.costMultiplier ?? template.costMultiplier,
    range: skill.range ?? template.range,
    targeting: skill.targeting ?? template.targeting,
    effects: skill.effects?.length ? skill.effects : template.effects,
    unlockLevel: skill.unlockLevel ?? template.unlockLevel,
    unlockRealm: skill.unlockRealm ?? template.unlockRealm,
    unlockPlayerRealm: skill.unlockPlayerRealm ?? template.unlockPlayerRealm,
    requiresTarget: skill.requiresTarget ?? template.requiresTarget,
    targetMode: skill.targetMode ?? template.targetMode,
  };
  return {
    ...resolved,
    requiresTarget: resolveSkillRequiresTarget(resolved),
  };
}

/** 批量补齐技能预览字段。 */
export function resolvePreviewSkills(skills: SkillDef[] | undefined): SkillDef[] {
  return (skills ?? []).map((skill) => resolvePreviewSkill(skill));
}

/** 补齐功法内单个技能的预览字段和真气消耗。 */
function resolvePreviewTechniqueSkill(
  skill: SkillDef,
  techniqueGrade: TechniqueState['grade'],
  techniqueRealmLv: number,
  templateSkill?: SkillDef,
): SkillDef {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const merged = resolvePreviewSkill({
    ...(templateSkill ?? {}),
    ...skill,
  } as SkillDef);
  const costMultiplier = merged.costMultiplier ?? templateSkill?.costMultiplier;
  if (costMultiplier === undefined) {
    return merged;
  }
  return {
    ...merged,
    costMultiplier,
    cost: calculateTechniqueSkillQiCost(
      costMultiplier,
      techniqueGrade,
      techniqueRealmLv,
    ),
  };
}

/** 用模板与当前状态合并出功法预览数据。 */
export function resolvePreviewTechnique(technique: TechniqueState): TechniqueState {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const template = getLocalTechniqueTemplate(technique.techId);
  if (!template) {
    return {
      ...technique,
      realmLv: resolveTechniqueRealmLevel(technique.realmLv, technique.grade),
      realm: deriveTechniqueRealm(technique.level, technique.layers),
      skills: resolvePreviewSkills(technique.skills),
      category: technique.category ?? (technique.skills.length > 0 ? 'arts' : 'internal'),
    };
  }
  const resolvedLayers = resolvePreviewTechniqueLayers(technique.layers, template);
  const templateSkills = clone(template.skills ?? []);
  const sourceSkills = technique.skills.length > 0 ? technique.skills : templateSkills;
  const realmLv = resolveTechniqueRealmLevel(template.realmLv, technique.grade ?? template.grade);
  return {
    ...technique,
    name: technique.name || template.name,
    grade: technique.grade ?? template.grade,
    category: technique.category ?? template.category ?? (sourceSkills.length > 0 ? 'arts' : 'internal'),
    realmLv,
    realm: deriveTechniqueRealm(technique.level, resolvedLayers),
    skills: sourceSkills.map((skill) => (
      resolvePreviewTechniqueSkill(
        skill,
        technique.grade ?? template.grade,
        realmLv,
        templateSkills.find((entry) => entry.id === skill.id),
      )
    )),
    layers: resolvedLayers,
  };
}

function resolvePreviewTechniqueLayers(
  sourceLayers: TechniqueState['layers'] | undefined,
  template: GmEditorTechniqueOption | undefined,
): TechniqueLayerDef[] {
  const templateLayers = template?.layers;
  const expandedTemplateLayers = expandPreviewTechniqueTemplateLayers(template);
  const templateByLevel = new Map((expandedTemplateLayers ?? []).map((entry) => [entry.level, entry] as const));
  const sourceByLevel = new Map((sourceLayers ?? []).map((entry) => [entry.level, entry] as const));
  const baseLayers = expandedTemplateLayers && expandedTemplateLayers.length > 0
    ? expandedTemplateLayers
    : sourceLayers && sourceLayers.length > 0
      ? sourceLayers
      : clone(templateLayers ?? []);
  return baseLayers.map((layer) => {
    const templateLayer = templateByLevel.get(layer.level);
    const sourceLayer = sourceByLevel.get(layer.level);
    const legacySpecialStats = resolveLegacyLayerSpecialStats(layer.attrs);
    return {
      ...layer,
      expToNext: templateLayer?.expToNext ?? sourceLayer?.expToNext ?? layer.expToNext,
      attrs: templateLayer?.attrs
        ? { ...templateLayer.attrs }
        : cloneLayerAttrsWithoutSpecialStats(sourceLayer?.attrs ?? layer.attrs),
      specialStats: sourceLayer?.specialStats
        ? { ...sourceLayer.specialStats }
        : layer.specialStats
          ? { ...layer.specialStats }
          : legacySpecialStats ?? (templateLayer?.specialStats ? { ...templateLayer.specialStats } : undefined),
      qiProjection: sourceLayer?.qiProjection
        ? sourceLayer.qiProjection.map((entry) => ({ ...entry }))
        : templateLayer?.qiProjection
          ? templateLayer.qiProjection.map((entry) => ({ ...entry }))
          : layer.qiProjection?.map((entry) => ({ ...entry })),
    };
  });
}

function expandPreviewTechniqueTemplateLayers(template: GmEditorTechniqueOption | undefined): TechniqueLayerDef[] | undefined {
  if (!template) {
    return undefined;
  }
  if (hasPositiveAttrRatio(template.attrRatio)) {
    return expandTechniqueAttrRatio({
      id: template.id,
      name: template.name,
      desc: template.desc,
      grade: template.grade ?? 'mortal',
      category: template.category ?? ((template.skills?.length ?? 0) > 0 ? 'arts' : 'internal'),
      realmLv: resolveTechniqueRealmLevel(template.realmLv, template.grade),
      attrRatio: template.attrRatio,
      attrFloat: template.attrFloat,
      maxLayer: template.maxLayer,
      expDifficulty: template.expDifficulty,
      layers: template.layers,
    }).layers;
  }
  if (!Number.isFinite(template.maxLayer)) {
    return template?.layers;
  }
  const maxLayer = Math.max(1, Math.floor(Number(template.maxLayer)));
  const grade = template.grade ?? 'mortal';
  const category = template.category ?? ((template.skills?.length ?? 0) > 0 ? 'arts' : 'internal');
  const realmLv = resolveTechniqueRealmLevel(template.realmLv, grade);
  const expCurve = expandTechniqueExpCurve(grade, realmLv, maxLayer, template.expDifficulty ?? 1, category);
  const sparseByLevel = new Map((template.layers ?? []).map((entry) => [entry.level, entry] as const));
  const gains = expandTechniqueLayerGains(template.layerGains, maxLayer);
  return Array.from({ length: maxLayer }, (_, index) => {
    const level = index + 1;
    const sparse = sparseByLevel.get(level);
    const gain = gains[index];
    return {
      level,
      expToNext: expCurve.perLayerExp[index] ?? 0,
      attrs: gain?.attrs ? { ...gain.attrs } : (sparse?.attrs ? { ...sparse.attrs } : undefined),
      specialStats: gain?.specialStats ? { ...gain.specialStats } : (sparse?.specialStats ? { ...sparse.specialStats } : undefined),
      qiProjection: sparse?.qiProjection ? sparse.qiProjection.map((entry) => ({ ...entry })) : undefined,
    };
  });
}

function hasPositiveAttrRatio(attrRatio: GmEditorTechniqueOption['attrRatio'] | undefined): boolean {
  return Object.values(attrRatio ?? {}).some((value) => (
    typeof value === 'number' && Number.isFinite(value) && value > 0
  ));
}

function cloneLayerAttrsWithoutSpecialStats(attrs: TechniqueLayerDef['attrs'] | undefined): TechniqueLayerDef['attrs'] | undefined {
  if (!attrs) {
    return undefined;
  }
  const { comprehension: _comprehension, luck: _luck, ...rest } = attrs as TechniqueLayerDef['attrs'] & {
    comprehension?: number;
    luck?: number;
  };
  return Object.keys(rest).length > 0 ? rest : undefined;
}

function resolveLegacyLayerSpecialStats(attrs: TechniqueLayerDef['attrs'] | undefined): TechniqueLayerDef['specialStats'] | undefined {
  const source = attrs as (TechniqueLayerDef['attrs'] & { comprehension?: number; luck?: number }) | undefined;
  if (!source) {
    return undefined;
  }
  const specialStats: TechniqueLayerDef['specialStats'] = {};
  if (typeof source.comprehension === 'number' && Number.isFinite(source.comprehension) && source.comprehension > 0) {
    specialStats.comprehension = source.comprehension;
  }
  if (typeof source.luck === 'number' && Number.isFinite(source.luck) && source.luck > 0) {
    specialStats.luck = source.luck;
  }
  return Object.keys(specialStats).length > 0 ? specialStats : undefined;
}

/** 批量补齐功法预览数据。 */
export function resolvePreviewTechniques(techniques: TechniqueState[] | undefined): TechniqueState[] {
  return (techniques ?? []).map((technique) => resolvePreviewTechnique(technique));
}
