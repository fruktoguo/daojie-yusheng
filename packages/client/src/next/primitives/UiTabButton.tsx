import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';
/**
 * UiTabButtonProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiTabButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
/**
 * active：启用开关或状态标识。
 */

  active?: boolean;
}
/**
 * UiTabButton：渲染UiTabButton组件。
 * @param {
  active = false,
  className,
  children,
  ...props
} PropsWithChildren<UiTabButtonProps> 参数说明。
 * @returns 无返回值，直接更新UiTabButton相关状态。
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
