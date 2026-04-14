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
  computeCraftSkillExpGain,
  computeAlchemySuccessRate,
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
import { buildTechniqueActivityBuff, extendTechniquePauseWindow } from './technique-activity.shared';

/** RawAlchemyRecipeIngredient：定义该接口的能力与字段约束。 */
interface RawAlchemyRecipeIngredient {
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
/** count：定义该变量以承载业务值。 */
  count: number;
/** role：定义该变量以承载业务值。 */
  role: 'main' | 'aux';
}

/** RawAlchemyRecipe：定义该接口的能力与字段约束。 */
interface RawAlchemyRecipe {
/** recipeId：定义该变量以承载业务值。 */
  recipeId: string;
/** outputItemId：定义该变量以承载业务值。 */
  outputItemId: string;
  outputCount?: number;
/** baseBrewTicks：定义该变量以承载业务值。 */
  baseBrewTicks: number;
/** ingredients：定义该变量以承载业务值。 */
  ingredients: RawAlchemyRecipeIngredient[];
}

/** AlchemyResultMessage：定义该接口的能力与字段约束。 */
interface AlchemyResultMessage {
/** text：定义该变量以承载业务值。 */
  text: string;
  kind?: 'system' | 'quest' | 'loot';
}

/** AlchemyMutationResult：定义该接口的能力与字段约束。 */
export interface AlchemyMutationResult {
  error?: string;
/** messages：定义该变量以承载业务值。 */
  messages: AlchemyResultMessage[];
/** panelChanged：定义该变量以承载业务值。 */
  panelChanged: boolean;
  inventoryChanged?: boolean;
  dirtyPlayers?: string[];
  attrChanged?: boolean;
  dirtyFlags?: Array<'inv' | 'tech' | 'attr' | 'actions'>;
}

/** AlchemyBatchResolution：定义该接口的能力与字段约束。 */
interface AlchemyBatchResolution {
/** inventoryChanged：定义该变量以承载业务值。 */
  inventoryChanged: boolean;
/** dirtyPlayers：定义该变量以承载业务值。 */
  dirtyPlayers: string[];
/** messages：定义该变量以承载业务值。 */
  messages: AlchemyResultMessage[];
/** successCount：定义该变量以承载业务值。 */
  successCount: number;
/** failureCount：定义该变量以承载业务值。 */
  failureCount: number;
}

/** AlchemyGrantResolution：定义该接口的能力与字段约束。 */
interface AlchemyGrantResolution {
/** inventoryChanged：定义该变量以承载业务值。 */
  inventoryChanged: boolean;
/** dirtyPlayers：定义该变量以承载业务值。 */
  dirtyPlayers: string[];
/** droppedToGround：定义该变量以承载业务值。 */
  droppedToGround: boolean;
}

/** ALCHEMY_ACTION_ID：定义该变量以承载业务值。 */
const ALCHEMY_ACTION_ID = 'alchemy:open';
/** ALCHEMY_FURNACE_TAG：定义该变量以承载业务值。 */
const ALCHEMY_FURNACE_TAG = 'alchemy_furnace';
/** ALCHEMY_CATALOG_VERSION：定义该变量以承载业务值。 */
const ALCHEMY_CATALOG_VERSION = 2;
/** ALCHEMY_MAX_NAME_LENGTH：定义该变量以承载业务值。 */
const ALCHEMY_MAX_NAME_LENGTH = 24;
/** DEFAULT_ALCHEMY_EXP_TO_NEXT：定义该变量以承载业务值。 */
const DEFAULT_ALCHEMY_EXP_TO_NEXT = 60;
/** ALCHEMY_BUFF_ID：定义该变量以承载业务值。 */
const ALCHEMY_BUFF_ID = 'system.alchemy';
/** ALCHEMY_INTERRUPT_PAUSE_TICKS：定义该变量以承载业务值。 */
const ALCHEMY_INTERRUPT_PAUSE_TICKS = 10;

/** normalizePositiveInt：执行对应的业务逻辑。 */
function normalizePositiveInt(value: unknown, fallback = 1): number {
  return Math.max(1, Math.floor(Number(value) || fallback));
}

/** normalizePresetName：执行对应的业务逻辑。 */
function normalizePresetName(name: string | undefined, fallback: string): string {
/** normalized：定义该变量以承载业务值。 */
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

/** normalizeAlchemySpeedRate：执行对应的业务逻辑。 */
function normalizeAlchemySpeedRate(value: number | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

@Injectable()
/** AlchemyService：封装相关状态与行为。 */
export class AlchemyService implements OnModuleInit {
  private readonly logger = new Logger(AlchemyService.name);
  private readonly recipes = new Map<string, AlchemyRecipeCatalogEntry>();
/** catalog：定义该变量以承载业务值。 */
  private readonly catalog: AlchemyRecipeCatalogEntry[] = [];

  constructor(
    private readonly contentService: ContentService,
    private readonly inventoryService: InventoryService,
    private readonly lootService: LootService,
    private readonly techniqueService: TechniqueService,
  ) {}

/** onModuleInit：执行对应的业务逻辑。 */
  onModuleInit(): void {
    this.loadRecipes();
  }

/** getCatalogVersion：执行对应的业务逻辑。 */
  getCatalogVersion(): number {
    return ALCHEMY_CATALOG_VERSION;
  }

/** hasEquippedFurnace：执行对应的业务逻辑。 */
  hasEquippedFurnace(player: PlayerState): boolean {
    return Boolean(player.equipment.weapon?.tags?.includes(ALCHEMY_FURNACE_TAG));
  }

/** hasActiveAlchemyJob：执行对应的业务逻辑。 */
  hasActiveAlchemyJob(player: PlayerState): boolean {
    return (player.alchemyJob?.remainingTicks ?? 0) > 0;
  }

/** buildVisibleAlchemyBuff：执行对应的业务逻辑。 */
  buildVisibleAlchemyBuff(player: PlayerState): VisibleBuffState | null {
/** job：定义该变量以承载业务值。 */
    const job = player.alchemyJob;
    if (!job || job.remainingTicks <= 0) {
      return null;
    }
/** recipe：定义该变量以承载业务值。 */
    const recipe = this.recipes.get(job.recipeId);
/** quantityText：定义该变量以承载业务值。 */
    const quantityText = job.quantity > 1 ? `，共 ${job.quantity} 炉` : '';
/** currentBatch：定义该变量以承载业务值。 */
    const currentBatch = Math.min(job.quantity, Math.max(1, job.completedCount + 1));
/** pausedResumePhase：定义该变量以承载业务值。 */
    const pausedResumePhase = this.resolveJobResumePhase(job);
/** desc：定义该变量以承载业务值。 */
    const desc = job.phase === 'paused'
      ? pausedResumePhase === 'preparing'
        ? `炉火暂歇，${job.pausedTicks} 息后继续起炉${quantityText}。移动或出手会重新暂停炼丹。`
        : `炉火暂歇，${job.pausedTicks} 息后继续炼制${recipe?.outputName ?? '丹药'} 第 ${currentBatch}/${job.quantity} 炉。移动或出手会重新暂停炼丹。`
      : job.phase === 'preparing'
        ? `正在暖炉定火，${this.getPreparationRemainingTicks(job)} 息后自动开炼${quantityText}。移动或出手会让炉火暂歇 ${ALCHEMY_INTERRUPT_PAUSE_TICKS} 息。`
        : `正在炼制${recipe?.outputName ?? '丹药'} 第 ${currentBatch}/${job.quantity} 炉，当前炉剩余 ${job.currentBatchRemainingTicks} 息。移动或出手会让炉火暂歇 ${ALCHEMY_INTERRUPT_PAUSE_TICKS} 息。`;
    return buildTechniqueActivityBuff(player, {
      buffId: ALCHEMY_BUFF_ID,
      name: '炼丹',
      desc,
      shortMark: '丹',
      remainingTicks: job.remainingTicks,
      totalTicks: job.totalTicks,
      sourceSkillId: ALCHEMY_ACTION_ID,
      sourceSkillName: '炼丹',
    });
  }

/** getAlchemyAction：执行对应的业务逻辑。 */
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

/** buildPanelPayload：执行对应的业务逻辑。 */
  buildPanelPayload(player: PlayerState, knownCatalogVersion?: number): S2C_AlchemyPanel {
    this.normalizePlayerAlchemyState(player);
/** state：定义该变量以承载业务值。 */
    const state = this.buildPanelState(player);
/** response：定义该变量以承载业务值。 */
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

/** savePreset：执行对应的业务逻辑。 */
  savePreset(player: PlayerState, payload: C2S_SaveAlchemyPreset): AlchemyMutationResult {
    this.normalizePlayerAlchemyState(player);
    if (!this.hasEquippedFurnace(player)) {
      return { error: '尚未装备丹炉，无法整理简易丹方。', messages: [], panelChanged: false };
    }
/** recipe：定义该变量以承载业务值。 */
    const recipe = this.recipes.get(payload.recipeId);
    if (!recipe) {
      return { error: '对应丹方不存在。', messages: [], panelChanged: false };
    }
/** normalizedIngredients：定义该变量以承载业务值。 */
    const normalizedIngredients = this.validateSelection(recipe, payload.ingredients);
    if ('error' in normalizedIngredients) {
      return { error: normalizedIngredients.error, messages: [], panelChanged: false };
    }
/** presets：定义该变量以承载业务值。 */
    const presets = [...(player.alchemyPresets ?? [])];
/** existingIndex：定义该变量以承载业务值。 */
    const existingIndex = payload.presetId
      ? presets.findIndex((entry) => entry.presetId === payload.presetId)
      : -1;
    if (existingIndex < 0 && presets.length >= ALCHEMY_MAX_PRESET_COUNT) {
      return { error: `简易丹方最多保存 ${ALCHEMY_MAX_PRESET_COUNT} 条。`, messages: [], panelChanged: false };
    }
/** fallbackName：定义该变量以承载业务值。 */
    const fallbackName = `${recipe.outputName}简方`;
/** nextPreset：定义该变量以承载业务值。 */
    const nextPreset: PlayerAlchemyPreset = {
/** presetId：定义该变量以承载业务值。 */
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

/** deletePreset：执行对应的业务逻辑。 */
  deletePreset(player: PlayerState, payload: C2S_DeleteAlchemyPreset): AlchemyMutationResult {
    this.normalizePlayerAlchemyState(player);
/** presets：定义该变量以承载业务值。 */
    const presets = player.alchemyPresets ?? [];
/** next：定义该变量以承载业务值。 */
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

/** startAlchemy：执行对应的业务逻辑。 */
  startAlchemy(player: PlayerState, payload: C2S_StartAlchemy): AlchemyMutationResult {
    this.normalizePlayerAlchemyState(player);
    if (!this.hasEquippedFurnace(player)) {
      return { error: '尚未装备丹炉，无法炼丹。', messages: [], panelChanged: false };
    }
    if ((player.alchemyJob?.remainingTicks ?? 0) > 0) {
      return { error: '当前已有炼丹任务在进行中。', messages: [], panelChanged: false };
    }
/** recipe：定义该变量以承载业务值。 */
    const recipe = this.recipes.get(payload.recipeId);
    if (!recipe) {
      return { error: '对应丹方不存在。', messages: [], panelChanged: false };
    }
/** normalizedSelection：定义该变量以承载业务值。 */
    const normalizedSelection = this.validateSelection(recipe, payload.ingredients);
    if ('error' in normalizedSelection) {
      return { error: normalizedSelection.error, messages: [], panelChanged: false };
    }
/** quantity：定义该变量以承载业务值。 */
    const quantity = normalizeAlchemyQuantity(payload.quantity);
/** totalIngredients：定义该变量以承载业务值。 */
    const totalIngredients = normalizedSelection.ingredients.map((entry) => ({
      itemId: entry.itemId,
      count: entry.count * quantity,
    }));
/** missingItem：定义该变量以承载业务值。 */
    const missingItem = totalIngredients.find((entry) => this.getInventoryCount(player, entry.itemId) < entry.count);
    if (missingItem) {
/** ingredient：定义该变量以承载业务值。 */
      const ingredient = recipe.ingredients.find((entry) => entry.itemId === missingItem.itemId);
      return {
        error: ingredient ? `${ingredient.name} 数量不足。` : '材料数量不足。',
        messages: [],
        panelChanged: false,
      };
    }
/** spiritStoneCost：定义该变量以承载业务值。 */
    const spiritStoneCost = this.getRecipeSpiritStoneCost(recipe, quantity);
/** spiritStoneName：定义该变量以承载业务值。 */
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

/** alchemySkill：定义该变量以承载业务值。 */
    const alchemySkill = this.ensureAlchemySkill(player);
/** furnaceBonuses：定义该变量以承载业务值。 */
    const furnaceBonuses = this.getAlchemyFurnaceBonuses(player);
/** baseSuccessRate：定义该变量以承载业务值。 */
    const baseSuccessRate = computeAlchemySuccessRate(recipe, normalizedSelection.ingredients);
/** batchBrewTicks：定义该变量以承载业务值。 */
    const batchBrewTicks = computeAlchemyAdjustedBrewTicks(
      recipe.baseBrewTicks,
      recipe,
      normalizedSelection.ingredients,
      recipe.outputLevel,
      alchemySkill.level,
      furnaceBonuses.speedRate,
      this.getRecipeBatchOutputSize(recipe),
    );
/** totalTicks：定义该变量以承载业务值。 */
    const totalTicks = computeAlchemyTotalJobTicks(batchBrewTicks, quantity, ALCHEMY_PREPARATION_TICKS);
/** exactRecipe：定义该变量以承载业务值。 */
    const exactRecipe = isExactAlchemyRecipe(recipe, normalizedSelection.ingredients);
/** successRate：定义该变量以承载业务值。 */
    const successRate = computeAlchemyAdjustedSuccessRate(
      baseSuccessRate,
      recipe.outputLevel,
      alchemySkill.level,
      furnaceBonuses.successRate,
    );
/** batchOutputCount：定义该变量以承载业务值。 */
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
/** text：定义该变量以承载业务值。 */
        text: `开始准备炼制 ${recipe.outputName}${quantity > 1 ? `，共 ${quantity} 炉` : ''}${spiritStoneCost > 0 ? `，消耗 ${spiritStoneName} x${spiritStoneCost}` : ''}；${ALCHEMY_PREPARATION_TICKS} 息后自动开炼，总计 ${totalTicks} 息。单炉固定 ${batchOutputCount} 枚，每枚成丹率 ${(successRate * 100).toFixed(successRate === 1 ? 0 : 1)}%。`,
        kind: 'quest',
      }],
      panelChanged: true,
      inventoryChanged: true,
    };
  }

/** cancelAlchemy：执行对应的业务逻辑。 */
  cancelAlchemy(player: PlayerState): AlchemyMutationResult {
/** job：定义该变量以承载业务值。 */
    const job = player.alchemyJob;
    if (!job || job.remainingTicks <= 0) {
      return { error: '当前没有可取消的炼丹任务。', messages: [], panelChanged: false };
    }
/** recipe：定义该变量以承载业务值。 */
    const recipe = this.recipes.get(job.recipeId);
    if (!recipe) {
      player.alchemyJob = null;
      return {
        messages: [{ text: '当前炼丹任务的丹方已失效，任务已直接移除。', kind: 'system' }],
        panelChanged: true,
      };
    }

/** refundableBatchCount：定义该变量以承载业务值。 */
    const refundableBatchCount = this.getRefundableBatchCount(job);
/** refundedLabels：定义该变量以承载业务值。 */
    const refundedLabels: string[] = [];
/** droppedLabels：定义该变量以承载业务值。 */
    const droppedLabels: string[] = [];
/** dirtyPlayerIds：定义该变量以承载业务值。 */
    const dirtyPlayerIds = new Set<string>();
/** inventoryChanged：定义该变量以承载业务值。 */
    let inventoryChanged = false;

    for (const ingredient of job.ingredients) {
      const refundCount = ingredient.count * refundableBatchCount;
      if (refundCount <= 0) {
        continue;
      }
/** grant：定义该变量以承载业务值。 */
      const grant = this.grantAlchemyRefundItem(player, ingredient.itemId, refundCount);
      inventoryChanged ||= grant.inventoryChanged;
      for (const dirtyPlayerId of grant.dirtyPlayers) {
        dirtyPlayerIds.add(dirtyPlayerId);
      }
/** label：定义该变量以承载业务值。 */
      const label = `${this.getRefundItemName(ingredient.itemId)} x${refundCount}`;
      if (grant.droppedToGround) {
        droppedLabels.push(label);
      } else {
        refundedLabels.push(label);
      }
    }

/** refundableSpiritStones：定义该变量以承载业务值。 */
    const refundableSpiritStones = this.getRecipeSpiritStoneCost(recipe, refundableBatchCount);
    if (refundableSpiritStones > 0) {
/** grant：定义该变量以承载业务值。 */
      const grant = this.grantAlchemyRefundItem(player, MARKET_CURRENCY_ITEM_ID, refundableSpiritStones);
      inventoryChanged ||= grant.inventoryChanged;
      for (const dirtyPlayerId of grant.dirtyPlayers) {
        dirtyPlayerIds.add(dirtyPlayerId);
      }
/** label：定义该变量以承载业务值。 */
      const label = `${this.getRefundItemName(MARKET_CURRENCY_ITEM_ID)} x${refundableSpiritStones}`;
      if (grant.droppedToGround) {
        droppedLabels.push(label);
      } else {
        refundedLabels.push(label);
      }
    }

/** lostCurrentBatch：定义该变量以承载业务值。 */
    const lostCurrentBatch = this.getCurrentBatchLostOnCancel(job);
    player.alchemyJob = null;

/** summaryParts：定义该变量以承载业务值。 */
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

/** interruptAlchemy：执行对应的业务逻辑。 */
  interruptAlchemy(player: PlayerState, reason: 'move' | 'attack'): AlchemyMutationResult {
/** job：定义该变量以承载业务值。 */
    const job = player.alchemyJob;
    if (!job || job.remainingTicks <= 0) {
      return { messages: [], panelChanged: false };
    }
/** recipe：定义该变量以承载业务值。 */
    const recipe = this.recipes.get(job.recipeId);
/** currentPausedTicks：定义该变量以承载业务值。 */
    const currentPausedTicks = job.phase === 'paused' ? job.pausedTicks : 0;
/** pauseWindow：定义该变量以承载业务值。 */
    const pauseWindow = extendTechniquePauseWindow({
      currentPausedTicks,
      pauseTicks: ALCHEMY_INTERRUPT_PAUSE_TICKS,
      remainingTicks: job.remainingTicks,
      totalTicks: job.totalTicks,
    });
    job.phase = 'paused';
    job.pausedTicks = pauseWindow.pausedTicks;
    job.remainingTicks = pauseWindow.remainingTicks;
    job.totalTicks = pauseWindow.totalTicks;
    return {
      messages: [{
/** text：定义该变量以承载业务值。 */
        text: reason === 'move'
          ? `${recipe?.outputName ?? '当前丹药'} 的炼丹被你移动身形惊动，炉火暂歇，${ALCHEMY_INTERRUPT_PAUSE_TICKS} 息后继续。`
          : `${recipe?.outputName ?? '当前丹药'} 的炼丹被你出手惊动，炉火暂歇，${ALCHEMY_INTERRUPT_PAUSE_TICKS} 息后继续。`,
        kind: 'system',
      }],
      panelChanged: true,
    };
  }

/** tickAlchemy：执行对应的业务逻辑。 */
  tickAlchemy(player: PlayerState): AlchemyMutationResult {
/** job：定义该变量以承载业务值。 */
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
/** brewTotalTicks：定义该变量以承载业务值。 */
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

/** recipe：定义该变量以承载业务值。 */
    const recipe = this.recipes.get(job.recipeId);
    if (!recipe) {
      player.alchemyJob = null;
      return {
        messages: [{ text: '炼丹任务完成时未找到对应丹方，本次炼制作废。', kind: 'system' }],
        panelChanged: true,
      };
    }

/** currentBatch：定义该变量以承载业务值。 */
    const currentBatch = Math.min(job.quantity, Math.max(1, job.completedCount + 1));
/** batchResolution：定义该变量以承载业务值。 */
    const batchResolution = this.resolveAlchemyBatch(player, job, recipe, currentBatch);
    job.completedCount += 1;
    job.successCount += batchResolution.successCount;
    job.failureCount += batchResolution.failureCount;

/** skillGain：定义该变量以承载业务值。 */
    const skillGain = this.grantAlchemySkillExp(
      player,
      recipe.outputLevel,
      recipe.baseBrewTicks,
      batchResolution.successCount,
      batchResolution.failureCount,
    );
/** messages：定义该变量以承载业务值。 */
    const messages = [...batchResolution.messages, ...skillGain.messages];
/** finished：定义该变量以承载业务值。 */
    const finished = job.completedCount >= job.quantity;
    if (finished) {
/** totalOutputCount：定义该变量以承载业务值。 */
      const totalOutputCount = job.quantity * Math.max(1, job.outputCount);
/** summary：定义该变量以承载业务值。 */
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

/** normalizePlayerAlchemyState：执行对应的业务逻辑。 */
  normalizePlayerAlchemyState(player: PlayerState): void {
    this.ensureAlchemySkill(player);
/** validRecipeIds：定义该变量以承载业务值。 */
    const validRecipeIds = new Set(this.recipes.keys());
/** presets：定义该变量以承载业务值。 */
    const presets = (player.alchemyPresets ?? [])
      .filter((preset) => validRecipeIds.has(preset.recipeId))
      .map((preset) => {
/** recipe：定义该变量以承载业务值。 */
        const recipe = this.recipes.get(preset.recipeId)!;
/** normalized：定义该变量以承载业务值。 */
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

/** job：定义该变量以承载业务值。 */
    const job = player.alchemyJob;
    if (!job) {
      player.alchemyJob = null;
      return;
    }
/** recipe：定义该变量以承载业务值。 */
    const recipe = this.recipes.get(job.recipeId);
    if (!recipe) {
      player.alchemyJob = null;
      return;
    }
/** normalized：定义该变量以承载业务值。 */
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
/** phase：定义该变量以承载业务值。 */
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
/** exactRecipe：定义该变量以承载业务值。 */
      exactRecipe: job.exactRecipe === true,
      startedAt: Math.max(0, Math.floor(Number(job.startedAt) || 0)),
    } satisfies PlayerAlchemyJob;
/** resolvedCountCap：定义该变量以承载业务值。 */
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

/** getRemainingBatchCount：执行对应的业务逻辑。 */
  private getRemainingBatchCount(job: PlayerAlchemyJob): number {
    return Math.max(0, job.quantity - job.completedCount);
  }

/** getRefundableBatchCount：执行对应的业务逻辑。 */
  private getRefundableBatchCount(job: PlayerAlchemyJob): number {
/** remainingBatchCount：定义该变量以承载业务值。 */
    const remainingBatchCount = this.getRemainingBatchCount(job);
    if (remainingBatchCount <= 0) {
      return 0;
    }
/** resumePhase：定义该变量以承载业务值。 */
    const resumePhase = job.phase === 'paused' ? this.resolveJobResumePhase(job) : job.phase;
    if (resumePhase === 'brewing') {
      return Math.max(0, remainingBatchCount - 1);
    }
    return remainingBatchCount;
  }

/** getCurrentBatchLostOnCancel：执行对应的业务逻辑。 */
  private getCurrentBatchLostOnCancel(job: PlayerAlchemyJob): boolean {
/** remainingBatchCount：定义该变量以承载业务值。 */
    const remainingBatchCount = this.getRemainingBatchCount(job);
    if (remainingBatchCount <= 0) {
      return false;
    }
/** resumePhase：定义该变量以承载业务值。 */
    const resumePhase = job.phase === 'paused' ? this.resolveJobResumePhase(job) : job.phase;
    return resumePhase === 'brewing';
  }

/** getRemainingBrewTicks：执行对应的业务逻辑。 */
  private getRemainingBrewTicks(job: PlayerAlchemyJob): number {
    return job.batchBrewTicks * this.getRemainingBatchCount(job);
  }

/** getPreparationRemainingTicks：执行对应的业务逻辑。 */
  private getPreparationRemainingTicks(job: PlayerAlchemyJob): number {
    return Math.max(0, job.remainingTicks - this.getRemainingBrewTicks(job) - Math.max(0, job.pausedTicks));
  }

/** resolveJobResumePhase：执行对应的业务逻辑。 */
  private resolveJobResumePhase(job: PlayerAlchemyJob): 'preparing' | 'brewing' {
    return this.getPreparationRemainingTicks(job) > 0 ? 'preparing' : 'brewing';
  }

/** getRefundItemName：执行对应的业务逻辑。 */
  private getRefundItemName(itemId: string): string {
    return this.contentService.getItem(itemId)?.name ?? itemId;
  }

/** resolveRecipeCategory：执行对应的业务逻辑。 */
  private resolveRecipeCategory(outputItemId: string, recipeId: string): AlchemyRecipeCategory {
/** outputItem：定义该变量以承载业务值。 */
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

/** recipeConsumesSpiritStone：执行对应的业务逻辑。 */
  private recipeConsumesSpiritStone(recipe: AlchemyRecipeCatalogEntry): boolean {
    return recipe.category === 'buff';
  }

/** getRecipeSpiritStoneCost：执行对应的业务逻辑。 */
  private getRecipeSpiritStoneCost(recipe: AlchemyRecipeCatalogEntry, quantity: number): number {
    return getAlchemySpiritStoneCost(recipe.outputLevel, this.recipeConsumesSpiritStone(recipe)) * quantity;
  }

/** getRecipeBatchOutputSize：执行对应的业务逻辑。 */
  private getRecipeBatchOutputSize(recipe: AlchemyRecipeCatalogEntry): number {
    return recipe.category === 'buff' ? 1 : 6;
  }

/** grantAlchemyRefundItem：执行对应的业务逻辑。 */
  private grantAlchemyRefundItem(player: PlayerState, itemId: string, count: number): AlchemyGrantResolution {
    if (count <= 0) {
      return { inventoryChanged: false, dirtyPlayers: [], droppedToGround: false };
    }
/** item：定义该变量以承载业务值。 */
    const item = this.contentService.createItem(itemId, count);
    if (!item) {
      return { inventoryChanged: false, dirtyPlayers: [], droppedToGround: false };
    }
    if (this.inventoryService.addItem(player, item)) {
      return { inventoryChanged: true, dirtyPlayers: [], droppedToGround: false };
    }
/** dirtyPlayers：定义该变量以承载业务值。 */
    const dirtyPlayers = this.lootService.dropToGround(player.mapId, player.x, player.y, item);
    return { inventoryChanged: false, dirtyPlayers, droppedToGround: true };
  }

  private resolveAlchemyBatch(
    player: PlayerState,
    job: PlayerAlchemyJob,
    recipe: AlchemyRecipeCatalogEntry,
    currentBatch: number,
  ): AlchemyBatchResolution {
/** batchOutputCount：定义该变量以承载业务值。 */
    const batchOutputCount = Math.max(1, job.outputCount);
/** successCount：定义该变量以承载业务值。 */
    let successCount = 0;
    for (let index = 0; index < batchOutputCount; index += 1) {
      if (Math.random() <= job.successRate) {
        successCount += 1;
      }
    }
/** failureCount：定义该变量以承载业务值。 */
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

/** reward：定义该变量以承载业务值。 */
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
/** resultText：定义该变量以承载业务值。 */
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

/** dirtyPlayers：定义该变量以承载业务值。 */
    const dirtyPlayers = this.lootService.dropToGround(player.mapId, player.x, player.y, reward);
/** resultText：定义该变量以承载业务值。 */
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

/** buildPanelState：执行对应的业务逻辑。 */
  private buildPanelState(player: PlayerState): SyncedAlchemyPanelState | null {
/** furnaceItemId：定义该变量以承载业务值。 */
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

/** loadRecipes：执行对应的业务逻辑。 */
  private loadRecipes(): void {
/** filePath：定义该变量以承载业务值。 */
    const filePath = resolveServerDataPath('content', 'alchemy', 'recipes.json');
/** raw：定义该变量以承载业务值。 */
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as RawAlchemyRecipe[];
    this.recipes.clear();
    this.catalog.length = 0;
    for (const entry of raw) {
      const recipeId = String(entry.recipeId ?? '').trim();
      const outputItemId = String(entry.outputItemId ?? '').trim();
      if (!recipeId || !outputItemId) {
        throw new Error(`炼丹配方存在缺失 recipeId/outputItemId 的条目: ${JSON.stringify(entry)}`);
      }
/** outputItem：定义该变量以承载业务值。 */
      const outputItem = this.contentService.getItem(outputItemId);
      if (!outputItem) {
        throw new Error(`炼丹配方 ${recipeId} 的产出物 ${outputItemId} 不存在`);
      }
/** category：定义该变量以承载业务值。 */
      const category = this.resolveRecipeCategory(outputItemId, recipeId);
/** ingredients：定义该变量以承载业务值。 */
      const ingredients = (Array.isArray(entry.ingredients) ? entry.ingredients : []).map((ingredient) => {
/** itemId：定义该变量以承载业务值。 */
        const itemId = String(ingredient.itemId ?? '').trim();
/** item：定义该变量以承载业务值。 */
        const item = this.contentService.getItem(itemId);
        if (!item) {
          throw new Error(`炼丹配方 ${recipeId} 的材料 ${itemId} 不存在`);
        }
        return {
          itemId,
          name: item.name,
          count: normalizePositiveInt(ingredient.count, 1),
/** role：定义该变量以承载业务值。 */
          role: ingredient.role === 'main' ? 'main' as 'main' | 'aux' : 'aux',
          level: normalizePositiveInt(item.level, 1),
          grade: (item.grade ?? 'mortal') as TechniqueGrade,
          powerPerUnit: computeAlchemyMaterialPower(item.level, item.grade, 1),
        };
      });
      if (ingredients.length === 0 || !ingredients.some((ingredient) => ingredient.role === 'main')) {
        throw new Error(`炼丹配方 ${recipeId} 至少需要一味主药`);
      }
/** catalogEntry：定义该变量以承载业务值。 */
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
/** nameOrder：定义该变量以承载业务值。 */
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
/** normalizedMap：定义该变量以承载业务值。 */
    const normalizedMap = buildAlchemyIngredientCountMap(normalizeAlchemyIngredientSelections(ingredients));
    for (const itemId of normalizedMap.keys()) {
      if (!recipe.ingredients.some((ingredient) => ingredient.itemId === itemId)) {
        return { error: '当前简易丹方包含了该丹方之外的材料。' };
      }
    }

/** normalizedIngredients：定义该变量以承载业务值。 */
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

/** getInventoryCount：执行对应的业务逻辑。 */
  private getInventoryCount(player: PlayerState, itemId: string): number {
    return player.inventory.items
      .filter((item) => item.itemId === itemId)
      .reduce((sum, item) => sum + item.count, 0);
  }

/** consumeInventoryItem：执行对应的业务逻辑。 */
  private consumeInventoryItem(player: PlayerState, itemId: string, count: number): void {
/** remaining：定义该变量以承载业务值。 */
    let remaining = count;
    while (remaining > 0) {
/** slotIndex：定义该变量以承载业务值。 */
      const slotIndex = this.inventoryService.findItem(player, itemId);
      if (slotIndex < 0) {
        return;
      }
/** removed：定义该变量以承载业务值。 */
      const removed = this.inventoryService.removeItem(player, slotIndex, remaining);
      if (!removed) {
        return;
      }
      remaining -= removed.count;
    }
  }

/** ensureAlchemySkill：执行对应的业务逻辑。 */
  private ensureAlchemySkill(player: PlayerState): AlchemySkillState {
/** expToNext：定义该变量以承载业务值。 */
    const expToNext = Math.max(0, this.contentService.getRealmLevelEntry(1)?.expToNext ?? DEFAULT_ALCHEMY_EXP_TO_NEXT);
/** normalized：定义该变量以承载业务值。 */
    const normalized = normalizeAlchemySkillState(player.alchemySkill, expToNext);
    player.alchemySkill = normalized;
    return normalized;
  }

/** getAlchemySkillExpToNext：执行对应的业务逻辑。 */
  private getAlchemySkillExpToNext(level: number): number {
/** normalizedLevel：定义该变量以承载业务值。 */
    const normalizedLevel = Math.max(1, Math.floor(level || 1));
    return Math.max(0, this.contentService.getRealmLevelEntry(normalizedLevel)?.expToNext ?? 0);
  }

  private getAlchemyFurnaceBonuses(player: PlayerState): { successRate: number; speedRate: number } {
/** furnace：定义该变量以承载业务值。 */
    const furnace = player.equipment.weapon?.tags?.includes(ALCHEMY_FURNACE_TAG)
      ? player.equipment.weapon
      : null;
    return {
      successRate: clampAlchemyModifier(furnace?.alchemySuccessRate),
      speedRate: normalizeAlchemySpeedRate(furnace?.alchemySpeedRate),
    };
  }

  private grantAlchemySkillExp(
    player: PlayerState,
    recipeLevel: number,
    recipeBaseBrewTicks: number,
    successCount: number,
    failureCount: number,
  ): { changed: boolean; messages: AlchemyResultMessage[]; dirtyFlags: Array<'inv' | 'tech' | 'attr' | 'actions'> } {
/** skill：定义该变量以承载业务值。 */
    const skill = this.ensureAlchemySkill(player);
    if (skill.expToNext <= 0) {
      return { changed: false, messages: [], dirtyFlags: [] };
    }
/** totalAttempts：定义该变量以承载业务值。 */
    const totalAttempts = Math.max(0, successCount) + Math.max(0, failureCount);
    if (totalAttempts <= 0) {
      return { changed: false, messages: [], dirtyFlags: [] };
    }
/** gainResult：定义该变量以承载业务值。 */
    const gainResult = computeCraftSkillExpGain({
      skillLevel: skill.level,
      targetLevel: recipeLevel,
      baseActionTicks: recipeBaseBrewTicks,
      successCount,
      failureCount,
      successMultiplier: 1,
      getExpToNextByLevel: (level) => this.getAlchemySkillExpToNext(level),
    });
/** gain：定义该变量以承载业务值。 */
    const gain = gainResult.finalGain;
    if (gain <= 0) {
      return { changed: false, messages: [], dirtyFlags: [] };
    }
    skill.exp += gain;
/** messages：定义该变量以承载业务值。 */
    const messages: AlchemyResultMessage[] = [];
/** dirtyFlags：定义该变量以承载业务值。 */
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
/** craftRealmGain：定义该变量以承载业务值。 */
    const craftRealmGain = this.techniqueService.grantCraftRealmExp(player, gain / 2);
    for (const flag of craftRealmGain.dirty) {
      dirtyFlags.add(flag);
    }
    for (const message of craftRealmGain.messages) {
      messages.push({
        text: message.text,
/** kind：定义该变量以承载业务值。 */
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
