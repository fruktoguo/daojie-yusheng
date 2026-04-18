import type { ReactNode } from 'react';
import { UiPanelFrame } from './UiPanelFrame';
import { UiPill } from './UiPill';

export interface UiQuestDetailProps {
  title: string;
  note?: ReactNode;
  badges?: ReactNode[];
  actions?: ReactNode;
}

export function UiQuestDetail({
  title,
  note,
  badges = [],
  actions,
}: UiQuestDetailProps) {
  return (
    <UiPanelFrame title={title} subtitle={note}>
      {badges.length > 0 ? (
        <div className="next-ui-quest-detail-badges next-ui-badge-row">
          {badges.map((badge, index) => (
            <UiPill key={index}>{badge}</UiPill>
          ))}
        </div>
      ) : null}
      {actions}
    </UiPanelFrame>
  );
}
