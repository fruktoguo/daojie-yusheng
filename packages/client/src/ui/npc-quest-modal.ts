import { Inventory, S2C_NpcQuests, PlayerState, QuestState } from '@mud/shared';
import { getLocalItemTemplate } from '../content/local-templates';
import { getQuestLineLabel, getQuestStatusLabel } from '../domain-labels';
import { detailModalHost } from './detail-modal-host';
import { bindInlineItemTooltips, renderInlineItemChip, renderInlineMonsterChip, renderTextWithInlineItemHighlights } from './item-inline-tooltip';

/** escapeHtml：转义 HTML 文本中的危险字符。 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** NpcQuestModalCallbacks：任务弹窗回调集。 */
interface NpcQuestModalCallbacks {
/**
 * onRequestQuests：集合字段。
 */

  onRequestQuests: (npcId: string) => void;  
  /**
 * onAcceptQuest：onAccept任务相关字段。
 */

  onAcceptQuest: (npcId: string, questId: string) => void;  
  /**
 * onSubmitQuest：onSubmit任务相关字段。
 */

  onSubmitQuest: (npcId: string, questId: string) => void;  
  /**
 * onNavigateQuest：onNavigate任务相关字段。
 */

  onNavigateQuest: (questId: string) => void;
}

/** NpcQuestModalMeta：任务弹窗标题元数据。 */
type NpcQuestModalMeta = {
/**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * subtitle：subtitle名称或显示文本。
 */

  subtitle: string;
};

/** NpcQuestRenderState：任务弹窗滚动与焦点状态。 */
type NpcQuestRenderState = {
/**
 * listScrollTop：ScrollTop相关字段。
 */

  listScrollTop: number;  
  /**
 * detailScrollTop：详情ScrollTop相关字段。
 */

  detailScrollTop: number;  
  /**
 * focusSelector：focuSelector相关字段。
 */

  focusSelector: string | null;
};

/** NpcQuestModal：NPC任务弹窗实现。 */
export class NpcQuestModal {
  /** MODAL_OWNER：弹窗OWNER。 */
  private static readonly MODAL_OWNER = 'npc-quest-modal';
  /** callbacks：callbacks。 */
  private callbacks: NpcQuestModalCallbacks | null = null;
  /** activeNpcId：活跃NPC ID。 */
  private activeNpcId: string | null = null;
  /** loading：loading。 */
  private loading = false;
  /** currentMapId：当前地图ID。 */
  private currentMapId: string | undefined;
  /** inventory：背包。 */
  private inventory: Inventory = { items: [], capacity: 0 };
  /** state：状态。 */
  private state: S2C_NpcQuests | null = null;
  /** selectedQuestId：selected任务ID。 */
  private selectedQuestId: string | null = null;
  /** delegatedEventsBound：delegated事件Bound。 */
  private delegatedEventsBound = false;

  /** setCallbacks：处理set Callbacks。 */
  setCallbacks(callbacks: NpcQuestModalCallbacks): void {
    this.callbacks = callbacks;
  }

  /** initFromPlayer：初始化From玩家。 */
  initFromPlayer(player: PlayerState): void {
    this.currentMapId = player.mapId;
    this.inventory = player.inventory;
  }

  /** setCurrentMapId：处理set当前地图ID。 */
  setCurrentMapId(mapId?: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.currentMapId = mapId;
    if (detailModalHost.isOpenFor(NpcQuestModal.MODAL_OWNER)) {
      this.render();
    }
  }

  /** syncInventory：同步背包。 */
  syncInventory(inventory: Inventory): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.inventory = inventory;
    if (detailModalHost.isOpenFor(NpcQuestModal.MODAL_OWNER)) {
      this.render();
    }
  }

  /** openPending：打开待处理。 */
  openPending(npcId: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.activeNpcId = npcId;
    this.loading = true;
    if (this.state?.npcId !== npcId) {
      this.state = null;
      this.selectedQuestId = null;
    }
    this.render();
  }

  /** open：打开open。 */
  open(npcId: string): void {
    this.openPending(npcId);
    this.callbacks?.onRequestQuests(npcId);
  }

  /** updateQuests：更新Quests。 */
  updateQuests(data: S2C_NpcQuests): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.activeNpcId && this.activeNpcId !== data.npcId && detailModalHost.isOpenFor(NpcQuestModal.MODAL_OWNER)) {
      return;
    }
    this.activeNpcId = data.npcId;
    this.state = data;
    this.loading = false;
    const questIds = new Set(data.quests.map((quest) => quest.id));
    if (!this.selectedQuestId || !questIds.has(this.selectedQuestId)) {
      this.selectedQuestId = this.pickPreferredQuestId(data.quests);
    }
    this.render();
  }

  /** refreshActive：处理refresh活跃。 */
  refreshActive(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.activeNpcId) {
      return;
    }
    this.callbacks?.onRequestQuests(this.activeNpcId);
  }

  /** getActiveNpcId：读取活跃NPC ID。 */
  getActiveNpcId(): string | null {
    return this.activeNpcId;
  }

  /** clear：清理clear。 */
  clear(): void {
    this.activeNpcId = null;
    this.loading = false;
    this.state = null;
    this.selectedQuestId = null;
    this.inventory = { items: [], capacity: 0 };
    detailModalHost.close(NpcQuestModal.MODAL_OWNER);
  }

  /** render：渲染渲染。 */
  private render(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const meta = this.buildModalMeta();
    const body = detailModalHost.isOpenFor(NpcQuestModal.MODAL_OWNER)
      ? document.getElementById('detail-modal-body')
      : null;
    const renderState = body ? this.captureRenderState(body) : null;
    if (detailModalHost.isOpenFor(NpcQuestModal.MODAL_OWNER) && body && this.patchBody(body, meta)) {
      if (renderState) {
        this.restoreRenderState(body, renderState);
      }
      return;
    }
    detailModalHost.open({
      ownerId: NpcQuestModal.MODAL_OWNER,
      variantClass: 'detail-modal--quest',
      title: meta.title,
      subtitle: meta.subtitle,
      renderBody: (modalBody) => {
        this.renderBody(modalBody);
      },
      onClose: () => {
        this.activeNpcId = null;
        this.loading = false;
      },
      onAfterRender: (body) => {
        bindInlineItemTooltips(body);
        this.bindEvents(body);
        if (renderState) {
          this.restoreRenderState(body, renderState);
        }
      },
    });
  }

  /** buildModalMeta：构建弹窗元数据。 */
  private buildModalMeta(): NpcQuestModalMeta {
    return {
      title: this.state?.npcName ?? '任务委托',
      subtitle: this.loading && !this.state
        ? '正在同步任务列表'
        : this.state
          ? `当前可见 ${this.state.quests.length} 条任务线索`
          : '暂无可同步内容',
    };
  }

  /** renderBody：渲染身体。 */
  private renderBody(body: HTMLElement): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.loading && !this.state) {
      body.replaceChildren(this.createEmptyState('正在与这位 NPC 对话……'));
      return;
    }
    if (!this.state) {
      body.replaceChildren(this.createEmptyState('暂时无法读取任务列表。'));
      return;
    }
    if (this.state.quests.length === 0) {
      body.replaceChildren(this.createEmptyState(`${this.state.npcName} 目前没有新的委托。`));
      return;
    }

    const selected = this.resolveSelectedQuest();
    if (!selected) {
      body.replaceChildren(this.createEmptyState('暂时无法读取任务详情。'));
      return;
    }

    const shell = this.createModalShell();
    const listRoot = shell.querySelector<HTMLElement>('[data-npc-quest-list="true"]');
    const detailRoot = shell.querySelector<HTMLElement>('[data-npc-quest-detail="true"]');
    if (!listRoot || !detailRoot) {
      body.replaceChildren(this.createEmptyState('暂时无法读取任务详情。'));
      return;
    }
    this.syncQuestList(listRoot, selected);
    this.syncQuestDetail(detailRoot, selected);
    body.replaceChildren(shell);
  }

  /** createEmptyState：创建空态节点。 */
  private createEmptyState(text: string): HTMLDivElement {
    const empty = document.createElement('div');
    empty.className = 'empty-hint ui-empty-hint';
    empty.textContent = text;
    return empty;
  }

  /** createModalShell：创建任务弹窗稳定壳体。 */
  private createModalShell(): HTMLDivElement {
    const shell = document.createElement('div');
    shell.className = 'npc-quest-modal-shell ui-workspace-shell';

    const list = document.createElement('div');
    list.className = 'npc-quest-list ui-card-list ui-scroll-panel';
    list.dataset.npcQuestList = 'true';

    const detail = document.createElement('div');
    detail.className = 'ui-surface-pane ui-surface-pane--stack ui-scroll-panel';
    detail.dataset.npcQuestDetail = 'true';

    shell.append(list, detail);
    return shell;
  }

  /** createQuestCard：创建任务列表卡片。 */
  private createQuestCard(): HTMLButtonElement {
    const card = document.createElement('button');
    card.className = 'quest-card quest-card-toggle npc-quest-card ui-surface-card ui-surface-card--compact';
    card.type = 'button';

    const titleRow = document.createElement('div');
    titleRow.className = 'quest-title-row';

    const title = document.createElement('span');
    title.className = 'quest-title';
    title.dataset.npcQuestCardTitle = 'true';

    const status = document.createElement('span');
    status.className = 'quest-status';
    status.dataset.npcQuestCardStatus = 'true';

    titleRow.append(title, status);

    const line = document.createElement('div');
    line.className = 'quest-meta';
    line.dataset.npcQuestCardLine = 'true';

    const desc = document.createElement('div');
    desc.className = 'quest-desc';
    desc.dataset.npcQuestCardDesc = 'true';

    card.append(titleRow, line, desc);
    return card;
  }

  /** patchQuestCard：按当前任务状态局部更新卡片。 */
  private patchQuestCard(card: HTMLButtonElement, quest: QuestState, active: boolean): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const titleNode = card.querySelector<HTMLElement>('[data-npc-quest-card-title="true"]');
    const statusNode = card.querySelector<HTMLElement>('[data-npc-quest-card-status="true"]');
    const lineNode = card.querySelector<HTMLElement>('[data-npc-quest-card-line="true"]');
    const descNode = card.querySelector<HTMLElement>('[data-npc-quest-card-desc="true"]');
    if (!titleNode || !statusNode || !lineNode || !descNode) {
      return false;
    }

    card.dataset.npcQuestSelect = quest.id;
    card.classList.toggle('is-active', active);
    titleNode.textContent = quest.title;
    statusNode.textContent = getQuestStatusLabel(quest.status);
    lineNode.textContent = getQuestLineLabel(quest.line);
    descNode.innerHTML = this.renderQuestText(quest.desc, quest);
    return true;
  }

  /** syncQuestList：同步任务列表节点，优先复用现有卡片。 */
  private syncQuestList(listRoot: HTMLElement, selected: QuestState): boolean {
    const quests = this.state?.quests ?? [];
    const existingCards = new Map<string, HTMLButtonElement>();
    listRoot.querySelectorAll<HTMLButtonElement>('[data-npc-quest-select]').forEach((card) => {
      const questId = card.dataset.npcQuestSelect;
      if (questId) {
        existingCards.set(questId, card);
      }
    });

    const orderedCards = quests.map((quest) => {
      const card = existingCards.get(quest.id) ?? this.createQuestCard();
      this.patchQuestCard(card, quest, quest.id === selected.id);
      existingCards.delete(quest.id);
      return card;
    });
    existingCards.forEach((card) => card.remove());
    this.syncContainerChildren(listRoot, orderedCards);
    return true;
  }

  /** syncQuestDetail：刷新详情区内容。 */
  private syncQuestDetail(detailRoot: HTMLElement, selected: QuestState): void {
    const template = document.createElement('template');
    template.innerHTML = this.renderQuestDetail(selected).trim();
    detailRoot.replaceChildren(template.content.cloneNode(true));
  }

  /** syncContainerChildren：按目标顺序复用并重排子节点。 */
  private syncContainerChildren(container: HTMLElement, orderedNodes: HTMLElement[]): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const allowed = new Set(orderedNodes);
    for (const child of Array.from(container.children)) {
      if (!(child instanceof HTMLElement) || !allowed.has(child)) {
        child.remove();
      }
    }

    let reference: ChildNode | null = container.firstChild;
    for (const node of orderedNodes) {
      if (reference !== node) {
        container.insertBefore(node, reference);
      }
      reference = node.nextSibling;
    }
  }

  /** renderQuestDetail：渲染任务详情。 */
  private renderQuestDetail(selected: QuestState): string {
    const canNavigate = this.canNavigateQuest(selected);
    const navigateLabel = selected.status === 'ready' ? '前往交付' : '前往目标';
    const actionButton = selected.status === 'available'
      ? '<button class="small-btn primary" data-npc-quest-accept="true" type="button">接取任务</button>'
      : selected.status === 'ready'
        ? '<button class="small-btn primary" data-npc-quest-submit="true" type="button">提交任务</button>'
        : '';
    return `
      <div class="ui-title-block">
        <div class="ui-title-block-title">${escapeHtml(selected.title)}</div>
        <div class="ui-title-block-subtitle">${escapeHtml(getQuestLineLabel(selected.line))} · ${escapeHtml(getQuestStatusLabel(selected.status))}</div>
      </div>
      <div class="ui-detail-field ui-detail-field--section"><strong>任务描述</strong><div>${this.renderQuestText(selected.desc, selected)}</div></div>
      <div class="ui-detail-grid ui-detail-grid--section">
        <div class="ui-detail-field ui-detail-field--section"><strong>发布者</strong><span>${escapeHtml(selected.giverName)}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>当前状态</strong><span>${escapeHtml(getQuestStatusLabel(selected.status))}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>目标地点</strong><span>${escapeHtml(this.formatQuestLocation(selected.targetMapName ?? (selected.objectiveType === 'kill' ? selected.giverMapName : undefined), selected.targetX, selected.targetY))}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>提交地点</strong><span>${escapeHtml(this.formatQuestLocation(selected.submitMapName ?? selected.giverMapName, selected.submitX ?? selected.giverX, selected.submitY ?? selected.giverY))}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>当前进度</strong><div>${this.renderQuestText(this.resolveProgressText(selected), selected)}</div></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>下一步</strong><div>${this.renderQuestText(this.resolveNextStep(selected), selected)}</div></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>奖励</strong><div>${this.renderRewardContent(selected)}</div></div>
        <div class="ui-detail-field ui-detail-field--section ${selected.requiredItemId ? '' : 'hidden'}"><strong>任务需求</strong><div>${this.renderRequiredItemContent(selected)}</div></div>
      </div>
      <div class="ui-detail-field ui-detail-field--section ${selected.story ? '' : 'hidden'}"><strong>剧情</strong><div>${escapeHtml(selected.story ?? '')}</div></div>
      <div class="ui-detail-field ui-detail-field--section ${selected.objectiveText ? '' : 'hidden'}"><strong>任务说明</strong><div>${this.renderQuestText(selected.objectiveText ?? '', selected)}</div></div>
      <div class="ui-detail-field ui-detail-field--section ${selected.relayMessage ? '' : 'hidden'}"><strong>传话内容</strong><div>${this.renderQuestText(selected.relayMessage ?? '', selected)}</div></div>
      <div class="quest-detail-actions ui-action-row ui-action-row--end">
        ${actionButton}
        <button class="small-btn ghost" data-npc-quest-navigate="true" type="button" ${canNavigate ? '' : 'disabled'}>${navigateLabel}</button>
      </div>
    `;
  }

  /** bindEvents：绑定事件。 */
  private bindEvents(body: HTMLElement): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.delegatedEventsBound) {
      return;
    }
    this.delegatedEventsBound = true;
    body.addEventListener('click', (event) => this.handleBodyClick(event));
  }

  /** handleBodyClick：处理身体Click。 */
  private handleBodyClick(event: Event): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const selectButton = target.closest<HTMLElement>('[data-npc-quest-select]');
    if (selectButton) {
      const questId = selectButton.dataset.npcQuestSelect;
      if (!questId || questId === this.selectedQuestId) {
        return;
      }
      this.selectedQuestId = questId;
      this.render();
      return;
    }

    if (target.closest('[data-npc-quest-accept]')) {
      if (!this.activeNpcId || !this.selectedQuestId) {
        return;
      }
      this.callbacks?.onAcceptQuest(this.activeNpcId, this.selectedQuestId);
      return;
    }

    if (target.closest('[data-npc-quest-submit]')) {
      if (!this.activeNpcId || !this.selectedQuestId) {
        return;
      }
      this.callbacks?.onSubmitQuest(this.activeNpcId, this.selectedQuestId);
      return;
    }

    if (!target.closest('[data-npc-quest-navigate]') || !this.selectedQuestId) {
      return;
    }
    this.callbacks?.onNavigateQuest(this.selectedQuestId);
  }

  /** patchBody：处理patch身体。 */
  private patchBody(body: HTMLElement, meta: NpcQuestModalMeta): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!body.querySelector('.npc-quest-modal-shell')) {
      return false;
    }
    const selected = this.resolveSelectedQuest();
    const listRoot = body.querySelector<HTMLElement>('[data-npc-quest-list="true"]');
    const detailRoot = body.querySelector<HTMLElement>('[data-npc-quest-detail="true"]');
    if (!selected || !listRoot || !detailRoot) {
      return false;
    }
    detailModalHost.patch({
      ownerId: NpcQuestModal.MODAL_OWNER,
      title: meta.title,
      subtitle: meta.subtitle,
    });
    this.syncQuestList(listRoot, selected);
    this.syncQuestDetail(detailRoot, selected);
    bindInlineItemTooltips(body);
    return true;
  }

  /** captureRenderState：处理capture渲染状态。 */
  private captureRenderState(body: HTMLElement): NpcQuestRenderState {
    const activeElement = document.activeElement;
    return {
      listScrollTop: body.querySelector<HTMLElement>('[data-npc-quest-list="true"]')?.scrollTop ?? 0,
      detailScrollTop: body.querySelector<HTMLElement>('[data-npc-quest-detail="true"]')?.scrollTop ?? 0,
      focusSelector: activeElement instanceof HTMLElement && body.contains(activeElement)
        ? this.resolveFocusSelector(activeElement)
        : null,
    };
  }

  /** restoreRenderState：处理restore渲染状态。 */
  private restoreRenderState(body: HTMLElement, state: NpcQuestRenderState): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const listRoot = body.querySelector<HTMLElement>('[data-npc-quest-list="true"]');
    const detailRoot = body.querySelector<HTMLElement>('[data-npc-quest-detail="true"]');
    if (listRoot) {
      listRoot.scrollTop = state.listScrollTop;
    }
    if (detailRoot) {
      detailRoot.scrollTop = state.detailScrollTop;
    }
    if (!state.focusSelector) {
      return;
    }
    body.querySelector<HTMLElement>(state.focusSelector)?.focus({ preventScroll: true });
  }

  /** resolveFocusSelector：解析Focus Selector。 */
  private resolveFocusSelector(element: HTMLElement): string | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const questId = element.dataset.npcQuestSelect;
    if (questId) {
      return `[data-npc-quest-select="${escapeHtml(questId)}"]`;
    }
    if (element.hasAttribute('data-npc-quest-accept')) {
      return '[data-npc-quest-accept]';
    }
    if (element.hasAttribute('data-npc-quest-submit')) {
      return '[data-npc-quest-submit]';
    }
    if (element.hasAttribute('data-npc-quest-navigate')) {
      return '[data-npc-quest-navigate]';
    }
    return null;
  }

  /** resolveSelectedQuest：解析Selected任务。 */
  private resolveSelectedQuest(): QuestState | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.state || this.state.quests.length === 0) {
      return null;
    }
    return this.state.quests.find((quest) => quest.id === this.selectedQuestId) ?? this.state.quests[0] ?? null;
  }

  /** pickPreferredQuestId：处理pick Preferred任务ID。 */
  private pickPreferredQuestId(quests: QuestState[]): string | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const priority = ['ready', 'available', 'active', 'completed'] as const;
    for (const status of priority) {
      const matched = quests.find((quest) => quest.status === status);
      if (matched) {
        return matched.id;
      }
    }
    return quests[0]?.id ?? null;
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

  /** resolveProgressText：解析进度文本。 */
  private resolveProgressText(quest: QuestState): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    const current = Math.min(required, this.inventory.items.reduce((total, item) => (
      item.itemId === quest.requiredItemId ? total + item.count : total
    ), 0));
    return {
      itemName: getLocalItemTemplate(quest.requiredItemId)?.name ?? quest.requiredItemId,
      current,
      required,
    };
  }

  /** formatQuestLocation：格式化任务Location。 */
  private formatQuestLocation(mapName?: string, x?: number, y?: number): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (mapName && x !== undefined && y !== undefined) {
      return `${mapName} (${x}, ${y})`;
    }
    return mapName ?? '未设置';
  }

  /** renderQuestText：渲染任务文本。 */
  private renderQuestText(text: string, quest: QuestState): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!text.trim()) {
      return '';
    }
    if (quest.objectiveType !== 'kill' || !quest.targetMonsterId || !quest.targetName.trim()) {
      return renderTextWithInlineItemHighlights(text);
    }
    const token = '[[[QUEST_MONSTER_TARGET]]]';
    const normalized = text.replaceAll(quest.targetName, token);
    return renderTextWithInlineItemHighlights(normalized).replaceAll(token, renderInlineMonsterChip(quest.targetMonsterId, {
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
    const fallbackText = quest.rewards.map((reward) => `${reward.name} x${reward.count}`).join('、');
    const showRewardText = quest.rewardText.trim().length > 0
      && quest.rewardText.trim() !== '无'
      && quest.rewardText.trim() !== fallbackText;
    const sections: string[] = [];
    if (rewardChips) {
      sections.push(`<div class="ui-requirement-entry ui-surface-card ui-surface-card--compact"><div class="inline-item-flow">${rewardChips}</div></div>`);
    }
    if (showRewardText) {
      sections.push(`<div class="inline-rich-text">${renderTextWithInlineItemHighlights(quest.rewardText)}</div>`);
    }
    if (sections.length === 0) {
      sections.push('<div class="inline-rich-text">暂无额外奖励说明</div>');
    }
    return sections.join('');
  }

  /** renderRequiredItemContent：渲染Required物品Content。 */
  private renderRequiredItemContent(quest: QuestState): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const progress = this.resolveRequiredItemProgress(quest);
    if (!progress || !quest.requiredItemId) {
      return '<div class="inline-rich-text">当前任务无额外提交材料。</div>';
    }
    return `
      <div class="ui-requirement-entry ui-surface-card ui-surface-card--compact">
        <div class="ui-requirement-entry-head">
          <span class="ui-requirement-status ${progress.current >= progress.required ? 'is-completed' : 'is-unmet'}">当前持有 ${progress.current}/${progress.required}</span>
        </div>
        <div class="inline-item-flow">
          ${renderInlineItemChip(quest.requiredItemId, {
            count: progress.required,
            label: progress.itemName,
            tone: 'required',
          })}
        </div>
      </div>
    `;
  }
}
