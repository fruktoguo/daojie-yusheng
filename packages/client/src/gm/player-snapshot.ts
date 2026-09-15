/**
 * gm/player-snapshot.ts —— GM 玩家默认值/快照/装备法宝规范化/保存快照纯函数。
 *
 * 从 gm.ts 抽取：createDefaultItem/createDefaultTechnique/createDefaultQuest/
 * createDefaultBuff/normalizeGmEquipmentSlots/getArtifactSlotLabel/
 * createDefaultArtifactSlot/normalizeGmArtifactState/createDefaultPlayerSnapshot/
 * getPlayerDatabaseTables/buildTechniqueSaveSnapshot/buildInventoryItemSaveSnapshot/
 * buildEquipmentItemSaveSnapshot/buildArtifactSlotSaveSnapshot。
 * 全部为纯函数，仅依赖 @mud/shared 类型和 format.ts 的 clone，无模块级可变状态。
 */

import {
  ARTIFACT_SLOTS,
  type ArtifactSlot,
  DEFAULT_BASE_ATTRS,
  Direction,
  type EquipmentSlots,
  EQUIP_SLOTS,
  type GmEditorItemOption,
  type GmEditorTechniqueOption,
  type GmPlayerUpdateSection,
  type GmUpdatePlayerSnapshot,
  type ItemStack,
  type PlayerState,
  type QuestState,
  TechniqueRealm,
  type TemporaryBuffState,
  type TechniqueState,
  type GmManagedPlayerRecord,
  type GmPlayerDatabaseTableView,
} from '@mud/shared';
import { clone } from './format';
import { buildCraftSkillSaveSnapshot } from './editor-helpers';

/** createDefaultItem：创建默认物品。 */
export function createDefaultItem(equipSlot?: string): ItemStack {
  return {
    itemId: '',
    name: '',
    type: equipSlot ? 'equipment' : 'material',
    count: 1,
    desc: '',
    grade: equipSlot ? 'mortal' : undefined,
    level: equipSlot ? 1 : undefined,
    equipSlot: equipSlot as ItemStack['equipSlot'],
    equipAttrs: equipSlot ? {} : undefined,
    equipStats: equipSlot ? {} : undefined,
    tags: equipSlot ? [] : undefined,
    effects: equipSlot ? [] : undefined,
  };
}

/** createDefaultTechnique：创建默认 Technique。 */
export function createDefaultTechnique(): TechniqueState {
  return {
    techId: '',
    name: '',
    level: 1,
    exp: 0,
    expToNext: 0,
    realmLv: 1,
    realm: TechniqueRealm.Entry,
    skills: [],
    grade: 'mortal',
    category: 'internal',
    layers: [],
  };
}

/** createDefaultQuest：创建默认任务。 */
export function createDefaultQuest(): QuestState {
  return {
    id: '',
    title: '',
    desc: '',
    line: 'side',
    status: 'active',
    objectiveType: 'kill',
    progress: 0,
    required: 1,
    targetName: '',
    rewardText: '',
    targetMonsterId: '',
    rewardItemId: '',
    rewardItemIds: [],
    rewards: [],
    giverId: '',
    giverName: '',
    targetMapId: '',
    targetNpcId: '',
    submitMapId: '',
    submitNpcId: '',
  };
}

/** createDefaultBuff：创建默认 Buff。 */
export function createDefaultBuff(): TemporaryBuffState {
  return {
    buffId: '',
    name: '',
    shortMark: '',
    category: 'buff',
    visibility: 'public',
    remainingTicks: 1,
    duration: 1,
    stacks: 1,
    maxStacks: 1,
    sourceSkillId: '',
    attrs: {},
    stats: {},
  };
}

/** normalizeGmEquipmentSlots：规范化装备槽位。 */
export function normalizeGmEquipmentSlots(source: Partial<EquipmentSlots> | null | undefined): EquipmentSlots {
  return Object.fromEntries(
    EQUIP_SLOTS.map((slot) => [slot, source?.[slot] ?? null]),
  ) as EquipmentSlots;
}

/** getArtifactSlotLabel：读取法宝槽位标签。 */
export function getArtifactSlotLabel(slot: ArtifactSlot): string {
  return slot === 'artifact_1' ? '法宝' : slot;
}

/** createDefaultArtifactSlot：创建默认法宝槽位。 */
export function createDefaultArtifactSlot(slot: ArtifactSlot): PlayerState['artifacts']['slots'][number] {
  return {
    slot,
    unlocked: false,
    enabled: false,
    qi: 0,
    maxQi: 0,
    item: null,
  };
}

/** normalizeGmArtifactState：规范化法宝状态。 */
export function normalizeGmArtifactState(source: PlayerState['artifacts'] | null | undefined): PlayerState['artifacts'] {
  const bySlot = new Map<ArtifactSlot, PlayerState['artifacts']['slots'][number]>();
  for (const entry of Array.isArray(source?.slots) ? source.slots : []) {
    if (entry && ARTIFACT_SLOTS.includes(entry.slot)) {
      bySlot.set(entry.slot, entry);
    }
  }
  return {
    revision: Math.max(0, Math.trunc(Number(source?.revision) || 0)),
    slots: ARTIFACT_SLOTS.map((slot) => ({
      ...createDefaultArtifactSlot(slot),
      ...(bySlot.get(slot) ?? {}),
      slot,
      item: bySlot.get(slot)?.item ?? null,
    })),
  };
}

/** createDefaultPlayerSnapshot：创建默认玩家快照。 */
export function createDefaultPlayerSnapshot(source?: PlayerState): PlayerState {
  if (source) {
    const snapshot = clone(source);
    snapshot.equipment = normalizeGmEquipmentSlots(snapshot.equipment);
    snapshot.artifacts = normalizeGmArtifactState(snapshot.artifacts);
    return snapshot;
  }
  return {
    id: '',
    name: '',
    mapId: 'yunlai_town',
    x: 0,
    y: 0,
    facing: Direction.South,
    viewRange: 8,
    hp: 1,
    maxHp: 1,
    qi: 0,
    dead: false,
    foundation: 0,
    rootFoundation: 0,
    combatExp: 0,
    comprehension: 0,
    luck: 0,
    alchemySkill: { level: 1, exp: 0, expToNext: 0 },
    forgingSkill: { level: 1, exp: 0, expToNext: 0 },
    buildingSkill: { level: 1, exp: 0, expToNext: 0 },
    gatherSkill: { level: 1, exp: 0, expToNext: 0 },
    miningSkill: { level: 1, exp: 0, expToNext: 0 },
    formationSkill: { level: 1, exp: 0, expToNext: 0 },
    transmissionSkill: { level: 1, exp: 0, expToNext: 0 },
    enhancementSkill: { level: 1, exp: 0, expToNext: 0 },
    enhancementSkillLevel: 1,
    baseAttrs: { ...DEFAULT_BASE_ATTRS },
    bonuses: [],
    temporaryBuffs: [],
    inventory: { items: [], capacity: 24 },
    equipment: Object.fromEntries(EQUIP_SLOTS.map((slot) => [slot, null])) as EquipmentSlots,
    artifacts: {
      revision: 0,
      slots: [
        {
          slot: 'artifact_1',
          unlocked: false,
          enabled: false,
          qi: 0,
          maxQi: 0,
          item: null,
        },
      ],
    },
    techniques: [],
    actions: [],
    quests: [],
    autoBattle: false,
    autoBattleSkills: [],
    autoUsePills: [],
    autoBattleTargetingMode: 'auto',
    autoRetaliate: true,
    autoIdleCultivation: true,
    revealedBreakthroughRequirementIds: [],
  };
}

/** getPlayerDatabaseTables：读取玩家数据库表视图。 */
export function getPlayerDatabaseTables(detail: GmManagedPlayerRecord | null): GmPlayerDatabaseTableView[] {
  return Array.isArray(detail?.databaseTables) ? detail.databaseTables : [];
}

/** buildTechniqueSaveSnapshot：构建 Technique 保存快照。 */
export function buildTechniqueSaveSnapshot(
  technique: TechniqueState,
  findTechniqueCatalogEntry: (techId: string | undefined) => GmEditorTechniqueOption | null,
): TechniqueState {
  if (!findTechniqueCatalogEntry(technique.techId)) {
    return clone(technique);
  }
  return {
    techId: technique.techId,
    name: technique.name,
    level: technique.level,
    exp: technique.exp,
    expToNext: technique.expToNext,
    realmLv: technique.realmLv,
    realm: technique.realm,
    skills: [],
    grade: technique.grade,
    category: technique.category,
    layers: undefined,
  };
}

/** buildInventoryItemSaveSnapshot：构建背包物品保存快照。 */
export function buildInventoryItemSaveSnapshot(
  item: ItemStack,
  findItemCatalogEntry: (itemId: string | undefined) => GmEditorItemOption | null,
): ItemStack {
  if (!findItemCatalogEntry(item.itemId)) {
    return clone(item);
  }
  return {
    itemId: item.itemId,
    name: item.name,
    type: item.type,
    count: item.count,
    desc: item.desc,
    enhanceLevel: item.enhanceLevel,
  };
}

/** buildEquipmentItemSaveSnapshot：构建装备物品保存快照。 */
export function buildEquipmentItemSaveSnapshot(
  item: ItemStack | null,
  findItemCatalogEntry: (itemId: string | undefined) => GmEditorItemOption | null,
): ItemStack | null {
  if (!item) {
    return null;
  }
  if (!findItemCatalogEntry(item.itemId)) {
    return clone(item);
  }
  return {
    itemId: item.itemId,
    name: item.name,
    type: item.type,
    count: 1,
    desc: item.desc,
    equipSlot: item.equipSlot,
    enhanceLevel: item.enhanceLevel,
    artifactMaxQiFactor: item.artifactMaxQiFactor,
    artifactEffects: item.artifactEffects ? clone(item.artifactEffects) : undefined,
  };
}

/** buildArtifactSlotSaveSnapshot：构建法宝槽位保存快照。 */
export function buildArtifactSlotSaveSnapshot(
  entry: PlayerState['artifacts']['slots'][number],
  findItemCatalogEntry: (itemId: string | undefined) => GmEditorItemOption | null,
): PlayerState['artifacts']['slots'][number] {
  return {
    slot: entry.slot,
    unlocked: entry.unlocked === true,
    enabled: entry.enabled === true,
    qi: Math.max(0, Math.trunc(Number(entry.qi) || 0)),
    maxQi: Math.max(0, Math.trunc(Number(entry.maxQi) || 0)),
    item: buildEquipmentItemSaveSnapshot(entry.item, findItemCatalogEntry),
  };
}

/** ensureArrayHelper：确保数组辅助。 */
function ensureArrayHelper<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

/** buildSectionSnapshot：构建 Section 保存快照。 */
export function buildSectionSnapshot(
  section: GmPlayerUpdateSection,
  draft: PlayerState,
  findTechniqueCatalogEntry: (techId: string | undefined) => GmEditorTechniqueOption | null,
  findItemCatalogEntry: (itemId: string | undefined) => GmEditorItemOption | null,
  resolvePositionTargetInstanceId: (mapId: string) => string | undefined,
): GmUpdatePlayerSnapshot {
  switch (section) {
    case 'basic':
      return {
        name: draft.name,
        hp: draft.hp,
        maxHp: draft.maxHp,
        qi: draft.qi,
        dead: draft.dead,
        autoBattle: draft.autoBattle,
        autoRetaliate: draft.autoRetaliate,
        autoBattleStationary: draft.autoBattleStationary,
        allowAoePlayerHit: draft.allowAoePlayerHit,
        autoIdleCultivation: draft.autoIdleCultivation,
        autoSwitchCultivation: draft.autoSwitchCultivation,
        combatTargetId: draft.combatTargetId,
        combatTargetLocked: draft.combatTargetLocked,
      };
    case 'position':
      return {
        mapId: draft.mapId,
        instanceId: resolvePositionTargetInstanceId(draft.mapId),
        x: draft.x,
        y: draft.y,
        facing: draft.facing,
        viewRange: draft.viewRange,
      };
    case 'realm':
      return {
        baseAttrs: clone(draft.baseAttrs),
        realmLv: draft.realmLv,
        realm: typeof draft.realm?.progress === 'number'
          ? { progress: draft.realm.progress } as PlayerState['realm']
          : undefined,
        foundation: draft.foundation,
        rootFoundation: draft.rootFoundation,
        comprehension: draft.comprehension,
        luck: draft.luck,
        revealedBreakthroughRequirementIds: [...(draft.revealedBreakthroughRequirementIds ?? [])],
        bonuses: clone(ensureArrayHelper(draft.bonuses)),
      };
    case 'buffs':
      return {
        temporaryBuffs: clone(ensureArrayHelper(draft.temporaryBuffs)),
      };
    case 'techniques':
      return {
        techniques: ensureArrayHelper(draft.techniques).map((technique) => buildTechniqueSaveSnapshot(technique, findTechniqueCatalogEntry)),
        autoBattleSkills: clone(ensureArrayHelper(draft.autoBattleSkills)),
        cultivatingTechId: draft.cultivatingTechId,
      };
    case 'craftSkills':
      return {
        alchemySkill: buildCraftSkillSaveSnapshot(draft.alchemySkill),
        forgingSkill: buildCraftSkillSaveSnapshot(draft.forgingSkill),
        enhancementSkill: buildCraftSkillSaveSnapshot(draft.enhancementSkill),
        transmissionSkill: buildCraftSkillSaveSnapshot(draft.transmissionSkill),
        formationSkill: buildCraftSkillSaveSnapshot(draft.formationSkill),
        gatherSkill: buildCraftSkillSaveSnapshot(draft.gatherSkill),
        miningSkill: buildCraftSkillSaveSnapshot(draft.miningSkill),
        buildingSkill: buildCraftSkillSaveSnapshot(draft.buildingSkill),
        enhancementSkillLevel: Math.max(1, Math.trunc(Number(draft.enhancementSkill?.level ?? draft.enhancementSkillLevel) || 1)),
      };
    case 'items':
      return {
        inventory: {
          capacity: draft.inventory.capacity,
          items: ensureArrayHelper(draft.inventory.items).map((item) => buildInventoryItemSaveSnapshot(item, findItemCatalogEntry)),
        },
        equipment: Object.fromEntries(
          EQUIP_SLOTS.map((slot) => [slot, buildEquipmentItemSaveSnapshot(draft.equipment[slot], findItemCatalogEntry)]),
        ) as EquipmentSlots,
        artifacts: {
          revision: Math.max(0, Math.trunc(Number(draft.artifacts?.revision) || 0)),
          slots: normalizeGmArtifactState(draft.artifacts).slots.map((entry) => buildArtifactSlotSaveSnapshot(entry, findItemCatalogEntry)),
        },
      };
    case 'quests':
      return {
        quests: clone(ensureArrayHelper(draft.quests)),
      };
    default:
      return clone(draft);
  }
}
