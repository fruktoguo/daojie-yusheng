import type { ReactNode } from 'react';

import { UiTabButton } from './UiTabButton';
/**
 * UiTabListItem：定义接口结构约束，明确可交付字段含义。
 */


export interface UiTabListItem<TKey extends string = string> {
/**
 * key：key标识。
 */

  key: TKey;  
  /**
 * label：label名称或显示文本。
 */

  label: ReactNode;  
  /**
 * disabled：disabled相关字段。
 */

  disabled?: boolean;
}
/**
 * UiTabListProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiTabListProps<TKey extends string = string> {
/**
 * items：集合字段。
 */

  items: ReadonlyArray<UiTabListItem<TKey>>;  
  /**
 * activeKey：激活状态Key标识。
 */

  activeKey: TKey;  
  /**
 * onChange：onChange相关字段。
 */

  onChange: (key: TKey) => void;  
  /**
 * orientation：orientation相关字段。
 */

  orientation?: 'horizontal' | 'vertical';  
  /**
 * scrollable：scrollable相关字段。
 */

  scrollable?: boolean;  
  /**
 * className：class名称名称或显示文本。
 */

  className?: string;  
  /**
 * itemClassName：道具Class名称名称或显示文本。
 */

  itemClassName?: string;
}
/**
 * UiTabList：读取UiTab列表并返回结果。
 * @param {
  items,
  activeKey,
  onChange,
  orientation = 'horizontal',
  scrollable = false,
  className,
  itemClassName,
} UiTabListProps<TKey> 参数说明。
 * @returns 无返回值，直接更新UiTab列表相关状态。
 */


export function UiTabList<TKey extends string = string>({
  items,
  activeKey,
  onChange,
  orientation = 'horizontal',
  scrollable = false,
  className,
  itemClassName,
}: UiTabListProps<TKey>) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const classes = ['next-ui-tab-list', `next-ui-tab-list--${orientation}`];
  if (scrollable) {
    classes.push('next-ui-tab-list--scrollable');
  }
  if (className) {
    classes.push(className);
  }

  return (
    <div className={classes.join(' ')}>
      {items.map((item) => (
        <UiTabButton
          key={item.key}
          active={item.key === activeKey}
          disabled={item.disabled}
          className={itemClassName}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </UiTabButton>
      ))}
    </div>
  );
}
