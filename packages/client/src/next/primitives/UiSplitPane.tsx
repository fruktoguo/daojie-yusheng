import type { CSSProperties, ReactNode } from 'react';

export interface UiSplitPaneProps {
  primary: ReactNode;
  secondary: ReactNode;
  secondarySize?: number | string;
  className?: string;
}

export function UiSplitPane({
  primary,
  secondary,
  secondarySize = 300,
  className,
}: UiSplitPaneProps) {
  const classes = ['next-ui-split-pane'];
  if (className) {
    classes.push(className);
  }

  const secondaryTrack = typeof secondarySize === 'number' ? `${secondarySize}px` : secondarySize;

  return (
    <div
      className={classes.join(' ')}
      style={{ '--next-ui-split-pane-secondary': secondaryTrack } as CSSProperties}
    >
      <div className="next-ui-split-pane-primary">{primary}</div>
      <div className="next-ui-split-pane-secondary">{secondary}</div>
    </div>
  );
}
