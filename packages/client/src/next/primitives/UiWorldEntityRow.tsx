import type { ReactNode } from 'react';

export interface UiWorldEntityRowProps {
  name: string;
  kind: ReactNode;
  note?: ReactNode;
}

export function UiWorldEntityRow({
  name,
  kind,
  note,
}: UiWorldEntityRowProps) {
  return (
    <div className="next-ui-surface-card next-ui-surface-card--compact next-ui-world-entity-row">
      <div className="next-ui-world-entity-row-head next-ui-entry-head">
        <span className="next-ui-world-entity-row-name next-ui-entry-title">{name}</span>
        <span className="next-ui-world-entity-row-kind next-ui-entry-state">{kind}</span>
      </div>
      {note ? <div className="next-ui-world-entity-row-note next-ui-entry-note">{note}</div> : null}
    </div>
  );
}
