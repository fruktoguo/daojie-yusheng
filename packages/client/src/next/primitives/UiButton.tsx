import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

type UiButtonVariant = 'ghost' | 'danger';

export interface UiButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variants?: UiButtonVariant[];
}

export function UiButton({
  variants = [],
  className,
  children,
  ...props
}: PropsWithChildren<UiButtonProps>) {
  const classes = ['small-btn', 'ui-btn', ...variants];
  if (className) {
    classes.push(className);
  }
  return (
    <button {...props} className={classes.join(' ')}>
      {children}
    </button>
  );
}
