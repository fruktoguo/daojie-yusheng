import type { ReactNode } from 'react';
import { UiPanelFrame } from './UiPanelFrame';
/**
 * UiMailDetailProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiMailDetailProps {
/**
 * title：UiMailDetailProps 内部字段。
 */

  title: string;  
  /**
 * from：UiMailDetailProps 内部字段。
 */

  from: ReactNode;  
  /**
 * bodyLines：UiMailDetailProps 内部字段。
 */

  bodyLines: string[];
}
/**
 * UiMailDetail：执行核心业务逻辑。
 * @param {
  title,
  from,
  bodyLines,
} UiMailDetailProps 参数说明。
 * @returns 函数返回值。
 */


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
