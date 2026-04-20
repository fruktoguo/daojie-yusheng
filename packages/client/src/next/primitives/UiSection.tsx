import type { PropsWithChildren, ReactNode } from 'react';
/**
 * UiSectionProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiSectionProps {
/**
 * title：UiSectionProps 内部字段。
 */

  title: string;  
  /**
 * subtitle：UiSectionProps 内部字段。
 */

  subtitle?: ReactNode;  
  /**
 * actions：UiSectionProps 内部字段。
 */

  actions?: ReactNode;  
  /**
 * className：UiSectionProps 内部字段。
 */

  className?: string;
}
/**
 * UiSection：执行核心业务逻辑。
 * @param {
  title,
  subtitle,
  actions,
  className,
  children,
} PropsWithChildren<UiSectionProps> 参数说明。
 * @returns 函数返回值。
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
