import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';
/**
 * UiButtonVariant：统一结构类型，保证协议与运行时一致性。
 */


type UiButtonVariant = 'ghost' | 'danger';
/**
 * UiButtonProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
/**
 * variants：UiButtonProps 内部字段。
 */

  variants?: UiButtonVariant[];
}
/**
 * UiButton：执行核心业务逻辑。
 * @param {
  variants = [],
  className,
  children,
  ...props
} PropsWithChildren<UiButtonProps> 参数说明。
 * @returns 函数返回值。
 */


export function UiButton({
  variants = [],
  className,
  children,
  ...props
}: PropsWithChildren<UiButtonProps>) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const classes = ['next-ui-button'];
  variants.forEach((variant) => classes.push(`next-ui-button--${variant}`));
  if (className) {
    classes.push(className);
  }
  return (
    <button {...props} className={classes.join(' ')}>
      {children}
    </button>
  );
}
