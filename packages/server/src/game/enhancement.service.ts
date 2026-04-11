import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  ActionDef,
  C2S_StartEnhancement,
  computeEnhancementActionCooldownTicks,
  ENHANCEMENT_ACTION_ID,
  ENHANCEMENT_HAMMER_TAG,
  ENHANCEMENT_SPIRIT_STONE_ITEM_ID,
  EnhancementMaterialRequirement,
  EnhancementTargetRef,
  EquipmentEnhancementConfig,
  EquipmentEnhancementStepConfig,
  EQUIP_SLOTS,
  EquipSlot,
  ItemStack,
  PlayerEnhancementLevelRecord,
  PlayerEnhancementRecord,
  PlayerState,
  S2C_EnhancementPanel,
  SyncedEnhancementCandidateView,
  SyncedEnhancementPanelState,
  SyncedEnhancementProtectionCandidate,
  SyncedEnhancementRequirementView,
  getEnhancementSpiritStoneCost,
  getEnhancementTargetSuccessRate,
  normalizeEnhanceLevel,
} from '@mud/shared';
import { resolveServerDataPath } from '../common/data-path';
import { ContentService } from './content.service';
import { InventoryService } from './inventory.service';

interface RawEnhancementMaterialRequirement {
  itemId?: unknown;
  count?: unknown;
}

interface RawEquipmentEnhancementStepConfig {
  targetEnhanceLevel?: unknown;
  materials?: unknown;
}

interface RawEquipmentEnhancementConfig {
  targetItemId?: unknown;
  protectionItemId?: unknown;
  steps?: unknown;
}

interface EnhancementResultMessage {
  text: string;
  kind?: 'system' | 'quest' | 'loot';
}

export interface EnhancementMutationResult {
  error?: string;
  messages: EnhancementResultMessage[];
  panelChanged: boolean;
  inventoryChanged?: boolean;
  equipmentChanged?: boolean;
  attrChanged?: boolean;
  actionsChanged?: boolean;
  cooldownTicks?: number;
}

type ResolvedEnhancementTarget =
  | { ref: EnhancementTargetRef; item: ItemStack; source: 'inventory'; slotIndex: number }
  | { ref: EnhancementTargetRef; item: ItemStack; source: 'equipment'; slot: EquipSlot };

function cloneItem(item: ItemStack): ItemStack {
  return structuredClone(item);
}

@Injectable()
export class EnhancementService implements OnModuleInit {
  private readonly logger = new Logger(EnhancementService.name);
  private readonly configs = new Map<string, EquipmentEnhancementConfig>();
  private readonly configDir = resolveServerDataPath('content', 'enhancements');

  constructor(
    private readonly contentService: ContentService,
    private readonly inventoryService: InventoryService,
  ) {}

  onModuleInit(): void {
    this.loadConfigs();
  }

  hasEquippedHammer(player: PlayerState): boolean {
    return Boolean(player.equipment.weapon?.tags?.includes(ENHANCEMENT_HAMMER_TAG));
  }

  getEnhancementAction(player: PlayerState): ActionDef | null {
    if (!this.hasEquippedHammer(player)) {
      return null;
    }
    return {
      id: ENHANCEMENT_ACTION_ID,
      name: '强化',
      type: 'interact',
      desc: '打开强化界面，选择目标装备、保护物与本次强化材料。',
      cooldownLeft: 0,
    };
  }

  buildPanelPayload(player: PlayerState): S2C_EnhancementPanel {
    const state = this.buildPanelState(player);
    return {
      state,
      error: state ? undefined : '尚未装备强化锤。',
    };
  }

  enhance(player: PlayerState, payload: C2S_StartEnhancement): EnhancementMutationResult {
    if (!this.hasEquippedHammer(player)) {
      return { error: '尚未装备强化锤。', messages: [], panelChanged: false };
    }

    const actionCooldownLeft = player.actions.find((entry) => entry.id === ENHANCEMENT_ACTION_ID)?.cooldownLeft ?? 0;
    if (actionCooldownLeft > 0) {
      return { error: `强化法器尚需 ${actionCooldownLeft} 息才能再次动用。`, messages: [], panelChanged: false };
    }

    const target = this.resolveTarget(player, payload.target);
    if (!target) {
      return { error: '强化目标不存在。', messages: [], panelChanged: false };
    }
    if (target.item.type !== 'equipment') {
      return { error: '当前仅支持强化装备。', messages: [], panelChanged: false };
    }

    const config = this.configs.get(target.item.itemId);
    if (!config) {
      return { error: '该物品没有强化配置。', messages: [], panelChanged: false };
    }

    const currentLevel = normalizeEnhanceLevel(target.item.enhanceLevel);
    const nextLevel = currentLevel + 1;
    const step = config.steps.find((entry) => entry.targetEnhanceLevel === nextLevel);
    if (!step) {
      return { error: '该装备已达到当前配置的最高强化等级。', messages: [], panelChanged: false };
    }

    const protection = payload.protection ? this.resolveProtection(player, payload.protection, target, config) : null;
    if (payload.protection && !protection) {
      return { error: '保护物不存在或不符合本次强化规则。', messages: [], panelChanged: false };
    }

    const spiritStoneCost = getEnhancementSpiritStoneCost(target.item.level);
    const requirements = step.materials ?? [];
    if (!this.hasEnoughMaterials(player, target, protection, spiritStoneCost, requirements)) {
      return { error: '所需灵石或材料不足。', messages: [], panelChanged: false };
    }

    const inventorySnapshot = player.inventory.items.map((entry) => cloneItem(entry));
    const equipmentSnapshot = structuredClone(player.equipment);
    let adjustedProtectionRef = protection?.ref ?? null;

    try {
      const workingItem = target.source === 'inventory'
        ? this.extractInventoryTarget(player, target.slotIndex)
        : cloneItem(target.item);
      if (!workingItem) {
        throw new Error('强化目标不存在。');
      }

      if (
        adjustedProtectionRef?.source === 'inventory'
        && target.source === 'inventory'
        && target.item.count === 1
        && typeof adjustedProtectionRef.slotIndex === 'number'
        && adjustedProtectionRef.slotIndex > target.slotIndex
      ) {
        adjustedProtectionRef = {
          ...adjustedProtectionRef,
          slotIndex: adjustedProtectionRef.slotIndex - 1,
        };
      }

      if (adjustedProtectionRef) {
        if (!this.consumeProtection(player, adjustedProtectionRef)) {
          throw new Error('保护物不存在或数量不足。');
        }
      }
      if (!this.consumeInventoryItemById(player, ENHANCEMENT_SPIRIT_STONE_ITEM_ID, spiritStoneCost)) {
        throw new Error('灵石不足。');
      }
      for (const requirement of requirements) {
        if (!this.consumeInventoryItemById(player, requirement.itemId, requirement.count)) {
          throw new Error(`${requirement.itemId} 数量不足。`);
        }
      }

      const successRate = getEnhancementTargetSuccessRate(nextLevel);
      const success = Math.random() < successRate;
      const resultingLevel = success
        ? nextLevel
        : protection
          ? Math.max(0, currentLevel - 1)
          : 0;
      const resolvedItem = this.contentService.normalizeItemStack({
        ...workingItem,
        count: 1,
        enhanceLevel: resultingLevel,
      });

      if (target.source === 'equipment') {
        player.equipment[target.slot] = resolvedItem;
      } else if (!this.inventoryService.addItem(player, resolvedItem)) {
        throw new Error('背包空间不足，无法放回强化后的物品。');
      }

      this.recordEnhancementOutcome(player, target.item.itemId, nextLevel, success, resultingLevel);
      const cooldownTicks = computeEnhancementActionCooldownTicks(player.equipment.weapon?.enhancementSpeedRate);
      const resultLine = success
        ? `${resolvedItem.name} 强化成功，已提升至 +${resultingLevel}。`
        : protection
          ? `${resolvedItem.name} 强化失败，保护生效，降为 +${resultingLevel}。`
          : `${resolvedItem.name} 强化失败，已归零为 +0。`;
      return {
        messages: [{
          text: resultLine,
          kind: success ? 'quest' : 'system',
        }],
        panelChanged: true,
        inventoryChanged: true,
        equipmentChanged: target.source === 'equipment',
        attrChanged: target.source === 'equipment',
        actionsChanged: true,
        cooldownTicks,
      };
    } catch (error) {
      player.inventory.items = inventorySnapshot;
      player.equipment = equipmentSnapshot;
      return {
        error: error instanceof Error ? error.message : '强化失败，状态已回滚。',
        messages: [],
        panelChanged: false,
      };
    }
  }

  private buildPanelState(player: PlayerState): SyncedEnhancementPanelState | null {
    if (!this.hasEquippedHammer(player)) {
      return null;
    }
    const candidates = this.collectCandidates(player);
    const candidateItemIds = new Set(candidates.map((entry) => entry.item.itemId));
    return {
      hammerItemId: player.equipment.weapon?.tags?.includes(ENHANCEMENT_HAMMER_TAG)
        ? player.equipment.weapon.itemId
        : undefined,
      actionCooldownLeft: player.actions.find((entry) => entry.id === ENHANCEMENT_ACTION_ID)?.cooldownLeft ?? 0,
      candidates,
      records: (player.enhancementRecords ?? [])
        .filter((entry) => candidateItemIds.has(entry.itemId))
        .map((entry) => ({
          itemId: entry.itemId,
          highestLevel: normalizeEnhanceLevel(entry.highestLevel),
          levels: (entry.levels ?? [])
            .map((level) => ({
              targetLevel: Math.max(1, Math.floor(Number(level.targetLevel) || 1)),
              successCount: Math.max(0, Math.floor(Number(level.successCount) || 0)),
              failureCount: Math.max(0, Math.floor(Number(level.failureCount) || 0)),
            }))
            .sort((left, right) => left.targetLevel - right.targetLevel),
        })),
    };
  }

  private collectCandidates(player: PlayerState): SyncedEnhancementCandidateView[] {
    const candidates: SyncedEnhancementCandidateView[] = [];
    player.inventory.items.forEach((item, slotIndex) => {
      const candidate = this.buildCandidate(player, { source: 'inventory', slotIndex }, item);
      if (candidate) {
        candidates.push(candidate);
      }
    });
    for (const slot of EQUIP_SLOTS) {
      const item = player.equipment[slot];
      if (!item) {
        continue;
      }
      const candidate = this.buildCandidate(player, { source: 'equipment', slot }, item);
      if (candidate) {
        candidates.push(candidate);
      }
    }
    return candidates;
  }

  private buildCandidate(player: PlayerState, ref: EnhancementTargetRef, item: ItemStack): SyncedEnhancementCandidateView | null {
    const config = this.configs.get(item.itemId);
    if (!config || item.type !== 'equipment') {
      return null;
    }
    const currentLevel = normalizeEnhanceLevel(item.enhanceLevel);
    const nextLevel = currentLevel + 1;
    const nextStep = config.steps.find((entry) => entry.targetEnhanceLevel === nextLevel) ?? null;
    const protectionItemId = config.protectionItemId ?? item.itemId;
    const protectionItemName = this.contentService.getItem(protectionItemId)?.name ?? protectionItemId;
    return {
      ref,
      item: cloneItem(item),
      currentLevel,
      nextLevel: nextStep ? nextStep.targetEnhanceLevel : null,
      maxLevel: config.steps[config.steps.length - 1]?.targetEnhanceLevel ?? currentLevel,
      spiritStoneCost: getEnhancementSpiritStoneCost(item.level),
      successRate: nextStep ? getEnhancementTargetSuccessRate(nextStep.targetEnhanceLevel) : undefined,
      actionCooldownTicks: computeEnhancementActionCooldownTicks(player.equipment.weapon?.enhancementSpeedRate),
      materials: (nextStep?.materials ?? []).map((entry) => this.buildRequirementView(player, entry)),
      protectionItemId: config.protectionItemId,
      protectionItemName,
      allowSelfProtection: !config.protectionItemId,
      protectionCandidates: this.buildProtectionCandidates(player, ref, item, config),
    };
  }

  private buildRequirementView(player: PlayerState, requirement: EnhancementMaterialRequirement): SyncedEnhancementRequirementView {
    return {
      itemId: requirement.itemId,
      name: this.contentService.getItem(requirement.itemId)?.name ?? requirement.itemId,
      count: requirement.count,
      ownedCount: this.getInventoryCount(player, requirement.itemId),
    };
  }

  private buildProtectionCandidates(
    player: PlayerState,
    targetRef: EnhancementTargetRef,
    targetItem: ItemStack,
    config: EquipmentEnhancementConfig,
  ): SyncedEnhancementProtectionCandidate[] {
    const protectionItemId = config.protectionItemId ?? targetItem.itemId;
    const candidates: SyncedEnhancementProtectionCandidate[] = [];
    player.inventory.items.forEach((item, slotIndex) => {
      if (item.itemId !== protectionItemId) {
        return;
      }
      if (
        targetRef.source === 'inventory'
        && targetRef.slotIndex === slotIndex
        && item.count < 2
      ) {
        return;
      }
      candidates.push({
        ref: { source: 'inventory', slotIndex },
        item: cloneItem(item),
      });
    });
    return candidates;
  }

  private resolveTarget(player: PlayerState, ref: EnhancementTargetRef): ResolvedEnhancementTarget | null {
    if (ref.source === 'inventory' && Number.isInteger(ref.slotIndex)) {
      const item = player.inventory.items[Number(ref.slotIndex)];
      if (!item) {
        return null;
      }
      return {
        ref: { source: 'inventory', slotIndex: Number(ref.slotIndex) },
        item,
        source: 'inventory',
        slotIndex: Number(ref.slotIndex),
      };
    }
    if (ref.source === 'equipment' && ref.slot && EQUIP_SLOTS.includes(ref.slot)) {
      const item = player.equipment[ref.slot];
      if (!item) {
        return null;
      }
      return {
        ref: { source: 'equipment', slot: ref.slot },
        item,
        source: 'equipment',
        slot: ref.slot,
      };
    }
    return null;
  }

  private resolveProtection(
    player: PlayerState,
    ref: EnhancementTargetRef,
    target: ResolvedEnhancementTarget,
    config: EquipmentEnhancementConfig,
  ): ResolvedEnhancementTarget | null {
    if (ref.source !== 'inventory') {
      return null;
    }
    const protection = this.resolveTarget(player, ref);
    if (!protection || protection.source !== 'inventory') {
      return null;
    }
    const expectedItemId = config.protectionItemId ?? target.item.itemId;
    if (protection.item.itemId !== expectedItemId) {
      return null;
    }
    if (
      target.source === 'inventory'
      && protection.slotIndex === target.slotIndex
      && target.item.count < 2
    ) {
      return null;
    }
    return protection;
  }

  private hasEnoughMaterials(
    player: PlayerState,
    target: ResolvedEnhancementTarget,
    protection: ResolvedEnhancementTarget | null,
    spiritStoneCost: number,
    requirements: EnhancementMaterialRequirement[],
  ): boolean {
    const counts = new Map<string, number>();
    for (const item of player.inventory.items) {
      counts.set(item.itemId, (counts.get(item.itemId) ?? 0) + Math.max(0, Math.floor(item.count)));
    }
    if (target.source === 'inventory') {
      counts.set(target.item.itemId, (counts.get(target.item.itemId) ?? 0) - 1);
    }
    if (protection?.source === 'inventory') {
      counts.set(protection.item.itemId, (counts.get(protection.item.itemId) ?? 0) - 1);
    }
    if ((counts.get(ENHANCEMENT_SPIRIT_STONE_ITEM_ID) ?? 0) < spiritStoneCost) {
      return false;
    }
    return requirements.every((entry) => (counts.get(entry.itemId) ?? 0) >= entry.count);
  }

  private extractInventoryTarget(player: PlayerState, slotIndex: number): ItemStack | null {
    const current = player.inventory.items[slotIndex];
    if (!current || current.count <= 0) {
      return null;
    }
    if (current.count === 1) {
      player.inventory.items.splice(slotIndex, 1);
      return {
        ...cloneItem(current),
        count: 1,
      };
    }
    current.count -= 1;
    return {
      ...cloneItem(current),
      count: 1,
    };
  }

  private consumeProtection(player: PlayerState, ref: EnhancementTargetRef): boolean {
    if (ref.source !== 'inventory' || !Number.isInteger(ref.slotIndex)) {
      return false;
    }
    return Boolean(this.inventoryService.removeItem(player, Number(ref.slotIndex), 1));
  }

  private consumeInventoryItemById(player: PlayerState, itemId: string, count: number): boolean {
    let remaining = Math.max(0, Math.floor(count));
    if (remaining <= 0) {
      return true;
    }
    for (let index = player.inventory.items.length - 1; index >= 0 && remaining > 0; index -= 1) {
      const item = player.inventory.items[index];
      if (item?.itemId !== itemId) {
        continue;
      }
      const consume = Math.min(remaining, Math.max(0, Math.floor(item.count)));
      if (!this.inventoryService.removeItem(player, index, consume)) {
        return false;
      }
      remaining -= consume;
    }
    return remaining <= 0;
  }

  private recordEnhancementOutcome(
    player: PlayerState,
    itemId: string,
    targetLevel: number,
    success: boolean,
    resultingLevel: number,
  ): void {
    const records = [...(player.enhancementRecords ?? [])];
    let record = records.find((entry) => entry.itemId === itemId);
    if (!record) {
      record = {
        itemId,
        highestLevel: 0,
        levels: [],
      };
      records.push(record);
    }
    record.highestLevel = Math.max(normalizeEnhanceLevel(record.highestLevel), normalizeEnhanceLevel(resultingLevel));
    let levelRecord = record.levels.find((entry) => entry.targetLevel === targetLevel);
    if (!levelRecord) {
      levelRecord = {
        targetLevel,
        successCount: 0,
        failureCount: 0,
      };
      record.levels.push(levelRecord);
    }
    if (success) {
      levelRecord.successCount += 1;
    } else {
      levelRecord.failureCount += 1;
    }
    record.levels.sort((left, right) => left.targetLevel - right.targetLevel);
    player.enhancementRecords = records
      .map((entry) => ({
        itemId: entry.itemId,
        highestLevel: normalizeEnhanceLevel(entry.highestLevel),
        levels: entry.levels.map((level): PlayerEnhancementLevelRecord => ({
          targetLevel: Math.max(1, Math.floor(Number(level.targetLevel) || 1)),
          successCount: Math.max(0, Math.floor(Number(level.successCount) || 0)),
          failureCount: Math.max(0, Math.floor(Number(level.failureCount) || 0)),
        })),
      }))
      .sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-Hans-CN'));
  }

  private getInventoryCount(player: PlayerState, itemId: string): number {
    return player.inventory.items.reduce((total, item) => (
      item.itemId === itemId ? total + Math.max(0, Math.floor(item.count)) : total
    ), 0);
  }

  private loadConfigs(): void {
    this.configs.clear();
    if (!fs.existsSync(this.configDir)) {
      return;
    }
    for (const filePath of this.collectJsonFiles(this.configDir)) {
      const fileName = path.relative(this.configDir, filePath);
      try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
        const entries = Array.isArray(parsed) ? parsed : [];
        for (const raw of entries) {
          const config = this.normalizeConfig(raw as RawEquipmentEnhancementConfig, fileName);
          if (config) {
            this.configs.set(config.targetItemId, config);
          }
        }
      } catch (error) {
        this.logger.warn(`读取强化配置失败 ${fileName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    this.logger.log(`已加载 ${this.configs.size} 条强化配置`);
  }

  private collectJsonFiles(dir: string): string[] {
    const files: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const nextPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...this.collectJsonFiles(nextPath));
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.json')) {
        files.push(nextPath);
      }
    }
    return files;
  }

  private normalizeConfig(raw: RawEquipmentEnhancementConfig, sourceLabel: string): EquipmentEnhancementConfig | null {
    const targetItemId = typeof raw.targetItemId === 'string' ? raw.targetItemId.trim() : '';
    if (!targetItemId) {
      return null;
    }
    const item = this.contentService.getItem(targetItemId);
    if (!item || item.type !== 'equipment') {
      this.logger.warn(`强化配置 ${sourceLabel} 引用了无效装备 ${targetItemId}，已忽略`);
      return null;
    }
    const steps = Array.isArray(raw.steps)
      ? raw.steps
        .map((entry) => this.normalizeStep(entry as RawEquipmentEnhancementStepConfig))
        .filter((entry): entry is EquipmentEnhancementStepConfig => entry !== null)
      : [];
    if (steps.length === 0) {
      this.logger.warn(`强化配置 ${sourceLabel} 的 ${targetItemId} 没有有效 steps，已忽略`);
      return null;
    }
    const protectionItemId = typeof raw.protectionItemId === 'string' && raw.protectionItemId.trim().length > 0
      ? raw.protectionItemId.trim()
      : undefined;
    return {
      targetItemId,
      protectionItemId,
      steps: steps.sort((left, right) => left.targetEnhanceLevel - right.targetEnhanceLevel),
    };
  }

  private normalizeStep(raw: RawEquipmentEnhancementStepConfig): EquipmentEnhancementStepConfig | null {
    const targetEnhanceLevel = Math.max(1, Math.floor(Number(raw.targetEnhanceLevel) || 0));
    if (targetEnhanceLevel <= 0) {
      return null;
    }
    const materials = Array.isArray(raw.materials)
      ? raw.materials
        .map((entry) => this.normalizeRequirement(entry as RawEnhancementMaterialRequirement))
        .filter((entry): entry is EnhancementMaterialRequirement => entry !== null)
      : [];
    return {
      targetEnhanceLevel,
      materials: materials.length > 0 ? materials : undefined,
    };
  }

  private normalizeRequirement(raw: RawEnhancementMaterialRequirement): EnhancementMaterialRequirement | null {
    const itemId = typeof raw.itemId === 'string' ? raw.itemId.trim() : '';
    const count = Math.max(1, Math.floor(Number(raw.count) || 0));
    if (!itemId || count <= 0) {
      return null;
    }
    return { itemId, count };
  }
}
