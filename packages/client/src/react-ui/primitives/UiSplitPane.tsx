import type { CSSProperties, ReactNode } from 'react';
/**
 * UiSplitPaneProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiSplitPaneProps {
/**
 * primary：primary相关字段。
 */

  primary: ReactNode;  
  /**
 * secondary：secondary相关字段。
 */

  secondary: ReactNode;  
  /**
 * secondarySize：数量或计量字段。
 */

  secondarySize?: number | string;  
  /**
 * className：class名称名称或显示文本。
 */

  className?: string;
}
/**
 * UiSplitPane：判断UiSplitPane是否满足条件。
 * @param {
  primary,
  secondary,
  secondarySize = 300,
  className,
} UiSplitPaneProps 参数说明。
 * @returns 无返回值，直接更新UiSplitPane相关状态。
 */


export function UiSplitPane({
  primary,
  secondary,
  secondarySize = 300,
  className,
}: UiSplitPaneProps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const classes = ['react-ui-split-pane'];
  if (className) {
    classes.push(className);
  }

  const secondaryTrack = typeof secondarySize === 'number' ? `${secondarySize}px` : secondarySize;

  return (
    <div
      className={classes.join(' ')}
      style={{ '--react-ui-split-pane-secondary': secondaryTrack } as CSSProperties}
    >
      <div className="react-ui-split-pane-primary">{primary}</div>
      <div className="react-ui-split-pane-secondary">{secondary}</div>
    </div>
  );
}
