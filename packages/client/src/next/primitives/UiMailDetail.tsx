import type { ReactNode } from 'react';
import { UiPanelFrame } from './UiPanelFrame';

export interface UiMailDetailProps {
  title: string;
  from: ReactNode;
  bodyLines: string[];
}

export function UiMailDetail({
  title,
  from,
  bodyLines,
}: UiMailDetailProps) {
  return (
    <UiPanelFrame title={title} subtitle={`来自 ${from}`}>
      <div className="next-ui-mail-detail-body next-ui-copy-block">
        {bodyLines.map((line, index) => (
          <p key={`${title}-${index}`}>{line}</p>
        ))}
      </div>
    </UiPanelFrame>
  );
}
