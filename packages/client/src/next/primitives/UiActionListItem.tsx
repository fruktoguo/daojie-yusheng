import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface UiActionListItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  title: string;
  state: ReactNode;
  note?: ReactNode;
  active?: boolean;
}

export function UiActionListItem({
  title,
  state,
  note,
  active = false,
  className,
  ...props
}: UiActionListItemProps) {
  const classes = ['next-ui-surface-card', 'next-ui-surface-card--compact', 'next-ui-interactive-card', 'next-ui-action-item'];
  if (active) {
    classes.push('is-active');
  }
  if (className) {
    classes.push(className);
  }

  return (
    <button {...props} type={props.type ?? 'button'} className={classes.join(' ')}>
      <div className="next-ui-action-item-head next-ui-entry-head">
        <span className="next-ui-action-item-title next-ui-entry-title">{title}</span>
        <span className="next-ui-action-item-state next-ui-entry-state">{state}</span>
      </div>
      {note ? <div className="next-ui-action-item-note next-ui-entry-note">{note}</div> : null}
    </button>
  );
}
