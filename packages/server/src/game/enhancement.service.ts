import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  ActionDef,
  C2S_StartEnhancement,
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
  MAX_ENHANCE_LEVEL,
  PlayerEnhancementJob,
  PlayerEnhancementLevelRecord,
  PlayerEnhancementRecord,
  PlayerState,
  S2C_EnhancementPanel,
  SyncedEnhancementCandidateView,
  SyncedEnhancementPanelState,
  SyncedEnhancementProtectionCandidate,
  SyncedEnhancementRequirementView,
  VisibleBuffState,
  applyEnhancementToItemStack,
  computeEnhancementAdjustedSuccessRate,
  computeEnhancementJobBaseTicks,
  computeEnhancementJobTicks,
  computeEnhancementToolSpeedRate,
  computeTimedCraftSkillExp,
  getCraftSkillEarlyLevelExpMultiplier,
  getEnhancementSpiritStoneCost,
  normalizeAlchemySkillState,
  normalizeEnhanceLevel,
} from '@mud/shared';
import { resolveServerDataPath } from '../common/data-path';
import { ContentService } from './content.service';
import { InventoryService } from './inventory.service';
import { LootService } from './loot.service';
import { TechniqueService } from './technique.service';

/** RawEnhancementMaterialRequirement：定义该接口的能力与字段约束。 */
interface RawEnhancementMaterialRequirement {
  itemId?: unknown;
  count?: unknown;
}

/** RawEquipmentEnhancementStepConfig：定义该接口的能力与字段约束。 */
interface RawEquipmentEnhancementStepConfig {
  targetEnhanceLevel?: unknown;
  materials?: unknown;
}

/** RawEquipmentEnhancementConfig：定义该接口的能力与字段约束。 */
interface RawEquipmentEnhancementConfig {
  targetItemId?: unknown;
  protectionItemId?: unknown;
  steps?: unknown;
}

/** EnhancementResultMessage：定义该接口的能力与字段约束。 */
interface EnhancementResultMessage {
  text: string;
  kind?: 'system' | 'quest' | 'loot';
}

/** EnhancementMutationResult：定义该接口的能力与字段约束。 */
export interface EnhancementMutationResult {
  error?: string;
  messages: EnhancementResultMessage[];
  panelChanged: boolean;
  inventoryChanged?: boolean;
  equipmentChanged?: boolean;
  attrChanged?: boolean;
  dirtyPlayers?: string[];
  dirtyFlags?: Array<'inv' | 'tech' | 'attr' | 'actions'>;
}

/** ResolvedEnhancementTarget：定义该类型的结构与数据语义。 */
type ResolvedEnhancementTarget =
  | { ref: EnhancementTargetRef; item: ItemStack; source: 'inventory'; slotIndex: number }
  | { ref: EnhancementTargetRef; item: ItemStack; source: 'equipment'; slot: EquipSlot };

const ENHANCEMENT_BUFF_ID = 'system.enhancement';
const ENHANCEMENT_INTERRUPT_PAUSE_TICKS = 10;

/** cloneItem：执行对应的业务逻辑。 */
function cloneItem(item: ItemStack): ItemStack {
  return structuredClone(item);
}

@Injectable()
/** EnhancementService：封装相关状态与行为。 */
export class EnhancementService implements OnModuleInit {
  private readonly logger = new Logger(EnhancementService.name);
  private readonly configs = new Map<string, EquipmentEnhancementConfig>();
  private readonly configDir = resolveServerDataPath('content', 'enhancements');

  constructor(
    private readonly contentService: ContentService,
    private readonly inventoryService: InventoryService,
    private readonly lootService: LootService,
    private readonly techniqueService: TechniqueService,
  ) {}

  onModuleInit(): void {
    this.loadConfigs();
  }

  hasEquippedHammer(player: PlayerState): boolean {
    return Boolean(player.equipment.weapon?.tags?.includes(ENHANCEMENT_HAMMER_TAG));
  }

  hasActiveEnhancementJob(player: PlayerState): boolean {
    return (player.enhancementJob?.remainingTicks ?? 0) > 0;
  }

  getEnhancementAction(player: PlayerState): ActionDef | null {
    if (!this.hasEquippedHammer(player) && !this.hasActiveEnhancementJob(player)) {
      return null;
    }
    return {
      id: ENHANCEMENT_ACTION_ID,
      name: '强化',
      type: 'interact',
      desc: '打开强化界面，选择目标装备与保护物，并开始强化队列。',
      cooldownLeft: 0,
    };
  }

  buildVisibleEnhancementBuff(player: PlayerState): VisibleBuffState | null {
    const job = player.enhancementJob;
    if (!job || job.remainingTicks <= 0) {
      return null;
    }
    const targetLabel = job.desiredTargetLevel > job.targetLevel
      ? `当前冲击 +${job.targetLevel} / 最终 +${job.desiredTargetLevel}`
      : `目标 +${job.targetLevel}`;
    const desc = job.phase === 'paused'
      ? `强化暂歇，${job.pausedTicks} 息后继续 ${job.targetItemName} 的${targetLabel}。移动或出手会重新暂停强化。`
      : `正在强化 ${job.targetItemName}，${targetLabel}，剩余 ${job.remainingTicks} 息。移动或出手会让强化暂歇 ${ENHANCEMENT_INTERRUPT_PAUSE_TICKS} 息。`;
    return {
      buffId: ENHANCEMENT_BUFF_ID,
      name: '强化',
      desc,
      shortMark: '强',
      category: 'buff',
      visibility: 'public',
      remainingTicks: job.remainingTicks,
      duration: job.totalTicks,
      stacks: 1,
      maxStacks: 1,
      sourceSkillId: ENHANCEMENT_ACTION_ID,
      sourceSkillName: '强化',
      realmLv: Math.max(1, player.realm?.realmLv ?? player.realmLv ?? 1),
      infiniteDuration: true,
    };
  }

  buildPanelPayload(player: PlayerState): S2C_EnhancementPanel {
    this.normalizePlayerEnhancementState(player);
    const state = this.buildPanelState(player);
    return {
      state,
      error: state ? undefined : '尚未装备强化锤。',
    };
  }

  startEnhancement(player: PlayerState, payload: C2S_StartEnhancement): EnhancementMutationResult {
    this.normalizePlayerEnhancementState(player);
    if (!this.hasEquippedHammer(player)) {
      return { error: '尚未装备强化锤。', messages: [], panelChanged: false };
    }
    if (this.hasActiveEnhancementJob(player)) {
      return { error: '当前已有强化任务在进行中。', messages: [], panelChanged: false };
    }

    const target = this.resolveTarget(player, payload.target);
    if (!target) {
      return { error: '强化目标不存在。', messages: [], panelChanged: false };
    }
    if (target.item.type !== 'equipment') {
      return { error: '当前仅支持强化装备。', messages: [], panelChanged: false };
    }

    const currentLevel = normalizeEnhanceLevel(target.item.enhanceLevel);
    if (currentLevel >= MAX_ENHANCE_LEVEL) {
      return { error: `该装备已达到强化上限 +${MAX_ENHANCE_LEVEL}。`, messages: [], panelChanged: false };
    }
    const desiredTargetLevel = this.resolveRequestedTargetLevel(currentLevel, payload.targetLevel);
    const targetLevel = currentLevel + 1;
    const config = this.configs.get(target.item.itemId);
    const requirements = this.getStepMaterials(config, targetLevel);
    const protection = payload.protection ? this.resolveProtection(player, payload.protection, target, config) : null;
    const protectionStartLevel = protection
      ? this.resolveProtectionStartLevel(currentLevel, desiredTargetLevel, payload.protectionStartLevel)
      : undefined;
    if (payload.protection && !protection) {
      return { error: '保护物不存在或不符合本次强化规则。', messages: [], panelChanged: false };
    }

    const spiritStoneCost = getEnhancementSpiritStoneCost(target.item.level, requirements.length > 0);
    if (!this.hasEnoughMaterials(
      player,
      target,
      protection,
      spiritStoneCost,
      requirements,
      this.shouldUseProtectionForStep(targetLevel, protectionStartLevel),
    )) {
      return { error: '所需灵石或材料不足。', messages: [], panelChanged: false };
    }

    const inventorySnapshot = player.inventory.items.map((entry) => cloneItem(entry));
    const equipmentSnapshot = structuredClone(player.equipment);
    const recordSnapshot = this.getSessionRecordArray(player);
    let adjustedProtectionRef = protection?.ref ?? null;
    this.prepareSessionRecord(player, target.item.itemId, currentLevel);

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

      if (
        adjustedProtectionRef
        && this.shouldUseProtectionForStep(targetLevel, protectionStartLevel)
        && !this.consumeProtection(player, adjustedProtectionRef)
      ) {
        throw new Error('保护物不存在或数量不足。');
      }
      for (const requirement of requirements) {
        if (!this.consumeInventoryItemById(player, requirement.itemId, requirement.count)) {
          throw new Error(`${requirement.itemId} 数量不足。`);
        }
      }

      const hammer = player.equipment.weapon;
      const roleEnhancementLevel = this.getEnhancementSkillLevel(player);
      const targetItemLevel = Math.max(1, target.item.level ?? 1);
      const totalSpeedRate = computeEnhancementToolSpeedRate(
        hammer?.enhancementSpeedRate,
        roleEnhancementLevel,
        targetItemLevel,
      );
      const successRate = computeEnhancementAdjustedSuccessRate(
        targetLevel,
        roleEnhancementLevel,
        targetItemLevel,
      );
      const totalTicks = computeEnhancementJobTicks(targetItemLevel, totalSpeedRate);
      const protectionItemId = this.getProtectionItemId(config, target.item.itemId);
      const protectionItemName = protectionItemId
        ? (this.contentService.getItem(protectionItemId)?.name ?? protectionItemId)
        : undefined;

      player.enhancementJob = {
        target: target.ref,
        item: {
          ...cloneItem(workingItem),
          count: 1,
        },
        targetItemId: target.item.itemId,
        targetItemName: target.item.name,
        targetItemLevel,
        currentLevel,
        targetLevel,
        desiredTargetLevel,
        spiritStoneCost,
        materials: requirements.map((entry) => ({ ...entry })),
        protectionUsed: Boolean(protection),
        protectionStartLevel,
        protectionItemId: protection ? protectionItemId : undefined,
        protectionItemName: protection ? protectionItemName : undefined,
        phase: 'enhancing',
        pausedTicks: 0,
        successRate,
        totalTicks,
        remainingTicks: totalTicks,
        startedAt: Date.now(),
        roleEnhancementLevel,
        totalSpeedRate,
      };

      return {
        messages: [{
          text: desiredTargetLevel > targetLevel
            ? `开始强化 ${target.item.name}，当前冲击 +${targetLevel}，最终目标 +${desiredTargetLevel}${protection ? `，保护从 +${protectionStartLevel} 开始生效` : ''}，首阶预计耗时 ${totalTicks} 息，成功率 ${(successRate * 100).toFixed(successRate === 1 ? 0 : 1)}%。`
            : `开始强化 ${target.item.name}，目标 +${targetLevel}，预计耗时 ${totalTicks} 息，成功率 ${(successRate * 100).toFixed(successRate === 1 ? 0 : 1)}%。`,
          kind: 'quest',
        }],
        panelChanged: true,
        inventoryChanged: true,
      };
    } catch (error) {
      player.enhancementRecords = recordSnapshot;
      player.inventory.items = inventorySnapshot;
      player.equipment = equipmentSnapshot;
      return {
        error: error instanceof Error ? error.message : '强化失败，状态已回滚。',
        messages: [],
        panelChanged: false,
      };
    }
  }

  cancelEnhancement(player: PlayerState): EnhancementMutationResult {
    this.normalizePlayerEnhancementState(player);
    const job = player.enhancementJob;
    if (!job || job.remainingTicks <= 0) {
      return { error: '当前没有可取消的强化任务。', messages: [], panelChanged: false };
    }
    return this.finishEnhancementJob(
      player,
      job,
      job.currentLevel,
      `你停止了 ${job.item.name} 的强化，当前这一阶已投入的材料与保护物不会退回，灵石将在本阶成功后结算。`,
      'system',
    );
  }

  interruptEnhancement(player: PlayerState, reason: 'move' | 'attack'): EnhancementMutationResult {
    this.normalizePlayerEnhancementState(player);
    const job = player.enhancementJob;
    if (!job || job.remainingTicks <= 0) {
      return { messages: [], panelChanged: false };
    }
    const currentPausedTicks = job.phase === 'paused' ? job.pausedTicks : 0;
    const addedPauseTicks = Math.max(0, ENHANCEMENT_INTERRUPT_PAUSE_TICKS - currentPausedTicks);
    job.phase = 'paused';
    job.pausedTicks = ENHANCEMENT_INTERRUPT_PAUSE_TICKS;
    if (addedPauseTicks > 0) {
      job.remainingTicks += addedPauseTicks;
      job.totalTicks += addedPauseTicks;
    }
    return {
      messages: [{
        text: reason === 'move'
          ? `${job.targetItemName} 的强化被你移动身形打断，暂歇 ${ENHANCEMENT_INTERRUPT_PAUSE_TICKS} 息后继续。`
          : `${job.targetItemName} 的强化被你出手打断，暂歇 ${ENHANCEMENT_INTERRUPT_PAUSE_TICKS} 息后继续。`,
        kind: 'system',
      }],
      panelChanged: true,
    };
  }

  tickEnhancement(player: PlayerState): EnhancementMutationResult {
    this.normalizePlayerEnhancementState(player);
    const job = player.enhancementJob;
    if (!job || job.remainingTicks <= 0) {
      return { messages: [], panelChanged: false };
    }
    job.remainingTicks = Math.max(0, job.remainingTicks - 1);
    if (job.phase === 'paused') {
      job.pausedTicks = Math.max(0, job.pausedTicks - 1);
      if (job.pausedTicks > 0) {
        return { messages: [], panelChanged: false };
      }
      job.phase = 'enhancing';
      return { messages: [], panelChanged: true };
    }
    if (job.remainingTicks > 0) {
      return { messages: [], panelChanged: false };
    }

    const success = Math.random() < job.successRate;
    if (
      success
      && !this.consumeInventoryItemById(player, ENHANCEMENT_SPIRIT_STONE_ITEM_ID, job.spiritStoneCost)
    ) {
      return {
        ...this.finishEnhancementJob(
          player,
          job,
          job.currentLevel,
          `${job.item.name} 强化失败，灵石不足，本阶已终止。`,
          'system',
        ),
        panelChanged: true,
        messages: [{
          text: `${job.item.name} 强化失败，灵石不足，本阶已终止。`,
          kind: 'system',
        }],
        error: '本阶灵石不足，任务已终止。',
      };
    }

    const protectionActiveForStep = this.shouldUseProtectionForStep(job.targetLevel, job.protectionStartLevel);
    const resultingLevel = success
      ? job.targetLevel
      : protectionActiveForStep
        ? Math.max(0, job.currentLevel - 1)
        : 0;
    this.recordEnhancementOutcome(player, job.targetItemId, job.targetLevel, success, resultingLevel);
    const skillGain = this.grantEnhancementSkillExp(player, job.targetItemLevel, success);
    const stepSummaryText = success
      ? `${job.item.name} 强化成功，已提升至 +${resultingLevel}。`
      : protectionActiveForStep
        ? `${job.item.name} 强化失败，保护生效，降为 +${resultingLevel}。`
        : `${job.item.name} 强化失败，已归零为 +0。`;
    const stepSummaryKind: EnhancementResultMessage['kind'] = success ? 'quest' : 'system';

    if (resultingLevel < job.desiredTargetLevel) {
      const advanceResult = this.advanceEnhancementJob(player, job, resultingLevel, stepSummaryText, stepSummaryKind);
      if (!advanceResult) {
        return {
          error: '背包空间不足，无法放回强化后的物品。',
          messages: [],
          panelChanged: false,
        };
      }
      if (advanceResult.continued) {
        return {
          messages: [...skillGain.messages, ...advanceResult.messages],
          panelChanged: true,
          inventoryChanged: true,
          attrChanged: skillGain.changed,
          dirtyFlags: skillGain.dirtyFlags,
        };
      }
      return {
        messages: [...skillGain.messages, ...advanceResult.messages],
        panelChanged: true,
        inventoryChanged: advanceResult.inventoryChanged,
        equipmentChanged: advanceResult.equipmentChanged,
        attrChanged: advanceResult.attrChanged || skillGain.changed,
        dirtyFlags: [...(skillGain.dirtyFlags ?? []), ...(advanceResult.dirtyFlags ?? [])],
      };
    }

    const finishResult = this.finishEnhancementJob(player, job, resultingLevel, stepSummaryText, stepSummaryKind);
    return {
      ...finishResult,
      messages: [...skillGain.messages, ...finishResult.messages],
      attrChanged: finishResult.attrChanged || skillGain.changed,
      dirtyFlags: [...(skillGain.dirtyFlags ?? []), ...(finishResult.dirtyFlags ?? [])],
    };
  }

  private resolveRequestedTargetLevel(currentLevel: number, requestedTargetLevel: unknown): number {
    const normalized = Math.floor(Number(requestedTargetLevel) || 0);
    return Math.min(MAX_ENHANCE_LEVEL, Math.max(currentLevel + 1, normalized || (currentLevel + 1)));
  }

  private resolveProtectionStartLevel(
    currentLevel: number,
    desiredTargetLevel: number,
    requestedProtectionStartLevel: unknown,
  ): number {
    const minLevel = currentLevel + 1;
    const normalized = Math.floor(Number(requestedProtectionStartLevel) || 0);
    return Math.max(Math.max(2, minLevel), Math.min(desiredTargetLevel, normalized || Math.max(2, minLevel)));
  }

  private shouldUseProtectionForStep(targetLevel: number, protectionStartLevel: number | undefined): boolean {
    return typeof protectionStartLevel === 'number' && targetLevel >= protectionStartLevel;
  }

  private advanceEnhancementJob(
    player: PlayerState,
    job: PlayerEnhancementJob,
    resultingLevel: number,
    stepSummaryText: string,
    stepSummaryKind: EnhancementResultMessage['kind'],
  ): {
    continued: boolean;
    messages: EnhancementResultMessage[];
    inventoryChanged?: boolean;
    equipmentChanged?: boolean;
    attrChanged?: boolean;
    dirtyFlags?: Array<'inv' | 'tech' | 'attr' | 'actions'>;
  } | null {
    const nextTargetLevel = resultingLevel + 1;
    const config = this.configs.get(job.targetItemId);
    const nextRequirements = this.getStepMaterials(config, nextTargetLevel);
    const nextSpiritStoneCost = getEnhancementSpiritStoneCost(job.targetItemLevel, nextRequirements.length > 0);
    const protectionItemId = this.shouldUseProtectionForStep(nextTargetLevel, job.protectionStartLevel)
      ? this.getProtectionItemId(config, job.targetItemId)
      : undefined;
    if (!this.hasEnoughQueuedStepResources(player, protectionItemId, nextSpiritStoneCost, nextRequirements)) {
      const stopReason = job.protectionUsed
        ? '后续强化所需灵石、材料或保护物不足，队列已停止。'
        : '后续强化所需灵石或材料不足，队列已停止。';
      const finish = this.finishEnhancementJob(
        player,
        job,
        resultingLevel,
        `${stepSummaryText} ${stopReason}`,
        stepSummaryKind,
      );
      return {
        continued: false,
        messages: finish.messages,
        inventoryChanged: finish.inventoryChanged,
        equipmentChanged: finish.equipmentChanged,
        attrChanged: finish.attrChanged,
      };
    }
    if (!this.consumeQueuedStepResources(player, protectionItemId, nextRequirements)) {
      return null;
    }

    const roleEnhancementLevel = this.getEnhancementSkillLevel(player);
    const totalSpeedRate = computeEnhancementToolSpeedRate(
      player.equipment.weapon?.enhancementSpeedRate,
      roleEnhancementLevel,
      job.targetItemLevel,
    );
    const totalTicks = computeEnhancementJobTicks(job.targetItemLevel, totalSpeedRate);

    job.currentLevel = resultingLevel;
    job.targetLevel = nextTargetLevel;
    job.item = this.contentService.normalizeItemStack({
      ...job.item,
      count: 1,
      enhanceLevel: resultingLevel,
    });
    job.spiritStoneCost = nextSpiritStoneCost;
    job.materials = nextRequirements.map((entry) => ({ ...entry }));
    job.phase = 'enhancing';
    job.pausedTicks = 0;
    job.successRate = computeEnhancementAdjustedSuccessRate(nextTargetLevel, roleEnhancementLevel, job.targetItemLevel);
    job.totalTicks = totalTicks;
    job.remainingTicks = totalTicks;
    job.startedAt = Date.now();
    job.roleEnhancementLevel = roleEnhancementLevel;
    job.totalSpeedRate = totalSpeedRate;

    return {
      continued: true,
      messages: [{
        text: `${stepSummaryText} 继续冲击 +${nextTargetLevel}，首息已投入。`,
        kind: stepSummaryKind,
      }],
    };
  }

  private finishEnhancementJob(
    player: PlayerState,
    job: PlayerEnhancementJob,
    resultingLevel: number,
    text: string,
    kind: EnhancementResultMessage['kind'],
  ): EnhancementMutationResult {
    const resolvedItem = this.contentService.normalizeItemStack({
      ...job.item,
      count: 1,
      enhanceLevel: resultingLevel,
    });

    if (job.target.source === 'equipment' && job.target.slot) {
      player.equipment[job.target.slot] = resolvedItem;
    } else if (!this.inventoryService.addItem(player, resolvedItem)) {
      const dirtyPlayers = this.lootService.dropToGround(player.mapId, player.x, player.y, resolvedItem);
      player.enhancementJob = null;
      return {
        messages: [{
          text: `${text} 背包已满，强化后的物品落在你脚边。`,
          kind: 'loot',
        }],
        panelChanged: true,
        dirtyPlayers,
      };
    }
    player.enhancementJob = null;
    return {
      messages: [{ text, kind }],
      panelChanged: true,
      inventoryChanged: job.target.source === 'inventory',
      equipmentChanged: job.target.source === 'equipment',
      attrChanged: job.target.source === 'equipment',
    };
  }

  private hasEnoughQueuedStepResources(
    player: PlayerState,
    protectionItemId: string | undefined,
    spiritStoneCost: number,
    requirements: EnhancementMaterialRequirement[],
  ): boolean {
    const counts = new Map<string, number>();
    for (const item of player.inventory.items) {
      counts.set(item.itemId, (counts.get(item.itemId) ?? 0) + Math.max(0, Math.floor(item.count)));
    }
    if ((counts.get(ENHANCEMENT_SPIRIT_STONE_ITEM_ID) ?? 0) < spiritStoneCost) {
      return false;
    }
    if (protectionItemId && (counts.get(protectionItemId) ?? 0) < 1) {
      return false;
    }
    return requirements.every((entry) => (counts.get(entry.itemId) ?? 0) >= entry.count);
  }

  private consumeQueuedStepResources(
    player: PlayerState,
    protectionItemId: string | undefined,
    requirements: EnhancementMaterialRequirement[],
  ): boolean {
    if (protectionItemId && !this.consumeInventoryItemById(player, protectionItemId, 1)) {
      return false;
    }
    for (const requirement of requirements) {
      if (!this.consumeInventoryItemById(player, requirement.itemId, requirement.count)) {
        return false;
      }
    }
    return true;
  }

  blocksEquipSlotChange(player: PlayerState, slot: EquipSlot): boolean {
    const job = player.enhancementJob;
    if (!job || job.remainingTicks <= 0) {
      return false;
    }
    if (slot === 'weapon') {
      return true;
    }
    return job.target.source === 'equipment' && job.target.slot === slot;
  }

  getLockedSlotReason(player: PlayerState, slot: EquipSlot): string | null {
    if (!this.blocksEquipSlotChange(player, slot)) {
      return null;
    }
    const job = player.enhancementJob;
    if (!job) {
      return null;
    }
    if (slot === 'weapon') {
      return '强化进行中，暂时不能替换或卸下强化锤。';
    }
    return `${job.targetItemName} 强化进行中，暂时不能更换对应装备槽。`;
  }

  private normalizePlayerEnhancementState(player: PlayerState): void {
    this.ensureEnhancementSkill(player);
    player.enhancementRecords = this.getSessionRecordArray(player);
    const job = player.enhancementJob;
    if (!job) {
      player.enhancementJob = null;
      return;
    }
    job.currentLevel = normalizeEnhanceLevel(job.currentLevel);
    job.targetLevel = Math.min(MAX_ENHANCE_LEVEL, Math.max(job.currentLevel + 1, Math.floor(Number(job.targetLevel) || (job.currentLevel + 1))));
    job.desiredTargetLevel = Math.min(MAX_ENHANCE_LEVEL, Math.max(job.targetLevel, Math.floor(Number(job.desiredTargetLevel) || job.targetLevel)));
    job.protectionStartLevel = job.protectionUsed
      ? Math.max(2, Math.floor(Number(job.protectionStartLevel) || job.targetLevel))
      : undefined;
    job.phase = job.phase === 'paused' ? 'paused' : 'enhancing';
    job.pausedTicks = job.phase === 'paused'
      ? Math.max(0, Math.floor(Number(job.pausedTicks) || 0))
      : 0;
    job.targetItemLevel = Math.max(1, Math.floor(Number(job.targetItemLevel) || job.item.level || 1));
    job.spiritStoneCost = Math.max(0, Math.floor(Number(job.spiritStoneCost) || 0));
    job.totalTicks = Math.max(1, Math.floor(Number(job.totalTicks) || 1));
    job.remainingTicks = Math.max(0, Math.min(job.totalTicks, Math.floor(Number(job.remainingTicks) || 0)));
    job.successRate = Math.max(0, Math.min(1, Number(job.successRate) || 0));
    job.roleEnhancementLevel = Math.max(1, Math.floor(Number(job.roleEnhancementLevel) || 1));
    job.totalSpeedRate = Math.max(0, Number(job.totalSpeedRate) || 0);
    job.item = this.contentService.normalizeItemStack({
      ...job.item,
      count: 1,
      enhanceLevel: job.currentLevel,
    });
    if (job.remainingTicks <= 0) {
      player.enhancementJob = null;
    }
  }

  private buildPanelState(player: PlayerState): SyncedEnhancementPanelState | null {
    if (!this.hasEquippedHammer(player) && !this.hasActiveEnhancementJob(player)) {
      return null;
    }
    const candidates = this.collectCandidates(player);
    const visibleItemIds = new Set(candidates.map((entry) => entry.item.itemId));
    if (player.enhancementJob?.targetItemId) {
      visibleItemIds.add(player.enhancementJob.targetItemId);
    }
    const sessionRecord = this.getSessionRecord(player);
    return {
      hammerItemId: player.equipment.weapon?.tags?.includes(ENHANCEMENT_HAMMER_TAG)
        ? player.equipment.weapon.itemId
        : undefined,
      enhancementSkillLevel: this.getEnhancementSkillLevel(player),
      candidates,
      records: sessionRecord && visibleItemIds.has(sessionRecord.itemId)
        ? [this.cloneEnhancementRecord(sessionRecord)]
        : [],
      job: player.enhancementJob ? {
        ...structuredClone(player.enhancementJob),
        item: cloneItem(player.enhancementJob.item),
        materials: player.enhancementJob.materials.map((entry) => ({ ...entry })),
      } : null,
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
    if (item.type !== 'equipment') {
      return null;
    }
    if (
      player.enhancementJob?.target.source === ref.source
      && player.enhancementJob.target.slot === ref.slot
      && player.enhancementJob.target.slotIndex === ref.slotIndex
    ) {
      return null;
    }

    const config = this.configs.get(item.itemId);
    const currentLevel = normalizeEnhanceLevel(item.enhanceLevel);
    if (currentLevel >= MAX_ENHANCE_LEVEL) {
      return null;
    }
    const nextLevel = currentLevel + 1;
    const hammer = player.equipment.weapon;
    const roleEnhancementLevel = this.getEnhancementSkillLevel(player);
    const totalSpeedRate = computeEnhancementToolSpeedRate(
      hammer?.enhancementSpeedRate,
      roleEnhancementLevel,
      item.level,
    );
    const protectionItemId = this.getProtectionItemId(config, item.itemId);
    const protectionItemName = protectionItemId
      ? (this.contentService.getItem(protectionItemId)?.name ?? protectionItemId)
      : undefined;

    return {
      ref,
      item: cloneItem(item),
      currentLevel,
      nextLevel,
      spiritStoneCost: getEnhancementSpiritStoneCost(item.level, this.getStepMaterials(config, nextLevel).length > 0),
      successRate: computeEnhancementAdjustedSuccessRate(nextLevel, roleEnhancementLevel, item.level),
      durationTicks: computeEnhancementJobTicks(item.level, totalSpeedRate),
      materials: this.getStepMaterials(config, nextLevel).map((entry) => this.buildRequirementView(player, entry)),
      protectionItemId: config?.protectionItemId,
      protectionItemName,
      allowSelfProtection: !config?.protectionItemId,
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

  private getStepMaterials(
    config: EquipmentEnhancementConfig | undefined,
    targetEnhanceLevel: number,
  ): EnhancementMaterialRequirement[] {
    const step = config?.steps.find((entry) => entry.targetEnhanceLevel === targetEnhanceLevel);
    return (step?.materials ?? []).map((entry) => ({ ...entry }));
  }

  private getProtectionItemId(config: EquipmentEnhancementConfig | undefined, fallbackItemId: string): string {
    return config?.protectionItemId ?? fallbackItemId;
  }

  private buildProtectionCandidates(
    player: PlayerState,
    targetRef: EnhancementTargetRef,
    targetItem: ItemStack,
    config?: EquipmentEnhancementConfig,
  ): SyncedEnhancementProtectionCandidate[] {
    const protectionItemId = this.getProtectionItemId(config, targetItem.itemId);
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
    config?: EquipmentEnhancementConfig,
  ): ResolvedEnhancementTarget | null {
    if (ref.source !== 'inventory') {
      return null;
    }
    const protection = this.resolveTarget(player, ref);
    if (!protection || protection.source !== 'inventory') {
      return null;
    }
    const expectedItemId = this.getProtectionItemId(config, target.item.itemId);
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
    protectionRequired: boolean,
  ): boolean {
    const counts = new Map<string, number>();
    for (const item of player.inventory.items) {
      counts.set(item.itemId, (counts.get(item.itemId) ?? 0) + Math.max(0, Math.floor(item.count)));
    }
    if (target.source === 'inventory') {
      counts.set(target.item.itemId, (counts.get(target.item.itemId) ?? 0) - 1);
    }
    if (protectionRequired && protection?.source === 'inventory') {
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
    const record = this.prepareSessionRecord(player, itemId, resultingLevel);
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
    player.enhancementRecords = [this.cloneEnhancementRecord(record)];
  }

/** ensureEnhancementSkill：处理当前场景中的对应操作。 */
  private ensureEnhancementSkill(player: PlayerState) {
    const legacyLevel = Math.max(1, Math.floor(Number(player.enhancementSkill?.level ?? player.enhancementSkillLevel) || 1));
    const fallbackExpToNext = this.getEnhancementSkillExpToNext(legacyLevel);
    const normalized = normalizeAlchemySkillState(player.enhancementSkill ?? {
      level: legacyLevel,
      exp: 0,
      expToNext: fallbackExpToNext,
    }, fallbackExpToNext);
    if (normalized.expToNext <= 0) {
      normalized.expToNext = fallbackExpToNext;
    }
    player.enhancementSkill = normalized;
    player.enhancementSkillLevel = normalized.level;
    return normalized;
  }

  private getEnhancementSkillLevel(player: PlayerState): number {
    return Math.max(1, this.ensureEnhancementSkill(player).level);
  }

  private getEnhancementSkillExpToNext(level: number): number {
    const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
    return Math.max(0, this.contentService.getRealmLevelEntry(normalizedLevel)?.expToNext ?? 0);
  }

  private grantEnhancementSkillExp(
    player: PlayerState,
    targetItemLevel: number,
    success: boolean,
  ): { changed: boolean; messages: EnhancementResultMessage[]; dirtyFlags: Array<'inv' | 'tech' | 'attr' | 'actions'> } {
    const skill = this.ensureEnhancementSkill(player);
    if (skill.expToNext <= 0) {
      return { changed: false, messages: [], dirtyFlags: [] };
    }
    const successGain = computeTimedCraftSkillExp(
      this.getEnhancementSkillExpToNext(targetItemLevel),
      targetItemLevel,
      computeEnhancementJobBaseTicks(targetItemLevel),
    );
    const failureReferenceLevel = Math.min(
      Math.max(1, Math.floor(Number(targetItemLevel) || 1)),
      Math.max(1, Math.floor(Number(skill.level) || 1)),
    );
    const baseGain = success
      ? successGain
      : computeTimedCraftSkillExp(
        this.getEnhancementSkillExpToNext(failureReferenceLevel),
        failureReferenceLevel,
        computeEnhancementJobBaseTicks(targetItemLevel),
        0.25,
      );
    const gain = Math.max(0, Math.round(baseGain * getCraftSkillEarlyLevelExpMultiplier(skill.level)));
    if (gain <= 0) {
      return { changed: false, messages: [], dirtyFlags: [] };
    }
    skill.exp += gain;
    const messages: EnhancementResultMessage[] = [];
    while (skill.expToNext > 0 && skill.exp >= skill.expToNext) {
      skill.exp -= skill.expToNext;
      skill.level += 1;
      skill.expToNext = this.getEnhancementSkillExpToNext(skill.level);
      if (skill.expToNext <= 0) {
        skill.exp = 0;
      }
      messages.push({
        text: `强化技艺提升至 LV ${skill.level}。`,
        kind: 'quest',
      });
    }
    player.enhancementSkill = skill;
    player.enhancementSkillLevel = skill.level;
    const craftRealmGain = this.techniqueService.grantCraftRealmExp(player, gain / 2);
    const craftRealmMessages: EnhancementResultMessage[] = craftRealmGain.messages.map((message) => ({
      text: message.text,
      kind: message.kind === 'loot'
        ? 'loot'
        : message.kind === 'quest'
          ? 'quest'
          : 'system',
    }));
    return {
      changed: true,
      messages: [...messages, ...craftRealmMessages],
      dirtyFlags: craftRealmGain.dirty,
    };
  }

  private getSessionRecord(player: PlayerState): PlayerEnhancementRecord | null {
    const raw = player.enhancementRecords?.[0];
    if (!raw || typeof raw.itemId !== 'string' || raw.itemId.length <= 0) {
      return null;
    }
    return {
      itemId: raw.itemId,
      highestLevel: normalizeEnhanceLevel(raw.highestLevel),
      levels: (raw.levels ?? [])
        .map((level): PlayerEnhancementLevelRecord => ({
          targetLevel: Math.max(1, Math.floor(Number(level.targetLevel) || 1)),
          successCount: Math.max(0, Math.floor(Number(level.successCount) || 0)),
          failureCount: Math.max(0, Math.floor(Number(level.failureCount) || 0)),
        }))
        .sort((left, right) => left.targetLevel - right.targetLevel),
    };
  }

  private getSessionRecordArray(player: PlayerState): PlayerEnhancementRecord[] {
    const record = this.getSessionRecord(player);
    return record ? [record] : [];
  }

  private cloneEnhancementRecord(record: PlayerEnhancementRecord): PlayerEnhancementRecord {
    return {
      itemId: record.itemId,
      highestLevel: normalizeEnhanceLevel(record.highestLevel),
      levels: (record.levels ?? [])
        .map((level): PlayerEnhancementLevelRecord => ({
          targetLevel: Math.max(1, Math.floor(Number(level.targetLevel) || 1)),
          successCount: Math.max(0, Math.floor(Number(level.successCount) || 0)),
          failureCount: Math.max(0, Math.floor(Number(level.failureCount) || 0)),
        }))
        .sort((left, right) => left.targetLevel - right.targetLevel),
    };
  }

  private prepareSessionRecord(
    player: PlayerState,
    itemId: string,
    initialHighestLevel: number,
  ): PlayerEnhancementRecord {
    const current = this.getSessionRecord(player);
    if (current?.itemId === itemId) {
      current.highestLevel = Math.max(current.highestLevel, normalizeEnhanceLevel(initialHighestLevel));
      player.enhancementRecords = [this.cloneEnhancementRecord(current)];
      return current;
    }
    const next: PlayerEnhancementRecord = {
      itemId,
      highestLevel: normalizeEnhanceLevel(initialHighestLevel),
      levels: [],
    };
    player.enhancementRecords = [this.cloneEnhancementRecord(next)];
    return next;
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
