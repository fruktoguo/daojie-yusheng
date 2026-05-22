/**
 * 本文件提供 React UI 的 UiMarketOrderRow 基础组件，用于复用面板内的视觉和交互片段。
 *
 * 维护时应保持组件无业务真源，只通过 props 呈现状态，并兼顾浅色、深色与移动端可用性。
 */
import type { ReactNode } from 'react';
import { t } from '../../ui/i18n';
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
        <span className="react-ui-market-order-row-side react-ui-entry-title">{t(side === 'buy' ? 'react.market.order.buy' : 'react.market.order.sell')}</span>
        <span className="react-ui-market-order-row-price react-ui-entry-state">{price}</span>
      </div>
      <div className="react-ui-market-order-row-meta react-ui-entry-note">
        <span>{t('react.market.order.quantity', { quantity: String(quantity) })}</span>
        {owner ? <span>{owner}</span> : null}
      </div>
    </div>
  );
}
