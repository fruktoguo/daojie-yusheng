export interface UiEmptyHintProps {
  text: string;
  className?: string;
}

export function UiEmptyHint({ text, className }: UiEmptyHintProps) {
  const classes = ['empty-hint', 'ui-empty-hint'];
  if (className) {
    classes.push(className);
  }
  return <div className={classes.join(' ')}>{text}</div>;
}
