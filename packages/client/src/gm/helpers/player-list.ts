/**
 * 本文件属于客户端 GM 工具链，负责地图编辑、世界查看或管理端辅助展示。
 *
 * 维护时要把 GM 能力限定在受控入口，并避免普通玩家客户端路径依赖管理端状态。
 */
import type { GmManagedPlayerSummary, GmStateRes } from '@mud/shared';
import { t } from '../../ui/i18n';
/**
 * PlayerListElements：统一结构类型，保证协议与运行时一致性。
 */


type PlayerListElements = {
/**
 * playerListEl：玩家列表El相关字段。
 */

  playerListEl: HTMLDivElement;  
  /**
 * playerPageMetaEl：玩家PageMetaEl相关字段。
 */

  playerPageMetaEl: HTMLDivElement;  
  /**
 * playerPrevPageBtn：玩家PrevPageBtn相关字段。
 */

  playerPrevPageBtn: HTMLButtonElement;  
  /**
 * playerNextPageBtn：玩家NextPageBtn相关字段。
 */

  playerNextPageBtn: HTMLButtonElement;
};
/**
 * RenderPlayerListOptions：统一结构类型，保证协议与运行时一致性。
 */


type RenderPlayerListOptions = {
/**
 * data：data相关字段。
 */

  data: GmStateRes;  
  /**
 * filtered：filtered相关字段。
 */

  filtered: GmManagedPlayerSummary[];  
  /**
 * selectedPlayerId：selected玩家ID标识。
 */

  selectedPlayerId: string | null;  
  /**
 * lastStructureKey：lastStructureKey标识。
 */

  lastStructureKey: string | null;  
  /**
 * getPlayerRowMarkup：玩家RowMarkup相关字段。
 */

  getPlayerRowMarkup: (player: GmManagedPlayerSummary) => string;  
  /**
 * patchPlayerRow：patch玩家Row相关字段。
 */

  patchPlayerRow: (button: HTMLButtonElement, player: GmManagedPlayerSummary, isActive: boolean) => void;
};

/** createElementFromHtml：从 HTML 片段创建元素。 */
function createElementFromHtml<T extends Element>(html: string): T {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild as T;
}

/** renderPlayerPageMeta：渲染玩家分页元数据。 */
function renderPlayerPageMeta(elements: PlayerListElements, data: GmStateRes): void {
  elements.playerPageMetaEl.textContent = t(
    'gm.player-list.page-meta',
    {
      page: data.playerPage.page,
      totalPages: data.playerPage.totalPages,
      total: data.playerPage.total,
    },
  );
  elements.playerPrevPageBtn.disabled = data.playerPage.page <= 1;
  elements.playerNextPageBtn.disabled = data.playerPage.page >= data.playerPage.totalPages;
}

/** renderGmPlayerListSection：渲染 GM 玩家列表区块。 */
export function renderGmPlayerListSection(
  elements: PlayerListElements,
  options: RenderPlayerListOptions,
): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const {
    data,
    filtered,
    selectedPlayerId,
    lastStructureKey,
    getPlayerRowMarkup,
    patchPlayerRow,
  } = options;

  if (filtered.length === 0) {
    if (lastStructureKey !== 'empty') {
      elements.playerListEl.replaceChildren(
        createElementFromHtml<HTMLDivElement>(`<div class="empty-hint">${t('gm.player-list.empty', undefined)}</div>`),
      );
    }
    renderPlayerPageMeta(elements, data);
    return 'empty';
  }

  const structureKey = filtered.map((player) => player.id).join('|');
  if (lastStructureKey !== structureKey) {
    const existingRows = new Map<string, HTMLButtonElement>();
    elements.playerListEl.querySelectorAll<HTMLButtonElement>('[data-player-id]').forEach((button) => {
      const playerId = button.dataset.playerId;
      if (playerId) {
        existingRows.set(playerId, button);
      }
    });
    const fragment = document.createDocumentFragment();
    for (const player of filtered) {
      const row = existingRows.get(player.id) ?? createElementFromHtml<HTMLButtonElement>(getPlayerRowMarkup(player));
      fragment.append(row);
    }
    elements.playerListEl.replaceChildren(fragment);
  }

  filtered.forEach((player, index) => {
    const row = elements.playerListEl.children[index];
    if (row instanceof HTMLButtonElement) {
      patchPlayerRow(row, player, player.id === selectedPlayerId);
    }
  });
  renderPlayerPageMeta(elements, data);
  return structureKey;
}
