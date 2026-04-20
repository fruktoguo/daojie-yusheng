import type { PropsWithChildren, ReactNode } from 'react';
/**
 * UiFieldRowProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiFieldRowProps {
/**
 * label：UiFieldRowProps 内部字段。
 */

  label: ReactNode;  
  /**
 * value：UiFieldRowProps 内部字段。
 */

  value?: ReactNode;  
  /**
 * className：UiFieldRowProps 内部字段。
 */

  className?: string;
}
/**
 * UiFieldRow：执行核心业务逻辑。
 * @param {
  label,
  value,
  className,
  children,
} PropsWithChildren<UiFieldRowProps> 参数说明。
 * @returns 函数返回值。
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
