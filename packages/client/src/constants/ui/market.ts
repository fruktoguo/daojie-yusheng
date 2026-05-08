/** MarketModalTab：坊市弹窗分页标签。 */
import { t } from '../../ui/i18n';

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
  { id: 'market', label: t('market.tab.market', undefined) },
  { id: 'my-orders', label: t('market.tab.my-orders', undefined) },
  { id: 'trade-history', label: t('market.tab.trade-history', undefined) },
];

/** MARKET_PANE_HINT：坊市面板提示语。 */
export const MARKET_PANE_HINT = t(
  'market.pane.hint',
  undefined,
);
