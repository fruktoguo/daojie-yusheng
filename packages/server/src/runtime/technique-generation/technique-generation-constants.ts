/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */

/**
 * AI 功法生成业务常量。
 */

/** 解锁洞府研修所需的最低 realmLv（筑基前期） */
export const TECHNIQUE_GENERATION_UNLOCK_REALM_LV = 31;

/** realmLv 随机浮动范围（±） */
export const TECHNIQUE_GENERATION_REALM_LV_OFFSET = 6;

/** 品阶随机浮动档位（±） */
export const TECHNIQUE_GENERATION_GRADE_OFFSET = 2;

/** 草稿过期时间（小时） */
export const TECHNIQUE_GENERATION_DRAFT_EXPIRE_HOURS = 24;

/** 中心命中概率 */
export const TECHNIQUE_GENERATION_CENTER_PROBABILITY = 0.5;

/** 偏移部分中高方向占比（低方向 = 1 - 此值） */
export const TECHNIQUE_GENERATION_HIGH_DIRECTION_RATIO = 0.25;

/** 单次领悟最多投入的悟道玉简数量 */
export const TECHNIQUE_GENERATION_MAX_ITEM_SPEND = 10;

/** 悟道玉简道具 ID */
export const TECHNIQUE_GENERATION_ITEM_ID = 'wudao_yujian';

/** schema 版本 */
export const TECHNIQUE_GENERATION_SCHEMA_VERSION = 1;
