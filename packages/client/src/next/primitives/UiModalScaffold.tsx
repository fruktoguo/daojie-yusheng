import type { PropsWithChildren, ReactNode } from 'react';
/**
 * UiModalScaffoldProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiModalScaffoldProps {
/**
 * title：UiModalScaffoldProps 内部字段。
 */

  title: string;  
  /**
 * subtitle：UiModalScaffoldProps 内部字段。
 */

  subtitle?: ReactNode;  
  /**
 * actions：UiModalScaffoldProps 内部字段。
 */

  actions?: ReactNode;
}
/**
 * UiModalScaffold：执行核心业务逻辑。
 * @param {
  title,
  subtitle,
  actions,
  children,
} PropsWithChildren<UiModalScaffoldProps> 参数说明。
 * @returns 函数返回值。
 */


export function UiModalScaffold({
  title,
  subtitle,
  actions,
  children,
}: PropsWithChildren<UiModalScaffoldProps>) {
  return (
    <div className="next-ui-modal-scaffold">
      <div className="next-ui-modal-scaffold-head">
        <div className="next-ui-modal-scaffold-heading">
          <div className="next-ui-section-title next-ui-modal-scaffold-title">{title}</div>
          {subtitle ? <div className="next-ui-section-subtext next-ui-modal-scaffold-subtitle">{subtitle}</div> : null}
        </div>
        {actions ? <div className="next-ui-modal-scaffold-actions">{actions}</div> : null}
      </div>
      <div className="next-ui-modal-scaffold-body">{children}</div>
    </div>
  );
}
