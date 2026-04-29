import type { NumericRatioDivisors, NumericStats, PartialNumericRatioDivisors, PartialNumericStats } from './numeric';
import type { PlayerSpecialStats } from './cultivation-types';
import type { Attributes } from './attribute-types';
import type { QuestLine } from './quest-types';
import { TileType, type GameTimeState, type VisibleTile } from './world-core-types';
import type { NpcQuestMarker } from './world-view-types';
import { clonePlainValue } from './structured';
import { doesTileTypeBlockSight, isTileTypeWalkable } from './terrain';

/** 支持的二进制载荷输入类型。 */
export type BinaryPayload = ArrayBuffer | Uint8Array | {
/**
 * buffer：缓冲区相关字段。
 */
 buffer: ArrayBufferLike;
 /**
 * byteLength：数量或计量字段。
 */
 byteLength: number;
 /**
 * byteOffset：byteOffset相关字段。
 */
 byteOffset?: number };

/** 判断对象是否持有指定自有属性。 */
export function hasOwn<T extends object>(value: T, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/** 通过纯数据拷贝克隆 JSON 兼容对象。 */
export function cloneJson<T>(value: T): T {
  return clonePlainValue(value);
}

/** 解析 JSON 字符串。 */
export function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

/** 将多种二进制视图统一转成 Uint8Array。 */
export function normalizeBinaryPayload(payload: unknown): Uint8Array | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (payload instanceof Uint8Array) {
    return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
  }
  if (payload instanceof ArrayBuffer) {
    return new Uint8Array(payload);
  }
  if (typeof payload === 'object' && payload !== null && 'buffer' in payload && 'byteLength' in payload) {
    const view = payload as {    
    /**
 * buffer：缓冲区相关字段。
 */
 buffer: ArrayBufferLike;    
 /**
 * byteLength：数量或计量字段。
 */
 byteLength: number;    
 /**
 * byteOffset：byteOffset相关字段。
 */
 byteOffset?: number };
    return new Uint8Array(view.buffer, view.byteOffset ?? 0, view.byteLength);
  }
  return null;
}

/** 按 protobuf clear 语义写入可空字段。 */
export function setNullableWireValue<T>(wire: Record<string, unknown>, valueKey: string, clearKey: string, value: T | null | undefined): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (value === null) {
    wire[clearKey] = true;
    return;
  }
  if (value !== undefined) {
    wire[valueKey] = value;
  }
}

/** 按 protobuf clear 语义读取可空字段。 */
export function readNullableWireValue<T>(wire: Record<string, unknown>, valueKey: string, clearKey: string): T | null | undefined {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (wire[clearKey] === true) {
    return null;
  }
  if (hasOwn(wire, valueKey)) {
    return wire[valueKey] as T;
  }
  return undefined;
}

/** 将属性对象转换为 protobuf 兼容的纯对象。 */
export function toWireAttributes(attrs: Attributes | undefined): Record<string, number> | undefined {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!attrs) {
    return undefined;
  }
  return {
    constitution: attrs.constitution,
    spirit: attrs.spirit,
    perception: attrs.perception,
    talent: attrs.talent,
    strength: attrs.strength,
    meridians: attrs.meridians,
  };
}

/** 从 protobuf 兼容对象还原属性结构。 */
export function fromWireAttributes(wire: Record<string, unknown> | undefined): Attributes | undefined {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!wire) {
    return undefined;
  }
  return {
    constitution: Number(wire.constitution ?? 0),
    spirit: Number(wire.spirit ?? 0),
    perception: Number(wire.perception ?? 0),
    talent: Number(wire.talent ?? 0),
    strength: Number(wire.strength ?? wire.comprehension ?? 0),
    meridians: Number(wire.meridians ?? wire.luck ?? 0),
  };
}

/** 将部分属性对象转换为 protobuf 兼容的纯对象。 */
export function toWirePartialAttributes(attrs: Partial<Attributes> | undefined): Record<string, number> | undefined {
  if (!attrs) {
    return undefined;
  }
  const wire: Record<string, number> = {};
  if (hasOwn(attrs, 'constitution')) wire.constitution = Number(attrs.constitution ?? 0);
  if (hasOwn(attrs, 'spirit')) wire.spirit = Number(attrs.spirit ?? 0);
  if (hasOwn(attrs, 'perception')) wire.perception = Number(attrs.perception ?? 0);
  if (hasOwn(attrs, 'talent')) wire.talent = Number(attrs.talent ?? 0);
  if (hasOwn(attrs, 'strength')) wire.strength = Number(attrs.strength ?? 0);
  if (hasOwn(attrs, 'meridians')) wire.meridians = Number(attrs.meridians ?? 0);
  return Object.keys(wire).length > 0 ? wire : undefined;
}

/** 从 protobuf 兼容对象还原部分属性结构。 */
export function fromWirePartialAttributes(wire: Record<string, unknown> | undefined): Partial<Attributes> | undefined {
  if (!wire) {
    return undefined;
  }
  const attrs: Partial<Attributes> = {};
  if (hasOwn(wire, 'constitution')) attrs.constitution = Number(wire.constitution ?? 0);
  if (hasOwn(wire, 'spirit')) attrs.spirit = Number(wire.spirit ?? 0);
  if (hasOwn(wire, 'perception')) attrs.perception = Number(wire.perception ?? 0);
  if (hasOwn(wire, 'talent')) attrs.talent = Number(wire.talent ?? 0);
  if (hasOwn(wire, 'strength')) attrs.strength = Number(wire.strength ?? 0);
  if (hasOwn(wire, 'meridians')) attrs.meridians = Number(wire.meridians ?? 0);
  if (!hasOwn(attrs, 'strength') && hasOwn(wire, 'comprehension')) attrs.strength = Number(wire.comprehension ?? 0);
  if (!hasOwn(attrs, 'meridians') && hasOwn(wire, 'luck')) attrs.meridians = Number(wire.luck ?? 0);
  return Object.keys(attrs).length > 0 ? attrs : undefined;
}

/** 将数值属性按原样克隆为 wire 结构。 */
export function toWireNumericStats(stats: NumericStats | undefined): Record<string, unknown> | undefined {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!stats) {
    return undefined;
  }
  return cloneJson(stats) as unknown as Record<string, unknown>;
}

/** 从 wire 结构还原数值属性。 */
export function fromWireNumericStats(wire: Record<string, unknown> | undefined): NumericStats | undefined {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!wire) {
    return undefined;
  }
  return cloneJson(wire) as unknown as NumericStats;
}

/** 将部分数值属性按原样克隆为 wire 结构。 */
export function toWirePartialNumericStats(stats: PartialNumericStats | undefined): Record<string, unknown> | undefined {
  if (!stats) {
    return undefined;
  }
  return cloneJson(stats) as unknown as Record<string, unknown>;
}

/** 从 wire 结构还原部分数值属性。 */
export function fromWirePartialNumericStats(wire: Record<string, unknown> | undefined): PartialNumericStats | undefined {
  if (!wire) {
    return undefined;
  }
  return cloneJson(wire) as unknown as PartialNumericStats;
}

/** 将比率除数结构克隆为 wire 结构。 */
export function toWireRatioDivisors(divisors: NumericRatioDivisors | undefined): Record<string, unknown> | undefined {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!divisors) {
    return undefined;
  }
  return cloneJson(divisors) as unknown as Record<string, unknown>;
}

/** 从 wire 结构还原比率除数。 */
export function fromWireRatioDivisors(wire: Record<string, unknown> | undefined): NumericRatioDivisors | undefined {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!wire) {
    return undefined;
  }
  return cloneJson(wire) as unknown as NumericRatioDivisors;
}

/** 将部分比率除数结构克隆为 wire 结构。 */
export function toWirePartialRatioDivisors(divisors: PartialNumericRatioDivisors | undefined): Record<string, unknown> | undefined {
  if (!divisors) {
    return undefined;
  }
  return cloneJson(divisors) as unknown as Record<string, unknown>;
}

/** 从 wire 结构还原部分比率除数。 */
export function fromWirePartialRatioDivisors(wire: Record<string, unknown> | undefined): PartialNumericRatioDivisors | undefined {
  if (!wire) {
    return undefined;
  }
  return cloneJson(wire) as unknown as PartialNumericRatioDivisors;
}

/** 将 NPC 任务标记转换为 wire 结构。 */
export function toWireNpcQuestMarker(marker: NpcQuestMarker | undefined): Record<string, unknown> | undefined {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!marker) {
    return undefined;
  }
  return {
    line: marker.line,
    state: marker.state,
  };
}

/** 从 wire 结构还原 NPC 任务标记。 */
export function fromWireNpcQuestMarker(wire: Record<string, unknown> | undefined): NpcQuestMarker | undefined {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!wire) {
    return undefined;
  }
  return {
    line: String(wire.line ?? 'side') as QuestLine,
    state: String(wire.state ?? 'active') as NpcQuestMarker['state'],
  };
}

/** 将可见地块转换为 wire 结构。 */
export function toWireVisibleTile(tile: VisibleTile): Record<string, unknown> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!tile) {
    return { hidden: true };
  }
  const wire: Record<string, unknown> = { type: tile.type };
  if (tile.walkable !== isTileTypeWalkable(tile.type)) wire.walkable = tile.walkable;
  if (tile.blocksSight !== doesTileTypeBlockSight(tile.type)) wire.blocksSight = tile.blocksSight;
  if (tile.aura) wire.aura = tile.aura;
  if (tile.hpVisible === true) wire.hpVisible = true;
  if (tile.occupiedBy) wire.occupiedBy = tile.occupiedBy;
  if (tile.modifiedAt !== null && tile.modifiedAt !== undefined) wire.modifiedAt = tile.modifiedAt;
  if (tile.hp !== undefined) wire.hp = tile.hp;
  if (tile.maxHp !== undefined) wire.maxHp = tile.maxHp;
  if (tile.resources && tile.resources.length > 0) {
    wire.resources = tile.resources.map((resource) => ({
      key: resource.key,
      label: resource.label,
      value: resource.value,
      effectiveValue: resource.effectiveValue,
      level: resource.level,
      sourceValue: resource.sourceValue,
    }));
  }
  if (tile.hiddenEntrance?.title) wire.hiddenEntranceTitle = tile.hiddenEntrance.title;
  if (tile.hiddenEntrance?.desc) wire.hiddenEntranceDesc = tile.hiddenEntrance.desc;
  return wire;
}

/** 从 wire 结构还原可见地块。 */
export function fromWireVisibleTile(wire: Record<string, unknown>): VisibleTile {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (wire.hidden === true) {
    return null;
  }
  const type = String(wire.type ?? TileType.Floor) as NonNullable<VisibleTile>['type'];
  return {
    type,
    walkable: hasOwn(wire, 'walkable') ? Boolean(wire.walkable) : isTileTypeWalkable(type),
    blocksSight: hasOwn(wire, 'blocksSight') ? Boolean(wire.blocksSight) : doesTileTypeBlockSight(type),
    aura: Number(wire.aura ?? 0),
    occupiedBy: typeof wire.occupiedBy === 'string' && wire.occupiedBy.length > 0 ? wire.occupiedBy : null,
    modifiedAt: hasOwn(wire, 'modifiedAt') ? Number(wire.modifiedAt ?? 0) : null,
    hp: hasOwn(wire, 'hp') ? Number(wire.hp ?? 0) : undefined,
    maxHp: hasOwn(wire, 'maxHp') ? Number(wire.maxHp ?? 0) : undefined,
    hpVisible: hasOwn(wire, 'hpVisible') ? Boolean(wire.hpVisible) : undefined,
    resources: Array.isArray(wire.resources)
      ? wire.resources
        .filter((resource) => resource && typeof resource === 'object')
        .map((resource) => ({
          key: String(resource.key ?? ''),
          label: String(resource.label ?? ''),
          value: Number(resource.value ?? 0),
          effectiveValue: hasOwn(resource as Record<string, unknown>, 'effectiveValue')
            ? Number(resource.effectiveValue ?? 0)
            : undefined,
          level: hasOwn(resource as Record<string, unknown>, 'level')
            ? Number(resource.level ?? 0)
            : undefined,
          sourceValue: hasOwn(resource as Record<string, unknown>, 'sourceValue')
            ? Number(resource.sourceValue ?? 0)
            : undefined,
        }))
      : undefined,
    hiddenEntrance: typeof wire.hiddenEntranceTitle === 'string'
      ? {
          title: wire.hiddenEntranceTitle,
          desc: typeof wire.hiddenEntranceDesc === 'string' ? wire.hiddenEntranceDesc : undefined,
        }
      : undefined,
  };
}

/** 将游戏时间状态转换为 wire 结构。 */
export function toWireGameTimeState(time: GameTimeState | undefined): Record<string, unknown> | undefined {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!time) {
    return undefined;
  }
  return cloneJson(time) as unknown as Record<string, unknown>;
}

/** 从 wire 结构还原游戏时间状态。 */
export function fromWireGameTimeState(wire: Record<string, unknown> | undefined): GameTimeState | undefined {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!wire) {
    return undefined;
  }
  return cloneJson(wire) as unknown as GameTimeState;
}

/** 将玩家特殊属性转换为 wire 结构。 */
export function toWirePlayerSpecialStats(payload: PlayerSpecialStats): Record<string, unknown> {
  return {
    foundation: payload.foundation,
    rootFoundation: Number(payload.rootFoundation ?? 0),
    combatExp: payload.combatExp,
    comprehension: Number(payload.comprehension ?? 0),
    luck: Number(payload.luck ?? 0),
  };
}

/** 从 wire 结构还原玩家特殊属性。 */
export function fromWirePlayerSpecialStats(wire: Record<string, unknown>): PlayerSpecialStats {
  return {
    foundation: Number(wire.foundation ?? 0),
    rootFoundation: Number(wire.rootFoundation ?? 0),
    combatExp: Number(wire.combatExp ?? 0),
    comprehension: Number(wire.comprehension ?? 0),
    luck: Number(wire.luck ?? 0),
  };
}

/** 将部分玩家特殊属性转换为 wire 结构。 */
export function toWirePartialPlayerSpecialStats(payload: Partial<PlayerSpecialStats> | undefined): Record<string, unknown> | undefined {
  if (!payload) {
    return undefined;
  }
  const wire: Record<string, unknown> = {};
  if (hasOwn(payload, 'foundation')) {
    wire.foundation = Number(payload.foundation ?? 0);
  }
  if (hasOwn(payload, 'rootFoundation')) {
    wire.rootFoundation = Number(payload.rootFoundation ?? 0);
  }
  if (hasOwn(payload, 'combatExp')) {
    wire.combatExp = Number(payload.combatExp ?? 0);
  }
  if (hasOwn(payload, 'comprehension')) {
    wire.comprehension = Number(payload.comprehension ?? 0);
  }
  if (hasOwn(payload, 'luck')) {
    wire.luck = Number(payload.luck ?? 0);
  }
  return Object.keys(wire).length > 0 ? wire : undefined;
}

/** 从 wire 结构还原部分玩家特殊属性。 */
export function fromWirePartialPlayerSpecialStats(wire: Record<string, unknown> | undefined): Partial<PlayerSpecialStats> | undefined {
  if (!wire) {
    return undefined;
  }
  const payload: Partial<PlayerSpecialStats> = {};
  if (hasOwn(wire, 'foundation')) {
    payload.foundation = Number(wire.foundation ?? 0);
  }
  if (hasOwn(wire, 'rootFoundation')) {
    payload.rootFoundation = Number(wire.rootFoundation ?? 0);
  }
  if (hasOwn(wire, 'combatExp')) {
    payload.combatExp = Number(wire.combatExp ?? 0);
  }
  if (hasOwn(wire, 'comprehension')) {
    payload.comprehension = Number(wire.comprehension ?? 0);
  }
  if (hasOwn(wire, 'luck')) {
    payload.luck = Number(wire.luck ?? 0);
  }
  return Object.keys(payload).length > 0 ? payload : undefined;
}
