/**
 * 观察共享类型：承接观察清晰度、洞察结果和展示行结构。
 */
/** 观察信息行 */
export interface ObservationLine {
  label: string;
  value: string;
}

/** 观察清晰度等级 */
export type ObservationClarity = 'veiled' | 'blurred' | 'partial' | 'clear' | 'complete';

/** 观察洞察结果 */
export interface ObservationInsight {
  clarity: ObservationClarity;
  verdict: string;
  lines: ObservationLine[];
}
