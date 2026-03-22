/** 任务面板：按任务线分类展示，并支持全局单实例详情弹层 */

import { PlayerState, QuestState } from '@mud/shared';
import { detailModalHost } from '../detail-modal-host';
import { preserveSelection } from '../selection-preserver';

const STATUS_TEXT: Record<QuestState['status'], string> = {
  available: '可接取',
  active: '进行中',
  ready: '可交付',
  completed: '已完成',
};

const STATUS_CLASS: Record<QuestState['status'], string> = {
  available: 'status-available',
  active: 'status-active',
  ready: 'status-ready',
  completed: 'status-completed',
};

const LINE_TEXT: Record<QuestState['line'], string> = {
  main: '主线',
  side: '支线',
  daily: '日常',
  encounter: '奇遇',
};

const LINE_ORDER: QuestState['line'][] = ['main', 'side', 'daily', 'encounter'];
const STATUS_PRIORITY = { ready: 0, active: 1, available: 2, completed: 3 } as const;

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
  private currentMapId?: string;
  private onNavigateToQuestGiver: ((x: number, y: number) => void) | null = null;

  setCallbacks(onNavigateToQuestGiver: (x: number, y: number) => void): void {
    this.onNavigateToQuestGiver = onNavigateToQuestGiver;
  }

  setCurrentMapId(mapId?: string): void {
    this.currentMapId = mapId;
    this.renderModal();
  }

  /** 更新任务列表并刷新列表与弹层 */
  update(quests: QuestState[]): void {
    this.lastQuests = quests;
    this.renderList();
    this.renderModal();
  }

  initFromPlayer(player: PlayerState): void {
    this.currentMapId = player.mapId;
    this.update(player.quests ?? []);
  }

  clear(): void {
    this.lastQuests = [];
    this.selectedQuestId = undefined;
    this.hasUserSelectedLine = false;
    this.pane.innerHTML = '<div class="empty-hint">暂无任务，和 NPC 交互可接取</div>';
    detailModalHost.close(QuestPanel.MODAL_OWNER);
  }

  private renderList(): void {
    const quests = this.lastQuests;
    if (quests.length === 0) {
      this.selectedQuestId = undefined;
      this.pane.innerHTML = '<div class="empty-hint">暂无任务，和 NPC 交互可接取</div>';
      return;
    }

    const counts = this.buildCounts(quests);
    if (!this.hasUserSelectedLine && counts[this.activeLine] === 0) {
      this.activeLine = LINE_ORDER.find((line) => counts[line] > 0) ?? 'main';
    }
    if (this.selectedQuestId && !quests.some((quest) => quest.id === this.selectedQuestId)) {
      this.selectedQuestId = undefined;
    }

    const visibleQuests = [...quests]
      .filter((quest) => quest.line === this.activeLine)
      .sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]);

    const tabs = LINE_ORDER.map((line) => {
      const active = this.activeLine === line ? 'active' : '';
      return `<button class="quest-subtab-btn ${active}" data-quest-line="${line}" type="button">${LINE_TEXT[line]}<span class="quest-subtab-count">${counts[line]}</span></button>`;
    }).join('');

    let html = `<div class="panel-section">
      <div class="panel-section-title">任务簿</div>
      <div class="quest-subtabs">${tabs}</div>`;

    if (visibleQuests.length === 0) {
      html += `<div class="empty-hint">当前没有${LINE_TEXT[this.activeLine]}任务</div></div>`;
      preserveSelection(this.pane, () => {
        this.pane.innerHTML = html;
        this.bindListEvents();
      });
      return;
    }

    for (const quest of visibleQuests) {
      const percent = quest.required > 0 ? Math.min(100, Math.floor((quest.progress / quest.required) * 100)) : 0;
      const progressText = this.resolveProgressText(quest);
      const nextStep = this.resolveNextStep(quest);
      html += `<button class="quest-card quest-card-toggle" data-quest-id="${escapeHtml(quest.id)}" type="button">
        <div class="quest-title-row">
          <span class="quest-title">${escapeHtml(quest.title)}</span>
          <span class="quest-status ${STATUS_CLASS[quest.status]}">${STATUS_TEXT[quest.status]}</span>
        </div>
        ${quest.chapter ? `<div class="quest-meta">章节：${escapeHtml(quest.chapter)}</div>` : ''}
        <div class="quest-desc">${escapeHtml(quest.desc)}</div>
        <div class="quest-progress-label">目标：${escapeHtml(progressText)}</div>
        <div class="quest-progress-bar"><div class="quest-progress-fill" style="width:${percent}%"></div></div>
        <div class="quest-meta">下一步：${escapeHtml(nextStep)}</div>
        <div class="quest-expand-hint">点击查看详情</div>
      </button>`;
    }

    html += '</div>';
    preserveSelection(this.pane, () => {
      this.pane.innerHTML = html;
      this.bindListEvents();
    });
  }

  private bindListEvents(): void {
    this.pane.querySelectorAll<HTMLElement>('[data-quest-line]').forEach((button) => {
      button.addEventListener('click', () => {
        const line = button.dataset.questLine as QuestState['line'] | undefined;
        if (!line || line === this.activeLine) return;
        this.hasUserSelectedLine = true;
        this.activeLine = line;
        this.selectedQuestId = undefined;
        this.renderList();
        this.renderModal();
      });
    });

    this.pane.querySelectorAll<HTMLElement>('[data-quest-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const questId = button.dataset.questId;
        if (!questId) return;
        this.selectedQuestId = questId;
        this.renderModal();
      });
    });
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

    const canNavigateToGiver = Boolean(
      quest.giverMapId
      && this.currentMapId
      && quest.giverMapId === this.currentMapId
      && quest.giverX !== undefined
      && quest.giverY !== undefined,
    );
    const giverLocation = quest.giverMapName && quest.giverX !== undefined && quest.giverY !== undefined
      ? `${quest.giverMapName} (${quest.giverX}, ${quest.giverY})`
      : quest.giverMapName ?? '未知';

    detailModalHost.open({
      ownerId: QuestPanel.MODAL_OWNER,
      variantClass: 'detail-modal--quest',
      title: quest.title,
      subtitle: `${LINE_TEXT[quest.line]} · ${STATUS_TEXT[quest.status]}`,
      bodyHtml: `
        ${quest.chapter ? `<div class="quest-detail-section"><strong>章节</strong><span>${escapeHtml(quest.chapter)}</span></div>` : ''}
        <div class="quest-detail-section"><strong>任务描述</strong><span>${escapeHtml(quest.desc)}</span></div>
        ${quest.story ? `<div class="quest-detail-section"><strong>剧情</strong><span>${escapeHtml(quest.story)}</span></div>` : ''}
        <div class="quest-detail-grid">
          <div class="quest-detail-section"><strong>发布者</strong><span>${escapeHtml(quest.giverName)}</span></div>
          <div class="quest-detail-section">
            <strong>接取地点</strong>
            <div class="quest-detail-location-row">
              <span>${escapeHtml(giverLocation)}</span>
              <button
                class="small-btn ghost quest-detail-nav-btn"
                data-quest-navigate="true"
                type="button"
                ${canNavigateToGiver ? '' : 'disabled'}
              >前往</button>
            </div>
          </div>
          <div class="quest-detail-section"><strong>奖励</strong><span>${escapeHtml(quest.rewardText)}</span></div>
          <div class="quest-detail-section"><strong>当前进度</strong><span>${escapeHtml(this.resolveProgressText(quest))}</span></div>
          <div class="quest-detail-section"><strong>下一步</strong><span>${escapeHtml(this.resolveNextStep(quest))}</span></div>
        </div>
        ${quest.objectiveText ? `<div class="quest-detail-section"><strong>任务说明</strong><span>${escapeHtml(quest.objectiveText)}</span></div>` : ''}
      `,
      onClose: () => {
        this.selectedQuestId = undefined;
      },
      onAfterRender: (body) => {
        body.querySelector<HTMLElement>('[data-quest-navigate]')?.addEventListener('click', (event) => {
          event.stopPropagation();
          if (!canNavigateToGiver || quest.giverX === undefined || quest.giverY === undefined) return;
          this.onNavigateToQuestGiver?.(quest.giverX, quest.giverY);
        });
      },
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
    if (quest.objectiveType === 'learn_technique') {
      return `${quest.targetName} ${quest.progress >= quest.required ? '已参悟' : '未参悟'}`;
    }
    return `${quest.targetName} ${quest.progress}/${quest.required}`;
  }

  private resolveNextStep(quest: QuestState): string {
    if (quest.status === 'ready') {
      return '返回发布者交付任务';
    }
    if (quest.status === 'completed') {
      return '任务已结清';
    }
    if (quest.status === 'available') {
      return `前往 ${quest.giverName} 接取任务`;
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
}
