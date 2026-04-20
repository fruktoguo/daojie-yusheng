import type { PropsWithChildren } from 'react';
/**
 * UiToolbarProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiToolbarProps {
/**
 * className：class名称名称或显示文本。
 */

  className?: string;
}
/**
 * UiToolbar：渲染UiToolbar组件。
 * @param {
  className,
  children,
} PropsWithChildren<UiToolbarProps> 参数说明。
 * @returns 无返回值，直接更新UiToolbar相关状态。
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
