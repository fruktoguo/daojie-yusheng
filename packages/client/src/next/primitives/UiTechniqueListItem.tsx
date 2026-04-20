import type { ButtonHTMLAttributes, ReactNode } from 'react';
/**
 * UiTechniqueListItemProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiTechniqueListItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
/**
 * title：UiTechniqueListItemProps 内部字段。
 */

  title: string;  
  /**
 * level：UiTechniqueListItemProps 内部字段。
 */

  level: ReactNode;  
  /**
 * note：UiTechniqueListItemProps 内部字段。
 */

  note?: ReactNode;  
  /**
 * active：UiTechniqueListItemProps 内部字段。
 */

  active?: boolean;
}
/**
 * UiTechniqueListItem：执行核心业务逻辑。
 * @param {
  title,
  level,
  note,
  active = false,
  className,
  ...props
} UiTechniqueListItemProps 参数说明。
 * @returns 函数返回值。
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
