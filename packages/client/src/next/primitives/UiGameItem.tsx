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
 * name：名称名称或显示文本。
 */

  name: string;  
  /**
 * typeLabel：typeLabel名称或显示文本。
 */

  typeLabel?: ReactNode;  
  /**
 * quantity：quantity相关字段。
 */

  quantity?: ReactNode;  
  /**
 * gradeLabel：gradeLabel名称或显示文本。
 */

  gradeLabel?: ReactNode;  
  /**
 * note：note相关字段。
 */

  note?: ReactNode;  
  /**
 * chips：chip相关字段。
 */

  chips?: ReactNode[];  
  /**
 * actions：action相关字段。
 */

  actions?: ReactNode;  
  /**
 * active：启用开关或状态标识。
 */

  active?: boolean;  
  /**
 * compactName：compact名称名称或显示文本。
 */

  compactName?: boolean;  
  /**
 * gradeTone：gradeTone相关字段。
 */

  gradeTone?: UiGameItemGradeTone | null;
}
/**
 * UiGameItem：渲染UiGame道具组件。
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
 * @returns 无返回值，直接更新UiGame道具相关状态。
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
