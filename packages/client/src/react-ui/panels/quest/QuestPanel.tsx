/**
 * 本文件负责 任务 面板的主要 React 视图入口，统一承接状态展示、用户操作回调和样式组合。
 *
 * 维护时要保持它只处理前端表现和组件契约，不保存业务真源，也不绕过共享规则或服务端权威运行时。
 */
import { memo, useCallback, useMemo, useState } from 'react';
import type { Inventory, QuestState } from '@mud/shared';
import { getLocalItemTemplate } from '../../../content/local-templates';
import { getQuestLineLabel, getQuestStatusLabel } from '../../../domain-labels';
import {
  LINE_ORDER,
  STATUS_CLASS,
  STATUS_PRIORITY,
} from '../../../constants/ui/quest-panel';
import { createPanelStore } from '../../stores/create-panel-store';
import { UiInlineReferenceText, type UiInlineReference } from '../../primitives/UiInlineReferenceText';
import { t } from '../../../ui/i18n';

const UNKNOWN_QUEST_ITEM_NAME = t('common.unknown-item');

function resolveQuestRequiredItemName(itemId: string): string {
  return getLocalItemTemplate(itemId)?.name?.trim() || UNKNOWN_QUEST_ITEM_NAME;
}

// ─── Store ───────────────────────────────────────────────────────────────────

interface QuestPanelState {
  quests: QuestState[];
  inventory: Inventory | null;
}

export const { store: questPanelStore, useStore: useQuestPanelStore } = createPanelStore<QuestPanelState>({
  quests: [],
  inventory: null,
});

// ─── Callbacks ───────────────────────────────────────────────────────────────

interface QuestPanelCallbacks {
  onNavigateQuest: ((questId: string) => void) | null;
  onOpenDetail: ((questId: string) => void) | null;
  onOpenGuideFlow: ((flowId: string) => void) | null;
}

const callbacks: QuestPanelCallbacks = {
  onNavigateQuest: null,
  onOpenDetail: null,
  onOpenGuideFlow: null,
};

export function setQuestPanelCallbacks(cbs: Partial<QuestPanelCallbacks>): void {
  Object.assign(callbacks, cbs);
}

// ─── 纯逻辑 ──────────────────────────────────────────────────────────────────

function buildCounts(quests: QuestState[]): Record<QuestState['line'], number> {
  return {
    main: quests.filter((q) => q.line === 'main').length,
    side: quests.filter((q) => q.line === 'side').length,
    daily: quests.filter((q) => q.line === 'daily').length,
    encounter: quests.filter((q) => q.line === 'encounter').length,
  };
}

function getVisibleQuests(quests: QuestState[], activeLine: QuestState['line']): QuestState[] {
  return [...quests]
    .filter((q) => q.line === activeLine)
    .sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]);
}

function formatQuestLocation(mapName?: string, x?: number, y?: number): string {
  if (mapName && x !== undefined && y !== undefined) {
    return `${mapName} (${x}, ${y})`;
  }
  return mapName ?? t('quest.location.unset', undefined);
}

function isUnsetLocation(location: string): boolean {
  return location === t('quest.location.unset', undefined);
}

function canNavigateQuest(quest: QuestState): boolean {
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

function resolveNavigateLabel(quest: QuestState): string {
  return quest.status === 'ready'
    ? t('quest.action.navigate-submit', undefined)
    : t('quest.action.navigate-target', undefined);
}

function getInventoryItemCount(inventory: Inventory | null, itemId: string): number {
  if (!inventory) return 0;
  return inventory.items.reduce((total, item) => (
    item.itemId === itemId ? total + item.count : total
  ), 0);
}

function resolveRequiredItemProgress(quest: QuestState, inventory: Inventory | null): {
  itemName: string;
  current: number;
  required: number;
} | null {
  if (!quest.requiredItemId) return null;
  const required = Math.max(1, quest.requiredItemCount ?? 1);
  const current = Math.min(required, getInventoryItemCount(inventory, quest.requiredItemId));
  return {
    itemName: resolveQuestRequiredItemName(quest.requiredItemId),
    current,
    required,
  };
}

function normalizeQuestProgressNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
}

function normalizeQuestRequiredNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(1, Math.trunc(numeric)) : 1;
}

function resolveProgressText(quest: QuestState, inventory: Inventory | null): string {
  return resolveProgressTextWithItemProgress(quest, resolveRequiredItemProgress(quest, inventory));
}

function resolveProgressTextWithItemProgress(
  quest: QuestState,
  requiredItemProgress: { itemName: string; current: number; required: number } | null,
): string {
  const progress = normalizeQuestProgressNumber(quest.progress);
  const required = normalizeQuestRequiredNumber(quest.required);
  if (quest.objectiveType === 'talk') {
    return progress >= required
      ? t('quest.progress.talk.done', undefined)
      : t('quest.progress.talk.pending', undefined);
  }
  if (quest.objectiveType === 'learn_technique') {
    return progress >= required
      ? t('quest.progress.learn.done', { targetName: quest.targetName })
      : t('quest.progress.learn.pending', { targetName: quest.targetName });
  }
  if (quest.objectiveType === 'realm_stage') {
    return progress >= required
      ? t('quest.progress.realm-stage.done', { targetName: quest.targetName })
      : t('quest.progress.realm-stage.pending', { targetName: quest.targetName });
  }
  if (quest.objectiveType === 'kill' && requiredItemProgress) {
    return `${quest.targetName} ${progress}/${required}，${requiredItemProgress.itemName} ${requiredItemProgress.current}/${requiredItemProgress.required}`;
  }
  return `${quest.targetName} ${progress}/${required}`;
}

function resolveNextStep(quest: QuestState, inventory: Inventory | null): string {
  return resolveNextStepWithItemProgress(quest, resolveRequiredItemProgress(quest, inventory));
}

function resolveNextStepWithItemProgress(
  quest: QuestState,
  requiredItemProgress: { itemName: string; current: number; required: number } | null,
): string {
  if (quest.status === 'ready') {
    const submitLabel = quest.submitNpcName ?? quest.giverName;
    const submitLocation = formatQuestLocation(quest.submitMapName ?? quest.giverMapName, quest.submitX ?? quest.giverX, quest.submitY ?? quest.giverY);
    return !isUnsetLocation(submitLocation)
      ? t('quest.next.submit-at', { location: submitLocation, npcName: submitLabel })
      : t('quest.next.submit-to', { npcName: submitLabel });
  }
  if (quest.status === 'completed') {
    return t('quest.next.completed', undefined);
  }
  if (quest.status === 'available') {
    const giverLocation = formatQuestLocation(quest.giverMapName, quest.giverX, quest.giverY);
    return !isUnsetLocation(giverLocation)
      ? t('quest.next.accept-at', { location: giverLocation, npcName: quest.giverName })
      : t('quest.next.accept-to', { npcName: quest.giverName });
  }
  if (quest.objectiveType === 'talk') {
    const talkTarget = quest.targetNpcName ?? quest.targetName;
    const talkLocation = formatQuestLocation(quest.targetMapName, quest.targetX, quest.targetY);
    return !isUnsetLocation(talkLocation)
      ? t('quest.next.talk-at', { location: talkLocation, npcName: talkTarget })
      : t('quest.next.talk-to', { npcName: talkTarget });
  }
  if (quest.objectiveType === 'submit_item') {
    const submitLocation = formatQuestLocation(quest.submitMapName ?? quest.giverMapName, quest.submitX ?? quest.giverX, quest.submitY ?? quest.giverY);
    return !isUnsetLocation(submitLocation)
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
  if (quest.objectiveType === 'kill' && requiredItemProgress) {
    if (normalizeQuestProgressNumber(quest.progress) >= normalizeQuestRequiredNumber(quest.required) && requiredItemProgress.current < requiredItemProgress.required) {
      return t('quest.next.collect-item', requiredItemProgress);
    }
    const targetLocation = formatQuestLocation(quest.targetMapName ?? quest.giverMapName, quest.targetX, quest.targetY);
    return !isUnsetLocation(targetLocation)
      ? t('quest.next.kill-collect-at', { location: targetLocation, targetName: quest.targetName, itemName: requiredItemProgress.itemName })
      : t('quest.next.kill-collect', { targetName: quest.targetName, itemName: requiredItemProgress.itemName });
  }
  const targetLocation = formatQuestLocation(quest.targetMapName ?? quest.giverMapName, quest.targetX, quest.targetY);
  return !isUnsetLocation(targetLocation)
    ? t('quest.next.kill-at', { location: targetLocation, targetName: quest.targetName })
    : t('quest.next.kill', { targetName: quest.targetName });
}

/** 构建任务文本中的 inline references（物品/怪物） */
function buildQuestReferences(text: string, quest: QuestState): UiInlineReference[] {
  const refs: UiInlineReference[] = [];
  // 怪物目标
  if (quest.objectiveType === 'kill' && quest.targetMonsterId && quest.targetName.trim()) {
    refs.push({ kind: 'monster', id: quest.targetMonsterId, label: quest.targetName, tone: 'monster' });
  }
  // 奖励物品
  for (const reward of quest.rewards) {
    if (reward.name && reward.itemId) {
      refs.push({ kind: 'item', id: reward.itemId, label: reward.name, tone: 'reward' });
    }
  }
  // 需求物品
  if (quest.requiredItemId) {
    const template = getLocalItemTemplate(quest.requiredItemId);
    if (template) {
      refs.push({ kind: 'item', id: quest.requiredItemId, label: template.name, tone: 'required' });
    }
  }
  return refs;
}

// ─── 组件 ────────────────────────────────────────────────────────────────────

export function QuestPanel() {
  const { quests, inventory } = useQuestPanelStore();
  const [activeLine, setActiveLine] = useState<QuestState['line']>('main');
  const [userHasSelected, setUserHasSelected] = useState(false);
  const [expandedCompletedLines, setExpandedCompletedLines] = useState<ReadonlySet<QuestState['line']>>(() => new Set());

  const counts = useMemo(() => buildCounts(quests), [quests]);

  // 只在用户未手动选择过 tab 且当前 tab 为空时自动切换
  const effectiveLine = useMemo(() => {
    if (userHasSelected || counts[activeLine] > 0) return activeLine;
    return LINE_ORDER.find((line) => counts[line] > 0) ?? activeLine;
  }, [activeLine, counts, userHasSelected]);

  const visibleQuests = useMemo(() => getVisibleQuests(quests, effectiveLine), [quests, effectiveLine]);
  const incompleteQuests = useMemo(() => visibleQuests.filter((quest) => quest.status !== 'completed'), [visibleQuests]);
  const completedQuests = useMemo(() => visibleQuests.filter((quest) => quest.status === 'completed'), [visibleQuests]);
  const completedExpanded = expandedCompletedLines.has(effectiveLine);

  const handleTabClick = useCallback((line: QuestState['line']) => {
    setUserHasSelected(true);
    setActiveLine(line);
  }, []);

  const handleQuestClick = useCallback((questId: string) => {
    callbacks.onOpenDetail?.(questId);
  }, []);

  const handleNavigate = useCallback((questId: string) => {
    callbacks.onNavigateQuest?.(questId);
  }, []);

  const handleCompletedToggle = useCallback(() => {
    setExpandedCompletedLines((previous) => {
      const next = new Set(previous);
      if (next.has(effectiveLine)) {
        next.delete(effectiveLine);
      } else {
        next.add(effectiveLine);
      }
      return next;
    });
  }, [effectiveLine]);

  if (quests.length === 0) {
    return (
      <div className="panel-section">
        <div className="panel-section-title">{t('quest.panel.title')}</div>
        <div className="empty-hint" data-quest-empty="true">{t('quest.empty.all')}</div>
      </div>
    );
  }

  return (
    <div className="panel-section">
      <div className="panel-section-title">{t('quest.panel.title')}</div>
      <QuestLineTabs
        activeLine={effectiveLine}
        counts={counts}
        onTabClick={handleTabClick}
      />
      {visibleQuests.length === 0 ? (
        <div className="empty-hint" data-quest-empty="true">{t('quest.empty.line', { line: getQuestLineLabel(effectiveLine) })}</div>
      ) : (
        <div className="quest-card-list">
          {incompleteQuests.map((quest) => (
            <QuestCard
              key={quest.id}
              quest={quest}
              requiredItemCount={quest.requiredItemId ? getInventoryItemCount(inventory, quest.requiredItemId) : 0}
              onClick={handleQuestClick}
              onNavigate={handleNavigate}
            />
          ))}
          <QuestCompletedSection
            completedExpanded={completedExpanded}
            completedQuests={completedQuests}
            inventory={inventory}
            onClick={handleQuestClick}
            onNavigate={handleNavigate}
            onToggle={handleCompletedToggle}
          />
        </div>
      )}
    </div>
  );
}

// ─── 子组件 ──────────────────────────────────────────────────────────────────

const QuestLineTabs = memo(function QuestLineTabs({
  activeLine,
  counts,
  onTabClick,
}: {
  activeLine: QuestState['line'];
  counts: Record<QuestState['line'], number>;
  onTabClick: (line: QuestState['line']) => void;
}) {
  return (
    <div className="quest-subtabs ui-subtabs" role="tablist">
      {LINE_ORDER.map((line) => (
        <button
          key={line}
          className={`quest-subtab-btn ui-subtab-btn${activeLine === line ? ' active' : ''}`}
          type="button"
          role="tab"
          data-quest-line={line}
          aria-selected={activeLine === line ? 'true' : 'false'}
          onClick={() => onTabClick(line)}
        >
          {getQuestLineLabel(line)}
          <span className="quest-subtab-count" data-quest-line-count={line}>{counts[line]}</span>
        </button>
      ))}
    </div>
  );
});

const QuestCompletedSection = memo(function QuestCompletedSection({
  completedExpanded,
  completedQuests,
  inventory,
  onClick,
  onNavigate,
  onToggle,
}: {
  completedExpanded: boolean;
  completedQuests: QuestState[];
  inventory: Inventory | null;
  onClick: (questId: string) => void;
  onNavigate: (questId: string) => void;
  onToggle: () => void;
}) {
  return (
    <>
      <button
        className="quest-completed-toggle"
        type="button"
        disabled={completedQuests.length === 0}
        aria-expanded={completedExpanded ? 'true' : 'false'}
        data-quest-completed-toggle="true"
        onClick={onToggle}
      >
        <span className="quest-completed-toggle-icon" aria-hidden="true">{completedExpanded ? 'v' : '>'}</span>
        <span>{t('quest.completed.title', undefined, '已完成')}</span>
        <span className="quest-completed-count">{completedQuests.length}</span>
      </button>
      {completedExpanded && completedQuests.length > 0 && (
        <div className="quest-completed-list">
          {completedQuests.map((quest) => (
            <QuestCard
              key={quest.id}
              quest={quest}
              requiredItemCount={quest.requiredItemId ? getInventoryItemCount(inventory, quest.requiredItemId) : 0}
              onClick={onClick}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </>
  );
});

const QuestCard = memo(function QuestCard({
  quest,
  requiredItemCount,
  onClick,
  onNavigate,
}: {
  quest: QuestState;
  requiredItemCount: number;
  onClick: (questId: string) => void;
  onNavigate: (questId: string) => void;
}) {
  const progress = normalizeQuestProgressNumber(quest.progress);
  const required = normalizeQuestRequiredNumber(quest.required);
  const percent = required > 0
    ? Math.min(100, Math.floor((progress / required) * 100))
    : 0;

  const requiredItemProgress = useMemo(() => {
    if (!quest.requiredItemId) return null;
    const required = Math.max(1, quest.requiredItemCount ?? 1);
    const current = Math.min(required, requiredItemCount);
    return {
    itemName: resolveQuestRequiredItemName(quest.requiredItemId),
      current,
      required,
    };
  }, [quest.requiredItemId, quest.requiredItemCount, requiredItemCount]);

  const progressText = useMemo(() => resolveProgressTextWithItemProgress(quest, requiredItemProgress), [quest, requiredItemProgress]);
  const nextStepText = useMemo(() => resolveNextStepWithItemProgress(quest, requiredItemProgress), [quest, requiredItemProgress]);
  const references = useMemo(() => buildQuestReferences(progressText + nextStepText, quest), [progressText, nextStepText, quest]);

  const canNav = canNavigateQuest(quest);
  const navLabel = resolveNavigateLabel(quest);

  const handleClick = useCallback(() => {
    onClick(quest.id);
  }, [onClick, quest.id]);

  const handleNavigateClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (canNav) {
      onNavigate(quest.id);
    }
  }, [onNavigate, quest.id, canNav]);

  return (
    <button
      className="quest-card quest-card-toggle"
      type="button"
      data-quest-id={quest.id}
      onClick={handleClick}
    >
      <div className="quest-title-row">
        <span className="quest-title" data-quest-title="true">{quest.title}</span>
        <span className={`quest-status ${STATUS_CLASS[quest.status]}`} data-quest-status="true">{getQuestStatusLabel(quest.status)}</span>
      </div>
      <div className={`quest-meta ${quest.chapter ? '' : 'hidden'}`.trim()} data-quest-chapter="true">{t('quest.card.chapter', { chapter: quest.chapter ?? '' })}</div>
      <div className="quest-desc" data-quest-desc="true">
        <UiInlineReferenceText text={quest.desc} references={references} />
      </div>
      <div className="quest-progress-label" data-quest-progress-label="true">
        <UiInlineReferenceText text={t('quest.card.objective', { content: progressText })} references={references} />
      </div>
      <div className="quest-progress-bar">
        <div className="quest-progress-fill" data-quest-progress-fill="true" style={{ width: `${percent}%` }} />
      </div>
      <div className="quest-meta" data-quest-next-step="true">
        <UiInlineReferenceText text={t('quest.card.next-step', { content: nextStepText })} references={references} />
      </div>
      <div className="quest-expand-hint">{t('quest.card.expand-hint')}</div>
    </button>
  );
});

// ─── 详情弹层内容（用于 detailModal） ────────────────────────────────────────

export function QuestDetailContent({ quest, inventory, onNavigate, onOpenGuideFlow }: {
  quest: QuestState;
  inventory: Inventory | null;
  onNavigate?: (questId: string) => void;
  onOpenGuideFlow?: (flowId: string) => void;
}) {
  const canNav = canNavigateQuest(quest);
  const navLabel = resolveNavigateLabel(quest);
  const giverLocation = quest.giverMapName && quest.giverX !== undefined && quest.giverY !== undefined
    ? `${quest.giverMapName} (${quest.giverX}, ${quest.giverY})`
    : quest.giverMapName ?? t('quest.location.unknown', undefined);
  const targetLocation = formatQuestLocation(
    quest.targetMapName ?? (quest.objectiveType === 'kill' ? quest.giverMapName : undefined),
    quest.targetX,
    quest.targetY,
  );
  const submitLocation = formatQuestLocation(
    quest.submitMapName ?? quest.giverMapName,
    quest.submitX ?? quest.giverX,
    quest.submitY ?? quest.giverY,
  );
  const progressText = resolveProgressText(quest, inventory);
  const nextStepText = resolveNextStep(quest, inventory);
  const references = buildQuestReferences(quest.desc + progressText + nextStepText, quest);
  const requiredItemProgress = resolveRequiredItemProgress(quest, inventory);

  const handleNavigate = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (canNav) {
      onNavigate?.(quest.id);
    }
  }, [canNav, onNavigate, quest.id]);

  const handleOpenGuide = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (quest.guideFlowId) {
      onOpenGuideFlow?.(quest.guideFlowId);
    }
  }, [onOpenGuideFlow, quest.guideFlowId]);

  return (
    <div className="quest-detail-body">
      {quest.chapter && (
        <div className="ui-detail-field ui-detail-field--section">
          <strong>{t('quest.detail.chapter', undefined)}</strong>
          <span>{quest.chapter}</span>
        </div>
      )}
      <div className="ui-detail-field ui-detail-field--section">
        <strong>{t('quest.detail.desc', undefined)}</strong>
        <div><UiInlineReferenceText text={quest.desc} references={references} /></div>
      </div>
      {quest.story && (
        <div className="ui-detail-field ui-detail-field--section">
          <strong>{t('quest.detail.story', undefined)}</strong>
          <span>{quest.story}</span>
        </div>
      )}
      <div className="ui-detail-grid ui-detail-grid--section">
        <div className="ui-detail-field ui-detail-field--section">
          <strong>{t('quest.detail.giver', undefined)}</strong>
          <span>{quest.giverName}</span>
        </div>
        <div className="ui-detail-field ui-detail-field--section">
          <strong>{t('quest.detail.accept-location', undefined)}</strong>
          <div className="quest-detail-location-row">
            <span>{giverLocation}</span>
            <button
              className="small-btn ghost quest-detail-nav-btn"
              type="button"
              disabled={!canNav}
              onClick={handleNavigate}
            >
              {navLabel}
            </button>
          </div>
        </div>
        <div className="ui-detail-field ui-detail-field--section">
          <strong>{t('quest.detail.target', undefined)}</strong>
          <span>{targetLocation}</span>
        </div>
        <div className="ui-detail-field ui-detail-field--section">
          <strong>{t('quest.detail.submit-location', undefined)}</strong>
          <span>{submitLocation}</span>
        </div>
        <div className="ui-detail-field ui-detail-field--section">
          <strong>{t('quest.detail.reward', undefined)}</strong>
          <div><QuestRewardContent quest={quest} references={references} /></div>
        </div>
        {quest.requiredItemId && requiredItemProgress && (
          <div className="ui-detail-field ui-detail-field--section">
            <strong>{t('quest.detail.requirement', undefined)}</strong>
            <div>
              <QuestRequiredItemContent
                quest={quest}
                requiredItemProgress={requiredItemProgress}
              />
            </div>
          </div>
        )}
        <div className="ui-detail-field ui-detail-field--section">
          <strong>{t('quest.detail.progress', undefined)}</strong>
          <div><UiInlineReferenceText text={progressText} references={references} /></div>
        </div>
        <div className="ui-detail-field ui-detail-field--section">
          <strong>{t('quest.detail.next-step', undefined)}</strong>
          <div><UiInlineReferenceText text={nextStepText} references={references} /></div>
        </div>
      </div>
      {quest.objectiveText && (
        <div className="ui-detail-field ui-detail-field--section">
          <strong>{t('quest.detail.objective-note', undefined)}</strong>
          <div><UiInlineReferenceText text={quest.objectiveText} references={references} /></div>
        </div>
      )}
      {quest.guideFlowId && (
        <div className="ui-detail-field ui-detail-field--section">
          <strong>{t('quest.detail.guide', undefined, '相关引导')}</strong>
          <div className="quest-detail-guide-row">
            <span>{t('quest.detail.guide-desc', undefined, '打开这个任务关联的操作引导，不会改变任务进度。')}</span>
            <button
              className="small-btn quest-detail-guide-btn"
              type="button"
              data-quest-guide-flow={quest.guideFlowId}
              onClick={handleOpenGuide}
            >
              {t('quest.action.open-guide', undefined, '打开引导')}
            </button>
          </div>
        </div>
      )}
      {quest.relayMessage && (
        <div className="ui-detail-field ui-detail-field--section">
          <strong>{t('quest.detail.relay', undefined)}</strong>
          <div><UiInlineReferenceText text={quest.relayMessage} references={references} /></div>
        </div>
      )}
    </div>
  );
}

function QuestRewardContent({ quest, references }: { quest: QuestState; references: UiInlineReference[] }) {
  if (quest.rewards.length > 0) {
    const rewardRefs = quest.rewards
      .filter((r) => r.name && r.itemId)
      .map((r): UiInlineReference => ({ kind: 'item', id: r.itemId, label: `${r.name}×${r.count}`, tone: 'reward' }));
    if (rewardRefs.length > 0) {
      return (
        <span className="inline-item-flow">
          {rewardRefs.map((ref) => (
            <UiInlineReferenceText key={ref.id} text={ref.label} references={[ref]} />
          ))}
        </span>
      );
    }
  }
  if (quest.rewardText.trim().length > 0 && quest.rewardText.trim() !== t('quest.reward.none-marker', undefined)) {
    return <UiInlineReferenceText text={quest.rewardText} references={references} />;
  }
  return <span>{t('quest.reward.empty', undefined)}</span>;
}

function QuestRequiredItemContent({ quest, requiredItemProgress }: {
  quest: QuestState;
  requiredItemProgress: { itemName: string; current: number; required: number };
}) {
  const ref: UiInlineReference = {
    kind: 'item',
    id: quest.requiredItemId!,
    label: requiredItemProgress.itemName,
    tone: 'required',
  };
  const isMet = requiredItemProgress.current >= requiredItemProgress.required;

  return (
    <div className="ui-requirement-entry ui-surface-card ui-surface-card--compact">
      <div className="ui-requirement-entry-head">
        <span className={`ui-requirement-status ${isMet ? 'is-completed' : 'is-unmet'}`}>
          {t('quest.requirement.owned', requiredItemProgress)}
        </span>
      </div>
      <div className="inline-item-flow">
        <UiInlineReferenceText
          text={requiredItemProgress.itemName}
          references={[ref]}
        />
      </div>
    </div>
  );
}

/** 获取详情弹层 meta */
export function getQuestDetailModalMeta(quest: QuestState) {
  return {
    title: quest.title,
    subtitle: `${getQuestLineLabel(quest.line)} · ${getQuestStatusLabel(quest.status)}`,
    hint: t('common.modal.click-blank-close'),
    size: 'md' as const,
    variantClass: 'detail-modal--quest',
  };
}
