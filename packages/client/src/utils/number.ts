/**
 * 本文件属于正式客户端主线，负责前端运行态、状态投影或通用工具。
 *
 * 维护时要区分“显示用派生数据”和“服务端权威数据”，注释只补充边界说明，不改变任何交互语义。
 */
export {
  formatDisplayCountBadge,
  formatDisplayCurrentMax,
  formatDisplayInteger,
  formatDisplayNumber,
  formatDisplayPercent,
  formatDisplaySignedNumber,
} from '@mud/shared';
export type { DisplayNumberOptions } from '@mud/shared';
