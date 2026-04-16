import type { GmManagedPlayerSummary, GmStateRes } from '@mud/shared-next';

type PlayerListElements = {
  playerListEl: HTMLDivElement;
  playerPageMetaEl: HTMLDivElement;
  playerPrevPageBtn: HTMLButtonElement;
  playerNextPageBtn: HTMLButtonElement;
};

type RenderPlayerListOptions = {
  data: GmStateRes;
  filtered: GmManagedPlayerSummary[];
  selectedPlayerId: string | null;
  lastStructureKey: string | null;
  getPlayerRowMarkup: (player: GmManagedPlayerSummary) => string;
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
  elements.playerPageMetaEl.textContent = `第 ${data.playerPage.page} / ${data.playerPage.totalPages} 页 · 共 ${data.playerPage.total} 条`;
  elements.playerPrevPageBtn.disabled = data.playerPage.page <= 1;
  elements.playerNextPageBtn.disabled = data.playerPage.page >= data.playerPage.totalPages;
}

/** renderGmPlayerListSection：渲染 GM 玩家列表区块。 */
export function renderGmPlayerListSection(
  elements: PlayerListElements,
  options: RenderPlayerListOptions,
): string {
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
        createElementFromHtml<HTMLDivElement>('<div class="empty-hint">没有符合筛选条件的角色。</div>'),
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
