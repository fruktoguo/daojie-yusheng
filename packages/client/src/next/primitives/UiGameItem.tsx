import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from 'react';
/**
 * UiGameItemGradeTone：统一结构类型，保证协议与运行时一致性。
 */


export type UiGameItemGradeTone =
  | 'mortal'
  | 'yellow'
  | 'mystic'
  | 'earth'
  | 'heaven'
  | 'spirit'
  | 'saint'
  | 'emperor';  
  /**
 * UiGameItemProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiGameItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
/**
 * name：UiGameItemProps 内部字段。
 */

  name: string;  
  /**
 * typeLabel：UiGameItemProps 内部字段。
 */

  typeLabel?: ReactNode;  
  /**
 * quantity：UiGameItemProps 内部字段。
 */

  quantity?: ReactNode;  
  /**
 * gradeLabel：UiGameItemProps 内部字段。
 */

  gradeLabel?: ReactNode;  
  /**
 * note：UiGameItemProps 内部字段。
 */

  note?: ReactNode;  
  /**
 * chips：UiGameItemProps 内部字段。
 */

  chips?: ReactNode[];  
  /**
 * actions：UiGameItemProps 内部字段。
 */

  actions?: ReactNode;  
  /**
 * active：UiGameItemProps 内部字段。
 */

  active?: boolean;  
  /**
 * compactName：UiGameItemProps 内部字段。
 */

  compactName?: boolean;  
  /**
 * gradeTone：UiGameItemProps 内部字段。
 */

  gradeTone?: UiGameItemGradeTone | null;
}
/**
 * UiGameItem：执行核心业务逻辑。
 * @param {
  name,
  typeLabel,
  quantity,
  gradeLabel,
  note,
  chips = [],
  actions,
  active = false,
  compactName = false,
  gradeTone = null,
  className,
  children,
  ...props
} PropsWithChildren<UiGameItemProps> 参数说明。
 * @returns 函数返回值。
 */


export function UiGameItem({
  name,
  typeLabel,
  quantity,
  gradeLabel,
  note,
  chips = [],
  actions,
  active = false,
  compactName = false,
  gradeTone = null,
  className,
  children,
  ...props
}: PropsWithChildren<UiGameItemProps>) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const classes = ['next-ui-game-item'];
  if (active) {
    classes.push('is-active');
  }
  if (compactName) {
    classes.push('next-ui-game-item--compact-name');
  }
  if (gradeTone) {
    classes.push('next-ui-game-item--grade', `next-ui-game-item--grade-${gradeTone}`);
  }
  if (className) {
    classes.push(className);
  }

  return (
    <button {...props} type={props.type ?? 'button'} className={classes.join(' ')}>
      <div className="next-ui-game-item-head">
        <span className="next-ui-game-item-type">{typeLabel}</span>
        {quantity ? <span className="next-ui-game-item-count">{quantity}</span> : null}
      </div>
      <div className="next-ui-game-item-name">{name}</div>
      {chips.length > 0 ? (
        <div className="next-ui-game-item-chip-row">
          {chips.map((chip, index) => (
            <span key={index} className="next-ui-game-item-chip">{chip}</span>
          ))}
        </div>
      ) : null}
      {gradeLabel ? <div className="next-ui-game-item-grade">{gradeLabel}</div> : null}
      {note ? <div className="next-ui-game-item-note">{note}</div> : null}
      {children}
      {actions ? <div className="next-ui-game-item-actions">{actions}</div> : null}
    </button>
  );
}
