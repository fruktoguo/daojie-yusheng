/**
 * 装备效果服务：负责装备事件派发、条件判断、周期代价、触发 Buff 与动态装备加成同步。
 */
import { Injectable } from '@nestjs/common';
import {
  AttrBonus,
  BuffCategory,
  BuffVisibility,
  EquipmentConditionDef,
  EquipmentConditionGroup,
  EquipmentEffectDef,
  EquipmentTrigger,
  EquipmentTimedBuffEffectDef,
  EQUIP_SLOTS,
  ItemStack,
  PlayerState,
  TemporaryBuffState,
  TimePhaseId,
} from '@mud/shared';
import { AttrService } from './attr.service';
import { syncDynamicBuffPresentation } from './buff-presentation';
import { TimeService } from './time.service';
import { CULTIVATION_BUFF_ID } from '../constants/gameplay/technique';
import {
  EQUIP_DYNAMIC_SOURCE_PREFIX,
  LAST_TIME_PHASE_KEY,
  RUNTIME_STATE_KEY,
} from '../constants/gameplay/equipment';

type EquipmentDirtyFlag = 'attr';
type EquipmentEventTarget =
  | { kind: 'player'; player: PlayerState }
  | { kind: 'monster'; monster: { temporaryBuffs?: TemporaryBuffState[] } }
  | { kind: 'tile' };

export interface EquipmentEffectEvent {
  trigger: EquipmentTrigger;
  target?: EquipmentEventTarget;
  targetKind?: 'monster' | 'player' | 'tile';
}

export interface EquipmentEffectDispatchResult {
  dirty: EquipmentDirtyFlag[];
  dirtyPlayers?: string[];
}

interface EquippedEffectEntry {
  slot: ItemStack['equipSlot'];
  item: ItemStack;
  effect: EquipmentEffectDef;
}

interface EquipmentEffectRuntimeState {
  key: string;
  cooldownLeft: number;
}

type PlayerRuntimeCarrier = PlayerState & {
  [RUNTIME_STATE_KEY]?: EquipmentEffectRuntimeState[];
  [LAST_TIME_PHASE_KEY]?: TimePhaseId;
};


function normalizeBuffShortMark(raw: string | undefined, fallbackName: string): string {
  const trimmed = raw?.trim();
  if (trimmed) {
    return [...trimmed][0] ?? trimmed;
  }
  const fallback = [...fallbackName.trim()][0];
  return fallback ?? '器';
}

@Injectable()
export class EquipmentEffectService {
  constructor(
    private readonly attrService: AttrService,
    private readonly timeService: TimeService,
  ) {}

  handleEquipmentChange(
    player: PlayerState,
    change: { equipped?: ItemStack | null; unequipped?: ItemStack | null },
  ): EquipmentEffectDispatchResult {
    this.pruneRuntimeStates(player);
    const dirty = new Set<EquipmentDirtyFlag>();
    const dirtyPlayers = new Set<string>();

    if (this.refreshPassiveEffects(player)) {
      dirty.add('attr');
    }

    if (change.equipped?.effects?.length) {
      const result = this.dispatchExplicitItem(player, change.equipped, change.equipped.equipSlot, 'on_equip');
      for (const flag of result.dirty) {
        dirty.add(flag);
      }
      for (const playerId of result.dirtyPlayers ?? []) {
        dirtyPlayers.add(playerId);
      }
    }

    if (change.unequipped?.effects?.length) {
      const result = this.dispatchExplicitItem(player, change.unequipped, change.unequipped.equipSlot, 'on_unequip');
      for (const flag of result.dirty) {
        dirty.add(flag);
      }
      for (const playerId of result.dirtyPlayers ?? []) {
        dirtyPlayers.add(playerId);
      }
    }

    return {
      dirty: [...dirty],
      dirtyPlayers: dirtyPlayers.size > 0 ? [...dirtyPlayers] : undefined,
    };
  }

  dispatch(player: PlayerState, event: EquipmentEffectEvent): EquipmentEffectDispatchResult {
    const dirty = new Set<EquipmentDirtyFlag>();
    const dirtyPlayers = new Set<string>();

    if (event.trigger === 'on_tick') {
      this.tickRuntimeStates(player);
      this.pruneRuntimeStates(player);
    }

    if (this.refreshPassiveEffects(player)) {
      dirty.add('attr');
    }

    for (const entry of this.getEquippedEffects(player)) {
      if (!this.matchesTrigger(entry.effect, event.trigger)) {
        continue;
      }
      if (!this.matchesConditions(player, entry.effect.conditions, event.targetKind ?? event.target?.kind)) {
        continue;
      }

      switch (entry.effect.type) {
        case 'periodic_cost': {
          if (this.applyPeriodicCost(player, entry.effect)) {
            if (this.refreshPassiveEffects(player)) {
              dirty.add('attr');
            }
          }
          break;
        }
        case 'timed_buff': {
          const result = this.applyTimedBuff(player, entry, event);
          for (const flag of result.dirty) {
            dirty.add(flag);
          }
          for (const playerId of result.dirtyPlayers ?? []) {
            dirtyPlayers.add(playerId);
          }
          break;
        }
        case 'stat_aura':
        case 'progress_boost':
          break;
      }
    }

    return {
      dirty: [...dirty],
      dirtyPlayers: dirtyPlayers.size > 0 ? [...dirtyPlayers] : undefined,
    };
  }

  syncTimePhase(player: PlayerState, phase: TimePhaseId): EquipmentEffectDispatchResult {
    const carrier = player as PlayerRuntimeCarrier;
    const previous = carrier[LAST_TIME_PHASE_KEY];
    carrier[LAST_TIME_PHASE_KEY] = phase;
    if (!previous || previous === phase) {
      const changed = this.refreshPassiveEffects(player);
      return { dirty: changed ? ['attr'] : [] };
    }
    return this.dispatch(player, { trigger: 'on_time_segment_changed' });
  }

  private dispatchExplicitItem(
    player: PlayerState,
    item: ItemStack,
    slot: ItemStack['equipSlot'],
    trigger: 'on_equip' | 'on_unequip',
  ): EquipmentEffectDispatchResult {
    const dirty = new Set<EquipmentDirtyFlag>();
    const dirtyPlayers = new Set<string>();
    for (const effect of item.effects ?? []) {
      if (!this.matchesTrigger(effect, trigger)) {
        continue;
      }
      if (!this.matchesConditions(player, effect.conditions, undefined)) {
        continue;
      }
      if (effect.type !== 'timed_buff') {
        continue;
      }
      const result = this.applyTimedBuff(player, { slot, item, effect }, { trigger });
      for (const flag of result.dirty) {
        dirty.add(flag);
      }
      for (const playerId of result.dirtyPlayers ?? []) {
        dirtyPlayers.add(playerId);
      }
    }
    return {
      dirty: [...dirty],
      dirtyPlayers: dirtyPlayers.size > 0 ? [...dirtyPlayers] : undefined,
    };
  }

  private getEquippedEffects(player: PlayerState): EquippedEffectEntry[] {
    const entries: EquippedEffectEntry[] = [];
    for (const slot of EQUIP_SLOTS) {
      const item = player.equipment[slot];
      if (!item?.effects?.length) {
        continue;
      }
      for (const effect of item.effects) {
        entries.push({ slot, item, effect });
      }
    }
    return entries;
  }

  private refreshPassiveEffects(player: PlayerState): boolean {
    const nextBonuses: AttrBonus[] = [];
    for (const entry of this.getEquippedEffects(player)) {
      const effect = entry.effect;
      if (effect.type !== 'stat_aura' && effect.type !== 'progress_boost') {
        continue;
      }
      if (!this.matchesConditions(player, effect.conditions, undefined)) {
        continue;
      }
      if (!effect.attrs && !effect.stats) {
        continue;
      }
      nextBonuses.push({
        source: this.getDynamicBonusSource(entry),
        attrs: effect.attrs ?? {},
        stats: effect.stats,
        label: `${entry.item.name}:${effect.effectId ?? 'effect'}`,
      });
    }

    const current = player.bonuses.filter((bonus) => bonus.source.startsWith(EQUIP_DYNAMIC_SOURCE_PREFIX));
    if (this.isBonusListEqual(current, nextBonuses)) {
      return false;
    }

    player.bonuses = [
      ...player.bonuses.filter((bonus) => !bonus.source.startsWith(EQUIP_DYNAMIC_SOURCE_PREFIX)),
      ...nextBonuses,
    ];
    this.attrService.recalcPlayer(player);
    return true;
  }

  private isBonusListEqual(left: AttrBonus[], right: AttrBonus[]): boolean {
    if (left.length !== right.length) {
      return false;
    }
    for (let i = 0; i < left.length; i += 1) {
      const leftEntry = left[i]!;
      const rightEntry = right[i]!;
      if (leftEntry.source !== rightEntry.source) {
        return false;
      }
      if (JSON.stringify(leftEntry.attrs ?? {}) !== JSON.stringify(rightEntry.attrs ?? {})) {
        return false;
      }
      if (JSON.stringify(leftEntry.stats ?? null) !== JSON.stringify(rightEntry.stats ?? null)) {
        return false;
      }
    }
    return true;
  }

  private matchesTrigger(effect: EquipmentEffectDef, trigger: string): boolean {
    if (effect.type === 'periodic_cost' || effect.type === 'timed_buff') {
      return effect.trigger === trigger;
    }
    return false;
  }

  private matchesConditions(
    player: PlayerState,
    group: EquipmentConditionGroup | undefined,
    targetKind: 'monster' | 'player' | 'tile' | undefined,
  ): boolean {
    if (!group || group.items.length === 0) {
      return true;
    }
    const mode = group.mode ?? 'all';
    if (mode === 'any') {
      return group.items.some((condition) => this.matchesCondition(player, condition, targetKind));
    }
    return group.items.every((condition) => this.matchesCondition(player, condition, targetKind));
  }

  private matchesCondition(
    player: PlayerState,
    condition: EquipmentConditionDef,
    targetKind: 'monster' | 'player' | 'tile' | undefined,
  ): boolean {
    switch (condition.type) {
      case 'time_segment':
        return condition.in.includes(this.timeService.buildPlayerTimeState(player).phase);
      case 'map':
        return condition.mapIds.includes(player.mapId);
      case 'hp_ratio': {
        const ratio = player.maxHp > 0 ? player.hp / player.maxHp : 0;
        return condition.op === '<=' ? ratio <= condition.value : ratio >= condition.value;
      }
      case 'qi_ratio': {
        const maxQi = Math.max(0, Math.round(player.numericStats?.maxQi ?? 0));
        const ratio = maxQi > 0 ? player.qi / maxQi : 0;
        return condition.op === '<=' ? ratio <= condition.value : ratio >= condition.value;
      }
      case 'is_cultivating':
        return this.isPlayerCultivating(player) === condition.value;
      case 'has_buff':
        return (player.temporaryBuffs ?? []).some((buff) => (
          buff.buffId === condition.buffId
          && buff.remainingTicks > 0
          && buff.stacks >= (condition.minStacks ?? 1)
        ));
      case 'target_kind':
        return targetKind ? condition.in.includes(targetKind) : false;
      default:
        return true;
    }
  }

  private isPlayerCultivating(player: PlayerState): boolean {
    return (player.temporaryBuffs ?? []).some((buff) => buff.buffId === CULTIVATION_BUFF_ID && buff.remainingTicks > 0);
  }

  private applyPeriodicCost(player: PlayerState, effect: Extract<EquipmentEffectDef, { type: 'periodic_cost' }>): boolean {
    if (player.dead) {
      return false;
    }
    const current = effect.resource === 'hp' ? player.hp : player.qi;
    if (current <= 0) {
      return false;
    }
    const numericStats = this.attrService.getPlayerNumericStats(player);
    const basis = effect.mode === 'flat'
      ? effect.value
      : effect.mode === 'max_ratio_bp'
        ? (effect.resource === 'hp' ? player.maxHp : Math.max(0, Math.round(numericStats.maxQi))) * (effect.value / 10000)
        : current * (effect.value / 10000);
    const amount = Math.max(1, Math.round(basis));
    const minRemain = effect.minRemain ?? (effect.resource === 'hp' ? 1 : 0);
    const next = Math.max(minRemain, current - amount);
    if (next === current) {
      return false;
    }
    if (effect.resource === 'hp') {
      player.hp = next;
    } else {
      player.qi = next;
    }
    return true;
  }

  private applyTimedBuff(
    player: PlayerState,
    entry: EquippedEffectEntry,
    event: Pick<EquipmentEffectEvent, 'target' | 'targetKind' | 'trigger'>,
  ): EquipmentEffectDispatchResult {
    const effect = entry.effect as EquipmentTimedBuffEffectDef;
    if (effect.chance !== undefined && effect.chance < 1 && Math.random() > effect.chance) {
      return { dirty: [] };
    }
    const runtimeState = this.getRuntimeState(player, entry);
    if (runtimeState && runtimeState.cooldownLeft > 0) {
      return { dirty: [] };
    }
    const target = effect.target === 'target' ? event.target : { kind: 'player' as const, player };
    if (!target || target.kind === 'tile') {
      return { dirty: [] };
    }

    if (effect.cooldown && effect.cooldown > 0) {
      this.setCooldown(player, entry, effect.cooldown);
    }

    if (target.kind === 'player') {
      this.applyBuffState(target.player, this.buildBuffState(entry.item, effect));
      return target.player.id === player.id
        ? { dirty: ['attr'] }
        : { dirty: [], dirtyPlayers: [target.player.id] };
    }

    this.applyBuffStateToCollection(target.monster.temporaryBuffs ??= [], this.buildBuffState(entry.item, effect));
    return { dirty: [] };
  }

  private buildBuffState(item: ItemStack, effect: EquipmentTimedBuffEffectDef): TemporaryBuffState {
    const buff = effect.buff;
    const duration = Math.max(1, buff.duration);
    return syncDynamicBuffPresentation({
      buffId: buff.buffId,
      name: buff.name,
      desc: buff.desc,
      shortMark: normalizeBuffShortMark(buff.shortMark, buff.name),
      category: buff.category ?? 'buff',
      visibility: buff.visibility ?? 'public',
      remainingTicks: duration + 1,
      duration,
      stacks: 1,
      maxStacks: Math.max(1, buff.maxStacks ?? 1),
      sourceSkillId: `equip:${item.itemId}:${effect.effectId ?? 'effect'}`,
      sourceSkillName: item.name,
      color: buff.color,
      attrs: buff.attrs,
      stats: buff.stats,
    });
  }

  private applyBuffState(player: PlayerState, nextBuff: TemporaryBuffState): void {
    player.temporaryBuffs ??= [];
    this.applyBuffStateToCollection(player.temporaryBuffs, nextBuff);
    this.attrService.recalcPlayer(player);
  }

  private applyBuffStateToCollection(targetBuffs: TemporaryBuffState[], nextBuff: TemporaryBuffState): void {
    const existing = targetBuffs.find((entry) => entry.buffId === nextBuff.buffId);
    if (existing) {
      existing.name = nextBuff.name;
      existing.desc = nextBuff.desc;
      existing.shortMark = nextBuff.shortMark;
      existing.category = nextBuff.category;
      existing.visibility = nextBuff.visibility;
      existing.remainingTicks = nextBuff.remainingTicks;
      existing.duration = nextBuff.duration;
      existing.stacks = Math.min(nextBuff.maxStacks, existing.stacks + 1);
      existing.maxStacks = nextBuff.maxStacks;
      existing.sourceSkillId = nextBuff.sourceSkillId;
      existing.sourceSkillName = nextBuff.sourceSkillName;
      existing.color = nextBuff.color;
      existing.attrs = nextBuff.attrs;
      existing.stats = nextBuff.stats;
      syncDynamicBuffPresentation(existing);
      return;
    }
    targetBuffs.push(syncDynamicBuffPresentation(nextBuff));
  }

  private tickRuntimeStates(player: PlayerState): void {
    const carrier = player as PlayerRuntimeCarrier;
    const states = carrier[RUNTIME_STATE_KEY];
    if (!states || states.length === 0) {
      return;
    }
    for (const state of states) {
      if (state.cooldownLeft > 0) {
        state.cooldownLeft -= 1;
      }
    }
    carrier[RUNTIME_STATE_KEY] = states.filter((state) => state.cooldownLeft > 0);
  }

  private pruneRuntimeStates(player: PlayerState): void {
    const carrier = player as PlayerRuntimeCarrier;
    const states = carrier[RUNTIME_STATE_KEY];
    if (!states || states.length === 0) {
      return;
    }
    const validKeys = new Set(this.getEquippedEffects(player).map((entry) => this.getRuntimeKey(entry.slot, entry.item, entry.effect.effectId)));
    carrier[RUNTIME_STATE_KEY] = states.filter((state) => validKeys.has(state.key) && state.cooldownLeft > 0);
  }

  private getRuntimeState(player: PlayerState, entry: EquippedEffectEntry): EquipmentEffectRuntimeState | undefined {
    const carrier = player as PlayerRuntimeCarrier;
    const key = this.getRuntimeKey(entry.slot, entry.item, entry.effect.effectId);
    return carrier[RUNTIME_STATE_KEY]?.find((state) => state.key === key);
  }

  private setCooldown(player: PlayerState, entry: EquippedEffectEntry, cooldown: number): void {
    const carrier = player as PlayerRuntimeCarrier;
    carrier[RUNTIME_STATE_KEY] ??= [];
    const key = this.getRuntimeKey(entry.slot, entry.item, entry.effect.effectId);
    const existing = carrier[RUNTIME_STATE_KEY]!.find((state) => state.key === key);
    if (existing) {
      existing.cooldownLeft = Math.max(existing.cooldownLeft, cooldown);
      return;
    }
    carrier[RUNTIME_STATE_KEY]!.push({ key, cooldownLeft: cooldown });
  }

  private getRuntimeKey(slot: ItemStack['equipSlot'], item: ItemStack, effectId: string | undefined): string {
    return `${slot ?? item.equipSlot ?? 'unknown'}:${item.itemId}:${effectId ?? 'effect'}`;
  }

  private getDynamicBonusSource(entry: EquippedEffectEntry): string {
    return `${EQUIP_DYNAMIC_SOURCE_PREFIX}${entry.slot}:${entry.item.itemId}:${entry.effect.effectId ?? 'effect'}`;
  }
}
