/**
 * 本文件定义客户端常量或展示配置，是 UI、地图、输入和本地渲染共同依赖的稳定来源。
 *
 * 维护时要保持常量含义清晰，并同步检查消费方，避免把服务端权威规则复制成客户端私有真源。
 */
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
