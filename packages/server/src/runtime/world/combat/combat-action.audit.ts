/**
 * 本文件属于服务端战斗运行时，负责战斗指令、结算辅助、表现投影或掉落处理。
 *
 * 从 world-runtime-combat-action.service.ts 抽取的战斗审计事件与性能记录相关方法（模式 B 委托）。
 * 维护时要保证结算仍由服务端权威执行，客户端只接收结构化结果和必要表现字段。
 */
import type { WorldRuntimeCombatActionService } from './world-runtime-combat-action.service';
import { CombatRejectReason, createCombatRejectOutcome, createCombatSuccessOutcome } from './combat-action.types';
import { resolveCombatAuditEventAction } from './world-runtime-combat-action.helpers';
import { recordBoundedCombatRing, listBoundedCombatRing } from '../../combat/combat-runtime-event-ring.helpers';
import { aggregateCombatDiagnostics, buildCombatAuditHeatmap, queryMonsterSkillFailureReasons, queryRecentCombatAuditEvents } from '../../combat/combat-event-query';

type AnyRecord = Record<string, any>;


export function recordRejectImpl(self: WorldRuntimeCombatActionService, deps, input = {}, options = undefined) {
    const outcome = createCombatRejectOutcome(input);
    if (typeof deps?.recordCombatDiagnostic === 'function') {
      deps.recordCombatDiagnostic(outcome);
    }
    else if (Array.isArray(deps?.combatDiagnostics)) {
      deps.combatDiagnostics.push(outcome);
    }
    const shouldLog = options?.log !== false;
    if (shouldLog) {
      const logger = deps?.logger ?? self.logger;
      const message = self.formatRejectLog(outcome);
      if (options?.severity === 'error') {
        logger.error?.(message);
      }
      else if (options?.severity === 'warn') {
        logger.warn?.(message);
      }
      else if (options?.severity === 'info') {
        logger.log?.(message);
      }
      else {
        logger.debug?.(message);
      }
    }
    self.recordCombatEvents(deps, outcome, options);
    return outcome;
}

export function recordOutcomeImpl(self: WorldRuntimeCombatActionService, deps, input: AnyRecord = {}, options = undefined) {
    const normalizedResult = self.normalizeCombatOutcomeResult(input.result ?? {}, input);
    const outcome = createCombatSuccessOutcome({
      ...input,
      result: normalizedResult,
      application: input.application ?? self.createCombatResultApplication({
        ...input,
        result: normalizedResult,
      }),
    });
    if (typeof deps?.recordCombatOutcome === 'function') {
      deps.recordCombatOutcome(outcome);
    }
    else if (Array.isArray(deps?.combatOutcomes)) {
      deps.combatOutcomes.push(outcome);
    }
    else if (typeof deps?.recordCombatDiagnostic === 'function') {
      deps.recordCombatDiagnostic(outcome);
    }
    else if (Array.isArray(deps?.combatDiagnostics)) {
      deps.combatDiagnostics.push(outcome);
    }
    if (options?.log === true) {
      const logger = deps?.logger ?? self.logger;
      const message = self.formatOutcomeLog(outcome);
      if (typeof logger.debug === 'function') {
        logger.debug(message);
      }
      else {
        logger.log?.(message);
      }
    }
    self.recordCombatEvents(deps, outcome, options);
    return outcome;
}

export function recordCombatEventsImpl(self: WorldRuntimeCombatActionService, deps, outcome, options = undefined) {
    const shouldBuildEvents = options?.buildEvents !== false
      || typeof deps?.recordCombatEvents === 'function'
      || Array.isArray(deps?.combatEvents);
    if (!shouldBuildEvents) {
      return null;
    }
    const events = self.buildCombatEvents(outcome, options?.eventContext ?? options ?? {});
    self.recordInternalCombatEvents(events);
    self.enqueueCombatAuditEvent(events?.auditEvent);
    if (typeof deps?.recordCombatEvents === 'function') {
      deps.recordCombatEvents(events, outcome);
    }
    else if (Array.isArray(deps?.combatEvents)) {
      deps.combatEvents.push(events);
    }
    return events;
}

export function recordInternalCombatEventsImpl(self: WorldRuntimeCombatActionService, events) {
    recordBoundedCombatRing(self.combatEvents, events, 200);
}

export function enqueueCombatAuditEventImpl(self: WorldRuntimeCombatActionService, auditEvent) {
    return false;
}

export function listCombatEventsImpl(self: WorldRuntimeCombatActionService, limit = 50) {
    return listBoundedCombatRing(self.combatEvents, limit, 200);
}

export function queryRecentCombatAuditEventsImpl(self: WorldRuntimeCombatActionService, options = {}) {
    return queryRecentCombatAuditEvents(self.combatEvents, options);
}

export function aggregateCombatDiagnosticsImpl(self: WorldRuntimeCombatActionService, options = {}) {
    return aggregateCombatDiagnostics(self.combatEvents, options);
}

export function queryMonsterSkillFailureReasonsImpl(self: WorldRuntimeCombatActionService, options = {}) {
    return queryMonsterSkillFailureReasons(self.combatEvents, options);
}

export function buildCombatAuditHeatmapImpl(self: WorldRuntimeCombatActionService, options = {}) {
    return buildCombatAuditHeatmap(self.combatEvents, options);
}

export function buildCombatAuditEventImpl(self: WorldRuntimeCombatActionService, outcome, input: AnyRecord = {}) {
    return {
      type: 'combat_audit',
      action: resolveCombatAuditEventAction(outcome, input),
      instanceId: outcome.instanceId ?? null,
      phase: outcome.phase ?? null,
      actor: outcome.actor ?? null,
      actionId: outcome.actionId ?? null,
      target: outcome.target ?? null,
      result: outcome.result ?? {},
      application: outcome.application ?? null,
      createdAt: outcome.createdAt ?? new Date().toISOString(),
      tags: Array.isArray(input.tags) ? [...input.tags] : [],
    };
}

export function buildCombatDiagnosticEventImpl(self: WorldRuntimeCombatActionService, outcome, input: AnyRecord = {}) {
    return {
      type: 'combat_diagnostic',
      instanceId: outcome?.instanceId ?? null,
      phase: outcome?.phase ?? null,
      actor: outcome?.actor ?? null,
      actionId: outcome?.actionId ?? null,
      target: outcome?.target ?? null,
      reason: outcome?.reason ?? CombatRejectReason.Unknown,
      details: outcome?.details ?? {},
      createdAt: outcome?.createdAt ?? new Date().toISOString(),
      severity: input.severity ?? 'debug',
    };
}

export function beginCombatOutcomePerf(deps: AnyRecord | null | undefined): number | null {
  return typeof deps?.recordPendingCommandSectionDuration === 'function'
    ? performance.now()
    : null;
}

export function recordCombatOutcomePerf(
  deps: AnyRecord | null | undefined,
  key: string,
  startedAt: number | null,
): void {
  if (startedAt === null) {
    return;
  }
  const recorder = deps?.recordPendingCommandSectionDuration;
  if (typeof recorder !== 'function') {
    return;
  }
  const durationMs = performance.now() - startedAt;
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return;
  }
  try {
    recorder(key, durationMs, 1);
  }
  catch {
    // 性能统计失败不能影响权威战斗结算。
  }
}
