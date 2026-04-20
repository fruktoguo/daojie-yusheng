import type { ButtonHTMLAttributes, ReactNode } from 'react';
/**
 * UiActionListItemProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiActionListItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
/**
 * title：UiActionListItemProps 内部字段。
 */

  title: string;  
  /**
 * state：UiActionListItemProps 内部字段。
 */

  state: ReactNode;  
  /**
 * note：UiActionListItemProps 内部字段。
 */

  note?: ReactNode;  
  /**
 * active：UiActionListItemProps 内部字段。
 */

  active?: boolean;
}
/**
 * UiActionListItem：执行核心业务逻辑。
 * @param {
  title,
  state,
  note,
  active = false,
  className,
  ...props
} UiActionListItemProps 参数说明。
 * @returns 函数返回值。
 */


export function UiActionListItem({
  title,
  state,
  note,
  active = false,
  className,
  ...props
}: UiActionListItemProps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const classes = ['next-ui-surface-card', 'next-ui-surface-card--compact', 'next-ui-interactive-card', 'next-ui-action-item'];
  if (active) {
    classes.push('is-active');
  }
  if (className) {
    classes.push(className);
  }

  return (
    <button {...props} type={props.type ?? 'button'} className={classes.join(' ')}>
      <div className="next-ui-action-item-head next-ui-entry-head">
        <span className="next-ui-action-item-title next-ui-entry-title">{title}</span>
        <span className="next-ui-action-item-state next-ui-entry-state">{state}</span>
      </div>
      {note ? <div className="next-ui-action-item-note next-ui-entry-note">{note}</div> : null}
    </button>
  );
}
