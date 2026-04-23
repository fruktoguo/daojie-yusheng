import type { ButtonHTMLAttributes, ReactNode } from 'react';
/**
 * UiQuestListItemProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiQuestListItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
/**
 * title：title名称或显示文本。
 */

  title: string;  
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
 * UiQuestListItem：读取Ui任务列表道具并返回结果。
 * @param {
  title,
  status,
  note,
  active = false,
  className,
  ...props
} UiQuestListItemProps 参数说明。
 * @returns 无返回值，直接更新Ui任务列表道具相关状态。
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

  const classes = ['react-ui-surface-card', 'react-ui-surface-card--compact', 'react-ui-interactive-card', 'react-ui-quest-item'];
  if (active) {
    classes.push('is-active');
  }
  if (className) {
    classes.push(className);
  }

  return (
    <button {...props} type={props.type ?? 'button'} className={classes.join(' ')}>
      <div className="react-ui-quest-item-head react-ui-entry-head">
        <span className="react-ui-quest-item-title react-ui-entry-title">{title}</span>
        <span className="react-ui-quest-item-status react-ui-entry-state">{status}</span>
      </div>
      {note ? <div className="react-ui-quest-item-note react-ui-entry-note">{note}</div> : null}
    </button>
  );
}
