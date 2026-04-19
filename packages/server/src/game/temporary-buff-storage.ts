import {
  ConsumableBuffDef,
  EquipmentTimedBuffEffectDef,
  MonsterInitialBuffDef,
  SkillDef,
  SkillEffectDef,
  TemporaryBuffState,
  WORLD_DARKNESS_BUFF_DURATION,
  WORLD_DARKNESS_BUFF_ID,
  WORLD_TIME_SOURCE_ID,
} from '@mud/shared';
import {
  MOLTEN_POOL_BURN_BUFF_ID,
  MOLTEN_POOL_BURN_COLOR,
  MOLTEN_POOL_BURN_DESC,
  MOLTEN_POOL_BURN_DURATION_TICKS,
  MOLTEN_POOL_BURN_MAX_STACKS,
  MOLTEN_POOL_BURN_NAME,
  MOLTEN_POOL_BURN_SHORT_MARK,
  MOLTEN_POOL_BURN_SOURCE_ID,
} from '../constants/gameplay/terrain-effects';
import {
  CULTIVATION_ACTION_ID,
  CULTIVATION_BUFF_ID,
} from '../constants/gameplay/player-storage';
import { syncDynamicBuffPresentation } from './buff-presentation';
import { normalizeBuffSustainCost } from './buff-sustain';
import { ContentService } from './content.service';

/** MONSTER_INITIAL_BUFF_SOURCE_PREFIX：定义该变量以承载业务值。 */
const MONSTER_INITIAL_BUFF_SOURCE_PREFIX = 'monster:init:';
/** ITEM_BUFF_SOURCE_PREFIX：定义该变量以承载业务值。 */
const ITEM_BUFF_SOURCE_PREFIX = 'item:';
/** EQUIPMENT_BUFF_SOURCE_PREFIX：定义该变量以承载业务值。 */
const EQUIPMENT_BUFF_SOURCE_PREFIX = 'equip:';

/** PersistedTemporaryBuffSnapshot：定义该接口的能力与字段约束。 */
export interface PersistedTemporaryBuffSnapshot {
/** buffId：定义该变量以承载业务值。 */
  buffId: string;
/** sourceSkillId：定义该变量以承载业务值。 */
  sourceSkillId: string;
  sourceCasterId?: string;
/** realmLv：定义该变量以承载业务值。 */
  realmLv: number;
/** remainingTicks：定义该变量以承载业务值。 */
  remainingTicks: number;
/** duration：定义该变量以承载业务值。 */
  duration: number;
/** stacks：定义该变量以承载业务值。 */
  stacks: number;
/** maxStacks：定义该变量以承载业务值。 */
  maxStacks: number;
  sustainTicksElapsed?: number;
  persistOnDeath?: boolean;
  persistOnReturnToSpawn?: boolean;
  name?: string;
  shortMark?: string;
  category?: TemporaryBuffState['category'];
  visibility?: TemporaryBuffState['visibility'];
  desc?: string;
  baseDesc?: string;
  sourceSkillName?: string;
  color?: string;
  attrs?: TemporaryBuffState['attrs'];
  attrMode?: TemporaryBuffState['attrMode'];
  stats?: TemporaryBuffState['stats'];
  statMode?: TemporaryBuffState['statMode'];
  qiProjection?: TemporaryBuffState['qiProjection'];
  presentationScale?: number;
  infiniteDuration?: boolean;
  sustainCost?: TemporaryBuffState['sustainCost'];
  expireWithBuffId?: string;
}

/** normalizePositiveInt：执行对应的业务逻辑。 */
function normalizePositiveInt(value: unknown, fallback = 1): number {
  return Math.max(1, Number.isFinite(value) ? Math.floor(Number(value)) : fallback);
}

/** normalizeNonNegativeInt：执行对应的业务逻辑。 */
function normalizeNonNegativeInt(value: unknown, fallback = 0): number {
  return Math.max(0, Number.isFinite(value) ? Math.floor(Number(value)) : fallback);
}

/** isPlainObject：执行对应的业务逻辑。 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** normalizeShortMark：执行对应的业务逻辑。 */
function normalizeShortMark(shortMark: string | undefined, name: string): string {
/** raw：定义该变量以承载业务值。 */
  const raw = shortMark?.trim();
  if (raw) {
    return [...raw][0] ?? raw;
  }
/** fallback：定义该变量以承载业务值。 */
  const fallback = [...name.trim()][0];
  return fallback ?? '气';
}

/** buildKnownBuffState：执行对应的业务逻辑。 */
function buildKnownBuffState(
  snapshot: PersistedTemporaryBuffSnapshot,
  known: {
/** name：定义该变量以承载业务值。 */
    name: string;
    desc?: string;
    shortMark?: string;
    category?: TemporaryBuffState['category'];
    visibility?: TemporaryBuffState['visibility'];
    sourceSkillName?: string;
    color?: string;
    attrs?: TemporaryBuffState['attrs'];
    attrMode?: TemporaryBuffState['attrMode'];
    stats?: TemporaryBuffState['stats'];
    statMode?: TemporaryBuffState['statMode'];
    qiProjection?: TemporaryBuffState['qiProjection'];
    presentationScale?: number;
    infiniteDuration?: boolean;
    sustainCost?: TemporaryBuffState['sustainCost'];
    expireWithBuffId?: string;
    persistOnDeath?: boolean;
    persistOnReturnToSpawn?: boolean;
/** duration：定义该变量以承载业务值。 */
    duration: number;
/** maxStacks：定义该变量以承载业务值。 */
    maxStacks: number;
  },
): TemporaryBuffState {
  return syncDynamicBuffPresentation({
    buffId: snapshot.buffId,
    name: known.name,
    desc: known.desc,
    baseDesc: known.desc,
    shortMark: normalizeShortMark(known.shortMark, known.name),
    category: known.category ?? 'buff',
    visibility: known.visibility ?? 'public',
    remainingTicks: normalizePositiveInt(snapshot.remainingTicks, Math.max(1, known.duration)),
    duration: normalizePositiveInt(snapshot.duration, Math.max(1, known.duration)),
    stacks: normalizePositiveInt(snapshot.stacks, 1),
    maxStacks: normalizePositiveInt(snapshot.maxStacks, Math.max(1, known.maxStacks)),
    sourceSkillId: snapshot.sourceSkillId,
/** sourceCasterId：定义该变量以承载业务值。 */
    sourceCasterId: typeof snapshot.sourceCasterId === 'string' && snapshot.sourceCasterId.length > 0
      ? snapshot.sourceCasterId
      : undefined,
    sourceSkillName: known.sourceSkillName,
    realmLv: normalizePositiveInt(snapshot.realmLv, 1),
    color: known.color,
    attrs: known.attrs,
    attrMode: known.attrMode,
    stats: known.stats,
    statMode: known.statMode,
    qiProjection: known.qiProjection,
    presentationScale: known.presentationScale,
/** infiniteDuration：定义该变量以承载业务值。 */
    infiniteDuration: known.infiniteDuration === true,
    sustainCost: known.sustainCost,
    sustainTicksElapsed: known.sustainCost
      ? normalizeNonNegativeInt(snapshot.sustainTicksElapsed, 0)
      : undefined,
    expireWithBuffId: known.expireWithBuffId,
    persistOnDeath: known.persistOnDeath === true,
    persistOnReturnToSpawn: known.persistOnReturnToSpawn === true,
  });
}

/** buildSystemBuffState：执行对应的业务逻辑。 */
function buildSystemBuffState(snapshot: PersistedTemporaryBuffSnapshot): TemporaryBuffState | null {
  if (snapshot.sourceSkillId === WORLD_TIME_SOURCE_ID && snapshot.buffId === WORLD_DARKNESS_BUFF_ID) {
    return buildKnownBuffState(snapshot, {
      name: '夜色压境',
      desc: '夜色会按层数压缩视野；若身处恒明或得以免疫，此压制可被抵消。',
      shortMark: '夜',
      category: 'debuff',
      visibility: 'observe_only',
      sourceSkillName: '天时',
      color: '#89a8c7',
      duration: WORLD_DARKNESS_BUFF_DURATION,
      maxStacks: 5,
    });
  }

  if (snapshot.sourceSkillId === CULTIVATION_ACTION_ID && snapshot.buffId === CULTIVATION_BUFF_ID) {
    return buildKnownBuffState(snapshot, {
      name: '修炼中',
      desc: '正在运转主修功法，每息获得境界修为与功法经验，移动、主动攻击或受击都会打断修炼。',
      shortMark: '修',
      category: 'buff',
      visibility: 'public',
      sourceSkillName: '修炼',
      stats: {
        realmExpPerTick: 1,
        techniqueExpPerTick: 5,
      },
      statMode: 'flat',
      duration: 1,
      maxStacks: 1,
    });
  }

  if (snapshot.sourceSkillId === MOLTEN_POOL_BURN_SOURCE_ID && snapshot.buffId === MOLTEN_POOL_BURN_BUFF_ID) {
    return buildKnownBuffState(snapshot, {
      name: MOLTEN_POOL_BURN_NAME,
      desc: MOLTEN_POOL_BURN_DESC,
      shortMark: MOLTEN_POOL_BURN_SHORT_MARK,
      category: 'debuff',
      visibility: 'public',
      sourceSkillName: '熔池',
      color: MOLTEN_POOL_BURN_COLOR,
      duration: MOLTEN_POOL_BURN_DURATION_TICKS,
      maxStacks: MOLTEN_POOL_BURN_MAX_STACKS,
    });
  }

  return null;
}

/** normalizeBuffShortMark：执行对应的业务逻辑。 */
function normalizeBuffShortMark(effect: Extract<SkillEffectDef, { type: 'buff' }>): string {
  return normalizeShortMark(effect.shortMark, effect.name);
}

/** buildSkillBuffState：执行对应的业务逻辑。 */
function buildSkillBuffState(
  skill: SkillDef,
  effect: Extract<SkillEffectDef, { type: 'buff' }>,
  snapshot: PersistedTemporaryBuffSnapshot,
): TemporaryBuffState {
  return buildKnownBuffState(snapshot, {
    name: effect.name,
    desc: effect.desc,
    shortMark: normalizeBuffShortMark(effect),
/** category：定义该变量以承载业务值。 */
    category: effect.category ?? (effect.target === 'self' ? 'buff' : 'debuff'),
    visibility: effect.visibility ?? 'public',
    sourceSkillName: skill.name,
    color: effect.color,
    attrs: effect.attrs,
    attrMode: effect.attrMode,
    stats: effect.stats,
    statMode: effect.statMode,
    qiProjection: effect.qiProjection,
    presentationScale: effect.presentationScale,
/** infiniteDuration：定义该变量以承载业务值。 */
    infiniteDuration: effect.infiniteDuration === true,
    sustainCost: effect.sustainCost,
    expireWithBuffId: effect.expireWithBuffId,
    persistOnDeath: effect.persistOnDeath === true,
    persistOnReturnToSpawn: effect.persistOnReturnToSpawn === true,
    duration: Math.max(1, effect.duration),
    maxStacks: Math.max(1, effect.maxStacks ?? 1),
  });
}

/** parseMonsterInitialBuffSourceId：执行对应的业务逻辑。 */
function parseMonsterInitialBuffSourceId(sourceSkillId: string): { monsterId: string; buffId: string } | null {
  if (!sourceSkillId.startsWith(MONSTER_INITIAL_BUFF_SOURCE_PREFIX)) {
    return null;
  }
/** payload：定义该变量以承载业务值。 */
  const payload = sourceSkillId.slice(MONSTER_INITIAL_BUFF_SOURCE_PREFIX.length);
/** splitIndex：定义该变量以承载业务值。 */
  const splitIndex = payload.lastIndexOf(':');
  if (splitIndex <= 0 || splitIndex >= payload.length - 1) {
    return null;
  }
/** monsterId：定义该变量以承载业务值。 */
  const monsterId = payload.slice(0, splitIndex).trim();
/** buffId：定义该变量以承载业务值。 */
  const buffId = payload.slice(splitIndex + 1).trim();
  if (!monsterId || !buffId) {
    return null;
  }
  return { monsterId, buffId };
}

/** resolveMonsterInitialBuffTemplate：执行对应的业务逻辑。 */
function resolveMonsterInitialBuffTemplate(
  sourceSkillId: string,
  buffId: string,
  contentService: ContentService,
): {
/** effect：定义该变量以承载业务值。 */
  effect: MonsterInitialBuffDef;
/** monsterName：定义该变量以承载业务值。 */
  monsterName: string;
} | null {
/** parsed：定义该变量以承载业务值。 */
  const parsed = parseMonsterInitialBuffSourceId(sourceSkillId);
  if (!parsed || parsed.buffId !== buffId) {
    return null;
  }
/** monster：定义该变量以承载业务值。 */
  const monster = contentService.getMonsterTemplate(parsed.monsterId);
/** effect：定义该变量以承载业务值。 */
  const effect = monster?.initialBuffs?.find((entry) => entry.buffId === buffId);
  if (!monster || !effect) {
    return null;
  }
  return { effect, monsterName: monster.name };
}

/** buildMonsterInitialBuffState：执行对应的业务逻辑。 */
function buildMonsterInitialBuffState(
  snapshot: PersistedTemporaryBuffSnapshot,
  effect: MonsterInitialBuffDef,
  monsterName: string,
): TemporaryBuffState {
  return buildKnownBuffState(snapshot, {
    name: effect.name,
    desc: effect.desc,
    shortMark: effect.shortMark,
    category: effect.category ?? 'buff',
    visibility: effect.visibility ?? 'public',
    sourceSkillName: `${monsterName}·先天妖势`,
    color: effect.color,
    attrs: effect.attrs,
    attrMode: effect.attrMode,
    stats: effect.stats,
    statMode: effect.statMode,
    qiProjection: effect.qiProjection,
    presentationScale: effect.presentationScale,
/** infiniteDuration：定义该变量以承载业务值。 */
    infiniteDuration: effect.infiniteDuration === true,
    sustainCost: effect.sustainCost,
    expireWithBuffId: effect.expireWithBuffId,
    persistOnDeath: effect.persistOnDeath === true,
    persistOnReturnToSpawn: effect.persistOnReturnToSpawn === true,
    duration: Math.max(1, effect.duration),
    maxStacks: Math.max(1, effect.maxStacks ?? 1),
  });
}

/** resolveConsumableBuffTemplate：执行对应的业务逻辑。 */
function resolveConsumableBuffTemplate(
  sourceSkillId: string,
  buffId: string,
  contentService: ContentService,
): {
/** itemName：定义该变量以承载业务值。 */
  itemName: string;
/** buff：定义该变量以承载业务值。 */
  buff: ConsumableBuffDef;
} | null {
  if (!sourceSkillId.startsWith(ITEM_BUFF_SOURCE_PREFIX)) {
    return null;
  }
/** itemId：定义该变量以承载业务值。 */
  const itemId = sourceSkillId.slice(ITEM_BUFF_SOURCE_PREFIX.length).trim();
  if (!itemId) {
    return null;
  }
/** item：定义该变量以承载业务值。 */
  const item = contentService.getItem(itemId);
/** buff：定义该变量以承载业务值。 */
  const buff = item?.consumeBuffs?.find((entry) => entry.buffId === buffId);
  if (!item || !buff) {
    return null;
  }
  return { itemName: item.name, buff };
}

/** buildConsumableBuffState：执行对应的业务逻辑。 */
function buildConsumableBuffState(
  snapshot: PersistedTemporaryBuffSnapshot,
  buff: ConsumableBuffDef,
  itemName: string,
): TemporaryBuffState {
  return buildKnownBuffState(snapshot, {
    name: buff.name,
    desc: buff.desc,
    shortMark: buff.shortMark,
    category: buff.category ?? 'buff',
    visibility: buff.visibility ?? 'public',
    sourceSkillName: itemName,
    color: buff.color,
    attrs: buff.attrs,
    attrMode: buff.attrMode,
    stats: buff.stats,
    statMode: buff.statMode,
    qiProjection: buff.qiProjection,
    presentationScale: buff.presentationScale,
/** infiniteDuration：定义该变量以承载业务值。 */
    infiniteDuration: buff.infiniteDuration === true,
    sustainCost: buff.sustainCost,
    expireWithBuffId: buff.expireWithBuffId,
    persistOnDeath: buff.persistOnDeath === true,
    persistOnReturnToSpawn: buff.persistOnReturnToSpawn === true,
    duration: Math.max(1, buff.duration),
    maxStacks: Math.max(1, buff.maxStacks ?? 1),
  });
}

/** resolveEquipmentTimedBuffTemplate：执行对应的业务逻辑。 */
function resolveEquipmentTimedBuffTemplate(
  sourceSkillId: string,
  buffId: string,
  contentService: ContentService,
): {
/** itemName：定义该变量以承载业务值。 */
  itemName: string;
/** effect：定义该变量以承载业务值。 */
  effect: EquipmentTimedBuffEffectDef;
} | null {
  if (!sourceSkillId.startsWith(EQUIPMENT_BUFF_SOURCE_PREFIX)) {
    return null;
  }
/** payload：定义该变量以承载业务值。 */
  const payload = sourceSkillId.slice(EQUIPMENT_BUFF_SOURCE_PREFIX.length);
/** splitIndex：定义该变量以承载业务值。 */
  const splitIndex = payload.lastIndexOf(':');
  if (splitIndex <= 0 || splitIndex >= payload.length - 1) {
    return null;
  }
/** itemId：定义该变量以承载业务值。 */
  const itemId = payload.slice(0, splitIndex).trim();
/** effectId：定义该变量以承载业务值。 */
  const effectId = payload.slice(splitIndex + 1).trim();
  if (!itemId || !effectId) {
    return null;
  }
/** item：定义该变量以承载业务值。 */
  const item = contentService.getItem(itemId);
/** effect：定义该变量以承载业务值。 */
  const effect = item?.effects?.find((entry): entry is EquipmentTimedBuffEffectDef => (
    entry.type === 'timed_buff'
      && (entry.effectId?.trim() || 'effect') === effectId
      && entry.buff.buffId === buffId
  ));
  if (!item || !effect) {
    return null;
  }
  return { itemName: item.name, effect };
}

/** buildEquipmentTimedBuffState：执行对应的业务逻辑。 */
function buildEquipmentTimedBuffState(
  snapshot: PersistedTemporaryBuffSnapshot,
  effect: EquipmentTimedBuffEffectDef,
  itemName: string,
): TemporaryBuffState {
/** buff：定义该变量以承载业务值。 */
  const buff = effect.buff;
  return buildKnownBuffState(snapshot, {
    name: buff.name,
    desc: buff.desc,
    shortMark: buff.shortMark,
    category: buff.category ?? 'buff',
    visibility: buff.visibility ?? 'public',
    sourceSkillName: itemName,
    color: buff.color,
    attrs: buff.attrs,
    attrMode: buff.attrMode,
    stats: buff.stats,
    statMode: buff.statMode,
    qiProjection: buff.qiProjection,
    persistOnDeath: buff.persistOnDeath === true,
    persistOnReturnToSpawn: buff.persistOnReturnToSpawn === true,
    duration: Math.max(1, buff.duration),
    maxStacks: Math.max(1, buff.maxStacks ?? 1),
  });
}

/** canPersistAsMinimalSnapshot：执行对应的业务逻辑。 */
function canPersistAsMinimalSnapshot(buff: TemporaryBuffState, contentService: ContentService): boolean {
  if (
    (buff.sourceSkillId === WORLD_TIME_SOURCE_ID && buff.buffId === WORLD_DARKNESS_BUFF_ID)
    || (buff.sourceSkillId === CULTIVATION_ACTION_ID && buff.buffId === CULTIVATION_BUFF_ID)
    || (buff.sourceSkillId === MOLTEN_POOL_BURN_SOURCE_ID && buff.buffId === MOLTEN_POOL_BURN_BUFF_ID)
  ) {
    return true;
  }

/** skill：定义该变量以承载业务值。 */
  const skill = contentService.getSkill(buff.sourceSkillId);
/** effect：定义该变量以承载业务值。 */
  const effect = skill?.effects.find((entry): entry is Extract<SkillEffectDef, { type: 'buff' }> => (
    entry.type === 'buff' && entry.buffId === buff.buffId
  ));
  if (effect) {
    return true;
  }

  if (resolveMonsterInitialBuffTemplate(buff.sourceSkillId, buff.buffId, contentService)) {
    return true;
  }

  if (resolveConsumableBuffTemplate(buff.sourceSkillId, buff.buffId, contentService)) {
    return true;
  }

  if (resolveEquipmentTimedBuffTemplate(buff.sourceSkillId, buff.buffId, contentService)) {
    return true;
  }

  return false;
}

/** buildMonsterInitialBuffSourceId：执行对应的业务逻辑。 */
export function buildMonsterInitialBuffSourceId(monsterId: string, buffId: string): string {
  return `${MONSTER_INITIAL_BUFF_SOURCE_PREFIX}${monsterId}:${buffId}`;
}

/** normalizePersistedTemporaryBuffSnapshot：执行对应的业务逻辑。 */
export function normalizePersistedTemporaryBuffSnapshot(raw: unknown): PersistedTemporaryBuffSnapshot | null {
  if (!isPlainObject(raw) || typeof raw.buffId !== 'string' || typeof raw.sourceSkillId !== 'string') {
    return null;
  }

/** snapshot：定义该变量以承载业务值。 */
  const snapshot: PersistedTemporaryBuffSnapshot = {
    buffId: raw.buffId,
    sourceSkillId: raw.sourceSkillId,
/** sourceCasterId：定义该变量以承载业务值。 */
    sourceCasterId: typeof raw.sourceCasterId === 'string' && raw.sourceCasterId.length > 0 ? raw.sourceCasterId : undefined,
    realmLv: normalizePositiveInt(raw.realmLv, 1),
    remainingTicks: normalizePositiveInt(raw.remainingTicks, 1),
    duration: normalizePositiveInt(raw.duration, 1),
    stacks: normalizePositiveInt(raw.stacks, 1),
    maxStacks: normalizePositiveInt(raw.maxStacks, 1),
/** sustainTicksElapsed：定义该变量以承载业务值。 */
    sustainTicksElapsed: raw.sustainTicksElapsed !== undefined ? normalizeNonNegativeInt(raw.sustainTicksElapsed, 0) : undefined,
    persistOnDeath: raw.persistOnDeath === true,
    persistOnReturnToSpawn: raw.persistOnReturnToSpawn === true,
/** name：定义该变量以承载业务值。 */
    name: typeof raw.name === 'string' && raw.name.length > 0 ? raw.name : undefined,
/** shortMark：定义该变量以承载业务值。 */
    shortMark: typeof raw.shortMark === 'string' && raw.shortMark.length > 0 ? raw.shortMark : undefined,
/** category：定义该变量以承载业务值。 */
    category: raw.category === 'debuff' ? 'debuff' : raw.category === 'buff' ? 'buff' : undefined,
/** visibility：定义该变量以承载业务值。 */
    visibility: raw.visibility === 'hidden' || raw.visibility === 'observe_only' || raw.visibility === 'public'
      ? raw.visibility
      : undefined,
/** desc：定义该变量以承载业务值。 */
    desc: typeof raw.desc === 'string' ? raw.desc : undefined,
/** baseDesc：定义该变量以承载业务值。 */
    baseDesc: typeof raw.baseDesc === 'string' ? raw.baseDesc : undefined,
/** sourceSkillName：定义该变量以承载业务值。 */
    sourceSkillName: typeof raw.sourceSkillName === 'string' ? raw.sourceSkillName : undefined,
/** color：定义该变量以承载业务值。 */
    color: typeof raw.color === 'string' ? raw.color : undefined,
    attrs: isPlainObject(raw.attrs) ? raw.attrs as TemporaryBuffState['attrs'] : undefined,
/** attrMode：定义该变量以承载业务值。 */
    attrMode: raw.attrMode === 'flat' ? 'flat' : raw.attrMode === 'percent' ? 'percent' : undefined,
    stats: isPlainObject(raw.stats) ? raw.stats as TemporaryBuffState['stats'] : undefined,
/** statMode：定义该变量以承载业务值。 */
    statMode: raw.statMode === 'flat' ? 'flat' : raw.statMode === 'percent' ? 'percent' : undefined,
    qiProjection: Array.isArray(raw.qiProjection) ? raw.qiProjection as TemporaryBuffState['qiProjection'] : undefined,
    presentationScale: Number.isFinite(raw.presentationScale) ? Number(raw.presentationScale) : undefined,
/** infiniteDuration：定义该变量以承载业务值。 */
    infiniteDuration: raw.infiniteDuration === true,
    sustainCost: normalizeBuffSustainCost(raw.sustainCost),
/** expireWithBuffId：定义该变量以承载业务值。 */
    expireWithBuffId: typeof raw.expireWithBuffId === 'string' && raw.expireWithBuffId.length > 0
      ? raw.expireWithBuffId
      : undefined,
  };

  return snapshot;
}

/** hydrateTemporaryBuffSnapshot：执行对应的业务逻辑。 */
export function hydrateTemporaryBuffSnapshot(
  raw: unknown,
  contentService: ContentService,
  options?: {
    ignore?: (snapshot: PersistedTemporaryBuffSnapshot) => boolean;
  },
): TemporaryBuffState | null {
/** snapshot：定义该变量以承载业务值。 */
  const snapshot = normalizePersistedTemporaryBuffSnapshot(raw);
  if (!snapshot) {
    return null;
  }

  if (options?.ignore?.(snapshot)) {
    return null;
  }

/** systemBuff：定义该变量以承载业务值。 */
  const systemBuff = buildSystemBuffState(snapshot);
  if (systemBuff) {
    return systemBuff;
  }

/** initialBuff：定义该变量以承载业务值。 */
  const initialBuff = resolveMonsterInitialBuffTemplate(snapshot.sourceSkillId, snapshot.buffId, contentService);
  if (initialBuff) {
    return buildMonsterInitialBuffState(snapshot, initialBuff.effect, initialBuff.monsterName);
  }

/** skill：定义该变量以承载业务值。 */
  const skill = contentService.getSkill(snapshot.sourceSkillId);
/** skillEffect：定义该变量以承载业务值。 */
  const skillEffect = skill?.effects.find((entry): entry is Extract<SkillEffectDef, { type: 'buff' }> => (
    entry.type === 'buff' && entry.buffId === snapshot.buffId
  ));
  if (skill && skillEffect) {
    return buildSkillBuffState(skill, skillEffect, snapshot);
  }

/** consumableBuff：定义该变量以承载业务值。 */
  const consumableBuff = resolveConsumableBuffTemplate(snapshot.sourceSkillId, snapshot.buffId, contentService);
  if (consumableBuff) {
    return buildConsumableBuffState(snapshot, consumableBuff.buff, consumableBuff.itemName);
  }

/** equipmentBuff：定义该变量以承载业务值。 */
  const equipmentBuff = resolveEquipmentTimedBuffTemplate(snapshot.sourceSkillId, snapshot.buffId, contentService);
  if (equipmentBuff) {
    return buildEquipmentTimedBuffState(snapshot, equipmentBuff.effect, equipmentBuff.itemName);
  }

  if (!snapshot.name || !snapshot.shortMark) {
    return null;
  }

  return syncDynamicBuffPresentation({
    buffId: snapshot.buffId,
    name: snapshot.name,
    desc: snapshot.desc,
    baseDesc: snapshot.baseDesc ?? snapshot.desc,
    shortMark: snapshot.shortMark,
    category: snapshot.category ?? 'buff',
    visibility: snapshot.visibility ?? 'public',
    remainingTicks: snapshot.remainingTicks,
    duration: snapshot.duration,
    stacks: snapshot.stacks,
    maxStacks: snapshot.maxStacks,
    sourceSkillId: snapshot.sourceSkillId,
    sourceCasterId: snapshot.sourceCasterId,
    sourceSkillName: snapshot.sourceSkillName,
    realmLv: snapshot.realmLv,
    color: snapshot.color,
    attrs: snapshot.attrs,
    attrMode: snapshot.attrMode,
    stats: snapshot.stats,
    statMode: snapshot.statMode,
    qiProjection: snapshot.qiProjection,
    presentationScale: snapshot.presentationScale,
/** infiniteDuration：定义该变量以承载业务值。 */
    infiniteDuration: snapshot.infiniteDuration === true,
    sustainCost: snapshot.sustainCost,
    sustainTicksElapsed: snapshot.sustainTicksElapsed,
    expireWithBuffId: snapshot.expireWithBuffId,
    persistOnDeath: snapshot.persistOnDeath === true,
    persistOnReturnToSpawn: snapshot.persistOnReturnToSpawn === true,
  });
}

/** hydrateTemporaryBuffSnapshots：执行对应的业务逻辑。 */
export function hydrateTemporaryBuffSnapshots(
  snapshot: unknown,
  contentService: ContentService,
  options?: {
    ignore?: (snapshot: PersistedTemporaryBuffSnapshot) => boolean;
  },
): TemporaryBuffState[] {
  if (!Array.isArray(snapshot)) {
    return [];
  }

  return snapshot
    .map((entry) => hydrateTemporaryBuffSnapshot(entry, contentService, options))
    .filter((entry): entry is TemporaryBuffState => entry !== null);
}

/** dehydrateTemporaryBuff：执行对应的业务逻辑。 */
export function dehydrateTemporaryBuff(
  buff: TemporaryBuffState,
  contentService: ContentService,
): PersistedTemporaryBuffSnapshot {
/** minimal：定义该变量以承载业务值。 */
  const minimal: PersistedTemporaryBuffSnapshot = {
    buffId: buff.buffId,
    sourceSkillId: buff.sourceSkillId,
/** sourceCasterId：定义该变量以承载业务值。 */
    sourceCasterId: typeof buff.sourceCasterId === 'string' && buff.sourceCasterId.length > 0 ? buff.sourceCasterId : undefined,
    realmLv: normalizePositiveInt(buff.realmLv, 1),
    remainingTicks: normalizePositiveInt(buff.remainingTicks, 1),
    duration: normalizePositiveInt(buff.duration, 1),
    stacks: normalizePositiveInt(buff.stacks, 1),
    maxStacks: normalizePositiveInt(buff.maxStacks, 1),
    sustainTicksElapsed: buff.sustainCost ? normalizeNonNegativeInt(buff.sustainTicksElapsed, 0) : undefined,
    persistOnDeath: buff.persistOnDeath === true,
    persistOnReturnToSpawn: buff.persistOnReturnToSpawn === true,
  };

  if (canPersistAsMinimalSnapshot(buff, contentService)) {
    return minimal;
  }

  return {
    ...minimal,
    name: buff.name,
    shortMark: buff.shortMark,
    category: buff.category,
    visibility: buff.visibility,
    desc: buff.desc,
    baseDesc: buff.baseDesc,
    sourceSkillName: buff.sourceSkillName,
    color: buff.color,
    attrs: buff.attrs,
    attrMode: buff.attrMode,
    stats: buff.stats,
    statMode: buff.statMode,
    qiProjection: buff.qiProjection,
    presentationScale: buff.presentationScale,
    infiniteDuration: buff.infiniteDuration,
    sustainCost: buff.sustainCost,
    expireWithBuffId: buff.expireWithBuffId,
    persistOnDeath: buff.persistOnDeath,
    persistOnReturnToSpawn: buff.persistOnReturnToSpawn,
  };
}
