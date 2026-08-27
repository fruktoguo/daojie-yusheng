/**
 * 本文件定义副本系统的前后端共享契约和纯规则。
 *
 * 运行时状态、数据库写入和流程副作用必须留在服务端；这里仅提供稳定类型、
 * 配置结构和可在客户端复用的数值计算。
 */
import type { TechniqueGrade } from './cultivation-types';
import { TECHNIQUE_GRADE_ORDER } from './constants/gameplay/technique';

export const DUNGEON_MAX_PARTY_MEMBERS = 5;
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
  allAttributeMultiplierBase: number;
  hpMultiplierBase: number;
  difficultyStep: number;
  presentRankStep?: Partial<Record<TechniqueGrade, number>>;
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
  status: 'completed' | 'failed' | 'aborted' | 'expired';
  completionId: string;
  rewardTableId?: string;
  rewardClaimed: boolean;
  difficulty: DungeonDifficultySelection;
  effectiveStep: number;
  completedAt: number;
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
}
export interface C2S_RespondDungeonEntry {
  runId: string;
  confirm: boolean;
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

export function resolveDungeonAttributeMultipliers(
  selection: DungeonDifficultySelection,
  maxPresentRank: TechniqueGrade,
  rule: DungeonDifficultyAttributeRule = {
    allAttributeMultiplierBase: 1.2,
    hpMultiplierBase: 2,
    difficultyStep: 0,
  },
): { effectiveStep: number; allAttributeMultiplier: number; hpMultiplier: number } {
  const effectiveStep = resolveDungeonEffectiveStep(selection, maxPresentRank);
  const allAttributeMultiplier = Math.pow(rule.allAttributeMultiplierBase, effectiveStep);
  const hpMultiplier = allAttributeMultiplier * Math.pow(rule.hpMultiplierBase, effectiveStep);
  return { effectiveStep, allAttributeMultiplier, hpMultiplier };
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
