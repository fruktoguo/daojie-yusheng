/**
 * 本文件属于世界运行时战斗边界，负责战斗指令、表现投影或掉落辅助逻辑。
 *
 * 维护时要保证结算仍由服务端权威执行，客户端只接收结构化结果和必要的表现字段。
 */
export const CombatActorKind = Object.freeze({
  Player: 'player',
  Monster: 'monster',
  System: 'system',
});

export const CombatActionKind = Object.freeze({
  BasicAttack: 'basic_attack',
  Skill: 'skill',
  SkillChant: 'skill_chant',
  SkillCancel: 'skill_cancel',
});

export const CombatActionPhase = Object.freeze({
  Instant: 'instant',
  ChantStart: 'chant_start',
  ChantResolve: 'chant_resolve',
  Cancel: 'cancel',
});

export const CombatActionSource = Object.freeze({
  PlayerInput: 'player_input',
  AutoBattle: 'auto_battle',
  MonsterAi: 'monster_ai',
  System: 'system',
});

export const CombatEffectKind = Object.freeze({
  Damage: 'damage',
  Buff: 'buff',
  Heal: 'heal',
  Cleanse: 'cleanse',
  Immune: 'immune',
  Resist: 'resist',
  Block: 'block',
  Custom: 'custom',
});

export const CombatTargetKind = Object.freeze({
  Player: 'player',
  Monster: 'monster',
  Tile: 'tile',
  Formation: 'formation',
  Container: 'container',
  Self: 'self',
  Empty: 'empty',
});

export const CombatRejectReason = Object.freeze({
  MissingActionId: 'missing_action_id',
  MissingSkillId: 'missing_skill_id',
  MissingInstance: 'missing_instance',
  MissingMonster: 'missing_monster',
  MissingTarget: 'missing_target',
  NoTargets: 'no_targets',
  MonsterDead: 'monster_dead',
  MissingSkill: 'missing_skill',
  MissingTargetLocation: 'missing_target_location',
  MissingTargetRuntimeState: 'missing_target_runtime_state',
  TargetLocationMismatch: 'target_location_mismatch',
  OutOfRange: 'out_of_range',
  MissingRuntimeTargetPosition: 'missing_runtime_target_position',
  LineOfSightBlocked: 'line_of_sight_blocked',
  NoRuntimeTargetsInWarningCells: 'no_runtime_targets_in_warning_cells',
  MissingSelfBuffTarget: 'missing_self_buff_target',
  ActorDead: 'actor_dead',
  TargetDead: 'target_dead',
  TargetInstanceMismatch: 'target_instance_mismatch',
  TargetTypeNotAllowed: 'target_type_not_allowed',
  CombatRelationNotAllowed: 'combat_relation_not_allowed',
  MapCapabilityDisabled: 'map_capability_disabled',
  InsufficientResource: 'insufficient_resource',
  CooldownNotReady: 'cooldown_not_ready',
  PendingCastCancelled: 'pending_cast_cancelled',
  PendingCastExpired: 'pending_cast_expired',
  PendingCastConfigRevisionMismatch: 'pending_cast_config_revision_mismatch',
  CastFailed: 'cast_failed',
  Unknown: 'unknown',
});

type AnyRecord = Record<string, any>;

export function createCombatAction(input: AnyRecord = {}) {
  return {
    actor: input.actor ?? null,
    actionId: input.actionId ?? null,
    kind: input.kind ?? CombatActionKind.BasicAttack,
    source: input.source ?? CombatActionSource.System,
    phase: input.phase ?? CombatActionPhase.Instant,
    instanceId: input.instanceId ?? null,
    target: input.target ?? null,
    anchor: input.anchor ?? null,
    warningCells: Array.isArray(input.warningCells)
      ? input.warningCells.map((cell) => ({ x: cell.x, y: cell.y }))
      : [],
    raw: input.raw,
  };
}

export function createCombatActionDefinition(input: AnyRecord = {}) {
  return {
    actionId: input.actionId ?? null,
    kind: input.kind ?? CombatActionKind.BasicAttack,
    actorKind: input.actorKind ?? null,
    name: input.name ?? null,
    source: input.source ?? CombatActionSource.System,
    requiresTarget: input.requiresTarget !== false,
    targetMode: input.targetMode ?? null,
    allowedTargetKinds: Array.isArray(input.allowedTargetKinds) ? [...input.allowedTargetKinds] : [],
    range: Math.max(0, Math.floor(Number(input.range) || 0)),
    geometry: {
      shape: input.geometry?.shape ?? 'single',
      radius: normalizeOptionalPositiveInteger(input.geometry?.radius),
      innerRadius: normalizeOptionalPositiveInteger(input.geometry?.innerRadius),
      width: normalizeOptionalPositiveInteger(input.geometry?.width),
      height: normalizeOptionalPositiveInteger(input.geometry?.height),
      checkerParity: input.geometry?.checkerParity ?? null,
    },
    effects: Array.isArray(input.effects) ? input.effects.map(normalizeCombatEffectDefinition) : [],
    cost: input.cost ?? null,
    cooldownTicks: Math.max(0, Math.floor(Number(input.cooldownTicks) || 0)),
    windupTicks: Math.max(0, Math.floor(Number(input.windupTicks) || 0)),
    maxTargets: Math.max(1, Math.floor(Number(input.maxTargets) || 1)),
    raw: input.raw,
  };
}

export function createCombatRejectOutcome(input: AnyRecord = {}) {
  return {
    ok: false,
    phase: input.phase ?? CombatActionPhase.Instant,
    reason: input.reason ?? CombatRejectReason.Unknown,
    actor: input.actor ?? null,
    actionId: input.actionId ?? null,
    instanceId: input.instanceId ?? null,
    target: input.target ?? null,
    details: input.details ?? {},
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

function normalizeOptionalPositiveInteger(value) {
  const normalized = Math.floor(Number(value));
  return Number.isFinite(normalized) && normalized > 0 ? normalized : undefined;
}

function normalizeCombatEffectDefinition(effect: AnyRecord = {}) {
  const type = typeof effect?.type === 'string' && effect.type.trim().length > 0
    ? effect.type.trim()
    : CombatEffectKind.Custom;
  return {
    type,
    kind: CombatEffectKind[type[0]?.toUpperCase?.() + type.slice(1)] ?? type,
    target: effect.target ?? null,
    damageKind: effect.damageKind ?? null,
    element: effect.element ?? null,
    buffId: effect.buffId ?? null,
    raw: effect,
  };
}

export function createCombatSuccessOutcome(input: AnyRecord = {}) {
  return {
    ok: true,
    phase: input.phase ?? CombatActionPhase.Instant,
    actor: input.actor ?? null,
    actionId: input.actionId ?? null,
    instanceId: input.instanceId ?? null,
    target: input.target ?? null,
    result: input.result ?? {},
    application: input.application ?? null,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}
