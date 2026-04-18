import type { ReactNode } from 'react';

import { UiTabButton } from './UiTabButton';

export interface UiTabListItem<TKey extends string = string> {
  key: TKey;
  label: ReactNode;
  disabled?: boolean;
}

export interface UiTabListProps<TKey extends string = string> {
  items: ReadonlyArray<UiTabListItem<TKey>>;
  activeKey: TKey;
  onChange: (key: TKey) => void;
  orientation?: 'horizontal' | 'vertical';
  scrollable?: boolean;
  className?: string;
  itemClassName?: string;
}

export function UiTabList<TKey extends string = string>({
  items,
  activeKey,
  onChange,
  orientation = 'horizontal',
  scrollable = false,
  className,
  itemClassName,
}: UiTabListProps<TKey>) {
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
