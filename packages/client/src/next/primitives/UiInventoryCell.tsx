import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { UiGameItem, type UiGameItemGradeTone } from './UiGameItem';

export interface UiInventoryCellProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  name: string;
  note?: ReactNode;
  quantity?: ReactNode;
  grade?: ReactNode;
  gradeTone?: UiGameItemGradeTone | null;
  typeLabel?: ReactNode;
  chips?: ReactNode[];
  actions?: ReactNode;
  active?: boolean;
}

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
