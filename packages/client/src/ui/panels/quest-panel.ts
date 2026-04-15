/** 任务面板：按任务线分类展示，并支持全局单实例详情弹层 */
// TODO(next:UI05): 继续收口 quest-panel 的业务 recipe 与零散 innerHTML 更新，避免任务线/详情仍保留模板式长尾。

import { Inventory, PlayerState, QuestState } from '@mud/shared-next';
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

/** escapeHtml：转义 HTML 文本中的危险字符。 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** isSameQuestIdSequence：判断是否Same任务ID Sequence。 */
function isSameQuestIdSequence(previous: string[] | null, next: string[]): boolean {
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
  private selectedQuestId?: string;
  /** hasUserSelectedLine：has用户Selected Line标记。 */
  private hasUserSelectedLine = false;
  /** lastQuests：last Quests。 */
  private lastQuests: QuestState[] = [];
  /** lastVisibleQuestIds：last可见任务ID 列表。 */
  private lastVisibleQuestIds: string[] | null = null;
  /** lastStructureLine：last Structure Line。 */
  private lastStructureLine: QuestState['line'] | null = null;
  private currentMapId?: string;
  /** inventory：背包。 */
  private inventory: Inventory | null = null;
  /** onNavigateQuest：on Navigate任务。 */
  private onNavigateQuest: ((questId: string) => void) | null = null;
  private shellRefs: {
    section: HTMLDivElement;
    title: HTMLDivElement;
    subtabs: HTMLDivElement;
  } | null = null;

  constructor() {
    this.bindPaneEvents();
    bindInlineItemTooltips(this.pane);
  }

  setCallbacks(onNavigateQuest: (questId: string) => void): void {
    this.onNavigateQuest = onNavigateQuest;
  }

  /** setCurrentMapId：处理set当前地图ID。 */
  setCurrentMapId(mapId?: string): void {
    this.currentMapId = mapId;
    if (!this.patchModal()) {
      this.renderModal();
    }
  }

  /** syncInventory：同步背包。 */
  syncInventory(inventory: Inventory): void {
    this.inventory = inventory;
    if (this.lastQuests.length === 0) {
      return;
    }
    if (!this.patchList()) {
      this.renderList();
    }
    if (!this.patchModal()) {
      this.renderModal();
    }
  }

  /** 更新任务列表并刷新列表与弹层 */
  update(quests: QuestState[]): void {
    this.lastQuests = quests;
    this.normalizeState(quests);
    if (!this.patchList()) {
      this.renderList();
    }
    if (!this.patchModal()) {
      this.renderModal();
    }
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
    const emptyNode = this.createEmptyState();
    emptyNode.textContent = '暂无任务，和 NPC 交互可接取';
    this.pane.replaceChildren(emptyNode);
    detailModalHost.close(QuestPanel.MODAL_OWNER);
  }

  /** closeDetail：关闭详情。 */
  closeDetail(): void {
    this.selectedQuestId = undefined;
    detailModalHost.close(QuestPanel.MODAL_OWNER);
  }

  /** renderList：渲染列表。 */
  private renderList(): void {
    const quests = this.lastQuests;
    if (quests.length === 0) {
      this.selectedQuestId = undefined;
      this.lastVisibleQuestIds = [];
      this.lastStructureLine = this.activeLine;
      this.shellRefs = null;
      const emptyNode = this.createEmptyState();
      emptyNode.textContent = '暂无任务，和 NPC 交互可接取';
      this.pane.replaceChildren(emptyNode);
      return;
    }
    this.ensureShell();
    this.patchList();
  }

  /** ensureShell：确保Shell。 */
  private ensureShell(): { section: HTMLDivElement; title: HTMLDivElement; subtabs: HTMLDivElement } {
    if (this.shellRefs?.section.isConnected) {
      return this.shellRefs;
    }

    const { sectionEl, titleEl } = createPanelSectionWithTitle('任务簿');
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
        this.renderModal();
        return;
      }

      const questButton = target.closest<HTMLElement>('[data-quest-id]');
      if (!questButton) {
        return;
      }
      const questId = questButton.dataset.questId;
      if (!questId) return;
      this.selectedQuestId = questId;
      this.renderModal();
    });
  }

  /** patchList：处理patch列表。 */
  private patchList(): boolean {
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
    if (visibleQuests.length === 0) {
      const emptyNode = this.pane.querySelector<HTMLElement>('[data-quest-empty="true"]') ?? this.createEmptyState();
      emptyNode.textContent = `当前没有${getQuestLineLabel(this.activeLine)}任务`;
      this.syncSectionContent(section, subtabs, [emptyNode]);
      this.lastVisibleQuestIds = [];
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
    this.syncSectionContent(section, subtabs, orderedCards);

    for (const quest of visibleQuests) {
      const card = this.pane.querySelector<HTMLElement>(`[data-quest-id="${CSS.escape(quest.id)}"]`);
      if (!card) {
        return false;
      }
      if (!this.patchQuestCard(card, quest)) {
        return false;
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
    expandHint.textContent = '点击查看详情';
    card.appendChild(expandHint);

    this.patchQuestCard(card, quest);
    return card;
  }

  /** patchQuestCard：处理patch任务卡片。 */
  private patchQuestCard(card: HTMLElement, quest: QuestState): boolean {
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
    chapterNode.textContent = `章节：${quest.chapter ?? ''}`;
    descNode.innerHTML = this.renderQuestText(quest.desc, quest);
    progressLabelNode.innerHTML = `目标：${this.renderQuestText(this.resolveProgressText(quest), quest)}`;
    progressFillNode.style.width = `${percent}%`;
    nextStepNode.innerHTML = `下一步：${this.renderQuestText(this.resolveNextStep(quest), quest)}`;
    return true;
  }

  /** syncSectionContent：同步Section Content。 */
  private syncSectionContent(section: HTMLElement, subtabs: HTMLElement, orderedNodes: HTMLElement[]): void {
    const titleNode = section.querySelector<HTMLElement>('.panel-section-title');
    if (!titleNode) {
      return;
    }
    const allowed = new Set<HTMLElement>(orderedNodes);
    for (const child of Array.from(section.children)) {
      if (child === titleNode || child === subtabs) {
        continue;
      }
      if (!(child instanceof HTMLElement) || !allowed.has(child)) {
        child.remove();
      }
    }
    let reference = subtabs.nextSibling;
    for (const node of orderedNodes) {
      if (reference !== node) {
        section.insertBefore(node, reference);
      }
      reference = node.nextSibling;
    }
  }

  /** renderModal：渲染弹窗。 */
  private renderModal(): void {
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
      : quest.giverMapName ?? '未知';
    const targetLocation = this.formatQuestLocation(
      quest.targetMapName ?? (quest.objectiveType === 'kill' ? quest.giverMapName : undefined),
      quest.targetX,
      quest.targetY,
    );
    const submitLocation = this.formatQuestLocation(quest.submitMapName ?? quest.giverMapName, quest.submitX ?? quest.giverX, quest.submitY ?? quest.giverY);
    const navigateLabel = quest.status === 'ready' ? '前往交付' : '前往目标';

    detailModalHost.open({
      ownerId: QuestPanel.MODAL_OWNER,
      size: 'md',
      variantClass: 'detail-modal--quest',
      title: quest.title,
      subtitle: `${getQuestLineLabel(quest.line)} · ${getQuestStatusLabel(quest.status)}`,
      bodyHtml: `
        <div class="ui-detail-field ui-detail-field--section ${quest.chapter ? '' : 'hidden'}" data-quest-modal-chapter-section="true"><strong>章节</strong><span data-quest-modal-chapter="true">${escapeHtml(quest.chapter ?? '')}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>任务描述</strong><div data-quest-modal-desc="true">${this.renderQuestText(quest.desc, quest)}</div></div>
        <div class="ui-detail-field ui-detail-field--section ${quest.story ? '' : 'hidden'}" data-quest-modal-story-section="true"><strong>剧情</strong><span data-quest-modal-story="true">${escapeHtml(quest.story ?? '')}</span></div>
        <div class="ui-detail-grid ui-detail-grid--section">
          <div class="ui-detail-field ui-detail-field--section"><strong>发布者</strong><span data-quest-modal-giver="true">${escapeHtml(quest.giverName)}</span></div>
          <div class="ui-detail-field ui-detail-field--section">
            <strong>接取地点</strong>
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
          <div class="ui-detail-field ui-detail-field--section"><strong>任务目标</strong><span data-quest-modal-target-location="true">${escapeHtml(targetLocation)}</span></div>
          <div class="ui-detail-field ui-detail-field--section"><strong>提交地点</strong><span data-quest-modal-submit-location="true">${escapeHtml(submitLocation)}</span></div>
          <div class="ui-detail-field ui-detail-field--section"><strong>奖励</strong><div data-quest-modal-reward="true">${this.renderRewardContent(quest)}</div></div>
          <div class="ui-detail-field ui-detail-field--section ${quest.requiredItemId ? '' : 'hidden'}" data-quest-modal-required-item-section="true"><strong>任务需求</strong><div data-quest-modal-required-item="true">${this.renderRequiredItemContent(quest)}</div></div>
          <div class="ui-detail-field ui-detail-field--section"><strong>当前进度</strong><div data-quest-modal-progress="true">${this.renderQuestText(this.resolveProgressText(quest), quest)}</div></div>
          <div class="ui-detail-field ui-detail-field--section"><strong>下一步</strong><div data-quest-modal-next-step="true">${this.renderQuestText(this.resolveNextStep(quest), quest)}</div></div>
        </div>
        <div class="ui-detail-field ui-detail-field--section ${quest.objectiveText ? '' : 'hidden'}" data-quest-modal-objective-section="true"><strong>任务说明</strong><div data-quest-modal-objective="true">${this.renderQuestText(quest.objectiveText ?? '', quest)}</div></div>
        <div class="ui-detail-field ui-detail-field--section ${quest.relayMessage ? '' : 'hidden'}" data-quest-modal-relay-section="true"><strong>传话内容</strong><div data-quest-modal-relay="true">${this.renderQuestText(quest.relayMessage ?? '', quest)}</div></div>
      `,
      onClose: () => {
        this.selectedQuestId = undefined;
      },
      onAfterRender: (body) => {
        bindInlineItemTooltips(body);
        body.querySelector<HTMLElement>('[data-quest-navigate]')?.addEventListener('click', (event) => {
          event.stopPropagation();
          const button = event.currentTarget;
          if (!(button instanceof HTMLElement) || button.dataset.questCanNavigate !== '1') return;
          const questId = button.dataset.questId;
          if (!questId) return;
          this.onNavigateQuest?.(questId);
        });
      },
    });
  }

  /** patchModal：处理patch弹窗。 */
  private patchModal(): boolean {
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
      : quest.giverMapName ?? '未知';
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
    descNode.innerHTML = this.renderQuestText(quest.desc, quest);
    storySection.classList.toggle('hidden', !quest.story);
    storyNode.textContent = quest.story ?? '';
    giverNode.textContent = quest.giverName;
    locationNode.textContent = giverLocation;
    navigateButton.disabled = !canNavigateQuest;
    navigateButton.dataset.questId = quest.id;
    navigateButton.dataset.questCanNavigate = canNavigateQuest ? '1' : '0';
    navigateButton.textContent = quest.status === 'ready' ? '前往交付' : '前往目标';
    rewardNode.innerHTML = this.renderRewardContent(quest);
    requiredItemSection.classList.toggle('hidden', !quest.requiredItemId);
    requiredItemNode.innerHTML = this.renderRequiredItemContent(quest);
    progressNode.innerHTML = this.renderQuestText(this.resolveProgressText(quest), quest);
    nextStepNode.innerHTML = this.renderQuestText(this.resolveNextStep(quest), quest);
    objectiveSection.classList.toggle('hidden', !quest.objectiveText);
    objectiveNode.innerHTML = this.renderQuestText(quest.objectiveText ?? '', quest);
    targetLocationNode.textContent = targetLocation;
    submitLocationNode.textContent = submitLocation;
    relaySection.classList.toggle('hidden', !quest.relayMessage);
    relayNode.innerHTML = this.renderQuestText(quest.relayMessage ?? '', quest);
    return true;
  }

  /** normalizeState：规范化状态。 */
  private normalizeState(quests: QuestState[]): void {
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
    if (quest.objectiveType === 'talk') {
      return quest.progress >= quest.required ? '口信已传达' : '尚未传达';
    }
    if (quest.objectiveType === 'learn_technique') {
      return `${quest.targetName} ${quest.progress >= quest.required ? '已参悟' : '未参悟'}`;
    }
    if (quest.objectiveType === 'realm_stage') {
      return `${quest.targetName} ${quest.progress >= quest.required ? '已达成' : '未达成'}`;
    }
    const requiredItemProgress = this.resolveRequiredItemProgress(quest);
    if (quest.objectiveType === 'kill' && requiredItemProgress) {
      return `${quest.targetName} ${quest.progress}/${quest.required}，${requiredItemProgress.itemName} ${requiredItemProgress.current}/${requiredItemProgress.required}`;
    }
    return `${quest.targetName} ${quest.progress}/${quest.required}`;
  }

  /** resolveNextStep：解析新版Step。 */
  private resolveNextStep(quest: QuestState): string {
    if (quest.status === 'ready') {
      const submitLabel = quest.submitNpcName ?? quest.giverName;
      const submitLocation = this.formatQuestLocation(quest.submitMapName ?? quest.giverMapName, quest.submitX ?? quest.giverX, quest.submitY ?? quest.giverY);
      return submitLocation !== '未设置'
        ? `前往 ${submitLocation} 找 ${submitLabel} 交付任务`
        : `前往 ${submitLabel} 交付任务`;
    }
    if (quest.status === 'completed') {
      return '任务已结清';
    }
    if (quest.status === 'available') {
      const giverLocation = this.formatQuestLocation(quest.giverMapName, quest.giverX, quest.giverY);
      return giverLocation !== '未设置'
        ? `前往 ${giverLocation} 找 ${quest.giverName} 接取任务`
        : `前往 ${quest.giverName} 接取任务`;
    }
    if (quest.objectiveType === 'talk') {
      const talkTarget = quest.targetNpcName ?? quest.targetName;
      const talkLocation = this.formatQuestLocation(quest.targetMapName, quest.targetX, quest.targetY);
      return talkLocation !== '未设置'
        ? `前往 ${talkLocation} 找 ${talkTarget} 传达口信`
        : `前往 ${talkTarget} 传达口信`;
    }
    if (quest.objectiveType === 'submit_item') {
      const submitLocation = this.formatQuestLocation(quest.submitMapName ?? quest.giverMapName, quest.submitX ?? quest.giverX, quest.submitY ?? quest.giverY);
      return submitLocation !== '未设置'
        ? `准备 ${quest.targetName}，再前往 ${submitLocation} 交付`
        : `准备 ${quest.targetName} 并前往交付`;
    }
    if (quest.objectiveType === 'learn_technique') {
      return `打开背包，使用功法书学会 ${quest.targetName}`;
    }
    if (quest.objectiveType === 'realm_progress') {
      return `前往历练并击败敌人，继续积累 ${quest.targetName}`;
    }
    if (quest.objectiveType === 'realm_stage') {
      return `继续历练；境界圆满后点击顶部境界/突破查看要求并突破，达到 ${quest.targetName}`;
    }
    const requiredItemProgress = this.resolveRequiredItemProgress(quest);
    if (quest.objectiveType === 'kill' && requiredItemProgress) {
      if (quest.progress >= quest.required && requiredItemProgress.current < requiredItemProgress.required) {
        return `继续收集 ${requiredItemProgress.itemName} (${requiredItemProgress.current}/${requiredItemProgress.required})`;
      }
      const targetLocation = this.formatQuestLocation(quest.targetMapName ?? quest.giverMapName, quest.targetX, quest.targetY);
      return targetLocation !== '未设置'
        ? `前往 ${targetLocation} 击杀 ${quest.targetName}，并收集 ${requiredItemProgress.itemName}`
        : `前往击杀 ${quest.targetName}，并收集 ${requiredItemProgress.itemName}`;
    }
    const targetLocation = this.formatQuestLocation(quest.targetMapName ?? quest.giverMapName, quest.targetX, quest.targetY);
    return targetLocation !== '未设置'
      ? `前往 ${targetLocation} 击杀 ${quest.targetName}`
      : `前往击杀 ${quest.targetName}`;
  }

  /** resolveRequiredItemProgress：解析Required物品进度。 */
  private resolveRequiredItemProgress(quest: QuestState): { itemName: string; current: number; required: number } | null {
    if (!quest.requiredItemId) {
      return null;
    }
    const required = Math.max(1, quest.requiredItemCount ?? 1);
    const current = Math.min(required, this.getInventoryItemCount(quest.requiredItemId));
    return {
      itemName: getLocalItemTemplate(quest.requiredItemId)?.name ?? quest.requiredItemId,
      current,
      required,
    };
  }

  /** getInventoryItemCount：读取背包物品数量。 */
  private getInventoryItemCount(itemId: string): number {
    if (!this.inventory) {
      return 0;
    }
    return this.inventory.items.reduce((total, item) => (
      item.itemId === itemId ? total + item.count : total
    ), 0);
  }

  /** formatQuestLocation：格式化任务Location。 */
  private formatQuestLocation(mapName?: string, x?: number, y?: number): string {
    if (mapName && x !== undefined && y !== undefined) {
      return `${mapName} (${x}, ${y})`;
    }
    return mapName ?? '未设置';
  }

  /** canNavigateQuest：判断是否Navigate任务。 */
  private canNavigateQuest(quest: QuestState): boolean {
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
    const rewardChips = quest.rewards
      .map((reward) => renderInlineItemChip(reward.itemId, {
        count: reward.count,
        label: reward.name,
        tone: 'reward',
      }))
      .join('');
    const fallbackRewardText = quest.rewards
      .map((reward) => `${reward.name} x${reward.count}`)
      .join('、');
    const shouldShowRewardText = quest.rewardText.trim().length > 0
      && quest.rewardText.trim() !== '无'
      && quest.rewardText.trim() !== fallbackRewardText;
    const sections: string[] = [];
    if (rewardChips) {
      sections.push(`<div class="ui-requirement-entry ui-surface-card ui-surface-card--compact"><div class="inline-item-flow">${rewardChips}</div></div>`);
    }
    if (shouldShowRewardText) {
      sections.push(`<div class="inline-rich-text">${this.renderRichText(quest.rewardText)}</div>`);
    }
    if (sections.length === 0) {
      sections.push('<div class="inline-rich-text">暂无额外奖励说明</div>');
    }
    return sections.join('');
  }

  /** renderRequiredItemContent：渲染Required物品Content。 */
  private renderRequiredItemContent(quest: QuestState): string {
    const requiredItemProgress = this.resolveRequiredItemProgress(quest);
    if (!requiredItemProgress || !quest.requiredItemId) {
      return '<div class="inline-rich-text">当前任务无额外提交材料。</div>';
    }
    return `
      <div class="ui-requirement-entry ui-surface-card ui-surface-card--compact">
        <div class="ui-requirement-entry-head">
          <span class="ui-requirement-status ${requiredItemProgress.current >= requiredItemProgress.required ? 'is-completed' : 'is-unmet'}">当前持有 ${requiredItemProgress.current}/${requiredItemProgress.required}</span>
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

