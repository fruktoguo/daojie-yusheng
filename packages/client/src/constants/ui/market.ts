/** MarketModalTab：坊市弹窗分页标签。 */
export type MarketModalTab = 'market' | 'my-orders' | 'trade-history';

export const MARKET_MODAL_TABS: Array<{
/**
 * id：ID标识。
 */
 id: MarketModalTab;
 /**
 * label：label名称或显示文本。
 */
 label: string }> = [
  { id: 'market', label: '市场' },
  { id: 'my-orders', label: '我的交易' },
  { id: 'trade-history', label: '交易记录' },
];

/** MARKET_PANE_HINT：坊市面板提示语。 */
export const MARKET_PANE_HINT = '坊市支持匿名挂售、求购与自动撮合，成交物会优先尝试进入背包，放不下时转入托管仓。';

