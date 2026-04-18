import type { ReactNode } from 'react';

export interface UiMarketOrderRowProps {
  side: 'buy' | 'sell';
  price: ReactNode;
  quantity: ReactNode;
  owner?: ReactNode;
}

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
