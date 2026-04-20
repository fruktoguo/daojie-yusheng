import {
  type AlchemyRecipeCatalogEntry,
  type NEXT_C2S_StartEnhancement,
  EQUIP_SLOTS,
  type EnhancementTargetRef,
  type PlayerState,
  type NEXT_S2C_AlchemyPanel,
  type NEXT_S2C_AttrUpdate,
  type NEXT_S2C_EnhancementPanel,
} from '@mud/shared-next';
import { getEquipSlotLabel, getItemTypeLabel, getTechniqueGradeLabel } from '../domain-labels';
import { formatDisplayInteger, formatDisplayPercent } from '../utils/number';
import { detailModalHost } from './detail-modal-host';

/** escapeHtml：转义 HTML 文本中的危险字符。 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** formatTicks：格式化Ticks。 */
function formatTicks(ticks: number | undefined): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!Number.isFinite(ticks) || Number(ticks) <= 0) {
    return '0 息';
  }
  return `${formatDisplayInteger(Math.max(0, Math.round(Number(ticks))))} 息`;
}

/** formatPercentRate：格式化Percent速率。 */
function formatPercentRate(rate: number | undefined): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!Number.isFinite(rate)) {
    return '0%';
  }
  return formatDisplayPercent(Math.max(0, Math.min(100, Number(rate) * 100)), {
    maximumFractionDigits: 1,
    compactThreshold: Number.POSITIVE_INFINITY,
  });
}

/** renderKeyValueCard：渲染Key值卡片。 */
function renderKeyValueCard(label: string, value: string): string {
  return `<div class="info-line ui-key-value-item ui-surface-card ui-surface-card--compact"><span class="ui-key-value-label">${escapeHtml(label)}</span><strong class="ui-key-value-value">${escapeHtml(value)}</strong></div>`;
}

/** renderItemSummary：渲染物品摘要。 */
function renderItemSummary(item: {
/**
 * name：对象字段。
 */
 name?: string;
 /**
 * itemId：对象字段。
 */
 itemId: string;
 /**
 * type：对象字段。
 */
 type?: string;
 /**
 * level：对象字段。
 */
 level?: number;
 /**
 * equipSlot：对象字段。
 */
 equipSlot?: string }): string {
  const parts = [
    item.type ? getItemTypeLabel(item.type) : '',
    typeof item.level === 'number' ? `Lv.${formatDisplayInteger(item.level)}` : '',
    item.equipSlot ? getEquipSlotLabel(item.equipSlot) : '',
  ].filter(Boolean);
  return `
    <div class="ui-title-block">
      <div class="ui-title-block-title">${escapeHtml(item.name ?? item.itemId)}</div>
      <div class="ui-title-block-subtitle">${escapeHtml(parts.join(' · ') || item.itemId)}</div>
    </div>
  `;
}

/** renderEmpty：渲染Empty。 */
function renderEmpty(text: string): string {
  return `<div class="empty-hint ui-empty-hint">${escapeHtml(text)}</div>`;
}

/** MAX_ENHANCEMENT_LEVEL：强化等级上限。 */
const MAX_ENHANCEMENT_LEVEL = 20;

/** toEquipSlot：处理to Equip槽位。 */
function toEquipSlot(value: string | undefined): EnhancementTargetRef['slot'] | null {
  return value && EQUIP_SLOTS.includes(value as typeof EQUIP_SLOTS[number])
    ? value as EnhancementTargetRef['slot']
    : null;
}

/** CraftWorkbenchCallbacks：工坊弹窗回调集。 */
type CraftWorkbenchCallbacks = {
/**
 * onRequestAlchemy：对象字段。
 */

  onRequestAlchemy: (knownCatalogVersion?: number) => void;  
  /**
 * onRequestEnhancement：对象字段。
 */

  onRequestEnhancement: () => void;  
  /**
 * onStartAlchemy：对象字段。
 */

  onStartAlchemy: (recipeId: string, ingredients: Array<{  
  /**
 * itemId：对象字段。
 */
 itemId: string;  
 /**
 * count：对象字段。
 */
 count: number }>, quantity: number) => void;  
 /**
 * onCancelAlchemy：对象字段。
 */

  onCancelAlchemy: () => void;  
  /**
 * onStartEnhancement：对象字段。
 */

  onStartEnhancement: (payload: NEXT_C2S_StartEnhancement) => void;  
  /**
 * onCancelEnhancement：对象字段。
 */

  onCancelEnhancement: () => void;
};

/** CraftWorkbenchMode：模式枚举。 */
type CraftWorkbenchMode = 'alchemy' | 'enhancement' | null;

/** CraftWorkbenchModal：制作Workbench弹窗实现。 */
export class CraftWorkbenchModal {
  /** MODAL_OWNER：弹窗OWNER。 */
  private static readonly MODAL_OWNER = 'craft-workbench-modal';

  /** callbacks：callbacks。 */
  private callbacks: CraftWorkbenchCallbacks | null = null;
  /** activeMode：活跃模式。 */
  private activeMode: CraftWorkbenchMode = null;
  /** loading：loading。 */
  private loading = false;
  /** alchemyPanel：炼丹面板。 */
  private alchemyPanel: NEXT_S2C_AlchemyPanel | null = null;
  /** enhancementPanel：强化面板。 */
  private enhancementPanel: NEXT_S2C_EnhancementPanel | null = null;
  /** alchemyCatalogVersion：炼丹目录版本。 */
  private alchemyCatalogVersion = 0;
  /** alchemyCatalog：炼丹目录。 */
  private alchemyCatalog: AlchemyRecipeCatalogEntry[] = [];
  /** alchemySkillLevel：炼丹技能等级。 */
  private alchemySkillLevel = 1;
  /** gatherSkillLevel：gather技能等级。 */
  private gatherSkillLevel = 1;
  /** enhancementSkillLevel：强化技能等级。 */
  private enhancementSkillLevel = 1;

  /** setCallbacks：处理set Callbacks。 */
  setCallbacks(callbacks: CraftWorkbenchCallbacks): void {
    this.callbacks = callbacks;
  }

  /** initFromPlayer：初始化From玩家。 */
  initFromPlayer(player: PlayerState): void {
    this.alchemySkillLevel = Math.max(1, Math.floor(player.alchemySkill?.level ?? 1));
    this.gatherSkillLevel = Math.max(1, Math.floor(player.gatherSkill?.level ?? 1));
    this.enhancementSkillLevel = Math.max(1, Math.floor(player.enhancementSkill?.level ?? player.enhancementSkillLevel ?? 1));
  }

  /** syncAttrUpdate：同步属性更新。 */
  syncAttrUpdate(update: NEXT_S2C_AttrUpdate): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (update.alchemySkill) {
      this.alchemySkillLevel = Math.max(1, Math.floor(update.alchemySkill.level ?? this.alchemySkillLevel));
    }
    if (update.gatherSkill) {
      this.gatherSkillLevel = Math.max(1, Math.floor(update.gatherSkill.level ?? this.gatherSkillLevel));
    }
    if (update.enhancementSkill) {
      this.enhancementSkillLevel = Math.max(1, Math.floor(update.enhancementSkill.level ?? this.enhancementSkillLevel));
    }
    if (detailModalHost.isOpenFor(CraftWorkbenchModal.MODAL_OWNER)) {
      this.render();
    }
  }

  /** syncInventory：同步背包。 */
  syncInventory(): void {
    this.requestCurrentPanel();
  }

  /** syncEquipment：同步Equipment。 */
  syncEquipment(): void {
    this.requestCurrentPanel();
  }

  /** openAlchemy：打开炼丹。 */
  openAlchemy(): void {
    this.activeMode = 'alchemy';
    this.loading = true;
    this.render();
    this.callbacks?.onRequestAlchemy(this.alchemyCatalogVersion || undefined);
  }

  /** openEnhancement：打开强化。 */
  openEnhancement(): void {
    this.activeMode = 'enhancement';
    this.loading = true;
    this.render();
    this.callbacks?.onRequestEnhancement();
  }

  /** updateAlchemy：更新炼丹。 */
  updateAlchemy(data: NEXT_S2C_AlchemyPanel): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.alchemyPanel = data;
    this.alchemyCatalogVersion = Math.max(0, Math.floor(data.catalogVersion ?? this.alchemyCatalogVersion));
    if (Array.isArray(data.catalog)) {
      this.alchemyCatalog = data.catalog.map((entry) => ({
        ...entry,
        ingredients: entry.ingredients.map((ingredient) => ({ ...ingredient })),
      }));
    }
    if (this.activeMode !== 'alchemy') {
      return;
    }
    this.loading = false;
    this.render();
  }

  /** updateEnhancement：更新强化。 */
  updateEnhancement(data: NEXT_S2C_EnhancementPanel): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.enhancementPanel = data;
    if (data.state?.enhancementSkillLevel) {
      this.enhancementSkillLevel = Math.max(1, Math.floor(data.state.enhancementSkillLevel));
    }
    if (this.activeMode !== 'enhancement') {
      return;
    }
    this.loading = false;
    this.render();
  }

  /** clear：清理clear。 */
  clear(): void {
    this.activeMode = null;
    this.loading = false;
    this.alchemyPanel = null;
    this.enhancementPanel = null;
    this.alchemyCatalogVersion = 0;
    this.alchemyCatalog = [];
    detailModalHost.close(CraftWorkbenchModal.MODAL_OWNER);
  }

  /** requestCurrentPanel：处理请求当前面板。 */
  private requestCurrentPanel(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!detailModalHost.isOpenFor(CraftWorkbenchModal.MODAL_OWNER)) {
      return;
    }
    if (this.activeMode === 'alchemy') {
      this.callbacks?.onRequestAlchemy(this.alchemyCatalogVersion || undefined);
      return;
    }
    if (this.activeMode === 'enhancement') {
      this.callbacks?.onRequestEnhancement();
    }
  }

  /** render：渲染渲染。 */
  private render(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.activeMode) {
      return;
    }
    const title = this.activeMode === 'alchemy' ? '炼丹工坊' : '强化工坊';
    const subtitle = this.activeMode === 'alchemy'
      ? `丹道 Lv ${formatDisplayInteger(this.alchemySkillLevel)} · 采集 Lv ${formatDisplayInteger(this.gatherSkillLevel)}`
      : `强化 Lv ${formatDisplayInteger(this.enhancementSkillLevel)}`;
    const existingBody = detailModalHost.isOpenFor(CraftWorkbenchModal.MODAL_OWNER)
      ? document.getElementById('detail-modal-body')
      : null;
    if (existingBody && this.patchBody(existingBody, title, subtitle)) {
      return;
    }
    detailModalHost.open({
      ownerId: CraftWorkbenchModal.MODAL_OWNER,
      size: 'full',
      variantClass: 'detail-modal--market',
      title,
      subtitle,
      renderBody: (body) => {
        body.innerHTML = `<div data-craft-workbench-body="true">${this.activeMode === 'alchemy' ? this.renderAlchemyBody() : this.renderEnhancementBody()}</div>`;
      },
      onAfterRender: (body) => this.bindActions(body),
      onClose: () => {
        this.activeMode = null;
        this.loading = false;
      },
    });
  }

  /** patchBody：局部刷新工坊弹层。 */
  private patchBody(body: HTMLElement, title: string, subtitle: string): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const shell = body.querySelector<HTMLElement>('[data-craft-workbench-body="true"]');
    const titleNode = document.getElementById('detail-modal-title');
    const subtitleNode = document.getElementById('detail-modal-subtitle');
    if (!shell || !titleNode || !subtitleNode) {
      return false;
    }
    titleNode.textContent = title;
    subtitleNode.textContent = subtitle;
    shell.innerHTML = this.activeMode === 'alchemy' ? this.renderAlchemyBody() : this.renderEnhancementBody();
    this.bindActions(body);
    return true;
  }

  /** bindActions：绑定动作。 */
  private bindActions(body: HTMLElement): void {
    body.querySelectorAll<HTMLButtonElement>('[data-craft-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.craftAction;
        if (action === 'start-alchemy') {
          const recipeId = button.dataset.recipeId ?? '';
          const entry = this.alchemyCatalog.find((candidate) => candidate.recipeId === recipeId);
          if (!entry) {
            return;
          }
          this.callbacks?.onStartAlchemy(recipeId, entry.ingredients.map((ingredient) => ({
            itemId: ingredient.itemId,
            count: ingredient.count,
          })), 1);
          return;
        }
        if (action === 'cancel-alchemy') {
          this.callbacks?.onCancelAlchemy();
          return;
        }
        if (action === 'start-enhancement') {
          const source = button.dataset.targetSource === 'equipment' ? 'equipment' : 'inventory';
          const card = button.closest<HTMLElement>('[data-enhancement-card]');
          const targetLevelInput = card?.querySelector<HTMLInputElement>('[data-enhancement-target-level]');
          const protectionStartInput = card?.querySelector<HTMLInputElement>('[data-enhancement-protection-start]');
          const protectionSelect = card?.querySelector<HTMLSelectElement>('[data-enhancement-protection-select]');
          const payload: NEXT_C2S_StartEnhancement = {
            target: source === 'equipment'
              ? { source: 'equipment', slot: 'weapon' }
              : { source: 'inventory', slotIndex: 0 },
          };
          if (source === 'equipment') {
            const slot = toEquipSlot(button.dataset.targetSlot);
            if (!slot) {
              return;
            }
            payload.target = { source, slot };
          } else {
            const slotIndex = Number(button.dataset.targetSlotIndex ?? '');
            if (!Number.isInteger(slotIndex) || slotIndex < 0) {
              return;
            }
            payload.target = { source, slotIndex };
          }
          const targetLevel = Number(targetLevelInput?.value ?? '');
          if (Number.isFinite(targetLevel) && targetLevel > 0) {
            payload.targetLevel = Math.max(1, Math.min(MAX_ENHANCEMENT_LEVEL, Math.floor(targetLevel)));
          }
          if (button.dataset.useProtection === 'true') {
            const selectedProtection = (protectionSelect?.value ?? '').trim();
            if (selectedProtection === 'self') {
              payload.protection = payload.target;
            } else if (selectedProtection.startsWith('inventory:')) {
              const protectionSlotIndex = Number(selectedProtection.slice('inventory:'.length));
              if (!Number.isInteger(protectionSlotIndex) || protectionSlotIndex < 0) {
                return;
              }
              payload.protection = { source: 'inventory', slotIndex: protectionSlotIndex };
            } else {
              return;
            }
            const protectionStartLevel = Number(protectionStartInput?.value ?? '');
            if (Number.isFinite(protectionStartLevel) && protectionStartLevel > 0) {
              payload.protectionStartLevel = Math.max(2, Math.min(MAX_ENHANCEMENT_LEVEL, Math.floor(protectionStartLevel)));
            }
          }
          this.callbacks?.onStartEnhancement(payload);
          return;
        }
        if (action === 'cancel-enhancement') {
          this.callbacks?.onCancelEnhancement();
        }
      });
    });
  }

  /** renderAlchemyBody：渲染炼丹身体。 */
  private renderAlchemyBody(): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const state = this.alchemyPanel?.state ?? null;
    if (this.loading && !this.alchemyPanel) {
      return renderEmpty('丹炉同步中……');
    }
    if (!state) {
      return renderEmpty(this.alchemyPanel?.error ?? '尚未装备丹炉。');
    }
    const catalog = this.alchemyCatalog;
    const jobRecipe = state.job ? catalog.find((entry) => entry.recipeId === state.job?.recipeId) ?? null : null;
    const stats = [
      renderKeyValueCard('丹炉', state.furnaceItemId ?? '未识别'),
      renderKeyValueCard('配方', formatDisplayInteger(catalog.length)),
      renderKeyValueCard('预设', formatDisplayInteger(state.presets.length)),
      renderKeyValueCard('炼制中', state.job ? '是' : '否'),
    ].join('');
    const jobSection = state.job
      ? `
        <section class="ui-surface-pane ui-surface-pane--stack">
          <div class="ui-title-block">
            <div class="ui-title-block-title">${escapeHtml(jobRecipe?.outputName ?? state.job.outputItemId)}</div>
            <div class="ui-title-block-subtitle">进行中 · ${state.job.phase} · 成功率 ${escapeHtml(formatPercentRate(state.job.successRate))}</div>
          </div>
          <div class="ui-detail-grid ui-detail-grid--section">
            <div class="ui-detail-field ui-detail-field--section"><strong>总批次</strong><span>${formatDisplayInteger(state.job.quantity)}</span></div>
            <div class="ui-detail-field ui-detail-field--section"><strong>已完成</strong><span>${formatDisplayInteger(state.job.completedCount)}</span></div>
            <div class="ui-detail-field ui-detail-field--section"><strong>成功/失败</strong><span>${formatDisplayInteger(state.job.successCount)} / ${formatDisplayInteger(state.job.failureCount)}</span></div>
            <div class="ui-detail-field ui-detail-field--section"><strong>剩余</strong><span>${escapeHtml(formatTicks(state.job.remainingTicks))}</span></div>
            <div class="ui-detail-field ui-detail-field--section"><strong>单炉耗时</strong><span>${escapeHtml(formatTicks(state.job.batchBrewTicks))}</span></div>
            <div class="ui-detail-field ui-detail-field--section"><strong>灵石消耗</strong><span>${formatDisplayInteger(state.job.spiritStoneCost)}</span></div>
          </div>
          <div class="ui-card-list">
            ${state.job.ingredients.map((ingredient) => `
              <div class="ui-surface-card ui-surface-card--compact">
                <div><strong>${escapeHtml(ingredient.itemId)}</strong> × ${formatDisplayInteger(ingredient.count)}</div>
                <div class="ui-detail-inline-hint">本炉投料</div>
              </div>
            `).join('')}
          </div>
          <div><button class="small-btn" type="button" data-craft-action="cancel-alchemy">停炉</button></div>
        </section>
      `
      : '';
    const presetSection = state.presets.length > 0
      ? `
        <section class="ui-surface-pane ui-surface-pane--stack">
          <div class="ui-title-block">
            <div class="ui-title-block-title">预设丹方</div>
            <div class="ui-title-block-subtitle">当前只读展示，启动/保存链路后续再补</div>
          </div>
          <div class="ui-card-list">
            ${state.presets.map((preset) => `
              <div class="ui-surface-card ui-surface-card--compact">
                <div><strong>${escapeHtml(preset.name)}</strong></div>
                <div class="ui-detail-inline-hint">${escapeHtml(preset.recipeId)} · ${formatDisplayInteger(preset.ingredients.length)} 味材料</div>
              </div>
            `).join('')}
          </div>
        </section>
      `
      : '';
    const catalogSection = catalog.length > 0
      ? `
        <section class="ui-surface-pane ui-surface-pane--stack">
          <div class="ui-title-block">
            <div class="ui-title-block-title">配方目录</div>
            <div class="ui-title-block-subtitle">目录版本 ${formatDisplayInteger(this.alchemyCatalogVersion)} · 按需详情下发</div>
          </div>
          <div class="ui-card-list">
            ${catalog.map((entry) => `
              <div class="ui-surface-card ui-surface-card--compact">
                <div><strong>${escapeHtml(entry.outputName)}</strong></div>
                <div class="ui-detail-inline-hint">${escapeHtml(entry.recipeId)} · ${escapeHtml(entry.category === 'buff' ? '增益丹' : '回复丹')}</div>
                <div class="ui-detail-grid ui-detail-grid--section">
                  <div class="ui-detail-field ui-detail-field--section"><strong>产量</strong><span>${formatDisplayInteger(entry.outputCount)}</span></div>
                  <div class="ui-detail-field ui-detail-field--section"><strong>品级</strong><span>Lv.${formatDisplayInteger(entry.outputLevel)}</span></div>
                  <div class="ui-detail-field ui-detail-field--section"><strong>耗时</strong><span>${escapeHtml(formatTicks(entry.baseBrewTicks))}</span></div>
                  <div class="ui-detail-field ui-detail-field--section"><strong>满炉药力</strong><span>${formatDisplayInteger(entry.fullPower)}</span></div>
                </div>
                <div class="ui-card-list">
                  ${entry.ingredients.map((ingredient) => `
                    <div class="ui-surface-card ui-surface-card--compact">
                      <div><strong>${escapeHtml(ingredient.name)}</strong> × ${formatDisplayInteger(ingredient.count)}</div>
                      <div class="ui-detail-inline-hint">${escapeHtml(ingredient.role === 'main' ? '主药' : '辅药')} · ${escapeHtml(getTechniqueGradeLabel(ingredient.grade))} · Lv.${formatDisplayInteger(ingredient.level)} · 药力 ${formatDisplayInteger(ingredient.powerPerUnit)}</div>
                    </div>
                  `).join('')}
                </div>
                ${state.job ? '<div class="ui-detail-inline-hint">当前已有炼丹任务在进行中。</div>' : `<div><button class="small-btn" type="button" data-craft-action="start-alchemy" data-recipe-id="${escapeHtml(entry.recipeId)}">炼 1 炉</button></div>`}
              </div>
            `).join('')}
          </div>
        </section>
      `
      : renderEmpty('当前未收到炼丹目录。');
    return `
      <div class="ui-card-list">
        ${stats}
      </div>
      ${jobSection}
      ${presetSection}
      ${catalogSection}
    `;
  }

  /** renderEnhancementBody：渲染强化身体。 */
  private renderEnhancementBody(): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const state = this.enhancementPanel?.state ?? null;
    if (this.loading && !this.enhancementPanel) {
      return renderEmpty('强化工坊同步中……');
    }
    if (!state) {
      return renderEmpty(this.enhancementPanel?.error ?? '尚未装备强化锤。');
    }
    const candidateCards = state.candidates.map((entry, index) => {
      const protectionOptions = entry.protectionCandidates
        .filter((candidate) => candidate.ref.source === 'inventory')
        .map((candidate) => ({
          value: `inventory:${candidate.ref.slotIndex ?? -1}`,
          label: `${candidate.item.name ?? candidate.item.itemId} · 背包槽位 ${formatDisplayInteger((candidate.ref.slotIndex ?? 0) + 1)}${typeof candidate.item.enhanceLevel === 'number' ? ` · +${formatDisplayInteger(candidate.item.enhanceLevel)}` : ''}`,
        }));
      const canSelfProtection = entry.allowSelfProtection
        && entry.ref.source === 'inventory'
        && Math.max(0, Math.floor(entry.item.count ?? 0)) > 1;
      if (canSelfProtection) {
        protectionOptions.unshift({
          value: 'self',
          label: '同槽同类自保',
        });
      }
      const canUseProtection = protectionOptions.length > 0;
      const defaultTargetLevel = Math.min(MAX_ENHANCEMENT_LEVEL, Math.max(entry.nextLevel, entry.nextLevel + 1));
      const defaultProtectionStart = Math.max(2, entry.nextLevel);
      const protectionHint = protectionOptions.length > 0
        ? `${formatDisplayInteger(protectionOptions.length)} 种可用`
        : (entry.protectionItemName ?? entry.protectionItemId ?? '无');
      return `
        <div class="ui-surface-card ui-surface-card--compact" data-enhancement-card="${index}">
          ${renderItemSummary(entry.item)}
          <div class="ui-detail-grid ui-detail-grid--section">
            <div class="ui-detail-field ui-detail-field--section"><strong>来源</strong><span>${escapeHtml(entry.ref.source === 'equipment' ? `装备栏 · ${getEquipSlotLabel(entry.ref.slot ?? 'weapon')}` : `背包槽位 ${formatDisplayInteger((entry.ref.slotIndex ?? 0) + 1)}`)}</span></div>
            <div class="ui-detail-field ui-detail-field--section"><strong>等级</strong><span>+${formatDisplayInteger(entry.currentLevel)} -> +${formatDisplayInteger(entry.nextLevel)}</span></div>
            <div class="ui-detail-field ui-detail-field--section"><strong>成功率</strong><span>${escapeHtml(formatPercentRate(entry.successRate))}</span></div>
            <div class="ui-detail-field ui-detail-field--section"><strong>耗时</strong><span>${escapeHtml(formatTicks(entry.durationTicks))}</span></div>
            <div class="ui-detail-field ui-detail-field--section"><strong>灵石</strong><span>${formatDisplayInteger(entry.spiritStoneCost)}</span></div>
            <div class="ui-detail-field ui-detail-field--section"><strong>保护</strong><span>${escapeHtml(protectionHint)}</span></div>
          </div>
          ${entry.materials.length > 0 ? `
            <div class="ui-card-list">
              ${entry.materials.map((material) => `
                <div class="ui-surface-card ui-surface-card--compact">
                  <div><strong>${escapeHtml(material.name)}</strong> × ${formatDisplayInteger(material.count)}</div>
                  <div class="ui-detail-inline-hint">持有 ${formatDisplayInteger(material.ownedCount)} · ${escapeHtml(material.itemId)}</div>
                </div>
              `).join('')}
            </div>
          ` : '<div class="ui-detail-inline-hint">该阶无额外材料消耗。</div>'}
          ${state.job ? '<div class="ui-detail-inline-hint">当前已有强化任务在进行中。</div>' : `
            <div class="ui-detail-grid ui-detail-grid--section">
              <label class="ui-detail-field ui-detail-field--section">
                <strong>目标等级</strong>
                <span><input class="ui-input" type="number" min="${entry.nextLevel}" max="${MAX_ENHANCEMENT_LEVEL}" value="${defaultTargetLevel}" data-enhancement-target-level /></span>
              </label>
              ${canUseProtection ? `
                <label class="ui-detail-field ui-detail-field--section">
                  <strong>保护物</strong>
                  <span>
                    <select class="ui-input" data-enhancement-protection-select>
                      ${protectionOptions.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join('')}
                    </select>
                  </span>
                </label>
                <label class="ui-detail-field ui-detail-field--section">
                  <strong>保护起点</strong>
                  <span><input class="ui-input" type="number" min="${defaultProtectionStart}" max="${MAX_ENHANCEMENT_LEVEL}" value="${defaultProtectionStart}" data-enhancement-protection-start /></span>
                </label>
              ` : ''}
            </div>
            <div class="ui-card-list">
              <div><button class="small-btn" type="button" data-craft-action="start-enhancement" data-target-source="${escapeHtml(entry.ref.source)}"${typeof entry.ref.slotIndex === 'number' ? ` data-target-slot-index="${entry.ref.slotIndex}"` : ''}${entry.ref.slot ? ` data-target-slot="${escapeHtml(entry.ref.slot)}"` : ''}>强化</button></div>
              ${canUseProtection ? `<div><button class="small-btn" type="button" data-craft-action="start-enhancement" data-use-protection="true" data-target-source="${escapeHtml(entry.ref.source)}"${typeof entry.ref.slotIndex === 'number' ? ` data-target-slot-index="${entry.ref.slotIndex}"` : ''}${entry.ref.slot ? ` data-target-slot="${escapeHtml(entry.ref.slot)}"` : ''}>保护强化</button></div>` : ''}
            </div>
          `}
        </div>
      `;
    }).join('');
    const stats = [
      renderKeyValueCard('强化锤', state.hammerItemId ?? '未识别'),
      renderKeyValueCard('候选装备', formatDisplayInteger(state.candidates.length)),
      renderKeyValueCard('强化记录', formatDisplayInteger(state.records.length)),
      renderKeyValueCard('进行中', state.job ? '是' : '否'),
    ].join('');
    const jobSection = state.job
      ? `
        <section class="ui-surface-pane ui-surface-pane--stack">
          ${renderItemSummary(state.job.item)}
          <div class="ui-detail-grid ui-detail-grid--section">
            <div class="ui-detail-field ui-detail-field--section"><strong>当前/目标</strong><span>+${formatDisplayInteger(state.job.currentLevel)} -> +${formatDisplayInteger(state.job.targetLevel)}</span></div>
            <div class="ui-detail-field ui-detail-field--section"><strong>目标上限</strong><span>+${formatDisplayInteger(state.job.desiredTargetLevel)}</span></div>
            <div class="ui-detail-field ui-detail-field--section"><strong>成功率</strong><span>${escapeHtml(formatPercentRate(state.job.successRate))}</span></div>
            <div class="ui-detail-field ui-detail-field--section"><strong>剩余</strong><span>${escapeHtml(formatTicks(state.job.remainingTicks))}</span></div>
            <div class="ui-detail-field ui-detail-field--section"><strong>灵石</strong><span>${formatDisplayInteger(state.job.spiritStoneCost)}</span></div>
            <div class="ui-detail-field ui-detail-field--section"><strong>阶段</strong><span>${escapeHtml(state.job.phase)}</span></div>
            <div class="ui-detail-field ui-detail-field--section"><strong>保护</strong><span>${state.job.protectionUsed ? `${escapeHtml(state.job.protectionItemName ?? state.job.protectionItemId ?? '已启用')} · +${formatDisplayInteger(state.job.protectionStartLevel ?? 2)} 起生效` : '未启用'}</span></div>
          </div>
          <div class="ui-card-list">
            ${state.job.materials.map((entry) => `
              <div class="ui-surface-card ui-surface-card--compact">
                <div><strong>${escapeHtml(entry.itemId)}</strong> × ${formatDisplayInteger(entry.count)}</div>
              </div>
            `).join('')}
          </div>
          <div><button class="small-btn" type="button" data-craft-action="cancel-enhancement">停止强化</button></div>
        </section>
      `
      : '';
    const candidatesSection = state.candidates.length > 0
      ? `
        <section class="ui-surface-pane ui-surface-pane--stack">
          <div class="ui-title-block">
            <div class="ui-title-block-title">可强化装备</div>
            <div class="ui-title-block-subtitle">可设目标等级，并在有库存保护物时启用保护强化</div>
          </div>
          <div class="ui-card-list">
            ${candidateCards}
          </div>
        </section>
      `
      : renderEmpty('当前没有可强化装备。');
    const recordSection = state.records.length > 0
      ? `
        <section class="ui-surface-pane ui-surface-pane--stack">
          <div class="ui-title-block">
            <div class="ui-title-block-title">强化履历</div>
            <div class="ui-title-block-subtitle">按物品归档的最高层级与成败统计</div>
          </div>
          <div class="ui-card-list">
            ${state.records.map((record) => `
              <div class="ui-surface-card ui-surface-card--compact">
                <div><strong>${escapeHtml(record.itemId)}</strong></div>
                <div class="ui-detail-inline-hint">最高 +${formatDisplayInteger(record.highestLevel)}${record.status ? ` · ${escapeHtml(record.status)}` : ''}</div>
                <div class="ui-card-list">
                  ${record.levels.map((level) => `
                    <div class="ui-surface-card ui-surface-card--compact">
                      <div><strong>+${formatDisplayInteger(level.targetLevel)}</strong></div>
                      <div class="ui-detail-inline-hint">成 ${formatDisplayInteger(level.successCount)} · 败 ${formatDisplayInteger(level.failureCount)}</div>
                    </div>
                  `).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </section>
      `
      : '';
    return `
      <div class="ui-card-list">
        ${stats}
      </div>
      ${jobSection}
      ${candidatesSection}
      ${recordSection}
    `;
  }
}
