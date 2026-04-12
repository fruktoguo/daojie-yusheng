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
} from '@mud/shared';
import { LOCAL_EDITOR_CATALOG } from '../constants/world/editor-catalog';

/** itemTemplateMap：定义该变量以承载业务值。 */
const itemTemplateMap = new Map(LOCAL_EDITOR_CATALOG.items.map((item) => [item.itemId, item] as const));
/** techniqueTemplateMap：定义该变量以承载业务值。 */
const techniqueTemplateMap = new Map(LOCAL_EDITOR_CATALOG.techniques.map((technique) => [technique.id, technique] as const));
/** realmLevelMap：定义该变量以承载业务值。 */
const realmLevelMap = new Map(LOCAL_EDITOR_CATALOG.realmLevels.map((realm) => [realm.realmLv, realm] as const));
/** skillTemplateMap：定义该变量以承载业务值。 */
const skillTemplateMap = new Map(
  LOCAL_EDITOR_CATALOG.techniques.flatMap((technique) =>
    (technique.skills ?? []).map((skill) => [skill.id, skill] as const),
  ),
);
/** LocalBuffTemplate：定义该类型的结构与数据语义。 */
type LocalBuffTemplate = {
/** buffId：定义该变量以承载业务值。 */
  buffId: string;
/** name：定义该变量以承载业务值。 */
  name: string;
  shortMark?: string;
  category?: 'buff' | 'debuff';
};

/** buffTemplateMap：定义该变量以承载业务值。 */
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
/** divineSkillNameSet：定义该变量以承载业务值。 */
const divineSkillNameSet = new Set(
  LOCAL_EDITOR_CATALOG.techniques.flatMap((technique) => {
/** category：定义该变量以承载业务值。 */
    const category = resolveTechniqueCategoryFromTemplate(technique);
    if (category !== 'divine') {
      return [];
    }
    return (technique.skills ?? []).map((skill) => skill.name.trim()).filter((name) => name.length > 0);
  }),
);
/** techniqueCategoryByBookItemId：定义该变量以承载业务值。 */
const techniqueCategoryByBookItemId = new Map<string, TechniqueCategory>();
/** DEFAULT_TECHNIQUE_REALM_LEVEL_BY_GRADE：定义该变量以承载业务值。 */
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

/** clone：执行对应的业务逻辑。 */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** resolveTechniqueCategoryFromTemplate：执行对应的业务逻辑。 */
function resolveTechniqueCategoryFromTemplate(template: GmEditorTechniqueOption | undefined): TechniqueCategory | null {
  if (!template) {
    return null;
  }
  return template.category ?? ((template.skills?.length ?? 0) > 0 ? 'arts' : 'internal');
}

/** resolveTechniqueIdFromBookItemId：执行对应的业务逻辑。 */
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
/** techniqueId：定义该变量以承载业务值。 */
  const techniqueId = resolveTechniqueIdFromBookItemId(item.itemId);
/** category：定义该变量以承载业务值。 */
  const category = resolveTechniqueCategoryFromTemplate(
    techniqueId ? techniqueTemplateMap.get(techniqueId) : undefined,
  );
  if (category) {
    techniqueCategoryByBookItemId.set(item.itemId, category);
  }
}

/** getLocalItemTemplate：执行对应的业务逻辑。 */
export function getLocalItemTemplate(itemId: string): GmEditorItemOption | null {
/** template：定义该变量以承载业务值。 */
  const template = itemTemplateMap.get(itemId);
  return template ? clone(template) : null;
}

/** getLocalTechniqueTemplate：执行对应的业务逻辑。 */
export function getLocalTechniqueTemplate(techId: string): GmEditorTechniqueOption | null {
/** template：定义该变量以承载业务值。 */
  const template = techniqueTemplateMap.get(techId);
  return template ? clone(template) : null;
}

/** getLocalTechniqueCategoryForBookItem：执行对应的业务逻辑。 */
export function getLocalTechniqueCategoryForBookItem(itemId: string): TechniqueCategory | null {
  return techniqueCategoryByBookItemId.get(itemId) ?? null;
}

/** getLocalRealmLevelEntry：执行对应的业务逻辑。 */
export function getLocalRealmLevelEntry(realmLv: number | undefined): GmEditorRealmOption | null {
  if (!Number.isFinite(realmLv)) {
    return null;
  }
/** entry：定义该变量以承载业务值。 */
  const entry = realmLevelMap.get(Math.max(1, Math.floor(Number(realmLv))));
  return entry ? clone(entry) : null;
}

/** getLocalSkillTemplate：执行对应的业务逻辑。 */
export function getLocalSkillTemplate(skillId: string): SkillDef | null {
/** template：定义该变量以承载业务值。 */
  const template = skillTemplateMap.get(skillId);
  return template ? clone(template) : null;
}

/** getLocalBuffTemplate：执行对应的业务逻辑。 */
export function getLocalBuffTemplate(buffId: string): LocalBuffTemplate | null {
/** template：定义该变量以承载业务值。 */
  const template = buffTemplateMap.get(buffId);
  return template ? { ...template } : null;
}

/** isLocalDivineSkillName：执行对应的业务逻辑。 */
export function isLocalDivineSkillName(skillName: string): boolean {
/** normalizedName：定义该变量以承载业务值。 */
  const normalizedName = skillName.trim();
  return normalizedName.length > 0 && divineSkillNameSet.has(normalizedName);
}

/** resolveTechniqueRealmLevel：执行对应的业务逻辑。 */
function resolveTechniqueRealmLevel(realmLv: number | undefined, grade: TechniqueGrade | undefined): number {
  if (Number.isFinite(realmLv)) {
    return Math.max(1, Math.floor(Number(realmLv)));
  }
  if (grade) {
    return DEFAULT_TECHNIQUE_REALM_LEVEL_BY_GRADE[grade] ?? 1;
  }
  return 1;
}

/** resolvePreviewItem：执行对应的业务逻辑。 */
export function resolvePreviewItem(item: ItemStack): ItemStack {
/** template：定义该变量以承载业务值。 */
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
    enhanceLevel: item.enhanceLevel ?? template.enhanceLevel,
    alchemySuccessRate: item.alchemySuccessRate ?? template.alchemySuccessRate,
    alchemySpeedRate: item.alchemySpeedRate ?? template.alchemySpeedRate,
    enhancementSpeedRate: item.enhancementSpeedRate ?? template.enhancementSpeedRate,
    mapUnlockId: item.mapUnlockId ?? template.mapUnlockId,
    tileAuraGainAmount: item.tileAuraGainAmount ?? template.tileAuraGainAmount,
    allowBatchUse: item.allowBatchUse ?? template.allowBatchUse,
  };
}

/** resolvePreviewSkill：执行对应的业务逻辑。 */
export function resolvePreviewSkill(skill: SkillDef): SkillDef {
/** template：定义该变量以承载业务值。 */
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

/** resolvePreviewSkills：执行对应的业务逻辑。 */
export function resolvePreviewSkills(skills: SkillDef[] | undefined): SkillDef[] {
  return (skills ?? []).map((skill) => resolvePreviewSkill(skill));
}

/** resolvePreviewTechniqueSkill：执行对应的业务逻辑。 */
function resolvePreviewTechniqueSkill(
  skill: SkillDef,
  techniqueGrade: TechniqueState['grade'],
  techniqueRealmLv: number,
  templateSkill?: SkillDef,
): SkillDef {
/** merged：定义该变量以承载业务值。 */
  const merged = resolvePreviewSkill({
    ...(templateSkill ?? {}),
    ...skill,
  } as SkillDef);
/** costMultiplier：定义该变量以承载业务值。 */
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

/** resolvePreviewTechnique：执行对应的业务逻辑。 */
export function resolvePreviewTechnique(technique: TechniqueState): TechniqueState {
/** template：定义该变量以承载业务值。 */
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
/** resolvedLayers：定义该变量以承载业务值。 */
  const resolvedLayers = technique.layers && technique.layers.length > 0
    ? technique.layers
    : clone(template.layers ?? []);
/** templateSkills：定义该变量以承载业务值。 */
  const templateSkills = clone(template.skills ?? []);
/** knownTemplateSkillIds：定义该变量以承载业务值。 */
  const knownTemplateSkillIds = new Set(templateSkills.map((skill) => skill.id));
/** persistedKnownSkills：定义该变量以承载业务值。 */
  const persistedKnownSkills = technique.skills.length > 0
    ? technique.skills.filter((skill) => knownTemplateSkillIds.has(skill.id))
    : [];
/** sourceSkills：定义该变量以承载业务值。 */
  const sourceSkills = persistedKnownSkills.length > 0 ? persistedKnownSkills : templateSkills;
/** realmLv：定义该变量以承载业务值。 */
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

/** resolvePreviewTechniques：执行对应的业务逻辑。 */
export function resolvePreviewTechniques(techniques: TechniqueState[] | undefined): TechniqueState[] {
  return (techniques ?? []).map((technique) => resolvePreviewTechnique(technique));
}

