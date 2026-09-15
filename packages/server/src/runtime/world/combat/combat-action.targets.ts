/**
 * 本文件属于服务端战斗运行时，负责战斗指令、结算辅助、表现投影或掉落处理。
 *
 * 从 world-runtime-combat-action.service.ts 抽取的战斗目标收集与校验相关方法（模式 B 委托）。
 * 维护时要保证结算仍由服务端权威执行，客户端只接收结构化结果和必要表现字段。
 */
import type { WorldRuntimeCombatActionService } from './world-runtime-combat-action.service';
import { CombatActorKind, CombatRejectReason, CombatTargetKind } from './combat-action.types';
import {
  buildCombatTargetKey,
  buildCombatTileKey,
  combatChebyshevDistance,
  elapsedMs,
  indexLiveMonstersByTile,
  indexRuntimeFormationsByTile,
  normalizeCombatCell,
  normalizeCombatCells,
  nowMs,
  resolveMonsterSkillMaxTargets,
} from './world-runtime-combat-action.helpers';

type AnyRecord = Record<string, any>;


export function collectCombatTargetsImpl(self: WorldRuntimeCombatActionService, input: AnyRecord = {}) {
    const action = input.action ?? null;
    const definitionResult = input.definition
      ? { ok: true, definition: input.definition }
      : self.resolveActionDefinition(input);
    if (!action) {
      return {
        ok: false,
        targets: [],
        rejected: [{ reason: CombatRejectReason.MissingActionId, target: null }],
      };
    }
    if (!definitionResult.ok) {
      return {
        ok: false,
        targets: [],
        rejected: [{
          reason: definitionResult.reason,
          target: action.target ?? null,
          details: definitionResult.details ?? {},
        }],
      };
    }
    const definition = definitionResult.definition;
    const instance = input.instance ?? null;
    const targets = [];
    const rejected = [];
    const push = (target) => {
      if (!target || targets.length >= definition.maxTargets) {
        return;
      }
      targets.push(target);
    };
    // 统一的 relation 过滤器：收集阶段就按战斗目标规则过滤敌/友方关系，
    // 后续 validateSingleCombatTarget 不再重复做 relation 检查。
    const resolveCombatRelationFn = typeof input.resolveCombatRelation === 'function' ? input.resolveCombatRelation : null;
    const passesRelationFilter = (candidateOrTarget) => {
      if (!resolveCombatRelationFn) {
        return true;
      }
      const relation = resolveCombatRelationFn(action?.actor, candidateOrTarget);
      return relation === true
        || relation?.hostile === true
        || relation?.canAttack === true
        || relation?.relation === 'hostile';
    };
    const shouldCollectTargetsFromCells = input.collectTargetsFromCells === true || input.collectTargetsFromCells === 'prefer';

    if (Array.isArray(input.candidates) && input.candidates.length > 0) {
      for (const candidate of input.candidates) {
        if (targets.length >= definition.maxTargets) {
          break;
        }
        const resolved = self.resolveSingleCombatTarget(candidate, input, action);
        if (!resolved.ok) {
          rejected.push(resolved);
          continue;
        }
        if (!passesRelationFilter(resolved.target)) {
          rejected.push({
            ok: false,
            reason: CombatRejectReason.CombatRelationNotAllowed,
            target: resolved.target,
            details: {},
          });
          continue;
        }
        push(resolved.target);
      }
    }
    else if (!shouldCollectTargetsFromCells && action.warningCells?.length > 0
      && (typeof instance?.getPlayerRuntimeRefsAtTile === 'function' || typeof instance?.getPlayersAtTile === 'function')) {
      const seen = new Set();
      const getPlayersAtTile = typeof instance.getPlayerRuntimeRefsAtTile === 'function'
        ? instance.getPlayerRuntimeRefsAtTile.bind(instance)
        : instance.getPlayersAtTile.bind(instance);
      for (const cell of action.warningCells) {
        if (targets.length >= definition.maxTargets) {
          break;
        }
        for (const player of getPlayersAtTile(cell.x, cell.y) ?? []) {
          if (!player?.playerId || seen.has(player.playerId)) {
            continue;
          }
          const playerCandidate = {
            kind: CombatTargetKind.Player,
            id: player.playerId,
            x: cell.x,
            y: cell.y,
            source: 'warning_cell',
            runtime: player,
          };
          // AOE 类收集：relation 过滤失败静默跳过，不产生 rejected 日志。
          if (!passesRelationFilter(playerCandidate)) {
            continue;
          }
          seen.add(player.playerId);
          push(playerCandidate);
          if (targets.length >= definition.maxTargets) {
            break;
          }
        }
      }
    }
    else if (shouldCollectTargetsFromCells) {
      const cellGeometryStartedAt = typeof input.recordPlanSectionDuration === 'function' ? nowMs() : 0;
      const cellsResult = self.computeCombatTargetCells({
        ...input,
        action,
        definition,
        origin: input.actorPosition ?? input.actor ?? input.attacker ?? input.player,
        anchor: input.anchor ?? action.anchor ?? action.target,
      });
      if (cellGeometryStartedAt > 0) {
        input.recordPlanSectionDuration('cellGeometryMs', elapsedMs(cellGeometryStartedAt), 1);
      }
      if (!cellsResult.ok) {
        rejected.push({
          ok: false,
          reason: cellsResult.reason ?? CombatRejectReason.NoTargets,
          target: action.target ?? action.anchor ?? null,
          details: {
            cellCount: cellsResult.cellCount ?? cellsResult.cells?.length ?? 0,
          },
        });
      }
      else {
        const cellLookupStartedAt = typeof input.recordPlanSectionDuration === 'function' ? nowMs() : 0;
        self.collectCombatTargetsFromCells({
          ...input,
          action,
          definition,
          instance,
          cells: cellsResult.cells,
          push,
          rejected,
          targets,
        });
        if (cellLookupStartedAt > 0) {
          input.recordPlanSectionDuration('cellLookupMs', elapsedMs(cellLookupStartedAt), 1);
        }
        if (typeof input.recordPlanSectionDuration === 'function') {
          input.recordPlanSectionDuration('affectedCells', 0, cellsResult.cells.length);
        }
      }
    }
    else if (action.target && input.collectTargetsFromCells !== 'prefer') {
      const resolved = self.resolveSingleCombatTarget(action.target, input, action);
      if (!resolved.ok) {
        rejected.push(resolved);
      }
      else if (!passesRelationFilter(resolved.target)) {
        rejected.push({
          ok: false,
          reason: CombatRejectReason.CombatRelationNotAllowed,
          target: resolved.target,
          details: {},
        });
      }
      else {
        push(resolved.target);
      }
    }
    else if (action.anchor && definition.allowedTargetKinds.includes(CombatTargetKind.Tile)) {
      const resolved = self.resolveSingleCombatTarget({
        kind: CombatTargetKind.Tile,
        x: action.anchor.x,
        y: action.anchor.y,
      }, input, action);
      if (!resolved.ok) {
        rejected.push(resolved);
      }
      else if (!passesRelationFilter(resolved.target)) {
        rejected.push({
          ok: false,
          reason: CombatRejectReason.CombatRelationNotAllowed,
          target: resolved.target,
          details: {},
        });
      }
      else {
        push(resolved.target);
      }
    }

    if (definition.requiresTarget && targets.length === 0 && rejected.length === 0) {
      rejected.push({
        ok: false,
        reason: CombatRejectReason.NoTargets,
        target: action.target ?? null,
        details: {},
      });
    }
    return {
      ok: targets.length > 0 || !definition.requiresTarget,
      action,
      definition,
      targets,
      rejected,
      targetCount: targets.length,
      maxTargets: definition.maxTargets,
    };
}

export function collectCombatTargetsFromCellsImpl(self: WorldRuntimeCombatActionService, input: AnyRecord = {}) {
    const instance = input.instance ?? null;
    const cells = Array.isArray(input.cells) ? input.cells : [];
    const definition = input.definition ?? {};
    const push = typeof input.push === 'function' ? input.push : () => undefined;
    const targets = Array.isArray(input.targets) ? input.targets : [];
    const seen = new Set();
    const resolveCombatRelation = typeof input.resolveCombatRelation === 'function' ? input.resolveCombatRelation : null;
    const allowedTargetKinds = definition.allowedTargetKinds ?? [];
    const allowMonster = allowedTargetKinds.includes(CombatTargetKind.Monster);
    const allowFormation = allowedTargetKinds.includes(CombatTargetKind.Formation);
    const allowPlayer = allowedTargetKinds.includes(CombatTargetKind.Player);
    const allowContainer = allowedTargetKinds.includes(CombatTargetKind.Container);
    const allowTile = allowedTargetKinds.includes(CombatTargetKind.Tile);
    const instanceId = input.action?.instanceId ?? input.instanceId;
    const getMonsterAtTile = allowMonster && typeof instance?.getMonsterRuntimeRefAtTile === 'function'
      ? instance.getMonsterRuntimeRefAtTile.bind(instance)
      : allowMonster && typeof instance?.getMonsterAtTile === 'function'
        ? instance.getMonsterAtTile.bind(instance)
      : null;
    const monsterByTile = allowMonster && !getMonsterAtTile && typeof instance?.listMonsters === 'function'
      ? indexLiveMonstersByTile(instance.listMonsters())
      : null;
    const getFormationAtTile = allowFormation && typeof input.formationService?.getFormationAtTile === 'function'
      ? input.formationService.getFormationAtTile.bind(input.formationService)
      : null;
    const formationByTile = allowFormation && !getFormationAtTile && typeof input.formationService?.listRuntimeFormations === 'function'
      ? indexRuntimeFormationsByTile(input.formationService.listRuntimeFormations(instanceId))
      : null;
    const getBoundaryBarrierCombatState = allowFormation && typeof input.formationService?.getBoundaryBarrierCombatState === 'function'
      ? input.formationService.getBoundaryBarrierCombatState.bind(input.formationService)
      : null;
    const getCombatTargetRuntimeRefsAtTile = (allowMonster || allowPlayer || allowContainer)
      && typeof instance?.getCombatTargetRuntimeRefsAtTile === 'function'
      ? instance.getCombatTargetRuntimeRefsAtTile.bind(instance)
      : null;
    const combatTargetRuntimeRefOptions = getCombatTargetRuntimeRefsAtTile
      ? { monster: allowMonster, player: allowPlayer, container: allowContainer, tile: allowTile }
      : null;
    const getPlayersAtTile = allowPlayer && typeof instance?.getPlayerRuntimeRefsAtTile === 'function'
      && !getCombatTargetRuntimeRefsAtTile
      ? instance.getPlayerRuntimeRefsAtTile.bind(instance)
      : allowPlayer && typeof instance?.getPlayersAtTile === 'function'
        && !getCombatTargetRuntimeRefsAtTile
        ? instance.getPlayersAtTile.bind(instance)
      : null;
    const getContainerAtTile = allowContainer && typeof instance?.getContainerAtTile === 'function'
      && !getCombatTargetRuntimeRefsAtTile
      ? instance.getContainerAtTile.bind(instance)
      : null;
    const getTileCombatState = allowTile && typeof instance?.getTileCombatState === 'function'
      && !getCombatTargetRuntimeRefsAtTile
      ? instance.getTileCombatState.bind(instance)
      : null;
    const pushCandidate = (candidate) => {
      if (!candidate || targets.length >= definition.maxTargets) {
        return;
      }
      // Early filter: 在收集阶段就按战斗目标规则过滤敌/友方关系。
      // 自身是否应被收集由 resolveCombatRelation 决定（当前返回 blocked → 非 hostile 被跳过），
      // 收集逻辑本身不做身份硬编码。
      if (resolveCombatRelation) {
        const relation = resolveCombatRelation(input.action?.actor, candidate);
        const hostile = relation === true
          || relation?.hostile === true
          || relation?.canAttack === true
          || relation?.relation === 'hostile';
        if (!hostile) {
          return;
        }
      }
      const resolved = self.resolveSingleCombatTarget(candidate, input, input.action);
      if (!resolved.ok) {
        input.rejected?.push?.(resolved);
        return;
      }
      const key = buildCombatTargetKey(resolved.target);
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      push(resolved.target);
    };
    for (const cell of cells) {
      if (targets.length >= definition.maxTargets) {
        break;
      }
      const runtimeRefs = getCombatTargetRuntimeRefsAtTile
        ? getCombatTargetRuntimeRefsAtTile(cell.x, cell.y, combatTargetRuntimeRefOptions)
        : null;
      if (allowMonster) {
        const monster = getCombatTargetRuntimeRefsAtTile
          ? runtimeRefs?.monster
          : getMonsterAtTile
          ? getMonsterAtTile(cell.x, cell.y)
          : monsterByTile?.get(buildCombatTileKey(cell.x, cell.y));
        if (monster?.runtimeId) {
          pushCandidate({ kind: CombatTargetKind.Monster, id: monster.runtimeId, x: monster.x, y: monster.y, runtime: monster, source: 'affected_cell' });
        }
      }
      if (targets.length >= definition.maxTargets) {
        break;
      }
      if (allowFormation) {
        const formation = getFormationAtTile
          ? getFormationAtTile(instanceId, cell.x, cell.y)
          : formationByTile?.get(buildCombatTileKey(cell.x, cell.y));
        if (formation?.id) {
          pushCandidate({ kind: CombatTargetKind.Formation, id: formation.id, x: cell.x, y: cell.y, source: 'affected_cell' });
        }
      }
      if (targets.length >= definition.maxTargets) {
        break;
      }
      if (getBoundaryBarrierCombatState) {
        const boundary = getBoundaryBarrierCombatState(instanceId, cell.x, cell.y);
        if (boundary) {
          pushCandidate({
            kind: CombatTargetKind.Formation,
            id: boundary.formationId ?? boundary.id,
            x: cell.x,
            y: cell.y,
            runtime: boundary,
            source: 'formation_boundary',
          });
        }
      }
      if (targets.length >= definition.maxTargets) {
        break;
      }
      if (getPlayersAtTile) {
        for (const player of getPlayersAtTile(cell.x, cell.y) ?? []) {
          if (player?.playerId) {
            pushCandidate({ kind: CombatTargetKind.Player, id: player.playerId, x: cell.x, y: cell.y, runtime: player, source: 'affected_cell' });
            if (targets.length >= definition.maxTargets) {
              break;
            }
          }
        }
      }
      else if (runtimeRefs?.players) {
        for (const player of runtimeRefs.players) {
          if (player?.playerId) {
            pushCandidate({ kind: CombatTargetKind.Player, id: player.playerId, x: cell.x, y: cell.y, runtime: player, source: 'affected_cell' });
            if (targets.length >= definition.maxTargets) {
              break;
            }
          }
        }
      }
      if (targets.length >= definition.maxTargets) {
        break;
      }
      if (getContainerAtTile) {
        const container = getContainerAtTile(cell.x, cell.y);
        if (container) {
          pushCandidate({ kind: CombatTargetKind.Container, id: container.id, x: cell.x, y: cell.y, runtime: container, source: 'affected_cell' });
        }
      }
      else if (runtimeRefs?.container) {
        const container = runtimeRefs.container;
        pushCandidate({ kind: CombatTargetKind.Container, id: container.id, x: cell.x, y: cell.y, runtime: container, source: 'affected_cell' });
      }
      if (targets.length >= definition.maxTargets) {
        break;
      }
      if (allowTile) {
        const tileState = getCombatTargetRuntimeRefsAtTile
          ? runtimeRefs?.tileState
          : getTileCombatState
            ? getTileCombatState(cell.x, cell.y)
            : null;
        if (tileState && tileState.destroyed !== true) {
          pushCandidate({ kind: CombatTargetKind.Tile, x: cell.x, y: cell.y, state: tileState, source: 'affected_cell' });
        }
      }
    }
}

export function resolvePlayerBasicAttackTargetImpl(self: WorldRuntimeCombatActionService, input, attacker, instance, instanceId) {
    if (input.target) {
      return input.target;
    }
    if (input.targetMonsterId) {
      const formation = typeof input.formationService?.getFormationCombatState === 'function'
        ? input.formationService.getFormationCombatState(instanceId, input.targetMonsterId)
        : null;
      if (formation) {
        return {
          kind: CombatTargetKind.Formation,
          id: formation.id ?? input.targetMonsterId,
          x: formation.x,
          y: formation.y,
          runtime: formation,
          source: 'target_ref',
        };
      }
      return { kind: CombatTargetKind.Monster, id: input.targetMonsterId };
    }
    if (input.targetPlayerId) {
      return { kind: CombatTargetKind.Player, id: input.targetPlayerId };
    }
    if (Number.isFinite(Number(input.targetX)) && Number.isFinite(Number(input.targetY))) {
      const x = Math.trunc(Number(input.targetX));
      const y = Math.trunc(Number(input.targetY));
      if (input.targetKind === CombatTargetKind.Tile || input.targetType === CombatTargetKind.Tile) {
        return { kind: CombatTargetKind.Tile, x, y, source: 'target_ref' };
      }
      if (input.targetKind === CombatTargetKind.Container || input.targetType === CombatTargetKind.Container || input.targetContainerId) {
        const container = typeof instance?.getContainerAtTile === 'function'
          ? instance.getContainerAtTile(x, y)
          : null;
        return {
          kind: CombatTargetKind.Container,
          id: input.targetContainerId ?? container?.id ?? `container:${x}:${y}`,
          x,
          y,
          runtime: container,
          source: 'tile_container',
        };
      }
      const boundary = typeof input.formationService?.getBoundaryBarrierCombatState === 'function'
        ? input.formationService.getBoundaryBarrierCombatState(instanceId, x, y)
        : null;
      if (boundary) {
        return {
          kind: CombatTargetKind.Formation,
          id: boundary.id ?? boundary.formationId ?? `boundary:${x}:${y}`,
          x,
          y,
          runtime: boundary,
          source: 'formation_boundary',
        };
      }
      const container = typeof instance?.getContainerAtTile === 'function'
        ? instance.getContainerAtTile(x, y)
        : null;
      if (container) {
        return {
          kind: CombatTargetKind.Container,
          id: container.id,
          x,
          y,
          runtime: container,
          source: 'tile_container',
        };
      }
      return { kind: CombatTargetKind.Tile, x, y };
    }
    return null;
}

export function resolveSingleCombatTargetImpl(self: WorldRuntimeCombatActionService, target, input: AnyRecord = {}, action = null) {
    const kind = target?.kind ?? null;
    const instance = input.instance ?? null;
    if (!kind) {
      return {
        ok: false,
        reason: CombatRejectReason.MissingTarget,
        target,
        details: {},
      };
    }
    if (kind === CombatTargetKind.Self) {
      return {
        ok: true,
        target: {
          kind,
          id: action?.actor?.id ?? input.actor?.id ?? null,
          source: 'self',
        },
      };
    }
    if (kind === CombatTargetKind.Player) {
      const playerId = target.id;
      const position = typeof instance?.getPlayerPosition === 'function'
        ? instance.getPlayerPosition(playerId)
        : normalizeCombatCell(target);
      const player = input.playerRuntimeService?.getPlayer?.(playerId)
        ?? input.playersById?.get?.(playerId)
        ?? target.runtime
        ?? null;
      if (!player && !position) {
        return {
          ok: false,
          reason: CombatRejectReason.MissingTargetRuntimeState,
          target,
          details: { playerId },
        };
      }
      return {
        ok: true,
        target: {
          kind,
          id: playerId,
          x: position?.x,
          y: position?.y,
          source: target.source ?? 'target_ref',
          runtime: player,
        },
      };
    }
    if (kind === CombatTargetKind.Monster) {
      const monsterId = target.id;
      const monster = target.runtime
        ?? (typeof instance?.getMonster === 'function'
          ? instance.getMonster(monsterId)
          : input.monstersById?.get?.(monsterId) ?? null);
      if (!monster) {
        return {
          ok: false,
          reason: CombatRejectReason.MissingMonster,
          target,
          details: { monsterId },
        };
      }
      if (monster.alive === false) {
        return {
          ok: false,
          reason: CombatRejectReason.MonsterDead,
          target,
          details: { monsterId },
        };
      }
      return {
        ok: true,
        target: {
          kind,
          id: monster.runtimeId ?? monsterId,
          x: monster.x,
          y: monster.y,
          source: target.source ?? 'target_ref',
          runtime: monster,
        },
      };
    }
    if (kind === CombatTargetKind.Tile) {
      const cell = normalizeCombatCell(target);
      if (!cell) {
        return {
          ok: false,
          reason: CombatRejectReason.MissingTargetLocation,
          target,
          details: {},
        };
      }
      const state = target.state ?? (typeof instance?.getTileCombatState === 'function'
        ? instance.getTileCombatState(cell.x, cell.y)
        : null);
      return {
        ok: true,
        target: {
          kind,
          x: cell.x,
          y: cell.y,
          source: target.source ?? 'target_ref',
          state,
        },
      };
    }
    if (kind === CombatTargetKind.Formation) {
      const formationId = target.id ?? target.formationId;
      const formation = typeof input.formationService?.getFormationCombatState === 'function'
        ? input.formationService.getFormationCombatState(action?.instanceId ?? input.instanceId, formationId)
        : target.runtime ?? null;
      return {
        ok: true,
        target: {
          kind,
          id: formationId,
          x: formation?.x ?? target.x,
          y: formation?.y ?? target.y,
          source: target.source ?? 'target_ref',
          runtime: formation,
        },
      };
    }
    if (kind === CombatTargetKind.Container) {
      const containerId = target.id ?? target.containerId;
      const container = typeof instance?.getContainerState === 'function'
        ? instance.getContainerState(containerId)
        : target.runtime ?? null;
      return {
        ok: true,
        target: {
          kind,
          id: containerId,
          x: container?.x ?? target.x,
          y: container?.y ?? target.y,
          source: target.source ?? 'target_ref',
          runtime: container,
        },
      };
    }
    return {
      ok: false,
      reason: CombatRejectReason.Unknown,
      target,
      details: { kind },
    };
}

export function validateCombatTargetsImpl(self: WorldRuntimeCombatActionService, input: AnyRecord = {}) {
    const action = input.action ?? null;
    const definition = input.definition ?? self.resolveActionDefinition(input).definition ?? null;
    const actorPosition = normalizeCombatCell(input.actorPosition ?? input.actor ?? input.monster ?? input.player);
    const targets = Array.isArray(input.targets) ? input.targets : [];
    const allowed = [];
    const rejected = [];
    for (const target of targets) {
      const result = self.validateSingleCombatTarget({
        ...input,
        action,
        definition,
        actorPosition,
        target,
      });
      if (result.ok) {
        allowed.push(result.target);
      }
      else {
        rejected.push(result);
      }
    }
    return {
      ok: rejected.length === 0,
      action,
      definition,
      allowed,
      rejected,
      allowedCount: allowed.length,
      rejectedCount: rejected.length,
    };
}

export function validateSingleCombatTargetImpl(self: WorldRuntimeCombatActionService, input: AnyRecord = {}) {
    const target = input.target;
    const definition = input.definition;
    if (!target) {
      return {
        ok: false,
        reason: CombatRejectReason.MissingTarget,
        target,
        details: {},
      };
    }
    if (definition?.allowedTargetKinds?.length > 0 && !definition.allowedTargetKinds.includes(target.kind)) {
      return {
        ok: false,
        reason: CombatRejectReason.TargetTypeNotAllowed,
        target,
        details: {
          targetKind: target.kind,
          allowedTargetKinds: definition.allowedTargetKinds,
        },
      };
    }
    const actionInstanceId = input.instanceId ?? input.action?.instanceId ?? null;
    const targetInstanceId = target.instanceId ?? target.runtime?.instanceId ?? null;
    if (actionInstanceId && targetInstanceId && actionInstanceId !== targetInstanceId) {
      return {
        ok: false,
        reason: CombatRejectReason.TargetInstanceMismatch,
        target,
        details: {
          actionInstanceId,
          targetInstanceId,
        },
      };
    }
    if (target.kind === CombatTargetKind.Tile && input.canDamageTile === false) {
      return {
        ok: false,
        reason: CombatRejectReason.MapCapabilityDisabled,
        target,
        details: { capability: 'canDamageTile' },
      };
    }
    if (target.kind === CombatTargetKind.Tile && target.state?.destroyed === true) {
      return {
        ok: false,
        reason: CombatRejectReason.TargetDead,
        target,
        details: { targetType: 'tile' },
      };
    }
    if (target.kind === CombatTargetKind.Player && input.supportsPvp === false && input.action?.actor?.kind === CombatActorKind.Player) {
      return {
        ok: false,
        reason: CombatRejectReason.MapCapabilityDisabled,
        target,
        details: { capability: 'supportsPvp' },
      };
    }
    // Relation 检查作为 validateCombatTargets 独立公共 API 的契约与 defense in depth。
    // 正常流程下 collectCombatTargets 已提前过滤不符合 relation 的目标，此分支不会触发；
    // 仅在外部直接调用 validateCombatTargets 或目标绕过收集阶段时才起作用。
    if (typeof input.resolveCombatRelation === 'function') {
      const relation = input.resolveCombatRelation(input.action?.actor, target);
      const hostile = relation === true
        || relation?.hostile === true
        || relation?.canAttack === true
        || relation?.relation === 'hostile';
      if (!hostile) {
        return {
          ok: false,
          reason: CombatRejectReason.CombatRelationNotAllowed,
          target,
          details: { relation },
        };
      }
    }
    if (input.actorPosition && Number.isFinite(Number(target.x)) && Number.isFinite(Number(target.y))) {
      const distance = combatChebyshevDistance(input.actorPosition.x, input.actorPosition.y, target.x, target.y);
      const range = Math.max(0, Math.floor(Number(definition?.range) || 0));
      const isGeometryCollectedTarget = target.source === 'affected_cell' || target.source === 'warning_cell';
      const skipRangeValidation = isGeometryCollectedTarget
        || (input.skipResolvedTargetRangeValidation === true && target.source === 'legacy_targets');
      if (!skipRangeValidation && range > 0 && distance > range) {
        return {
          ok: false,
          reason: CombatRejectReason.OutOfRange,
          target,
          details: { distance, range },
        };
      }
      const canSeeTileFrom = typeof input.canSeeTileFrom === 'function'
        ? input.canSeeTileFrom
        : typeof input.instance?.canSeeTileFrom === 'function'
          ? input.instance.canSeeTileFrom.bind(input.instance)
          : null;
      if (input.requiresLineOfSight !== false && !isGeometryCollectedTarget && canSeeTileFrom) {
        const lineOfSightRange = isGeometryCollectedTarget
          ? Math.max(range, distance)
          : range;
        const visible = canSeeTileFrom(
          input.actorPosition.x,
          input.actorPosition.y,
          Number(target.x),
          Number(target.y),
          lineOfSightRange,
        );
        if (visible === false) {
          return {
            ok: false,
            reason: CombatRejectReason.LineOfSightBlocked,
            target,
            details: { distance, range, lineOfSightRange },
          };
        }
      }
    }
    return {
      ok: true,
      target,
    };
}

export function collectMonsterSkillPlayerTargetsImpl(self: WorldRuntimeCombatActionService, input: AnyRecord = {}) {
    const action = input.action ?? {};
    const instance = input.instance;
    const playerRuntimeService = input.playerRuntimeService;
    const skill = input.skill ?? {};
    const warningCells = normalizeCombatCells(action.warningCells);
    const maxTargets = resolveMonsterSkillMaxTargets(skill);
    const targets = [];
    const seenPlayerIds = new Set();
    const rejected = [];
    const pushPlayerAtPosition = (playerId, position, source) => {
      if (!playerId || seenPlayerIds.has(playerId) || targets.length >= maxTargets) {
        return;
      }
      const player = playerRuntimeService?.getPlayer?.(playerId);
      const runtimePosition = typeof instance?.getPlayerPosition === 'function'
        ? instance.getPlayerPosition(playerId)
        : null;
      const location = typeof input.deps?.getPlayerLocation === 'function'
        ? input.deps.getPlayerLocation(playerId)
        : null;
      const locatedInActionInstance = Boolean(
        runtimePosition
        || source === 'warning_cell'
        || location?.instanceId === action.instanceId
        || player?.instanceId === action.instanceId,
      );
      if (!player) {
        rejected.push({ playerId, reason: CombatRejectReason.MissingTargetRuntimeState, source });
        return;
      }
      if (player.hp <= 0) {
        rejected.push({ playerId, reason: CombatRejectReason.TargetDead, source });
        return;
      }
      if (!locatedInActionInstance) {
        rejected.push({
          playerId,
          reason: CombatRejectReason.TargetInstanceMismatch,
          source,
          playerInstanceId: player.instanceId,
          locationInstanceId: location?.instanceId,
        });
        return;
      }
      const effectivePosition = normalizeCombatCell(runtimePosition ?? position ?? location ?? player);
      if (!effectivePosition) {
        rejected.push({ playerId, reason: CombatRejectReason.MissingRuntimeTargetPosition, source });
        return;
      }
      seenPlayerIds.add(playerId);
      targets.push({
        player,
        position: effectivePosition,
        source,
      });
    };

    if (warningCells.length > 0) {
      const getPlayersAtTile = typeof instance?.getPlayerRuntimeRefsAtTile === 'function'
        ? instance.getPlayerRuntimeRefsAtTile.bind(instance)
        : typeof instance?.getPlayersAtTile === 'function'
          ? instance.getPlayersAtTile.bind(instance)
          : null;
      if (getPlayersAtTile) {
        for (const cell of warningCells) {
          if (targets.length >= maxTargets) {
            break;
          }
          for (const tilePlayer of getPlayersAtTile(cell.x, cell.y) ?? []) {
            pushPlayerAtPosition(tilePlayer?.playerId, cell, 'warning_cell');
            if (targets.length >= maxTargets) {
              break;
            }
          }
        }
      }
      const fallbackPosition = normalizeCombatCell(input.fallbackPosition);
      if (targets.length === 0
        && fallbackPosition
        && warningCells.some((cell) => cell.x === fallbackPosition.x && cell.y === fallbackPosition.y)) {
        pushPlayerAtPosition(action.targetPlayerId, fallbackPosition, 'warning_fallback');
      }
      return {
        targets,
        warningCells,
        rejected,
        maxTargets,
      };
    }

    const fallbackPosition = normalizeCombatCell(input.fallbackPosition);
    if (fallbackPosition) {
      pushPlayerAtPosition(action.targetPlayerId, fallbackPosition, 'primary_target');
    }
    return {
      targets,
      warningCells,
      rejected,
      maxTargets,
    };
}

export function resolveMonsterBasicAttackPlayerTargetImpl(self: WorldRuntimeCombatActionService, input: AnyRecord = {}) {
    const action = input.action ?? {};
    const deps = input.deps;
    const playerRuntimeService = input.playerRuntimeService;
    const location = typeof deps?.getPlayerLocation === 'function'
      ? deps.getPlayerLocation(action.targetPlayerId)
      : null;
    if (!location) {
      return {
        ok: false,
        reason: CombatRejectReason.MissingTargetLocation,
        details: {},
        severity: 'debug',
      };
    }
    const instance = typeof deps?.getInstanceRuntime === 'function'
      ? deps.getInstanceRuntime(action.instanceId)
      : null;
    if (!instance) {
      return {
        ok: false,
        reason: CombatRejectReason.MissingInstance,
        details: {},
        severity: 'warn',
      };
    }
    const monster = typeof instance.getMonster === 'function'
      ? instance.getMonster(action.runtimeId)
      : null;
    if (!monster) {
      return {
        ok: false,
        reason: CombatRejectReason.MissingMonster,
        details: {},
        severity: 'debug',
      };
    }
    if (!monster.alive) {
      return {
        ok: false,
        reason: CombatRejectReason.MonsterDead,
        details: {},
        severity: 'debug',
      };
    }
    const position = typeof instance.getPlayerPosition === 'function'
      ? instance.getPlayerPosition(action.targetPlayerId)
      : null;
    if (!position) {
      return {
        ok: false,
        reason: CombatRejectReason.MissingRuntimeTargetPosition,
        details: {},
        severity: 'debug',
      };
    }
    const player = playerRuntimeService?.getPlayer?.(action.targetPlayerId);
    if (!player || player.instanceId !== location.instanceId || player.hp <= 0) {
      return {
        ok: false,
        reason: !player
          ? CombatRejectReason.MissingTargetRuntimeState
          : player.hp <= 0
            ? CombatRejectReason.TargetDead
            : CombatRejectReason.TargetInstanceMismatch,
        details: {
          playerInstanceId: player?.instanceId,
          locationInstanceId: location.instanceId,
        },
        severity: 'debug',
      };
    }
    const normalizedPosition = normalizeCombatCell(position);
    if (!normalizedPosition) {
      return {
        ok: false,
        reason: CombatRejectReason.MissingRuntimeTargetPosition,
        details: {},
        severity: 'debug',
      };
    }
    const distance = combatChebyshevDistance(monster.x, monster.y, normalizedPosition.x, normalizedPosition.y);
    if (distance > monster.attackRange) {
      return {
        ok: false,
        reason: CombatRejectReason.OutOfRange,
        details: {
          distance,
          attackRange: monster.attackRange,
        },
        severity: 'debug',
      };
    }
    if (
      typeof instance.canSeeTileFrom === 'function'
      && instance.canSeeTileFrom(monster.x, monster.y, normalizedPosition.x, normalizedPosition.y, monster.attackRange) === false
    ) {
      return {
        ok: false,
        reason: CombatRejectReason.LineOfSightBlocked,
        details: {
          distance,
          attackRange: monster.attackRange,
        },
        severity: 'debug',
      };
    }
    return {
      ok: true,
      instance,
      monster,
      player,
      position: normalizedPosition,
      distance,
      location,
    };
}
