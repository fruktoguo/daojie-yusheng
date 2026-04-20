import type { ButtonHTMLAttributes, ReactNode } from 'react';
/**
 * UiActionListItemProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiActionListItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
/**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * state：状态状态或数据块。
 */

  state: ReactNode;  
  /**
 * note：note相关字段。
 */

  note?: ReactNode;  
  /**
 * active：启用开关或状态标识。
 */

  active?: boolean;
}
/**
 * UiActionListItem：读取UiAction列表道具并返回结果。
 * @param {
  title,
  state,
  note,
  active = false,
  className,
  ...props
} UiActionListItemProps 参数说明。
 * @returns 无返回值，直接更新UiAction列表道具相关状态。
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
