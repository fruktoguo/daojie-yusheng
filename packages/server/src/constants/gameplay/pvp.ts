/**
 * 本文件属于项目主线脚本，负责所属模块内的类型、工具或运行逻辑。
 *
 * 维护时先确认调用方和数据边界，保持注释说明职责而不改变现有行为。
 */
/**
 * PVP 玩法常量：定义击杀奖励（血精石、煞气注入）和惩罚（魂伤、煞气反噬）
 * 的 buff ID、来源标识、持续时间和数值参数。
 */
import { buildQiResourceKey } from '@mud/shared';

// ─── 击杀奖励：血精石 ───
export const BLOOD_ESSENCE_ITEM_ID = 'stone.blood_essence';
export const BLOOD_ESSENCE_SHA_GAIN = 10;

// ─── 击杀惩罚：魂伤 debuff ───
export const PVP_SOUL_INJURY_BUFF_ID = 'pvp.soul_injury';
export const PVP_SOUL_INJURY_SOURCE_ID = 'pvp.kill';
export const PVP_SOUL_INJURY_DURATION_TICKS = 3600;

// ─── 击杀奖励：煞气注入 buff ───
export const PVP_SHA_INFUSION_BUFF_ID = 'pvp.sha_infusion';
export const PVP_SHA_INFUSION_SOURCE_ID = 'pvp.kill';
export const PVP_SHA_INFUSION_ATTACK_CAP_PERCENT = 100;
export const PVP_SHA_INFUSION_DECAY_TICKS = 600;

// ─── 煞气反噬：累积惩罚 debuff ───
export const PVP_SHA_BACKLASH_BUFF_ID = 'pvp.sha_backlash';
export const PVP_SHA_BACKLASH_SOURCE_ID = 'pvp.sha_backlash';
export const PVP_SHA_BACKLASH_PERCENT_PER_STACK = 2;
export const PVP_SHA_BACKLASH_DECAY_TICKS = 600;
export const PVP_SHA_BACKLASH_STACK_DIVISOR = 2;
/** 煞气反噬层数达到此阈值触发入魔 */
export const PVP_SHA_DEMONIZED_STACK_THRESHOLD = 20;

/** 精炼煞气资源键（用于灵气系统） */
export const REFINED_SHA_RESOURCE_KEY = buildQiResourceKey({
  family: 'sha',
  form: 'refined',
  element: 'neutral',
});
