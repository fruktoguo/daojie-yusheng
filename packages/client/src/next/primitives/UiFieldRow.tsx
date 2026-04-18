import type { PropsWithChildren, ReactNode } from 'react';

export interface UiFieldRowProps {
  label: ReactNode;
  value?: ReactNode;
  className?: string;
}

export function UiFieldRow({
  label,
  value,
  className,
  children,
}: PropsWithChildren<UiFieldRowProps>) {
  const classes = ['next-ui-field-row'];
  if (className) {
    classes.push(className);
  }

  return (
    <div className={classes.join(' ')}>
      <span className="next-ui-field-row-label">{label}</span>
      {children ? <div className="next-ui-field-row-content">{children}</div> : null}
      {value !== undefined ? <span className="next-ui-field-row-value">{value}</span> : null}
    </div>
  );
}
