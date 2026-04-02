/**
 * 拾取面板
 * 以弹层形式展示地面物品和容器搜索结果，支持逐件或批量拿取
 */

import { LootWindowState } from '@mud/shared-next';
import { detailModalHost } from '../detail-modal-host';
import { formatDisplayCountBadge, formatDisplayInteger } from '../../utils/number';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export class LootPanel {
  private static readonly MODAL_OWNER = 'loot-panel';
  private windowState: LootWindowState | null = null;
  private onTake: ((sourceId: string, itemKey: string) => void) | null = null;
  private onTakeAll: ((sourceId: string) => void) | null = null;

  setCallbacks(
    onTake: (sourceId: string, itemKey: string) => void,
    onTakeAll: (sourceId: string) => void,
  ): void {
    this.onTake = onTake;
    this.onTakeAll = onTakeAll;
  }

  clear(): void {
    this.windowState = null;
    detailModalHost.close(LootPanel.MODAL_OWNER);
  }

  /** 更新拾取窗口状态，null 时关闭弹层 */
  update(windowState: LootWindowState | null): void {
    this.windowState = windowState;
    if (!windowState) {
      detailModalHost.close(LootPanel.MODAL_OWNER);
      return;
    }
    this.render();
  }

  private render(): void {
    if (!this.windowState) {
      return;
    }

    const { tileX, tileY, title, sources } = this.windowState;
    detailModalHost.open({
      ownerId: LootPanel.MODAL_OWNER,
      variantClass: 'detail-modal--loot',
      title,
      subtitle: `坐标 (${tileX}, ${tileY})`,
      bodyHtml: sources.map((source) => {
        const searchHtml = source.search && source.search.remainingTicks > 0
          ? `<div class="loot-search-state">
              <div class="loot-search-copy">
                <strong>搜索中</strong>
                <span>${formatDisplayInteger(source.search.elapsedTicks)} / ${formatDisplayInteger(source.search.totalTicks)} 息</span>
              </div>
              <div class="loot-search-bar"><span class="loot-search-fill" style="width:${Math.max(0, Math.min(100, (source.search.elapsedTicks / Math.max(1, source.search.totalTicks)) * 100))}%"></span></div>
            </div>`
          : '';
        const itemsHtml = source.items.length > 0
          ? `<div class="inventory-grid loot-item-grid">
              ${source.items.map((entry) => `
                <div class="inventory-cell">
                  <div class="inventory-cell-head">
                    <span class="inventory-cell-type">${source.kind === 'ground' ? '地面' : '容器'}</span>
                    <span class="inventory-cell-count">${formatDisplayCountBadge(entry.item.count)}</span>
                  </div>
                  <div class="inventory-cell-name" title="${escapeHtml(entry.item.name)}">${escapeHtml(entry.item.name)}</div>
                  <div class="inventory-cell-actions">
                    <button class="small-btn" data-loot-take="true" data-source-id="${escapeHtml(source.sourceId)}" data-item-key="${escapeHtml(entry.itemKey)}" type="button">拿取</button>
                  </div>
                </div>
              `).join('')}
            </div>`
          : `<div class="loot-source-empty">${escapeHtml(source.emptyText ?? '这里什么都没有。')}</div>`;
        return `
          <section class="loot-source-section">
            <div class="loot-source-head">
              <div>
                <div class="loot-source-title">${escapeHtml(source.title)}</div>
                <div class="loot-source-subtitle">${escapeHtml(source.kind === 'ground' ? '直接拾取' : `容器搜索${source.grade ? ` · ${source.grade}` : ''}`)}</div>
              </div>
              <div class="loot-source-actions">
                ${source.items.length > 0 ? `<button class="small-btn" data-loot-take-all="true" data-source-id="${escapeHtml(source.sourceId)}" type="button">全部拿取</button>` : ''}
                ${source.desc ? `<div class="loot-source-desc">${escapeHtml(source.desc)}</div>` : ''}
              </div>
            </div>
            ${searchHtml}
            ${itemsHtml}
          </section>
        `;
      }).join(''),
      onAfterRender: (body) => {
        body.querySelectorAll<HTMLElement>('[data-loot-take="true"]').forEach((button) => {
          button.addEventListener('click', (event) => {
            event.stopPropagation();
            const sourceId = button.dataset.sourceId;
            const itemKey = button.dataset.itemKey;
            if (!sourceId || !itemKey) {
              return;
            }
            this.onTake?.(sourceId, itemKey);
          });
        });
        body.querySelectorAll<HTMLElement>('[data-loot-take-all="true"]').forEach((button) => {
          button.addEventListener('click', (event) => {
            event.stopPropagation();
            const sourceId = button.dataset.sourceId;
            if (!sourceId) {
              return;
            }
            this.onTakeAll?.(sourceId);
          });
        });
      },
    });
  }
}
