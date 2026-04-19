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
import { MapService } from './map.service';
import { TimeService } from './time.service';
import { CULTIVATION_BUFF_ID } from '../constants/gameplay/technique';
import {
  EQUIP_DYNAMIC_SOURCE_PREFIX,
  LAST_TIME_PHASE_KEY,
  RUNTIME_STATE_KEY,
} from '../constants/gameplay/equipment';

/** EquipmentDirtyFlag：定义该类型的结构与数据语义。 */
type EquipmentDirtyFlag = 'attr';
/** EquipmentEventTarget：定义该类型的结构与数据语义。 */
type EquipmentEventTarget =
  | { kind: 'player'; player: PlayerState }
  | { kind: 'monster'; monster: { temporaryBuffs?: TemporaryBuffState[] } }
  | { kind: 'tile' };

/** EquipmentEffectEvent：定义该接口的能力与字段约束。 */
export interface EquipmentEffectEvent {
/** trigger：定义该变量以承载业务值。 */
  trigger: EquipmentTrigger;
  target?: EquipmentEventTarget;
  targetKind?: 'monster' | 'player' | 'tile';
}

/** EquipmentEffectDispatchResult：定义该接口的能力与字段约束。 */
export interface EquipmentEffectDispatchResult {
/** dirty：定义该变量以承载业务值。 */
  dirty: EquipmentDirtyFlag[];
  dirtyPlayers?: string[];
}

/** EquippedEffectEntry：定义该接口的能力与字段约束。 */
interface EquippedEffectEntry {
/** slot：定义该变量以承载业务值。 */
  slot: ItemStack['equipSlot'];
/** item：定义该变量以承载业务值。 */
  item: ItemStack;
/** effect：定义该变量以承载业务值。 */
  effect: EquipmentEffectDef;
}

/** EquipmentEffectRuntimeState：定义该接口的能力与字段约束。 */
interface EquipmentEffectRuntimeState {
/** key：定义该变量以承载业务值。 */
  key: string;
/** cooldownLeft：定义该变量以承载业务值。 */
  cooldownLeft: number;
}

/** PlayerRuntimeCarrier：定义该类型的结构与数据语义。 */
type PlayerRuntimeCarrier = PlayerState & {
  [RUNTIME_STATE_KEY]?: EquipmentEffectRuntimeState[];
  [LAST_TIME_PHASE_KEY]?: TimePhaseId;
};


/** normalizeBuffShortMark：执行对应的业务逻辑。 */
function normalizeBuffShortMark(raw: string | undefined, fallbackName: string): string {
/** trimmed：定义该变量以承载业务值。 */
  const trimmed = raw?.trim();
  if (trimmed) {
    return [...trimmed][0] ?? trimmed;
  }
/** fallback：定义该变量以承载业务值。 */
  const fallback = [...fallbackName.trim()][0];
  return fallback ?? '器';
}

@Injectable()
/** EquipmentEffectService：封装相关状态与行为。 */
export class EquipmentEffectService {
  constructor(
    private readonly attrService: AttrService,
    private readonly mapService: MapService,
    private readonly timeService: TimeService,
  ) {}

  handleEquipmentChange(
    player: PlayerState,
/** change：定义该变量以承载业务值。 */
    change: { equipped?: ItemStack | null; unequipped?: ItemStack | null },
  ): EquipmentEffectDispatchResult {
    this.pruneRuntimeStates(player);
/** dirty：定义该变量以承载业务值。 */
    const dirty = new Set<EquipmentDirtyFlag>();
/** dirtyPlayers：定义该变量以承载业务值。 */
    const dirtyPlayers = new Set<string>();

    if (this.refreshPassiveEffects(player)) {
      dirty.add('attr');
    }

    if (change.equipped?.effects?.length) {
/** result：定义该变量以承载业务值。 */
      const result = this.dispatchExplicitItem(player, change.equipped, change.equipped.equipSlot, 'on_equip');
      for (const flag of result.dirty) {
        dirty.add(flag);
      }
      for (const playerId of result.dirtyPlayers ?? []) {
        dirtyPlayers.add(playerId);
      }
    }

    if (change.unequipped?.effects?.length) {
/** result：定义该变量以承载业务值。 */
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

/** dispatch：执行对应的业务逻辑。 */
  dispatch(player: PlayerState, event: EquipmentEffectEvent): EquipmentEffectDispatchResult {
/** dirty：定义该变量以承载业务值。 */
    const dirty = new Set<EquipmentDirtyFlag>();
/** dirtyPlayers：定义该变量以承载业务值。 */
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
/** result：定义该变量以承载业务值。 */
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

/** syncTimePhase：执行对应的业务逻辑。 */
  syncTimePhase(player: PlayerState, phase: TimePhaseId): EquipmentEffectDispatchResult {
/** carrier：定义该变量以承载业务值。 */
    const carrier = player as PlayerRuntimeCarrier;
/** previous：定义该变量以承载业务值。 */
    const previous = carrier[LAST_TIME_PHASE_KEY];
    carrier[LAST_TIME_PHASE_KEY] = phase;
    if (!previous || previous === phase) {
/** changed：定义该变量以承载业务值。 */
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
/** dirty：定义该变量以承载业务值。 */
    const dirty = new Set<EquipmentDirtyFlag>();
/** dirtyPlayers：定义该变量以承载业务值。 */
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
/** result：定义该变量以承载业务值。 */
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

/** getEquippedEffects：执行对应的业务逻辑。 */
  private getEquippedEffects(player: PlayerState): EquippedEffectEntry[] {
/** entries：定义该变量以承载业务值。 */
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

/** refreshPassiveEffects：执行对应的业务逻辑。 */
  private refreshPassiveEffects(player: PlayerState): boolean {
/** nextBonuses：定义该变量以承载业务值。 */
    const nextBonuses: AttrBonus[] = [];
    for (const entry of this.getEquippedEffects(player)) {
      const effect = entry.effect;
      if (effect.type !== 'stat_aura' && effect.type !== 'progress_boost') {
        continue;
      }
      if (!this.matchesConditions(player, effect.conditions, undefined)) {
        continue;
      }
      if (!effect.attrs && !effect.stats && !effect.qiProjection) {
        continue;
      }
      nextBonuses.push({
        source: this.getDynamicBonusSource(entry),
        attrs: effect.attrs ?? {},
        attrMode: effect.attrMode ?? 'percent',
        stats: effect.stats,
        statMode: effect.statMode ?? 'percent',
        qiProjection: effect.qiProjection,
        label: `${entry.item.name}:${effect.effectId ?? 'effect'}`,
      });
    }

/** current：定义该变量以承载业务值。 */
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

/** isBonusListEqual：执行对应的业务逻辑。 */
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
      if ((leftEntry.attrMode ?? 'flat') !== (rightEntry.attrMode ?? 'flat')) {
        return false;
      }
      if (JSON.stringify(leftEntry.stats ?? null) !== JSON.stringify(rightEntry.stats ?? null)) {
        return false;
      }
      if ((leftEntry.statMode ?? 'flat') !== (rightEntry.statMode ?? 'flat')) {
        return false;
      }
      if (JSON.stringify(leftEntry.qiProjection ?? null) !== JSON.stringify(rightEntry.qiProjection ?? null)) {
        return false;
      }
    }
    return true;
  }

/** matchesTrigger：执行对应的业务逻辑。 */
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
/** mode：定义该变量以承载业务值。 */
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
        return this.mapService.matchesMapCondition(player.mapId, condition.mapIds);
      case 'hp_ratio': {
/** ratio：定义该变量以承载业务值。 */
        const ratio = player.maxHp > 0 ? player.hp / player.maxHp : 0;
        return condition.op === '<=' ? ratio <= condition.value : ratio >= condition.value;
      }
      case 'qi_ratio': {
/** maxQi：定义该变量以承载业务值。 */
        const maxQi = Math.max(0, Math.round(player.numericStats?.maxQi ?? 0));
/** ratio：定义该变量以承载业务值。 */
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

/** isPlayerCultivating：执行对应的业务逻辑。 */
  private isPlayerCultivating(player: PlayerState): boolean {
    return (player.temporaryBuffs ?? []).some((buff) => buff.buffId === CULTIVATION_BUFF_ID && buff.remainingTicks > 0);
  }

/** applyPeriodicCost：执行对应的业务逻辑。 */
  private applyPeriodicCost(player: PlayerState, effect: Extract<EquipmentEffectDef, { type: 'periodic_cost' }>): boolean {
    if (player.dead) {
      return false;
    }
/** current：定义该变量以承载业务值。 */
    const current = effect.resource === 'hp' ? player.hp : player.qi;
    if (current <= 0) {
      return false;
    }
/** numericStats：定义该变量以承载业务值。 */
    const numericStats = this.attrService.getPlayerNumericStats(player);
/** basis：定义该变量以承载业务值。 */
    const basis = effect.mode === 'flat'
      ? effect.value
      : effect.mode === 'max_ratio_bp'
        ? (effect.resource === 'hp' ? player.maxHp : Math.max(0, Math.round(numericStats.maxQi))) * (effect.value / 10000)
        : current * (effect.value / 10000);
/** amount：定义该变量以承载业务值。 */
    const amount = Math.max(1, Math.round(basis));
/** minRemain：定义该变量以承载业务值。 */
    const minRemain = effect.minRemain ?? (effect.resource === 'hp' ? 1 : 0);
/** next：定义该变量以承载业务值。 */
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
/** effect：定义该变量以承载业务值。 */
    const effect = entry.effect as EquipmentTimedBuffEffectDef;
    if (effect.chance !== undefined && effect.chance < 1 && Math.random() > effect.chance) {
      return { dirty: [] };
    }
/** runtimeState：定义该变量以承载业务值。 */
    const runtimeState = this.getRuntimeState(player, entry);
    if (runtimeState && runtimeState.cooldownLeft > 0) {
      return { dirty: [] };
    }
/** target：定义该变量以承载业务值。 */
    const target = effect.target === 'target' ? event.target : { kind: 'player' as const, player };
    if (!target || target.kind === 'tile') {
      return { dirty: [] };
    }

    if (effect.cooldown && effect.cooldown > 0) {
      this.setCooldown(player, entry, effect.cooldown);
    }

/** sourceRealmLv：定义该变量以承载业务值。 */
    const sourceRealmLv = Math.max(1, Math.floor(player.realm?.realmLv ?? player.realmLv ?? entry.item.level ?? 1));
    if (target.kind === 'player') {
      this.applyBuffState(target.player, this.buildBuffState(entry.item, effect, sourceRealmLv));
      return target.player.id === player.id
        ? { dirty: ['attr'] }
        : { dirty: [], dirtyPlayers: [target.player.id] };
    }

    this.applyBuffStateToCollection(target.monster.temporaryBuffs ??= [], this.buildBuffState(entry.item, effect, sourceRealmLv));
    return { dirty: [] };
  }

/** buildBuffState：执行对应的业务逻辑。 */
  private buildBuffState(item: ItemStack, effect: EquipmentTimedBuffEffectDef, sourceRealmLv: number): TemporaryBuffState {
/** buff：定义该变量以承载业务值。 */
    const buff = effect.buff;
/** duration：定义该变量以承载业务值。 */
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
      realmLv: Math.max(1, Math.floor(sourceRealmLv)),
      color: buff.color,
      attrs: buff.attrs,
      attrMode: buff.attrMode,
      stats: buff.stats,
      statMode: buff.statMode,
      qiProjection: buff.qiProjection,
      persistOnDeath: buff.persistOnDeath === true,
      persistOnReturnToSpawn: buff.persistOnReturnToSpawn === true,
    });
  }

/** applyBuffState：执行对应的业务逻辑。 */
  private applyBuffState(player: PlayerState, nextBuff: TemporaryBuffState): void {
    player.temporaryBuffs ??= [];
    this.applyBuffStateToCollection(player.temporaryBuffs, nextBuff);
    this.attrService.recalcPlayer(player);
  }

/** applyBuffStateToCollection：执行对应的业务逻辑。 */
  private applyBuffStateToCollection(targetBuffs: TemporaryBuffState[], nextBuff: TemporaryBuffState): void {
/** existing：定义该变量以承载业务值。 */
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
      existing.realmLv = nextBuff.realmLv;
      existing.color = nextBuff.color;
      existing.attrs = nextBuff.attrs;
      existing.attrMode = nextBuff.attrMode;
      existing.stats = nextBuff.stats;
      existing.statMode = nextBuff.statMode;
      existing.qiProjection = nextBuff.qiProjection;
      existing.persistOnDeath = nextBuff.persistOnDeath;
      existing.persistOnReturnToSpawn = nextBuff.persistOnReturnToSpawn;
      syncDynamicBuffPresentation(existing);
      return;
    }
    targetBuffs.push(syncDynamicBuffPresentation(nextBuff));
  }

/** tickRuntimeStates：执行对应的业务逻辑。 */
  private tickRuntimeStates(player: PlayerState): void {
/** carrier：定义该变量以承载业务值。 */
    const carrier = player as PlayerRuntimeCarrier;
/** states：定义该变量以承载业务值。 */
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

/** pruneRuntimeStates：执行对应的业务逻辑。 */
  private pruneRuntimeStates(player: PlayerState): void {
/** carrier：定义该变量以承载业务值。 */
    const carrier = player as PlayerRuntimeCarrier;
/** states：定义该变量以承载业务值。 */
    const states = carrier[RUNTIME_STATE_KEY];
    if (!states || states.length === 0) {
      return;
    }
/** validKeys：定义该变量以承载业务值。 */
    const validKeys = new Set(this.getEquippedEffects(player).map((entry) => this.getRuntimeKey(entry.slot, entry.item, entry.effect.effectId)));
    carrier[RUNTIME_STATE_KEY] = states.filter((state) => validKeys.has(state.key) && state.cooldownLeft > 0);
  }

/** getRuntimeState：执行对应的业务逻辑。 */
  private getRuntimeState(player: PlayerState, entry: EquippedEffectEntry): EquipmentEffectRuntimeState | undefined {
/** carrier：定义该变量以承载业务值。 */
    const carrier = player as PlayerRuntimeCarrier;
/** key：定义该变量以承载业务值。 */
    const key = this.getRuntimeKey(entry.slot, entry.item, entry.effect.effectId);
    return carrier[RUNTIME_STATE_KEY]?.find((state) => state.key === key);
  }

/** setCooldown：执行对应的业务逻辑。 */
  private setCooldown(player: PlayerState, entry: EquippedEffectEntry, cooldown: number): void {
/** carrier：定义该变量以承载业务值。 */
    const carrier = player as PlayerRuntimeCarrier;
    carrier[RUNTIME_STATE_KEY] ??= [];
/** key：定义该变量以承载业务值。 */
    const key = this.getRuntimeKey(entry.slot, entry.item, entry.effect.effectId);
/** existing：定义该变量以承载业务值。 */
    const existing = carrier[RUNTIME_STATE_KEY]!.find((state) => state.key === key);
    if (existing) {
      existing.cooldownLeft = Math.max(existing.cooldownLeft, cooldown);
      return;
    }
    carrier[RUNTIME_STATE_KEY]!.push({ key, cooldownLeft: cooldown });
  }

/** getRuntimeKey：执行对应的业务逻辑。 */
  private getRuntimeKey(slot: ItemStack['equipSlot'], item: ItemStack, effectId: string | undefined): string {
    return `${slot ?? item.equipSlot ?? 'unknown'}:${item.itemId}:${effectId ?? 'effect'}`;
  }

/** getDynamicBonusSource：执行对应的业务逻辑。 */
  private getDynamicBonusSource(entry: EquippedEffectEntry): string {
    return `${EQUIP_DYNAMIC_SOURCE_PREFIX}${entry.slot}:${entry.item.itemId}:${entry.effect.effectId ?? 'effect'}`;
  }
}
