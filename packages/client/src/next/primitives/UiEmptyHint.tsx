/**
 * UiEmptyHintProps：定义接口结构约束，明确可交付字段含义。
 */
export interface UiEmptyHintProps {
/**
 * text：UiEmptyHintProps 内部字段。
 */

  text: string;  
  /**
 * className：UiEmptyHintProps 内部字段。
 */

  className?: string;
}
/**
 * UiEmptyHint：执行核心业务逻辑。
 * @param { text, className } UiEmptyHintProps 参数说明。
 * @returns 函数返回值。
 */


export function UiEmptyHint({ text, className }: UiEmptyHintProps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const classes = ['next-ui-empty-hint'];
  if (className) {
    classes.push(className);
  }
  return <div className={classes.join(' ')}>{text}</div>;
}
