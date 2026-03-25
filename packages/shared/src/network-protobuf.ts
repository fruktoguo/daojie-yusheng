/**
 * Protobuf 网络编解码层：将高频 S2C 事件（Tick、属性、功法、行动更新）
 * 序列化为二进制以压缩带宽，客户端收到后反序列化还原为业务对象。
 */
import protobuf from 'protobufjs';
import { C2S, S2C, type ActionUpdateEntry, type GroundItemPilePatch, type S2C_ActionsUpdate, type S2C_AttrUpdate, type S2C_TechniqueUpdate, type S2C_Tick, type TechniqueUpdateEntry, type TickRenderEntity, type VisibleTilePatch } from './protocol';
import type { NumericRatioDivisors, NumericStats } from './numeric';
import type { ActionDef, Attributes, AttrBonus, GameTimeState, ItemType, MapMeta, NpcQuestMarker, ObservationInsight, PlayerRealmState, PlayerSpecialStats, QuestLine, TechniqueAttrCurves, TechniqueGrade, TechniqueLayerDef, TechniqueState, VisibleBuffState, VisibleTile } from './types';

const PROTO_SCHEMA = `
syntax = "proto2";

message TickPayload {
  repeated TickRenderEntityPayload p = 1;
  repeated TilePatchPayload t = 2;
  repeated TickRenderEntityPayload e = 3;
  repeated StringPairPayload threatArrows = 4;
  repeated GroundItemPilePatchPayload g = 5;
  repeated CombatEffectPayload fx = 6;
  repeated VisibleTileRowPayload v = 7;
  optional uint32 dt = 8;
  optional string m = 9;
  optional MapMetaPayload mapMeta = 10;
  repeated PointPayload path = 11;
  optional uint32 hp = 12;
  optional uint32 qi = 13;
  optional uint32 f = 14;
  optional GameTimeStatePayload time = 15;
  optional string minimapJson = 16;
  optional string minimapLibraryJson = 17;
  optional string visibleMinimapMarkersJson = 18;
  optional uint32 auraLevelBaseValue = 19;
  repeated string r = 20;
}

message TickRenderEntityPayload {
  required string id = 1;
  required sint32 x = 2;
  required sint32 y = 3;
  optional string char = 4;
  optional string color = 5;
  optional string name = 6;
  optional bool clearName = 7;
  optional string kind = 8;
  optional bool clearKind = 9;
  optional sint32 hp = 10;
  optional bool clearHp = 11;
  optional sint32 maxHp = 12;
  optional bool clearMaxHp = 13;
  optional sint32 qi = 14;
  optional bool clearQi = 15;
  optional sint32 maxQi = 16;
  optional bool clearMaxQi = 17;
  optional NpcQuestMarkerPayload npcQuestMarker = 18;
  optional bool clearNpcQuestMarker = 19;
  optional string observationJson = 20;
  optional bool clearObservation = 21;
  optional string buffsJson = 22;
  optional bool clearBuffs = 23;
}

message NpcQuestMarkerPayload {
  optional string line = 1;
  optional string state = 2;
}

message TilePatchPayload {
  required sint32 x = 1;
  required sint32 y = 2;
  optional VisibleTileCellPayload tile = 3;
}

message GroundItemEntryPayload {
  required string itemKey = 1;
  required string name = 2;
  required uint32 count = 3;
  optional string itemId = 4;
  optional string type = 5;
  optional string grade = 6;
  optional string groundLabel = 7;
}

message GroundItemPilePatchPayload {
  required string sourceId = 1;
  required sint32 x = 2;
  required sint32 y = 3;
  repeated GroundItemEntryPayload items = 4;
  optional bool clearItems = 5;
}

message CombatEffectPayload {
  required string type = 1;
  optional sint32 fromX = 2;
  optional sint32 fromY = 3;
  optional sint32 toX = 4;
  optional sint32 toY = 5;
  optional string color = 6;
  optional sint32 x = 7;
  optional sint32 y = 8;
  optional string text = 9;
  optional string variant = 10;
}

message VisibleTileRowPayload {
  repeated VisibleTileCellPayload cells = 1;
}

message VisibleTileCellPayload {
  optional bool hidden = 1;
  optional string type = 2;
  optional bool walkable = 3;
  optional bool blocksSight = 4;
  optional sint32 aura = 5;
  optional string occupiedBy = 6;
  optional sint64 modifiedAt = 7;
  optional sint32 hp = 8;
  optional sint32 maxHp = 9;
  optional bool hpVisible = 10;
  optional string hiddenEntranceTitle = 11;
  optional string hiddenEntranceDesc = 12;
}

message PointPayload {
  required sint32 x = 1;
  required sint32 y = 2;
}

message StringPairPayload {
  required string left = 1;
  required string right = 2;
}

message MapMetaPayload {
  optional string id = 1;
  optional string name = 2;
  optional uint32 width = 3;
  optional uint32 height = 4;
  optional string parentMapId = 5;
  optional sint32 parentOriginX = 6;
  optional sint32 parentOriginY = 7;
  optional sint32 floorLevel = 8;
  optional string floorName = 9;
  optional string spaceVisionMode = 10;
  optional uint32 dangerLevel = 11;
  optional string recommendedRealm = 12;
  optional string description = 13;
  optional string routeDomain = 14;
}

message GameTimeStatePayload {
  optional uint32 totalTicks = 1;
  optional uint32 localTicks = 2;
  optional uint32 dayLength = 3;
  optional float timeScale = 4;
  optional string phase = 5;
  optional string phaseLabel = 6;
  optional uint32 darknessStacks = 7;
  optional float visionMultiplier = 8;
  optional float lightPercent = 9;
  optional uint32 effectiveViewRange = 10;
  optional string tint = 11;
  optional float overlayAlpha = 12;
}

message TechniqueUpdatePayload {
  repeated TechniqueUpdateEntryPayload techniques = 1;
  optional string cultivatingTechId = 2;
}

message TechniqueUpdateEntryPayload {
  required string techId = 1;
  required uint32 level = 2;
  required uint32 exp = 3;
  required uint32 expToNext = 4;
  required uint32 realm = 5;
  optional string name = 6;
  optional bool clearName = 7;
  optional string grade = 8;
  optional bool clearGrade = 9;
  optional string skillsJson = 10;
  optional bool clearSkills = 11;
  optional string layersJson = 12;
  optional bool clearLayers = 13;
  optional string attrCurvesJson = 14;
  optional bool clearAttrCurves = 15;
}

message ActionsUpdatePayload {
  repeated ActionUpdateEntryPayload actions = 1;
  optional bool autoBattle = 2;
  optional bool autoRetaliate = 3;
  optional bool autoIdleCultivation = 4;
  optional bool autoSwitchCultivation = 5;
  optional bool senseQiActive = 6;
  optional bool allowAoePlayerHit = 7;
}

message ActionUpdateEntryPayload {
  required string id = 1;
  required uint32 cooldownLeft = 2;
  optional bool autoBattleEnabled = 3;
  optional bool clearAutoBattleEnabled = 4;
  optional uint32 autoBattleOrder = 5;
  optional bool clearAutoBattleOrder = 6;
  optional string name = 7;
  optional bool clearName = 8;
  optional string type = 9;
  optional bool clearType = 10;
  optional string desc = 11;
  optional bool clearDesc = 12;
  optional uint32 range = 13;
  optional bool clearRange = 14;
  optional bool requiresTarget = 15;
  optional bool clearRequiresTarget = 16;
  optional string targetMode = 17;
  optional bool clearTargetMode = 18;
}

message AttrUpdatePayload {
  optional AttributesPayload baseAttrs = 1;
  optional string bonusesJson = 2;
  optional AttributesPayload finalAttrs = 3;
  optional NumericStatsPayload numericStats = 4;
  optional NumericRatioDivisorsPayload ratioDivisors = 5;
  optional uint32 maxHp = 6;
  optional uint32 qi = 7;
  optional string realmJson = 8;
  optional bool clearRealm = 9;
  optional uint32 boneAgeBaseYears = 10;
  optional double lifeElapsedTicks = 11;
  optional uint32 lifespanYears = 12;
  optional bool clearLifespanYears = 13;
  optional PlayerSpecialStatsPayload specialStats = 14;
}

message PlayerSpecialStatsPayload {
  optional uint32 foundation = 1;
  optional uint32 combatExp = 2;
}

message AttributesPayload {
  optional sint32 constitution = 1;
  optional sint32 spirit = 2;
  optional sint32 perception = 3;
  optional sint32 talent = 4;
  optional sint32 comprehension = 5;
  optional sint32 luck = 6;
}

message NumericStatsPayload {
  optional sint32 maxHp = 1;
  optional sint32 maxQi = 2;
  optional sint32 physAtk = 3;
  optional sint32 spellAtk = 4;
  optional sint32 physDef = 5;
  optional sint32 spellDef = 6;
  optional sint32 hit = 7;
  optional sint32 dodge = 8;
  optional sint32 crit = 9;
  optional sint32 critDamage = 10;
  optional sint32 breakPower = 11;
  optional sint32 resolvePower = 12;
  optional sint32 maxQiOutputPerTick = 13;
  optional sint32 qiRegenRate = 14;
  optional sint32 hpRegenRate = 15;
  optional sint32 cooldownSpeed = 16;
  optional sint32 auraCostReduce = 17;
  optional sint32 auraPowerRate = 18;
  optional sint32 playerExpRate = 19;
  optional sint32 techniqueExpRate = 20;
  optional sint32 realmExpPerTick = 21;
  optional sint32 techniqueExpPerTick = 22;
  optional sint32 lootRate = 23;
  optional sint32 rareLootRate = 24;
  optional sint32 viewRange = 25;
  optional sint32 moveSpeed = 26;
  optional ElementStatGroupPayload elementDamageBonus = 27;
  optional ElementStatGroupPayload elementDamageReduce = 28;
}

message NumericRatioDivisorsPayload {
  optional sint32 dodge = 1;
  optional sint32 crit = 2;
  optional sint32 breakPower = 3;
  optional sint32 resolvePower = 4;
  optional sint32 cooldownSpeed = 5;
  optional sint32 moveSpeed = 6;
  optional ElementStatGroupPayload elementDamageReduce = 7;
}

message ElementStatGroupPayload {
  optional sint32 metal = 1;
  optional sint32 wood = 2;
  optional sint32 water = 3;
  optional sint32 fire = 4;
  optional sint32 earth = 5;
}
`;

const root = protobuf.parse(PROTO_SCHEMA).root;
const tickPayloadType = root.lookupType('TickPayload');
const techniquePayloadType = root.lookupType('TechniqueUpdatePayload');
const actionsPayloadType = root.lookupType('ActionsUpdatePayload');
const attrPayloadType = root.lookupType('AttrUpdatePayload');

/** 需要 Protobuf 编码的 S2C 事件集合 */
const PROTOBUF_S2C_EVENTS = new Set<string>([
  S2C.Tick,
  S2C.AttrUpdate,
  S2C.TechniqueUpdate,
  S2C.ActionsUpdate,
]);

/** 需要 Protobuf 编码的 C2S 事件集合（当前为空） */
const PROTOBUF_C2S_EVENTS = new Set<string>();

export { PROTOBUF_S2C_EVENTS, PROTOBUF_C2S_EVENTS };

type BinaryPayload = ArrayBuffer | Uint8Array | { buffer: ArrayBufferLike; byteLength: number; byteOffset?: number };

function hasOwn<T extends object>(value: T, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function normalizeBinaryPayload(payload: unknown): Uint8Array | null {
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

function setNullableWireValue<T>(wire: Record<string, unknown>, valueKey: string, clearKey: string, value: T | null | undefined): void {
  if (value === null) {
    wire[clearKey] = true;
    return;
  }
  if (value !== undefined) {
    wire[valueKey] = value;
  }
}

function readNullableWireValue<T>(wire: Record<string, unknown>, valueKey: string, clearKey: string): T | null | undefined {
  if (wire[clearKey] === true) {
    return null;
  }
  if (hasOwn(wire, valueKey)) {
    return wire[valueKey] as T;
  }
  return undefined;
}

function toWireAttributes(attrs: Attributes | undefined): Record<string, number> | undefined {
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

function fromWireAttributes(wire: Record<string, unknown> | undefined): Attributes | undefined {
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

function toWireNumericStats(stats: NumericStats | undefined): Record<string, unknown> | undefined {
  if (!stats) {
    return undefined;
  }
  return cloneJson(stats) as unknown as Record<string, unknown>;
}

function fromWireNumericStats(wire: Record<string, unknown> | undefined): NumericStats | undefined {
  if (!wire) {
    return undefined;
  }
  return cloneJson(wire) as unknown as NumericStats;
}

function toWireRatioDivisors(divisors: NumericRatioDivisors | undefined): Record<string, unknown> | undefined {
  if (!divisors) {
    return undefined;
  }
  return cloneJson(divisors) as unknown as Record<string, unknown>;
}

function fromWireRatioDivisors(wire: Record<string, unknown> | undefined): NumericRatioDivisors | undefined {
  if (!wire) {
    return undefined;
  }
  return cloneJson(wire) as unknown as NumericRatioDivisors;
}

function toWireNpcQuestMarker(marker: NpcQuestMarker | undefined): Record<string, unknown> | undefined {
  if (!marker) {
    return undefined;
  }
  return {
    line: marker.line,
    state: marker.state,
  };
}

function fromWireNpcQuestMarker(wire: Record<string, unknown> | undefined): NpcQuestMarker | undefined {
  if (!wire) {
    return undefined;
  }
  return {
    line: String(wire.line ?? 'side') as QuestLine,
    state: String(wire.state ?? 'active') as NpcQuestMarker['state'],
  };
}

function toWireTickEntity(entity: TickRenderEntity): Record<string, unknown> {
  const wire: Record<string, unknown> = {
    id: entity.id,
    x: entity.x,
    y: entity.y,
  };
  if (entity.char !== undefined) wire.char = entity.char;
  if (entity.color !== undefined) wire.color = entity.color;
  setNullableWireValue(wire, 'name', 'clearName', entity.name);
  setNullableWireValue(wire, 'kind', 'clearKind', entity.kind);
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

function fromWireTickEntity(wire: Record<string, unknown>): TickRenderEntity {
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

function toWireVisibleTile(tile: VisibleTile): Record<string, unknown> {
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

function fromWireVisibleTile(wire: Record<string, unknown>): VisibleTile {
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

function toWireMapMeta(meta: MapMeta | undefined): Record<string, unknown> | undefined {
  if (!meta) {
    return undefined;
  }
  return cloneJson(meta) as unknown as Record<string, unknown>;
}

function fromWireMapMeta(wire: Record<string, unknown> | undefined): MapMeta | undefined {
  if (!wire) {
    return undefined;
  }
  return cloneJson(wire) as unknown as MapMeta;
}

function toWireGameTimeState(time: GameTimeState | undefined): Record<string, unknown> | undefined {
  if (!time) {
    return undefined;
  }
  return cloneJson(time) as unknown as Record<string, unknown>;
}

function fromWireGameTimeState(wire: Record<string, unknown> | undefined): GameTimeState | undefined {
  if (!wire) {
    return undefined;
  }
  return cloneJson(wire) as unknown as GameTimeState;
}

function toWireTechniqueEntry(entry: TechniqueUpdateEntry): Record<string, unknown> {
  const wire: Record<string, unknown> = {
    techId: entry.techId,
    level: entry.level,
    exp: entry.exp,
    expToNext: entry.expToNext,
    realm: entry.realm,
  };
  setNullableWireValue(wire, 'name', 'clearName', entry.name);
  setNullableWireValue(wire, 'grade', 'clearGrade', entry.grade);
  if (entry.skills === null) {
    wire.clearSkills = true;
  } else if (entry.skills !== undefined) {
    wire.skillsJson = JSON.stringify(entry.skills);
  }
  if (entry.layers === null) {
    wire.clearLayers = true;
  } else if (entry.layers !== undefined) {
    wire.layersJson = JSON.stringify(entry.layers);
  }
  if (entry.attrCurves === null) {
    wire.clearAttrCurves = true;
  } else if (entry.attrCurves !== undefined) {
    wire.attrCurvesJson = JSON.stringify(entry.attrCurves);
  }
  return wire;
}

function fromWireTechniqueEntry(wire: Record<string, unknown>): TechniqueUpdateEntry {
  const patch: TechniqueUpdateEntry = {
    techId: String(wire.techId ?? ''),
    level: Number(wire.level ?? 0),
    exp: Number(wire.exp ?? 0),
    expToNext: Number(wire.expToNext ?? 0),
    realm: Number(wire.realm ?? 0) as TechniqueState['realm'],
  };
  const name = readNullableWireValue<string>(wire, 'name', 'clearName');
  if (name !== undefined) patch.name = name;
  const grade = readNullableWireValue<TechniqueGrade>(wire, 'grade', 'clearGrade');
  if (grade !== undefined) patch.grade = grade;
  if (wire.clearSkills === true) {
    patch.skills = null;
  } else if (typeof wire.skillsJson === 'string') {
    patch.skills = parseJson<TechniqueState['skills']>(wire.skillsJson);
  }
  if (wire.clearLayers === true) {
    patch.layers = null;
  } else if (typeof wire.layersJson === 'string') {
    patch.layers = parseJson<TechniqueLayerDef[]>(wire.layersJson);
  }
  if (wire.clearAttrCurves === true) {
    patch.attrCurves = null;
  } else if (typeof wire.attrCurvesJson === 'string') {
    patch.attrCurves = parseJson<TechniqueAttrCurves>(wire.attrCurvesJson);
  }
  return patch;
}

function toWireActionEntry(entry: ActionUpdateEntry): Record<string, unknown> {
  const wire: Record<string, unknown> = {
    id: entry.id,
    cooldownLeft: entry.cooldownLeft,
  };
  setNullableWireValue(wire, 'autoBattleEnabled', 'clearAutoBattleEnabled', entry.autoBattleEnabled);
  setNullableWireValue(wire, 'autoBattleOrder', 'clearAutoBattleOrder', entry.autoBattleOrder);
  setNullableWireValue(wire, 'name', 'clearName', entry.name);
  setNullableWireValue(wire, 'type', 'clearType', entry.type);
  setNullableWireValue(wire, 'desc', 'clearDesc', entry.desc);
  setNullableWireValue(wire, 'range', 'clearRange', entry.range);
  setNullableWireValue(wire, 'requiresTarget', 'clearRequiresTarget', entry.requiresTarget);
  setNullableWireValue(wire, 'targetMode', 'clearTargetMode', entry.targetMode);
  return wire;
}

function fromWireActionEntry(wire: Record<string, unknown>): ActionUpdateEntry {
  const patch: ActionUpdateEntry = {
    id: String(wire.id ?? ''),
    cooldownLeft: Number(wire.cooldownLeft ?? 0),
  };
  const autoBattleEnabled = readNullableWireValue<boolean>(wire, 'autoBattleEnabled', 'clearAutoBattleEnabled');
  if (autoBattleEnabled !== undefined) patch.autoBattleEnabled = autoBattleEnabled;
  const autoBattleOrder = readNullableWireValue<number>(wire, 'autoBattleOrder', 'clearAutoBattleOrder');
  if (autoBattleOrder !== undefined) patch.autoBattleOrder = autoBattleOrder === null ? null : Number(autoBattleOrder);
  const name = readNullableWireValue<string>(wire, 'name', 'clearName');
  if (name !== undefined) patch.name = name;
  const type = readNullableWireValue<ActionDef['type']>(wire, 'type', 'clearType');
  if (type !== undefined) patch.type = type;
  const desc = readNullableWireValue<string>(wire, 'desc', 'clearDesc');
  if (desc !== undefined) patch.desc = desc;
  const range = readNullableWireValue<number>(wire, 'range', 'clearRange');
  if (range !== undefined) patch.range = range === null ? null : Number(range);
  const requiresTarget = readNullableWireValue<boolean>(wire, 'requiresTarget', 'clearRequiresTarget');
  if (requiresTarget !== undefined) patch.requiresTarget = requiresTarget;
  const targetMode = readNullableWireValue<ActionDef['targetMode']>(wire, 'targetMode', 'clearTargetMode');
  if (targetMode !== undefined) patch.targetMode = targetMode;
  return patch;
}

function toWirePlayerSpecialStats(payload: PlayerSpecialStats): Record<string, unknown> {
  return {
    foundation: payload.foundation,
    combatExp: payload.combatExp,
  };
}

function fromWirePlayerSpecialStats(wire: Record<string, unknown>): PlayerSpecialStats {
  return {
    foundation: Number(wire.foundation ?? 0),
    combatExp: Number(wire.combatExp ?? 0),
  };
}

function toWireTick(payload: S2C_Tick): Record<string, unknown> {
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
  if (payload.mapMeta) wire.mapMeta = toWireMapMeta(payload.mapMeta);
  if (payload.path) wire.path = payload.path.map(([x, y]) => ({ x, y }));
  if (payload.hp !== undefined) wire.hp = payload.hp;
  if (payload.qi !== undefined) wire.qi = payload.qi;
  if (payload.f !== undefined) wire.f = payload.f;
  if (payload.time) wire.time = toWireGameTimeState(payload.time);
  if (payload.minimap) wire.minimapJson = JSON.stringify(payload.minimap);
  if (payload.minimapLibrary) wire.minimapLibraryJson = JSON.stringify(payload.minimapLibrary);
  if (payload.visibleMinimapMarkers) wire.visibleMinimapMarkersJson = JSON.stringify(payload.visibleMinimapMarkers);
  if (payload.auraLevelBaseValue !== undefined) wire.auraLevelBaseValue = payload.auraLevelBaseValue;
  return wire;
}

function fromWireTick(wire: Record<string, unknown>): S2C_Tick {
  const payload: S2C_Tick = {
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
  if (Array.isArray(wire.fx)) payload.fx = cloneJson(wire.fx) as S2C_Tick['fx'];
  if (Array.isArray(wire.v)) {
    payload.v = wire.v.map((row) => {
      const rowWire = row as Record<string, unknown>;
      const cells = Array.isArray(rowWire.cells) ? rowWire.cells : [];
      return cells.map((cell) => fromWireVisibleTile(cell as Record<string, unknown>));
    });
  }
  if (hasOwn(wire, 'dt')) payload.dt = Number(wire.dt ?? 0);
  if (hasOwn(wire, 'm')) payload.m = String(wire.m ?? '');
  if (hasOwn(wire, 'mapMeta')) payload.mapMeta = fromWireMapMeta(wire.mapMeta as Record<string, unknown>);
  if (Array.isArray(wire.path)) {
    payload.path = wire.path.map((point) => {
      const entry = point as Record<string, unknown>;
      return [Number(entry.x ?? 0), Number(entry.y ?? 0)] as [number, number];
    });
  }
  if (hasOwn(wire, 'hp')) payload.hp = Number(wire.hp ?? 0);
  if (hasOwn(wire, 'qi')) payload.qi = Number(wire.qi ?? 0);
  if (hasOwn(wire, 'f')) payload.f = Number(wire.f ?? 0) as S2C_Tick['f'];
  if (hasOwn(wire, 'time')) payload.time = fromWireGameTimeState(wire.time as Record<string, unknown>);
  if (hasOwn(wire, 'minimapJson') && typeof wire.minimapJson === 'string') {
    payload.minimap = parseJson<S2C_Tick['minimap']>(wire.minimapJson);
  }
  if (hasOwn(wire, 'minimapLibraryJson') && typeof wire.minimapLibraryJson === 'string') {
    payload.minimapLibrary = parseJson<NonNullable<S2C_Tick['minimapLibrary']>>(wire.minimapLibraryJson);
  }
  if (hasOwn(wire, 'visibleMinimapMarkersJson') && typeof wire.visibleMinimapMarkersJson === 'string') {
    payload.visibleMinimapMarkers = parseJson<NonNullable<S2C_Tick['visibleMinimapMarkers']>>(wire.visibleMinimapMarkersJson);
  }
  if (hasOwn(wire, 'auraLevelBaseValue')) {
    payload.auraLevelBaseValue = Number(wire.auraLevelBaseValue ?? 0);
  }
  return payload;
}

function toWireTechniqueUpdate(payload: S2C_TechniqueUpdate): Record<string, unknown> {
  const wire: Record<string, unknown> = {
    techniques: payload.techniques.map(toWireTechniqueEntry),
  };
  if (payload.cultivatingTechId !== undefined) {
    wire.cultivatingTechId = payload.cultivatingTechId;
  }
  return wire;
}

function fromWireTechniqueUpdate(wire: Record<string, unknown>): S2C_TechniqueUpdate {
  return {
    techniques: Array.isArray(wire.techniques)
      ? wire.techniques.map((entry) => fromWireTechniqueEntry(entry as Record<string, unknown>))
      : [],
    cultivatingTechId: hasOwn(wire, 'cultivatingTechId') ? String(wire.cultivatingTechId ?? '') : undefined,
  };
}

function toWireActionsUpdate(payload: S2C_ActionsUpdate): Record<string, unknown> {
  const wire: Record<string, unknown> = {
    actions: payload.actions.map(toWireActionEntry),
  };
  if (payload.autoBattle !== undefined) wire.autoBattle = payload.autoBattle;
  if (payload.autoRetaliate !== undefined) wire.autoRetaliate = payload.autoRetaliate;
  if (payload.allowAoePlayerHit !== undefined) wire.allowAoePlayerHit = payload.allowAoePlayerHit;
  if (payload.autoIdleCultivation !== undefined) wire.autoIdleCultivation = payload.autoIdleCultivation;
  if (payload.autoSwitchCultivation !== undefined) wire.autoSwitchCultivation = payload.autoSwitchCultivation;
  if (payload.senseQiActive !== undefined) wire.senseQiActive = payload.senseQiActive;
  return wire;
}

function fromWireActionsUpdate(wire: Record<string, unknown>): S2C_ActionsUpdate {
  const payload: S2C_ActionsUpdate = {
    actions: Array.isArray(wire.actions)
      ? wire.actions.map((entry) => fromWireActionEntry(entry as Record<string, unknown>))
      : [],
  };
  if (hasOwn(wire, 'autoBattle')) payload.autoBattle = Boolean(wire.autoBattle);
  if (hasOwn(wire, 'autoRetaliate')) payload.autoRetaliate = Boolean(wire.autoRetaliate);
  if (hasOwn(wire, 'allowAoePlayerHit')) payload.allowAoePlayerHit = Boolean(wire.allowAoePlayerHit);
  if (hasOwn(wire, 'autoIdleCultivation')) payload.autoIdleCultivation = Boolean(wire.autoIdleCultivation);
  if (hasOwn(wire, 'autoSwitchCultivation')) payload.autoSwitchCultivation = Boolean(wire.autoSwitchCultivation);
  if (hasOwn(wire, 'senseQiActive')) payload.senseQiActive = Boolean(wire.senseQiActive);
  return payload;
}

function toWireAttrUpdate(payload: S2C_AttrUpdate): Record<string, unknown> {
  const wire: Record<string, unknown> = {};
  if (payload.baseAttrs) wire.baseAttrs = toWireAttributes(payload.baseAttrs);
  if (payload.bonuses !== undefined) wire.bonusesJson = JSON.stringify(payload.bonuses);
  if (payload.finalAttrs) wire.finalAttrs = toWireAttributes(payload.finalAttrs);
  if (payload.numericStats) wire.numericStats = toWireNumericStats(payload.numericStats);
  if (payload.ratioDivisors) wire.ratioDivisors = toWireRatioDivisors(payload.ratioDivisors);
  if (payload.maxHp !== undefined) wire.maxHp = payload.maxHp;
  if (payload.qi !== undefined) wire.qi = payload.qi;
  if (payload.specialStats) wire.specialStats = toWirePlayerSpecialStats(payload.specialStats);
  if (payload.boneAgeBaseYears !== undefined) wire.boneAgeBaseYears = payload.boneAgeBaseYears;
  if (payload.lifeElapsedTicks !== undefined) wire.lifeElapsedTicks = payload.lifeElapsedTicks;
  if (payload.lifespanYears === null) {
    wire.clearLifespanYears = true;
  } else if (payload.lifespanYears !== undefined) {
    wire.lifespanYears = payload.lifespanYears;
  }
  if (payload.realm === null) {
    wire.clearRealm = true;
  } else if (payload.realm !== undefined) {
    wire.realmJson = JSON.stringify(payload.realm);
  }
  return wire;
}

function fromWireAttrUpdate(wire: Record<string, unknown>): S2C_AttrUpdate {
  const payload: S2C_AttrUpdate = {};
  if (hasOwn(wire, 'baseAttrs')) payload.baseAttrs = fromWireAttributes(wire.baseAttrs as Record<string, unknown>);
  if (typeof wire.bonusesJson === 'string') payload.bonuses = parseJson<AttrBonus[]>(wire.bonusesJson);
  if (hasOwn(wire, 'finalAttrs')) payload.finalAttrs = fromWireAttributes(wire.finalAttrs as Record<string, unknown>);
  if (hasOwn(wire, 'numericStats')) payload.numericStats = fromWireNumericStats(wire.numericStats as Record<string, unknown>);
  if (hasOwn(wire, 'ratioDivisors')) payload.ratioDivisors = fromWireRatioDivisors(wire.ratioDivisors as Record<string, unknown>);
  if (hasOwn(wire, 'maxHp')) payload.maxHp = Number(wire.maxHp ?? 0);
  if (hasOwn(wire, 'qi')) payload.qi = Number(wire.qi ?? 0);
  if (hasOwn(wire, 'specialStats')) payload.specialStats = fromWirePlayerSpecialStats(wire.specialStats as Record<string, unknown>);
  if (hasOwn(wire, 'boneAgeBaseYears')) payload.boneAgeBaseYears = Number(wire.boneAgeBaseYears ?? 0);
  if (hasOwn(wire, 'lifeElapsedTicks')) payload.lifeElapsedTicks = Number(wire.lifeElapsedTicks ?? 0);
  if (wire.clearLifespanYears === true) {
    payload.lifespanYears = null;
  } else if (hasOwn(wire, 'lifespanYears')) {
    payload.lifespanYears = Number(wire.lifespanYears ?? 0);
  }
  if (wire.clearRealm === true) {
    payload.realm = null;
  } else if (typeof wire.realmJson === 'string') {
    payload.realm = parseJson<PlayerRealmState>(wire.realmJson);
  }
  return payload;
}

function encodeMessage(type: protobuf.Type, payload: Record<string, unknown>): Uint8Array {
  const message = type.fromObject(payload);
  return type.encode(message).finish();
}

function decodeMessage(type: protobuf.Type, payload: Uint8Array): Record<string, unknown> {
  return type.toObject(type.decode(payload), {
    defaults: false,
    longs: Number,
  }) as Record<string, unknown>;
}

/** 服务端发送前将 payload 编码为 Protobuf 二进制（非 Protobuf 事件原样返回） */
export function encodeServerEventPayload<T>(event: string, payload: T): T | Uint8Array {
  switch (event) {
    case S2C.Tick:
      return encodeMessage(tickPayloadType, toWireTick(payload as S2C_Tick));
    case S2C.AttrUpdate:
      return encodeMessage(attrPayloadType, toWireAttrUpdate(payload as S2C_AttrUpdate));
    case S2C.TechniqueUpdate:
      return encodeMessage(techniquePayloadType, toWireTechniqueUpdate(payload as S2C_TechniqueUpdate));
    case S2C.ActionsUpdate:
      return encodeMessage(actionsPayloadType, toWireActionsUpdate(payload as S2C_ActionsUpdate));
    default:
      return payload;
  }
}

/** 客户端收到后将 Protobuf 二进制解码为业务对象（非二进制原样返回） */
export function decodeServerEventPayload<T>(event: string, payload: unknown): T {
  const binary = normalizeBinaryPayload(payload);
  if (!binary) {
    return payload as T;
  }
  switch (event) {
    case S2C.Tick:
      return fromWireTick(decodeMessage(tickPayloadType, binary)) as T;
    case S2C.AttrUpdate:
      return fromWireAttrUpdate(decodeMessage(attrPayloadType, binary)) as T;
    case S2C.TechniqueUpdate:
      return fromWireTechniqueUpdate(decodeMessage(techniquePayloadType, binary)) as T;
    case S2C.ActionsUpdate:
      return fromWireActionsUpdate(decodeMessage(actionsPayloadType, binary)) as T;
    default:
      return payload as T;
  }
}

/** 客户端发送前编码（当前直接透传） */
export function encodeClientEventPayload<T>(event: string, payload: T): T {
  if (PROTOBUF_C2S_EVENTS.has(event)) {
    return payload;
  }
  return payload;
}

/** 判断 payload 是否为二进制格式 */
export function isBinaryPayload(payload: unknown): payload is BinaryPayload {
  return normalizeBinaryPayload(payload) !== null;
}
