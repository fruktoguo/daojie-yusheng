/**
 * 本文件提供 React UI 的 UiEmptyHint 基础组件，用于复用面板内的视觉和交互片段。
 *
 * 维护时应保持组件无业务真源，只通过 props 呈现状态，并兼顾浅色、深色与移动端可用性。
 */
/**
 * UiEmptyHintProps：定义接口结构约束，明确可交付字段含义。
 */
export interface UiEmptyHintProps {
/**
 * text：text名称或显示文本。
 */

  text: string;  
  /**
 * className：class名称名称或显示文本。
 */

  className?: string;
}
/**
 * UiEmptyHint：渲染UiEmptyHint组件。
 * @param { text, className } UiEmptyHintProps 参数说明。
 * @returns 无返回值，直接更新UiEmptyHint相关状态。
 */


export function UiEmptyHint({ text, className }: UiEmptyHintProps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const classes = ['react-ui-empty-hint'];
  if (className) {
    classes.push(className);
  }
  return <div className={classes.join(' ')}>{text}</div>;
}
