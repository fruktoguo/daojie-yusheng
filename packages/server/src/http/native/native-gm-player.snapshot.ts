/**
 * GM 玩家管理服务 — 快照变更内部件及 parse/normalize 工具。
 *
 * 从 native-gm-player.service.ts 拆分而来，使用模式 B 委托。
 * 维护时要保持快照变更语义与持久化真源边界一致。
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_INVENTORY_CAPACITY,
  Direction,
  ARTIFACT_SLOTS,
  EQUIP_SLOTS,
  DUNGEON_MAX_STAMINA,
  MERIT_ETERNAL_DAILY_SIGN_IN_FIXED_BONUS,
  MERIT_ETERNAL_POOL_GRANT,
  VIEW_RADIUS,
  getBodyTrainingExpToNext,
  mergeItemStackInto,
  normalizeBodyTrainingState,
} from '@mud/shared';
import { resolveCraftSkillExpToNextByLevel } from '../../runtime/craft/craft-skill-exp.helpers';
import { reassignItemInstanceId } from '../../runtime/world/item-instance-id.helpers';
import { createRuntimeTemporaryBuff, materializeRuntimeTemporaryBuff } from '../../runtime/player/runtime-buff-instance';
import { NATIVE_GM_PLAYER_MUTATION_CONTRACT } from './native-gm-contract';
import { isNativeGmBotPlayerId } from './native-gm.constants';
import type { GmActorContext } from './native-gm-actor-context';
import {
  addRecoveryPillMigrationSummary,
  asGmItemRecord,
  clamp,
  cloneRatioDivisors,
  createEmptyRecoveryPillMigrationSummary,
  decodePersistedRawBaseAttrs,
  encodePersistedRawBaseAttrs,
  hasRecoveryPillMigration,
  isLegacyRecoveryPillItemId,
  normalizeGmItemString,
  normalizeRawBaseAttrs,
  normalizeStableGmItemInstanceId,
  resolveRecoveryPillMigrationTarget,
  toLegacyArtifactSlots,
  toLegacyEquipmentSlots,
  writeGmItemOwnProperty,
  type RecoveryPillMigrationSummary,
} from './native-gm-player.helpers';
import type {
  ContentTemplateRepositoryLike,
  GmPlayerScopeOptions,
  PersistedPlayerEntryLike,
  PlayerDomainPersistenceServiceLike,
  PlayerProgressionServiceLike,
  PlayerRuntimeServiceLike,
  WorldRuntimeServiceLike,
} from './native-gm-player.ports';
import type { NativeGmPlayerService } from './native-gm-player.service';
import { GM_CRAFT_SKILL_KEYS, GM_GENERATED_TECHNIQUE_LEGACY_DRAFT_ERROR } from './native-gm-player.service';

export function normalizeGmInventoryItemForSaveImpl(self: NativeGmPlayerService, currentItem: unknown, submittedItem: unknown) {
    const submitted = asGmItemRecord(submittedItem);
    const itemId = normalizeGmItemString(submitted?.itemId);
    if (!submitted || !itemId) {
      return null;
    }
    const count = Number.isFinite(submitted.count)
      ? Math.max(1, Math.trunc(submitted.count as number))
      : 1;
    const normalized = asGmItemRecord(self.contentTemplateRepository.normalizeItem({
      ...submitted,
      itemId,
      count,
    })) ?? {
      ...submitted,
      itemId,
      count,
    };
    writeGmItemOwnProperty(normalized, 'itemId', itemId);
    writeGmItemOwnProperty(normalized, 'count', count);
    self.normalizeGmEditedItemInstanceId(normalized, submitted, currentItem, itemId);
    return normalized;
}

export function normalizeGmEquipmentItemForSaveImpl(self: NativeGmPlayerService, currentItem: unknown, submittedItem: unknown) {
    const submitted = asGmItemRecord(submittedItem);
    const itemId = normalizeGmItemString(submitted?.itemId);
    if (!submitted || !itemId) {
      return null;
    }
    const normalized = asGmItemRecord(self.contentTemplateRepository.normalizeItem({
      ...submitted,
      itemId,
      count: 1,
    })) ?? {
      ...submitted,
      itemId,
      count: 1,
    };
    writeGmItemOwnProperty(normalized, 'itemId', itemId);
    writeGmItemOwnProperty(normalized, 'count', 1);
    self.normalizeGmEditedItemInstanceId(normalized, submitted, currentItem, itemId);
    return normalized;
}

export function normalizeGmEditedItemInstanceIdImpl(self: NativeGmPlayerService, normalized: Record<string, unknown>,
    submitted: Record<string, unknown>,
    currentItem: unknown,
    itemId: string,) {
    const current = asGmItemRecord(currentItem);
    const currentItemId = normalizeGmItemString(current?.itemId);
    const currentInstanceId = normalizeStableGmItemInstanceId(current?.itemInstanceId);
    const submittedInstanceId = normalizeStableGmItemInstanceId(submitted.itemInstanceId);
    const normalizedInstanceId = normalizeStableGmItemInstanceId(normalized.itemInstanceId);
    const incomingInstanceId = submittedInstanceId ?? normalizedInstanceId;

    if (
      currentInstanceId
      && currentItemId === itemId
      && (!incomingInstanceId || incomingInstanceId === currentInstanceId)
    ) {
      writeGmItemOwnProperty(normalized, 'itemInstanceId', currentInstanceId);
      return;
    }

    reassignItemInstanceId(normalized as any);
}

export function applyPlayerSnapshotMutationImpl(self: NativeGmPlayerService, next, snapshot, section) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (section === null || section === 'basic') {
      if (typeof snapshot.name === 'string' && snapshot.name.trim()) {
        next.name = snapshot.name.trim();
      }
      if (typeof snapshot.displayName === 'string' && snapshot.displayName.trim()) {
        next.displayName = snapshot.displayName.trim();
      }
      if (Number.isFinite(snapshot.maxHp)) {
        next.maxHp = Math.max(1, Math.trunc(snapshot.maxHp));
      }
      if (Number.isFinite(snapshot.maxQi)) {
        next.maxQi = Math.max(0, Math.trunc(snapshot.maxQi));
      }
      if (Number.isFinite(snapshot.hp)) {
        next.hp = clamp(Math.trunc(snapshot.hp), 0, next.maxHp);
      }
      if (Number.isFinite(snapshot.qi)) {
        next.qi = clamp(Math.trunc(snapshot.qi), 0, next.maxQi);
      }
      if (typeof snapshot.dead === 'boolean') {
        next.hp = snapshot.dead ? 0 : Math.max(1, next.hp);
      }
      if (typeof snapshot.autoBattle === 'boolean') {
        next.combat.autoBattle = snapshot.autoBattle;
      }
      if (typeof snapshot.autoRetaliate === 'boolean') {
        next.combat.autoRetaliate = snapshot.autoRetaliate;
      }
      if (typeof snapshot.autoBattleStationary === 'boolean') {
        next.combat.autoBattleStationary = snapshot.autoBattleStationary;
      }
      if (typeof snapshot.allowAoePlayerHit === 'boolean') {
        next.combat.allowAoePlayerHit = snapshot.allowAoePlayerHit;
      }
      if (typeof snapshot.autoIdleCultivation === 'boolean') {
        next.combat.autoIdleCultivation = snapshot.autoIdleCultivation;
      }
      if (typeof snapshot.autoSwitchCultivation === 'boolean') {
        next.combat.autoSwitchCultivation = snapshot.autoSwitchCultivation;
      }
      if (typeof snapshot.senseQiActive === 'boolean') {
        next.combat.senseQiActive = snapshot.senseQiActive;
      }
      if (Array.isArray(snapshot.autoBattleSkills)) {
        next.combat.autoBattleSkills = snapshot.autoBattleSkills
          .filter((entry) => Boolean(entry && typeof entry.skillId === 'string' && entry.skillId.trim()))
          .map((entry) => ({
            skillId: entry.skillId.trim(),
            enabled: entry.enabled !== false,
            skillEnabled: entry.skillEnabled !== false,
            autoBattleOrder: Number.isFinite(entry.autoBattleOrder)
              ? Math.max(0, Math.trunc(entry.autoBattleOrder))
              : undefined,
          }));
      }
      if (Array.isArray(snapshot.temporaryBuffs)) {
        next.buffs.buffs = snapshot.temporaryBuffs.map((entry) => createRuntimeTemporaryBuff(entry));
        next.buffs.revision += 1;
      }
    }

    if (section === 'realm') {
      if (snapshot.baseAttrs && typeof snapshot.baseAttrs === 'object') {
        next.attrs.rawBaseAttrs = normalizeRawBaseAttrs(snapshot.baseAttrs);
      }
      if (Number.isFinite(snapshot.foundation)) {
        next.foundation = Math.max(0, Math.trunc(snapshot.foundation));
      }
      if (Number.isFinite(snapshot.rootFoundation)) {
        next.rootFoundation = Math.max(0, Math.trunc(snapshot.rootFoundation));
      }
      if (Number.isFinite(snapshot.combatExp)) {
        next.combatExp = Math.max(0, Math.trunc(snapshot.combatExp));
      }
      if (Number.isFinite(snapshot.comprehension)) {
        next.comprehension = Math.max(0, Math.trunc(snapshot.comprehension));
      }
      if (Number.isFinite(snapshot.luck)) {
        next.luck = Math.max(0, Math.trunc(snapshot.luck));
      }

      const realmLv = Number.isFinite(snapshot.realmLv) ? Math.trunc(snapshot.realmLv) : next.realm?.realmLv ?? 1;

      const progress = Number.isFinite(snapshot.realm?.progress)
        ? Math.trunc(snapshot.realm.progress)
        : next.realm?.progress ?? 0;
      next.realm = self.playerProgressionService.createRealmStateFromLevel(realmLv, progress);
    }

    if (section === 'techniques') {
      if (Array.isArray(snapshot.techniques)) {
        next.techniques.techniques = snapshot.techniques
          .filter((entry) => Boolean(entry && typeof entry.techId === 'string' && entry.techId.trim()))
          .map((entry) => self.hydrateGmTechniqueSnapshot(entry))
          .sort((left, right) => left.techId.localeCompare(right.techId, 'zh-Hans-CN'));
        next.techniques.revision += 1;
      }
      if (
        snapshot.cultivatingTechId === undefined ||
        snapshot.cultivatingTechId === null ||
        typeof snapshot.cultivatingTechId === 'string'
      ) {
        next.techniques.cultivatingTechId = snapshot.cultivatingTechId?.trim() || null;
      }
      if (Array.isArray(snapshot.autoBattleSkills)) {
        next.combat.autoBattleSkills = snapshot.autoBattleSkills
          .filter((entry) => Boolean(entry && typeof entry.skillId === 'string' && entry.skillId.trim()))
          .map((entry) => ({
            skillId: entry.skillId.trim(),
            enabled: entry.enabled !== false,
            skillEnabled: entry.skillEnabled !== false,
            autoBattleOrder: Number.isFinite(entry.autoBattleOrder)
              ? Math.max(0, Math.trunc(entry.autoBattleOrder))
              : undefined,
          }));
      }
    }

    if (section === 'craftSkills') {
      self.applyCraftSkillSnapshotMutation(next, snapshot);
    }

    if (section === 'items') {
      if (snapshot.inventory && typeof snapshot.inventory === 'object') {
        if (Number.isFinite(snapshot.inventory.capacity)) {
          next.inventory.capacity = Math.max(DEFAULT_INVENTORY_CAPACITY, Math.trunc(snapshot.inventory.capacity));
        }
        if (Array.isArray(snapshot.inventory.items)) {
          next.inventory.items = snapshot.inventory.items
            .filter((entry) => Boolean(entry && typeof entry.itemId === 'string' && entry.itemId.trim()))
            .map((entry, index) => self.normalizeGmInventoryItemForSave(next.inventory.items[index], entry))
            .filter((entry): entry is Record<string, unknown> => entry !== null);
          next.inventory.revision += 1;
        }
      }
      if (snapshot.equipment && typeof snapshot.equipment === 'object') {
        for (const slot of EQUIP_SLOTS) {
          if (!(slot in snapshot.equipment)) {
            continue;
          }

          const record = next.equipment.slots.find((entry) => entry.slot === slot);
          if (!record) {
            continue;
          }

          const item = snapshot.equipment[slot];
          if (item && typeof item.itemId === 'string' && item.itemId.trim()) {
            const normalized = self.normalizeGmEquipmentItemForSave(record.item, item);
            record.item = normalized;
          } else {
            record.item = null;
          }
        }
        next.equipment.revision += 1;
      }
      if (snapshot.artifacts && typeof snapshot.artifacts === 'object' && Array.isArray(snapshot.artifacts.slots)) {
        next.artifacts ??= { revision: 1, slots: [] };
        if (!Array.isArray(next.artifacts.slots)) {
          next.artifacts.slots = [];
        }
        const submittedSlotsByType = new Map(snapshot.artifacts.slots.map((entry) => [entry?.slot, entry]));
        for (const slot of ARTIFACT_SLOTS) {
          const submittedSlot = submittedSlotsByType.get(slot);
          if (!submittedSlot || typeof submittedSlot !== 'object') {
            continue;
          }
          const submittedRecord = submittedSlot as Record<string, any>;
          let record = next.artifacts.slots.find((entry) => entry.slot === slot);
          if (!record) {
            record = { slot, unlocked: false, enabled: false, qi: 0, maxQi: 0, item: null };
            next.artifacts.slots.push(record);
          }
          record.unlocked = submittedRecord.unlocked === true;
          record.enabled = submittedRecord.enabled === true;
          record.qi = Number.isFinite(submittedRecord.qi) ? Math.max(0, Math.trunc(submittedRecord.qi)) : 0;
          record.maxQi = Number.isFinite(submittedRecord.maxQi) ? Math.max(0, Math.trunc(submittedRecord.maxQi)) : 0;
          const item = submittedRecord.item;
          record.item = item && typeof item.itemId === 'string' && item.itemId.trim()
            ? self.normalizeGmEquipmentItemForSave(record.item, item)
            : null;
        }
        next.artifacts.revision = Math.max(1, Math.trunc(Number(next.artifacts.revision) || 1) + 1);
      }
    }

    if (section === 'quests' && Array.isArray(snapshot.quests)) {
      next.quests.quests = snapshot.quests.map((entry) => ({
        ...entry,
        rewardItemIds: Array.isArray(entry.rewardItemIds) ? entry.rewardItemIds.slice() : [],
        rewards: Array.isArray(entry.rewards) ? entry.rewards.map((reward) => ({ ...reward })) : [],
      }));
      next.quests.revision += 1;
    }
}

export function applyPositionToPersistenceSnapshotImpl(self: NativeGmPlayerService, persisted, snapshot) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (typeof snapshot.mapId === 'string' && snapshot.mapId.trim()) {
      self.mapTemplateRepository.getOrThrow(snapshot.mapId.trim());
      persisted.placement.templateId = snapshot.mapId.trim();
    }

    const template = self.mapTemplateRepository.getOrThrow(persisted.placement.templateId);
    if (Number.isFinite(snapshot.x)) {
      persisted.placement.x = clamp(Math.trunc(snapshot.x), 0, Math.max(0, template.width - 1));
    }
    if (Number.isFinite(snapshot.y)) {
      persisted.placement.y = clamp(Math.trunc(snapshot.y), 0, Math.max(0, template.height - 1));
    }
    if (Number.isFinite(snapshot.facing)) {
      persisted.placement.facing = Math.trunc(snapshot.facing);
    }
    if (Number.isFinite(snapshot.hp)) {
      persisted.vitals.hp = clamp(Math.trunc(snapshot.hp), 0, persisted.vitals.maxHp);
    }
    if (typeof snapshot.autoBattle === 'boolean') {
      persisted.combat.autoBattle = snapshot.autoBattle;
    }
}

export function applyPlayerSnapshotMutationToPersistenceImpl(self: NativeGmPlayerService, persisted, snapshot, section) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (section === null || section === 'basic') {
      if (Number.isFinite(snapshot.maxHp)) {
        persisted.vitals.maxHp = Math.max(1, Math.trunc(snapshot.maxHp));
        if (persisted.vitals.hp > persisted.vitals.maxHp) {
          persisted.vitals.hp = persisted.vitals.maxHp;
        }
      }
      if (Number.isFinite(snapshot.maxQi)) {
        persisted.vitals.maxQi = Math.max(0, Math.trunc(snapshot.maxQi));
        if (persisted.vitals.qi > persisted.vitals.maxQi) {
          persisted.vitals.qi = persisted.vitals.maxQi;
        }
      }
      if (Number.isFinite(snapshot.hp)) {
        persisted.vitals.hp = clamp(Math.trunc(snapshot.hp), 0, persisted.vitals.maxHp);
      }
      if (Number.isFinite(snapshot.qi)) {
        persisted.vitals.qi = clamp(Math.trunc(snapshot.qi), 0, persisted.vitals.maxQi);
      }
      if (typeof snapshot.dead === 'boolean') {
        persisted.vitals.hp = snapshot.dead ? 0 : Math.max(1, persisted.vitals.hp);
      }
      if (typeof snapshot.autoBattle === 'boolean') {
        persisted.combat.autoBattle = snapshot.autoBattle;
      }
      if (typeof snapshot.autoRetaliate === 'boolean') {
        persisted.combat.autoRetaliate = snapshot.autoRetaliate;
      }
      if (typeof snapshot.autoBattleStationary === 'boolean') {
        persisted.combat.autoBattleStationary = snapshot.autoBattleStationary;
      }
      if (typeof snapshot.allowAoePlayerHit === 'boolean') {
        persisted.combat.allowAoePlayerHit = snapshot.allowAoePlayerHit;
      }
      if (typeof snapshot.autoIdleCultivation === 'boolean') {
        persisted.combat.autoIdleCultivation = snapshot.autoIdleCultivation;
      }
      if (typeof snapshot.autoSwitchCultivation === 'boolean') {
        persisted.combat.autoSwitchCultivation = snapshot.autoSwitchCultivation;
      }
      if (typeof snapshot.senseQiActive === 'boolean') {
        persisted.combat.senseQiActive = snapshot.senseQiActive;
      }
      if (Array.isArray(snapshot.autoBattleSkills)) {
        persisted.combat.autoBattleSkills = snapshot.autoBattleSkills
          .filter((entry) => Boolean(entry && typeof entry.skillId === 'string' && entry.skillId.trim()))
          .map((entry) => ({
            skillId: entry.skillId.trim(),
            enabled: entry.enabled !== false,
            skillEnabled: entry.skillEnabled !== false,
            autoBattleOrder: Number.isFinite(entry.autoBattleOrder)
              ? Math.max(0, Math.trunc(entry.autoBattleOrder))
              : undefined,
          }));
      }
      if (Array.isArray(snapshot.temporaryBuffs)) {
        persisted.buffs.buffs = snapshot.temporaryBuffs.map((entry) => createRuntimeTemporaryBuff(entry));
        persisted.buffs.revision = Math.max(1, (persisted.buffs.revision ?? 1) + 1);
      }
    }

    if (section === 'realm') {
      if (snapshot.baseAttrs && typeof snapshot.baseAttrs === 'object') {
        persisted.attrState = persisted.attrState ?? {};
        persisted.attrState.baseAttrs = encodePersistedRawBaseAttrs(snapshot.baseAttrs);
      }
      if (Number.isFinite(snapshot.foundation)) {
        persisted.progression.foundation = Math.max(0, Math.trunc(snapshot.foundation));
      }
      if (Number.isFinite(snapshot.rootFoundation)) {
        persisted.progression.rootFoundation = Math.max(0, Math.trunc(snapshot.rootFoundation));
      }
      if (Number.isFinite(snapshot.combatExp)) {
        persisted.progression.combatExp = Math.max(0, Math.trunc(snapshot.combatExp));
      }
      if (Number.isFinite(snapshot.comprehension)) {
        persisted.progression.comprehension = Math.max(0, Math.trunc(snapshot.comprehension));
      }
      if (Number.isFinite(snapshot.luck)) {
        persisted.progression.luck = Math.max(0, Math.trunc(snapshot.luck));
      }

      const realmLv = Number.isFinite(snapshot.realmLv)
        ? Math.trunc(snapshot.realmLv)
        : persisted.progression.realm?.realmLv ?? 1;

      const progress = Number.isFinite(snapshot.realm?.progress)
        ? Math.trunc(snapshot.realm.progress)
        : persisted.progression.realm?.progress ?? 0;
      persisted.progression.realm = self.playerProgressionService.createRealmStateFromLevel(realmLv, progress);
    }

    if (section === 'techniques') {
      if (Array.isArray(snapshot.techniques)) {
        persisted.techniques.techniques = snapshot.techniques
          .filter((entry) => Boolean(entry && typeof entry.techId === 'string' && entry.techId.trim()))
          .map((entry) => self.hydrateGmTechniqueSnapshot(entry))
          .sort((left, right) => left.techId.localeCompare(right.techId, 'zh-Hans-CN'));
        persisted.techniques.revision = Math.max(1, (persisted.techniques.revision ?? 1) + 1);
      }
      if (
        snapshot.cultivatingTechId === undefined ||
        snapshot.cultivatingTechId === null ||
        typeof snapshot.cultivatingTechId === 'string'
      ) {
        persisted.techniques.cultivatingTechId = snapshot.cultivatingTechId?.trim() || null;
      }
      if (Array.isArray(snapshot.autoBattleSkills)) {
        persisted.combat.autoBattleSkills = snapshot.autoBattleSkills
          .filter((entry) => Boolean(entry && typeof entry.skillId === 'string' && entry.skillId.trim()))
          .map((entry) => ({
            skillId: entry.skillId.trim(),
            enabled: entry.enabled !== false,
            skillEnabled: entry.skillEnabled !== false,
            autoBattleOrder: Number.isFinite(entry.autoBattleOrder)
              ? Math.max(0, Math.trunc(entry.autoBattleOrder))
              : undefined,
          }));
      }
    }

    if (section === 'craftSkills') {
      self.applyCraftSkillSnapshotMutationToPersistence(persisted, snapshot);
    }

    if (section === 'items') {
      if (snapshot.inventory && typeof snapshot.inventory === 'object') {
        if (Number.isFinite(snapshot.inventory.capacity)) {
          persisted.inventory.capacity = Math.max(DEFAULT_INVENTORY_CAPACITY, Math.trunc(snapshot.inventory.capacity));
        }
        if (Array.isArray(snapshot.inventory.items)) {
          persisted.inventory.items = snapshot.inventory.items
            .filter((entry) => Boolean(entry && typeof entry.itemId === 'string' && entry.itemId.trim()))
            .map((entry, index) => self.normalizeGmInventoryItemForSave(persisted.inventory.items[index], entry))
            .filter((entry): entry is Record<string, unknown> => entry !== null);
          persisted.inventory.revision = Math.max(1, (persisted.inventory.revision ?? 1) + 1);
        }
      }
      if (snapshot.equipment && typeof snapshot.equipment === 'object') {
        const currentSlotsByType = new Map(
          (Array.isArray(persisted.equipment.slots) ? persisted.equipment.slots : [])
            .map((entry) => [entry?.slot, entry?.item]),
        );
        const nextSlots = [];
        for (const slot of EQUIP_SLOTS) {
          const item = snapshot.equipment[slot];
          const currentItem = currentSlotsByType.get(slot);
          nextSlots.push({
            slot,
            item:
              item && typeof item.itemId === 'string' && item.itemId.trim()
                ? self.normalizeGmEquipmentItemForSave(currentItem, item)
                : null,
          });
        }
        persisted.equipment.slots = nextSlots;
        persisted.equipment.revision = Math.max(1, (persisted.equipment.revision ?? 1) + 1);
      }
      if (snapshot.artifacts && typeof snapshot.artifacts === 'object' && Array.isArray(snapshot.artifacts.slots)) {
        persisted.artifacts ??= { revision: 1, slots: [] };
        const currentSlotsByType = new Map(
          (Array.isArray(persisted.artifacts.slots) ? persisted.artifacts.slots : [])
            .map((entry) => [entry?.slot, entry]),
        );
        const submittedSlotsByType = new Map(snapshot.artifacts.slots.map((entry) => [entry?.slot, entry]));
        persisted.artifacts.slots = ARTIFACT_SLOTS.map((slot) => {
          const currentSlot = currentSlotsByType.get(slot);
          const submittedSlot = submittedSlotsByType.get(slot);
          if (!submittedSlot || typeof submittedSlot !== 'object') {
            return currentSlot ?? { slot, unlocked: false, enabled: false, qi: 0, maxQi: 0, item: null };
          }
          const submittedRecord = submittedSlot as Record<string, any>;
          const currentRecord = currentSlot && typeof currentSlot === 'object'
            ? currentSlot as Record<string, any>
            : null;
          const item = submittedRecord.item;
          return {
            slot,
            unlocked: submittedRecord.unlocked === true,
            enabled: submittedRecord.enabled === true,
            qi: Number.isFinite(submittedRecord.qi) ? Math.max(0, Math.trunc(submittedRecord.qi)) : 0,
            maxQi: Number.isFinite(submittedRecord.maxQi) ? Math.max(0, Math.trunc(submittedRecord.maxQi)) : 0,
            item:
              item && typeof item.itemId === 'string' && item.itemId.trim()
                ? self.normalizeGmEquipmentItemForSave(currentRecord?.item, item)
                : null,
          };
        });
        persisted.artifacts.revision = Math.max(1, (persisted.artifacts.revision ?? 1) + 1);
      }
    }

    if (section === 'quests' && Array.isArray(snapshot.quests)) {
      persisted.quests.entries = snapshot.quests.map((entry) => ({
        ...entry,
        rewardItemIds: Array.isArray(entry.rewardItemIds) ? entry.rewardItemIds.slice() : [],
        rewards: Array.isArray(entry.rewards) ? entry.rewards.map((reward) => ({ ...reward })) : [],
      }));
      persisted.quests.revision = Math.max(1, (persisted.quests.revision ?? 1) + 1);
    }
}

export function applyCraftSkillSnapshotMutationImpl(self: NativeGmPlayerService, next, snapshot) {
    for (const key of GM_CRAFT_SKILL_KEYS) {
      if (snapshot?.[key] === undefined) {
        continue;
      }
      next[key] = self.normalizeGmCraftSkillState(snapshot[key], next[key]);
      if (key === 'enhancementSkill') {
        next.enhancementSkillLevel = next.enhancementSkill.level;
      }
    }
}

export function applyCraftSkillSnapshotMutationToPersistenceImpl(self: NativeGmPlayerService, persisted, snapshot) {
    persisted.progression = persisted.progression ?? {};
    for (const key of GM_CRAFT_SKILL_KEYS) {
      if (snapshot?.[key] === undefined) {
        continue;
      }
      persisted.progression[key] = self.normalizeGmCraftSkillState(snapshot[key], persisted.progression[key]);
      if (key === 'enhancementSkill') {
        persisted.progression.enhancementSkillLevel = persisted.progression.enhancementSkill.level;
      }
    }
}

export function normalizeGmCraftSkillStateImpl(self: NativeGmPlayerService, value: unknown, fallback: unknown) {
    const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const fallbackRecord = fallback && typeof fallback === 'object' ? fallback as Record<string, unknown> : {};
    const rawLevel = record.level ?? fallbackRecord.level;
    const level = Math.max(1, Math.trunc(Number(rawLevel) || 1));
    const expToNext = resolveCraftSkillExpToNextByLevel(self.playerProgressionService, level);
    const exp = Math.min(
      Math.max(0, Math.trunc(Number(record.exp ?? fallbackRecord.exp) || 0)),
      Math.max(0, expToNext - 1),
    );
    return { level, exp, expToNext };
}

export function repairRuntimeSnapshotImpl(self: NativeGmPlayerService, snapshot) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (snapshot.maxHp < 1) {
      snapshot.maxHp = 1;
    }
    if (snapshot.maxQi < 0) {
      snapshot.maxQi = 0;
    }
    snapshot.hp = clamp(snapshot.hp, 0, snapshot.maxHp);
    snapshot.qi = clamp(snapshot.qi, 0, snapshot.maxQi);
    if (snapshot.realm) {
      snapshot.realm = self.playerProgressionService.createRealmStateFromLevel(snapshot.realm.realmLv, snapshot.realm.progress);
    }
    self.playerProgressionService.initializePlayer(snapshot);
    self.playerRuntimeService.rebuildActionState(snapshot, 0);
}

export function hydrateGmTechniqueSnapshotImpl(self: NativeGmPlayerService, entry) {
  // GM 前端保存时会裁掉 layers/skills，属性重算必须在服务端补回模板定义。

    const techId = typeof entry?.techId === 'string' ? entry.techId.trim() : '';
    if (!techId) {
      return { ...entry, techId };
    }
    const normalized = { ...entry, techId };
    try {
      const hydrated = self.contentTemplateRepository.hydrateTechniqueState(normalized);
      if (hydrated && typeof hydrated === 'object') {
        return hydrated;
      }
    } catch (error) {
      if (error instanceof Error && /含 artsStrength\/raw\* 旧草稿字段/.test(error.message)) {
        throw new BadRequestException(`${GM_GENERATED_TECHNIQUE_LEGACY_DRAFT_ERROR}（${techId}）`);
      }
      throw error;
    }
    return normalized;

}

export function buildStarterPersistenceSnapshotImpl(self: NativeGmPlayerService, playerId: string) {
    if (typeof self.playerRuntimeService.buildStarterPersistenceSnapshot !== 'function') {
      return null;
    }
    return self.playerRuntimeService.buildStarterPersistenceSnapshot(playerId);
}

export function getGmUpdateProjectionDomainsImpl(self: NativeGmPlayerService, section: unknown, snapshot: any) {
    const domains = new Set<string>();
    const addBasicDomains = () => {
      domains.add('vitals');
      domains.add('combat_pref');
      if (Array.isArray(snapshot?.autoBattleSkills)) {
        domains.add('auto_battle_skill');
      }
      if (Array.isArray(snapshot?.temporaryBuffs)) {
        domains.add('buff');
      }
    };

    if (section === null || section === undefined || section === 'basic') {
      addBasicDomains();
    } else if (section === NATIVE_GM_PLAYER_MUTATION_CONTRACT.runtimeQueueSection) {
      domains.add('world_anchor');
      domains.add('position_checkpoint');
      domains.add('vitals');
      domains.add('combat_pref');
    } else if (section === 'realm') {
      domains.add('progression');
      domains.add('attr');
      if (snapshot?.bodyTraining && typeof snapshot.bodyTraining === 'object') {
        domains.add('body_training');
      }
    } else if (section === 'buffs') {
      domains.add('buff');
    } else if (section === 'techniques') {
      domains.add('technique');
      domains.add('combat_pref');
      if (Array.isArray(snapshot?.autoBattleSkills)) {
        domains.add('auto_battle_skill');
      }
    } else if (section === 'craftSkills') {
      domains.add('progression');
    } else if (section === 'items') {
      domains.add('inventory');
      domains.add('equipment');
      domains.add('artifact');
    } else if (section === 'quests') {
      domains.add('quest');
    }

    return Array.from(domains);
}

export function buildBodyTrainingStateImpl(self: NativeGmPlayerService, current, level: number) {
    const normalizedLevel = Math.max(0, Math.trunc(level));
    const preservedExp = self.normalizeNonNegativeInt(current?.exp);
    const expToNext = getBodyTrainingExpToNext(normalizedLevel);

    return normalizeBodyTrainingState({
      level: normalizedLevel,
      exp: Math.min(preservedExp, Math.max(0, expToNext - 1)),
    });
}

export function parseBodyTrainingLevelImpl(self: NativeGmPlayerService, value: unknown) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0 || !Number.isInteger(numeric)) {
      return null;
    }
    return Math.trunc(numeric);
}

export function parseCounterDeltaImpl(self: NativeGmPlayerService, value: unknown, label: string) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
      throw new BadRequestException(`${label}必须是整数`);
    }
    return Math.trunc(numeric);
}

export function parseNonNegativeIntegerImpl(self: NativeGmPlayerService, value: unknown, label: string) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric < 0) {
      throw new BadRequestException(`${label}必须是非负整数`);
    }
    return Math.trunc(numeric);
}

export function applyCounterDeltaImpl(self: NativeGmPlayerService, currentValue: unknown, amount: number) {
    return Math.max(0, self.normalizeNonNegativeInt(currentValue) + amount);
}

export function normalizeNonNegativeIntImpl(self: NativeGmPlayerService, value: unknown) {
    return Math.max(0, Math.trunc(Number(value) || 0));
}

