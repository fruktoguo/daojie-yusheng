import {
  calculateTechniqueSkillQiCost,
  deriveTechniqueRealm,
  type GmEditorItemOption,
  type GmEditorTechniqueOption,
  type GmEditorRealmOption,
  type ItemStack,
  type QuestState,
  type SkillDef,
  type TechniqueCategory,
  type TechniqueGrade,
  type TechniqueLayerDef,
  type TechniqueState,
} from '@mud/shared';
import { LOCAL_EDITOR_CATALOG } from './editor-catalog';

// 本地目录只用于预览补齐与离线辅助，不参与正式玩法真源判定。
const itemTemplateMap = new Map(LOCAL_EDITOR_CATALOG.items.map((item) => [item.itemId, item] as const));
const techniqueTemplateMap = new Map(LOCAL_EDITOR_CATALOG.techniques.map((technique) => [technique.id, technique] as const));
const realmLevelMap = new Map(LOCAL_EDITOR_CATALOG.realmLevels.map((realm) => [realm.realmLv, realm] as const));
const questTemplateMap = new Map((LOCAL_EDITOR_CATALOG.quests ?? []).map((quest) => [quest.id, quest] as const));
/** 按技能 ID 建立的本地技能模板索引。 */
const skillTemplateMap = new Map(
  LOCAL_EDITOR_CATALOG.techniques.flatMap((technique) =>
    (technique.skills ?? []).map((skill) => [skill.id, skill] as const),
  ),
);
/** 本地 Buff 模板的最小字段集合。 */
type LocalBuffTemplate = {
/**
 * buffId：buffID标识。
 */

  buffId: string;  
  /**
 * name：名称名称或显示文本。
 */

  name: string;  
  /**
 * shortMark：shortMark相关字段。
 */

  shortMark?: string;  
  /**
 * category：category相关字段。
 */

  category?: 'buff' | 'debuff';
};

/** 按 Buff ID 建立的本地 Buff 模板索引。 */
const buffTemplateMap = new Map<string, LocalBuffTemplate>(
  LOCAL_EDITOR_CATALOG.techniques.flatMap((technique) =>
    (technique.skills ?? []).flatMap((skill) =>
      skill.effects.flatMap((effect) => (
        effect.type === 'buff'
          ? [[effect.buffId, {
            buffId: effect.buffId,
            name: effect.name,
            shortMark: effect.shortMark,
            category: effect.category,
          }] as const]
          : []
      )),
    ),
  ),
);
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

/** 读取本地物品模板副本。 */
export function getLocalItemTemplate(itemId: string): GmEditorItemOption | null {
  const template = itemTemplateMap.get(itemId);
  return template ? clone(template) : null;
}

/** 读取本地功法模板副本。 */
export function getLocalTechniqueTemplate(techId: string): GmEditorTechniqueOption | null {
  const template = techniqueTemplateMap.get(techId);
  return template ? clone(template) : null;
}

/** 根据书籍物品 ID 读取功法类别。 */
export function getLocalTechniqueCategoryForBookItem(itemId: string): TechniqueCategory | null {
  return techniqueCategoryByBookItemId.get(itemId) ?? null;
}

/** 读取本地境界等级配置。 */
export function getLocalRealmLevelEntry(realmLv: number | undefined): GmEditorRealmOption | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!Number.isFinite(realmLv)) {
    return null;
  }
  const entry = realmLevelMap.get(Math.max(1, Math.floor(Number(realmLv))));
  return entry ? clone(entry) : null;
}

/** 读取本地技能模板副本。 */
export function getLocalSkillTemplate(skillId: string): SkillDef | null {
  const template = skillTemplateMap.get(skillId);
  return template ? clone(template) : null;
}

/** 读取本地 Buff 模板副本。 */
export function getLocalBuffTemplate(buffId: string): LocalBuffTemplate | null {
  const template = buffTemplateMap.get(buffId);
  return template ? { ...template } : null;
}

/** 读取本地任务模板副本。 */
export function getLocalQuestTemplate(questId: string): QuestState | null {
  const template = questTemplateMap.get(questId);
  return template ? clone(template as QuestState) : null;
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

  const template = getLocalItemTemplate(item.itemId);
  if (!template) {
    return item;
  }
  return {
    ...item,
    name: item.name || template.name,
    type: item.type || template.type,
    desc: item.desc || template.desc || '',
    groundLabel: item.groundLabel ?? template.groundLabel,
    grade: item.grade ?? template.grade,
    level: item.level ?? template.level,
    equipSlot: item.equipSlot ?? template.equipSlot,
    equipAttrs: item.equipAttrs ?? template.equipAttrs,
    equipStats: item.equipStats ?? template.equipStats,
    equipValueStats: item.equipValueStats ?? template.equipValueStats,
    effects: item.effects ?? template.effects,
    healAmount: item.healAmount ?? template.healAmount,
    healPercent: item.healPercent ?? template.healPercent,
    qiPercent: item.qiPercent ?? template.qiPercent,
    cooldown: item.cooldown ?? template.cooldown,
    enhanceLevel: item.enhanceLevel ?? template.enhanceLevel,
    alchemySuccessRate: item.alchemySuccessRate ?? template.alchemySuccessRate,
    alchemySpeedRate: item.alchemySpeedRate ?? template.alchemySpeedRate,
    enhancementSuccessRate: item.enhancementSuccessRate,
    enhancementSpeedRate: item.enhancementSpeedRate,
    consumeBuffs: item.consumeBuffs ?? template.consumeBuffs,
    tags: item.tags ?? template.tags,
    mapUnlockId: item.mapUnlockId ?? template.mapUnlockId,
    mapUnlockIds: item.mapUnlockIds ?? template.mapUnlockIds,
    respawnBindMapId: item.respawnBindMapId ?? template.respawnBindMapId,
    tileAuraGainAmount: item.tileAuraGainAmount ?? template.tileAuraGainAmount,
    tileResourceGains: item.tileResourceGains ?? template.tileResourceGains,
    useBehavior: item.useBehavior ?? template.useBehavior,
    allowBatchUse: item.allowBatchUse ?? template.allowBatchUse,
  };
}

/** 用本地模板补齐任务展示字段，保留服务端运行态字段。 */
export function resolvePreviewQuest(quest: QuestState): QuestState {
  const template = getLocalQuestTemplate(quest.id);
  const merged = template
    ? {
      ...template,
      ...quest,
      status: quest.status ?? template.status,
      progress: quest.progress ?? template.progress,
      required: quest.required ?? template.required,
    }
    : quest;
  return {
    ...merged,
    rewardItemIds: Array.isArray(merged.rewardItemIds) ? merged.rewardItemIds.slice() : [],
    rewards: (merged.rewards ?? []).map((item) => resolvePreviewItem(item)),
  };
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
  return {
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
  const resolvedLayers = resolvePreviewTechniqueLayers(technique.layers, template.layers);
  const templateSkills = clone(template.skills ?? []);
  const sourceSkills = technique.skills.length > 0 ? technique.skills : templateSkills;
  const realmLv = resolveTechniqueRealmLevel(technique.realmLv, technique.grade ?? template.grade);
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
  templateLayers: TechniqueLayerDef[] | undefined,
): TechniqueLayerDef[] {
  const templateByLevel = new Map((templateLayers ?? []).map((entry) => [entry.level, entry] as const));
  const baseLayers = sourceLayers && sourceLayers.length > 0
    ? sourceLayers
    : clone(templateLayers ?? []);
  return baseLayers.map((layer) => {
    const templateLayer = templateByLevel.get(layer.level);
    const legacySpecialStats = resolveLegacyLayerSpecialStats(layer.attrs);
    return {
      ...layer,
      attrs: cloneLayerAttrsWithoutSpecialStats(layer.attrs),
      specialStats: layer.specialStats
        ? { ...layer.specialStats }
        : legacySpecialStats ?? (templateLayer?.specialStats ? { ...templateLayer.specialStats } : undefined),
    };
  });
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
