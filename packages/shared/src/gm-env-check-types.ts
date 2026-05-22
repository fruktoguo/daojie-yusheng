/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * GM 环境检测类型定义：描述服务端环境检测结果的结构。
 * 包含 Node.js 版本、pnpm 版本、环境变量状态和关键依赖检测。
 */

/** 单项环境检测结果。 */
export interface GmEnvCheckItem {
  /** 检测项名称。 */
  name: string;
  /** 检测状态：ok=通过, warn=警告, error=缺失/异常。 */
  status: 'ok' | 'warn' | 'error';
  /** 当前值或状态描述。 */
  value: string;
  /** 期望值或说明（可选）。 */
  expected?: string;
}

/** 环境检测分组。 */
export interface GmEnvCheckGroup {
  /** 分组标题。 */
  title: string;
  /** 该组下的检测项。 */
  items: GmEnvCheckItem[];
}

/** GM 环境检测完整结果。 */
export interface GmEnvCheckResult {
  /** 检测时间戳（ms）。 */
  checkedAt: number;
  /** 各分组检测结果。 */
  groups: GmEnvCheckGroup[];
  /** 总体状态摘要。 */
  summary: {
    total: number;
    ok: number;
    warn: number;
    error: number;
  };
}
