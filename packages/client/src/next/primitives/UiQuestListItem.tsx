import type { ButtonHTMLAttributes, ReactNode } from 'react';
/**
 * UiQuestListItemProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiQuestListItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
/**
 * title：UiQuestListItemProps 内部字段。
 */

  title: string;  
  /**
 * status：UiQuestListItemProps 内部字段。
 */

  status: ReactNode;  
  /**
 * note：UiQuestListItemProps 内部字段。
 */

  note?: ReactNode;  
  /**
 * active：UiQuestListItemProps 内部字段。
 */

  active?: boolean;
}
/**
 * UiQuestListItem：执行核心业务逻辑。
 * @param {
  title,
  status,
  note,
  active = false,
  className,
  ...props
} UiQuestListItemProps 参数说明。
 * @returns 函数返回值。
 */


export function UiQuestListItem({
  title,
  status,
  note,
  active = false,
  className,
  ...props
}: UiQuestListItemProps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const classes = ['next-ui-surface-card', 'next-ui-surface-card--compact', 'next-ui-interactive-card', 'next-ui-quest-item'];
  if (active) {
    classes.push('is-active');
  }
  if (className) {
    classes.push(className);
  }

  return (
    <button {...props} type={props.type ?? 'button'} className={classes.join(' ')}>
      <div className="next-ui-quest-item-head next-ui-entry-head">
        <span className="next-ui-quest-item-title next-ui-entry-title">{title}</span>
        <span className="next-ui-quest-item-status next-ui-entry-state">{status}</span>
      </div>
      {note ? <div className="next-ui-quest-item-note next-ui-entry-note">{note}</div> : null}
    </button>
  );
}
