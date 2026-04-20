import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';
/**
 * UiTabButtonProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiTabButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
/**
 * active：UiTabButtonProps 内部字段。
 */

  active?: boolean;
}
/**
 * UiTabButton：执行核心业务逻辑。
 * @param {
  active = false,
  className,
  children,
  ...props
} PropsWithChildren<UiTabButtonProps> 参数说明。
 * @returns 函数返回值。
 */


export function UiTabButton({
  active = false,
  className,
  children,
  ...props
}: PropsWithChildren<UiTabButtonProps>) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const classes = ['next-ui-tab-btn'];
  if (active) {
    classes.push('active');
  }
  if (className) {
    classes.push(className);
  }
  return (
    <button {...props} type={props.type ?? 'button'} className={classes.join(' ')}>
      {children}
    </button>
  );
}
