import type { ReactNode } from 'react';
/**
 * UiMarketOrderRowProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiMarketOrderRowProps {
/**
 * side：side相关字段。
 */

  side: 'buy' | 'sell';  
  /**
 * price：价格数值。
 */

  price: ReactNode;  
  /**
 * quantity：quantity相关字段。
 */

  quantity: ReactNode;  
  /**
 * owner：owner相关字段。
 */

  owner?: ReactNode;
}
/**
 * UiMarketOrderRow：处理Ui坊市订单Row并更新相关状态。
 * @param {
  side,
  price,
  quantity,
  owner,
} UiMarketOrderRowProps 参数说明。
 * @returns 无返回值，直接更新Ui坊市订单Row相关状态。
 */


export function UiMarketOrderRow({
  side,
  price,
  quantity,
  owner,
}: UiMarketOrderRowProps) {
  return (
    <div className={`react-ui-surface-card react-ui-surface-card--compact react-ui-market-order-row react-ui-market-order-row--${side}`}>
      <div className="react-ui-market-order-row-head react-ui-entry-head">
        <span className="react-ui-market-order-row-side react-ui-entry-title">{side === 'buy' ? '买单' : '卖单'}</span>
        <span className="react-ui-market-order-row-price react-ui-entry-state">{price}</span>
      </div>
      <div className="react-ui-market-order-row-meta react-ui-entry-note">
        <span>数量 {quantity}</span>
        {owner ? <span>{owner}</span> : null}
      </div>
    </div>
  );
}
