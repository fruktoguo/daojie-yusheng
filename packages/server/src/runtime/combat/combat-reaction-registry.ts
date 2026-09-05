/**
 * 权威战斗反应注册表：只承载状态生命周期反应，不承载客户端表现事件。
 * 反应按 phase 注册，调用方负责在唯一的伤害汇点派发，避免把特殊规则散落在攻击层。
 */
export type CombatReactionPhase = 'beforeDamage' | 'afterDamage' | 'afterHealthChange';

export interface CombatReactionContext<TTarget = unknown> {
 phase: CombatReactionPhase;
 targetKind: 'player' | 'monster';
 target: TTarget;
 damage: number;
 appliedDamage?: number;
 damageElement?: unknown;
 damageKind?: unknown;
 currentTick: number;
 attackerId?: string | null;
}

export interface CombatReactionResult {
 handled?: boolean;
 prevented?: boolean;
 finalHp?: number;
 changed?: boolean;
}

export interface CombatReaction<TTarget = unknown> {
 id: string;
 phase: CombatReactionPhase;
 matches: (context: CombatReactionContext<TTarget>) => boolean;
 apply: (context: CombatReactionContext<TTarget>) => CombatReactionResult | void;
}

export class CombatReactionRegistry<TTarget = unknown> {
 private readonly reactionsByPhase = new Map<CombatReactionPhase, CombatReaction<TTarget>[]>();

 register(reaction: CombatReaction<TTarget>): void {
  const reactions = this.reactionsByPhase.get(reaction.phase) ?? [];
  if (reactions.some((entry) => entry.id === reaction.id)) {
   throw new Error(`重复注册战斗反应：${reaction.id}`);
  }
  reactions.push(reaction);
  this.reactionsByPhase.set(reaction.phase, reactions);
 }

 dispatch(context: CombatReactionContext<TTarget>): CombatReactionResult {
  const reactions = this.reactionsByPhase.get(context.phase) ?? [];
  let result: CombatReactionResult = {};
  for (const reaction of reactions) {
   if (!reaction.matches(context)) continue;
   const next = reaction.apply(context);
   if (!next) continue;
   result = {
    ...result,
    ...next,
    changed: result.changed === true || next.changed === true,
   };
  }
  return result;
 }
}
