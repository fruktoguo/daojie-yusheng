/**
 * 本文件提供 React UI 的 UiPill 基础组件，用于复用面板内的视觉和交互片段。
 *
 * 维护时应保持组件无业务真源，只通过 props 呈现状态，并兼顾浅色、深色与移动端可用性。
 */
import type { PropsWithChildren } from 'react';
/**
 * UiPillProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiPillProps {
/**
 * tone：tone相关字段。
 */

  tone?: 'default' | 'accent';  
  /**
 * className：class名称名称或显示文本。
 */

  className?: string;
}
/**
 * UiPill：渲染UiPill组件。
 * @param {
  tone = 'default',
  className,
  children,
} PropsWithChildren<UiPillProps> 参数说明。
 * @returns 无返回值，直接更新UiPill相关状态。
 */


export function UiPill({
  tone = 'default',
  className,
  children,
}: PropsWithChildren<UiPillProps>) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const classes = ['react-ui-pill', `react-ui-pill--${tone}`];
  if (className) {
    classes.push(className);
  }
  return <span className={classes.join(' ')}>{children}</span>;
}
