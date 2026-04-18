import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface UiMailListItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  title: string;
  sender: ReactNode;
  status: ReactNode;
  note?: ReactNode;
  active?: boolean;
}

export function UiMailListItem({
  title,
  sender,
  status,
  note,
  active = false,
  className,
  ...props
}: UiMailListItemProps) {
  const classes = ['next-ui-surface-card', 'next-ui-surface-card--compact', 'next-ui-interactive-card', 'next-ui-mail-item'];
  if (active) {
    classes.push('is-active');
  }
  if (className) {
    classes.push(className);
  }

  return (
    <button {...props} type={props.type ?? 'button'} className={classes.join(' ')}>
      <div className="next-ui-mail-item-head next-ui-entry-head">
        <span className="next-ui-mail-item-title next-ui-entry-title">{title}</span>
        <span className="next-ui-mail-item-status next-ui-entry-state">{status}</span>
      </div>
      <div className="next-ui-mail-item-sender next-ui-entry-note">{sender}</div>
      {note ? <div className="next-ui-mail-item-note next-ui-entry-note">{note}</div> : null}
    </button>
  );
}
