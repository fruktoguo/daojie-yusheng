import type { PropsWithChildren } from 'react';
/**
 * UiPillProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiPillProps {
/**
 * tone：UiPillProps 内部字段。
 */

  tone?: 'default' | 'accent';  
  /**
 * className：UiPillProps 内部字段。
 */

  className?: string;
}
/**
 * UiPill：执行核心业务逻辑。
 * @param {
  tone = 'default',
  className,
  children,
} PropsWithChildren<UiPillProps> 参数说明。
 * @returns 函数返回值。
 */


export function UiPill({
  tone = 'default',
  className,
  children,
}: PropsWithChildren<UiPillProps>) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const classes = ['next-ui-pill', `next-ui-pill--${tone}`];
  if (className) {
    classes.push(className);
  }
  return <span className={classes.join(' ')}>{children}</span>;
}
