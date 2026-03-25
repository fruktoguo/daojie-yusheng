/** 任务面板：按任务线分类展示，并支持全局单实例详情弹层 */

import { PlayerState, QuestState } from '@mud/shared';
import { detailModalHost } from '../detail-modal-host';
import { preserveSelection } from '../selection-preserver';
import { getQuestLineLabel, getQuestStatusLabel } from '../../domain-labels';
import {
  LINE_ORDER,
  STATUS_CLASS,
  STATUS_PRIORITY,
} from '../../constants/ui/quest-panel';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** 任务面板：按任务线分类展示，并支持全局单实例详情弹层 */
export class QuestPanel {
  private static readonly MODAL_OWNER = 'quest-panel';
  private pane = document.getElementById('pane-quest')!;
  private activeLine: QuestState['line'] = 'main';
  private selectedQuestId?: string;
  private hasUserSelectedLine = false;
  private lastQuests: QuestState[] = [];
  private lastStructureKey: string | null = null;
  private currentMapId?: string;
  private onNavigateQuest: ((questId: string) => void) | null = null;

  constructor() {
    this.bindPaneEvents();
  }

  setCallbacks(onNavigateQuest: (questId: string) => void): void {
    this.onNavigateQuest = onNavigateQuest;
  }

  setCurrentMapId(mapId?: string): void {
    this.currentMapId = mapId;
    if (!this.patchModal()) {
      this.renderModal();
    }
  }

  /** 更新任务列表并刷新列表与弹层 */
  update(quests: QuestState[]): void {
    this.lastQuests = quests;
    this.normalizeState(quests);
    const structureKey = this.buildStructureKey(quests);
    if (this.lastStructureKey !== structureKey || !this.patchList()) {
      this.renderList();
    }
    if (!this.patchModal()) {
      this.renderModal();
    }
  }

  initFromPlayer(player: PlayerState): void {
    this.currentMapId = player.mapId;
    this.update(player.quests ?? []);
  }

  clear(): void {
    this.lastQuests = [];
    this.lastStructureKey = null;
    this.selectedQuestId = undefined;
    this.hasUserSelectedLine = false;
    this.pane.innerHTML = '<div class="empty-hint">暂无任务，和 NPC 交互可接取</div>';
    detailModalHost.close(QuestPanel.MODAL_OWNER);
  }

  closeDetail(): void {
    this.selectedQuestId = undefined;
    detailModalHost.close(QuestPanel.MODAL_OWNER);
  }

  private renderList(): void {
    const quests = this.lastQuests;
    if (quests.length === 0) {
      this.selectedQuestId = undefined;
      this.lastStructureKey = this.buildStructureKey(quests);
      this.pane.innerHTML = '<div class="empty-hint">暂无任务，和 NPC 交互可接取</div>';
      return;
    }

    const counts = this.buildCounts(quests);
    const visibleQuests = this.getVisibleQuests(quests);
    this.lastStructureKey = this.buildStructureKey(quests);

    const tabs = LINE_ORDER.map((line) => {
      const active = this.activeLine === line ? 'active' : '';
      return `<button class="quest-subtab-btn ${active}" data-quest-line="${line}" type="button">${getQuestLineLabel(line)}<span class="quest-subtab-count" data-quest-line-count="${line}">${counts[line]}</span></button>`;
    }).join('');

    let html = `<div class="panel-section">
      <div class="panel-section-title">任务簿</div>
      <div class="quest-subtabs">${tabs}</div>`;

    if (visibleQuests.length === 0) {
      html += `<div class="empty-hint" data-quest-empty="true">当前没有${getQuestLineLabel(this.activeLine)}任务</div></div>`;
      preserveSelection(this.pane, () => {
        this.pane.innerHTML = html;
      });
      return;
    }

    for (const quest of visibleQuests) {
      const percent = quest.required > 0 ? Math.min(100, Math.floor((quest.progress / quest.required) * 100)) : 0;
      const progressText = this.resolveProgressText(quest);
      const nextStep = this.resolveNextStep(quest);
      html += `<button class="quest-card quest-card-toggle" data-quest-id="${escapeHtml(quest.id)}" type="button">
        <div class="quest-title-row">
          <span class="quest-title" data-quest-title="true">${escapeHtml(quest.title)}</span>
      <span class="quest-status ${STATUS_CLASS[quest.status]}" data-quest-status="true">${getQuestStatusLabel(quest.status)}</span>
        </div>
        <div class="quest-meta ${quest.chapter ? '' : 'hidden'}" data-quest-chapter="true">章节：${escapeHtml(quest.chapter ?? '')}</div>
        <div class="quest-desc" data-quest-desc="true">${escapeHtml(quest.desc)}</div>
        <div class="quest-progress-label" data-quest-progress-label="true">目标：${escapeHtml(progressText)}</div>
        <div class="quest-progress-bar"><div class="quest-progress-fill" data-quest-progress-fill="true" style="width:${percent}%"></div></div>
        <div class="quest-meta" data-quest-next-step="true">下一步：${escapeHtml(nextStep)}</div>
        <div class="quest-expand-hint">点击查看详情</div>
      </button>`;
    }

    html += '</div>';
    preserveSelection(this.pane, () => {
      this.pane.innerHTML = html;
    });
  }

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

  private patchList(): boolean {
    const quests = this.lastQuests;
    if (quests.length === 0) {
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
    if (visibleQuests.length === 0) {
      const emptyNode = this.pane.querySelector<HTMLElement>('[data-quest-empty="true"]');
      if (!emptyNode) {
        return false;
      }
      emptyNode.textContent = `当前没有${getQuestLineLabel(this.activeLine)}任务`;
      this.lastStructureKey = this.buildStructureKey(quests);
      return true;
    }

    for (const quest of visibleQuests) {
      const card = this.pane.querySelector<HTMLElement>(`[data-quest-id="${CSS.escape(quest.id)}"]`);
      if (!card) {
        return false;
      }
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
      titleNode.textContent = quest.title;
      statusNode.textContent = getQuestStatusLabel(quest.status);
      statusNode.className = `quest-status ${STATUS_CLASS[quest.status]}`;
      chapterNode.textContent = `章节：${quest.chapter ?? ''}`;
      chapterNode.classList.toggle('hidden', !quest.chapter);
      descNode.textContent = quest.desc;
      progressLabelNode.textContent = `目标：${this.resolveProgressText(quest)}`;
      progressFillNode.style.width = `${percent}%`;
      nextStepNode.textContent = `下一步：${this.resolveNextStep(quest)}`;
    }

    this.lastStructureKey = this.buildStructureKey(quests);
    return true;
  }

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
      variantClass: 'detail-modal--quest',
      title: quest.title,
      subtitle: `${getQuestLineLabel(quest.line)} · ${getQuestStatusLabel(quest.status)}`,
      bodyHtml: `
        <div class="quest-detail-section ${quest.chapter ? '' : 'hidden'}" data-quest-modal-chapter-section="true"><strong>章节</strong><span data-quest-modal-chapter="true">${escapeHtml(quest.chapter ?? '')}</span></div>
        <div class="quest-detail-section"><strong>任务描述</strong><span data-quest-modal-desc="true">${escapeHtml(quest.desc)}</span></div>
        <div class="quest-detail-section ${quest.story ? '' : 'hidden'}" data-quest-modal-story-section="true"><strong>剧情</strong><span data-quest-modal-story="true">${escapeHtml(quest.story ?? '')}</span></div>
        <div class="quest-detail-grid">
          <div class="quest-detail-section"><strong>发布者</strong><span data-quest-modal-giver="true">${escapeHtml(quest.giverName)}</span></div>
          <div class="quest-detail-section">
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
          <div class="quest-detail-section"><strong>任务目标</strong><span data-quest-modal-target-location="true">${escapeHtml(targetLocation)}</span></div>
          <div class="quest-detail-section"><strong>提交地点</strong><span data-quest-modal-submit-location="true">${escapeHtml(submitLocation)}</span></div>
          <div class="quest-detail-section"><strong>奖励</strong><span data-quest-modal-reward="true">${escapeHtml(quest.rewardText)}</span></div>
          <div class="quest-detail-section"><strong>当前进度</strong><span data-quest-modal-progress="true">${escapeHtml(this.resolveProgressText(quest))}</span></div>
          <div class="quest-detail-section"><strong>下一步</strong><span data-quest-modal-next-step="true">${escapeHtml(this.resolveNextStep(quest))}</span></div>
        </div>
        <div class="quest-detail-section ${quest.objectiveText ? '' : 'hidden'}" data-quest-modal-objective-section="true"><strong>任务说明</strong><span data-quest-modal-objective="true">${escapeHtml(quest.objectiveText ?? '')}</span></div>
        <div class="quest-detail-section ${quest.relayMessage ? '' : 'hidden'}" data-quest-modal-relay-section="true"><strong>传话内容</strong><span data-quest-modal-relay="true">${escapeHtml(quest.relayMessage ?? '')}</span></div>
      `,
      onClose: () => {
        this.selectedQuestId = undefined;
      },
      onAfterRender: (body) => {
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
    descNode.textContent = quest.desc;
    storySection.classList.toggle('hidden', !quest.story);
    storyNode.textContent = quest.story ?? '';
    giverNode.textContent = quest.giverName;
    locationNode.textContent = giverLocation;
    navigateButton.disabled = !canNavigateQuest;
    navigateButton.dataset.questId = quest.id;
    navigateButton.dataset.questCanNavigate = canNavigateQuest ? '1' : '0';
    navigateButton.textContent = quest.status === 'ready' ? '前往交付' : '前往目标';
    rewardNode.textContent = quest.rewardText;
    progressNode.textContent = this.resolveProgressText(quest);
    nextStepNode.textContent = this.resolveNextStep(quest);
    objectiveSection.classList.toggle('hidden', !quest.objectiveText);
    objectiveNode.textContent = quest.objectiveText ?? '';
    targetLocationNode.textContent = targetLocation;
    submitLocationNode.textContent = submitLocation;
    relaySection.classList.toggle('hidden', !quest.relayMessage);
    relayNode.textContent = quest.relayMessage ?? '';
    return true;
  }

  private normalizeState(quests: QuestState[]): void {
    const counts = this.buildCounts(quests);
    if (!this.hasUserSelectedLine && counts[this.activeLine] === 0) {
      this.activeLine = LINE_ORDER.find((line) => counts[line] > 0) ?? 'main';
    }
    if (this.selectedQuestId && !quests.some((quest) => quest.id === this.selectedQuestId)) {
      this.selectedQuestId = undefined;
    }
  }

  private getVisibleQuests(quests: QuestState[]): QuestState[] {
    return [...quests]
      .filter((quest) => quest.line === this.activeLine)
      .sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]);
  }

  private buildStructureKey(quests: QuestState[]): string {
    return JSON.stringify({
      activeLine: this.activeLine,
      quests: this.getVisibleQuests(quests).map((quest) => quest.id),
    });
  }

  private buildCounts(quests: QuestState[]): Record<QuestState['line'], number> {
    return {
      main: quests.filter((quest) => quest.line === 'main').length,
      side: quests.filter((quest) => quest.line === 'side').length,
      daily: quests.filter((quest) => quest.line === 'daily').length,
      encounter: quests.filter((quest) => quest.line === 'encounter').length,
    };
  }

  private resolveProgressText(quest: QuestState): string {
    if (quest.objectiveType === 'talk') {
      return quest.progress >= quest.required ? '口信已传达' : '尚未传达';
    }
    if (quest.objectiveType === 'learn_technique') {
      return `${quest.targetName} ${quest.progress >= quest.required ? '已参悟' : '未参悟'}`;
    }
    return `${quest.targetName} ${quest.progress}/${quest.required}`;
  }

  private resolveNextStep(quest: QuestState): string {
    if (quest.status === 'ready') {
      return `前往 ${quest.submitNpcName ?? quest.giverName} 交付任务`;
    }
    if (quest.status === 'completed') {
      return '任务已结清';
    }
    if (quest.status === 'available') {
      return `前往 ${quest.giverName} 接取任务`;
    }
    if (quest.objectiveType === 'talk') {
      return `前往 ${quest.targetNpcName ?? quest.targetName} 传达口信`;
    }
    if (quest.objectiveType === 'submit_item') {
      return `准备 ${quest.targetName} 并前往交付`;
    }
    if (quest.objectiveType === 'learn_technique') {
      return `使用技能书并学会 ${quest.targetName}`;
    }
    if (quest.objectiveType === 'realm_progress') {
      return `前往历练并击败敌人，继续积累 ${quest.targetName}`;
    }
    if (quest.objectiveType === 'realm_stage') {
      return `继续历练、积累境界经验并突破至 ${quest.targetName}`;
    }
    return `前往击杀 ${quest.targetName}`;
  }

  private formatQuestLocation(mapName?: string, x?: number, y?: number): string {
    if (mapName && x !== undefined && y !== undefined) {
      return `${mapName} (${x}, ${y})`;
    }
    return mapName ?? '未设置';
  }

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
}
