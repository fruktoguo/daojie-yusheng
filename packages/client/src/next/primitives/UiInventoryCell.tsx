import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { UiGameItem, type UiGameItemGradeTone } from './UiGameItem';
/**
 * UiInventoryCellProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiInventoryCellProps extends ButtonHTMLAttributes<HTMLButtonElement> {
/**
 * name：UiInventoryCellProps 内部字段。
 */

  name: string;  
  /**
 * note：UiInventoryCellProps 内部字段。
 */

  note?: ReactNode;  
  /**
 * quantity：UiInventoryCellProps 内部字段。
 */

  quantity?: ReactNode;  
  /**
 * grade：UiInventoryCellProps 内部字段。
 */

  grade?: ReactNode;  
  /**
 * gradeTone：UiInventoryCellProps 内部字段。
 */

  gradeTone?: UiGameItemGradeTone | null;  
  /**
 * typeLabel：UiInventoryCellProps 内部字段。
 */

  typeLabel?: ReactNode;  
  /**
 * chips：UiInventoryCellProps 内部字段。
 */

  chips?: ReactNode[];  
  /**
 * actions：UiInventoryCellProps 内部字段。
 */

  actions?: ReactNode;  
  /**
 * active：UiInventoryCellProps 内部字段。
 */

  active?: boolean;
}
/**
 * UiInventoryCell：执行核心业务逻辑。
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
 * @returns 函数返回值。
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
