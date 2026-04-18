export interface UiEmptyHintProps {
  text: string;
  className?: string;
}

export function UiEmptyHint({ text, className }: UiEmptyHintProps) {
  const classes = ['next-ui-empty-hint'];
  if (className) {
    classes.push(className);
  }
  return <div className={classes.join(' ')}>{text}</div>;
}
