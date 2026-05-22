/**
 * 本文件属于正式客户端主线，负责前端启动、状态拼装、工具函数或表现层逻辑。
 *
 * 维护时要把用户意图、显示派生和服务端权威数据分清，避免为了展示便利复制业务规则。
 */
import { C2S, getAuraLevel, type BreakthroughRequirementView, type ClientToServerEventPayload, type PlayerState } from '@mud/shared';
import type { SocketRuntimeSender } from './network/socket-send-runtime';
import { bindInlineItemTooltips, renderInlineItemChip, renderTextWithInlineItemHighlights } from './ui/item-inline-tooltip';
import { detailModalHost } from './ui/detail-modal-host';
import { getHeavenGateHudAction, openHeavenGateModal } from './ui/heaven-gate-modal';
import { t } from './ui/i18n';
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
    ? (requirement.completed ? t('breakthrough.condition.active') : t('breakthrough.condition.inactive'))
    : (requirement.completed ? t('breakthrough.condition.met') : t('breakthrough.condition.unmet'));
}
/**
 * getBreakthroughRequirementStatusDetail：读取BreakthroughRequirementStatu详情。
 * @param requirement BreakthroughRequirementView 参数说明。
 * @returns 返回BreakthroughRequirementStatu详情。
 */


function getBreakthroughRequirementStatusDetail(requirement: BreakthroughRequirementView): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (requirement.hidden) {
    return t('breakthrough.detail.hidden');
  }
  if ((requirement.increasePct ?? 0) > 0) {
    if (requirement.type === 'item') {
      return requirement.completed ? t('breakthrough.detail.item.completed') : t('breakthrough.detail.increase.unmet');
    }
    return requirement.completed ? t('breakthrough.detail.increase.completed') : t('breakthrough.detail.increase.unmet');
  }
  return requirement.detail ?? (requirement.completed ? t('breakthrough.detail.default.completed') : t('breakthrough.detail.default.unmet'));
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
      if (getHeavenGateHudAction(player)?.visible && openHeavenGateModal(player, {
        showToast: options.showToast,
        sendAction: options.sendHeavenGateAction,
      })) {
        return;
      }

      const preview = player?.realm?.breakthrough;
      const currentRealm = player?.realm;
      if (!currentRealm) {
        options.showToast(t('breakthrough.toast.not-ready'));
        return;
      }
      if (!preview) {
        detailModalHost.open({
          ownerId: 'realm:breakthrough',
          size: 'sm',
          variantClass: 'detail-modal--breakthrough',
          title: t('breakthrough.title'),
          subtitle: currentRealm.displayName,
          hint: t('breakthrough.hint.progress.not.full'),
          bodyHtml: `
            <div class="panel-section breakthrough-requirements-panel">
              <div class="panel-section-title">${t('breakthrough.section.requirements')}</div>
              <div class="action-item breakthrough-requirement-item ui-requirement-entry ui-surface-card ui-surface-card--compact">
                <div class="action-copy">
                  <div class="breakthrough-requirement-head ui-requirement-entry-head">
                    <span class="action-name">${t('breakthrough.requirement.progress.full')}</span>
                    <span class="action-type breakthrough-requirement-status ui-requirement-status is-unmet">${t('breakthrough.status.unmet.bracket')}</span>
                  </div>
                  <div class="action-desc">当前境界修为 ${formatDisplayInteger(currentRealm.progress)} / ${formatDisplayInteger(currentRealm.progressToNext)}</div>
                </div>
              </div>
              <div class="empty-hint ui-empty-hint">${t('breakthrough.hint.sync.pending')}</div>
            </div>
          `,
        });
        return;
      }

      const hasConsumableRequirements = preview.requirements.some((requirement) => requirement.type === 'item');
      const hasIncreaseRequirements = preview.requirements.some((requirement) => (requirement.increasePct ?? 0) > 0);
      const rootFoundation = preview.rootFoundation
        ? {
          ...preview.rootFoundation,
          progress: currentRealm.progress,
          costProgress: currentRealm.progressToNext,
          canRefine: preview.rootFoundation.canRefine && currentRealm.breakthroughReady,
        }
        : undefined;
      const autoRootFoundation = player?.autoRootFoundation === true;
      const rootFoundationReachedCap = rootFoundation ? rootFoundation.current >= rootFoundation.cap : false;
      const rootFoundationStatusLabel = rootFoundation?.canRefine
        ? t('breakthrough.root.status.can.refine')
        : (rootFoundationReachedCap ? t('breakthrough.root.status.capped') : t('breakthrough.root.status.unmet'));
      const rootFoundationStatusClass = rootFoundation?.canRefine
        ? 'is-completed'
        : (rootFoundationReachedCap ? 'is-capped' : 'is-unmet');
      const rootMaterialRows = rootFoundation?.items.length
        ? rootFoundation.items.map((item) => renderInlineItemChip(item.itemId, { count: item.count, tone: 'material' })).join('')
        : `<span class="empty-hint ui-empty-hint">${t('breakthrough.root.no.material')}</span>`;
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
        : `<div class="empty-hint ui-empty-hint">${t('breakthrough.no.extra.requirements')}</div>`;

      detailModalHost.open({
        ownerId: 'realm:breakthrough',
        size: 'md',
        variantClass: 'detail-modal--breakthrough',
        title: t('breakthrough.modal.title.target', { targetName: preview.targetDisplayName }),
        subtitle: t('breakthrough.modal.subtitle', { realmName: currentRealm.displayName, completed: String(preview.completedBlockingRequirements), total: String(preview.blockingRequirements) }),
        hint: preview.blockedReason
          ? preview.blockedReason
          : preview.canBreakthrough
            ? (hasConsumableRequirements ? t('breakthrough.hint.consumable') : '点击空白处关闭')
              : (hasIncreaseRequirements ? t('breakthrough.hint.increase') : t('breakthrough.hint.hidden')),
        bodyHtml: `
          <div class="breakthrough-modal-grid">
            <div class="panel-section breakthrough-requirements-panel">
              <div class="panel-section-title">${t('breakthrough.section.requirements')}</div>
              ${requirementRows}
            </div>
            ${rootFoundation ? `<div class="panel-section breakthrough-root-foundation-panel">
              <div class="panel-section-title">${t('breakthrough.section.root.foundation')}</div>
                <div class="action-item breakthrough-requirement-item ui-requirement-entry ui-surface-card ui-surface-card--compact">
                  <div class="action-copy">
                    <div class="breakthrough-requirement-head ui-requirement-entry-head">
                      <span class="action-name">${t('breakthrough.root.progress', { current: formatDisplayInteger(rootFoundation.current), cap: formatDisplayInteger(rootFoundation.cap) })}</span>
                      <span class="action-type breakthrough-requirement-status ui-requirement-status ${rootFoundationStatusClass}">
                        [${rootFoundationStatusLabel}]
                      </span>
                    </div>
                    <div class="action-desc">${t('breakthrough.root.desc')}</div>
                    <div class="action-desc">${t('breakthrough.root.exp.progress', { current: formatDisplayInteger(rootFoundation.progress), cost: formatDisplayInteger(rootFoundation.costProgress) })}</div>
                    <div class="action-desc breakthrough-root-materials">${rootMaterialRows}</div>
                    ${rootFoundation.blockedReason ? `<div class="action-desc">${renderTextWithInlineItemHighlights(rootFoundation.blockedReason)}</div>` : ''}
                    <label class="breakthrough-root-auto-toggle">
                      <input type="checkbox" data-root-foundation-auto-refine ${autoRootFoundation ? 'checked' : ''}>
                      <span>${t('breakthrough.root.auto.refine')}</span>
                      <span class="breakthrough-root-auto-hint">${t('breakthrough.root.auto.hint')}</span>
                    </label>
                  </div>
                </div>
            </div>` : ''}
          </div>
          <div class="breakthrough-action-grid">
            <div class="breakthrough-action-cell">
              <button class="small-btn breakthrough-action-btn breakthrough-confirm-btn" type="button" data-breakthrough-confirm ${preview.canBreakthrough ? '' : 'disabled'}>${t('breakthrough.btn.confirm')}</button>
            </div>
            <div class="breakthrough-action-cell">
              ${rootFoundation ? `<button class="small-btn breakthrough-action-btn" type="button" data-root-foundation-refine ${rootFoundation.canRefine ? '' : 'disabled'}>${t('breakthrough.btn.refine')}</button>` : ''}
            </div>
          </div>
        `,
        onAfterRender: (body, signal) => {
          bindInlineItemTooltips(body, signal);
          body.querySelector<HTMLElement>('[data-breakthrough-confirm]')?.addEventListener('click', () => {
            detailModalHost.close('realm:breakthrough');
            options.sendAction('realm:breakthrough');
          }, { signal });
          body.querySelector<HTMLElement>('[data-root-foundation-refine]')?.addEventListener('click', () => {
            detailModalHost.close('realm:breakthrough');
            options.sendAction('realm:refine_root_foundation');
          }, { signal });
          body.querySelector<HTMLInputElement>('[data-root-foundation-auto-refine]')?.addEventListener('change', (event) => {
            const checked = (event.currentTarget as HTMLInputElement).checked;
            const currentPlayer = options.getPlayer();
            if (currentPlayer) {
              currentPlayer.autoRootFoundation = checked;
            }
            options.sendAction(checked ? 'realm:auto_refine_root_foundation:on' : 'realm:auto_refine_root_foundation:off');
          }, { signal });
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
      return t('breakthrough.aura.level', { level: formatDisplayInteger(getAuraLevel(auraValue, auraLevelBaseValue)) });
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
