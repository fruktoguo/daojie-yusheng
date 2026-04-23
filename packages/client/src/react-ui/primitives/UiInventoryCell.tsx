import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { UiGameItem, type UiGameItemGradeTone } from './UiGameItem';
/**
 * UiInventoryCellProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiInventoryCellProps extends ButtonHTMLAttributes<HTMLButtonElement> {
/**
 * name：名称名称或显示文本。
 */

  name: string;  
  /**
 * note：note相关字段。
 */

  note?: ReactNode;  
  /**
 * quantity：quantity相关字段。
 */

  quantity?: ReactNode;  
  /**
 * grade：grade相关字段。
 */

  grade?: ReactNode;  
  /**
 * gradeTone：gradeTone相关字段。
 */

  gradeTone?: UiGameItemGradeTone | null;  
  /**
 * typeLabel：typeLabel名称或显示文本。
 */

  typeLabel?: ReactNode;  
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
}
/**
 * UiInventoryCell：渲染Ui背包Cell组件。
 * @param {
  name,
  note,
  quantity,
  grade,
  gradeTone = null,
  typeLabel,
  chips = [],
  actions,
  active = false,
  className,
  ...props
} UiInventoryCellProps 参数说明。
 * @returns 无返回值，直接更新Ui背包Cell相关状态。
 */


export function UiInventoryCell({
  name,
  note,
  quantity,
  grade,
  gradeTone = null,
  typeLabel,
  chips = [],
  actions,
  active = false,
  className,
  ...props
}: UiInventoryCellProps) {
  return (
    <UiGameItem
      {...props}
      className={className}
      name={name}
      typeLabel={typeLabel}
      quantity={quantity}
      gradeLabel={grade}
      note={note}
      chips={chips}
      actions={actions}
      active={active}
      gradeTone={gradeTone}
      compactName={name.length >= 8}
    />
  );
}
