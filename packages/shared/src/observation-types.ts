/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 观察共享类型：承接观察清晰度、洞察结果和展示行结构。
 */
/** 观察信息行 */
export interface ObservationLine {
/**
 * label：label名称或显示文本。
 */

  label: string;  
  /**
 * value：值数值。
 */

  value: string;
}

/** 观察清晰度等级 */
export type ObservationClarity = 'veiled' | 'blurred' | 'partial' | 'clear' | 'complete';

/** 观察洞察结果 */
export interface ObservationInsight {
/**
 * clarity：clarity相关字段。
 */

  clarity: ObservationClarity;  
  /**
 * verdict：verdict相关字段。
 */

  verdict: string;  
  /**
 * lines：line相关字段。
 */

  lines: ObservationLine[];
}
