import type { ButtonHTMLAttributes, ReactNode } from 'react';
/**
 * UiMailListItemProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiMailListItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
/**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * sender：sender相关字段。
 */

  sender: ReactNode;  
  /**
 * status：statu状态或数据块。
 */

  status: ReactNode;  
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
 * UiMailListItem：读取Ui邮件列表道具并返回结果。
 * @param {
  title,
  sender,
  status,
  note,
  active = false,
  className,
  ...props
} UiMailListItemProps 参数说明。
 * @returns 无返回值，直接更新Ui邮件列表道具相关状态。
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

  const classes = ['react-ui-surface-card', 'react-ui-surface-card--compact', 'react-ui-interactive-card', 'react-ui-mail-item'];
  if (active) {
    classes.push('is-active');
  }
  if (className) {
    classes.push(className);
  }

  return (
    <button {...props} type={props.type ?? 'button'} className={classes.join(' ')}>
      <div className="react-ui-mail-item-head react-ui-entry-head">
        <span className="react-ui-mail-item-title react-ui-entry-title">{title}</span>
        <span className="react-ui-mail-item-status react-ui-entry-state">{status}</span>
      </div>
      <div className="react-ui-mail-item-sender react-ui-entry-note">{sender}</div>
      {note ? <div className="react-ui-mail-item-note react-ui-entry-note">{note}</div> : null}
    </button>
  );
}
