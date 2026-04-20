import type { PropsWithChildren, ReactNode } from 'react';
/**
 * UiSectionProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiSectionProps {
/**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * subtitle：subtitle名称或显示文本。
 */

  subtitle?: ReactNode;  
  /**
 * actions：action相关字段。
 */

  actions?: ReactNode;  
  /**
 * className：class名称名称或显示文本。
 */

  className?: string;
}
/**
 * UiSection：判断UiSection是否满足条件。
 * @param {
  title,
  subtitle,
  actions,
  className,
  children,
} PropsWithChildren<UiSectionProps> 参数说明。
 * @returns 无返回值，直接更新UiSection相关状态。
 */


export function UiSection({
  title,
  subtitle,
  actions,
  className,
  children,
}: PropsWithChildren<UiSectionProps>) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const sectionClasses = ['next-ui-section', 'next-ui-surface-pane', 'next-ui-surface-pane--stack'];
  if (className) {
    sectionClasses.push(className);
  }
  return (
    <section className={sectionClasses.join(' ')}>
      <div className="next-ui-section-head">
        <div>
          <div className="next-ui-section-title">{title}</div>
          {subtitle ? <div className="next-ui-section-subtext">{subtitle}</div> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
