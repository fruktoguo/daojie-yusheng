import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from 'react';
/**
 * UiItemCardProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiItemCardProps extends ButtonHTMLAttributes<HTMLButtonElement> {
/**
 * title：UiItemCardProps 内部字段。
 */

  title: string;  
  /**
 * subtitle：UiItemCardProps 内部字段。
 */

  subtitle?: ReactNode;  
  /**
 * meta：UiItemCardProps 内部字段。
 */

  meta?: ReactNode;  
  /**
 * badge：UiItemCardProps 内部字段。
 */

  badge?: ReactNode;  
  /**
 * active：UiItemCardProps 内部字段。
 */

  active?: boolean;
}
/**
 * UiItemCard：执行核心业务逻辑。
 * @param {
  title,
  subtitle,
  meta,
  badge,
  active = false,
  className,
  children,
  ...props
} PropsWithChildren<UiItemCardProps> 参数说明。
 * @returns 函数返回值。
 */


export function UiItemCard({
  title,
  subtitle,
  meta,
  badge,
  active = false,
  className,
  children,
  ...props
}: PropsWithChildren<UiItemCardProps>) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const classes = ['next-ui-surface-card', 'next-ui-surface-card--compact', 'next-ui-interactive-card', 'next-ui-item-card'];
  if (active) {
    classes.push('is-active');
  }
  if (className) {
    classes.push(className);
  }

  return (
    <button {...props} type={props.type ?? 'button'} className={classes.join(' ')}>
      <div className="next-ui-item-card-head next-ui-entry-head">
        <span className="next-ui-item-card-title next-ui-entry-title">{title}</span>
        {badge ? <span className="next-ui-item-card-badge next-ui-entry-state">{badge}</span> : null}
      </div>
      {subtitle ? <div className="next-ui-item-card-subtitle next-ui-entry-note">{subtitle}</div> : null}
      {meta ? <div className="next-ui-item-card-meta next-ui-entry-note">{meta}</div> : null}
      {children}
    </button>
  );
}
