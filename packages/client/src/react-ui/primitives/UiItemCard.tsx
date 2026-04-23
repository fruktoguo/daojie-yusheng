import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from 'react';
/**
 * UiItemCardProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiItemCardProps extends ButtonHTMLAttributes<HTMLButtonElement> {
/**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * subtitle：subtitle名称或显示文本。
 */

  subtitle?: ReactNode;  
  /**
 * meta：meta相关字段。
 */

  meta?: ReactNode;  
  /**
 * badge：badge相关字段。
 */

  badge?: ReactNode;  
  /**
 * active：启用开关或状态标识。
 */

  active?: boolean;
}
/**
 * UiItemCard：渲染Ui道具Card组件。
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
 * @returns 无返回值，直接更新Ui道具Card相关状态。
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

  const classes = ['react-ui-surface-card', 'react-ui-surface-card--compact', 'react-ui-interactive-card', 'react-ui-item-card'];
  if (active) {
    classes.push('is-active');
  }
  if (className) {
    classes.push(className);
  }

  return (
    <button {...props} type={props.type ?? 'button'} className={classes.join(' ')}>
      <div className="react-ui-item-card-head react-ui-entry-head">
        <span className="react-ui-item-card-title react-ui-entry-title">{title}</span>
        {badge ? <span className="react-ui-item-card-badge react-ui-entry-state">{badge}</span> : null}
      </div>
      {subtitle ? <div className="react-ui-item-card-subtitle react-ui-entry-note">{subtitle}</div> : null}
      {meta ? <div className="react-ui-item-card-meta react-ui-entry-note">{meta}</div> : null}
      {children}
    </button>
  );
}
