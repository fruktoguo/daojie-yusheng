import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface UiTechniqueListItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  title: string;
  level: ReactNode;
  note?: ReactNode;
  active?: boolean;
}

export function UiTechniqueListItem({
  title,
  level,
  note,
  active = false,
  className,
  ...props
}: UiTechniqueListItemProps) {
  const classes = ['next-ui-surface-card', 'next-ui-surface-card--compact', 'next-ui-interactive-card', 'next-ui-technique-item'];
  if (active) {
    classes.push('is-active');
  }
  if (className) {
    classes.push(className);
  }

  return (
    <button {...props} type={props.type ?? 'button'} className={classes.join(' ')}>
      <div className="next-ui-technique-item-head next-ui-entry-head">
        <span className="next-ui-technique-item-title next-ui-entry-title">{title}</span>
        <span className="next-ui-technique-item-level next-ui-entry-state">{level}</span>
      </div>
      {note ? <div className="next-ui-technique-item-note next-ui-entry-note">{note}</div> : null}
    </button>
  );
}
