/**
 * Protobuf schema 常量层：只负责声明 next 高频同步包的 message 结构与 lookup 结果。
 */
import protobuf from 'protobufjs';

/** 内联 protobuf2 schema，定义 Tick、属性、功法和行动增量的二进制布局。 */
const PROTO_SCHEMA = `
syntax = "proto2";

message TickPayload {
  repeated TickRenderEntityPayload p = 1;
  repeated TilePatchPayload t = 2;
  repeated TickRenderEntityPayload e = 3;
  repeated StringPairPayload threatArrows = 4;
  repeated StringPairPayload threatArrowAdds = 21;
  repeated StringPairPayload threatArrowRemoves = 22;
  repeated GroundItemPilePatchPayload g = 5;
  repeated CombatEffectPayload fx = 6;
  repeated VisibleTileRowPayload v = 7;
  optional uint32 dt = 8;
  optional string m = 9;
  repeated PointPayload path = 11;
  optional uint32 hp = 12;
  optional uint32 qi = 13;
  optional uint32 f = 14;
  optional GameTimeStatePayload time = 15;
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
  optional string monsterTier = 10;
  optional bool clearMonsterTier = 11;
  optional float monsterScale = 12;
  optional bool clearMonsterScale = 13;
  optional sint32 hp = 14;
  optional bool clearHp = 15;
  optional sint32 maxHp = 16;
  optional bool clearMaxHp = 17;
  optional sint32 qi = 18;
  optional bool clearQi = 19;
  optional sint32 maxQi = 20;
  optional bool clearMaxQi = 21;
  optional NpcQuestMarkerPayload npcQuestMarker = 22;
  optional bool clearNpcQuestMarker = 23;
  optional string observationJson = 24;
  optional bool clearObservation = 25;
  optional string buffsJson = 26;
  optional bool clearBuffs = 27;
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
  repeated PointPayload cells = 11;
  optional uint32 durationMs = 12;
  optional string actionStyle = 13;
  optional string baseColor = 14;
  optional sint32 originX = 15;
  optional sint32 originY = 16;
}

message VisibleTileRowPayload {
  repeated VisibleTileCellPayload cells = 1;
}

message TileRuntimeResourcePayload {
  optional string key = 1;
  optional string label = 2;
  optional sint32 value = 3;
  optional sint32 effectiveValue = 4;
  optional sint32 level = 5;
  optional sint32 sourceValue = 6;
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
  repeated TileRuntimeResourcePayload resources = 13;
}

message PointPayload {
  required sint32 x = 1;
  required sint32 y = 2;
}

message StringPairPayload {
  required string left = 1;
  required string right = 2;
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
  optional bool clearCultivatingTechId = 3;
  repeated string removeTechniqueIds = 4;
  optional string bodyTrainingJson = 5;
  optional bool clearBodyTraining = 6;
}

message TechniqueUpdateEntryPayload {
  required string techId = 1;
  optional uint32 level = 2;
  optional uint32 exp = 3;
  optional uint32 expToNext = 4;
  optional uint32 realm = 5;
  optional uint32 realmLv = 16;
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
  optional string category = 17;
  optional bool clearCategory = 18;
}

message ActionsUpdatePayload {
  repeated ActionUpdateEntryPayload actions = 1;
  optional bool autoBattle = 2;
  optional bool autoRetaliate = 3;
  optional bool autoIdleCultivation = 4;
  optional bool autoSwitchCultivation = 5;
  optional bool senseQiActive = 6;
  optional bool allowAoePlayerHit = 7;
  optional bool autoBattleStationary = 8;
  repeated string removeActionIds = 9;
  repeated string actionOrder = 10;
  optional bool cultivationActive = 11;
}

message ActionUpdateEntryPayload {
  required string id = 1;
  optional uint32 cooldownLeft = 2;
  optional bool autoBattleEnabled = 3;
  optional bool clearAutoBattleEnabled = 4;
  optional uint32 autoBattleOrder = 5;
  optional bool clearAutoBattleOrder = 6;
  optional bool skillEnabled = 7;
  optional bool clearSkillEnabled = 8;
  optional string name = 9;
  optional bool clearName = 10;
  optional string type = 11;
  optional bool clearType = 12;
  optional string desc = 13;
  optional bool clearDesc = 14;
  optional uint32 range = 15;
  optional bool clearRange = 16;
  optional bool requiresTarget = 17;
  optional bool clearRequiresTarget = 18;
  optional string targetMode = 19;
  optional bool clearTargetMode = 20;
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
  optional uint32 realmProgress = 15;
  optional uint32 realmProgressToNext = 16;
  optional bool realmBreakthroughReady = 17;
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
  optional sint32 extraAggroRate = 27;
  optional sint32 extraRange = 28;
  optional sint32 extraArea = 29;
  optional ElementStatGroupPayload elementDamageBonus = 30;
  optional ElementStatGroupPayload elementDamageReduce = 31;
  optional sint32 antiCrit = 32;
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

/** Tick 增量包的 protobuf 类型。 */
export const tickPayloadType = root.lookupType('TickPayload');
/** 功法增量包的 protobuf 类型。 */
export const techniquePayloadType = root.lookupType('TechniqueUpdatePayload');
/** 行动列表增量包的 protobuf 类型。 */
export const actionsPayloadType = root.lookupType('ActionsUpdatePayload');
/** 属性面板增量包的 protobuf 类型。 */
export const attrPayloadType = root.lookupType('AttrUpdatePayload');

/** 走 protobuf 二进制编码的 S2C 事件集合；当前 next 主链未启用独立 protobuf 事件。 */
export const PROTOBUF_NEXT_S2C_EVENTS = new Set<string>();

/** 走 protobuf 二进制编码的 C2S 事件集合；如重新引入需同步更新 shared/server 校验脚本。 */
export const PROTOBUF_NEXT_C2S_EVENTS = new Set<string>();
