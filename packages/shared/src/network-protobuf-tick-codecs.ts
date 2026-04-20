import type { NEXT_S2C_Tick } from './protocol';
import type {
  GroundItemPilePatchView as GroundItemPilePatch,
  TickRenderEntityView as TickRenderEntity,
  VisibleTilePatchView as VisibleTilePatch,
} from './world-patch-types';
import type { TechniqueGrade } from './cultivation-types';
import type { ItemType } from './item-runtime-types';
import type { VisibleBuffState } from './world-core-types';
import type { ObservationInsight } from './observation-types';
import {
  cloneJson,
  fromWireGameTimeState,
  fromWireNpcQuestMarker,
  fromWireVisibleTile,
  hasOwn,
  parseJson,
  readNullableWireValue,
  setNullableWireValue,
  toWireGameTimeState,
  toWireNpcQuestMarker,
  toWireVisibleTile,
} from './network-protobuf-wire-helpers';

/** 将 Tick 高频实体补丁转换为 wire 结构。 */
export function toWireTickEntity(entity: TickRenderEntity): Record<string, unknown> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const wire: Record<string, unknown> = {
    id: entity.id,
    x: entity.x,
    y: entity.y,
  };
  if (entity.char !== undefined) wire.char = entity.char;
  if (entity.color !== undefined) wire.color = entity.color;
  setNullableWireValue(wire, 'name', 'clearName', entity.name);
  setNullableWireValue(wire, 'kind', 'clearKind', entity.kind);
  setNullableWireValue(wire, 'monsterTier', 'clearMonsterTier', entity.monsterTier);
  setNullableWireValue(wire, 'monsterScale', 'clearMonsterScale', entity.monsterScale);
  setNullableWireValue(wire, 'hp', 'clearHp', entity.hp);
  setNullableWireValue(wire, 'maxHp', 'clearMaxHp', entity.maxHp);
  setNullableWireValue(wire, 'qi', 'clearQi', entity.qi);
  setNullableWireValue(wire, 'maxQi', 'clearMaxQi', entity.maxQi);
  if (entity.npcQuestMarker === null) {
    wire.clearNpcQuestMarker = true;
  } else if (entity.npcQuestMarker !== undefined) {
    wire.npcQuestMarker = toWireNpcQuestMarker(entity.npcQuestMarker);
  }
  if (entity.observation === null) {
    wire.clearObservation = true;
  } else if (entity.observation !== undefined) {
    wire.observationJson = JSON.stringify(entity.observation);
  }
  if (entity.buffs === null) {
    wire.clearBuffs = true;
  } else if (entity.buffs !== undefined) {
    wire.buffsJson = JSON.stringify(entity.buffs);
  }
  return wire;
}

/** 从 wire 结构还原 Tick 高频实体补丁。 */
export function fromWireTickEntity(wire: Record<string, unknown>): TickRenderEntity {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const patch: TickRenderEntity = {
    id: String(wire.id ?? ''),
    x: Number(wire.x ?? 0),
    y: Number(wire.y ?? 0),
  };
  if (hasOwn(wire, 'char')) patch.char = String(wire.char ?? '');
  if (hasOwn(wire, 'color')) patch.color = String(wire.color ?? '');
  const name = readNullableWireValue<string>(wire, 'name', 'clearName');
  if (name !== undefined) patch.name = name;
  const kind = readNullableWireValue<TickRenderEntity['kind']>(wire, 'kind', 'clearKind');
  if (kind !== undefined) patch.kind = kind;
  const monsterTier = readNullableWireValue<TickRenderEntity['monsterTier']>(wire, 'monsterTier', 'clearMonsterTier');
  if (monsterTier !== undefined) patch.monsterTier = monsterTier;
  const monsterScale = readNullableWireValue<number>(wire, 'monsterScale', 'clearMonsterScale');
  if (monsterScale !== undefined) patch.monsterScale = monsterScale === null ? null : Number(monsterScale);
  const hp = readNullableWireValue<number>(wire, 'hp', 'clearHp');
  if (hp !== undefined) patch.hp = hp === null ? null : Number(hp);
  const maxHp = readNullableWireValue<number>(wire, 'maxHp', 'clearMaxHp');
  if (maxHp !== undefined) patch.maxHp = maxHp === null ? null : Number(maxHp);
  const qi = readNullableWireValue<number>(wire, 'qi', 'clearQi');
  if (qi !== undefined) patch.qi = qi === null ? null : Number(qi);
  const maxQi = readNullableWireValue<number>(wire, 'maxQi', 'clearMaxQi');
  if (maxQi !== undefined) patch.maxQi = maxQi === null ? null : Number(maxQi);
  if (wire.clearNpcQuestMarker === true) {
    patch.npcQuestMarker = null;
  } else if (hasOwn(wire, 'npcQuestMarker')) {
    patch.npcQuestMarker = fromWireNpcQuestMarker(wire.npcQuestMarker as Record<string, unknown>);
  }
  if (wire.clearObservation === true) {
    patch.observation = null;
  } else if (typeof wire.observationJson === 'string') {
    patch.observation = parseJson<ObservationInsight>(wire.observationJson);
  }
  if (wire.clearBuffs === true) {
    patch.buffs = null;
  } else if (typeof wire.buffsJson === 'string') {
    patch.buffs = parseJson<VisibleBuffState[]>(wire.buffsJson);
  }
  return patch;
}

/** 将 Tick 高频包转换为 wire 结构。 */
export function toWireTick(payload: NEXT_S2C_Tick): Record<string, unknown> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const wire: Record<string, unknown> = {
    p: payload.p.map(toWireTickEntity),
    e: payload.e.map(toWireTickEntity),
  };
  if (payload.r) {
    wire.r = [...payload.r];
  }
  if (payload.threatArrows) {
    wire.threatArrows = payload.threatArrows.map(([left, right]) => ({ left, right }));
  }
  if (payload.threatArrowAdds) {
    wire.threatArrowAdds = payload.threatArrowAdds.map(([left, right]) => ({ left, right }));
  }
  if (payload.threatArrowRemoves) {
    wire.threatArrowRemoves = payload.threatArrowRemoves.map(([left, right]) => ({ left, right }));
  }
  if (payload.t) {
    wire.t = payload.t.map((patch) => ({
      x: patch.x,
      y: patch.y,
      tile: toWireVisibleTile(patch.tile),
    }));
  }
  if (payload.g) {
    wire.g = payload.g.map((patch) => {
      const encoded: Record<string, unknown> = {
        sourceId: patch.sourceId,
        x: patch.x,
        y: patch.y,
      };
      if (patch.items === null) {
        encoded.clearItems = true;
      } else if (patch.items) {
        encoded.items = patch.items.map((item) => ({
          itemKey: item.itemKey,
          name: item.name,
          count: item.count,
          itemId: item.itemId,
          type: item.type,
          grade: item.grade,
          groundLabel: item.groundLabel,
        }));
      }
      return encoded;
    });
  }
  if (payload.fx) wire.fx = cloneJson(payload.fx) as unknown as Record<string, unknown>[];
  if (payload.v) {
    wire.v = payload.v.map((row) => ({
      cells: row.map(toWireVisibleTile),
    }));
  }
  if (payload.dt !== undefined) wire.dt = payload.dt;
  if (payload.m !== undefined) wire.m = payload.m;
  if (payload.path) wire.path = payload.path.map(([x, y]) => ({ x, y }));
  if (payload.hp !== undefined) wire.hp = payload.hp;
  if (payload.qi !== undefined) wire.qi = payload.qi;
  if (payload.f !== undefined) wire.f = payload.f;
  if (payload.time) wire.time = toWireGameTimeState(payload.time);
  if (payload.auraLevelBaseValue !== undefined) wire.auraLevelBaseValue = payload.auraLevelBaseValue;
  return wire;
}

/** 从 wire 结构还原 Tick 高频包。 */
export function fromWireTick(wire: Record<string, unknown>): NEXT_S2C_Tick {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const payload: NEXT_S2C_Tick = {
    p: Array.isArray(wire.p) ? wire.p.map((entry) => fromWireTickEntity(entry as Record<string, unknown>)) : [],
    e: Array.isArray(wire.e) ? wire.e.map((entry) => fromWireTickEntity(entry as Record<string, unknown>)) : [],
  };
  if (Array.isArray(wire.r)) {
    payload.r = wire.r.map((entry) => String(entry ?? '')).filter((entry) => entry.length > 0);
  }
  if (Array.isArray(wire.threatArrows)) {
    payload.threatArrows = wire.threatArrows.map((pair) => {
      const entry = pair as Record<string, unknown>;
      return [String(entry.left ?? ''), String(entry.right ?? '')] as [string, string];
    });
  }
  if (Array.isArray(wire.threatArrowAdds)) {
    payload.threatArrowAdds = wire.threatArrowAdds.map((pair) => {
      const entry = pair as Record<string, unknown>;
      return [String(entry.left ?? ''), String(entry.right ?? '')] as [string, string];
    });
  }
  if (Array.isArray(wire.threatArrowRemoves)) {
    payload.threatArrowRemoves = wire.threatArrowRemoves.map((pair) => {
      const entry = pair as Record<string, unknown>;
      return [String(entry.left ?? ''), String(entry.right ?? '')] as [string, string];
    });
  }
  if (Array.isArray(wire.t)) {
    payload.t = wire.t.map((entry) => {
      const patch = entry as Record<string, unknown>;
      return {
        x: Number(patch.x ?? 0),
        y: Number(patch.y ?? 0),
        tile: fromWireVisibleTile((patch.tile ?? {}) as Record<string, unknown>),
      } as VisibleTilePatch;
    });
  }
  if (Array.isArray(wire.g)) {
    payload.g = wire.g.map((entry) => {
      const patch = entry as Record<string, unknown>;
      return {
        sourceId: String(patch.sourceId ?? ''),
        x: Number(patch.x ?? 0),
        y: Number(patch.y ?? 0),
        items: patch.clearItems === true
          ? null
          : Array.isArray(patch.items)
            ? patch.items.map((item) => ({
                itemKey: String((item as Record<string, unknown>).itemKey ?? ''),
                itemId: String((item as Record<string, unknown>).itemId ?? ''),
                name: String((item as Record<string, unknown>).name ?? ''),
                type: String((item as Record<string, unknown>).type ?? 'material') as ItemType,
                count: Number((item as Record<string, unknown>).count ?? 0),
                grade: typeof (item as Record<string, unknown>).grade === 'string'
                  ? String((item as Record<string, unknown>).grade) as TechniqueGrade
                  : undefined,
                groundLabel: typeof (item as Record<string, unknown>).groundLabel === 'string'
                  ? String((item as Record<string, unknown>).groundLabel)
                  : undefined,
              }))
            : undefined,
      } as GroundItemPilePatch;
    });
  }
  if (Array.isArray(wire.fx)) payload.fx = cloneJson(wire.fx) as NEXT_S2C_Tick['fx'];
  if (Array.isArray(wire.v)) {
    payload.v = wire.v.map((row) => {
      const rowWire = row as Record<string, unknown>;
      const cells = Array.isArray(rowWire.cells) ? rowWire.cells : [];
      return cells.map((cell) => fromWireVisibleTile(cell as Record<string, unknown>));
    });
  }
  if (hasOwn(wire, 'dt')) payload.dt = Number(wire.dt ?? 0);
  if (hasOwn(wire, 'm')) payload.m = String(wire.m ?? '');
  if (Array.isArray(wire.path)) {
    payload.path = wire.path.map((point) => {
      const entry = point as Record<string, unknown>;
      return [Number(entry.x ?? 0), Number(entry.y ?? 0)] as [number, number];
    });
  }
  if (hasOwn(wire, 'hp')) payload.hp = Number(wire.hp ?? 0);
  if (hasOwn(wire, 'qi')) payload.qi = Number(wire.qi ?? 0);
  if (hasOwn(wire, 'f')) payload.f = Number(wire.f ?? 0) as NEXT_S2C_Tick['f'];
  if (hasOwn(wire, 'time')) payload.time = fromWireGameTimeState(wire.time as Record<string, unknown>);
  if (hasOwn(wire, 'auraLevelBaseValue')) {
    payload.auraLevelBaseValue = Number(wire.auraLevelBaseValue ?? 0);
  }
  return payload;
}
