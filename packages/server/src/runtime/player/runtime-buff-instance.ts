/**
 * 本文件属于服务端权威运行时，负责地图、玩家、市场、邮件或后台运行态的类型与逻辑。
 *
 * 维护时要保持运行态变更受控，所有会影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
type RuntimeTemporaryBuffSource = Record<string, any>;

const RUNTIME_BUFF_PROTOTYPE_KEYS = [
  'buffId',
  'name',
  'desc',
  'baseDesc',
  'shortMark',
  'category',
  'visibility',
  'sourceSkillId',
  'sourceSkillName',
  'color',
  'attrs',
  'attrMode',
  'stats',
  'statMode',
  'qiProjection',
  'presentationScale',
  'sustainCost',
  'expireWithBuffId',
  'sourceCasterId',
];

export function createRuntimeTemporaryBuff(source: RuntimeTemporaryBuffSource): RuntimeTemporaryBuffSource {
  if (!source || typeof source !== 'object') {
    return source;
  }
  const prototype = isRuntimeTemporaryBuffInstance(source)
    ? Object.getPrototypeOf(source)
    : createRuntimeTemporaryBuffPrototype(source);
  return compactUndefinedFields(Object.assign(Object.create(prototype), {
    remainingTicks: source.remainingTicks,
    duration: source.duration,
    stacks: source.stacks,
    maxStacks: source.maxStacks,
    realmLv: source.realmLv,
    infiniteDuration: source.infiniteDuration,
    sustainTicksElapsed: source.sustainTicksElapsed,
    persistOnDeath: source.persistOnDeath,
    persistOnReturnToSpawn: source.persistOnReturnToSpawn,
  }));
}

export function refreshRuntimeTemporaryBuffPrototype(target: RuntimeTemporaryBuffSource, source: RuntimeTemporaryBuffSource): void {
  if (!target || typeof target !== 'object' || !source || typeof source !== 'object') {
    return;
  }
  Object.setPrototypeOf(target, createRuntimeTemporaryBuffPrototype(source));
  for (const key of RUNTIME_BUFF_PROTOTYPE_KEYS) {
    delete target[key];
  }
}

export function materializeRuntimeTemporaryBuff(source: RuntimeTemporaryBuffSource): RuntimeTemporaryBuffSource {
  if (!source || typeof source !== 'object') {
    return source;
  }
  return compactUndefinedFields({
    buffId: source.buffId,
    name: source.name,
    desc: source.desc,
    baseDesc: source.baseDesc,
    shortMark: source.shortMark,
    category: source.category,
    visibility: source.visibility,
    remainingTicks: source.remainingTicks,
    duration: source.duration,
    stacks: source.stacks,
    maxStacks: source.maxStacks,
    sourceSkillId: source.sourceSkillId,
    sourceSkillName: source.sourceSkillName,
    realmLv: source.realmLv,
    color: source.color,
    attrs: source.attrs,
    attrMode: source.attrMode,
    stats: source.stats,
    statMode: source.statMode,
    qiProjection: source.qiProjection,
    infiniteDuration: source.infiniteDuration,
    presentationScale: source.presentationScale,
    sustainCost: source.sustainCost,
    sustainTicksElapsed: source.sustainTicksElapsed,
    expireWithBuffId: source.expireWithBuffId,
    persistOnDeath: source.persistOnDeath,
    persistOnReturnToSpawn: source.persistOnReturnToSpawn,
    sourceCasterId: source.sourceCasterId,
  });
}

export function isRuntimeTemporaryBuffInstance(source: unknown): boolean {
  if (!source || typeof source !== 'object') {
    return false;
  }
  const prototype = Object.getPrototypeOf(source);
  return Boolean(prototype && prototype !== Object.prototype && typeof prototype.buffId === 'string');
}

function createRuntimeTemporaryBuffPrototype(source: RuntimeTemporaryBuffSource): RuntimeTemporaryBuffSource {
  const prototype = {
    buffId: source.buffId,
    name: source.name,
    desc: source.desc,
    baseDesc: source.baseDesc,
    shortMark: source.shortMark,
    category: source.category,
    visibility: source.visibility,
    sourceSkillId: source.sourceSkillId,
    sourceSkillName: source.sourceSkillName,
    color: source.color,
    attrs: source.attrs,
    attrMode: source.attrMode,
    stats: source.stats,
    statMode: source.statMode,
    qiProjection: source.qiProjection,
    presentationScale: source.presentationScale,
    sustainCost: source.sustainCost,
    expireWithBuffId: source.expireWithBuffId,
    sourceCasterId: source.sourceCasterId,
    toJSON() {
      return materializeRuntimeTemporaryBuff(this);
    },
  };
  return process.env.NODE_ENV === 'production' ? prototype : Object.freeze(prototype);
}

function compactUndefinedFields<T extends Record<string, any>>(target: T): T {
  for (const key of Object.keys(target)) {
    if (target[key] === undefined) {
      delete target[key];
    }
  }
  return target;
}
