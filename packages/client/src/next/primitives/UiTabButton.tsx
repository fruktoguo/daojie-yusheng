import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

export interface UiTabButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export function UiTabButton({
  active = false,
  className,
  children,
  ...props
}: PropsWithChildren<UiTabButtonProps>) {
  const classes = ['next-ui-tab-btn'];
  if (active) {
    classes.push('active');
  }
  if (className) {
    classes.push(className);
  }
  return (
    <button {...props} type={props.type ?? 'button'} className={classes.join(' ')}>
      {children}
    </button>
  );
}
