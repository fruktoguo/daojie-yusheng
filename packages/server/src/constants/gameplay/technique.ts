/**
 * 修炼与功法相关的常量，供服务端逻辑统一引用。
 */

/** 空修炼结果，占位表示本息没有推进。 */
export const EMPTY_CULTIVATION_RESULT = {
  changed: false,
  dirty: [] as Array<'inv' | 'tech' | 'attr' | 'actions'>,
  messages: [] as Array<{ text: string; kind?: 'system' | 'quest' | 'combat' | 'loot' }>,
};

/** 用于分辨玩家境界阶段的 Redis 数据字段 */
export const REALM_STAGE_SOURCE = 'realm:stage';
/** 用于存储玩家当前境界状态（进度/目标）的 Redis 字段 */
export const REALM_STATE_SOURCE = 'realm:state';
/** 功法相关 runtime（如已习得功法）记录的键名前缀 */
export const TECHNIQUE_SOURCE_PREFIX = 'technique:';
/** 修炼状态的 buff 标识 */
export const CULTIVATION_BUFF_ID = 'cultivation:active';
/** 开启或关闭修炼状态所依赖的行动 ID */
export const CULTIVATION_ACTION_ID = 'cultivation:toggle';
/** 修炼 buff 默认持续期（单位：tick） */
export const CULTIVATION_BUFF_DURATION = 1;
/** 每 tick 境界经验的基础增量 */
export const CULTIVATION_REALM_EXP_PER_TICK = 1;
/** 断路条件提示文字：突破受阻 */
export const PATH_SEVERED_BREAKTHROUGH_LABEL = '仙路断绝';
/** 断路条件提示文字：具体说明 */
export const PATH_SEVERED_BREAKTHROUGH_REASON =
  '仙路断绝，你的前路已被无形天堑阻断，暂时无法继续突破。';
/** 天品灵根幼苗物品 ID */
export const HEAVEN_SPIRITUAL_ROOT_SEED_ITEM_ID = 'root_seed.heaven';
/** 神品灵根幼苗物品 ID */
export const DIVINE_SPIRITUAL_ROOT_SEED_ITEM_ID = 'root_seed.divine';
/** 碎灵丹物品 ID */
export const SHATTER_SPIRIT_PILL_ITEM_ID = 'pill.shatter_spirit';
