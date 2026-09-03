/**
 * 本文件定义副本系统的前后端共享契约和纯规则。
 *
 * 运行时状态、数据库写入和流程副作用必须留在服务端；这里仅提供稳定类型、
 * 配置结构和可在客户端复用的数值计算。
 */
import type { TechniqueGrade } from './cultivation-types';
import type { ItemType } from './item-runtime-types';
import { TECHNIQUE_GRADE_ORDER } from './constants/gameplay/technique';

export const DUNGEON_MAX_PARTY_MEMBERS = 5;
export const DUNGEON_PARTY_DROP_RATE_BONUS_PER_EXTRA_MEMBER = 0.5;
export const DUNGEON_MAX_STAMINA = 240;
export const DUNGEON_STAMINA_REGEN_INTERVAL_MS = 60 * 60 * 1000;

export const DUNGEON_DIFFICULTY_ORDER = ['trial', 'hard', 'nightmare', 'present'] as const;
export type DungeonDifficulty = typeof DUNGEON_DIFFICULTY_ORDER[number];

export const DUNGEON_FLOW_TYPE_ORDER = ['defense', 'suppress_demon', 'expedition'] as const;
export type DungeonFlowType = typeof DUNGEON_FLOW_TYPE_ORDER[number];

export const DUNGEON_RUN_STATUS_ORDER = [
 'created',
 'activating',
 'active',
 'completing',
 'completed',
 'failed',
 'aborted',
 'expired',
] as const;
export type DungeonRunStatus = typeof DUNGEON_RUN_STATUS_ORDER[number];

export const DUNGEON_PRESENT_RANK_ORDER = TECHNIQUE_GRADE_ORDER;

export interface DungeonDifficultySelection {
 difficulty: DungeonDifficulty;
 presentRank?: TechniqueGrade;
}

export interface DungeonDifficultyAttributeRule {
 /** 普通难度全属性步进底数，默认 1.4 (试炼 1.0, 困难 1.4, 噩梦 1.96) */
 standardAllAttributeMultiplierBase?: number;
 /** 普通难度生命额外翻倍底数，默认 2.0 (试炼 1.0, 困难 2.0, 噩梦 4.0) */
 standardHpMultiplierBase?: number;
 /** 现世难度全属性步进底数，默认 1.2 (凡 1.0, 黄 1.2, 玄 1.44, 地 1.728, 天 2.0736, 灵 2.48832) */
 presentAllAttributeMultiplierBase?: number;
 /** 现世难度凡阶基础生命额外倍率，默认 10.0 */
 presentHpBaseMultiplier?: number;
 /** 现世难度每阶生命翻倍底数，默认 2.0 (凡 10, 黄 20, 玄 40, 地 80, 天 160, 灵 320) */
 presentHpRankStepMultiplierBase?: number;
 /** 向后兼容字段 */
 allAttributeMultiplierBase?: number;
 hpMultiplierBase?: number;
 difficultyStep?: number;
 presentRankStep?: Partial<Record<TechniqueGrade, number>>;
}

/** 副本房间 Boss 的专用掉落项；不改动现世/普通地图的怪物掉落表。 */
export interface DungeonBossDropRecord {
 itemId: string;
 name: string;
 type: ItemType;
 count: number;
 chance?: number;
 /** 限定掉落的副本难度（如 'present' 仅现世掉落；未配置则所有难度通用）。 */
 difficulty?: DungeonDifficulty;
 /** 限定现世最低阶位（如 'spirit' 表示仅现世·灵阶及以上掉落）。 */
 minPresentRank?: TechniqueGrade;
 /** 显式允许的现世阶位列表；若配置则只在这些阶位掉落。 */
 allowedPresentRanks?: TechniqueGrade[];
}

export interface DungeonDifficultyOverride {
 allAttributeMultiplier?: number;
 hpMultiplier?: number;
 additionalSkillIds?: string[];
 additionalTraitIds?: string[];
 additionalAffixIds?: string[];
 specialStateIds?: string[];
 metadata?: Record<string, unknown>;
}

export interface DungeonDifficultyConfig {
 maxPresentRank: TechniqueGrade;
 energyCost: {
  trial: number;
  hard: number;
  nightmare: number;
  present: number;
 };
 attributeRule?: DungeonDifficultyAttributeRule;
 overrides?: Partial<Record<DungeonDifficulty, DungeonDifficultyOverride>>;
 presentRankOverrides?: Partial<Record<TechniqueGrade, DungeonDifficultyOverride>>;
}

export interface DungeonMapRoomDefinition {
 roomId: string;
 mapTemplateId?: string;
 spawnX?: number;
 spawnY?: number;
 nextRoomId?: string;
 spawnGroupIds?: string[];
 bossId?: string;
 /** 房间 Boss 的副本专用技能列表；配置后替换妖兽模板默认技能。 */
 bossSkillIds?: string[];
 /** 房间 Boss 的副本专用掉落列表；配置后替换妖兽模板默认掉落。 */
 bossDropTable?: DungeonBossDropRecord[];
 eliteGroupIds?: string[];
 clearCondition?: 'boss_defeated' | 'all_hostiles_defeated' | 'controller';
 mechanismFormation?: DungeonMechanismFormationConfig;
}

export interface DungeonWaveDefinition {
 waveIndex: number;
 spawnGroupIds: string[];
 count?: number;
 intervalSeconds?: number;
 rewardTableId?: string;
}

export interface DungeonMechanismFormationConfig {
 kind: string;
 formationId: string;
 controlMode: 'controller_only';
 arrayEyeMode: 'none';
 effectValue?: number;
 spiritStoneBudget?: number;
 qiBudget?: number;
 durability?: number;
 powerMultiplierByBossMaxHp?: number;
 metadata?: Record<string, unknown>;
}

/** 副本剧情演出的实体引用。演出只驱动表现与行动效果，不参与副本结算。 */
export interface DungeonPresentationActorRef {
 kind: 'monster' | 'npc';
 id: string;
}

export interface DungeonPresentationCondition {
 /** 队伍最高境界等级不高于该值时才执行。 */
 maxPartyRealmLv?: number;
 /** 队伍最高境界等级不低于该值时才执行。 */
 minPartyRealmLv?: number;
}

export interface DungeonPresentationDialogueStep {
 stepId: string;
 type: 'dialogue';
 actor: DungeonPresentationActorRef;
 text: string;
 /** 气泡持续时间；默认 3 秒。 */
 durationMs?: number;
 condition?: DungeonPresentationCondition;
}

export interface DungeonPresentationActionStep {
 stepId: string;
 type: 'action';
 actor: DungeonPresentationActorRef;
 /** 行动效果 ID，由服务端行动效果处理器解释。 */
 actionId: string;
 /** 延迟若干逻辑息后启动，便于对白先行。 */
 delayTicks?: number;
 /** 不填表示持续到行动自身结束（例如 Boss 灵力耗尽）。 */
 durationTicks?: number;
 condition?: DungeonPresentationCondition;
 params?: Record<string, unknown>;
}

export type DungeonPresentationStep = DungeonPresentationDialogueStep | DungeonPresentationActionStep;

/** 当指定怪物行动被排入当前副本 tick 时触发的剧情步骤。 */
export interface DungeonPresentationActionTrigger {
 actionId: string;
 steps: DungeonPresentationStep[];
}

export interface DungeonPresentationDefinition {
 onRunCreated?: DungeonPresentationStep[];
 onCombatEngaged?: DungeonPresentationStep[];
 onMonsterAction?: DungeonPresentationActionTrigger[];
}

export interface DungeonPresentationPendingStep {
 stepId: string;
 remainingTicks: number;
}

export interface DungeonPresentationActiveAction {
 stepId: string;
 actionId: string;
 actor: DungeonPresentationActorRef;
 remainingTicks?: number;
 startedAtTick: number;
 params?: Record<string, unknown>;
}

export interface DungeonPresentationRunState {
 completedStepIds: string[];
 pendingSteps: DungeonPresentationPendingStep[];
 activeActions: DungeonPresentationActiveAction[];
}

export interface DungeonRewardConfig {
 rewardTableId: string;
 firstClearOnly?: boolean;
 ratingEnabled?: boolean;
 itemRewards?: Array<{ itemId: string; count: number }>;
}

export interface DungeonDefinition {
 id: string;
 name: string;
 description?: string;
 flowType: DungeonFlowType;
 controllerId: string;
 mapTemplateId: string;
 maxPartyMembers: number;
 entryMapTemplateId: string;
 entryX?: number;
 entryY?: number;
 entryExitRadius?: number;
 confirmationTimeoutMs?: number;
 timeoutSeconds?: number;
 difficulty: DungeonDifficultyConfig;
 rooms?: DungeonMapRoomDefinition[];
 waves?: DungeonWaveDefinition[];
 presentation?: DungeonPresentationDefinition;
 rewards: DungeonRewardConfig;
 metadata?: Record<string, unknown>;
}

export interface DungeonRunMemberSnapshot {
 playerId: string;
 playerNo?: number;
 name?: string;
 joinedAt: number;
}

export interface DungeonRunState {
 runId: string;
 dungeonId: string;
 partyId: string;
 status: DungeonRunStatus;
 difficulty: DungeonDifficultySelection;
 effectiveStep: number;
 mapInstanceId: string;
 members: DungeonRunMemberSnapshot[];
 currentRoomId?: string;
 currentWaveIndex?: number;
 completionId?: string;
 settlementId?: string;
 createdAt: number;
 activatedAt?: number;
 completedAt?: number;
 destroyedAt?: number;
 failureReason?: string;
 /** 当前仍处于战败待复生状态的队员，持久化用于重启后继续裁定团灭。 */
 defeatedMemberIds?: string[];
 /** 当前流程的轻量显示投影，供副本 HUD 使用，不参与权威结算。 */
 progressPercent?: number;
 bossProgress?: { name: string; hp: number; maxHp: number };
 /** 当前剧情演出状态；只影响表现/行动效果，不参与副本结算。 */
 presentation?: DungeonPresentationRunState;
 /** 模拟挑战：不扣精力，击杀与通关均无经验、掉落与任何收益；须随流程快照持久化。 */
 simulation?: boolean;
}

export type DungeonFlowEvent =
 | { type: 'run_created'; runId: string }
 | { type: 'player_entered'; runId: string; playerId: string }
 | { type: 'entity_defeated'; runId: string; entityId: string; entityKind?: string }
 | { type: 'wave_cleared'; runId: string; waveIndex: number }
 | { type: 'room_cleared'; runId: string; roomId: string; reason: 'boss_defeated' | 'formation_destroyed' | 'controller' }
 | { type: 'formation_state_changed'; runId: string; formationInstanceId: string; state: string }
 | { type: 'player_exit_requested'; runId: string; playerId: string }
 | { type: 'run_completed'; runId: string; completionId: string }
 | { type: 'run_aborted'; runId: string; reason: string };

export interface DungeonSettlementView {
 runId: string;
 dungeonId: string;
 dungeonName?: string;
 status: 'completed' | 'failed' | 'aborted' | 'expired';
 completionId: string;
 rewardTableId?: string;
 rewardClaimed: boolean;
 difficulty: DungeonDifficultySelection;
 effectiveStep: number;
 completedAt: number;
 failureReason?: string;
 members: DungeonSettlementMember[];
 simulation?: boolean;

}

export interface DungeonSettlementMember {
 playerId: string;
 playerNo?: number;
 name: string;
 displayName?: string;
 imageUrl?: string;
 realmName?: string;
 realmStage?: string;
 damageDealt: number;
 damageTaken: number;
 healingDone: number;
 rewards: Array<{ itemId: string; count: number }>;
}

export interface DungeonStaminaView {
 current: number;
 maximum: number;
 nextRecoveryAt?: number;
 updatedAt: number;
}

export interface C2S_RequestDungeonCatalog { }
export interface C2S_StartDungeonEntry {
 dungeonId: string;
 difficulty: DungeonDifficulty;
 presentRank?: TechniqueGrade;
 /** 勾选模拟后进入练习局；仅 `true` 生效。 */
 simulation?: boolean;

}
export interface C2S_RespondDungeonEntry {
 runId: string;
 confirm: boolean;
 /** 仅关闭准备弹窗确认拒绝时传入；普通取消准备仍只更新 ready 状态。 */
 reject?: boolean;
}
export interface DungeonEntryPreparationMember {
 playerId: string;
 playerNo?: number;
 name: string;
 realmName?: string;
 realmStage?: string;
 displayName?: string;
 imageUrl?: string;
 ready: boolean;
 /** 已明确拒绝进入；该状态会在准备界面展示为 ×，直到本次准备结束。 */
 rejected?: boolean;
}
export interface C2S_ExitDungeon { runId?: string; }
export interface S2C_DungeonCatalog { dungeons: DungeonDefinition[]; stamina: DungeonStaminaView; activeRun?: DungeonRunState; }
export interface S2C_DungeonEntryPrompt {
 runId: string;
 dungeonId: string;
 dungeonName: string;
 difficulty: DungeonDifficulty;
 presentRank: TechniqueGrade;
 staminaCost: number;
 expiresAt: number;
 leaderPlayerId: string;
 phase: 'preparing' | 'countdown';
 members: DungeonEntryPreparationMember[];
 enterAt?: number;
 /** 有成员拒绝时，准备弹窗在该时间点自动关闭。 */
 rejectAt?: number;
 simulation?: boolean;

}
export interface S2C_DungeonEntryResult {
 ok: boolean;
 reason?: string;
 run?: DungeonRunState;
 stamina?: DungeonStaminaView;
}
export interface S2C_DungeonState { run: DungeonRunState; }
export interface S2C_DungeonSettlement { settlement: DungeonSettlementView; }

export function getDungeonDifficultyStep(difficulty: DungeonDifficulty): number {
 return DUNGEON_DIFFICULTY_ORDER.indexOf(difficulty);
}

export function getDungeonPresentRankStep(rank: TechniqueGrade): number {
 return DUNGEON_PRESENT_RANK_ORDER.indexOf(rank);
}

export function isDungeonPresentRankAllowed(
 difficulty: DungeonDifficulty,
 presentRank: TechniqueGrade | undefined,
 maxPresentRank: TechniqueGrade,
): boolean {
 if (difficulty !== 'present') return presentRank === undefined;
 if (!presentRank) return false;
 return getDungeonPresentRankStep(presentRank) <= getDungeonPresentRankStep(maxPresentRank);
}

/** 按当前副本难度与现世阶位过滤 Boss 专用掉落列表。 */
export function filterDungeonBossDropTable(
 dropTable: readonly DungeonBossDropRecord[] | undefined,
 selection: { difficulty: DungeonDifficulty; presentRank?: TechniqueGrade },
): DungeonBossDropRecord[] | undefined {
 if (!Array.isArray(dropTable)) return undefined;
 return dropTable.filter((drop) => {
  if (drop.difficulty && drop.difficulty !== selection.difficulty) {
   return false;
  }
  if (drop.minPresentRank) {
   if (selection.difficulty !== 'present' || !selection.presentRank) {
    return false;
   }
   if (getDungeonPresentRankStep(selection.presentRank) < getDungeonPresentRankStep(drop.minPresentRank)) {
    return false;
   }
  }
  if (Array.isArray(drop.allowedPresentRanks) && drop.allowedPresentRanks.length > 0) {
   if (selection.difficulty !== 'present' || !selection.presentRank) {
    return false;
   }
   if (!drop.allowedPresentRanks.includes(selection.presentRank)) {
    return false;
   }
  }
  return true;
 });
}

export function resolveDungeonEffectiveStep(
 selection: DungeonDifficultySelection,
 maxPresentRank: TechniqueGrade,
): number {
 if (!isDungeonPresentRankAllowed(selection.difficulty, selection.presentRank, maxPresentRank)) {
  throw new Error('副本难度或现世阶位不合法');
 }
 return getDungeonDifficultyStep(selection.difficulty)
  + (selection.difficulty === 'present' && selection.presentRank
   ? getDungeonPresentRankStep(selection.presentRank)
   : 0);
}

export interface DungeonAttributeMultipliersResult {
 baselineSource: 'standard' | 'peak';
 effectiveStep: number;
 allAttributeMultiplier: number;
 hpMultiplier: number;
 difficultyStep: number;
 rankStep?: number;
}

export function resolveDungeonAttributeMultipliers(
 selection: DungeonDifficultySelection,
 maxPresentRank: TechniqueGrade,
 rule: DungeonDifficultyAttributeRule = {},
): DungeonAttributeMultipliersResult {
 const effectiveStep = resolveDungeonEffectiveStep(selection, maxPresentRank);
 const diffStep = getDungeonDifficultyStep(selection.difficulty);

 if (selection.difficulty !== 'present') {
  const allBase = rule.standardAllAttributeMultiplierBase ?? 2.0;
  const hpBase = rule.standardHpMultiplierBase ?? 2.0;
  const allAttributeMultiplier = Math.pow(allBase, diffStep);
  const hpMultiplier = allAttributeMultiplier * Math.pow(hpBase, diffStep);
  return {
   baselineSource: 'standard',
   effectiveStep,
   difficultyStep: diffStep,
   allAttributeMultiplier,
   hpMultiplier,
  };
 }

 const rank = selection.presentRank ?? 'mortal';
 const rankStep = getDungeonPresentRankStep(rank);
 const allBase = rule.presentAllAttributeMultiplierBase ?? 1.2;
 const hpBaseExtra = rule.presentHpBaseMultiplier ?? 10.0;
 const hpRankBase = rule.presentHpRankStepMultiplierBase ?? 2.0;

 const allAttributeMultiplier = Math.pow(allBase, rankStep);
 const hpMultiplier = allAttributeMultiplier * (hpBaseExtra * Math.pow(hpRankBase, rankStep));

 return {
  baselineSource: 'peak',
  effectiveStep,
  difficultyStep: diffStep,
  rankStep,
  allAttributeMultiplier,
  hpMultiplier,
 };
}

export interface DungeonLootMultipliersResult {
 /** 灵石/功德数量倍率：试炼 100%，困难 150%，噩梦 250%，现世凡阶 400%。 */
 currencyCountMultiplier: number;
 /** 功法等掉落的等效概率倍率：试炼 100%，困难 200%，噩梦 300%，现世凡阶 500%。 */
 dropRateMultiplier: number;
 presentRankStep?: number;
}

/** 按副本难度统一计算 Boss 掉落倍率，避免把倍率散落在击杀热路径。 */
export function resolveDungeonLootMultipliers(
 selection: DungeonDifficultySelection,
 maxPresentRank: TechniqueGrade,
): DungeonLootMultipliersResult {
 const effectiveStep = resolveDungeonEffectiveStep(selection, maxPresentRank);
 if (selection.difficulty === 'trial') {
  return { currencyCountMultiplier: 1, dropRateMultiplier: 1 };
 }
 if (selection.difficulty === 'hard') {
  return { currencyCountMultiplier: 1.5, dropRateMultiplier: 2 };
 }
 if (selection.difficulty === 'nightmare') {
  return { currencyCountMultiplier: 2.5, dropRateMultiplier: 3 };
 }
 const rankStep = Math.max(0, effectiveStep - getDungeonDifficultyStep('present'));
 return {
  currencyCountMultiplier: 4 * (1 + rankStep * 0.2),
  dropRateMultiplier: 5 * (1 + rankStep * 0.5),
  presentRankStep: rankStep,
 };
}


/** 副本组队爆率：激活快照每多 1 人总掉率 +50%，仍只掷一次。1~5 人分别为 1.0/1.5/2.0/2.5/3.0。 */
export function resolveDungeonPartyDropRateMultiplier(memberCount: number): number {
 const count = Math.max(
  1,
  Math.min(DUNGEON_MAX_PARTY_MEMBERS, Math.trunc(Number(memberCount) || 1)),
 );
 return 1 + DUNGEON_PARTY_DROP_RATE_BONUS_PER_EXTRA_MEMBER * (count - 1);
}

export function resolveDungeonStaminaCost(
 difficulty: DungeonDifficulty,
 config: DungeonDifficultyConfig,
): number {
 const value = config.energyCost[difficulty];
 if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
  throw new Error(`副本 ${difficulty} 精力消耗配置无效`);
 }
 return value;
}

/** 仅在明确标记模拟时拦截奖励；普通实例和未标记副本保持原奖励链。 */
export function isDungeonSimulationRun(run: { simulation?: unknown } | null | undefined): boolean {
 return run?.simulation === true;
}

/** 仅在实例明确标记 `dungeonSimulation === true` 时拦截；缺失字段不得视为模拟。 */
export function isDungeonSimulationInstance(
 instance: { meta?: { dungeonSimulation?: unknown } | null } | null | undefined,
): boolean {
 return instance?.meta?.dungeonSimulation === true;
}


export function resolveRecoveredStamina(
 current: number,
 updatedAt: number,
 now: number,
 maximum = DUNGEON_MAX_STAMINA,
 intervalMs = DUNGEON_STAMINA_REGEN_INTERVAL_MS,
): { current: number; updatedAt: number; recovered: number; nextRecoveryAt?: number } {
 const safeCurrent = Math.max(0, Math.min(maximum, Math.trunc(current)));
 const safeUpdatedAt = Number.isFinite(updatedAt) ? Math.max(0, Math.trunc(updatedAt)) : now;
 const safeNow = Math.max(safeUpdatedAt, Math.trunc(now));
 if (safeCurrent >= maximum || intervalMs <= 0) {
  return { current: maximum === safeCurrent ? safeCurrent : maximum, updatedAt: safeNow, recovered: 0 };
 }
 const recovered = Math.max(0, Math.floor((safeNow - safeUpdatedAt) / intervalMs));
 const nextCurrent = Math.min(maximum, safeCurrent + recovered);
 const consumedIntervals = Math.max(0, nextCurrent - safeCurrent);
 const nextUpdatedAt = consumedIntervals > 0
  ? safeUpdatedAt + consumedIntervals * intervalMs
  : safeUpdatedAt;
 return {
  current: nextCurrent,
  updatedAt: nextUpdatedAt,
  recovered: consumedIntervals,
  ...(nextCurrent < maximum ? { nextRecoveryAt: nextUpdatedAt + intervalMs } : {}),
 };
}
