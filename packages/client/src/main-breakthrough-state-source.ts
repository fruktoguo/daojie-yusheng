import { NEXT_C2S, type BreakthroughRequirementView, type NEXT_C2S_EventPayload, type PlayerState } from '@mud/shared-next';
import type { SocketRuntimeSender } from './network/socket-send-runtime';
import { bindInlineItemTooltips, renderTextWithInlineItemHighlights } from './ui/item-inline-tooltip';
import { detailModalHost } from './ui/detail-modal-host';
import { openHeavenGateModal } from './ui/heaven-gate-modal';
import { formatDisplayInteger } from './utils/number';
/**
 * MainBreakthroughStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainBreakthroughStateSourceOptions = {
/**
 * getPlayer：玩家引用。
 */

  getPlayer: () => PlayerState | null;  
  /**
 * showToast：showToast相关字段。
 */

  showToast: (message: string) => void;  
  /**
 * sendHeavenGateAction：sendHeavenGateAction相关字段。
 */

  sendHeavenGateAction: SocketRuntimeSender['sendHeavenGateAction'];  
  /**
 * sendAction：sendAction相关字段。
 */

  sendAction: SocketRuntimeSender['sendAction'];  
  /**
 * defaultAuraLevelBaseValue：defaultAura等级Base值数值。
 */

  defaultAuraLevelBaseValue: number;
};
/**
 * getBreakthroughRequirementStatusLabel：读取BreakthroughRequirementStatuLabel。
 * @param requirement BreakthroughRequirementView 参数说明。
 * @returns 返回BreakthroughRequirementStatuLabel。
 */


function getBreakthroughRequirementStatusLabel(requirement: BreakthroughRequirementView): string {
  return requirement.blocksBreakthrough === false
    ? (requirement.completed ? '已生效' : '未生效')
    : (requirement.completed ? '已达成' : '未达成');
}
/**
 * getBreakthroughRequirementStatusDetail：读取BreakthroughRequirementStatu详情。
 * @param requirement BreakthroughRequirementView 参数说明。
 * @returns 返回BreakthroughRequirementStatu详情。
 */


function getBreakthroughRequirementStatusDetail(requirement: BreakthroughRequirementView): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * MainBreakthroughStateSource：统一结构类型，保证协议与运行时一致性。
 */


export type MainBreakthroughStateSource = ReturnType<typeof createMainBreakthroughStateSource>;
/**
 * createMainBreakthroughStateSource：构建并返回目标对象。
 * @param options MainBreakthroughStateSourceOptions 选项参数。
 * @returns 无返回值，直接更新MainBreakthrough状态来源相关状态。
 */


export function createMainBreakthroughStateSource(options: MainBreakthroughStateSourceOptions) {
  let auraLevelBaseValue = options.defaultAuraLevelBaseValue;

  return {  
  /**
 * openBreakthroughModal：执行openBreakthrough弹层相关逻辑。
 * @returns 无返回值，直接更新openBreakthrough弹层相关状态。
 */

    openBreakthroughModal(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * syncAuraLevelBaseValue：处理Aura等级Base值并更新相关状态。
 * @param nextValue number 参数说明。
 * @returns 无返回值，直接更新Aura等级Base值相关状态。
 */


    syncAuraLevelBaseValue(nextValue?: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      if (typeof nextValue !== 'number' || !Number.isFinite(nextValue) || nextValue <= 0) {
        return;
      }
      auraLevelBaseValue = Math.max(1, Math.round(nextValue));
    },    
    /**
 * formatAuraLevelText：规范化或转换Aura等级Text。
 * @param auraValue number 参数说明。
 * @returns 返回Aura等级Text。
 */


    formatAuraLevelText(auraValue: number): string {
      return `灵气 ${formatDisplayInteger(Math.max(0, Math.round(auraValue / auraLevelBaseValue * auraLevelBaseValue)))}`;
    },    
    /**
 * getAuraLevelBaseValue：读取Aura等级Base值。
 * @returns 返回Aura等级Base值数值。
 */


    getAuraLevelBaseValue(): number {
      return auraLevelBaseValue;
    },
  };
}
