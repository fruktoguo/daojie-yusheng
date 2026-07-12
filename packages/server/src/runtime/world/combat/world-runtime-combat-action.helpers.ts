/**
 * 战斗动作服务的无状态规则、结果规范化、目标索引与诊断计时辅助。
 *
 * 这些函数不持有权威世界态，不执行网络或持久化操作；调用方仍负责动作编排与副作用。
 */
import {
  resolveTargetingGeometryMaxTargets,
  resolveSkillRequiresTarget,
} from '@mud/shared';
import {
  CombatActionKind,
  CombatEffectKind,
  CombatTargetKind,
} from './combat-action.types';

type AnyRecord = Record<string, any>;

function findSkillDefinition(actor, skillId) {
  if (!actor || !skillId) {
    return null;
  }
  if (Array.isArray(actor.skills)) {
    const directSkill = actor.skills.find((skill) => skill?.id === skillId);
    if (directSkill) {
      return directSkill;
    }
  }
  const techniques = actor.techniques?.techniques ?? actor.techniques ?? [];
  if (Array.isArray(techniques)) {
    for (const technique of techniques) {
      const skill = (technique?.skills ?? []).find((entry) => entry?.id === skillId);
      if (skill) {
        return skill;
      }
    }
  }
  return null;
}

function normalizeSkillGeometry(skill: AnyRecord = {}) {
  const targeting = skill.targeting ?? {};
  const range = Math.max(0, Math.floor(Number(targeting.range ?? skill.range) || 0));
  return {
    range,
    shape: targeting.shape ?? 'single',
    radius: normalizePositiveInteger(targeting.radius),
    innerRadius: normalizePositiveInteger(targeting.innerRadius),
    width: normalizePositiveInteger(targeting.width),
    height: normalizePositiveInteger(targeting.height),
    checkerParity: targeting.checkerParity ?? null,
  };
}

function resolveSkillAllowedTargetKinds(skill: AnyRecord = {}) {
  const explicit = skill.targeting?.allowedTargetKinds ?? skill.allowedTargetKinds;
  if (Array.isArray(explicit) && explicit.length > 0) {
    return explicit.filter(Boolean);
  }
  const targetMode = skill.targetMode ?? skill.targeting?.targetMode;
  if (targetMode === 'self' || isPlayerSelfOnlySkill(skill)) {
    return [CombatTargetKind.Self];
  }
  if (targetMode === 'tile') {
    const geometry = normalizeSkillGeometry(skill);
    if ((geometry.shape ?? 'single') !== 'single') {
      return [
        CombatTargetKind.Player,
        CombatTargetKind.Monster,
        CombatTargetKind.Tile,
        CombatTargetKind.Formation,
        CombatTargetKind.Container,
      ];
    }
    return [CombatTargetKind.Tile];
  }
  if (targetMode === 'entity') {
    return [CombatTargetKind.Player, CombatTargetKind.Monster];
  }
  if (targetMode === 'any') {
    return [
      CombatTargetKind.Player,
      CombatTargetKind.Monster,
      CombatTargetKind.Tile,
      CombatTargetKind.Formation,
      CombatTargetKind.Container,
    ];
  }
  return [
    CombatTargetKind.Player,
    CombatTargetKind.Monster,
    CombatTargetKind.Tile,
    CombatTargetKind.Formation,
    CombatTargetKind.Container,
    CombatTargetKind.Self,
  ];
}

function isPlayerSelfOnlySkill(skill: AnyRecord = {}) {
  const effects = Array.isArray(skill.effects) ? skill.effects : [];
  return resolveSkillRequiresTarget(skill) === false
    && effects.length > 0
    && effects.every((effect) => effect?.type === CombatEffectKind.Buff && effect.target === 'self');
}

function isCombatSelfOnlySkill(skill: AnyRecord = {}) {
  const effects = Array.isArray(skill.effects) ? skill.effects : [];
  if (effects.length === 0) {
    return false;
  }
  return effects.every((effect) => effect?.type !== CombatEffectKind.Damage
    && (effect?.type !== CombatEffectKind.Buff || effect.target === 'self' || effect.target === 'allies'));
}

function normalizeSkillCost(skill: AnyRecord = {}) {
  if (skill.cost && typeof skill.cost === 'object') {
    return { ...skill.cost };
  }
  const qi = Number(skill.cost ?? skill.qiCost ?? 0);
  return Number.isFinite(qi) && qi > 0 ? { qi: Math.round(qi) } : null;
}

function normalizeCooldownTicks(cooldown) {
  if (cooldown && typeof cooldown === 'object') {
    return Math.max(0, Math.floor(Number(cooldown.ticks ?? cooldown.value ?? 0) || 0));
  }
  return Math.max(0, Math.floor(Number(cooldown) || 0));
}

function normalizeWindupTicks(skill: AnyRecord = {}) {
  return Math.max(0, Math.floor(Number(skill.monsterCast?.windupTicks ?? skill.cast?.windupTicks ?? skill.windupTicks ?? 0) || 0));
}

function resolveSkillMaxTargets(skill: AnyRecord = {}, geometry = normalizeSkillGeometry(skill)) {
  const configured = Number(skill.targeting?.maxTargets ?? skill.maxTargets);
  if (Number.isFinite(configured) && configured >= 0) {
    return Math.max(0, Math.floor(configured));
  }
  return resolveTargetingGeometryMaxTargets(geometry);
}

function normalizePositiveInteger(value) {
  const normalized = Math.floor(Number(value));
  return Number.isFinite(normalized) && normalized > 0 ? normalized : undefined;
}

function hasDamageResultSignal(result: AnyRecord = {}) {
  return Object.prototype.hasOwnProperty.call(result, 'damage')
    || Object.prototype.hasOwnProperty.call(result, 'totalDamage')
    || Object.prototype.hasOwnProperty.call(result, 'rawDamage')
    || Object.prototype.hasOwnProperty.call(result, 'totalRawDamage')
    || result.dodged === true
    || result.resolved === true
    || result.broken === true
    || result.crit === true;
}

function hasBuffResultSignal(result: AnyRecord = {}) {
  return result.buffApplied === true
    || result.buffRemoved === true
    || (Array.isArray(result.effects) && result.effects.some((effect) => effect?.kind === CombatEffectKind.Buff || effect?.type === CombatEffectKind.Buff));
}

function normalizeCombatResolvedEffect(effect: AnyRecord = {}) {
  if (!effect || typeof effect !== 'object') {
    return null;
  }
  const kind = effect.kind ?? effect.type ?? CombatEffectKind.Custom;
  const normalized = {
    ...effect,
    kind,
    type: effect.type ?? kind,
  };
  if (kind === CombatEffectKind.Damage || effect.type === CombatEffectKind.Damage) {
    return {
      ...normalized,
      kind: CombatEffectKind.Damage,
      type: CombatEffectKind.Damage,
      damage: Math.max(0, Math.round(Number(effect.damage ?? effect.totalDamage) || 0)),
      rawDamage: Number.isFinite(Number(effect.rawDamage ?? effect.totalRawDamage))
        ? Math.max(0, Math.round(Number(effect.rawDamage ?? effect.totalRawDamage)))
        : Math.max(0, Math.round(Number(effect.damage ?? effect.totalDamage) || 0)),
      damageKind: effect.damageKind ?? null,
      element: effect.element ?? effect.damageElement ?? null,
      dodged: effect.dodged === true,
      crit: effect.crit === true,
      resolved: effect.resolved === true,
      broken: effect.broken === true,
    };
  }
  if (kind === CombatEffectKind.Heal || effect.type === CombatEffectKind.Heal) {
    return {
      ...normalized,
      kind: CombatEffectKind.Heal,
      type: CombatEffectKind.Heal,
      amount: Math.max(0, Math.round(Number(effect.amount ?? effect.heal ?? effect.healing) || 0)),
    };
  }
  if (kind === CombatEffectKind.Buff || effect.type === CombatEffectKind.Buff) {
    return {
      ...normalized,
      kind: CombatEffectKind.Buff,
      type: CombatEffectKind.Buff,
      buffId: effect.buffId ?? null,
    };
  }
  if (kind === CombatEffectKind.Cleanse || effect.type === CombatEffectKind.Cleanse) {
    return {
      ...normalized,
      kind: CombatEffectKind.Cleanse,
      type: CombatEffectKind.Cleanse,
      count: Math.max(0, Math.round(Number(effect.count ?? effect.cleanseCount) || 0)),
    };
  }
  if (kind === CombatEffectKind.Immune || effect.type === CombatEffectKind.Immune) {
    return {
      ...normalized,
      kind: CombatEffectKind.Immune,
      type: CombatEffectKind.Immune,
      reason: effect.reason ?? null,
    };
  }
  if (kind === CombatEffectKind.Resist || effect.type === CombatEffectKind.Resist) {
    return {
      ...normalized,
      kind: CombatEffectKind.Resist,
      type: CombatEffectKind.Resist,
      reason: effect.reason ?? null,
    };
  }
  if (kind === CombatEffectKind.Block || effect.type === CombatEffectKind.Block) {
    return {
      ...normalized,
      kind: CombatEffectKind.Block,
      type: CombatEffectKind.Block,
      reason: effect.reason ?? null,
    };
  }
  return normalized;
}

function resolveCombatApplyAdapter(adapters: AnyRecord = {}, targetKind) {
  if (!adapters || typeof adapters !== 'object') {
    return null;
  }
  if (targetKind === CombatTargetKind.Player) {
    return adapters.player ?? adapters[CombatTargetKind.Player] ?? null;
  }
  if (targetKind === CombatTargetKind.Self) {
    return adapters.self ?? adapters.player ?? adapters[CombatTargetKind.Self] ?? null;
  }
  if (targetKind === CombatTargetKind.Monster) {
    return adapters.monster ?? adapters[CombatTargetKind.Monster] ?? null;
  }
  if (targetKind === CombatTargetKind.Tile) {
    return adapters.tile ?? adapters[CombatTargetKind.Tile] ?? null;
  }
  if (targetKind === CombatTargetKind.Formation) {
    return adapters.formation ?? adapters[CombatTargetKind.Formation] ?? null;
  }
  if (targetKind === CombatTargetKind.Container) {
    return adapters.container ?? adapters[CombatTargetKind.Container] ?? null;
  }
  return adapters[targetKind] ?? null;
}

function resolveOutcomeTargetCount(outcome: AnyRecord = {}) {
  const detailsCount = Number(outcome.details?.targetCount ?? outcome.details?.selectedTargetCount);
  if (Number.isFinite(detailsCount) && detailsCount >= 0) {
    return Math.floor(detailsCount);
  }
  const resultCount = Number(outcome.result?.targetCount);
  if (Number.isFinite(resultCount) && resultCount >= 0) {
    return Math.floor(resultCount);
  }
  return outcome.target ? 1 : 0;
}

function resolveCombatAuditEventAction(outcome: AnyRecord = {}, input: AnyRecord = {}) {
  if (typeof input.action === 'string' && input.action.trim().length > 0) {
    return input.action.trim();
  }
  const result = outcome.result ?? {};
  if (result.defeated === true) return 'defeat';
  if (result.destroyed === true || result.broken === true) return 'destroy';
  if (Number(result.damage ?? result.totalDamage ?? 0) > 0) return 'damage';
  if (result.dodged === true) return 'dodge';
  if (result.immune === true) return 'immune';
  return 'resolve';
}

function resolveCombatOutcomeResult(result: AnyRecord = {}) {
  if (result.dodged === true) return 'dodged';
  if (result.immune === true) return 'immune';
  if (result.resisted === true || result.resolved === true) return 'resisted';
  if (result.blocked === true) return 'blocked';
  return Number(result.damage ?? result.totalDamage ?? 0) > 0 ? 'hit' : 'no_damage';
}

function uniqueStrings(values = []) {
  const result = [];
  const seen = new Set();
  for (const value of values) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      continue;
    }
    const normalized = value.trim();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function elapsedMs(startedAt) {
  const elapsed = nowMs() - startedAt;
  return Number.isFinite(elapsed) && elapsed >= 0 ? Number(elapsed.toFixed(3)) : 0;
}

function heapUsedBytes() {
  if (typeof process === 'undefined' || typeof process.memoryUsage !== 'function') {
    return null;
  }
  const heapUsed = Number(process.memoryUsage().heapUsed);
  return Number.isFinite(heapUsed) && heapUsed >= 0 ? heapUsed : null;
}

function heapDeltaSince(startedHeapBytes) {
  const current = heapUsedBytes();
  if (!Number.isFinite(startedHeapBytes) || !Number.isFinite(current)) {
    return null;
  }
  return Math.max(0, Math.round(current - startedHeapBytes));
}

function resolvePlayerCommandTarget(input: AnyRecord = {}) {
  if (input.targetPlayerId) {
    return { kind: CombatTargetKind.Player, id: input.targetPlayerId };
  }
  if (input.targetMonsterId) {
    return { kind: CombatTargetKind.Monster, id: input.targetMonsterId };
  }
  if (input.targetFormationId) {
    return { kind: CombatTargetKind.Formation, id: input.targetFormationId };
  }
  if (input.targetContainerId) {
    return { kind: CombatTargetKind.Container, id: input.targetContainerId };
  }
  if (Number.isFinite(Number(input.targetX)) && Number.isFinite(Number(input.targetY))) {
    return {
      kind: CombatTargetKind.Tile,
      x: Math.trunc(Number(input.targetX)),
      y: Math.trunc(Number(input.targetY)),
    };
  }
  if (typeof input.targetRef === 'string' && input.targetRef.trim().length > 0) {
    const targetRef = input.targetRef.trim();
    if (targetRef === 'self') {
      return { kind: CombatTargetKind.Self };
    }
    if (targetRef.startsWith('player:')) {
      return { kind: CombatTargetKind.Player, id: targetRef.slice('player:'.length).trim() };
    }
    if (targetRef.startsWith('tile:')) {
      const [, x, y] = targetRef.split(':');
      return {
        kind: CombatTargetKind.Tile,
        x: Math.trunc(Number(x)),
        y: Math.trunc(Number(y)),
        ref: targetRef,
      };
    }
    if (targetRef.startsWith('formation:')) {
      return { kind: CombatTargetKind.Formation, id: targetRef.slice('formation:'.length).trim() };
    }
    if (targetRef.startsWith('container:')) {
      return { kind: CombatTargetKind.Container, id: targetRef.slice('container:'.length).trim() };
    }
    return { kind: CombatTargetKind.Monster, id: targetRef };
  }
  return null;
}

function resolveMonsterCombatActionKind(action: AnyRecord = {}) {
  if (action?.kind === 'skill_chant') {
    return CombatActionKind.SkillChant;
  }
  if (action?.kind === 'skill_cancel') {
    return CombatActionKind.SkillCancel;
  }
  if (action?.kind === 'skill') {
    return CombatActionKind.Skill;
  }
  return CombatActionKind.BasicAttack;
}

function normalizeCombatCell(input) {
  if (!input) {
    return null;
  }
  const x = Math.trunc(Number(input.x));
  const y = Math.trunc(Number(input.y));
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { x, y };
}

function normalizeCombatCells(input) {
  if (!Array.isArray(input)) {
    return [];
  }
  const cells = [];
  for (const cell of input) {
    const normalized = normalizeCombatCell(cell);
    if (normalized) {
      cells.push(normalized);
    }
  }
  return cells;
}

function combatChebyshevDistance(ax, ay, bx, by) {
  return Math.max(Math.abs(Math.trunc(Number(ax)) - Math.trunc(Number(bx))), Math.abs(Math.trunc(Number(ay)) - Math.trunc(Number(by))));
}

function buildCombatTargetKey(target: AnyRecord = {}) {
  if (target.kind === CombatTargetKind.Player || target.kind === CombatTargetKind.Monster || target.kind === CombatTargetKind.Container) {
    return `${target.kind}:${target.id ?? ''}`;
  }
  if (target.kind === CombatTargetKind.Formation) {
    return `${target.kind}:${target.id ?? ''}:${target.source ?? ''}:${target.x ?? ''}:${target.y ?? ''}`;
  }
  if (target.kind === CombatTargetKind.Self) {
    return `${target.kind}:${target.id ?? ''}`;
  }
  return `${target.kind ?? 'target'}:${target.x ?? ''}:${target.y ?? ''}`;
}

function buildCombatTileKey(x, y) {
  return `${Math.trunc(Number(x))}:${Math.trunc(Number(y))}`;
}

function indexLiveMonstersByTile(monsters) {
  const index = new Map();
  if (!Array.isArray(monsters)) {
    return index;
  }
  for (const monster of monsters) {
    if (!monster?.runtimeId || monster.alive === false) {
      continue;
    }
    const key = buildCombatTileKey(monster.x, monster.y);
    if (!index.has(key)) {
      index.set(key, monster);
    }
  }
  return index;
}

function indexRuntimeFormationsByTile(formations) {
  const index = new Map();
  if (!Array.isArray(formations)) {
    return index;
  }
  for (const formation of formations) {
    if (!formation?.id || Number(formation?.remainingAuraBudget) <= 0) {
      continue;
    }
    const key = buildCombatTileKey(formation.x, formation.y);
    if (!index.has(key)) {
      index.set(key, formation);
    }
  }
  return index;
}

function isPlayerLocatedInCombatActionInstance(deps, instance, playerId, instanceId) {
  if (typeof instance?.getPlayerPosition === 'function' && instance.getPlayerPosition(playerId)) {
    return true;
  }
  const location = typeof deps?.getPlayerLocation === 'function'
    ? deps.getPlayerLocation(playerId)
    : null;
  return Boolean(location && location.instanceId === instanceId);
}

function resolveMonsterSkillMaxTargets(skill) {
  const configured = Number(skill?.targeting?.maxTargets);
  if (Number.isFinite(configured) && configured >= 0) {
    return Math.max(0, Math.floor(configured));
  }
  return resolveTargetingGeometryMaxTargets({
    range: Math.max(0, Math.floor(Number(skill?.targeting?.range ?? skill?.range) || 0)),
    shape: skill?.targeting?.shape ?? 'single',
    radius: skill?.targeting?.radius,
    innerRadius: skill?.targeting?.innerRadius,
    width: skill?.targeting?.width,
    height: skill?.targeting?.height,
    checkerParity: skill?.targeting?.checkerParity,
  });
}

export {
  buildCombatTargetKey,
  buildCombatTileKey,
  combatChebyshevDistance,
  elapsedMs,
  findSkillDefinition,
  hasBuffResultSignal,
  hasDamageResultSignal,
  heapDeltaSince,
  heapUsedBytes,
  indexLiveMonstersByTile,
  indexRuntimeFormationsByTile,
  isCombatSelfOnlySkill,
  isPlayerLocatedInCombatActionInstance,
  isPlayerSelfOnlySkill,
  normalizeCombatCell,
  normalizeCombatCells,
  normalizeCombatResolvedEffect,
  normalizeCooldownTicks,
  normalizeSkillCost,
  normalizeSkillGeometry,
  normalizeWindupTicks,
  nowMs,
  resolveCombatApplyAdapter,
  resolveCombatAuditEventAction,
  resolveCombatOutcomeResult,
  resolveMonsterCombatActionKind,
  resolveMonsterSkillMaxTargets,
  resolveOutcomeTargetCount,
  resolvePlayerCommandTarget,
  resolveSkillAllowedTargetKinds,
  resolveSkillMaxTargets,
  uniqueStrings,
};
