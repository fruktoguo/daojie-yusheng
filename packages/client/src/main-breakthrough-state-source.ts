import { NEXT_C2S, type BreakthroughRequirementView, type NEXT_C2S_EventPayload, type PlayerState } from '@mud/shared-next';
import type { SocketRuntimeSender } from './network/socket-send-runtime';
import { bindInlineItemTooltips, renderTextWithInlineItemHighlights } from './ui/item-inline-tooltip';
import { detailModalHost } from './ui/detail-modal-host';
import { openHeavenGateModal } from './ui/heaven-gate-modal';
import { formatDisplayInteger } from './utils/number';

type MainBreakthroughStateSourceOptions = {
  getPlayer: () => PlayerState | null;
  showToast: (message: string) => void;
  sendHeavenGateAction: SocketRuntimeSender['sendHeavenGateAction'];
  sendAction: SocketRuntimeSender['sendAction'];
  defaultAuraLevelBaseValue: number;
};

function getBreakthroughRequirementStatusLabel(requirement: BreakthroughRequirementView): string {
  return requirement.blocksBreakthrough === false
    ? (requirement.completed ? '已生效' : '未生效')
    : (requirement.completed ? '已达成' : '未达成');
}

function getBreakthroughRequirementStatusDetail(requirement: BreakthroughRequirementView): string {
  if (requirement.hidden) {
    return '该要求尚未解锁，只能通过主线或支线任务逐步获知。';
  }
  if ((requirement.increasePct ?? 0) > 0) {
    if (requirement.type === 'item') {
      return requirement.completed ? '突破成功后会消耗该材料。' : '未生效时会抬高全部属性要求。';
    }
    return requirement.completed ? '该条件当前已生效。' : '未生效时会抬高全部属性要求。';
  }
  return requirement.detail ?? (requirement.completed ? '当前已满足。' : '当前尚未满足。');
}

export type MainBreakthroughStateSource = ReturnType<typeof createMainBreakthroughStateSource>;

export function createMainBreakthroughStateSource(options: MainBreakthroughStateSourceOptions) {
  let auraLevelBaseValue = options.defaultAuraLevelBaseValue;

  return {
    openBreakthroughModal(): void {
      const player = options.getPlayer();
      if (openHeavenGateModal(player, {
        showToast: options.showToast,
        sendAction: options.sendHeavenGateAction,
      })) {
        return;
      }

      const preview = player?.realm?.breakthrough;
      const currentRealm = player?.realm;
      if (!preview || !currentRealm) {
        options.showToast('当前境界尚未圆满，暂时不能突破');
        return;
      }

      const hasConsumableRequirements = preview.requirements.some((requirement) => requirement.type === 'item');
      const hasIncreaseRequirements = preview.requirements.some((requirement) => (requirement.increasePct ?? 0) > 0);
      const requirementRows = preview.requirements.length > 0
        ? preview.requirements.map((requirement) => `
          <div class="action-item breakthrough-requirement-item ui-requirement-entry ui-surface-card ui-surface-card--compact">
            <div class="action-copy">
              <div class="breakthrough-requirement-head ui-requirement-entry-head">
                <span class="action-name">${renderTextWithInlineItemHighlights(requirement.label)}</span>
                <span class="action-type breakthrough-requirement-status ui-requirement-status ${requirement.completed ? 'is-completed' : 'is-unmet'}">
                  [${getBreakthroughRequirementStatusLabel(requirement)}]
                </span>
                ${!requirement.completed && (requirement.increasePct ?? 0) > 0
                  ? `<span class="breakthrough-requirement-bonus ui-requirement-bonus">+${requirement.increasePct}%</span>`
                  : ''}
              </div>
              <div class="action-desc">${renderTextWithInlineItemHighlights(getBreakthroughRequirementStatusDetail(requirement))}</div>
            </div>
          </div>
        `).join('')
        : '<div class="empty-hint ui-empty-hint">当前无额外突破要求。</div>';

      detailModalHost.open({
        ownerId: 'realm:breakthrough',
        size: 'md',
        variantClass: 'detail-modal--breakthrough',
        title: `突破至 ${preview.targetDisplayName}`,
        subtitle: `${currentRealm.displayName} · 核心要求 ${preview.completedBlockingRequirements}/${preview.blockingRequirements}`,
        hint: preview.blockedReason
          ? preview.blockedReason
          : preview.canBreakthrough
            ? (hasConsumableRequirements ? '绿色表示已满足；已生效的材料会在突破后消耗。' : '点击空白处关闭')
            : (hasIncreaseRequirements ? '红色表示当前未满足；带 +% 的条件会抬高全部属性要求。' : '红色表示当前未满足；隐藏条件需通过任务逐步解锁。'),
        bodyHtml: `
          <div class="panel-section">
            <div class="panel-section-title">突破要求</div>
            ${requirementRows}
          </div>
          ${hasIncreaseRequirements ? `
            <div class="panel-section">
              <div class="empty-hint ui-empty-hint">提示：红色且带 +% 的条件当前未生效，会按配置抬高全部属性要求；绿色表示当前已满足或已生效。</div>
            </div>
          ` : ''}
          <div class="tech-modal-actions">
            <button class="small-btn" type="button" data-breakthrough-confirm ${preview.canBreakthrough ? '' : 'disabled'}>确认突破</button>
          </div>
        `,
        onAfterRender: (body) => {
          bindInlineItemTooltips(body);
          body.querySelector<HTMLElement>('[data-breakthrough-confirm]')?.addEventListener('click', () => {
            detailModalHost.close('realm:breakthrough');
            options.sendAction('realm:breakthrough');
          });
        },
      });
    },

    syncAuraLevelBaseValue(nextValue?: number): void {
      if (typeof nextValue !== 'number' || !Number.isFinite(nextValue) || nextValue <= 0) {
        return;
      }
      auraLevelBaseValue = Math.max(1, Math.round(nextValue));
    },

    formatAuraLevelText(auraValue: number): string {
      return `灵气 ${formatDisplayInteger(Math.max(0, Math.round(auraValue / auraLevelBaseValue * auraLevelBaseValue)))}`;
    },

    getAuraLevelBaseValue(): number {
      return auraLevelBaseValue;
    },
  };
}
