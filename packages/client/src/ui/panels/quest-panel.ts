/** 任务面板：按任务线分类展示，并支持全局单实例详情弹层 */

import { Inventory, PlayerState, QuestState } from '@mud/shared';
import { getLocalItemTemplate } from '../../content/local-templates';
import { detailModalHost } from '../detail-modal-host';
import {
  bindInlineItemTooltips,
  renderInlineItemChip,
  renderInlineMonsterChip,
  renderTextWithInlineItemHighlights,
} from '../item-inline-tooltip';
import { preserveSelection } from '../selection-preserver';
import { createEmptyHint, createPanelSectionWithTitle } from '../ui-primitives';
import { getQuestLineLabel, getQuestStatusLabel } from '../../domain-labels';
import {
  LINE_ORDER,
  STATUS_CLASS,
  STATUS_PRIORITY,
} from '../../constants/ui/quest-panel';
import { t } from '../i18n';
import {
  mountReactQuestPanel,
  setReactQuestPanelCallbacks,
  shouldUseReactQuestPanel,
  syncReactQuestPanelState,
  unmountReactQuestPanel,
} from '../../react-ui/panels/quest/mount-quest-panel';

const UNKNOWN_QUEST_ITEM_NAME = '未知物品';

function resolveQuestRequiredItemName(itemId: string): string {
  return getLocalItemTemplate(itemId)?.name?.trim() || UNKNOWN_QUEST_ITEM_NAME;
}

/** escapeHtml：转义 HTML 文本中的危险字符。 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** replaceRichContent：以片段替换富文本节点内容。 */
function replaceRichContent(node: HTMLElement, html: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  node.innerHTML = html.trim() ? html : '';
}

/** isSameQuestIdSequence：判断是否Same任务ID Sequence。 */
function isSameQuestIdSequence(previous: string[] | null, next: string[]): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!previous || previous.length !== next.length) {
    return false;
  }
  for (let index = 0; index < previous.length; index += 1) {
    if (previous[index] !== next[index]) {
      return false;
    }
  }
  return true;
}

/** 任务面板：按任务线分类展示，并支持全局单实例详情弹层 */
export class QuestPanel {
  /** MODAL_OWNER：弹窗OWNER。 */
  private static readonly MODAL_OWNER = 'quest-panel';
  /** pane：pane。 */
  private pane = document.getElementById('pane-quest')!;
  /** activeLine：活跃Line。 */
  private activeLine: QuestState['line'] = 'main';  
  /**
 * selectedQuestId：selected任务ID标识。
 */

  private selectedQuestId?: string;
  /** hasUserSelectedLine：has用户Selected Line标记。 */
  private hasUserSelectedLine = false;
  /** lastQuests：last Quests。 */
  private lastQuests: QuestState[] = [];
  /** lastVisibleQuestIds：last可见任务ID 列表。 */
  private lastVisibleQuestIds: string[] | null = null;
  /** lastStructureLine：last Structure Line。 */
  private lastStructureLine: QuestState['line'] | null = null;  
  /**
 * currentMapId：current地图ID标识。
 */

  private currentMapId?: string;
  /** inventory：背包。 */
  private inventory: Inventory | null = null;
  /** onNavigateQuest：on Navigate任务。 */
  private onNavigateQuest: ((questId: string) => void) | null = null;  
  /**
 * shellRefs：shellRef相关字段。
 */

  private shellRefs: {  
  /**
 * section：section相关字段。
 */

    section: HTMLDivElement;    
    /**
 * title：title名称或显示文本。
 */

    title: HTMLDivElement;    
    /**
 * subtabs：subtab相关字段。
 */

    subtabs: HTMLDivElement;
  } | null = null;  
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @returns 无返回值，完成实例初始化。
 */


  constructor() {
    this.bindPaneEvents();
    bindInlineItemTooltips(this.pane);
  }  
  /**
 * setCallbacks：写入Callback。
 * @param onNavigateQuest (questId: string) => void 参数说明。
 * @returns 无返回值，直接更新Callback相关状态。
 */


  setCallbacks(onNavigateQuest: (questId: string) => void): void {
    this.onNavigateQuest = onNavigateQuest;
    setReactQuestPanelCallbacks({
      onNavigateQuest,
      onOpenDetail: (questId) => {
        this.selectedQuestId = questId;
        this.openQuestModal();
      },
    });
  }

  /** setCurrentMapId：处理set当前地图ID。 */
  setCurrentMapId(mapId?: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.currentMapId = mapId;
    if (this.useReactPanel()) {
      this.patchModal();
      return;
    }
    this.patchModal();
  }

  /** syncInventory：同步背包。 */
  syncInventory(inventory: Inventory): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.inventory = inventory;
    if (this.useReactPanel()) {
      this.syncReactState();
      this.patchModal();
      return;
    }
    if (this.lastQuests.length === 0) {
      return;
    }
    if (!this.patchList()) {
      this.renderList();
    }
    this.patchModal();
  }

  /** 更新任务列表并刷新列表与弹层 */
  update(quests: QuestState[]): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.lastQuests = quests;
    this.normalizeState(quests);
    if (this.useReactPanel()) {
      this.syncReactState();
      this.mountReactPanel();
      this.patchModal();
      return;
    }
    if (!this.patchList()) {
      this.renderList();
    }
    this.patchModal();
  }

  /** initFromPlayer：初始化From玩家。 */
  initFromPlayer(player: PlayerState): void {
    this.currentMapId = player.mapId;
    this.inventory = player.inventory;
    this.update(player.quests ?? []);
  }

  /** clear：清理clear。 */
  clear(): void {
    this.lastQuests = [];
    this.lastVisibleQuestIds = null;
    this.lastStructureLine = null;
    this.selectedQuestId = undefined;
    this.hasUserSelectedLine = false;
    this.inventory = null;
    this.shellRefs = null;
    if (this.useReactPanel()) {
      syncReactQuestPanelState({ quests: [], inventory: null });
      this.mountReactPanel();
      detailModalHost.close(QuestPanel.MODAL_OWNER);
      return;
    }
    const emptyNode = this.createEmptyState();
    emptyNode.textContent = t('quest.empty.all', undefined);
    this.pane.replaceChildren(emptyNode);
    detailModalHost.close(QuestPanel.MODAL_OWNER);
  }

  /** closeDetail：关闭详情。 */
  closeDetail(): void {
    this.selectedQuestId = undefined;
    detailModalHost.close(QuestPanel.MODAL_OWNER);
  }

  private useReactPanel(): boolean {
    return shouldUseReactQuestPanel();
  }

  private syncReactState(): void {
    syncReactQuestPanelState({
      quests: this.lastQuests,
      inventory: this.inventory,
    });
  }

  private mountReactPanel(): void {
    if (!mountReactQuestPanel()) {
      unmountReactQuestPanel();
    }
  }

  /** renderList：渲染列表。 */
  private renderList(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const quests = this.lastQuests;
    if (quests.length === 0) {
      this.selectedQuestId = undefined;
      this.lastVisibleQuestIds = [];
      this.lastStructureLine = this.activeLine;
      this.shellRefs = null;
      const emptyNode = this.createEmptyState();
      emptyNode.textContent = t('quest.empty.all', undefined);
      this.pane.replaceChildren(emptyNode);
      return;
    }
    this.ensureShell();
    this.patchList();
  }

  /** ensureShell：确保Shell。 */
  private ensureShell(): {  
  /**
 * section：section相关字段。
 */
 section: HTMLDivElement;  
 /**
 * title：title名称或显示文本。
 */
 title: HTMLDivElement;  
 /**
 * subtabs：subtab相关字段。
 */
 subtabs: HTMLDivElement } {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.shellRefs?.section.isConnected) {
      return this.shellRefs;
    }

    const { sectionEl, titleEl } = createPanelSectionWithTitle(t('quest.panel.title', undefined));
    sectionEl.classList.add('ui-panel-section');
    titleEl.classList.add('ui-panel-section-title');

    const subtabs = document.createElement('div');
    subtabs.className = 'quest-subtabs ui-subtabs';
    for (const line of LINE_ORDER) {
      const button = document.createElement('button');
      button.className = 'quest-subtab-btn ui-subtab-btn';
      button.dataset.questLine = line;
      button.type = 'button';
      button.append(document.createTextNode(getQuestLineLabel(line)));
      const count = document.createElement('span');
      count.className = 'quest-subtab-count';
      count.dataset.questLineCount = line;
      button.append(count);
      subtabs.append(button);
    }

    sectionEl.append(subtabs);
    preserveSelection(this.pane, () => {
      this.pane.replaceChildren(sectionEl);
    });
    this.shellRefs = { section: sectionEl, title: titleEl, subtabs };
    return this.shellRefs;
  }

  /** bindPaneEvents：绑定Pane事件。 */
  private bindPaneEvents(): void {
    this.pane.addEventListener('click', (event) => {
      // React 面板模式下由 React 组件自行处理交互，原生事件委托不再介入
      if (this.useReactPanel()) {
        return;
      }
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const lineButton = target.closest<HTMLElement>('[data-quest-line]');
      if (lineButton) {
        const line = lineButton.dataset.questLine as QuestState['line'] | undefined;
        if (!line || line === this.activeLine) return;
        this.hasUserSelectedLine = true;
        this.activeLine = line;
        this.selectedQuestId = undefined;
        this.renderList();
        this.patchModal();
        return;
      }

      const questButton = target.closest<HTMLElement>('[data-quest-id]');
      if (!questButton) {
        return;
      }
      const questId = questButton.dataset.questId;
      if (!questId) return;
      this.selectedQuestId = questId;
      this.openQuestModal();
    });
  }

  /** patchList：处理patch列表。 */
  private patchList(): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const quests = this.lastQuests;
    if (quests.length === 0) {
      return false;
    }

    const section = this.pane.querySelector<HTMLElement>('.panel-section');
    const subtabs = section?.querySelector<HTMLElement>('.quest-subtabs');
    if (!section || !subtabs) {
      return false;
    }

    const counts = this.buildCounts(quests);
    for (const line of LINE_ORDER) {
      const button = this.pane.querySelector<HTMLElement>(`[data-quest-line="${line}"]`);
      const countNode = this.pane.querySelector<HTMLElement>(`[data-quest-line-count="${line}"]`);
      if (!button || !countNode) {
        return false;
      }
      button.classList.toggle('active', this.activeLine === line);
      countNode.textContent = `${counts[line]}`;
    }

    const visibleQuests = this.getVisibleQuests(quests);
    const visibleQuestIds = visibleQuests.map((quest) => quest.id);
    const titleNode = section.querySelector<HTMLElement>('.panel-section-title');
    if (!titleNode) {
      return false;
    }
    if (visibleQuests.length === 0) {
      const emptyNode = this.pane.querySelector<HTMLElement>('[data-quest-empty="true"]') ?? this.createEmptyState();
      emptyNode.textContent = t('quest.empty.line', {
        line: getQuestLineLabel(this.activeLine),
      });
      section.replaceChildren(titleNode, subtabs, emptyNode);
      this.lastVisibleQuestIds = [];
      this.lastStructureLine = this.activeLine;
      return true;
    }

    // Fast path: structure unchanged — only patch card contents in place
    if (
      this.lastStructureLine === this.activeLine
      && isSameQuestIdSequence(this.lastVisibleQuestIds, visibleQuestIds)
    ) {
      for (const quest of visibleQuests) {
        const card = this.pane.querySelector<HTMLElement>(`[data-quest-id="${CSS.escape(quest.id)}"]`);
        if (card) {
          this.patchQuestCard(card, quest);
        }
      }
      this.lastVisibleQuestIds = visibleQuestIds;
      this.lastStructureLine = this.activeLine;
      return true;
    }

    const existingCards = new Map<string, HTMLElement>();
    this.pane.querySelectorAll<HTMLElement>('[data-quest-id]').forEach((card) => {
      const questId = card.dataset.questId;
      if (questId) {
        existingCards.set(questId, card);
      }
    });
    const orderedCards = visibleQuests.map((quest) => {
      const card = existingCards.get(quest.id) ?? this.createQuestCard(quest);
      this.patchQuestCard(card, quest);
      existingCards.delete(quest.id);
      return card;
    });
    existingCards.forEach((card) => card.remove());

    // 增量同步 section 子节点，保留滚动位置
    // 确保 titleNode 和 subtabs 在前
    if (section.firstChild !== titleNode) {
      section.insertBefore(titleNode, section.firstChild);
    }
    if (titleNode.nextSibling !== subtabs) {
      section.insertBefore(subtabs, titleNode.nextSibling);
    }
    // 同步 cards 部分（subtabs 之后）
    const allowedCards = new Set<HTMLElement>(orderedCards);
    let cursor = subtabs.nextSibling;
    while (cursor) {
      const next = cursor.nextSibling;
      if (cursor instanceof HTMLElement && !allowedCards.has(cursor)) {
        cursor.remove();
      }
      cursor = next;
    }
    let ref: ChildNode | null = subtabs.nextSibling;
    for (const card of orderedCards) {
      if (ref !== card) {
        section.insertBefore(card, ref);
      } else {
        ref = ref.nextSibling;
      }
    }

    this.lastVisibleQuestIds = visibleQuestIds;
    this.lastStructureLine = this.activeLine;
    return true;
  }

  /** createEmptyState：创建Empty状态。 */
  private createEmptyState(): HTMLElement {
    const empty = createEmptyHint('');
    empty.dataset.questEmpty = 'true';
    return empty;
  }

  /** createQuestCard：创建任务卡片。 */
  private createQuestCard(quest: QuestState): HTMLButtonElement {
    const card = document.createElement('button');
    card.className = 'quest-card quest-card-toggle';
    card.dataset.questId = quest.id;
    card.type = 'button';

    const titleRow = document.createElement('div');
    titleRow.className = 'quest-title-row';
    const titleEl = document.createElement('span');
    titleEl.className = 'quest-title';
    titleEl.setAttribute('data-quest-title', 'true');
    const statusEl = document.createElement('span');
    statusEl.setAttribute('data-quest-status', 'true');
    titleRow.appendChild(titleEl);
    titleRow.appendChild(statusEl);
    card.appendChild(titleRow);

    const chapterEl = document.createElement('div');
    chapterEl.setAttribute('data-quest-chapter', 'true');
    card.appendChild(chapterEl);

    const descEl = document.createElement('div');
    descEl.className = 'quest-desc';
    descEl.setAttribute('data-quest-desc', 'true');
    card.appendChild(descEl);

    const progressLabelEl = document.createElement('div');
    progressLabelEl.className = 'quest-progress-label';
    progressLabelEl.setAttribute('data-quest-progress-label', 'true');
    card.appendChild(progressLabelEl);

    const progressBarOuter = document.createElement('div');
    progressBarOuter.className = 'quest-progress-bar';
    const progressFill = document.createElement('div');
    progressFill.className = 'quest-progress-fill';
    progressFill.setAttribute('data-quest-progress-fill', 'true');
    progressBarOuter.appendChild(progressFill);
    card.appendChild(progressBarOuter);

    const nextStepEl = document.createElement('div');
    nextStepEl.className = 'quest-meta';
    nextStepEl.setAttribute('data-quest-next-step', 'true');
    card.appendChild(nextStepEl);

    const expandHint = document.createElement('div');
    expandHint.className = 'quest-expand-hint';
    expandHint.textContent = t('quest.card.expand-hint', undefined);
    card.appendChild(expandHint);

    this.patchQuestCard(card, quest);
    return card;
  }

  /** patchQuestCard：处理patch任务卡片。 */
  private patchQuestCard(card: HTMLElement, quest: QuestState): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const titleNode = card.querySelector<HTMLElement>('[data-quest-title="true"]');
    const statusNode = card.querySelector<HTMLElement>('[data-quest-status="true"]');
    const chapterNode = card.querySelector<HTMLElement>('[data-quest-chapter="true"]');
    const descNode = card.querySelector<HTMLElement>('[data-quest-desc="true"]');
    const progressLabelNode = card.querySelector<HTMLElement>('[data-quest-progress-label="true"]');
    const progressFillNode = card.querySelector<HTMLElement>('[data-quest-progress-fill="true"]');
    const nextStepNode = card.querySelector<HTMLElement>('[data-quest-next-step="true"]');
    if (!titleNode || !statusNode || !chapterNode || !descNode || !progressLabelNode || !progressFillNode || !nextStepNode) {
      return false;
    }

    const percent = quest.required > 0 ? Math.min(100, Math.floor((quest.progress / quest.required) * 100)) : 0;
    card.dataset.questId = quest.id;
    titleNode.textContent = quest.title;
    statusNode.textContent = getQuestStatusLabel(quest.status);
    statusNode.className = `quest-status ${STATUS_CLASS[quest.status]}`;
    chapterNode.className = `quest-meta ${quest.chapter ? '' : 'hidden'}`.trim();
    chapterNode.textContent = t('quest.card.chapter', { chapter: quest.chapter ?? '' });
    replaceRichContent(descNode, this.renderQuestText(quest.desc, quest));
    replaceRichContent(progressLabelNode, t('quest.card.objective', {
      content: this.renderQuestText(this.resolveProgressText(quest), quest),
    }));
    progressFillNode.style.width = `${percent}%`;
    replaceRichContent(nextStepNode, t('quest.card.next-step', {
      content: this.renderQuestText(this.resolveNextStep(quest), quest),
    }));
    return true;
  }

  /** openQuestModal：打开任务详情弹窗。 */
  private openQuestModal(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.selectedQuestId) {
      detailModalHost.close(QuestPanel.MODAL_OWNER);
      return;
    }

    const quest = this.lastQuests.find((entry) => entry.id === this.selectedQuestId);
    if (!quest) {
      this.selectedQuestId = undefined;
      detailModalHost.close(QuestPanel.MODAL_OWNER);
      return;
    }

    const canNavigateQuest = this.canNavigateQuest(quest);
    const giverLocation = quest.giverMapName && quest.giverX !== undefined && quest.giverY !== undefined
      ? `${quest.giverMapName} (${quest.giverX}, ${quest.giverY})`
      : quest.giverMapName ?? t('quest.location.unknown', undefined);
    const targetLocation = this.formatQuestLocation(
      quest.targetMapName ?? (quest.objectiveType === 'kill' ? quest.giverMapName : undefined),
      quest.targetX,
      quest.targetY,
    );
    const submitLocation = this.formatQuestLocation(quest.submitMapName ?? quest.giverMapName, quest.submitX ?? quest.giverX, quest.submitY ?? quest.giverY);
    const navigateLabel = this.resolveNavigateLabel(quest);

    detailModalHost.open({
      ownerId: QuestPanel.MODAL_OWNER,
      size: 'md',
      variantClass: 'detail-modal--quest',
      title: quest.title,
      subtitle: `${getQuestLineLabel(quest.line)} · ${getQuestStatusLabel(quest.status)}`,
      renderBody: (body) => {
        this.renderQuestModalBody(body, quest, canNavigateQuest, giverLocation, targetLocation, submitLocation, navigateLabel);
      },
      onClose: () => {
        this.selectedQuestId = undefined;
      },
      onAfterRender: (body, signal) => {
        bindInlineItemTooltips(body, signal);
        body.querySelector<HTMLElement>('[data-quest-navigate]')?.addEventListener('click', (event) => {
          event.stopPropagation();
          const button = event.currentTarget;
          if (!(button instanceof HTMLElement) || button.dataset.questCanNavigate !== '1') return;
          const questId = button.dataset.questId;
          if (!questId) return;
          this.onNavigateQuest?.(questId);
        }, { signal });
      },
    });
  }

  /** renderQuestModalBody：渲染任务详情主体。 */
  private renderQuestModalBody(
    body: HTMLElement,
    quest: QuestState,
    canNavigateQuest: boolean,
    giverLocation: string,
    targetLocation: string,
    submitLocation: string,
    navigateLabel: string,
  ): void {
    body.innerHTML = `
        <div class="ui-detail-field ui-detail-field--section ${quest.chapter ? '' : 'hidden'}" data-quest-modal-chapter-section="true"><strong>${escapeHtml(t('quest.detail.chapter', undefined))}</strong><span data-quest-modal-chapter="true">${escapeHtml(quest.chapter ?? '')}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>${escapeHtml(t('quest.detail.desc', undefined))}</strong><div data-quest-modal-desc="true">${this.renderQuestText(quest.desc, quest)}</div></div>
        <div class="ui-detail-field ui-detail-field--section ${quest.story ? '' : 'hidden'}" data-quest-modal-story-section="true"><strong>${escapeHtml(t('quest.detail.story', undefined))}</strong><span data-quest-modal-story="true">${escapeHtml(quest.story ?? '')}</span></div>
        <div class="ui-detail-grid ui-detail-grid--section">
          <div class="ui-detail-field ui-detail-field--section"><strong>${escapeHtml(t('quest.detail.giver', undefined))}</strong><span data-quest-modal-giver="true">${escapeHtml(quest.giverName)}</span></div>
          <div class="ui-detail-field ui-detail-field--section">
            <strong>${escapeHtml(t('quest.detail.accept-location', undefined))}</strong>
            <div class="quest-detail-location-row">
              <span data-quest-modal-location="true">${escapeHtml(giverLocation)}</span>
              <button
                class="small-btn ghost quest-detail-nav-btn"
                data-quest-navigate="true"
                data-quest-id="${escapeHtml(quest.id)}"
                data-quest-can-navigate="${canNavigateQuest ? '1' : '0'}"
                type="button"
                ${canNavigateQuest ? '' : 'disabled'}
              >${navigateLabel}</button>
            </div>
          </div>
          <div class="ui-detail-field ui-detail-field--section"><strong>${escapeHtml(t('quest.detail.target', undefined))}</strong><span data-quest-modal-target-location="true">${escapeHtml(targetLocation)}</span></div>
          <div class="ui-detail-field ui-detail-field--section"><strong>${escapeHtml(t('quest.detail.submit-location', undefined))}</strong><span data-quest-modal-submit-location="true">${escapeHtml(submitLocation)}</span></div>
          <div class="ui-detail-field ui-detail-field--section"><strong>${escapeHtml(t('quest.detail.reward', undefined))}</strong><div data-quest-modal-reward="true">${this.renderRewardContent(quest)}</div></div>
          <div class="ui-detail-field ui-detail-field--section ${quest.requiredItemId ? '' : 'hidden'}" data-quest-modal-required-item-section="true"><strong>${escapeHtml(t('quest.detail.requirement', undefined))}</strong><div data-quest-modal-required-item="true">${this.renderRequiredItemContent(quest)}</div></div>
          <div class="ui-detail-field ui-detail-field--section"><strong>${escapeHtml(t('quest.detail.progress', undefined))}</strong><div data-quest-modal-progress="true">${this.renderQuestText(this.resolveProgressText(quest), quest)}</div></div>
          <div class="ui-detail-field ui-detail-field--section"><strong>${escapeHtml(t('quest.detail.next-step', undefined))}</strong><div data-quest-modal-next-step="true">${this.renderQuestText(this.resolveNextStep(quest), quest)}</div></div>
        </div>
        <div class="ui-detail-field ui-detail-field--section ${quest.objectiveText ? '' : 'hidden'}" data-quest-modal-objective-section="true"><strong>${escapeHtml(t('quest.detail.objective-note', undefined))}</strong><div data-quest-modal-objective="true">${this.renderQuestText(quest.objectiveText ?? '', quest)}</div></div>
        <div class="ui-detail-field ui-detail-field--section ${quest.relayMessage ? '' : 'hidden'}" data-quest-modal-relay-section="true"><strong>${escapeHtml(t('quest.detail.relay', undefined))}</strong><div data-quest-modal-relay="true">${this.renderQuestText(quest.relayMessage ?? '', quest)}</div></div>
      `;
  }

  /** patchModal：处理patch弹窗。 */
  private patchModal(): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.selectedQuestId) {
      detailModalHost.close(QuestPanel.MODAL_OWNER);
      return true;
    }
    if (!detailModalHost.isOpenFor(QuestPanel.MODAL_OWNER)) {
      return false;
    }

    const quest = this.lastQuests.find((entry) => entry.id === this.selectedQuestId);
    if (!quest) {
      this.selectedQuestId = undefined;
      detailModalHost.close(QuestPanel.MODAL_OWNER);
      return true;
    }

    const titleNode = document.getElementById('detail-modal-title');
    const subtitleNode = document.getElementById('detail-modal-subtitle');
    const chapterSection = document.querySelector<HTMLElement>('[data-quest-modal-chapter-section="true"]');
    const chapterNode = document.querySelector<HTMLElement>('[data-quest-modal-chapter="true"]');
    const descNode = document.querySelector<HTMLElement>('[data-quest-modal-desc="true"]');
    const storySection = document.querySelector<HTMLElement>('[data-quest-modal-story-section="true"]');
    const storyNode = document.querySelector<HTMLElement>('[data-quest-modal-story="true"]');
    const giverNode = document.querySelector<HTMLElement>('[data-quest-modal-giver="true"]');
    const locationNode = document.querySelector<HTMLElement>('[data-quest-modal-location="true"]');
    const navigateButton = document.querySelector<HTMLButtonElement>('[data-quest-navigate="true"]');
    const rewardNode = document.querySelector<HTMLElement>('[data-quest-modal-reward="true"]');
    const progressNode = document.querySelector<HTMLElement>('[data-quest-modal-progress="true"]');
    const nextStepNode = document.querySelector<HTMLElement>('[data-quest-modal-next-step="true"]');
    const requiredItemSection = document.querySelector<HTMLElement>('[data-quest-modal-required-item-section="true"]');
    const requiredItemNode = document.querySelector<HTMLElement>('[data-quest-modal-required-item="true"]');
    const targetLocationNode = document.querySelector<HTMLElement>('[data-quest-modal-target-location="true"]');
    const submitLocationNode = document.querySelector<HTMLElement>('[data-quest-modal-submit-location="true"]');
    const objectiveSection = document.querySelector<HTMLElement>('[data-quest-modal-objective-section="true"]');
    const objectiveNode = document.querySelector<HTMLElement>('[data-quest-modal-objective="true"]');
    const relaySection = document.querySelector<HTMLElement>('[data-quest-modal-relay-section="true"]');
    const relayNode = document.querySelector<HTMLElement>('[data-quest-modal-relay="true"]');
    if (
      !titleNode
      || !subtitleNode
      || !chapterSection
      || !chapterNode
      || !descNode
      || !storySection
      || !storyNode
      || !giverNode
      || !locationNode
      || !navigateButton
      || !rewardNode
      || !progressNode
      || !nextStepNode
      || !requiredItemSection
      || !requiredItemNode
      || !targetLocationNode
      || !submitLocationNode
      || !objectiveSection
      || !objectiveNode
      || !relaySection
      || !relayNode
    ) {
      return false;
    }

    const canNavigateQuest = this.canNavigateQuest(quest);
    const giverLocation = quest.giverMapName && quest.giverX !== undefined && quest.giverY !== undefined
      ? `${quest.giverMapName} (${quest.giverX}, ${quest.giverY})`
      : quest.giverMapName ?? t('quest.location.unknown', undefined);
    const targetLocation = this.formatQuestLocation(
      quest.targetMapName ?? (quest.objectiveType === 'kill' ? quest.giverMapName : undefined),
      quest.targetX,
      quest.targetY,
    );
    const submitLocation = this.formatQuestLocation(quest.submitMapName ?? quest.giverMapName, quest.submitX ?? quest.giverX, quest.submitY ?? quest.giverY);

    titleNode.textContent = quest.title;
    subtitleNode.textContent = `${getQuestLineLabel(quest.line)} · ${getQuestStatusLabel(quest.status)}`;
    chapterSection.classList.toggle('hidden', !quest.chapter);
    chapterNode.textContent = quest.chapter ?? '';
    replaceRichContent(descNode, this.renderQuestText(quest.desc, quest));
    storySection.classList.toggle('hidden', !quest.story);
    storyNode.textContent = quest.story ?? '';
    giverNode.textContent = quest.giverName;
    locationNode.textContent = giverLocation;
    navigateButton.disabled = !canNavigateQuest;
    navigateButton.dataset.questId = quest.id;
    navigateButton.dataset.questCanNavigate = canNavigateQuest ? '1' : '0';
    navigateButton.textContent = this.resolveNavigateLabel(quest);
    replaceRichContent(rewardNode, this.renderRewardContent(quest));
    requiredItemSection.classList.toggle('hidden', !quest.requiredItemId);
    replaceRichContent(requiredItemNode, this.renderRequiredItemContent(quest));
    replaceRichContent(progressNode, this.renderQuestText(this.resolveProgressText(quest), quest));
    replaceRichContent(nextStepNode, this.renderQuestText(this.resolveNextStep(quest), quest));
    objectiveSection.classList.toggle('hidden', !quest.objectiveText);
    replaceRichContent(objectiveNode, this.renderQuestText(quest.objectiveText ?? '', quest));
    targetLocationNode.textContent = targetLocation;
    submitLocationNode.textContent = submitLocation;
    relaySection.classList.toggle('hidden', !quest.relayMessage);
    replaceRichContent(relayNode, this.renderQuestText(quest.relayMessage ?? '', quest));
    return true;
  }

  /** normalizeState：规范化状态。 */
  private normalizeState(quests: QuestState[]): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const counts = this.buildCounts(quests);
    if (!this.hasUserSelectedLine && counts[this.activeLine] === 0) {
      this.activeLine = LINE_ORDER.find((line) => counts[line] > 0) ?? 'main';
    }
    if (this.selectedQuestId && !quests.some((quest) => quest.id === this.selectedQuestId)) {
      this.selectedQuestId = undefined;
    }
  }

  /** getVisibleQuests：读取可见Quests。 */
  private getVisibleQuests(quests: QuestState[]): QuestState[] {
    return [...quests]
      .filter((quest) => quest.line === this.activeLine)
      .sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]);
  }

  /** buildVisibleQuestIds：构建可见任务ID 列表。 */
  private buildVisibleQuestIds(quests: QuestState[]): string[] {
    return this.getVisibleQuests(quests).map((quest) => quest.id);
  }

  /** buildCounts：构建数量。 */
  private buildCounts(quests: QuestState[]): Record<QuestState['line'], number> {
    return {
      main: quests.filter((quest) => quest.line === 'main').length,
      side: quests.filter((quest) => quest.line === 'side').length,
      daily: quests.filter((quest) => quest.line === 'daily').length,
      encounter: quests.filter((quest) => quest.line === 'encounter').length,
    };
  }

  /** resolveProgressText：解析进度文本。 */
  private resolveProgressText(quest: QuestState): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (quest.objectiveType === 'talk') {
      return quest.progress >= quest.required
        ? t('quest.progress.talk.done', undefined)
        : t('quest.progress.talk.pending', undefined);
    }
    if (quest.objectiveType === 'learn_technique') {
      return quest.progress >= quest.required
        ? t('quest.progress.learn.done', { targetName: quest.targetName })
        : t('quest.progress.learn.pending', { targetName: quest.targetName });
    }
    if (quest.objectiveType === 'realm_stage') {
      return quest.progress >= quest.required
        ? t('quest.progress.realm-stage.done', { targetName: quest.targetName })
        : t('quest.progress.realm-stage.pending', { targetName: quest.targetName });
    }
    const requiredItemProgress = this.resolveRequiredItemProgress(quest);
    if (quest.objectiveType === 'kill' && requiredItemProgress) {
      return `${quest.targetName} ${quest.progress}/${quest.required}，${requiredItemProgress.itemName} ${requiredItemProgress.current}/${requiredItemProgress.required}`;
    }
    return `${quest.targetName} ${quest.progress}/${quest.required}`;
  }

  /** resolveNextStep：解析新版Step。 */
  private resolveNextStep(quest: QuestState): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (quest.status === 'ready') {
      const submitLabel = quest.submitNpcName ?? quest.giverName;
      const submitLocation = this.formatQuestLocation(quest.submitMapName ?? quest.giverMapName, quest.submitX ?? quest.giverX, quest.submitY ?? quest.giverY);
      return !this.isUnsetLocation(submitLocation)
        ? t('quest.next.submit-at', { location: submitLocation, npcName: submitLabel })
        : t('quest.next.submit-to', { npcName: submitLabel });
    }
    if (quest.status === 'completed') {
      return t('quest.next.completed', undefined);
    }
    if (quest.status === 'available') {
      const giverLocation = this.formatQuestLocation(quest.giverMapName, quest.giverX, quest.giverY);
      return !this.isUnsetLocation(giverLocation)
        ? t('quest.next.accept-at', { location: giverLocation, npcName: quest.giverName })
        : t('quest.next.accept-to', { npcName: quest.giverName });
    }
    if (quest.objectiveType === 'talk') {
      const talkTarget = quest.targetNpcName ?? quest.targetName;
      const talkLocation = this.formatQuestLocation(quest.targetMapName, quest.targetX, quest.targetY);
      return !this.isUnsetLocation(talkLocation)
        ? t('quest.next.talk-at', { location: talkLocation, npcName: talkTarget })
        : t('quest.next.talk-to', { npcName: talkTarget });
    }
    if (quest.objectiveType === 'submit_item') {
      const submitLocation = this.formatQuestLocation(quest.submitMapName ?? quest.giverMapName, quest.submitX ?? quest.giverX, quest.submitY ?? quest.giverY);
      return !this.isUnsetLocation(submitLocation)
        ? t('quest.next.submit-item-at', { itemName: quest.targetName, location: submitLocation })
        : t('quest.next.submit-item', { itemName: quest.targetName });
    }
    if (quest.objectiveType === 'learn_technique') {
      return t('quest.next.learn-technique', { targetName: quest.targetName });
    }
    if (quest.objectiveType === 'realm_progress') {
      return t('quest.next.realm-progress', { targetName: quest.targetName });
    }
    if (quest.objectiveType === 'realm_stage') {
      return t('quest.next.realm-stage', { targetName: quest.targetName });
    }
    const requiredItemProgress = this.resolveRequiredItemProgress(quest);
    if (quest.objectiveType === 'kill' && requiredItemProgress) {
      if (quest.progress >= quest.required && requiredItemProgress.current < requiredItemProgress.required) {
        return t('quest.next.collect-item', requiredItemProgress);
      }
      const targetLocation = this.formatQuestLocation(quest.targetMapName ?? quest.giverMapName, quest.targetX, quest.targetY);
      return !this.isUnsetLocation(targetLocation)
        ? t('quest.next.kill-collect-at', { location: targetLocation, targetName: quest.targetName, itemName: requiredItemProgress.itemName })
        : t('quest.next.kill-collect', { targetName: quest.targetName, itemName: requiredItemProgress.itemName });
    }
    const targetLocation = this.formatQuestLocation(quest.targetMapName ?? quest.giverMapName, quest.targetX, quest.targetY);
    return !this.isUnsetLocation(targetLocation)
      ? t('quest.next.kill-at', { location: targetLocation, targetName: quest.targetName })
      : t('quest.next.kill', { targetName: quest.targetName });
  }

  /** resolveRequiredItemProgress：解析Required物品进度。 */
  private resolveRequiredItemProgress(quest: QuestState): {  
  /**
 * itemName：道具名称名称或显示文本。
 */
 itemName: string;  
 /**
 * current：current相关字段。
 */
 current: number;  
 /**
 * required：required相关字段。
 */
 required: number } | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!quest.requiredItemId) {
      return null;
    }
    const required = Math.max(1, quest.requiredItemCount ?? 1);
    const current = Math.min(required, this.getInventoryItemCount(quest.requiredItemId));
    return {
      itemName: resolveQuestRequiredItemName(quest.requiredItemId),
      current,
      required,
    };
  }

  /** getInventoryItemCount：读取背包物品数量。 */
  private getInventoryItemCount(itemId: string): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.inventory) {
      return 0;
    }
    return this.inventory.items.reduce((total, item) => (
      item.itemId === itemId ? total + item.count : total
    ), 0);
  }

  /** formatQuestLocation：格式化任务Location。 */
  private formatQuestLocation(mapName?: string, x?: number, y?: number): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (mapName && x !== undefined && y !== undefined) {
      return `${mapName} (${x}, ${y})`;
    }
    return mapName ?? t('quest.location.unset', undefined);
  }

  private isUnsetLocation(location: string): boolean {
    return location === t('quest.location.unset', undefined);
  }

  private resolveNavigateLabel(quest: QuestState): string {
    return quest.status === 'ready'
      ? t('quest.action.navigate-submit', undefined)
      : t('quest.action.navigate-target', undefined);
  }

  /** canNavigateQuest：判断是否Navigate任务。 */
  private canNavigateQuest(quest: QuestState): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (quest.status === 'ready') {
      return Boolean(quest.submitMapId ?? quest.giverMapId);
    }
    if (quest.targetMapId || (quest.objectiveType === 'kill' && quest.giverMapId)) {
      return true;
    }
    if (quest.objectiveType === 'talk' && quest.targetNpcId) {
      return true;
    }
    return false;
  }

  /** renderRichText：渲染Rich文本。 */
  private renderRichText(text: string): string {
    return renderTextWithInlineItemHighlights(text);
  }

  /** renderQuestText：渲染任务文本。 */
  private renderQuestText(text: string, quest: QuestState): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!text.trim()) {
      return '';
    }
    if (quest.objectiveType !== 'kill' || !quest.targetMonsterId || !quest.targetName.trim()) {
      return this.renderRichText(text);
    }
    const token = '[[[QUEST_MONSTER_TARGET]]]';
    const normalizedText = text.replaceAll(quest.targetName, token);
    return this.renderRichText(normalizedText).replaceAll(token, renderInlineMonsterChip(quest.targetMonsterId, {
      label: quest.targetName,
    }));
  }

  /** renderRewardContent：渲染Reward Content。 */
  private renderRewardContent(quest: QuestState): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const rewardChips = quest.rewards
      .map((reward) => renderInlineItemChip(reward.itemId, {
        count: reward.count,
        label: reward.name,
        tone: 'reward',
      }))
      .join('');
    if (rewardChips) {
      return `<div class="inline-item-flow">${rewardChips}</div>`;
    }
    if (quest.rewardText.trim().length > 0 && quest.rewardText.trim() !== t('quest.reward.none-marker', undefined)) {
      return `<div class="inline-rich-text">${this.renderRichText(quest.rewardText)}</div>`;
    }
    return `<div class="inline-rich-text">${escapeHtml(t('quest.reward.empty', undefined))}</div>`;
  }

  /** renderRequiredItemContent：渲染Required物品Content。 */
  private renderRequiredItemContent(quest: QuestState): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const requiredItemProgress = this.resolveRequiredItemProgress(quest);
    if (!requiredItemProgress || !quest.requiredItemId) {
      return `<div class="inline-rich-text">${escapeHtml(t('quest.requirement.empty', undefined))}</div>`;
    }
    return `
      <div class="ui-requirement-entry ui-surface-card ui-surface-card--compact">
        <div class="ui-requirement-entry-head">
          <span class="ui-requirement-status ${requiredItemProgress.current >= requiredItemProgress.required ? 'is-completed' : 'is-unmet'}">${escapeHtml(t('quest.requirement.owned', requiredItemProgress))}</span>
        </div>
        <div class="inline-item-flow">
          ${renderInlineItemChip(quest.requiredItemId, {
            count: requiredItemProgress.required,
            label: requiredItemProgress.itemName,
            tone: 'required',
          })}
        </div>
      </div>
    `;
  }
}
