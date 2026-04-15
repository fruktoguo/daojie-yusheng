import {
  calculateTechniqueSkillQiCost,
  deriveTechniqueRealm,
  type GmEditorItemOption,
  type GmEditorTechniqueOption,
  type GmEditorRealmOption,
  type ItemStack,
  type SkillDef,
  type TechniqueCategory,
  type TechniqueGrade,
  type TechniqueState,
} from '@mud/shared-next';
import { LOCAL_EDITOR_CATALOG } from '../constants/world/editor-catalog';

const itemTemplateMap = new Map(LOCAL_EDITOR_CATALOG.items.map((item) => [item.itemId, item] as const));
const techniqueTemplateMap = new Map(LOCAL_EDITOR_CATALOG.techniques.map((technique) => [technique.id, technique] as const));
const realmLevelMap = new Map(LOCAL_EDITOR_CATALOG.realmLevels.map((realm) => [realm.realmLv, realm] as const));
/** 按技能 ID 建立的本地技能模板索引。 */
const skillTemplateMap = new Map(
  LOCAL_EDITOR_CATALOG.techniques.flatMap((technique) =>
    (technique.skills ?? []).map((skill) => [skill.id, skill] as const),
  ),
);
/** 本地 Buff 模板的最小字段集合。 */
type LocalBuffTemplate = {
  buffId: string;
  name: string;
  shortMark?: string;
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
  if (!template) {
    return null;
  }
  return template.category ?? ((template.skills?.length ?? 0) > 0 ? 'arts' : 'internal');
}

/** 从书籍物品 ID 里拆出对应的功法 ID。 */
export function resolveTechniqueIdFromBookItemId(itemId: string): string | null {
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

/** 判断某个技能名是否属于本地神通系技能。 */
export function isLocalDivineSkillName(skillName: string): boolean {
  const normalizedName = skillName.trim();
  return normalizedName.length > 0 && divineSkillNameSet.has(normalizedName);
}

/** 计算功法预览时应使用的境界等级。 */
function resolveTechniqueRealmLevel(realmLv: number | undefined, grade: TechniqueGrade | undefined): number {
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
    consumeBuffs: item.consumeBuffs ?? template.consumeBuffs,
    tags: item.tags ?? template.tags,
    mapUnlockId: item.mapUnlockId ?? template.mapUnlockId,
    mapUnlockIds: item.mapUnlockIds ?? template.mapUnlockIds,
    tileAuraGainAmount: item.tileAuraGainAmount ?? template.tileAuraGainAmount,
    allowBatchUse: item.allowBatchUse ?? template.allowBatchUse,
  };
}

/** 用本地模板补齐技能预览字段。 */
export function resolvePreviewSkill(skill: SkillDef): SkillDef {
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
  const template = getLocalTechniqueTemplate(technique.techId);
  if (!template) {
    return {
      ...technique,
      realmLv: resolveTechniqueRealmLevel(technique.realmLv, technique.grade),
      realm: deriveTechniqueRealm(technique.level, technique.layers, technique.attrCurves),
      skills: resolvePreviewSkills(technique.skills),
      category: technique.category ?? (technique.skills.length > 0 ? 'arts' : 'internal'),
    };
  }
  const resolvedLayers = technique.layers && technique.layers.length > 0
    ? technique.layers
    : clone(template.layers ?? []);
  const templateSkills = clone(template.skills ?? []);
  const sourceSkills = technique.skills.length > 0 ? technique.skills : templateSkills;
  const realmLv = resolveTechniqueRealmLevel(technique.realmLv, technique.grade ?? template.grade);
  return {
    ...technique,
    name: technique.name || template.name,
    grade: technique.grade ?? template.grade,
    category: technique.category ?? template.category ?? (sourceSkills.length > 0 ? 'arts' : 'internal'),
    realmLv,
    realm: deriveTechniqueRealm(technique.level, resolvedLayers, technique.attrCurves),
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

/** 批量补齐功法预览数据。 */
export function resolvePreviewTechniques(techniques: TechniqueState[] | undefined): TechniqueState[] {
  return (techniques ?? []).map((technique) => resolvePreviewTechnique(technique));
}
