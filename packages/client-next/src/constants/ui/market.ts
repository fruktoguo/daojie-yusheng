/** MarketModalTab：定义该类型的结构与数据语义。 */
export type MarketModalTab = 'market' | 'my-orders' | 'trade-history';

export const MARKET_MODAL_TABS: Array<{ id: MarketModalTab; label: string }> = [
  { id: 'market', label: '市场' },
  { id: 'my-orders', label: '我的交易' },
  { id: 'trade-history', label: '交易记录' },
];

export const MARKET_PANE_HINT = '坊市支持匿名挂售、求购与自动撮合，成交物会优先尝试进入背包，放不下时转入托管仓。';

