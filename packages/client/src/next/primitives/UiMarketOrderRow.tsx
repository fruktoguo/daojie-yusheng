import type { ReactNode } from 'react';
/**
 * UiMarketOrderRowProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiMarketOrderRowProps {
/**
 * side：UiMarketOrderRowProps 内部字段。
 */

  side: 'buy' | 'sell';  
  /**
 * price：UiMarketOrderRowProps 内部字段。
 */

  price: ReactNode;  
  /**
 * quantity：UiMarketOrderRowProps 内部字段。
 */

  quantity: ReactNode;  
  /**
 * owner：UiMarketOrderRowProps 内部字段。
 */

  owner?: ReactNode;
}
/**
 * UiMarketOrderRow：执行核心业务逻辑。
 * @param {
  side,
  price,
  quantity,
  owner,
} UiMarketOrderRowProps 参数说明。
 * @returns 函数返回值。
 */


export function UiMarketOrderRow({
  side,
  price,
  quantity,
  owner,
}: UiMarketOrderRowProps) {
  return (
    <div className={`next-ui-surface-card next-ui-surface-card--compact next-ui-market-order-row next-ui-market-order-row--${side}`}>
      <div className="next-ui-market-order-row-head next-ui-entry-head">
        <span className="next-ui-market-order-row-side next-ui-entry-title">{side === 'buy' ? '买单' : '卖单'}</span>
        <span className="next-ui-market-order-row-price next-ui-entry-state">{price}</span>
      </div>
      <div className="next-ui-market-order-row-meta next-ui-entry-note">
        <span>数量 {quantity}</span>
        {owner ? <span>{owner}</span> : null}
      </div>
    </div>
  );
}
