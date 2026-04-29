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
