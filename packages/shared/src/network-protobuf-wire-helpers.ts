import type { NumericRatioDivisors, NumericStats } from './numeric';
import type { PlayerSpecialStats } from './cultivation-types';
import type { Attributes } from './attribute-types';
import type { QuestLine } from './quest-types';
import type { GameTimeState, VisibleTile } from './world-core-types';
import type { NpcQuestMarker } from './world-view-types';
import { clonePlainValue } from './structured';

/** 支持的二进制载荷输入类型。 */
export type BinaryPayload = ArrayBuffer | Uint8Array | { buffer: ArrayBufferLike; byteLength: number; byteOffset?: number };

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
  if (payload instanceof Uint8Array) {
    return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
  }
  if (payload instanceof ArrayBuffer) {
    return new Uint8Array(payload);
  }
  if (typeof payload === 'object' && payload !== null && 'buffer' in payload && 'byteLength' in payload) {
    const view = payload as { buffer: ArrayBufferLike; byteLength: number; byteOffset?: number };
    return new Uint8Array(view.buffer, view.byteOffset ?? 0, view.byteLength);
  }
  return null;
}

/** 按 protobuf clear 语义写入可空字段。 */
export function setNullableWireValue<T>(wire: Record<string, unknown>, valueKey: string, clearKey: string, value: T | null | undefined): void {
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
  if (!attrs) {
    return undefined;
  }
  return {
    constitution: attrs.constitution,
    spirit: attrs.spirit,
    perception: attrs.perception,
    talent: attrs.talent,
    comprehension: attrs.comprehension,
    luck: attrs.luck,
  };
}

/** 从 protobuf 兼容对象还原属性结构。 */
export function fromWireAttributes(wire: Record<string, unknown> | undefined): Attributes | undefined {
  if (!wire) {
    return undefined;
  }
  return {
    constitution: Number(wire.constitution ?? 0),
    spirit: Number(wire.spirit ?? 0),
    perception: Number(wire.perception ?? 0),
    talent: Number(wire.talent ?? 0),
    comprehension: Number(wire.comprehension ?? 0),
    luck: Number(wire.luck ?? 0),
  };
}

/** 将数值属性按原样克隆为 wire 结构。 */
export function toWireNumericStats(stats: NumericStats | undefined): Record<string, unknown> | undefined {
  if (!stats) {
    return undefined;
  }
  return cloneJson(stats) as unknown as Record<string, unknown>;
}

/** 从 wire 结构还原数值属性。 */
export function fromWireNumericStats(wire: Record<string, unknown> | undefined): NumericStats | undefined {
  if (!wire) {
    return undefined;
  }
  return cloneJson(wire) as unknown as NumericStats;
}

/** 将比率除数结构克隆为 wire 结构。 */
export function toWireRatioDivisors(divisors: NumericRatioDivisors | undefined): Record<string, unknown> | undefined {
  if (!divisors) {
    return undefined;
  }
  return cloneJson(divisors) as unknown as Record<string, unknown>;
}

/** 从 wire 结构还原比率除数。 */
export function fromWireRatioDivisors(wire: Record<string, unknown> | undefined): NumericRatioDivisors | undefined {
  if (!wire) {
    return undefined;
  }
  return cloneJson(wire) as unknown as NumericRatioDivisors;
}

/** 将 NPC 任务标记转换为 wire 结构。 */
export function toWireNpcQuestMarker(marker: NpcQuestMarker | undefined): Record<string, unknown> | undefined {
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
  if (!tile) {
    return { hidden: true };
  }
  const wire: Record<string, unknown> = {
    type: tile.type,
    walkable: tile.walkable,
    blocksSight: tile.blocksSight,
    aura: tile.aura,
    hpVisible: tile.hpVisible,
  };
  if (tile.occupiedBy) wire.occupiedBy = tile.occupiedBy;
  if (tile.modifiedAt !== null && tile.modifiedAt !== undefined) wire.modifiedAt = tile.modifiedAt;
  if (tile.hp !== undefined) wire.hp = tile.hp;
  if (tile.maxHp !== undefined) wire.maxHp = tile.maxHp;
  if (tile.hiddenEntrance?.title) wire.hiddenEntranceTitle = tile.hiddenEntrance.title;
  if (tile.hiddenEntrance?.desc) wire.hiddenEntranceDesc = tile.hiddenEntrance.desc;
  return wire;
}

/** 从 wire 结构还原可见地块。 */
export function fromWireVisibleTile(wire: Record<string, unknown>): VisibleTile {
  if (wire.hidden === true) {
    return null;
  }
  return {
    type: String(wire.type ?? 'floor') as NonNullable<VisibleTile>['type'],
    walkable: Boolean(wire.walkable),
    blocksSight: Boolean(wire.blocksSight),
    aura: Number(wire.aura ?? 0),
    occupiedBy: typeof wire.occupiedBy === 'string' && wire.occupiedBy.length > 0 ? wire.occupiedBy : null,
    modifiedAt: hasOwn(wire, 'modifiedAt') ? Number(wire.modifiedAt ?? 0) : null,
    hp: hasOwn(wire, 'hp') ? Number(wire.hp ?? 0) : undefined,
    maxHp: hasOwn(wire, 'maxHp') ? Number(wire.maxHp ?? 0) : undefined,
    hpVisible: hasOwn(wire, 'hpVisible') ? Boolean(wire.hpVisible) : undefined,
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
  if (!time) {
    return undefined;
  }
  return cloneJson(time) as unknown as Record<string, unknown>;
}

/** 从 wire 结构还原游戏时间状态。 */
export function fromWireGameTimeState(wire: Record<string, unknown> | undefined): GameTimeState | undefined {
  if (!wire) {
    return undefined;
  }
  return cloneJson(wire) as unknown as GameTimeState;
}

/** 将玩家特殊属性转换为 wire 结构。 */
export function toWirePlayerSpecialStats(payload: PlayerSpecialStats): Record<string, unknown> {
  return {
    foundation: payload.foundation,
    combatExp: payload.combatExp,
  };
}

/** 从 wire 结构还原玩家特殊属性。 */
export function fromWirePlayerSpecialStats(wire: Record<string, unknown>): PlayerSpecialStats {
  return {
    foundation: Number(wire.foundation ?? 0),
    combatExp: Number(wire.combatExp ?? 0),
  };
}
