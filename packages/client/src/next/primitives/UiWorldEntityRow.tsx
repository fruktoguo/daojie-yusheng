import type { ReactNode } from 'react';
/**
 * UiWorldEntityRowProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiWorldEntityRowProps {
/**
 * name：UiWorldEntityRowProps 内部字段。
 */

  name: string;  
  /**
 * kind：UiWorldEntityRowProps 内部字段。
 */

  kind: ReactNode;  
  /**
 * note：UiWorldEntityRowProps 内部字段。
 */

  note?: ReactNode;
}
/**
 * UiWorldEntityRow：执行核心业务逻辑。
 * @param {
  name,
  kind,
  note,
} UiWorldEntityRowProps 参数说明。
 * @returns 函数返回值。
 */


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
