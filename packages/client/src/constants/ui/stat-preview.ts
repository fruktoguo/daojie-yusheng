/**
 * 本文件定义客户端常量或展示配置，是 UI、地图、输入和本地渲染共同依赖的稳定来源。
 *
 * 维护时要保持常量含义清晰，并同步检查消费方，避免把服务端权威规则复制成客户端私有真源。
 */
/**
 * 属性预览展示常量。
 */

/** 需要按百分比显示的数值键集合。 */
export const PERCENT_STAT_KEYS = new Set([
  'auraCostReduce',
  'auraPowerRate',
  'playerExpRate',
  'techniqueExpRate',
  'lootRate',
  'rareLootRate',
]);
