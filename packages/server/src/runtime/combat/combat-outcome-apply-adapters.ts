/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { CombatTargetKind } from '../world/combat/combat-action.types';

type OutcomeHandlers = Record<string, any>;
type OutcomeApplyInput = Record<string, any>;

/**
 * 创建完整的战斗结果落地适配器集合。
 * @param handlers 可选的覆盖回调，优先于 deps 中的默认服务
 */
export function createCombatOutcomeApplyAdapters(handlers: OutcomeHandlers = {}) {
  return {
    player: createPlayerOutcomeApplyAdapter(handlers),
    self: createPlayerOutcomeApplyAdapter(handlers),
    monster: createMonsterOutcomeApplyAdapter(handlers),
    tile: createTileOutcomeApplyAdapter(handlers),
    formation: createFormationOutcomeApplyAdapter(handlers),
    container: createContainerOutcomeApplyAdapter(handlers),
  };
}

/**
 * 玩家目标适配器。
 * 处理：反击目标设置 → 伤害应用 → buff 应用 → 活动记录 → 自动反击 → 击败处理。
 */
export function createPlayerOutcomeApplyAdapter(handlers: OutcomeHandlers = {}) {
  return ({ outcome, target, result, application, deps }: OutcomeApplyInput) => {
    const targetPlayerId = target?.id ?? result?.targetPlayerId ?? null;
    const damage = normalizeDamage(result);
    // 设置反击目标
    if (targetPlayerId && result?.retaliatePlayerTargetId) {
      let applied = handlers.setRetaliatePlayerTarget?.({ playerId: targetPlayerId, targetPlayerId: result.retaliatePlayerTargetId, outcome, result, application, deps });
      if (applied === null || applied === undefined) {
        applied = deps?.playerRuntimeService?.setRetaliatePlayerTarget?.(targetPlayerId, result.retaliatePlayerTargetId, deps?.currentTick ?? deps?.tick ?? 0);
      }
    }
    // 应用伤害
    let appliedDamageResult = 0;
    if (targetPlayerId && damage > 0) {
      appliedDamageResult = handlers.applyPlayerDamage?.({ playerId: targetPlayerId, damage, outcome, result, application, deps });
      if (appliedDamageResult === null || appliedDamageResult === undefined) {
        appliedDamageResult = deps?.playerRuntimeService?.applyDamage?.(targetPlayerId, damage, outcome?.actor?.id);
      }
      if (appliedDamageResult === null || appliedDamageResult === undefined) {
        appliedDamageResult = deps?.applyPlayerDamage?.(targetPlayerId, damage, outcome, result);
      }
    }
    const appliedDamage = damage > 0
      ? normalizeAppliedDamage(appliedDamageResult, damage)
      : 0;
    // 应用 buff
    if (targetPlayerId && result?.buff) {
      let applied = handlers.applyPlayerBuff?.({ playerId: targetPlayerId, buff: result.buff, outcome, result, application, deps });
      if (applied === null || applied === undefined) {
        applied = deps?.playerRuntimeService?.applyTemporaryBuff?.(targetPlayerId, result.buff);
      }
    }
    // 记录活动（打断修炼等）
    if (targetPlayerId && result?.recordActivity !== false) {
      let applied = handlers.recordPlayerActivity?.({ playerId: targetPlayerId, outcome, result, application, deps });
      if (applied === null || applied === undefined) {
        applied = deps?.playerRuntimeService?.recordActivity?.(targetPlayerId, deps?.currentTick, { interruptCultivation: true, reason: 'attack' });
      }
    }
    // 激活自动反击
    if (targetPlayerId && result?.autoRetaliate === true) {
      let applied = handlers.activateAutoRetaliate?.({ playerId: targetPlayerId, outcome, result, application, deps });
      if (applied === null || applied === undefined) {
        applied = deps?.playerRuntimeService?.activateAutoRetaliate?.(targetPlayerId, deps?.currentTick);
      }
      deps?.worldRuntimeNavigationService?.clearNavigationIntent?.(targetPlayerId);
    }
    // 击败处理
    let handledDefeat = false;
    if (targetPlayerId && result?.defeated === true && result?.applyDefeat !== false) {
      let defeatResult = handlers.handlePlayerDefeat?.({ playerId: targetPlayerId, attackerId: outcome?.actor?.id, outcome, result, application, deps });
      if (defeatResult === null || defeatResult === undefined) {
        defeatResult = deps?.handlePlayerDefeat?.(targetPlayerId, result.attackerPlayerId ?? outcome?.actor?.id);
      }
      handledDefeat = defeatResult !== null && defeatResult !== undefined;
    }
    return {
      ok: true,
      targetKind: target?.kind ?? CombatTargetKind.Player,
      targetPlayerId,
      appliedDamage,
      handledDefeat,
      dirtyDomains: application?.dirtyDomains ?? [],
    };
  };
}

/**
 * 怪物目标适配器。
 * 处理：伤害应用 → buff 应用 → 击杀处理（掉落、经验等）。
 */
export function createMonsterOutcomeApplyAdapter(handlers: OutcomeHandlers = {}) {
  return ({ outcome, target, result, application, deps }: OutcomeApplyInput) => {
    const targetMonsterId = target?.id ?? result?.targetMonsterId ?? null;
    const damage = normalizeDamage(result);
    const instance = resolveInstance(deps, outcome?.instanceId);
    // 应用伤害到怪物
    let applied = null;
    if (targetMonsterId && damage >= 0) {
      applied = handlers.applyMonsterDamage?.({ runtimeId: targetMonsterId, damage, attackerId: outcome?.actor?.id, outcome, result, application, deps, instance });
      if (applied === null || applied === undefined) {
        applied = instance?.applyDamageToMonster?.(targetMonsterId, damage, outcome?.actor?.id);
      }
    }
    // 应用 buff 到怪物
    if (targetMonsterId && result?.buff) {
      let buffApplied = handlers.applyMonsterBuff?.({ runtimeId: targetMonsterId, buff: result.buff, outcome, result, application, deps, instance });
      if (buffApplied === null || buffApplied === undefined) {
        buffApplied = instance?.applyTemporaryBuffToMonster?.(targetMonsterId, result.buff);
      }
    }
    // 击杀处理
    const defeated = result?.defeated === true || applied?.defeated === true;
    if (targetMonsterId && defeated) {
      let defeatHandled = handlers.handleMonsterDefeat?.({ runtimeId: targetMonsterId, attackerId: outcome?.actor?.id, outcome, result, application, deps, instance, applied });
      if (defeatHandled === null || defeatHandled === undefined) {
        defeatHandled = deps?.handlePlayerMonsterKill?.(instance, applied?.monster, outcome?.actor?.id);
      }
    }
    return {
      ok: true,
      targetKind: CombatTargetKind.Monster,
      targetMonsterId,
      monster: applied?.monster ?? null,
      appliedDamage: normalizeAppliedDamage(applied?.appliedDamage, damage),
      defeated,
      hp: applied?.monster?.hp ?? null,
      maxHp: applied?.monster?.maxHp ?? null,
      dirtyDomains: application?.dirtyDomains ?? [],
    };
  };
}

/**
 * 地块目标适配器。
 * 处理：地块伤害 → 地块摧毁后的宗门扩展等后续逻辑。
 */
export function createTileOutcomeApplyAdapter(handlers: OutcomeHandlers = {}) {
  return ({ outcome, target, result, application, deps }: OutcomeApplyInput) => {
    const x = normalizeCoordinate(target?.x ?? result?.targetX);
    const y = normalizeCoordinate(target?.y ?? result?.targetY);
    const damage = normalizeDamage(result);
    const instance = resolveInstance(deps, outcome?.instanceId);
    const applied = x !== null && y !== null && damage > 0
      ? callFirstDefined([
        () => handlers.applyTileDamage?.({ x, y, damage, outcome, result, application, deps, instance }),
        () => instance?.damageTile?.(x, y, damage, { dropRateBonus: result?.tileDropRateBonus }),
      ])
      : null;
    // 地块摧毁后触发宗门领地扩展
    if (applied?.destroyed === true) {
      callFirstDefined([
        () => handlers.handleTileDestroyed?.({ x, y, outcome, result, application, deps, instance, applied }),
        () => deps?.worldRuntimeSectService?.expandSectForDestroyedTile?.(outcome?.instanceId, x, y, deps),
      ]);
    }
    return {
      ok: true,
      targetKind: CombatTargetKind.Tile,
      x,
      y,
      appliedDamage: normalizeAppliedDamage(applied?.appliedDamage, damage),
      destroyed: applied?.destroyed === true || result?.destroyed === true,
      hp: applied?.hp ?? null,
      maxHp: applied?.maxHp ?? null,
      tileDrops: Array.isArray(applied?.tileDrops) ? applied.tileDrops : [],
      dirtyDomains: application?.dirtyDomains ?? [],
    };
  };
}

/**
 * 阵法目标适配器。
 * 支持阵法本体伤害和阵法边界屏障伤害两种模式。
 */
export function createFormationOutcomeApplyAdapter(handlers: OutcomeHandlers = {}) {
  return ({ outcome, target, result, application, deps }: OutcomeApplyInput) => {
    const targetId = target?.id ?? result?.targetId ?? null;
    const x = normalizeCoordinate(target?.x ?? result?.targetX);
    const y = normalizeCoordinate(target?.y ?? result?.targetY);
    const damage = normalizeDamage(result);
    const formationService = deps?.worldRuntimeFormationService;
    // 区分阵法边界伤害和阵法本体伤害
    const applied = damage > 0
      ? (result?.targetType === 'formation_boundary' || result?.formationBoundary === true
        ? callFirstDefined([
          () => handlers.applyFormationBoundaryDamage?.({ formationId: targetId, x, y, damage, outcome, result, application, deps }),
          () => formationService?.applyDamageToBoundaryBarrier?.(outcome?.instanceId, x, y, damage, outcome?.actor?.id, deps),
        ])
        : callFirstDefined([
          () => handlers.applyFormationDamage?.({ formationId: targetId, damage, outcome, result, application, deps }),
          () => formationService?.applyDamageToFormation?.(outcome?.instanceId, targetId, damage, outcome?.actor?.id, deps),
        ]))
      : null;
    return {
      ok: true,
      targetKind: CombatTargetKind.Formation,
      targetId,
      x,
      y,
      appliedDamage: normalizeAppliedDamage(applied?.appliedDamage, damage),
      auraDamage: normalizeNumber(applied?.auraDamage ?? result?.auraDamage),
      dirtyDomains: application?.dirtyDomains ?? [],
    };
  };
}

/**
 * 容器目标适配器（可攻击容器、草药等）。
 * 处理：容器伤害 → 消耗/耗尽判定 → 重生倒计时。
 */
export function createContainerOutcomeApplyAdapter(handlers: OutcomeHandlers = {}) {
  return ({ outcome, target, result, application, deps }: OutcomeApplyInput) => {
    const targetId = target?.id ?? result?.targetId ?? null;
    const x = normalizeCoordinate(target?.x ?? result?.targetX);
    const y = normalizeCoordinate(target?.y ?? result?.targetY);
    const damage = normalizeDamage(result);
    const instance = resolveInstance(deps, outcome?.instanceId);
    const container = result?.container ?? target?.runtime ?? (x !== null && y !== null ? instance?.getContainerAtTile?.(x, y) : null);
    const currentTick = Number.isFinite(Number(instance?.tick))
      ? Math.max(0, Math.trunc(Number(instance.tick) || 0))
      : result?.currentTick ?? deps?.currentTick ?? deps?.tick ?? 0;
    const applied = callFirstDefined([
      () => handlers.applyContainerDamage?.({ targetId, x, y, damage, container, currentTick, outcome, result, application, deps, instance }),
      () => container ? deps?.worldRuntimeLootContainerService?.damageAttackableContainerAtTile?.(outcome?.instanceId, container, currentTick) : null,
      () => container ? deps?.worldRuntimeLootContainerService?.damageHerbContainerAtTile?.(outcome?.instanceId, container, currentTick) : null,
      () => deps?.damageContainerAtTile?.(outcome?.instanceId, x, y, damage, outcome?.actor?.id, currentTick),
    ]);
    if (!applied) {
      return {
        ok: false,
        targetKind: CombatTargetKind.Container,
        targetId,
        x,
        y,
        dirtyDomains: application?.dirtyDomains ?? [],
      };
    }
    return {
      ok: true,
      targetKind: CombatTargetKind.Container,
      targetId,
      x,
      y,
      title: applied?.title ?? result?.title ?? targetId,
      appliedDamage: normalizeAppliedDamage(applied?.appliedDamage, damage),
      remainingCount: normalizeNumber(applied?.remainingCount ?? result?.remainingCount),
      respawnRemainingTicks: applied?.respawnRemainingTicks ?? result?.respawnRemainingTicks,
      consumed: applied?.consumed === true || applied?.depleted === true || result?.consumed === true,
      dirtyDomains: application?.dirtyDomains ?? [],
    };
  };
}

// ─── 内部工具函数 ───

/** 从 deps 中解析地图实例运行时引用。 */
function resolveInstance(deps: any, instanceId: unknown) {
  if (deps?.instance) {
    return deps.instance;
  }
  if (typeof deps?.getInstanceRuntime === 'function') {
    return deps.getInstanceRuntime(instanceId);
  }
  if (typeof deps?.getInstanceRuntimeOrThrow === 'function') {
    return deps.getInstanceRuntimeOrThrow(instanceId);
  }
  return null;
}

/**
 * 依次调用回调列表，返回第一个非 null/undefined 的结果。
 * 实现 handlers → deps service → deps method 的优雅降级。
 */
function callFirstDefined(calls: Array<() => any>) {
  for (const call of calls) {
    const value = call?.();
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return null;
}

/** 从结果对象中提取伤害值（兼容多种字段名）。 */
function normalizeDamage(result: Record<string, any> = {}) {
  return Math.max(0, Math.round(Number(result.damage ?? result.totalDamage ?? result.appliedDamage) || 0));
}

/** 规范化实际应用的伤害值，无效时使用 fallback。 */
function normalizeAppliedDamage(value: unknown, fallback: number) {
  if (value !== null && value !== undefined && Number.isFinite(Number(value))) {
    return Math.max(0, Math.round(Number(value)));
  }
  return Math.max(0, Math.round(Number(fallback) || 0));
}

/** 规范化坐标值，无效返回 null。 */
function normalizeCoordinate(value: unknown) {
  const normalized = Math.trunc(Number(value));
  return Number.isFinite(normalized) ? normalized : null;
}

/** 规范化数值，无效返回 0。 */
function normalizeNumber(value: unknown) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}
