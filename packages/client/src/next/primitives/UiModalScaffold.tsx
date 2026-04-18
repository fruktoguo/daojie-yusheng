import type { PropsWithChildren, ReactNode } from 'react';

export interface UiModalScaffoldProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

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
