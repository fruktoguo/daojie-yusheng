/**
 * 本文件负责配置编辑器的页面、组件、类型或工程辅助逻辑，服务于内容生产与配置维护链路。
 *
 * 维护时要保持草稿、接口返回和发布数据的边界一致，避免把服务端导入校验提前写死在普通 UI 组件里。
 */
export function formatDisplayNumber(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (Math.abs(value - Math.round(value)) < 1e-6) return String(Math.round(value));
  return value.toFixed(2).replace(/\.?0+$/, '');
}

export function stringifyOptionalNumber(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

export function formatDropChancePercent(chance: number | undefined): string {
  if (chance === undefined) return '';
  return formatDisplayNumber(chance * 100);
}
