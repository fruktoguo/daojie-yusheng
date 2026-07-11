/**
 * 本文件负责 市场 面板的主要 React 视图入口，统一承接状态展示、用户操作回调和样式组合。
 *
 * 维护时要保持它只处理前端表现和组件契约，不保存业务真源，也不绕过共享规则或服务端权威运行时。
 */
import { memo, useCallback } from 'react';
import type { AuctionHouseTab } from '@mud/shared';
import { t } from '../../../ui/i18n';

// ─── Callbacks ───────────────────────────────────────────────────────────────

interface MarketPanelCallbacks {
  onOpenMarket: (() => void) | null;
  onOpenAuction: ((tab: AuctionHouseTab) => void) | null;
  onOpenTransmission: (() => void) | null;
  onOpenHeavenlyDaoShop: (() => void) | null;
  onOpenTechniqueGeneration: (() => void) | null;
}

const callbacks: MarketPanelCallbacks = {
  onOpenMarket: null,
  onOpenAuction: null,
  onOpenTransmission: null,
  onOpenHeavenlyDaoShop: null,
  onOpenTechniqueGeneration: null,
};

export function setMarketPanelCallbacks(cbs: Partial<MarketPanelCallbacks>): void {
  Object.assign(callbacks, cbs);
}

// ─── Main Component (Summary Pane) ──────────────────────────────────────────

export const MarketPanel = memo(function MarketPanel() {
  const handleOpenMarket = useCallback(() => {
    callbacks.onOpenMarket?.();
  }, []);

  const handleOpenAuction = useCallback((tab: AuctionHouseTab) => {
    callbacks.onOpenAuction?.(tab);
  }, []);

  const handleOpenTransmission = useCallback(() => {
    callbacks.onOpenTransmission?.();
  }, []);

  const handleOpenHeavenlyDaoShop = useCallback(() => {
    callbacks.onOpenHeavenlyDaoShop?.();
  }, []);

  const handleOpenTechniqueGeneration = useCallback(() => {
    callbacks.onOpenTechniqueGeneration?.();
  }, []);

  return (
    <div className="market-pane-wrapper">
      <div className="panel-section market-pane ui-surface-pane ui-surface-pane--stack">
        <div className="panel-section-title">{t('market.pane.title', undefined)}</div>
        <div className="market-pane-entry-actions">
          <button className="small-btn" type="button" onClick={handleOpenMarket}>
            坊市
          </button>
          <button className="small-btn" type="button" onClick={() => handleOpenAuction('participate')}>
            拍卖行
          </button>
          <button className="small-btn" type="button" onClick={handleOpenTransmission}>
            {t('market.tab.transmission', undefined)}
          </button>
          <button className="small-btn" type="button" onClick={handleOpenHeavenlyDaoShop}>
            天道商店
          </button>
          <button className="small-btn" type="button" onClick={handleOpenTechniqueGeneration}>
            悟道
          </button>
        </div>
      </div>
    </div>
  );
});
