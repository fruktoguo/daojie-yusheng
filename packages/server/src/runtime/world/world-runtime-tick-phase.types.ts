/**
 * WorldRuntime Tick Phase 定义
 *
 * advanceFrame 内各域推进顺序的显式枚举。
 * 每个 phase 对应 WorldRuntimeInstanceTickOrchestrationService.advanceFrame 中的一个阶段。
 */

/** Tick 帧内执行阶段枚举 */
export enum TickPhase {
  /** 重置帧级效果（combat effects 等） */
  ResetFrameEffects = 'ResetFrameEffects',

  /** 规划实例步进（累积 tick 进度、检查 lease 可写性） */
  PlanInstanceSteps = 'PlanInstanceSteps',

  /** 预 tick 物化（respawn、navigation、auto-use-pills、auto-combat） */
  PreTickMaterialization = 'PreTickMaterialization',

  /** 分发待处理命令（玩家命令 + 系统命令） */
  DispatchPendingCommands = 'DispatchPendingCommands',

  /** 实例 tick 循环（每实例 × 每步进） */
  InstanceTickLoop = 'InstanceTickLoop',

  /** 实例 tick 后清理（tower idle cleanup） */
  PostTickCleanup = 'PostTickCleanup',

  /** 玩家后 tick 推进（loot container、quest refresh） */
  PostTickPlayerAdvance = 'PostTickPlayerAdvance',

  /** 帧指标记录 */
  RecordMetrics = 'RecordMetrics',
}

/** 实例 tick 循环内的子阶段 */
export enum InstanceTickSubPhase {
  /** 实例核心 tick（tickOnce） */
  CoreTick = 'CoreTick',

  /** 地块资源流动 */
  TileResourceFlow = 'TileResourceFlow',

  /** 阵法推进 */
  FormationAdvance = 'FormationAdvance',

  /** 临时地块推进 */
  TemporaryTileAdvance = 'TemporaryTileAdvance',

  /** 地块恢复 */
  TileRecovery = 'TileRecovery',

  /** 建筑完工通知 */
  BuildingCompletion = 'BuildingCompletion',

  /** 传送执行 */
  ApplyTransfers = 'ApplyTransfers',

  /** 怪物行动执行 */
  ApplyMonsterActions = 'ApplyMonsterActions',

  /** 世界时间/视野同步 */
  SyncWorldTimeVision = 'SyncWorldTimeVision',

  /** 玩家 tick 推进（修炼、buff、恢复） */
  PlayerTickAdvance = 'PlayerTickAdvance',

  /** 地块灵力消耗 */
  TileQiDrain = 'TileQiDrain',

  /** 待处理技能施放结算 */
  ResolvePendingSkillCast = 'ResolvePendingSkillCast',

  /** 制作任务推进 */
  CraftJobAdvance = 'CraftJobAdvance',

  /** 通天塔实例推进 */
  TongtianTowerAdvance = 'TongtianTowerAdvance',
}

/** 帧阶段执行顺序（用于文档和调试） */
export const TICK_PHASE_ORDER: readonly TickPhase[] = [
  TickPhase.ResetFrameEffects,
  TickPhase.PlanInstanceSteps,
  TickPhase.PreTickMaterialization,
  TickPhase.DispatchPendingCommands,
  TickPhase.InstanceTickLoop,
  TickPhase.PostTickCleanup,
  TickPhase.PostTickPlayerAdvance,
  TickPhase.RecordMetrics,
];

/** 实例 tick 子阶段执行顺序 */
export const INSTANCE_TICK_SUB_PHASE_ORDER: readonly InstanceTickSubPhase[] = [
  InstanceTickSubPhase.CoreTick,
  InstanceTickSubPhase.TileResourceFlow,
  InstanceTickSubPhase.FormationAdvance,
  InstanceTickSubPhase.TemporaryTileAdvance,
  InstanceTickSubPhase.TileRecovery,
  InstanceTickSubPhase.BuildingCompletion,
  InstanceTickSubPhase.ApplyTransfers,
  InstanceTickSubPhase.ApplyMonsterActions,
  InstanceTickSubPhase.SyncWorldTimeVision,
  InstanceTickSubPhase.PlayerTickAdvance,
  InstanceTickSubPhase.TileQiDrain,
  InstanceTickSubPhase.ResolvePendingSkillCast,
  InstanceTickSubPhase.CraftJobAdvance,
  InstanceTickSubPhase.TongtianTowerAdvance,
];
