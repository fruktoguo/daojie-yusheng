import { WORLD_TICK_INTERVAL_MS } from './core';

/**
 * 灵气与感气系统常量。
 */

/**
 * 灵气等级的基础阈值。
 *
 * 说明：
 * - 当地块灵气值达到该值时，视为灵气 1 级。
 * - 此后每提升 1 级，所需灵气值按 1.5 倍递增。
 * - 例如基准值为 1000 时，1000/1500/2250/3375 分别对应 1/2/3/4 级。
 */
export const DEFAULT_AURA_LEVEL_BASE_VALUE = 1000;

/**
 * 地块灵气流转的半衰期时长，单位为息。
 *
 * 说明：
 * - 当地块没有源点回补时，灵气值经过该时长后会衰减到原来的一半。
 * - 当地块存在源点回补时，当前灵气值与源点基准值之间的差值，经过该时长后会缩小为原来的一半。
 * - 当前配置为 86400 tick；真实时间取决于世界主循环间隔。
 * - 以当前 `WORLD_TICK_INTERVAL_MS=100` 计算，约为现实中的 2.4 小时。
 */
export const TILE_AURA_HALF_LIFE_TICKS = 86400;

/**
 * 地块灵气半衰期结算使用的固定点精度基数。
 *
 * 说明：
 * - 灵气流转需要落盘并在整数数值上稳定运行，因此使用固定点而不是直接持久化浮点误差。
 * - 该值越大，半衰期离散近似越精细，但余数累积的整数规模也越大。
 */
export const TILE_AURA_HALF_LIFE_RATE_SCALE = 1_000_000_000;

/**
 * 地块灵气每息向目标状态收敛的固定点速率。
 *
 * 说明：
 * - 该值由半衰期公式 `1 - 0.5^(1 / 半衰期息数)` 换算得到。
 * - 服务端每息会分别按此速率结算“当前灵气的自然衰减量”和“源点基准值提供的回补量”。
 * - 与 `TILE_AURA_HALF_LIFE_RATE_SCALE` 搭配使用，可在整数余数模型中近似连续半衰期。
 */
export const TILE_AURA_HALF_LIFE_RATE_SCALED = Math.max(
  1,
  Math.round((1 - Math.pow(0.5, 1 / TILE_AURA_HALF_LIFE_TICKS)) * TILE_AURA_HALF_LIFE_RATE_SCALE),
);
