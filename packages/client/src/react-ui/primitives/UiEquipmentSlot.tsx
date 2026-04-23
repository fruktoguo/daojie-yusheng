import type { ButtonHTMLAttributes, ReactNode } from 'react';
/**
 * UiEquipmentSlotProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiEquipmentSlotProps extends ButtonHTMLAttributes<HTMLButtonElement> {
/**
 * slot：slot相关字段。
 */

  slot: string;  
  /**
 * itemName：道具名称名称或显示文本。
 */

  itemName?: ReactNode;  
  /**
 * stateLabel：状态Label名称或显示文本。
 */

  stateLabel?: ReactNode;  
  /**
 * active：启用开关或状态标识。
 */

  active?: boolean;
}
/**
 * UiEquipmentSlot：渲染Ui装备Slot组件。
 * @param {
  slot,
  itemName,
  stateLabel,
  active = false,
  className,
  ...props
} UiEquipmentSlotProps 参数说明。
 * @returns 无返回值，直接更新Ui装备Slot相关状态。
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

  const classes = ['react-ui-surface-card', 'react-ui-surface-card--compact', 'react-ui-interactive-card', 'react-ui-equipment-slot'];
  if (active) {
    classes.push('is-active');
  }
  if (className) {
    classes.push(className);
  }

  return (
    <button {...props} type={props.type ?? 'button'} className={classes.join(' ')}>
      <div className="react-ui-equipment-slot-head react-ui-entry-head">
        <span className="react-ui-equipment-slot-name react-ui-entry-title">{slot}</span>
        {stateLabel ? <span className="react-ui-equipment-slot-state react-ui-entry-state">{stateLabel}</span> : null}
      </div>
      <div className="react-ui-equipment-slot-item react-ui-entry-note">{itemName ?? '未装备'}</div>
    </button>
  );
}
