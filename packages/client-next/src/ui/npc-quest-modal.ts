import { Inventory, NEXT_S2C_NpcQuests, PlayerState, QuestState } from '@mud/shared-next';
import { getLocalItemTemplate } from '../content/local-templates';
import { getQuestLineLabel, getQuestStatusLabel } from '../domain-labels';
import { detailModalHost } from './detail-modal-host';
import { bindInlineItemTooltips, renderInlineItemChip, renderInlineMonsterChip, renderTextWithInlineItemHighlights } from './item-inline-tooltip';

/** escapeHtml：执行对应的业务逻辑。 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** NpcQuestModalCallbacks：定义该接口的能力与字段约束。 */
interface NpcQuestModalCallbacks {
  onRequestQuests: (npcId: string) => void;
  onAcceptQuest: (npcId: string, questId: string) => void;
  onSubmitQuest: (npcId: string, questId: string) => void;
  onNavigateQuest: (questId: string) => void;
}

/** NpcQuestModalMeta：定义该类型的结构与数据语义。 */
type NpcQuestModalMeta = {
/** title：定义该变量以承载业务值。 */
  title: string;
/** subtitle：定义该变量以承载业务值。 */
  subtitle: string;
};

/** NpcQuestRenderState：定义该类型的结构与数据语义。 */
type NpcQuestRenderState = {
/** listScrollTop：定义该变量以承载业务值。 */
  listScrollTop: number;
/** detailScrollTop：定义该变量以承载业务值。 */
  detailScrollTop: number;
/** focusSelector：定义该变量以承载业务值。 */
  focusSelector: string | null;
};

/** NpcQuestModal：封装相关状态与行为。 */
export class NpcQuestModal {
  private static readonly MODAL_OWNER = 'npc-quest-modal';
/** callbacks：定义该变量以承载业务值。 */
  private callbacks: NpcQuestModalCallbacks | null = null;
/** activeNpcId：定义该变量以承载业务值。 */
  private activeNpcId: string | null = null;
  private loading = false;
/** currentMapId：定义该变量以承载业务值。 */
  private currentMapId: string | undefined;
/** inventory：定义该变量以承载业务值。 */
  private inventory: Inventory = { items: [], capacity: 0 };
/** state：定义该变量以承载业务值。 */
  private state: NEXT_S2C_NpcQuests | null = null;
/** selectedQuestId：定义该变量以承载业务值。 */
  private selectedQuestId: string | null = null;
  private delegatedEventsBound = false;

/** setCallbacks：执行对应的业务逻辑。 */
  setCallbacks(callbacks: NpcQuestModalCallbacks): void {
    this.callbacks = callbacks;
  }

/** initFromPlayer：执行对应的业务逻辑。 */
  initFromPlayer(player: PlayerState): void {
    this.currentMapId = player.mapId;
    this.inventory = player.inventory;
  }

/** setCurrentMapId：执行对应的业务逻辑。 */
  setCurrentMapId(mapId?: string): void {
    this.currentMapId = mapId;
    if (detailModalHost.isOpenFor(NpcQuestModal.MODAL_OWNER)) {
      this.render();
    }
  }

/** syncInventory：执行对应的业务逻辑。 */
  syncInventory(inventory: Inventory): void {
    this.inventory = inventory;
    if (detailModalHost.isOpenFor(NpcQuestModal.MODAL_OWNER)) {
      this.render();
    }
  }

/** openPending：执行对应的业务逻辑。 */
  openPending(npcId: string): void {
    this.activeNpcId = npcId;
    this.loading = true;
    if (this.state?.npcId !== npcId) {
      this.state = null;
      this.selectedQuestId = null;
    }
    this.render();
  }

/** open：执行对应的业务逻辑。 */
  open(npcId: string): void {
    this.openPending(npcId);
    this.callbacks?.onRequestQuests(npcId);
  }

/** updateQuests：执行对应的业务逻辑。 */
  updateQuests(data: NEXT_S2C_NpcQuests): void {
    if (this.activeNpcId && this.activeNpcId !== data.npcId && detailModalHost.isOpenFor(NpcQuestModal.MODAL_OWNER)) {
      return;
    }
    this.activeNpcId = data.npcId;
    this.state = data;
    this.loading = false;
/** questIds：定义该变量以承载业务值。 */
    const questIds = new Set(data.quests.map((quest) => quest.id));
    if (!this.selectedQuestId || !questIds.has(this.selectedQuestId)) {
      this.selectedQuestId = this.pickPreferredQuestId(data.quests);
    }
    this.render();
  }

/** refreshActive：执行对应的业务逻辑。 */
  refreshActive(): void {
    if (!this.activeNpcId) {
      return;
    }
    this.callbacks?.onRequestQuests(this.activeNpcId);
  }

/** getActiveNpcId：执行对应的业务逻辑。 */
  getActiveNpcId(): string | null {
    return this.activeNpcId;
  }

/** clear：执行对应的业务逻辑。 */
  clear(): void {
    this.activeNpcId = null;
    this.loading = false;
    this.state = null;
    this.selectedQuestId = null;
    this.inventory = { items: [], capacity: 0 };
    detailModalHost.close(NpcQuestModal.MODAL_OWNER);
  }

/** render：执行对应的业务逻辑。 */
  private render(): void {
/** meta：定义该变量以承载业务值。 */
    const meta = this.buildModalMeta();
/** body：定义该变量以承载业务值。 */
    const body = detailModalHost.isOpenFor(NpcQuestModal.MODAL_OWNER)
      ? document.getElementById('detail-modal-body')
      : null;
/** renderState：定义该变量以承载业务值。 */
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
      bodyHtml: this.renderBody(),
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

/** buildModalMeta：执行对应的业务逻辑。 */
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

/** renderBody：执行对应的业务逻辑。 */
  private renderBody(): string {
    if (this.loading && !this.state) {
      return '<div class="empty-hint">正在与这位 NPC 对话……</div>';
    }
    if (!this.state) {
      return '<div class="empty-hint">暂时无法读取任务列表。</div>';
    }
    if (this.state.quests.length === 0) {
      return `<div class="empty-hint">${escapeHtml(this.state.npcName)} 目前没有新的委托。</div>`;
    }

/** selected：定义该变量以承载业务值。 */
    const selected = this.resolveSelectedQuest();
    if (!selected) {
      return '<div class="empty-hint">暂时无法读取任务详情。</div>';
    }

    return `
      <div class="npc-quest-modal-shell">
        <div class="npc-quest-list" data-npc-quest-list="true">${this.renderQuestList(selected)}</div>
        <div data-npc-quest-detail="true">
          ${this.renderQuestDetail(selected)}
        </div>
      </div>
    `;
  }

/** renderQuestList：执行对应的业务逻辑。 */
  private renderQuestList(selected: QuestState): string {
    return this.state?.quests.map((quest) => {
/** activeClass：定义该变量以承载业务值。 */
      const activeClass = quest.id === selected.id ? ' is-active' : '';
      return `<button class="quest-card quest-card-toggle npc-quest-card${activeClass}" data-npc-quest-select="${escapeHtml(quest.id)}" type="button">
        <div class="quest-title-row">
          <span class="quest-title">${escapeHtml(quest.title)}</span>
          <span class="quest-status">${escapeHtml(getQuestStatusLabel(quest.status))}</span>
        </div>
        <div class="quest-meta">${escapeHtml(getQuestLineLabel(quest.line))}</div>
        <div class="quest-desc">${this.renderQuestText(quest.desc, quest)}</div>
      </button>`;
    }).join('') ?? '';
  }

/** renderQuestDetail：执行对应的业务逻辑。 */
  private renderQuestDetail(selected: QuestState): string {
/** canNavigate：定义该变量以承载业务值。 */
    const canNavigate = this.canNavigateQuest(selected);
/** navigateLabel：定义该变量以承载业务值。 */
    const navigateLabel = selected.status === 'ready' ? '前往交付' : '前往目标';
/** actionButton：定义该变量以承载业务值。 */
    const actionButton = selected.status === 'available'
      ? '<button class="small-btn primary" data-npc-quest-accept="true" type="button">接取任务</button>'
      : selected.status === 'ready'
        ? '<button class="small-btn primary" data-npc-quest-submit="true" type="button">提交任务</button>'
        : '';
    return `
      <div class="quest-detail-section"><strong>任务描述</strong><div>${this.renderQuestText(selected.desc, selected)}</div></div>
      <div class="quest-detail-grid">
        <div class="quest-detail-section"><strong>发布者</strong><span>${escapeHtml(selected.giverName)}</span></div>
        <div class="quest-detail-section"><strong>当前状态</strong><span>${escapeHtml(getQuestStatusLabel(selected.status))}</span></div>
        <div class="quest-detail-section"><strong>目标地点</strong><span>${escapeHtml(this.formatQuestLocation(selected.targetMapName ?? (selected.objectiveType === 'kill' ? selected.giverMapName : undefined), selected.targetX, selected.targetY))}</span></div>
        <div class="quest-detail-section"><strong>提交地点</strong><span>${escapeHtml(this.formatQuestLocation(selected.submitMapName ?? selected.giverMapName, selected.submitX ?? selected.giverX, selected.submitY ?? selected.giverY))}</span></div>
        <div class="quest-detail-section"><strong>当前进度</strong><div>${this.renderQuestText(this.resolveProgressText(selected), selected)}</div></div>
        <div class="quest-detail-section"><strong>下一步</strong><div>${this.renderQuestText(this.resolveNextStep(selected), selected)}</div></div>
        <div class="quest-detail-section"><strong>奖励</strong><div>${this.renderRewardContent(selected)}</div></div>
        <div class="quest-detail-section ${selected.requiredItemId ? '' : 'hidden'}"><strong>任务需求</strong><div>${this.renderRequiredItemContent(selected)}</div></div>
      </div>
      <div class="quest-detail-section ${selected.story ? '' : 'hidden'}"><strong>剧情</strong><div>${escapeHtml(selected.story ?? '')}</div></div>
      <div class="quest-detail-section ${selected.objectiveText ? '' : 'hidden'}"><strong>任务说明</strong><div>${this.renderQuestText(selected.objectiveText ?? '', selected)}</div></div>
      <div class="quest-detail-section ${selected.relayMessage ? '' : 'hidden'}"><strong>传话内容</strong><div>${this.renderQuestText(selected.relayMessage ?? '', selected)}</div></div>
      <div class="quest-detail-actions">
        ${actionButton}
        <button class="small-btn ghost" data-npc-quest-navigate="true" type="button" ${canNavigate ? '' : 'disabled'}>${navigateLabel}</button>
      </div>
    `;
  }

/** bindEvents：执行对应的业务逻辑。 */
  private bindEvents(body: HTMLElement): void {
    if (this.delegatedEventsBound) {
      return;
    }
    this.delegatedEventsBound = true;
    body.addEventListener('click', (event) => this.handleBodyClick(event));
  }

/** handleBodyClick：执行对应的业务逻辑。 */
  private handleBodyClick(event: Event): void {
/** target：定义该变量以承载业务值。 */
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

/** selectButton：定义该变量以承载业务值。 */
    const selectButton = target.closest<HTMLElement>('[data-npc-quest-select]');
    if (selectButton) {
/** questId：定义该变量以承载业务值。 */
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

/** patchBody：执行对应的业务逻辑。 */
  private patchBody(body: HTMLElement, meta: NpcQuestModalMeta): boolean {
    if (!body.querySelector('.npc-quest-modal-shell')) {
      return false;
    }
/** selected：定义该变量以承载业务值。 */
    const selected = this.resolveSelectedQuest();
/** listRoot：定义该变量以承载业务值。 */
    const listRoot = body.querySelector<HTMLElement>('[data-npc-quest-list="true"]');
/** detailRoot：定义该变量以承载业务值。 */
    const detailRoot = body.querySelector<HTMLElement>('[data-npc-quest-detail="true"]');
    if (!selected || !listRoot || !detailRoot) {
      return false;
    }
    this.patchModalMeta(meta);
    listRoot.innerHTML = this.renderQuestList(selected);
    detailRoot.innerHTML = this.renderQuestDetail(selected);
    bindInlineItemTooltips(body);
    return true;
  }

/** patchModalMeta：执行对应的业务逻辑。 */
  private patchModalMeta(meta: NpcQuestModalMeta): void {
/** titleNode：定义该变量以承载业务值。 */
    const titleNode = document.getElementById('detail-modal-title');
/** subtitleNode：定义该变量以承载业务值。 */
    const subtitleNode = document.getElementById('detail-modal-subtitle');
    if (titleNode) {
      titleNode.textContent = meta.title;
    }
    if (subtitleNode) {
      subtitleNode.textContent = meta.subtitle;
      subtitleNode.classList.toggle('hidden', meta.subtitle.length === 0);
    }
  }

/** captureRenderState：执行对应的业务逻辑。 */
  private captureRenderState(body: HTMLElement): NpcQuestRenderState {
/** activeElement：定义该变量以承载业务值。 */
    const activeElement = document.activeElement;
    return {
/** listScrollTop：定义该变量以承载业务值。 */
      listScrollTop: body.querySelector<HTMLElement>('[data-npc-quest-list="true"]')?.scrollTop ?? 0,
/** detailScrollTop：定义该变量以承载业务值。 */
      detailScrollTop: body.querySelector<HTMLElement>('[data-npc-quest-detail="true"]')?.scrollTop ?? 0,
      focusSelector: activeElement instanceof HTMLElement && body.contains(activeElement)
        ? this.resolveFocusSelector(activeElement)
        : null,
    };
  }

/** restoreRenderState：执行对应的业务逻辑。 */
  private restoreRenderState(body: HTMLElement, state: NpcQuestRenderState): void {
/** listRoot：定义该变量以承载业务值。 */
    const listRoot = body.querySelector<HTMLElement>('[data-npc-quest-list="true"]');
/** detailRoot：定义该变量以承载业务值。 */
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

/** resolveFocusSelector：执行对应的业务逻辑。 */
  private resolveFocusSelector(element: HTMLElement): string | null {
/** questId：定义该变量以承载业务值。 */
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

/** resolveSelectedQuest：执行对应的业务逻辑。 */
  private resolveSelectedQuest(): QuestState | null {
    if (!this.state || this.state.quests.length === 0) {
      return null;
    }
    return this.state.quests.find((quest) => quest.id === this.selectedQuestId) ?? this.state.quests[0] ?? null;
  }

/** pickPreferredQuestId：执行对应的业务逻辑。 */
  private pickPreferredQuestId(quests: QuestState[]): string | null {
/** priority：定义该变量以承载业务值。 */
    const priority = ['ready', 'available', 'active', 'completed'] as const;
    for (const status of priority) {
      const matched = quests.find((quest) => quest.status === status);
      if (matched) {
        return matched.id;
      }
    }
    return quests[0]?.id ?? null;
  }

/** canNavigateQuest：执行对应的业务逻辑。 */
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

/** resolveProgressText：执行对应的业务逻辑。 */
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
/** requiredItemProgress：定义该变量以承载业务值。 */
    const requiredItemProgress = this.resolveRequiredItemProgress(quest);
    if (quest.objectiveType === 'kill' && requiredItemProgress) {
      return `${quest.targetName} ${quest.progress}/${quest.required}，${requiredItemProgress.itemName} ${requiredItemProgress.current}/${requiredItemProgress.required}`;
    }
    return `${quest.targetName} ${quest.progress}/${quest.required}`;
  }

/** resolveNextStep：执行对应的业务逻辑。 */
  private resolveNextStep(quest: QuestState): string {
    if (quest.status === 'ready') {
/** submitLabel：定义该变量以承载业务值。 */
      const submitLabel = quest.submitNpcName ?? quest.giverName;
/** submitLocation：定义该变量以承载业务值。 */
      const submitLocation = this.formatQuestLocation(quest.submitMapName ?? quest.giverMapName, quest.submitX ?? quest.giverX, quest.submitY ?? quest.giverY);
      return submitLocation !== '未设置'
        ? `前往 ${submitLocation} 找 ${submitLabel} 交付任务`
        : `前往 ${submitLabel} 交付任务`;
    }
    if (quest.status === 'completed') {
      return '任务已结清';
    }
    if (quest.status === 'available') {
/** giverLocation：定义该变量以承载业务值。 */
      const giverLocation = this.formatQuestLocation(quest.giverMapName, quest.giverX, quest.giverY);
      return giverLocation !== '未设置'
        ? `前往 ${giverLocation} 找 ${quest.giverName} 接取任务`
        : `前往 ${quest.giverName} 接取任务`;
    }
    if (quest.objectiveType === 'talk') {
/** talkTarget：定义该变量以承载业务值。 */
      const talkTarget = quest.targetNpcName ?? quest.targetName;
/** talkLocation：定义该变量以承载业务值。 */
      const talkLocation = this.formatQuestLocation(quest.targetMapName, quest.targetX, quest.targetY);
      return talkLocation !== '未设置'
        ? `前往 ${talkLocation} 找 ${talkTarget} 传达口信`
        : `前往 ${talkTarget} 传达口信`;
    }
    if (quest.objectiveType === 'submit_item') {
/** submitLocation：定义该变量以承载业务值。 */
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
/** requiredItemProgress：定义该变量以承载业务值。 */
    const requiredItemProgress = this.resolveRequiredItemProgress(quest);
    if (quest.objectiveType === 'kill' && requiredItemProgress) {
      if (quest.progress >= quest.required && requiredItemProgress.current < requiredItemProgress.required) {
        return `继续收集 ${requiredItemProgress.itemName} (${requiredItemProgress.current}/${requiredItemProgress.required})`;
      }
/** targetLocation：定义该变量以承载业务值。 */
      const targetLocation = this.formatQuestLocation(quest.targetMapName ?? quest.giverMapName, quest.targetX, quest.targetY);
      return targetLocation !== '未设置'
        ? `前往 ${targetLocation} 击杀 ${quest.targetName}，并收集 ${requiredItemProgress.itemName}`
        : `前往击杀 ${quest.targetName}，并收集 ${requiredItemProgress.itemName}`;
    }
/** targetLocation：定义该变量以承载业务值。 */
    const targetLocation = this.formatQuestLocation(quest.targetMapName ?? quest.giverMapName, quest.targetX, quest.targetY);
    return targetLocation !== '未设置'
      ? `前往 ${targetLocation} 击杀 ${quest.targetName}`
      : `前往击杀 ${quest.targetName}`;
  }

  private resolveRequiredItemProgress(quest: QuestState): { itemName: string; current: number; required: number } | null {
    if (!quest.requiredItemId) {
      return null;
    }
/** required：定义该变量以承载业务值。 */
    const required = Math.max(1, quest.requiredItemCount ?? 1);
/** current：定义该变量以承载业务值。 */
    const current = Math.min(required, this.inventory.items.reduce((total, item) => (
      item.itemId === quest.requiredItemId ? total + item.count : total
    ), 0));
    return {
      itemName: getLocalItemTemplate(quest.requiredItemId)?.name ?? quest.requiredItemId,
      current,
      required,
    };
  }

/** formatQuestLocation：执行对应的业务逻辑。 */
  private formatQuestLocation(mapName?: string, x?: number, y?: number): string {
    if (mapName && x !== undefined && y !== undefined) {
      return `${mapName} (${x}, ${y})`;
    }
    return mapName ?? '未设置';
  }

/** renderQuestText：执行对应的业务逻辑。 */
  private renderQuestText(text: string, quest: QuestState): string {
    if (!text.trim()) {
      return '';
    }
    if (quest.objectiveType !== 'kill' || !quest.targetMonsterId || !quest.targetName.trim()) {
      return renderTextWithInlineItemHighlights(text);
    }
/** token：定义该变量以承载业务值。 */
    const token = '[[[QUEST_MONSTER_TARGET]]]';
/** normalized：定义该变量以承载业务值。 */
    const normalized = text.replaceAll(quest.targetName, token);
    return renderTextWithInlineItemHighlights(normalized).replaceAll(token, renderInlineMonsterChip(quest.targetMonsterId, {
      label: quest.targetName,
    }));
  }

/** renderRewardContent：执行对应的业务逻辑。 */
  private renderRewardContent(quest: QuestState): string {
/** rewardChips：定义该变量以承载业务值。 */
    const rewardChips = quest.rewards
      .map((reward) => renderInlineItemChip(reward.itemId, {
        count: reward.count,
        label: reward.name,
        tone: 'reward',
      }))
      .join('');
/** fallbackText：定义该变量以承载业务值。 */
    const fallbackText = quest.rewards.map((reward) => `${reward.name} x${reward.count}`).join('、');
/** showRewardText：定义该变量以承载业务值。 */
    const showRewardText = quest.rewardText.trim().length > 0
      && quest.rewardText.trim() !== '无'
      && quest.rewardText.trim() !== fallbackText;
/** sections：定义该变量以承载业务值。 */
    const sections: string[] = [];
    if (rewardChips) {
      sections.push(`<div class="inline-item-flow">${rewardChips}</div>`);
    }
    if (showRewardText) {
      sections.push(`<div class="inline-rich-text">${renderTextWithInlineItemHighlights(quest.rewardText)}</div>`);
    }
    if (sections.length === 0) {
      sections.push('<div class="inline-rich-text">暂无额外奖励说明</div>');
    }
    return sections.join('');
  }

/** renderRequiredItemContent：执行对应的业务逻辑。 */
  private renderRequiredItemContent(quest: QuestState): string {
/** progress：定义该变量以承载业务值。 */
    const progress = this.resolveRequiredItemProgress(quest);
    if (!progress || !quest.requiredItemId) {
      return '<div class="inline-rich-text">当前任务无额外提交材料。</div>';
    }
    return `
      <div class="inline-item-flow">
        ${renderInlineItemChip(quest.requiredItemId, {
          count: progress.required,
          label: progress.itemName,
          tone: 'required',
        })}
      </div>
      <div class="inline-rich-text">当前持有 ${progress.current}/${progress.required}</div>
    `;
  }
}

