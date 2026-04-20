import type { ReactNode } from 'react';

import { UiTabButton } from './UiTabButton';
/**
 * UiTabListItem：定义接口结构约束，明确可交付字段含义。
 */


export interface UiTabListItem<TKey extends string = string> {
/**
 * key：UiTabListItem 内部字段。
 */

  key: TKey;  
  /**
 * label：UiTabListItem 内部字段。
 */

  label: ReactNode;  
  /**
 * disabled：UiTabListItem 内部字段。
 */

  disabled?: boolean;
}
/**
 * UiTabListProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiTabListProps<TKey extends string = string> {
/**
 * items：UiTabListProps 内部字段。
 */

  items: ReadonlyArray<UiTabListItem<TKey>>;  
  /**
 * activeKey：UiTabListProps 内部字段。
 */

  activeKey: TKey;  
  /**
 * onChange：UiTabListProps 内部字段。
 */

  onChange: (key: TKey) => void;  
  /**
 * orientation：UiTabListProps 内部字段。
 */

  orientation?: 'horizontal' | 'vertical';  
  /**
 * scrollable：UiTabListProps 内部字段。
 */

  scrollable?: boolean;  
  /**
 * className：UiTabListProps 内部字段。
 */

  className?: string;  
  /**
 * itemClassName：UiTabListProps 内部字段。
 */

  itemClassName?: string;
}
/**
 * UiTabList：执行核心业务逻辑。
 * @param {
  items,
  activeKey,
  onChange,
  orientation = 'horizontal',
  scrollable = false,
  className,
  itemClassName,
} UiTabListProps<TKey> 参数说明。
 * @returns 函数返回值。
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
