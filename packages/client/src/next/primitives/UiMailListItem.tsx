import type { ButtonHTMLAttributes, ReactNode } from 'react';
/**
 * UiMailListItemProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiMailListItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
/**
 * title：UiMailListItemProps 内部字段。
 */

  title: string;  
  /**
 * sender：UiMailListItemProps 内部字段。
 */

  sender: ReactNode;  
  /**
 * status：UiMailListItemProps 内部字段。
 */

  status: ReactNode;  
  /**
 * note：UiMailListItemProps 内部字段。
 */

  note?: ReactNode;  
  /**
 * active：UiMailListItemProps 内部字段。
 */

  active?: boolean;
}
/**
 * UiMailListItem：执行核心业务逻辑。
 * @param {
  title,
  sender,
  status,
  note,
  active = false,
  className,
  ...props
} UiMailListItemProps 参数说明。
 * @returns 函数返回值。
 */


export function UiMailListItem({
  title,
  sender,
  status,
  note,
  active = false,
  className,
  ...props
}: UiMailListItemProps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const classes = ['next-ui-surface-card', 'next-ui-surface-card--compact', 'next-ui-interactive-card', 'next-ui-mail-item'];
  if (active) {
    classes.push('is-active');
  }
  if (className) {
    classes.push(className);
  }

  return (
    <button {...props} type={props.type ?? 'button'} className={classes.join(' ')}>
      <div className="next-ui-mail-item-head next-ui-entry-head">
        <span className="next-ui-mail-item-title next-ui-entry-title">{title}</span>
        <span className="next-ui-mail-item-status next-ui-entry-state">{status}</span>
      </div>
      <div className="next-ui-mail-item-sender next-ui-entry-note">{sender}</div>
      {note ? <div className="next-ui-mail-item-note next-ui-entry-note">{note}</div> : null}
    </button>
  );
}
