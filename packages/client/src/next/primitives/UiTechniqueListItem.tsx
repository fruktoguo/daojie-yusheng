import type { ButtonHTMLAttributes, ReactNode } from 'react';
/**
 * UiTechniqueListItemProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiTechniqueListItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
/**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * level：等级数值。
 */

  level: ReactNode;  
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
 * UiTechniqueListItem：读取Ui功法列表道具并返回结果。
 * @param {
  title,
  level,
  note,
  active = false,
  className,
  ...props
} UiTechniqueListItemProps 参数说明。
 * @returns 无返回值，直接更新Ui功法列表道具相关状态。
 */


export function UiTechniqueListItem({
  title,
  level,
  note,
  active = false,
  className,
  ...props
}: UiTechniqueListItemProps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const classes = ['next-ui-surface-card', 'next-ui-surface-card--compact', 'next-ui-interactive-card', 'next-ui-technique-item'];
  if (active) {
    classes.push('is-active');
  }
  if (className) {
    classes.push(className);
  }

  return (
    <button {...props} type={props.type ?? 'button'} className={classes.join(' ')}>
      <div className="next-ui-technique-item-head next-ui-entry-head">
        <span className="next-ui-technique-item-title next-ui-entry-title">{title}</span>
        <span className="next-ui-technique-item-level next-ui-entry-state">{level}</span>
      </div>
      {note ? <div className="next-ui-technique-item-note next-ui-entry-note">{note}</div> : null}
    </button>
  );
}
