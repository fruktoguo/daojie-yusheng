import type { PropsWithChildren } from 'react';
/**
 * UiToolbarProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiToolbarProps {
/**
 * className：UiToolbarProps 内部字段。
 */

  className?: string;
}
/**
 * UiToolbar：执行核心业务逻辑。
 * @param {
  className,
  children,
} PropsWithChildren<UiToolbarProps> 参数说明。
 * @returns 函数返回值。
 */


export function UiToolbar({
  className,
  children,
}: PropsWithChildren<UiToolbarProps>) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const classes = ['next-ui-toolbar'];
  if (className) {
    classes.push(className);
  }

  return <div className={classes.join(' ')}>{children}</div>;
}
