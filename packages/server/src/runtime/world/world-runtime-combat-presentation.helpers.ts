// @ts-nocheck

const world_runtime_observation_helpers_1 = require("./world-runtime.observation.helpers");
const {
  formatCombatResolutionFloatText,
  getCombatResolutionFloatColor,
} = world_runtime_observation_helpers_1;

function resolveCombatPresentationEffects(input = {}) {
  const deps = input.deps ?? {};
  const effects = input.effectsService ?? deps.worldRuntimeCombatEffectsService ?? deps;
  return {
    pushActionLabelEffect: typeof effects?.pushActionLabelEffect === 'function'
      ? effects.pushActionLabelEffect.bind(effects)
      : typeof deps.pushActionLabelEffect === 'function'
        ? deps.pushActionLabelEffect.bind(deps)
        : null,
    pushCombatEffect: typeof effects?.pushCombatEffect === 'function'
      ? effects.pushCombatEffect.bind(effects)
      : typeof deps.pushCombatEffect === 'function'
        ? deps.pushCombatEffect.bind(deps)
        : null,
    pushAttackEffect: typeof effects?.pushAttackEffect === 'function'
      ? effects.pushAttackEffect.bind(effects)
      : typeof deps.pushAttackEffect === 'function'
        ? deps.pushAttackEffect.bind(deps)
        : null,
    pushDamageFloatEffect: typeof effects?.pushDamageFloatEffect === 'function'
      ? effects.pushDamageFloatEffect.bind(effects)
      : typeof deps.pushDamageFloatEffect === 'function'
        ? deps.pushDamageFloatEffect.bind(deps)
        : null,
    pushCombatTextFloatEffect: typeof effects?.pushCombatTextFloatEffect === 'function'
      ? effects.pushCombatTextFloatEffect.bind(effects)
      : typeof deps.pushCombatTextFloatEffect === 'function'
        ? deps.pushCombatTextFloatEffect.bind(deps)
        : null,
  };
}

function emitCombatPresentation(input = {}) {
  const deps = input.deps ?? {};
  const effects = resolveCombatPresentationEffects(input);
  const instanceId = input.instanceId ?? input.attack?.instanceId ?? input.actionLabel?.instanceId ?? input.damageFloat?.instanceId ?? input.resolutionFloat?.instanceId;
  if (!instanceId) {
    emitCombatNotices(deps, input.notices);
    return;
  }

  const actionLabel = input.actionLabel;
  if (actionLabel && effects.pushActionLabelEffect) {
    effects.pushActionLabelEffect(
      actionLabel.instanceId ?? instanceId,
      actionLabel.x,
      actionLabel.y,
      actionLabel.text,
      actionLabel.options,
    );
  }

  const attack = input.attack;
  if (attack && effects.pushAttackEffect) {
    effects.pushAttackEffect(
      attack.instanceId ?? instanceId,
      attack.fromX,
      attack.fromY,
      attack.toX,
      attack.toY,
      attack.color,
    );
  }

  const combatEffects = Array.isArray(input.combatEffects) ? input.combatEffects : [];
  if (effects.pushCombatEffect) {
    for (const effect of combatEffects) {
      if (!effect || typeof effect !== 'object') {
        continue;
      }
      effects.pushCombatEffect(effect.instanceId ?? instanceId, effect.effect ?? effect);
    }
  }

  const resolutionFloat = input.resolutionFloat;
  if (resolutionFloat) {
    emitCombatResolutionFloat({
      ...resolutionFloat,
      instanceId: resolutionFloat.instanceId ?? instanceId,
      effects,
    });
  }

  const damageFloat = input.damageFloat;
  const damage = Math.max(0, Math.round(Number(damageFloat?.damage ?? 0) || 0));
  if (damageFloat && damage > 0 && effects.pushDamageFloatEffect) {
    effects.pushDamageFloatEffect(
      damageFloat.instanceId ?? instanceId,
      damageFloat.x,
      damageFloat.y,
      damage,
      damageFloat.color,
    );
  }

  emitCombatNotices(deps, input.notices);
}

function emitCombatResolutionFloat(input = {}) {
  const resolution = input.resolution ?? {};
  const text = typeof input.text === 'string' && input.text.trim().length > 0
    ? input.text.trim()
    : formatCombatResolutionFloatText(resolution);
  if (!text) {
    return;
  }
  const color = input.color ?? getCombatResolutionFloatColor(resolution, input.fallbackColor);
  const durationMs = input.durationMs ?? 920;
  if (typeof input.effects?.pushCombatTextFloatEffect === 'function') {
    input.effects.pushCombatTextFloatEffect(input.instanceId, input.x, input.y, text, color, durationMs);
    return;
  }
  if (typeof input.effects?.pushActionLabelEffect === 'function') {
    input.effects.pushActionLabelEffect(input.instanceId, input.x, input.y, text, { durationMs });
  }
}

function emitCombatNotices(deps, notices) {
  if (typeof deps?.queuePlayerNotice !== 'function' || !Array.isArray(notices)) {
    return;
  }
  for (const notice of notices) {
    if (!notice?.playerId || typeof notice.text !== 'string' || notice.text.length <= 0) {
      continue;
    }
    deps.queuePlayerNotice(notice.playerId, notice.text, notice.kind ?? 'combat');
  }
}

module.exports = {
  emitCombatPresentation,
  emitCombatResolutionFloat,
  emitCombatNotices,
  resolveCombatPresentationEffects,
};

export {
  emitCombatPresentation,
  emitCombatResolutionFloat,
  emitCombatNotices,
  resolveCombatPresentationEffects,
};
