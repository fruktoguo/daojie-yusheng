interface CombatPresentationEffectSource {
  pushActionLabelEffect?: (
    instanceId: string,
    x: number,
    y: number,
    text: string,
    options?: unknown,
  ) => void;
  pushCombatEffect?: (instanceId: string, effect: unknown) => void;
  pushAttackEffect?: (
    instanceId: string,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    color?: string,
  ) => void;
  pushDamageFloatEffect?: (instanceId: string, x: number, y: number, damage: number, color?: string) => void;
  pushCombatTextFloatEffect?: (instanceId: string, x: number, y: number, text: string, color?: string) => void;
}

interface CombatPresentationDeps {
  worldRuntimeCombatEffectsService?: CombatPresentationEffectSource | null;
  pushActionLabelEffect?: CombatPresentationEffectSource['pushActionLabelEffect'];
  pushCombatEffect?: CombatPresentationEffectSource['pushCombatEffect'];
  pushAttackEffect?: CombatPresentationEffectSource['pushAttackEffect'];
  pushDamageFloatEffect?: CombatPresentationEffectSource['pushDamageFloatEffect'];
  pushCombatTextFloatEffect?: CombatPresentationEffectSource['pushCombatTextFloatEffect'];
  queuePlayerNotice?: (playerId: string, text: string, kind: string) => void;
}

interface CombatPresentationActionLabel {
  instanceId?: string | null;
  x: number;
  y: number;
  text: string;
  options?: unknown;
}

interface CombatPresentationAttack {
  instanceId?: string | null;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color?: string;
}

interface CombatPresentationCombatEffect {
  instanceId?: string | null;
  effect?: unknown;
}

interface CombatPresentationDamageFloat {
  instanceId?: string | null;
  x: number;
  y: number;
  damage: number;
  color?: string;
}

interface CombatPresentationResolutionFloat {
  instanceId?: string | null;
  x?: number;
  y?: number;
  resolution?: unknown;
  fallbackColor?: string;
}

interface CombatPresentationNotice {
  playerId?: string | null;
  text?: string;
  kind?: string;
}

interface CombatPresentationInput {
  deps?: CombatPresentationDeps;
  effectsService?: CombatPresentationEffectSource | null;
  instanceId?: string | null;
  actionLabel?: CombatPresentationActionLabel | null;
  attack?: CombatPresentationAttack | null;
  combatEffects?: unknown[];
  damageFloat?: CombatPresentationDamageFloat | null;
  resolutionFloat?: CombatPresentationResolutionFloat | null;
  notices?: CombatPresentationNotice[];
}

interface ResolvedCombatPresentationEffects {
  pushActionLabelEffect: NonNullable<CombatPresentationEffectSource['pushActionLabelEffect']> | null;
  pushCombatEffect: NonNullable<CombatPresentationEffectSource['pushCombatEffect']> | null;
  pushAttackEffect: NonNullable<CombatPresentationEffectSource['pushAttackEffect']> | null;
  pushDamageFloatEffect: NonNullable<CombatPresentationEffectSource['pushDamageFloatEffect']> | null;
  pushCombatTextFloatEffect: NonNullable<CombatPresentationEffectSource['pushCombatTextFloatEffect']> | null;
}

function resolveCombatPresentationEffects(input: CombatPresentationInput = {}): ResolvedCombatPresentationEffects {
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

function emitCombatPresentation(input: CombatPresentationInput = {}): void {
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
      const combatEffect = effect as CombatPresentationCombatEffect;
      effects.pushCombatEffect(combatEffect.instanceId ?? instanceId, combatEffect.effect ?? effect);
    }
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

function emitCombatResolutionFloat(input: CombatPresentationInput = {}): void {
  void input;
  return;
}

function emitCombatNotices(deps: CombatPresentationDeps | undefined, notices: CombatPresentationNotice[] | undefined): void {
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

export {
  emitCombatPresentation,
  emitCombatResolutionFloat,
  emitCombatNotices,
  resolveCombatPresentationEffects,
};
