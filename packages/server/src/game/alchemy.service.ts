import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import {
  ActionDef,
  ALCHEMY_PREPARATION_TICKS,
  ALCHEMY_MAX_PRESET_COUNT,
  AlchemySkillState,
  AlchemyIngredientSelection,
  AlchemyRecipeCatalogEntry,
  AlchemyRecipeCategory,
  C2S_DeleteAlchemyPreset,
  C2S_SaveAlchemyPreset,
  C2S_StartAlchemy,
  PlayerAlchemyJob,
  PlayerAlchemyPreset,
  PlayerState,
  S2C_AlchemyPanel,
  SyncedAlchemyPanelState,
  TechniqueGrade,
  VisibleBuffState,
  computeAlchemyAdjustedBrewTicks,
  computeAlchemyAdjustedSuccessRate,
  computeAlchemyTotalJobTicks,
  buildAlchemyIngredientCountMap,
  computeAlchemyBatchOutputCountWithSize,
  computeAlchemyMaterialPower,
  computeAlchemySuccessRate,
  computeTimedCraftSkillExp,
  getCraftSkillEarlyLevelExpMultiplier,
  getAlchemySpiritStoneCost,
  isExactAlchemyRecipe,
  normalizeAlchemyIngredientSelections,
  normalizeAlchemyQuantity,
  normalizeAlchemySkillState,
} from '@mud/shared';
import { resolveServerDataPath } from '../common/data-path';
import { MARKET_CURRENCY_ITEM_ID } from '../constants/gameplay/market';
import { InventoryService } from './inventory.service';
import { ContentService } from './content.service';
import { LootService } from './loot.service';
import { TechniqueService } from './technique.service';

/** RawAlchemyRecipeIngredient：定义该接口的能力与字段约束。 */
interface RawAlchemyRecipeIngredient {
  itemId: string;
  count: number;
  role: 'main' | 'aux';
}

/** RawAlchemyRecipe：定义该接口的能力与字段约束。 */
interface RawAlchemyRecipe {
  recipeId: string;
  outputItemId: string;
  outputCount?: number;
  baseBrewTicks: number;
  ingredients: RawAlchemyRecipeIngredient[];
}

/** AlchemyResultMessage：定义该接口的能力与字段约束。 */
interface AlchemyResultMessage {
  text: string;
  kind?: 'system' | 'quest' | 'loot';
}

/** AlchemyMutationResult：定义该接口的能力与字段约束。 */
export interface AlchemyMutationResult {
  error?: string;
  messages: AlchemyResultMessage[];
  panelChanged: boolean;
  inventoryChanged?: boolean;
  dirtyPlayers?: string[];
  attrChanged?: boolean;
  dirtyFlags?: Array<'inv' | 'tech' | 'attr' | 'actions'>;
}

/** AlchemyBatchResolution：定义该接口的能力与字段约束。 */
interface AlchemyBatchResolution {
  inventoryChanged: boolean;
  dirtyPlayers: string[];
  messages: AlchemyResultMessage[];
  successCount: number;
  failureCount: number;
}

/** AlchemyGrantResolution：定义该接口的能力与字段约束。 */
interface AlchemyGrantResolution {
  inventoryChanged: boolean;
  dirtyPlayers: string[];
  droppedToGround: boolean;
}

const ALCHEMY_ACTION_ID = 'alchemy:open';
const ALCHEMY_FURNACE_TAG = 'alchemy_furnace';
const ALCHEMY_CATALOG_VERSION = 2;
const ALCHEMY_MAX_NAME_LENGTH = 24;
const DEFAULT_ALCHEMY_EXP_TO_NEXT = 60;
const ALCHEMY_BUFF_ID = 'system.alchemy';
const ALCHEMY_INTERRUPT_PAUSE_TICKS = 10;

/** normalizePositiveInt：执行对应的业务逻辑。 */
function normalizePositiveInt(value: unknown, fallback = 1): number {
  return Math.max(1, Math.floor(Number(value) || fallback));
}

/** normalizePresetName：执行对应的业务逻辑。 */
function normalizePresetName(name: string | undefined, fallback: string): string {
  const normalized = (name ?? '').trim();
  return (normalized || fallback).slice(0, ALCHEMY_MAX_NAME_LENGTH);
}

/** clampAlchemyModifier：执行对应的业务逻辑。 */
function clampAlchemyModifier(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(-0.95, Number(value));
}

@Injectable()
/** AlchemyService：封装相关状态与行为。 */
export class AlchemyService implements OnModuleInit {
  private readonly logger = new Logger(AlchemyService.name);
  private readonly recipes = new Map<string, AlchemyRecipeCatalogEntry>();
  private readonly catalog: AlchemyRecipeCatalogEntry[] = [];

  constructor(
    private readonly contentService: ContentService,
    private readonly inventoryService: InventoryService,
    private readonly lootService: LootService,
    private readonly techniqueService: TechniqueService,
  ) {}

  onModuleInit(): void {
    this.loadRecipes();
  }

  getCatalogVersion(): number {
    return ALCHEMY_CATALOG_VERSION;
  }

  hasEquippedFurnace(player: PlayerState): boolean {
    return Boolean(player.equipment.weapon?.tags?.includes(ALCHEMY_FURNACE_TAG));
  }

  hasActiveAlchemyJob(player: PlayerState): boolean {
    return (player.alchemyJob?.remainingTicks ?? 0) > 0;
  }

  buildVisibleAlchemyBuff(player: PlayerState): VisibleBuffState | null {
    const job = player.alchemyJob;
    if (!job || job.remainingTicks <= 0) {
      return null;
    }
    const recipe = this.recipes.get(job.recipeId);
    const quantityText = job.quantity > 1 ? `，共 ${job.quantity} 炉` : '';
    const currentBatch = Math.min(job.quantity, Math.max(1, job.completedCount + 1));
    const pausedResumePhase = this.resolveJobResumePhase(job);
    const desc = job.phase === 'paused'
      ? pausedResumePhase === 'preparing'
        ? `炉火暂歇，${job.pausedTicks} 息后继续起炉${quantityText}。移动或出手会重新暂停炼丹。`
        : `炉火暂歇，${job.pausedTicks} 息后继续炼制${recipe?.outputName ?? '丹药'} 第 ${currentBatch}/${job.quantity} 炉。移动或出手会重新暂停炼丹。`
      : job.phase === 'preparing'
        ? `正在暖炉定火，${this.getPreparationRemainingTicks(job)} 息后自动开炼${quantityText}。移动或出手会让炉火暂歇 ${ALCHEMY_INTERRUPT_PAUSE_TICKS} 息。`
        : `正在炼制${recipe?.outputName ?? '丹药'} 第 ${currentBatch}/${job.quantity} 炉，当前炉剩余 ${job.currentBatchRemainingTicks} 息。移动或出手会让炉火暂歇 ${ALCHEMY_INTERRUPT_PAUSE_TICKS} 息。`;
    return {
      buffId: ALCHEMY_BUFF_ID,
      name: '炼丹',
      desc,
      shortMark: '丹',
      category: 'buff',
      visibility: 'public',
      remainingTicks: job.remainingTicks,
      duration: job.totalTicks,
      stacks: 1,
      maxStacks: 1,
      sourceSkillId: ALCHEMY_ACTION_ID,
      sourceSkillName: '炼丹',
      realmLv: Math.max(1, player.realm?.realmLv ?? player.realmLv ?? 1),
      infiniteDuration: true,
    };
  }

  getAlchemyAction(player: PlayerState): ActionDef | null {
    if (!this.hasEquippedFurnace(player)) {
      return null;
    }
    return {
      id: ALCHEMY_ACTION_ID,
      name: '炼丹',
      type: 'interact',
      desc: '打开丹炉界面，查看完整丹方与本地简易丹方，并开始炼制当前丹药。',
      cooldownLeft: 0,
    };
  }

  buildPanelPayload(player: PlayerState, knownCatalogVersion?: number): S2C_AlchemyPanel {
    this.normalizePlayerAlchemyState(player);
    const state = this.buildPanelState(player);
    const response: S2C_AlchemyPanel = {
      state,
      catalogVersion: ALCHEMY_CATALOG_VERSION,
    };
    if (knownCatalogVersion !== ALCHEMY_CATALOG_VERSION) {
      response.catalog = this.catalog.map((entry) => ({
        ...entry,
        ingredients: entry.ingredients.map((ingredient) => ({ ...ingredient })),
      }));
    }
    if (!state) {
      response.error = '尚未装备丹炉。';
    }
    return response;
  }

  savePreset(player: PlayerState, payload: C2S_SaveAlchemyPreset): AlchemyMutationResult {
    this.normalizePlayerAlchemyState(player);
    if (!this.hasEquippedFurnace(player)) {
      return { error: '尚未装备丹炉，无法整理简易丹方。', messages: [], panelChanged: false };
    }
    const recipe = this.recipes.get(payload.recipeId);
    if (!recipe) {
      return { error: '对应丹方不存在。', messages: [], panelChanged: false };
    }
    const normalizedIngredients = this.validateSelection(recipe, payload.ingredients);
    if ('error' in normalizedIngredients) {
      return { error: normalizedIngredients.error, messages: [], panelChanged: false };
    }
    const presets = [...(player.alchemyPresets ?? [])];
    const existingIndex = payload.presetId
      ? presets.findIndex((entry) => entry.presetId === payload.presetId)
      : -1;
    if (existingIndex < 0 && presets.length >= ALCHEMY_MAX_PRESET_COUNT) {
      return { error: `简易丹方最多保存 ${ALCHEMY_MAX_PRESET_COUNT} 条。`, messages: [], panelChanged: false };
    }
    const fallbackName = `${recipe.outputName}简方`;
    const nextPreset: PlayerAlchemyPreset = {
      presetId: existingIndex >= 0 ? presets[existingIndex]!.presetId : randomUUID(),
      recipeId: recipe.recipeId,
      name: normalizePresetName(payload.name, fallbackName),
      ingredients: normalizedIngredients.ingredients,
      updatedAt: Date.now(),
    };
    if (existingIndex >= 0) {
      presets[existingIndex] = nextPreset;
    } else {
      presets.push(nextPreset);
    }
    presets.sort((left, right) => right.updatedAt - left.updatedAt);
    player.alchemyPresets = presets;
    return {
      messages: [{ text: `已保存简易丹方：${nextPreset.name}。`, kind: 'quest' }],
      panelChanged: true,
    };
  }

  deletePreset(player: PlayerState, payload: C2S_DeleteAlchemyPreset): AlchemyMutationResult {
    this.normalizePlayerAlchemyState(player);
    const presets = player.alchemyPresets ?? [];
    const next = presets.filter((entry) => entry.presetId !== payload.presetId);
    if (next.length === presets.length) {
      return { error: '对应简易丹方不存在。', messages: [], panelChanged: false };
    }
    player.alchemyPresets = next;
    return {
      messages: [{ text: '已删除简易丹方。', kind: 'quest' }],
      panelChanged: true,
    };
  }

  startAlchemy(player: PlayerState, payload: C2S_StartAlchemy): AlchemyMutationResult {
    this.normalizePlayerAlchemyState(player);
    if (!this.hasEquippedFurnace(player)) {
      return { error: '尚未装备丹炉，无法炼丹。', messages: [], panelChanged: false };
    }
    if ((player.alchemyJob?.remainingTicks ?? 0) > 0) {
      return { error: '当前已有炼丹任务在进行中。', messages: [], panelChanged: false };
    }
    const recipe = this.recipes.get(payload.recipeId);
    if (!recipe) {
      return { error: '对应丹方不存在。', messages: [], panelChanged: false };
    }
    const normalizedSelection = this.validateSelection(recipe, payload.ingredients);
    if ('error' in normalizedSelection) {
      return { error: normalizedSelection.error, messages: [], panelChanged: false };
    }
    const quantity = normalizeAlchemyQuantity(payload.quantity);
    const totalIngredients = normalizedSelection.ingredients.map((entry) => ({
      itemId: entry.itemId,
      count: entry.count * quantity,
    }));
    const missingItem = totalIngredients.find((entry) => this.getInventoryCount(player, entry.itemId) < entry.count);
    if (missingItem) {
      const ingredient = recipe.ingredients.find((entry) => entry.itemId === missingItem.itemId);
      return {
        error: ingredient ? `${ingredient.name} 数量不足。` : '材料数量不足。',
        messages: [],
        panelChanged: false,
      };
    }
    const spiritStoneCost = this.getRecipeSpiritStoneCost(recipe, quantity);
    const spiritStoneName = this.contentService.getItem(MARKET_CURRENCY_ITEM_ID)?.name ?? '灵石';
    if (this.getInventoryCount(player, MARKET_CURRENCY_ITEM_ID) < spiritStoneCost) {
      return {
        error: `${spiritStoneName}不足，需要 ${spiritStoneCost} 枚。`,
        messages: [],
        panelChanged: false,
      };
    }

    for (const ingredient of totalIngredients) {
      this.consumeInventoryItem(player, ingredient.itemId, ingredient.count);
    }
    this.consumeInventoryItem(player, MARKET_CURRENCY_ITEM_ID, spiritStoneCost);

    const alchemySkill = this.ensureAlchemySkill(player);
    const furnaceBonuses = this.getAlchemyFurnaceBonuses(player);
    const baseSuccessRate = computeAlchemySuccessRate(recipe, normalizedSelection.ingredients);
    const batchBrewTicks = computeAlchemyAdjustedBrewTicks(
      recipe.baseBrewTicks,
      recipe,
      normalizedSelection.ingredients,
      recipe.outputLevel,
      alchemySkill.level,
      furnaceBonuses.speedRate,
      this.getRecipeBatchOutputSize(recipe),
    );
    const totalTicks = computeAlchemyTotalJobTicks(batchBrewTicks, quantity, ALCHEMY_PREPARATION_TICKS);
    const exactRecipe = isExactAlchemyRecipe(recipe, normalizedSelection.ingredients);
    const successRate = computeAlchemyAdjustedSuccessRate(
      baseSuccessRate,
      recipe.outputLevel,
      alchemySkill.level,
      furnaceBonuses.successRate,
    );
    const batchOutputCount = computeAlchemyBatchOutputCountWithSize(
      recipe.outputCount,
      this.getRecipeBatchOutputSize(recipe),
    );
    player.alchemyJob = {
      recipeId: recipe.recipeId,
      outputItemId: recipe.outputItemId,
      outputCount: batchOutputCount,
      quantity,
      completedCount: 0,
      successCount: 0,
      failureCount: 0,
      ingredients: normalizedSelection.ingredients,
      phase: 'preparing',
      preparationTicks: ALCHEMY_PREPARATION_TICKS,
      batchBrewTicks,
      currentBatchRemainingTicks: batchBrewTicks,
      pausedTicks: 0,
      spiritStoneCost,
      totalTicks,
      remainingTicks: totalTicks,
      successRate,
      exactRecipe,
      startedAt: Date.now(),
    };

    return {
      messages: [{
        text: `开始准备炼制 ${recipe.outputName}${quantity > 1 ? `，共 ${quantity} 炉` : ''}${spiritStoneCost > 0 ? `，消耗 ${spiritStoneName} x${spiritStoneCost}` : ''}；${ALCHEMY_PREPARATION_TICKS} 息后自动开炼，总计 ${totalTicks} 息。单炉固定 ${batchOutputCount} 枚，每枚成丹率 ${(successRate * 100).toFixed(successRate === 1 ? 0 : 1)}%。`,
        kind: 'quest',
      }],
      panelChanged: true,
      inventoryChanged: true,
    };
  }

  cancelAlchemy(player: PlayerState): AlchemyMutationResult {
    const job = player.alchemyJob;
    if (!job || job.remainingTicks <= 0) {
      return { error: '当前没有可取消的炼丹任务。', messages: [], panelChanged: false };
    }
    const recipe = this.recipes.get(job.recipeId);
    if (!recipe) {
      player.alchemyJob = null;
      return {
        messages: [{ text: '当前炼丹任务的丹方已失效，任务已直接移除。', kind: 'system' }],
        panelChanged: true,
      };
    }

    const refundableBatchCount = this.getRefundableBatchCount(job);
    const refundedLabels: string[] = [];
    const droppedLabels: string[] = [];
    const dirtyPlayerIds = new Set<string>();
    let inventoryChanged = false;

    for (const ingredient of job.ingredients) {
      const refundCount = ingredient.count * refundableBatchCount;
      if (refundCount <= 0) {
        continue;
      }
      const grant = this.grantAlchemyRefundItem(player, ingredient.itemId, refundCount);
      inventoryChanged ||= grant.inventoryChanged;
      for (const dirtyPlayerId of grant.dirtyPlayers) {
        dirtyPlayerIds.add(dirtyPlayerId);
      }
      const label = `${this.getRefundItemName(ingredient.itemId)} x${refundCount}`;
      if (grant.droppedToGround) {
        droppedLabels.push(label);
      } else {
        refundedLabels.push(label);
      }
    }

    const refundableSpiritStones = this.getRecipeSpiritStoneCost(recipe, refundableBatchCount);
    if (refundableSpiritStones > 0) {
      const grant = this.grantAlchemyRefundItem(player, MARKET_CURRENCY_ITEM_ID, refundableSpiritStones);
      inventoryChanged ||= grant.inventoryChanged;
      for (const dirtyPlayerId of grant.dirtyPlayers) {
        dirtyPlayerIds.add(dirtyPlayerId);
      }
      const label = `${this.getRefundItemName(MARKET_CURRENCY_ITEM_ID)} x${refundableSpiritStones}`;
      if (grant.droppedToGround) {
        droppedLabels.push(label);
      } else {
        refundedLabels.push(label);
      }
    }

    const lostCurrentBatch = this.getCurrentBatchLostOnCancel(job);
    player.alchemyJob = null;

    const summaryParts: string[] = [];
    if (refundedLabels.length > 0) {
      summaryParts.push(`已退回 ${refundedLabels.join('、')}`);
    }
    if (droppedLabels.length > 0) {
      summaryParts.push(`${droppedLabels.join('、')} 背包放不下，已落在脚边`);
    }
    if (lostCurrentBatch) {
      summaryParts.push('当前这一炉已经开炼，无法退回');
    }
    if (summaryParts.length === 0) {
      summaryParts.push('当前这一炉已经开炼，没有可退回的剩余材料与灵石');
    }

    return {
      messages: [{
        text: `你收了炉火，取消了 ${recipe.outputName} 的炼制。${summaryParts.join('；')}。`,
        kind: 'system',
      }],
      panelChanged: true,
      inventoryChanged,
      dirtyPlayers: [...dirtyPlayerIds],
    };
  }

  interruptAlchemy(player: PlayerState, reason: 'move' | 'attack'): AlchemyMutationResult {
    const job = player.alchemyJob;
    if (!job || job.remainingTicks <= 0) {
      return { messages: [], panelChanged: false };
    }
    const recipe = this.recipes.get(job.recipeId);
    const currentPausedTicks = job.phase === 'paused' ? job.pausedTicks : 0;
    const addedPauseTicks = Math.max(0, ALCHEMY_INTERRUPT_PAUSE_TICKS - currentPausedTicks);
    job.phase = 'paused';
    job.pausedTicks = ALCHEMY_INTERRUPT_PAUSE_TICKS;
    if (addedPauseTicks > 0) {
      job.remainingTicks += addedPauseTicks;
      job.totalTicks += addedPauseTicks;
    }
    return {
      messages: [{
        text: reason === 'move'
          ? `${recipe?.outputName ?? '当前丹药'} 的炼丹被你移动身形惊动，炉火暂歇，${ALCHEMY_INTERRUPT_PAUSE_TICKS} 息后继续。`
          : `${recipe?.outputName ?? '当前丹药'} 的炼丹被你出手惊动，炉火暂歇，${ALCHEMY_INTERRUPT_PAUSE_TICKS} 息后继续。`,
        kind: 'system',
      }],
      panelChanged: true,
    };
  }

  tickAlchemy(player: PlayerState): AlchemyMutationResult {
    const job = player.alchemyJob;
    if (!job || job.remainingTicks <= 0) {
      return { messages: [], panelChanged: false };
    }
    job.remainingTicks = Math.max(0, job.remainingTicks - 1);
    if (job.phase === 'paused') {
      job.pausedTicks = Math.max(0, job.pausedTicks - 1);
      if (job.pausedTicks > 0) {
        return { messages: [], panelChanged: false };
      }
      job.phase = this.resolveJobResumePhase(job);
      return { messages: [], panelChanged: true };
    }
    if (job.phase === 'preparing') {
      const brewTotalTicks = this.getRemainingBrewTicks(job);
      if (job.remainingTicks <= brewTotalTicks) {
        job.phase = 'brewing';
        job.currentBatchRemainingTicks = job.batchBrewTicks;
        if (job.remainingTicks > 0) {
          return {
            messages: [{
              text: `${this.recipes.get(job.recipeId)?.outputName ?? '丹药'} 炉火已稳，开始正式炼制。`,
              kind: 'quest',
            }],
            panelChanged: true,
          };
        }
      }
    }
    if (job.remainingTicks > 0) {
      if (job.phase === 'brewing') {
        job.currentBatchRemainingTicks = Math.max(0, job.currentBatchRemainingTicks - 1);
      }
      if (job.phase !== 'brewing' || job.currentBatchRemainingTicks > 0) {
        return { messages: [], panelChanged: false };
      }
    } else if (job.phase === 'brewing') {
      job.currentBatchRemainingTicks = 0;
    }

    const recipe = this.recipes.get(job.recipeId);
    if (!recipe) {
      player.alchemyJob = null;
      return {
        messages: [{ text: '炼丹任务完成时未找到对应丹方，本次炼制作废。', kind: 'system' }],
        panelChanged: true,
      };
    }

    const currentBatch = Math.min(job.quantity, Math.max(1, job.completedCount + 1));
    const batchResolution = this.resolveAlchemyBatch(player, job, recipe, currentBatch);
    job.completedCount += 1;
    job.successCount += batchResolution.successCount;
    job.failureCount += batchResolution.failureCount;

    const skillGain = this.grantAlchemySkillExp(
      player,
      recipe.outputLevel,
      recipe.baseBrewTicks,
      batchResolution.successCount,
      batchResolution.failureCount,
    );
    const messages = [...batchResolution.messages, ...skillGain.messages];
    const finished = job.completedCount >= job.quantity;
    if (finished) {
      const totalOutputCount = job.quantity * Math.max(1, job.outputCount);
      const summary = job.failureCount <= 0
        ? `${recipe.outputName} 共 ${job.quantity} 炉已全部炼成，累计成丹 ${job.successCount} 枚。`
        : `${recipe.outputName} 共 ${job.quantity} 炉炼制完成，成丹 ${job.successCount}/${totalOutputCount} 枚，散尽 ${job.failureCount} 枚。`;
      player.alchemyJob = null;
      return {
        messages: [...messages, { text: summary, kind: 'quest' }],
        panelChanged: true,
        inventoryChanged: batchResolution.inventoryChanged,
        dirtyPlayers: batchResolution.dirtyPlayers,
        attrChanged: skillGain.changed,
        dirtyFlags: skillGain.dirtyFlags,
      };
    }

    job.currentBatchRemainingTicks = job.batchBrewTicks;
    return {
      messages,
      panelChanged: true,
      inventoryChanged: batchResolution.inventoryChanged,
      dirtyPlayers: batchResolution.dirtyPlayers,
      attrChanged: skillGain.changed,
      dirtyFlags: skillGain.dirtyFlags,
    };
  }

  normalizePlayerAlchemyState(player: PlayerState): void {
    this.ensureAlchemySkill(player);
    const validRecipeIds = new Set(this.recipes.keys());
    const presets = (player.alchemyPresets ?? [])
      .filter((preset) => validRecipeIds.has(preset.recipeId))
      .map((preset) => {
        const recipe = this.recipes.get(preset.recipeId)!;
        const normalized = this.validateSelection(recipe, preset.ingredients);
        if ('error' in normalized) {
          return null;
        }
        return {
          ...preset,
          name: normalizePresetName(preset.name, `${recipe.outputName}简方`),
          ingredients: normalized.ingredients,
          updatedAt: Math.max(0, Math.floor(Number(preset.updatedAt) || 0)),
        } satisfies PlayerAlchemyPreset;
      })
      .filter((preset): preset is PlayerAlchemyPreset => Boolean(preset))
      .slice(0, ALCHEMY_MAX_PRESET_COUNT)
      .sort((left, right) => right.updatedAt - left.updatedAt);
    player.alchemyPresets = presets;

    const job = player.alchemyJob;
    if (!job) {
      player.alchemyJob = null;
      return;
    }
    const recipe = this.recipes.get(job.recipeId);
    if (!recipe) {
      player.alchemyJob = null;
      return;
    }
    const normalized = this.validateSelection(recipe, job.ingredients);
    if ('error' in normalized) {
      player.alchemyJob = null;
      return;
    }
    player.alchemyJob = {
      ...job,
      outputItemId: recipe.outputItemId,
      outputCount: computeAlchemyBatchOutputCountWithSize(
        recipe.outputCount,
        this.getRecipeBatchOutputSize(recipe),
      ),
      quantity: normalizeAlchemyQuantity(job.quantity),
      completedCount: Math.max(0, Math.min(
        normalizeAlchemyQuantity(job.quantity),
        Math.floor(Number(job.completedCount) || 0),
      )),
      successCount: Math.max(0, Math.floor(Number(job.successCount) || 0)),
      failureCount: Math.max(0, Math.floor(Number(job.failureCount) || 0)),
      ingredients: normalized.ingredients,
      phase: job.phase === 'preparing'
        ? 'preparing'
        : job.phase === 'paused'
          ? 'paused'
          : 'brewing',
      preparationTicks: Math.max(0, Math.floor(Number(job.preparationTicks) || ALCHEMY_PREPARATION_TICKS)),
      batchBrewTicks: normalizePositiveInt(job.batchBrewTicks, recipe.baseBrewTicks),
      currentBatchRemainingTicks: Math.max(0, Math.min(
        normalizePositiveInt(job.batchBrewTicks, recipe.baseBrewTicks),
        Math.floor(Number(job.currentBatchRemainingTicks) || normalizePositiveInt(job.batchBrewTicks, recipe.baseBrewTicks)),
      )),
      pausedTicks: Math.max(0, Math.floor(Number(job.pausedTicks) || 0)),
      spiritStoneCost: Math.max(0, Math.floor(Number(job.spiritStoneCost) || 0)),
      totalTicks: normalizePositiveInt(job.totalTicks, recipe.baseBrewTicks),
      remainingTicks: Math.max(0, Math.min(
        normalizePositiveInt(job.totalTicks, recipe.baseBrewTicks),
        Math.floor(Number(job.remainingTicks) || 0),
      )),
      successRate: Math.max(0, Math.min(1, Number(job.successRate) || 0)),
      exactRecipe: job.exactRecipe === true,
      startedAt: Math.max(0, Math.floor(Number(job.startedAt) || 0)),
    } satisfies PlayerAlchemyJob;
    const resolvedCountCap = player.alchemyJob.completedCount * player.alchemyJob.outputCount;
    player.alchemyJob.successCount = Math.min(resolvedCountCap, player.alchemyJob.successCount);
    player.alchemyJob.failureCount = Math.min(
      resolvedCountCap,
      Math.max(0, player.alchemyJob.failureCount),
    );
    if ((player.alchemyJob.successCount + player.alchemyJob.failureCount) > resolvedCountCap) {
      player.alchemyJob.failureCount = Math.max(0, resolvedCountCap - player.alchemyJob.successCount);
    }
    if (player.alchemyJob.phase !== 'paused') {
      player.alchemyJob.pausedTicks = 0;
    } else if (player.alchemyJob.pausedTicks <= 0) {
      player.alchemyJob.phase = this.resolveJobResumePhase(player.alchemyJob);
    }
  }

  private getRemainingBatchCount(job: PlayerAlchemyJob): number {
    return Math.max(0, job.quantity - job.completedCount);
  }

  private getRefundableBatchCount(job: PlayerAlchemyJob): number {
    const remainingBatchCount = this.getRemainingBatchCount(job);
    if (remainingBatchCount <= 0) {
      return 0;
    }
    const resumePhase = job.phase === 'paused' ? this.resolveJobResumePhase(job) : job.phase;
    if (resumePhase === 'brewing') {
      return Math.max(0, remainingBatchCount - 1);
    }
    return remainingBatchCount;
  }

  private getCurrentBatchLostOnCancel(job: PlayerAlchemyJob): boolean {
    const remainingBatchCount = this.getRemainingBatchCount(job);
    if (remainingBatchCount <= 0) {
      return false;
    }
    const resumePhase = job.phase === 'paused' ? this.resolveJobResumePhase(job) : job.phase;
    return resumePhase === 'brewing';
  }

  private getRemainingBrewTicks(job: PlayerAlchemyJob): number {
    return job.batchBrewTicks * this.getRemainingBatchCount(job);
  }

  private getPreparationRemainingTicks(job: PlayerAlchemyJob): number {
    return Math.max(0, job.remainingTicks - this.getRemainingBrewTicks(job) - Math.max(0, job.pausedTicks));
  }

  private resolveJobResumePhase(job: PlayerAlchemyJob): 'preparing' | 'brewing' {
    return this.getPreparationRemainingTicks(job) > 0 ? 'preparing' : 'brewing';
  }

  private getRefundItemName(itemId: string): string {
    return this.contentService.getItem(itemId)?.name ?? itemId;
  }

  private resolveRecipeCategory(outputItemId: string, recipeId: string): AlchemyRecipeCategory {
    const outputItem = this.contentService.getItem(outputItemId);
    if (!outputItem) {
      throw new Error(`炼丹配方 ${recipeId} 的产出物 ${outputItemId} 不存在`);
    }
    if ((outputItem.consumeBuffs?.length ?? 0) > 0) {
      return 'buff';
    }
    if (typeof outputItem.healAmount === 'number' || typeof outputItem.healPercent === 'number' || typeof outputItem.qiPercent === 'number') {
      return 'recovery';
    }
    throw new Error(`炼丹配方 ${recipeId} 的产出物 ${outputItemId} 既不是瞬回药，也不是增益药`);
  }

  private recipeConsumesSpiritStone(recipe: AlchemyRecipeCatalogEntry): boolean {
    return recipe.category === 'buff';
  }

  private getRecipeSpiritStoneCost(recipe: AlchemyRecipeCatalogEntry, quantity: number): number {
    return getAlchemySpiritStoneCost(recipe.outputLevel, this.recipeConsumesSpiritStone(recipe)) * quantity;
  }

  private getRecipeBatchOutputSize(recipe: AlchemyRecipeCatalogEntry): number {
    return recipe.category === 'buff' ? 1 : 6;
  }

  private grantAlchemyRefundItem(player: PlayerState, itemId: string, count: number): AlchemyGrantResolution {
    if (count <= 0) {
      return { inventoryChanged: false, dirtyPlayers: [], droppedToGround: false };
    }
    const item = this.contentService.createItem(itemId, count);
    if (!item) {
      return { inventoryChanged: false, dirtyPlayers: [], droppedToGround: false };
    }
    if (this.inventoryService.addItem(player, item)) {
      return { inventoryChanged: true, dirtyPlayers: [], droppedToGround: false };
    }
    const dirtyPlayers = this.lootService.dropToGround(player.mapId, player.x, player.y, item);
    return { inventoryChanged: false, dirtyPlayers, droppedToGround: true };
  }

  private resolveAlchemyBatch(
    player: PlayerState,
    job: PlayerAlchemyJob,
    recipe: AlchemyRecipeCatalogEntry,
    currentBatch: number,
  ): AlchemyBatchResolution {
    const batchOutputCount = Math.max(1, job.outputCount);
    let successCount = 0;
    for (let index = 0; index < batchOutputCount; index += 1) {
      if (Math.random() <= job.successRate) {
        successCount += 1;
      }
    }
    const failureCount = Math.max(0, batchOutputCount - successCount);
    if (successCount <= 0) {
      return {
        successCount: 0,
        failureCount,
        inventoryChanged: false,
        dirtyPlayers: [],
        messages: [{
          text: `${recipe.outputName} 第 ${currentBatch}/${job.quantity} 炉炼制失败，${failureCount} 枚药坯尽数散尽。`,
          kind: 'system',
        }],
      };
    }

    const reward = this.contentService.createItem(job.outputItemId, successCount);
    if (!reward) {
      return {
        successCount: 0,
        failureCount: batchOutputCount,
        inventoryChanged: false,
        dirtyPlayers: [],
        messages: [{
          text: `炼丹任务完成时未找到 ${job.outputItemId} 的物品定义。`,
          kind: 'system',
        }],
      };
    }
    if (this.inventoryService.addItem(player, reward)) {
      const resultText = failureCount > 0
        ? `${recipe.outputName} 第 ${currentBatch}/${job.quantity} 炉炼制完成，成丹 ${reward.count}/${batchOutputCount} 枚，其余 ${failureCount} 枚药力散尽。`
        : `${recipe.outputName} 第 ${currentBatch}/${job.quantity} 炉炼制成功，成丹 ${reward.count} 枚，已收入背包。`;
      return {
        successCount: reward.count,
        failureCount,
        inventoryChanged: true,
        dirtyPlayers: [],
        messages: [{
          text: resultText,
          kind: 'quest',
        }],
      };
    }

    const dirtyPlayers = this.lootService.dropToGround(player.mapId, player.x, player.y, reward);
    const resultText = failureCount > 0
      ? `${recipe.outputName} 第 ${currentBatch}/${job.quantity} 炉炼制完成，成丹 ${reward.count}/${batchOutputCount} 枚，但背包已满，成丹落在你脚边；其余 ${failureCount} 枚药力散尽。`
      : `${recipe.outputName} 第 ${currentBatch}/${job.quantity} 炉炼制成功，但背包已满，成丹 ${reward.count} 枚落在你脚边。`;
    return {
      successCount: reward.count,
      failureCount,
      inventoryChanged: false,
      dirtyPlayers,
      messages: [{
        text: resultText,
        kind: 'loot',
      }],
    };
  }

  private buildPanelState(player: PlayerState): SyncedAlchemyPanelState | null {
    const furnaceItemId = player.equipment.weapon?.tags?.includes(ALCHEMY_FURNACE_TAG)
      ? player.equipment.weapon.itemId
      : undefined;
    if (!furnaceItemId && !player.alchemyJob) {
      return null;
    }
    return {
      furnaceItemId,
      presets: (player.alchemyPresets ?? []).map((preset) => ({
        ...preset,
        ingredients: preset.ingredients.map((ingredient) => ({ ...ingredient })),
      })),
      job: player.alchemyJob
        ? {
            ...player.alchemyJob,
            ingredients: player.alchemyJob.ingredients.map((ingredient) => ({ ...ingredient })),
          }
        : null,
    };
  }

  private loadRecipes(): void {
    const filePath = resolveServerDataPath('content', 'alchemy', 'recipes.json');
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as RawAlchemyRecipe[];
    this.recipes.clear();
    this.catalog.length = 0;
    for (const entry of raw) {
      const recipeId = String(entry.recipeId ?? '').trim();
      const outputItemId = String(entry.outputItemId ?? '').trim();
      if (!recipeId || !outputItemId) {
        throw new Error(`炼丹配方存在缺失 recipeId/outputItemId 的条目: ${JSON.stringify(entry)}`);
      }
      const outputItem = this.contentService.getItem(outputItemId);
      if (!outputItem) {
        throw new Error(`炼丹配方 ${recipeId} 的产出物 ${outputItemId} 不存在`);
      }
      const category = this.resolveRecipeCategory(outputItemId, recipeId);
      const ingredients = (Array.isArray(entry.ingredients) ? entry.ingredients : []).map((ingredient) => {
        const itemId = String(ingredient.itemId ?? '').trim();
        const item = this.contentService.getItem(itemId);
        if (!item) {
          throw new Error(`炼丹配方 ${recipeId} 的材料 ${itemId} 不存在`);
        }
        return {
          itemId,
          name: item.name,
          count: normalizePositiveInt(ingredient.count, 1),
          role: ingredient.role === 'main' ? 'main' as 'main' | 'aux' : 'aux',
          level: normalizePositiveInt(item.level, 1),
          grade: (item.grade ?? 'mortal') as TechniqueGrade,
          powerPerUnit: computeAlchemyMaterialPower(item.level, item.grade, 1),
        };
      });
      if (ingredients.length === 0 || !ingredients.some((ingredient) => ingredient.role === 'main')) {
        throw new Error(`炼丹配方 ${recipeId} 至少需要一味主药`);
      }
      const catalogEntry: AlchemyRecipeCatalogEntry = {
        recipeId,
        outputItemId,
        outputName: outputItem.name,
        category,
        outputCount: normalizePositiveInt(entry.outputCount, 1),
        outputLevel: normalizePositiveInt(outputItem.level, 1),
        baseBrewTicks: normalizePositiveInt(entry.baseBrewTicks, 1),
        fullPower: ingredients.reduce((sum, ingredient) => sum + ingredient.powerPerUnit * ingredient.count, 0),
        ingredients,
      };
      this.recipes.set(recipeId, catalogEntry);
      this.catalog.push(catalogEntry);
    }
    this.catalog.sort((left, right) => {
      if (left.outputLevel !== right.outputLevel) {
        return left.outputLevel - right.outputLevel;
      }
      if (left.fullPower !== right.fullPower) {
        return left.fullPower - right.fullPower;
      }
      const nameOrder = left.outputName.localeCompare(right.outputName, 'zh-Hans-CN');
      if (nameOrder !== 0) {
        return nameOrder;
      }
      return left.recipeId.localeCompare(right.recipeId, 'zh-Hans-CN');
    });
    this.logger.log(`已加载 ${this.catalog.length} 条炼丹配方`);
  }

  private validateSelection(
    recipe: AlchemyRecipeCatalogEntry,
    ingredients: readonly AlchemyIngredientSelection[] | undefined,
  ): { ingredients: AlchemyIngredientSelection[] } | { error: string } {
    const normalizedMap = buildAlchemyIngredientCountMap(normalizeAlchemyIngredientSelections(ingredients));
    for (const itemId of normalizedMap.keys()) {
      if (!recipe.ingredients.some((ingredient) => ingredient.itemId === itemId)) {
        return { error: '当前简易丹方包含了该丹方之外的材料。' };
      }
    }

    const normalizedIngredients: AlchemyIngredientSelection[] = [];
    for (const ingredient of recipe.ingredients) {
      const count = normalizedMap.get(ingredient.itemId) ?? 0;
      if (ingredient.role === 'main' && count !== ingredient.count) {
        return { error: `${ingredient.name} 属于主药，必须按丹方足量加入。` };
      }
      if (count < 0 || count > ingredient.count) {
        return { error: `${ingredient.name} 的投料数量超出了当前丹方允许范围。` };
      }
      if (count > 0) {
        normalizedIngredients.push({ itemId: ingredient.itemId, count });
      }
    }
    return { ingredients: normalizedIngredients };
  }

  private getInventoryCount(player: PlayerState, itemId: string): number {
    return player.inventory.items
      .filter((item) => item.itemId === itemId)
      .reduce((sum, item) => sum + item.count, 0);
  }

  private consumeInventoryItem(player: PlayerState, itemId: string, count: number): void {
    let remaining = count;
    while (remaining > 0) {
      const slotIndex = this.inventoryService.findItem(player, itemId);
      if (slotIndex < 0) {
        return;
      }
      const removed = this.inventoryService.removeItem(player, slotIndex, remaining);
      if (!removed) {
        return;
      }
      remaining -= removed.count;
    }
  }

  private ensureAlchemySkill(player: PlayerState): AlchemySkillState {
    const expToNext = Math.max(0, this.contentService.getRealmLevelEntry(1)?.expToNext ?? DEFAULT_ALCHEMY_EXP_TO_NEXT);
    const normalized = normalizeAlchemySkillState(player.alchemySkill, expToNext);
    player.alchemySkill = normalized;
    return normalized;
  }

  private getAlchemySkillExpToNext(level: number): number {
    const normalizedLevel = Math.max(1, Math.floor(level || 1));
    return Math.max(0, this.contentService.getRealmLevelEntry(normalizedLevel)?.expToNext ?? 0);
  }

  private getAlchemyFurnaceBonuses(player: PlayerState): { successRate: number; speedRate: number } {
    const furnace = player.equipment.weapon?.tags?.includes(ALCHEMY_FURNACE_TAG)
      ? player.equipment.weapon
      : null;
    return {
      successRate: clampAlchemyModifier(furnace?.alchemySuccessRate),
      speedRate: clampAlchemyModifier(furnace?.alchemySpeedRate),
    };
  }

  private grantAlchemySkillExp(
    player: PlayerState,
    recipeLevel: number,
    recipeBaseBrewTicks: number,
    successCount: number,
    failureCount: number,
  ): { changed: boolean; messages: AlchemyResultMessage[]; dirtyFlags: Array<'inv' | 'tech' | 'attr' | 'actions'> } {
    const skill = this.ensureAlchemySkill(player);
    if (skill.expToNext <= 0) {
      return { changed: false, messages: [], dirtyFlags: [] };
    }
    const totalAttempts = Math.max(0, successCount) + Math.max(0, failureCount);
    if (totalAttempts <= 0) {
      return { changed: false, messages: [], dirtyFlags: [] };
    }
    const successGain = computeTimedCraftSkillExp(
      this.getAlchemySkillExpToNext(recipeLevel),
      recipeLevel,
      recipeBaseBrewTicks,
    );
    const failureReferenceLevel = Math.min(
      Math.max(1, Math.floor(recipeLevel || 1)),
      Math.max(1, Math.floor(skill.level || 1)),
    );
    const failureGain = computeTimedCraftSkillExp(
      this.getAlchemySkillExpToNext(failureReferenceLevel),
      failureReferenceLevel,
      recipeBaseBrewTicks,
      0.25,
    );
    const baseGain = Math.max(
      0,
      Math.round(((successGain * Math.max(0, successCount)) + (failureGain * Math.max(0, failureCount))) / totalAttempts),
    );
    const gain = Math.max(0, Math.round(baseGain * getCraftSkillEarlyLevelExpMultiplier(skill.level)));
    if (gain <= 0) {
      return { changed: false, messages: [], dirtyFlags: [] };
    }
    skill.exp += gain;
    const messages: AlchemyResultMessage[] = [];
    const dirtyFlags = new Set<'inv' | 'tech' | 'attr' | 'actions'>();
    while (skill.expToNext > 0 && skill.exp >= skill.expToNext) {
      skill.exp -= skill.expToNext;
      skill.level += 1;
      skill.expToNext = this.getAlchemySkillExpToNext(skill.level);
      if (skill.expToNext <= 0) {
        skill.exp = 0;
      }
      messages.push({
        text: `炼丹技艺提升至 LV ${skill.level}。`,
        kind: 'quest',
      });
    }
    player.alchemySkill = skill;
    const craftRealmGain = this.techniqueService.grantCraftRealmExp(player, gain / 2);
    for (const flag of craftRealmGain.dirty) {
      dirtyFlags.add(flag);
    }
    for (const message of craftRealmGain.messages) {
      messages.push({
        text: message.text,
        kind: message.kind === 'loot'
          ? 'loot'
          : message.kind === 'quest'
            ? 'quest'
            : 'system',
      });
    }
    return { changed: true, messages, dirtyFlags: [...dirtyFlags] };
  }
}
