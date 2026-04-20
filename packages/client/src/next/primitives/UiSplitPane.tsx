import type { CSSProperties, ReactNode } from 'react';
/**
 * UiSplitPaneProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiSplitPaneProps {
/**
 * primary：UiSplitPaneProps 内部字段。
 */

  primary: ReactNode;  
  /**
 * secondary：UiSplitPaneProps 内部字段。
 */

  secondary: ReactNode;  
  /**
 * secondarySize：UiSplitPaneProps 内部字段。
 */

  secondarySize?: number | string;  
  /**
 * className：UiSplitPaneProps 内部字段。
 */

  className?: string;
}
/**
 * UiSplitPane：执行核心业务逻辑。
 * @param {
  primary,
  secondary,
  secondarySize = 300,
  className,
} UiSplitPaneProps 参数说明。
 * @returns 函数返回值。
 */


export function UiSplitPane({
  primary,
  secondary,
  secondarySize = 300,
  className,
}: UiSplitPaneProps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
