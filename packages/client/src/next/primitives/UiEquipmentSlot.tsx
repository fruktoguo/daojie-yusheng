import type { ButtonHTMLAttributes, ReactNode } from 'react';
/**
 * UiEquipmentSlotProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiEquipmentSlotProps extends ButtonHTMLAttributes<HTMLButtonElement> {
/**
 * slot：UiEquipmentSlotProps 内部字段。
 */

  slot: string;  
  /**
 * itemName：UiEquipmentSlotProps 内部字段。
 */

  itemName?: ReactNode;  
  /**
 * stateLabel：UiEquipmentSlotProps 内部字段。
 */

  stateLabel?: ReactNode;  
  /**
 * active：UiEquipmentSlotProps 内部字段。
 */

  active?: boolean;
}
/**
 * UiEquipmentSlot：执行核心业务逻辑。
 * @param {
  slot,
  itemName,
  stateLabel,
  active = false,
  className,
  ...props
} UiEquipmentSlotProps 参数说明。
 * @returns 函数返回值。
 */


export function UiEquipmentSlot({
  slot,
  itemName,
  stateLabel,
  active = false,
  className,
  ...props
}: UiEquipmentSlotProps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
