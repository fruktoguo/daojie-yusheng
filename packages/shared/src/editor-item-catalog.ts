/**
 * GM 编辑器物品目录构建器：统一服务端、配置编辑器与客户端本地目录字段口径。
 */
import type { GmEditorItemOption } from './api-contracts';
import type { TechniqueGrade } from './cultivation-types';
import type { EquipSlot, ItemType } from './item-runtime-types';
import { EQUIP_SLOTS } from './constants/gameplay/equipment';
import { ITEM_TYPES } from './constants/gameplay/inventory';
import { TECHNIQUE_GRADE_ORDER } from './constants/gameplay/technique';
import { DEFAULT_QI_RESOURCE_DESCRIPTOR, buildQiResourceKey } from './qi';
import { compileEquipmentBaselinePercentsToActualStats, compileValueStatsToActualStats } from './value';
import { normalizeCraftEffectStatsPatch } from './craft-effect-stats';

const MATERIAL_CATEGORIES = new Set(['herb', 'exotic', 'ore']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function cloneJson<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

function normalizeTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizePositiveInteger(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(1, Math.trunc(numeric)) : undefined;
}

function normalizeNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric) : undefined;
}

function normalizeTechniqueGrade(value: unknown): TechniqueGrade | undefined {
  return TECHNIQUE_GRADE_ORDER.includes(value as TechniqueGrade) ? value as TechniqueGrade : undefined;
}

function cloneRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? cloneJson(value) : undefined;
}

function cloneArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? cloneJson(value) : undefined;
}

function normalizeMaterialValues(source: Record<string, unknown>): GmEditorItemOption['materialValues'] {
  if (isRecord(source.materialValues)) return cloneJson(source.materialValues) as GmEditorItemOption['materialValues'];
  if (!isRecord(source.materialElementValues)) return undefined;
  const elements: Record<string, number> = {};
  for (const key of ['metal', 'wood', 'water', 'fire', 'earth']) {
    const value = Number(source.materialElementValues[key]);
    if (Number.isFinite(value) && value !== 0) elements[key] = Math.trunc(value);
  }
  return Object.keys(elements).length > 0 ? { elements } : undefined;
}

function normalizeTags(raw: unknown, materialCategory: unknown): string[] | undefined {
  const tags = new Set(Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim())).map((entry) => entry.trim()) : []);
  if (materialCategory === 'herb') tags.add('药材');
  if (materialCategory === 'exotic') tags.add('异材');
  if (materialCategory === 'ore') {
    tags.add('矿石');
    tags.add('矿材');
  }
  return tags.size > 0 ? [...tags] : undefined;
}

function normalizeTileResourceGains(source: Record<string, unknown>): GmEditorItemOption['tileResourceGains'] {
  const gains = Array.isArray(source.tileResourceGains)
    ? source.tileResourceGains
      .filter((entry): entry is Record<string, unknown> => isRecord(entry))
      .map((entry) => ({ resourceKey: normalizeTrimmedString(entry.resourceKey) ?? '', amount: normalizeNumber(entry.amount) ?? Number.NaN }))
      .filter((entry) => entry.resourceKey && Number.isFinite(entry.amount) && entry.amount > 0)
    : [];
  if (gains.length > 0) return gains;
  const amount = normalizeNumber(source.tileAuraGainAmount);
  return amount && amount > 0 ? [{ resourceKey: buildQiResourceKey(DEFAULT_QI_RESOURCE_DESCRIPTOR), amount }] : undefined;
}

/** 将物品模板或已归一化模板构造成 GM 编辑器目录项。 */
export function buildGmEditorItemOptionFromTemplate(raw: unknown): GmEditorItemOption | null {
  if (!isRecord(raw)) return null;
  const itemId = normalizeTrimmedString(raw.itemId);
  const name = normalizeTrimmedString(raw.name);
  if (!itemId || !name) return null;

  const materialCategory = MATERIAL_CATEGORIES.has(String(raw.materialCategory)) ? raw.materialCategory as GmEditorItemOption['materialCategory'] : undefined;
  const grade = normalizeTechniqueGrade(raw.grade);
  const level = normalizePositiveInteger(raw.level);
  const baselineStats = compileEquipmentBaselinePercentsToActualStats(cloneRecord(raw.equipBaselinePercents), { grade, level });
  const compiledValueStats = compileValueStatsToActualStats(cloneRecord(raw.equipValueStats));
  const tileResourceGains = normalizeTileResourceGains(raw);
  const tileAuraGainAmount = normalizeNumber(raw.tileAuraGainAmount)
    ?? tileResourceGains?.find((entry) => entry.resourceKey === buildQiResourceKey(DEFAULT_QI_RESOURCE_DESCRIPTOR))?.amount;

  return {
    itemId,
    name,
    type: ITEM_TYPES.includes(raw.type as ItemType) ? raw.type as ItemType : 'material',
    groundLabel: normalizeTrimmedString(raw.groundLabel),
    grade,
    level,
    materialCategory,
    materialValues: normalizeMaterialValues(raw),
    equipSlot: EQUIP_SLOTS.includes(raw.equipSlot as EquipSlot) ? raw.equipSlot as EquipSlot : undefined,
    desc: typeof raw.desc === 'string' ? raw.desc : undefined,
    equipAttrs: cloneRecord(raw.equipAttrs) as GmEditorItemOption['equipAttrs'],
    equipStats: (baselineStats ?? compiledValueStats ?? cloneRecord(raw.equipStats)) as GmEditorItemOption['equipStats'],
    equipValueStats: baselineStats ? undefined : cloneRecord(raw.equipValueStats) as GmEditorItemOption['equipValueStats'],
    equipSpecialStats: cloneRecord(raw.equipSpecialStats) as GmEditorItemOption['equipSpecialStats'],
    tags: normalizeTags(raw.tags, materialCategory),
    contextActions: cloneArray(raw.contextActions) as GmEditorItemOption['contextActions'],
    effects: cloneArray(raw.effects) as GmEditorItemOption['effects'],
    artifactMaxQiFactor: normalizeNumber(raw.artifactMaxQiFactor),
    artifactEffects: cloneArray(raw.artifactEffects) as GmEditorItemOption['artifactEffects'],
    healAmount: normalizePositiveInteger(raw.healAmount),
    healPercent: normalizeNumber(raw.healPercent),
    baselineHealPercent: normalizeNumber(raw.baselineHealPercent),
    baselineQiPercent: normalizeNumber(raw.baselineQiPercent),
    qiPercent: normalizeNumber(raw.qiPercent),
    cooldown: normalizeNumber(raw.cooldown),
    marketTradable: raw.marketTradable === false ? false : undefined,
    consumeBuffs: cloneArray(raw.consumeBuffs) as GmEditorItemOption['consumeBuffs'],
    enhanceLevel: normalizeNumber(raw.enhanceLevel),
    craftEffectStats: normalizeCraftEffectStatsPatch(raw.craftEffectStats as never),
    mapUnlockId: normalizeTrimmedString(raw.mapUnlockId),
    mapUnlockIds: Array.isArray(raw.mapUnlockIds) ? raw.mapUnlockIds.map(normalizeTrimmedString).filter((entry): entry is string => Boolean(entry)) : undefined,
    respawnBindMapId: normalizeTrimmedString(raw.respawnBindMapId),
    tileAuraGainAmount,
    tileResourceGains,
    useBehavior: normalizeTrimmedString(raw.useBehavior) as GmEditorItemOption['useBehavior'],
    spiritualRootSeedTier: raw.spiritualRootSeedTier === 'heaven' || raw.spiritualRootSeedTier === 'divine' ? raw.spiritualRootSeedTier : undefined,
    allowBatchUse: raw.allowBatchUse === true ? true : undefined,
    learnTechniqueId: normalizeTrimmedString(raw.learnTechniqueId) as GmEditorItemOption['learnTechniqueId'],
    learnTechniqueMaxLevel: normalizePositiveInteger(raw.learnTechniqueMaxLevel) as GmEditorItemOption['learnTechniqueMaxLevel'],
  };
}
