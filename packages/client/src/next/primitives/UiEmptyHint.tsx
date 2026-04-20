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

  const classes = ['next-ui-empty-hint'];
  if (className) {
    classes.push(className);
  }
  return <div className={classes.join(' ')}>{text}</div>;
}
