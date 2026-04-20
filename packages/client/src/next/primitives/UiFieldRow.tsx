import type { PropsWithChildren, ReactNode } from 'react';
/**
 * UiFieldRowProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiFieldRowProps {
/**
 * label：label名称或显示文本。
 */

  label: ReactNode;  
  /**
 * value：值数值。
 */

  value?: ReactNode;  
  /**
 * className：class名称名称或显示文本。
 */

  className?: string;
}
/**
 * UiFieldRow：渲染UiFieldRow组件。
 * @param {
  label,
  value,
  className,
  children,
} PropsWithChildren<UiFieldRowProps> 参数说明。
 * @returns 无返回值，直接更新UiFieldRow相关状态。
 */


export function UiFieldRow({
  label,
  value,
  className,
  children,
}: PropsWithChildren<UiFieldRowProps>) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const classes = ['next-ui-field-row'];
  if (className) {
    classes.push(className);
  }

  return (
    <div className={classes.join(' ')}>
      <span className="next-ui-field-row-label">{label}</span>
      {children ? <div className="next-ui-field-row-content">{children}</div> : null}
      {value !== undefined ? <span className="next-ui-field-row-value">{value}</span> : null}
    </div>
  );
}
