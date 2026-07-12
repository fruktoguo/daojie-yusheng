/**
 * 背包单物品使用、丢弃与摧毁弹窗。
 *
 * 客户端只维护输入和确认状态，最终资产定位与合法性仍由服务端按 itemInstanceId 权威校验。
 */
import {
  HEAVEN_GATE_REROLL_COST_RATIO,
  SHATTER_SPIRIT_PILL_COST_RATIO,
  TECHNIQUE_LEARNING_HEAVY_DECAY_WARNING_DELTA,
  shouldWarnTechniqueLearningDifficulty,
  type HeavenGateState,
  type ItemStack,
  type PlayerRealmState,
} from '@mud/shared';
import {
  getLocalTechniqueTemplate,
  resolveTechniqueIdFromBookItemId,
} from '../../content/local-templates';
import { formatDisplayCountBadge, formatDisplayInteger } from '../../utils/number';
import { detailModalHost } from '../detail-modal-host';
import { t } from '../i18n';
import { getItemDisplayMeta } from '../item-display';
import {
  InventoryItemActionDialogState,
  type InventoryActionDialogSnapshot,
  type InventoryActionKind,
} from './inventory-item-action-dialog-state';

const HEAVEN_SPIRITUAL_ROOT_SEED_ITEM_ID = 'root_seed.heaven';
const DIVINE_SPIRITUAL_ROOT_SEED_ITEM_ID = 'root_seed.divine';
const SHATTER_SPIRIT_PILL_ITEM_ID = 'pill.shatter_spirit';
const HEAVEN_GATE_REROLL_AVERAGE_BONUS = 2;

type SpecialUseConfirmSummary = {
  title: string;
  lines: string[];
  confirmLabel?: string;
  cancelLabel?: string;
};

type ActionLabels = {
  title: string;
  confirm: string;
  danger: boolean;
};

export interface InventoryItemActionDialogOptions {
  ownerId: string;
  getPlayerRealm(): PlayerRealmState | null;
  getPlayerHeavenGate(): HeavenGateState | null;
  getPlayerFoundation(): number;
  getPlayerContextRevision(): number;
  isFormationDisk(item: ItemStack): boolean;
  getItemInstanceId(item: ItemStack): string;
  repairMissingItemInstanceIds(): void;
  useItem(itemInstanceId: string, count: number): void;
  dropItem(itemInstanceId: string, count: number): void;
  destroyItem(itemInstanceId: string, count: number): void;
  renderParentModal(): void;
  closeModal(): void;
  resetParentModalState(): void;
}

function replaceElementHtml(root: HTMLElement, html: string): void {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  root.replaceChildren(template.content.cloneNode(true));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export class InventoryItemActionDialogController {
  private readonly state = new InventoryItemActionDialogState();

  constructor(private readonly options: InventoryItemActionDialogOptions) {}

  isOpen(): boolean {
    return this.state.isOpen();
  }

  matchesItem(itemKey: string | null | undefined): boolean {
    return this.state.matchesItem(itemKey);
  }

  open(kind: InventoryActionKind, itemKey: string, defaultCount: number): boolean {
    return this.state.open(kind, itemKey, defaultCount);
  }

  reset(): void {
    this.state.reset();
  }

  requiresUseConfirmation(item: ItemStack): boolean {
    return !this.options.isFormationDisk(item)
      && (this.getSpiritualRootSeedTier(item) !== null
        || item.itemId === SHATTER_SPIRIT_PILL_ITEM_ID
        || this.getTechniqueLearningWarningSummary(item) !== null);
  }

  buildRenderKey(item: ItemStack, itemKey: string): string | null {
    const dialog = this.state.snapshot();
    const contextDependent = dialog?.kind === 'use' && this.getSpecialUseConfirmSummary(item) !== null;
    return this.state.buildRenderKey({
      itemKey,
      itemCount: item.count,
      playerContextRevision: this.options.getPlayerContextRevision(),
      contextDependent,
    });
  }

  render(item: ItemStack): void {
    const dialog = this.state.snapshot();
    if (!dialog) {
      return;
    }
    const maxCount = item.count;
    const selectedCount = this.normalizeCountDraft(dialog.countDraft, maxCount);
    const specialUseSummary = dialog.kind === 'use' ? this.getSpecialUseConfirmSummary(item) : null;
    const displayName = getItemDisplayMeta(item).displayItem.name;

    if (dialog.confirmDestroy) {
      this.renderDestroyConfirmation(item, selectedCount, displayName);
      return;
    }
    if (specialUseSummary) {
      this.renderSpecialUseConfirmation(item, displayName, specialUseSummary);
      return;
    }
    this.renderCountSelection(item, dialog, displayName);
  }

  private renderDestroyConfirmation(item: ItemStack, selectedCount: number, displayName: string): void {
    detailModalHost.open({
      ownerId: this.options.ownerId,
      title: t('inventory.destroy.title', undefined),
      subtitle: t('inventory.modal.item-subtitle.count-only', {
        itemName: displayName,
        count: formatDisplayCountBadge(selectedCount),
      }),
      hint: t('common.modal.click-blank-cancel', undefined),
      renderBody: (body) => this.renderDestroyConfirmBody(body),
      onClose: () => this.handleHostClose(),
      onAfterRender: (body, signal) => {
        body.querySelector<HTMLElement>('[data-inventory-destroy-back]')?.addEventListener('click', (event) => {
          event.stopPropagation();
          this.state.setDestroyConfirmation(false);
          this.options.renderParentModal();
        }, { signal });
        body.querySelector<HTMLElement>('[data-inventory-destroy-confirm]')?.addEventListener('click', (event) => {
          event.stopPropagation();
          const itemInstanceId = this.resolveItemInstanceId(item);
          if (!itemInstanceId) {
            return;
          }
          this.options.destroyItem(itemInstanceId, selectedCount);
          this.options.closeModal();
        }, { signal });
      },
    });
  }

  private renderSpecialUseConfirmation(
    item: ItemStack,
    displayName: string,
    summary: SpecialUseConfirmSummary,
  ): void {
    detailModalHost.open({
      ownerId: this.options.ownerId,
      title: summary.title,
      subtitle: t('inventory.modal.item-subtitle.count-only', {
        itemName: displayName,
        count: formatDisplayCountBadge(1),
      }),
      hint: t('common.modal.click-blank-cancel', undefined),
      renderBody: (body) => this.renderSpecialUseConfirmBody(body, summary),
      onClose: () => this.handleHostClose(),
      onAfterRender: (body, signal) => {
        body.querySelector<HTMLElement>('[data-inventory-action-cancel]')?.addEventListener('click', (event) => {
          event.stopPropagation();
          this.state.reset();
          this.options.renderParentModal();
        }, { signal });
        body.querySelector<HTMLElement>('[data-inventory-action-confirm]')?.addEventListener('click', (event) => {
          event.stopPropagation();
          const itemInstanceId = this.resolveItemInstanceId(item);
          if (!itemInstanceId) {
            return;
          }
          this.options.useItem(itemInstanceId, 1);
          this.options.closeModal();
        }, { signal });
      },
    });
  }

  private renderCountSelection(
    item: ItemStack,
    dialog: InventoryActionDialogSnapshot,
    displayName: string,
  ): void {
    const labels = this.resolveActionLabels(dialog.kind);
    const maxCount = item.count;
    const halfCount = Math.max(1, Math.ceil(maxCount / 2));
    detailModalHost.open({
      ownerId: this.options.ownerId,
      title: labels.title,
      subtitle: t('inventory.action-dialog.subtitle.max-count', {
        itemName: displayName,
        count: formatDisplayInteger(maxCount),
      }),
      hint: t('common.modal.click-blank-cancel', undefined),
      renderBody: (body) => this.renderActionDialogBody(body, labels, dialog.countDraft, halfCount, maxCount),
      onClose: () => this.handleHostClose(),
      onAfterRender: (body, signal) => this.bindCountSelectionActions(body, signal, item, dialog.kind),
    });
  }

  private bindCountSelectionActions(
    body: HTMLElement,
    signal: AbortSignal,
    item: ItemStack,
    kind: InventoryActionKind,
  ): void {
    const maxCount = item.count;
    const countInput = body.querySelector<HTMLInputElement>('[data-inventory-action-count="true"]');
    this.syncCountInputWidth(countInput, maxCount);
    countInput?.addEventListener('input', () => {
      this.updateCountDraft(countInput);
      this.syncCountInputWidth(countInput, maxCount);
    }, { signal });
    countInput?.addEventListener('blur', () => {
      this.commitCountInput(countInput, maxCount);
    }, { signal });
    body.querySelectorAll<HTMLElement>('[data-inventory-quick-count]').forEach((button) => button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!countInput) {
        return;
      }
      countInput.value = button.dataset.inventoryQuickCount ?? '1';
      this.updateCountDraft(countInput);
      this.syncCountInputWidth(countInput, maxCount);
    }, { signal }));
    body.querySelector<HTMLElement>('[data-inventory-action-cancel]')?.addEventListener('click', (event) => {
      event.stopPropagation();
      this.state.reset();
      this.options.renderParentModal();
    }, { signal });
    body.querySelector<HTMLElement>('[data-inventory-action-confirm]')?.addEventListener('click', (event) => {
      event.stopPropagation();
      const selectedCount = this.commitCountInput(countInput, maxCount);
      const itemInstanceId = this.resolveItemInstanceId(item);
      if (!itemInstanceId) {
        return;
      }
      if (kind === 'use') {
        this.options.useItem(itemInstanceId, selectedCount);
        this.options.closeModal();
        return;
      }
      if (kind === 'drop') {
        this.options.dropItem(itemInstanceId, selectedCount);
        this.options.closeModal();
        return;
      }
      this.state.setCountDraft(String(selectedCount));
      this.state.setDestroyConfirmation(true);
      this.options.renderParentModal();
    }, { signal });
  }

  private renderDestroyConfirmBody(body: HTMLElement): void {
    replaceElementHtml(body, `
      <div class="panel-section">
        <div class="empty-hint">${t('inventory.destroy.warning', undefined)}</div>
      </div>
      <div class="inventory-detail-actions">
        <div class="inventory-detail-actions-group inventory-detail-actions-group--right inventory-detail-actions-group--stretch">
          <button class="small-btn ghost" type="button" data-inventory-destroy-back>${t('inventory.destroy.back-count', undefined)}</button>
          <button class="small-btn danger" type="button" data-inventory-destroy-confirm>${t('inventory.destroy.confirm', undefined)}</button>
        </div>
      </div>
    `);
  }

  private renderSpecialUseConfirmBody(body: HTMLElement, summary: SpecialUseConfirmSummary): void {
    replaceElementHtml(body, `
      <div class="ui-detail-field ui-detail-field--section">
        <strong>${t('inventory.use-confirm.instructions', undefined)}</strong>
        ${summary.lines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}
      </div>
      <div class="inventory-detail-actions">
        <div class="inventory-detail-actions-group inventory-detail-actions-group--right inventory-detail-actions-group--stretch">
          <button class="small-btn ghost" type="button" data-inventory-action-cancel>${escapeHtml(summary.cancelLabel ?? t('inventory.action.back-detail', undefined))}</button>
          <button class="small-btn" type="button" data-inventory-action-confirm>${escapeHtml(summary.confirmLabel ?? t('inventory.action.confirm-use', undefined))}</button>
        </div>
      </div>
    `);
  }

  private renderActionDialogBody(
    body: HTMLElement,
    labels: ActionLabels,
    countDraft: string,
    halfCount: number,
    maxCount: number,
  ): void {
    replaceElementHtml(body, `
      <div class="ui-detail-field ui-detail-field--section">
        <strong>${t('inventory.action-dialog.choose-count', undefined)}</strong>
        <div class="inventory-batch-use-row inventory-batch-use-row--dialog">
          <button class="small-btn ghost" type="button" data-inventory-quick-count="1">${t('inventory.action-dialog.one', undefined)}</button>
          <button class="small-btn ghost" type="button" data-inventory-quick-count="${halfCount}">${t('inventory.action-dialog.half', undefined)}</button>
          <button class="small-btn ghost" type="button" data-inventory-quick-count="${maxCount}">${t('inventory.action-dialog.all', undefined)}</button>
          <input
            class="gm-inline-input"
            data-inventory-action-count="true"
            type="number"
            min="1"
            max="${maxCount}"
            step="1"
            value="${escapeHtml(countDraft)}"
            inputmode="numeric"
          />
        </div>
      </div>
      <div class="inventory-detail-actions">
        <div class="inventory-detail-actions-group inventory-detail-actions-group--right inventory-detail-actions-group--stretch">
          <button class="small-btn ghost" type="button" data-inventory-action-cancel>${t('inventory.action.back-detail', undefined)}</button>
          <button class="small-btn ${labels.danger ? 'danger' : ''}" type="button" data-inventory-action-confirm>${labels.confirm}</button>
        </div>
      </div>
    `);
  }

  private getSpecialUseConfirmSummary(item: ItemStack): SpecialUseConfirmSummary | null {
    const techniqueWarningSummary = this.getTechniqueLearningWarningSummary(item);
    if (techniqueWarningSummary) {
      return techniqueWarningSummary;
    }
    const tier = this.getSpiritualRootSeedTier(item);
    const playerHeavenGate = this.options.getPlayerHeavenGate();
    const playerRealm = this.options.getPlayerRealm();
    const playerFoundation = this.options.getPlayerFoundation();
    const currentRerollCount = this.getHeavenGateRerollCount(playerHeavenGate?.averageBonus ?? 0);
    if (tier) {
      const gainedRerollCount = this.getSpiritualRootSeedEquivalentRerollCount(tier);
      const reducedCount = Math.max(0, gainedRerollCount - currentRerollCount);
      const foundationCost = this.getHeavenGateRerollCost(playerRealm) * reducedCount;
      const remainingFoundation = Math.max(0, playerFoundation - foundationCost);
      const nextRerollCount = currentRerollCount + gainedRerollCount;
      const lines = tier === 'divine'
        ? [
            t('inventory.special-use.root-seed.divine.line-1', undefined),
            t('inventory.special-use.root-seed.line-2', {
              foundationCost: formatDisplayInteger(foundationCost),
              foundation: formatDisplayInteger(playerFoundation),
              remainingFoundation: formatDisplayInteger(remainingFoundation),
            }),
            t('inventory.special-use.root-seed.line-3', {
              currentRerollCount: formatDisplayInteger(currentRerollCount),
              gainedRerollCount: formatDisplayInteger(gainedRerollCount),
              nextRerollCount: formatDisplayInteger(nextRerollCount),
            }),
          ]
        : [
            t('inventory.special-use.root-seed.heaven.line-1', undefined),
            t('inventory.special-use.root-seed.line-2', {
              foundationCost: formatDisplayInteger(foundationCost),
              foundation: formatDisplayInteger(playerFoundation),
              remainingFoundation: formatDisplayInteger(remainingFoundation),
            }),
            t('inventory.special-use.root-seed.line-3', {
              currentRerollCount: formatDisplayInteger(currentRerollCount),
              gainedRerollCount: formatDisplayInteger(gainedRerollCount),
              nextRerollCount: formatDisplayInteger(nextRerollCount),
            }),
          ];
      return {
        title: tier === 'divine'
          ? t('inventory.special-use.root-seed.divine.title', undefined)
          : t('inventory.special-use.root-seed.heaven.title', undefined),
        lines,
      };
    }
    if (item.itemId !== SHATTER_SPIRIT_PILL_ITEM_ID) {
      return null;
    }
    const currentExp = Math.max(0, Math.floor(playerRealm?.progress ?? 0));
    const expCost = Math.max(0, Math.round(currentExp * SHATTER_SPIRIT_PILL_COST_RATIO));
    const remainingExp = Math.max(0, currentExp - expCost);
    return {
      title: t('inventory.special-use.shatter-spirit-pill.title', undefined),
      lines: [
        t('inventory.special-use.shatter-spirit-pill.line-1', undefined),
        t('inventory.special-use.shatter-spirit-pill.line-2', {
          currentExp: formatDisplayInteger(currentExp),
          expCost: formatDisplayInteger(expCost),
          remainingExp: formatDisplayInteger(remainingExp),
        }),
        t('inventory.special-use.shatter-spirit-pill.line-3', {
          currentRerollCount: formatDisplayInteger(currentRerollCount),
          nextRerollCount: formatDisplayInteger(currentRerollCount + 1),
        }),
      ],
    };
  }

  private getTechniqueLearningWarningSummary(item: ItemStack): SpecialUseConfirmSummary | null {
    if (item.type !== 'skill_book') {
      return null;
    }
    const playerRealmLv = Number.isFinite(this.options.getPlayerRealm()?.realmLv)
      ? Math.max(1, Math.floor(Number(this.options.getPlayerRealm()?.realmLv)))
      : null;
    if (playerRealmLv === null) {
      return null;
    }
    const techniqueId = this.getTechniqueIdFromBookItem(item);
    if (!techniqueId) {
      return null;
    }
    const technique = getLocalTechniqueTemplate(techniqueId);
    if (!technique || !Number.isFinite(technique.realmLv)) {
      return null;
    }
    const techniqueRealmLv = Math.max(1, Math.floor(Number(technique.realmLv)));
    if (!shouldWarnTechniqueLearningDifficulty(playerRealmLv, techniqueRealmLv)) {
      return null;
    }
    return {
      title: t('inventory.technique-learning-warning.title', { name: technique.name || item.name }),
      lines: [
        t('inventory.technique-learning-warning.line-1', undefined),
        t('inventory.technique-learning-warning.line-2', {
          gap: formatDisplayInteger(techniqueRealmLv - playerRealmLv),
          threshold: formatDisplayInteger(TECHNIQUE_LEARNING_HEAVY_DECAY_WARNING_DELTA),
        }),
        t('inventory.technique-learning-warning.line-3', undefined),
      ],
      confirmLabel: t('inventory.technique-learning-warning.confirm', undefined),
      cancelLabel: t('inventory.technique-learning-warning.cancel', undefined),
    };
  }

  private getSpiritualRootSeedTier(item: ItemStack): 'heaven' | 'divine' | null {
    if (item.itemId === HEAVEN_SPIRITUAL_ROOT_SEED_ITEM_ID) {
      return 'heaven';
    }
    if (item.itemId === DIVINE_SPIRITUAL_ROOT_SEED_ITEM_ID) {
      return 'divine';
    }
    return null;
  }

  private getHeavenGateRerollCount(averageBonus: number): number {
    return Math.max(0, Math.floor(Math.max(0, averageBonus) / HEAVEN_GATE_REROLL_AVERAGE_BONUS));
  }

  private getHeavenGateRerollCost(realm: PlayerRealmState | null): number {
    return Math.max(1, Math.round(Math.max(1, Math.floor(realm?.progressToNext ?? 1)) * HEAVEN_GATE_REROLL_COST_RATIO));
  }

  private getSpiritualRootSeedEquivalentRerollCount(tier: 'heaven' | 'divine'): number {
    return tier === 'divine' ? 100 : 10;
  }

  private getTechniqueIdFromBookItem(item: ItemStack): string | null {
    return typeof item.learnTechniqueId === 'string' && item.learnTechniqueId.trim()
      ? item.learnTechniqueId.trim()
      : resolveTechniqueIdFromBookItemId(item.itemId);
  }

  private resolveActionLabels(kind: InventoryActionKind): ActionLabels {
    switch (kind) {
      case 'use':
        return { title: t('inventory.action-dialog.title.use', undefined), confirm: t('inventory.action-dialog.confirm.use', undefined), danger: false };
      case 'drop':
        return { title: t('inventory.action-dialog.title.drop', undefined), confirm: t('inventory.action-dialog.confirm.drop', undefined), danger: true };
      case 'destroy':
        return { title: t('inventory.action-dialog.title.destroy', undefined), confirm: t('inventory.action-dialog.confirm.destroy', undefined), danger: true };
    }
  }

  private normalizeCountDraft(rawValue: string, maxCount: number): number {
    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsed)) {
      return 1;
    }
    return Math.max(1, Math.min(maxCount, parsed));
  }

  private updateCountDraft(input: HTMLInputElement | null): void {
    if (input) {
      this.state.setCountDraft(input.value);
    }
  }

  private commitCountInput(input: HTMLInputElement | null, maxCount: number): number {
    const selectedCount = this.normalizeCountDraft(input?.value ?? '1', maxCount);
    if (input) {
      input.value = String(selectedCount);
      this.updateCountDraft(input);
      this.syncCountInputWidth(input, maxCount);
    }
    return selectedCount;
  }

  private syncCountInputWidth(input: HTMLInputElement | null, maxCount: number): void {
    if (!input) {
      return;
    }
    const valueLength = Math.max(1, input.value.trim().length);
    const maxLength = Math.max(1, String(maxCount).length);
    input.style.width = `calc(${Math.max(4, valueLength, maxLength) + 1}ch + 18px)`;
  }

  private resolveItemInstanceId(item: ItemStack): string | null {
    const itemInstanceId = this.options.getItemInstanceId(item);
    if (itemInstanceId) {
      return itemInstanceId;
    }
    this.options.repairMissingItemInstanceIds();
    return null;
  }

  private handleHostClose(): void {
    this.state.reset();
    this.options.resetParentModalState();
  }
}

export type { InventoryActionKind } from './inventory-item-action-dialog-state';
