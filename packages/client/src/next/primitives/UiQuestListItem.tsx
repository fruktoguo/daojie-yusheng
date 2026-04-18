import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface UiQuestListItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  title: string;
  status: ReactNode;
  note?: ReactNode;
  active?: boolean;
}

export function UiQuestListItem({
  title,
  status,
  note,
  active = false,
  className,
  ...props
}: UiQuestListItemProps) {
  const classes = ['next-ui-surface-card', 'next-ui-surface-card--compact', 'next-ui-interactive-card', 'next-ui-quest-item'];
  if (active) {
    classes.push('is-active');
  }
  if (className) {
    classes.push(className);
  }

  return (
    <button {...props} type={props.type ?? 'button'} className={classes.join(' ')}>
      <div className="next-ui-quest-item-head next-ui-entry-head">
        <span className="next-ui-quest-item-title next-ui-entry-title">{title}</span>
        <span className="next-ui-quest-item-status next-ui-entry-state">{status}</span>
      </div>
      {note ? <div className="next-ui-quest-item-note next-ui-entry-note">{note}</div> : null}
    </button>
  );
}
