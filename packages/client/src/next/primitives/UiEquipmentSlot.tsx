import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface UiEquipmentSlotProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  slot: string;
  itemName?: ReactNode;
  stateLabel?: ReactNode;
  active?: boolean;
}

export function UiEquipmentSlot({
  slot,
  itemName,
  stateLabel,
  active = false,
  className,
  ...props
}: UiEquipmentSlotProps) {
  const classes = ['next-ui-surface-card', 'next-ui-surface-card--compact', 'next-ui-interactive-card', 'next-ui-equipment-slot'];
  if (active) {
    classes.push('is-active');
  }
  if (className) {
    classes.push(className);
  }

  return (
    <button {...props} type={props.type ?? 'button'} className={classes.join(' ')}>
      <div className="next-ui-equipment-slot-head next-ui-entry-head">
        <span className="next-ui-equipment-slot-name next-ui-entry-title">{slot}</span>
        {stateLabel ? <span className="next-ui-equipment-slot-state next-ui-entry-state">{stateLabel}</span> : null}
      </div>
      <div className="next-ui-equipment-slot-item next-ui-entry-note">{itemName ?? '未装备'}</div>
    </button>
  );
}
