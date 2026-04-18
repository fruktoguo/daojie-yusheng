import type { ReactNode } from 'react';
import { UiPanelFrame } from './UiPanelFrame';
import { UiPill } from './UiPill';

export interface UiTechniqueDetailProps {
  title: string;
  subtitle?: ReactNode;
  badges?: ReactNode[];
  footer?: ReactNode;
}

export function UiTechniqueDetail({
  title,
  subtitle,
  badges = [],
  footer,
}: UiTechniqueDetailProps) {
  return (
    <UiPanelFrame title={title} subtitle={subtitle}>
      {badges.length > 0 ? (
        <div className="next-ui-technique-detail-badges next-ui-badge-row">
          {badges.map((badge, index) => (
            <UiPill key={index}>{badge}</UiPill>
          ))}
        </div>
      ) : null}
      {footer}
    </UiPanelFrame>
  );
}
