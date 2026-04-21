import type { ActionDef } from './action-combat-types';
import type { AttrBonus } from './attribute-types';
import type { BodyTrainingState, TechniqueAttrCurves, TechniqueCategory, TechniqueGrade, TechniqueLayerDef, TechniqueState } from './cultivation-types';
import type { ActionUpdateEntryView as ActionUpdateEntry, TechniqueUpdateEntryView as TechniqueUpdateEntry } from './panel-update-types';
import type { NEXT_S2C_ActionsUpdate, NEXT_S2C_AttrUpdate, NEXT_S2C_TechniqueUpdate } from './protocol';
import {
  fromWirePartialAttributes,
  fromWirePartialNumericStats,
  fromWirePartialPlayerSpecialStats,
  fromWirePartialRatioDivisors,
  hasOwn,
  parseJson,
  readNullableWireValue,
  setNullableWireValue,
  toWirePartialAttributes,
  toWirePartialNumericStats,
  toWirePartialPlayerSpecialStats,
  toWirePartialRatioDivisors,
} from './network-protobuf-wire-helpers';

/** 将功法增量条目转换为 wire 结构。 */
export function toWireTechniqueEntry(entry: TechniqueUpdateEntry): Record<string, unknown> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const wire: Record<string, unknown> = {
    techId: entry.techId,
  };
  if (entry.level !== undefined) wire.level = entry.level;
  if (entry.exp !== undefined) wire.exp = entry.exp;
  if (entry.expToNext !== undefined) wire.expToNext = entry.expToNext;
  if (entry.realmLv !== undefined) wire.realmLv = entry.realmLv;
  if (entry.realm !== undefined) wire.realm = entry.realm;
  setNullableWireValue(wire, 'name', 'clearName', entry.name);
  setNullableWireValue(wire, 'grade', 'clearGrade', entry.grade);
  setNullableWireValue(wire, 'category', 'clearCategory', entry.category);
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

/** 从 wire 结构还原功法增量条目。 */
export function fromWireTechniqueEntry(wire: Record<string, unknown>): TechniqueUpdateEntry {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const patch: TechniqueUpdateEntry = {
    techId: String(wire.techId ?? ''),
  };
  if (hasOwn(wire, 'level')) patch.level = Number(wire.level ?? 0);
  if (hasOwn(wire, 'exp')) patch.exp = Number(wire.exp ?? 0);
  if (hasOwn(wire, 'expToNext')) patch.expToNext = Number(wire.expToNext ?? 0);
  if (hasOwn(wire, 'realmLv')) patch.realmLv = Number(wire.realmLv ?? 1);
  if (hasOwn(wire, 'realm')) patch.realm = Number(wire.realm ?? 0) as TechniqueState['realm'];
  const name = readNullableWireValue<string>(wire, 'name', 'clearName');
  if (name !== undefined) patch.name = name;
  const grade = readNullableWireValue<TechniqueGrade>(wire, 'grade', 'clearGrade');
  if (grade !== undefined) patch.grade = grade;
  const category = readNullableWireValue<TechniqueCategory>(wire, 'category', 'clearCategory');
  if (category !== undefined) patch.category = category;
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

/** 将行动增量条目转换为 wire 结构。 */
export function toWireActionEntry(entry: ActionUpdateEntry): Record<string, unknown> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const wire: Record<string, unknown> = {
    id: entry.id,
  };
  if (entry.cooldownLeft !== undefined) {
    wire.cooldownLeft = entry.cooldownLeft;
  }
  setNullableWireValue(wire, 'autoBattleEnabled', 'clearAutoBattleEnabled', entry.autoBattleEnabled);
  setNullableWireValue(wire, 'autoBattleOrder', 'clearAutoBattleOrder', entry.autoBattleOrder);
  setNullableWireValue(wire, 'skillEnabled', 'clearSkillEnabled', entry.skillEnabled);
  setNullableWireValue(wire, 'name', 'clearName', entry.name);
  setNullableWireValue(wire, 'type', 'clearType', entry.type);
  setNullableWireValue(wire, 'desc', 'clearDesc', entry.desc);
  setNullableWireValue(wire, 'range', 'clearRange', entry.range);
  setNullableWireValue(wire, 'requiresTarget', 'clearRequiresTarget', entry.requiresTarget);
  setNullableWireValue(wire, 'targetMode', 'clearTargetMode', entry.targetMode);
  return wire;
}

/** 从 wire 结构还原行动增量条目。 */
export function fromWireActionEntry(wire: Record<string, unknown>): ActionUpdateEntry {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const patch: ActionUpdateEntry = {
    id: String(wire.id ?? ''),
  };
  if (hasOwn(wire, 'cooldownLeft')) patch.cooldownLeft = Number(wire.cooldownLeft ?? 0);
  const autoBattleEnabled = readNullableWireValue<boolean>(wire, 'autoBattleEnabled', 'clearAutoBattleEnabled');
  if (autoBattleEnabled !== undefined) patch.autoBattleEnabled = autoBattleEnabled;
  const autoBattleOrder = readNullableWireValue<number>(wire, 'autoBattleOrder', 'clearAutoBattleOrder');
  if (autoBattleOrder !== undefined) patch.autoBattleOrder = autoBattleOrder === null ? null : Number(autoBattleOrder);
  const skillEnabled = readNullableWireValue<boolean>(wire, 'skillEnabled', 'clearSkillEnabled');
  if (skillEnabled !== undefined) patch.skillEnabled = skillEnabled;
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

/** 将功法更新包转换为 wire 结构。 */
export function toWireTechniqueUpdate(payload: NEXT_S2C_TechniqueUpdate): Record<string, unknown> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const wire: Record<string, unknown> = {
    techniques: payload.techniques.map(toWireTechniqueEntry),
  };
  if (payload.cultivatingTechId === null) {
    wire.clearCultivatingTechId = true;
  } else if (payload.cultivatingTechId !== undefined) {
    wire.cultivatingTechId = payload.cultivatingTechId;
  }
  if (payload.removeTechniqueIds) {
    wire.removeTechniqueIds = [...payload.removeTechniqueIds];
  }
  if (payload.bodyTraining === null) {
    wire.clearBodyTraining = true;
  } else if (payload.bodyTraining !== undefined) {
    wire.bodyTrainingJson = JSON.stringify(payload.bodyTraining);
  }
  return wire;
}

/** 从 wire 结构还原功法更新包。 */
export function fromWireTechniqueUpdate(wire: Record<string, unknown>): NEXT_S2C_TechniqueUpdate {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const payload: NEXT_S2C_TechniqueUpdate = {
    techniques: Array.isArray(wire.techniques)
      ? wire.techniques.map((entry) => fromWireTechniqueEntry(entry as Record<string, unknown>))
      : [],
  };
  if (wire.clearCultivatingTechId === true) {
    payload.cultivatingTechId = null;
  } else if (hasOwn(wire, 'cultivatingTechId')) {
    payload.cultivatingTechId = String(wire.cultivatingTechId ?? '');
  }
  if (Array.isArray(wire.removeTechniqueIds)) {
    payload.removeTechniqueIds = wire.removeTechniqueIds
      .map((entry) => String(entry ?? ''))
      .filter((entry) => entry.length > 0);
  }
  if (wire.clearBodyTraining === true) {
    payload.bodyTraining = null;
  } else if (typeof wire.bodyTrainingJson === 'string') {
    payload.bodyTraining = parseJson<BodyTrainingState>(wire.bodyTrainingJson);
  }
  return payload;
}

/** 将行动更新包转换为 wire 结构。 */
export function toWireActionsUpdate(payload: NEXT_S2C_ActionsUpdate): Record<string, unknown> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const wire: Record<string, unknown> = {
    actions: payload.actions.map(toWireActionEntry),
  };
  if (payload.removeActionIds) wire.removeActionIds = [...payload.removeActionIds];
  if (payload.actionOrder) wire.actionOrder = [...payload.actionOrder];
  if (payload.autoBattle !== undefined) wire.autoBattle = payload.autoBattle;
  if (payload.autoRetaliate !== undefined) wire.autoRetaliate = payload.autoRetaliate;
  if (payload.autoBattleStationary !== undefined) wire.autoBattleStationary = payload.autoBattleStationary;
  if (payload.allowAoePlayerHit !== undefined) wire.allowAoePlayerHit = payload.allowAoePlayerHit;
  if (payload.autoIdleCultivation !== undefined) wire.autoIdleCultivation = payload.autoIdleCultivation;
  if (payload.autoSwitchCultivation !== undefined) wire.autoSwitchCultivation = payload.autoSwitchCultivation;
  if (payload.cultivationActive !== undefined) wire.cultivationActive = payload.cultivationActive;
  if (payload.senseQiActive !== undefined) wire.senseQiActive = payload.senseQiActive;
  return wire;
}

/** 从 wire 结构还原行动更新包。 */
export function fromWireActionsUpdate(wire: Record<string, unknown>): NEXT_S2C_ActionsUpdate {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const payload: NEXT_S2C_ActionsUpdate = {
    actions: Array.isArray(wire.actions)
      ? wire.actions.map((entry) => fromWireActionEntry(entry as Record<string, unknown>))
      : [],
  };
  if (Array.isArray(wire.removeActionIds)) {
    payload.removeActionIds = wire.removeActionIds
      .map((entry) => String(entry ?? ''))
      .filter((entry) => entry.length > 0);
  }
  if (Array.isArray(wire.actionOrder)) {
    payload.actionOrder = wire.actionOrder
      .map((entry) => String(entry ?? ''))
      .filter((entry) => entry.length > 0);
  }
  if (hasOwn(wire, 'autoBattle')) payload.autoBattle = Boolean(wire.autoBattle);
  if (hasOwn(wire, 'autoRetaliate')) payload.autoRetaliate = Boolean(wire.autoRetaliate);
  if (hasOwn(wire, 'autoBattleStationary')) payload.autoBattleStationary = Boolean(wire.autoBattleStationary);
  if (hasOwn(wire, 'allowAoePlayerHit')) payload.allowAoePlayerHit = Boolean(wire.allowAoePlayerHit);
  if (hasOwn(wire, 'autoIdleCultivation')) payload.autoIdleCultivation = Boolean(wire.autoIdleCultivation);
  if (hasOwn(wire, 'autoSwitchCultivation')) payload.autoSwitchCultivation = Boolean(wire.autoSwitchCultivation);
  if (hasOwn(wire, 'cultivationActive')) payload.cultivationActive = Boolean(wire.cultivationActive);
  if (hasOwn(wire, 'senseQiActive')) payload.senseQiActive = Boolean(wire.senseQiActive);
  return payload;
}

/** 将属性更新包转换为 wire 结构。 */
export function toWireAttrUpdate(payload: NEXT_S2C_AttrUpdate): Record<string, unknown> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const wire: Record<string, unknown> = {};
  if (payload.baseAttrs) wire.baseAttrs = toWirePartialAttributes(payload.baseAttrs);
  if (payload.bonuses !== undefined) wire.bonusesJson = JSON.stringify(payload.bonuses);
  if (payload.finalAttrs) wire.finalAttrs = toWirePartialAttributes(payload.finalAttrs);
  if (payload.numericStats) wire.numericStats = toWirePartialNumericStats(payload.numericStats);
  if (payload.ratioDivisors) wire.ratioDivisors = toWirePartialRatioDivisors(payload.ratioDivisors);
  if (payload.numericStatBreakdowns !== undefined) wire.numericStatBreakdownsJson = JSON.stringify(payload.numericStatBreakdowns);
  if (payload.maxHp !== undefined) wire.maxHp = payload.maxHp;
  if (payload.qi !== undefined) wire.qi = payload.qi;
  if (payload.specialStats) wire.specialStats = toWirePartialPlayerSpecialStats(payload.specialStats);
  if (payload.boneAgeBaseYears !== undefined) wire.boneAgeBaseYears = payload.boneAgeBaseYears;
  if (payload.lifeElapsedTicks !== undefined) wire.lifeElapsedTicks = payload.lifeElapsedTicks;
  if (payload.realmProgress !== undefined) wire.realmProgress = payload.realmProgress;
  if (payload.realmProgressToNext !== undefined) wire.realmProgressToNext = payload.realmProgressToNext;
  if (payload.realmBreakthroughReady !== undefined) wire.realmBreakthroughReady = payload.realmBreakthroughReady;
  if (payload.lifespanYears === null) {
    wire.clearLifespanYears = true;
  } else if (payload.lifespanYears !== undefined) {
    wire.lifespanYears = payload.lifespanYears;
  }
  return wire;
}

/** 从 wire 结构还原属性更新包。 */
export function fromWireAttrUpdate(wire: Record<string, unknown>): NEXT_S2C_AttrUpdate {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const payload: NEXT_S2C_AttrUpdate = {};
  if (hasOwn(wire, 'baseAttrs')) payload.baseAttrs = fromWirePartialAttributes(wire.baseAttrs as Record<string, unknown>);
  if (typeof wire.bonusesJson === 'string') payload.bonuses = parseJson<AttrBonus[]>(wire.bonusesJson);
  if (hasOwn(wire, 'finalAttrs')) payload.finalAttrs = fromWirePartialAttributes(wire.finalAttrs as Record<string, unknown>);
  if (hasOwn(wire, 'numericStats')) payload.numericStats = fromWirePartialNumericStats(wire.numericStats as Record<string, unknown>);
  if (hasOwn(wire, 'ratioDivisors')) payload.ratioDivisors = fromWirePartialRatioDivisors(wire.ratioDivisors as Record<string, unknown>);
  if (typeof wire.numericStatBreakdownsJson === 'string') payload.numericStatBreakdowns = parseJson(wire.numericStatBreakdownsJson);
  if (hasOwn(wire, 'maxHp')) payload.maxHp = Number(wire.maxHp ?? 0);
  if (hasOwn(wire, 'qi')) payload.qi = Number(wire.qi ?? 0);
  if (hasOwn(wire, 'specialStats')) payload.specialStats = fromWirePartialPlayerSpecialStats(wire.specialStats as Record<string, unknown>);
  if (hasOwn(wire, 'boneAgeBaseYears')) payload.boneAgeBaseYears = Number(wire.boneAgeBaseYears ?? 0);
  if (hasOwn(wire, 'lifeElapsedTicks')) payload.lifeElapsedTicks = Number(wire.lifeElapsedTicks ?? 0);
  if (hasOwn(wire, 'realmProgress')) payload.realmProgress = Number(wire.realmProgress ?? 0);
  if (hasOwn(wire, 'realmProgressToNext')) payload.realmProgressToNext = Number(wire.realmProgressToNext ?? 0);
  if (hasOwn(wire, 'realmBreakthroughReady')) payload.realmBreakthroughReady = Boolean(wire.realmBreakthroughReady);
  if (wire.clearLifespanYears === true) {
    payload.lifespanYears = null;
  } else if (hasOwn(wire, 'lifespanYears')) {
    payload.lifespanYears = Number(wire.lifespanYears ?? 0);
  }
  return payload;
}
