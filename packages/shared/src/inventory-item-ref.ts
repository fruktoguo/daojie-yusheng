/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */

/** 背包物品稳定引用。玩家资产操作只能用实例 ID 定位，不能依赖 UI 格子或数组下标。 */
export interface InventoryItemRefView {
  /** 背包物品当前稳定实例 ID。 */
  itemInstanceId: string;
}
