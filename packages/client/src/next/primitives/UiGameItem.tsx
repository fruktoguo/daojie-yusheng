import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from 'react';

export type UiGameItemGradeTone =
  | 'mortal'
  | 'yellow'
  | 'mystic'
  | 'earth'
  | 'heaven'
  | 'spirit'
  | 'saint'
  | 'emperor';

export interface UiGameItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  name: string;
  typeLabel?: ReactNode;
  quantity?: ReactNode;
  gradeLabel?: ReactNode;
  note?: ReactNode;
  chips?: ReactNode[];
  actions?: ReactNode;
  active?: boolean;
  compactName?: boolean;
  gradeTone?: UiGameItemGradeTone | null;
}

export function UiGameItem({
  name,
  typeLabel,
  quantity,
  gradeLabel,
  note,
  chips = [],
  actions,
  active = false,
  compactName = false,
  gradeTone = null,
  className,
  children,
  ...props
}: PropsWithChildren<UiGameItemProps>) {
  const classes = ['next-ui-game-item'];
  if (active) {
    classes.push('is-active');
  }
  if (compactName) {
    classes.push('next-ui-game-item--compact-name');
  }
  if (gradeTone) {
    classes.push('next-ui-game-item--grade', `next-ui-game-item--grade-${gradeTone}`);
  }
  if (className) {
    classes.push(className);
  }

  return (
    <button {...props} type={props.type ?? 'button'} className={classes.join(' ')}>
      <div className="next-ui-game-item-head">
        <span className="next-ui-game-item-type">{typeLabel}</span>
        {quantity ? <span className="next-ui-game-item-count">{quantity}</span> : null}
      </div>
      <div className="next-ui-game-item-name">{name}</div>
      {chips.length > 0 ? (
        <div className="next-ui-game-item-chip-row">
          {chips.map((chip, index) => (
            <span key={index} className="next-ui-game-item-chip">{chip}</span>
          ))}
        </div>
      ) : null}
      {gradeLabel ? <div className="next-ui-game-item-grade">{gradeLabel}</div> : null}
      {note ? <div className="next-ui-game-item-note">{note}</div> : null}
      {children}
      {actions ? <div className="next-ui-game-item-actions">{actions}</div> : null}
    </button>
  );
}
