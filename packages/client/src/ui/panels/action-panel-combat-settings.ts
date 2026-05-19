/**
 * 战斗设置子面板
 * 负责战斗设置弹层和索敌方案配置。
 * 从 action-panel.ts 拆分而来。
 */
import type {
  AutoBattleTargetingMode,
  AutoUsePillCondition,
  AutoUsePillConfig,
  CombatTargetingRuleKey,
  CombatTargetingRules,
  ItemStack,
} from '@mud/shared';
import { detailModalHost } from '../detail-modal-host';
import { t } from '../i18n';
import { buildItemTooltipPayload } from '../equipment-tooltip';
import { getLocalItemTemplate, resolvePreviewItem } from '../../content/local-templates';
import { formatDisplayNumber } from '../../utils/number';
import { escapeHtml, isAutoUseConsumableCandidate, isRecord } from './action-panel-helpers';
import type { ActionPanel } from './action-panel';
import type {
  ActionPanelInternal,
  AutoUsePillViewEntry,
  CombatTargetingCardOption,
  SkillPresetStatus,
} from './action-panel-internal';

// ─── 本地常量 ───

const UNKNOWN_AUTO_USE_PILL_NAME = '未知物品';

const AUTO_BATTLE_TARGETING_MODE_OPTIONS: Array<{ mode: AutoBattleTargetingMode; label: string; summary: string }> = [
  { mode: 'auto', label: t('action.targeting-plan.mode.auto.label', undefined), summary: t('action.targeting-plan.mode.auto.summary', undefined) },
  { mode: 'nearest', label: t('action.targeting-plan.mode.nearest.label', undefined), summary: t('action.targeting-plan.mode.nearest.summary', undefined) },
  { mode: 'low_hp', label: t('action.targeting-plan.mode.low-hp.label', undefined), summary: t('action.targeting-plan.mode.low-hp.summary', undefined) },
  { mode: 'full_hp', label: t('action.targeting-plan.mode.full-hp.label', undefined), summary: t('action.targeting-plan.mode.full-hp.summary', undefined) },
  { mode: 'boss', label: t('action.targeting-plan.mode.boss.label', undefined), summary: t('action.targeting-plan.mode.boss.summary', undefined) },
  { mode: 'player', label: t('action.targeting-plan.mode.player.label', undefined), summary: t('action.targeting-plan.mode.player.summary', undefined) },
];

const HOSTILE_TARGETING_KEYS = new Set<CombatTargetingRuleKey>([
  'monster', 'all_players', 'demonized_players', 'retaliators', 'party', 'sect', 'terrain',
]);

const FRIENDLY_TARGETING_KEYS = new Set<CombatTargetingRuleKey>([
  'monster', 'terrain', 'non_hostile_players', 'all_players', 'retaliators', 'party', 'sect',
]);

const DEFAULT_HOSTILE_COMBAT_TARGETING_RULES: CombatTargetingRuleKey[] = [
  'monster', 'demonized_players', 'retaliators', 'terrain',
];

const DEFAULT_FRIENDLY_COMBAT_TARGETING_RULES: CombatTargetingRuleKey[] = [
  'non_hostile_players',
];

// ─── 子面板类 ───

export class CombatSettingsSubpanel {
  private readonly p: ActionPanelInternal;

  constructor(parent: ActionPanel) {
    this.p = parent as unknown as ActionPanelInternal;
  }

  // ─── 打开/关闭 ───

  openCombatSettingsModal(): void {
    this.syncAutoUsePillDraft();
    this.syncCombatTargetingDraft();
    this.p.combatSettingsStatus = null;
    this.p.combatSettingsActiveTab = 'auto_pills';
    this.p.autoUsePillSelectedIndex = 0;
    this.p.autoUsePillSubview = 'main';
    this.renderCombatSettingsModal();
  }

  openTargetingPlanModal(): void {
    this.renderTargetingPlanModal();
  }

  renderCombatSettingsModalIfOpen(): void {
    if (!detailModalHost.isOpenFor(this.p.COMBAT_SETTINGS_MODAL_OWNER)) {
      return;
    }
    const nextRevision = this.buildCombatSettingsExternalRevision();
    if (this.p.combatSettingsExternalRevision === nextRevision) {
      return;
    }
    this.renderCombatSettingsModal();
  }

  renderTargetingPlanModalIfOpen(): void {
    if (!detailModalHost.isOpenFor(this.p.TARGETING_PLAN_MODAL_OWNER)) {
      return;
    }
    const nextRevision = this.getAutoBattleTargetingMode();
    if (this.p.targetingPlanExternalRevision === nextRevision) {
      return;
    }
    this.renderTargetingPlanModal();
  }

  // ─── 目标选择规则 ───

  getCombatTargetingRules(): CombatTargetingRules {
    const source = this.p.previewPlayer?.combatTargetingRules ?? {};
    const defaults = this.buildDefaultCombatTargetingRules(this.p.allowAoePlayerHit);
    const hostile = this.normalizeCombatTargetingScope(
      source.hostile,
      HOSTILE_TARGETING_KEYS,
      defaults.hostile ?? [],
    );
    const friendly = this.normalizeCombatTargetingScope(
      source.friendly,
      FRIENDLY_TARGETING_KEYS,
      defaults.friendly ?? [],
    );
    return {
      hostile,
      friendly,
    };
  }

  cloneCombatTargetingRules(rules: CombatTargetingRules): CombatTargetingRules {
    const defaults = this.buildDefaultCombatTargetingRules((rules.hostile ?? []).includes('all_players'));
    const hostile = this.normalizeCombatTargetingScope(
      rules.hostile,
      HOSTILE_TARGETING_KEYS,
      defaults.hostile ?? [],
    );
    const friendly = this.normalizeCombatTargetingScope(
      rules.friendly,
      FRIENDLY_TARGETING_KEYS,
      defaults.friendly ?? [],
    );
    return {
      hostile,
      friendly,
    };
  }

  buildDefaultCombatTargetingRules(includeAllPlayersHostile = false): CombatTargetingRules {
    const hostile = [...DEFAULT_HOSTILE_COMBAT_TARGETING_RULES];
    if (includeAllPlayersHostile && !hostile.includes('all_players')) {
      hostile.push('all_players');
    }
    return {
      hostile,
      friendly: [...DEFAULT_FRIENDLY_COMBAT_TARGETING_RULES],
    };
  }

  areCombatTargetingRulesEqual(left: CombatTargetingRules | null | undefined, right: CombatTargetingRules | null | undefined): boolean {
    const normalizedLeft = this.cloneCombatTargetingRules(left ?? this.getCombatTargetingRules());
    const normalizedRight = this.cloneCombatTargetingRules(right ?? this.getCombatTargetingRules());
    if (normalizedLeft.hostile?.length !== normalizedRight.hostile?.length
      || normalizedLeft.friendly?.length !== normalizedRight.friendly?.length) {
      return false;
    }
    if ((normalizedLeft.hostile ?? []).some((entry, index) => entry !== normalizedRight.hostile?.[index])) {
      return false;
    }
    if ((normalizedLeft.friendly ?? []).some((entry, index) => entry !== normalizedRight.friendly?.[index])) {
      return false;
    }
    return true;
  }

  getAutoBattleTargetingMode(): AutoBattleTargetingMode {
    return this.p.previewPlayer?.autoBattleTargetingMode ?? 'auto';
  }

  getAutoBattleTargetingModeLabel(mode = this.getAutoBattleTargetingMode()): string {
    return AUTO_BATTLE_TARGETING_MODE_OPTIONS.find((entry) => entry.mode === mode)?.label ?? t('action.targeting-plan.mode.auto.label', undefined);
  }

  syncCombatTargetingDraft(): CombatTargetingRules {
    const nextDraft = this.cloneCombatTargetingRules(this.p.combatTargetingDraft ?? this.getCombatTargetingRules());
    this.p.combatTargetingDraft = nextDraft;
    return nextDraft;
  }

  // ─── 自动吃药 ───

  cloneAutoUsePillConfigs(configs: AutoUsePillConfig[]): AutoUsePillConfig[] {
    return configs.map((entry) => ({
      itemId: entry.itemId,
      conditions: entry.conditions.map((condition) => ({ ...condition })),
    }));
  }

  normalizeAutoUsePillsLocal(configs: AutoUsePillConfig[] | null | undefined): AutoUsePillConfig[] {
    const entries = Array.isArray(configs) ? configs : [];
    const seen = new Set<string>();
    const normalized: AutoUsePillConfig[] = [];
    for (const entry of entries) {
      const itemId = typeof entry?.itemId === 'string' ? entry.itemId.trim() : '';
      if (!itemId || seen.has(itemId)) {
        continue;
      }
      seen.add(itemId);
      normalized.push({
        itemId,
        conditions: Array.isArray(entry.conditions)
          ? entry.conditions
            .filter((condition) => condition?.type === 'resource_ratio' || condition?.type === 'buff_missing')
            .slice(0, 4)
            .map((condition) => ({ ...condition }))
          : [],
      });
      if (normalized.length >= this.p.AUTO_USE_PILL_SLOT_LIMIT) {
        break;
      }
    }
    return normalized;
  }

  getAutoUsePills(): AutoUsePillConfig[] {
    return this.normalizeAutoUsePillsLocal(this.p.previewPlayer?.autoUsePills ?? []);
  }

  syncAutoUsePillDraft(): AutoUsePillConfig[] {
    const nextDraft = this.normalizeAutoUsePillsLocal(this.p.autoUsePillDraft ?? this.getAutoUsePills());
    this.p.autoUsePillDraft = nextDraft;
    return nextDraft;
  }

  areAutoUsePillConfigsEqual(left: AutoUsePillConfig[] | null | undefined, right: AutoUsePillConfig[] | null | undefined): boolean {
    const normalizedLeft = this.normalizeAutoUsePillsLocal(left);
    const normalizedRight = this.normalizeAutoUsePillsLocal(right);
    if (normalizedLeft.length !== normalizedRight.length) {
      return false;
    }
    return normalizedLeft.every((entry, index) => JSON.stringify(entry) === JSON.stringify(normalizedRight[index]));
  }

  getAutoUsePillViewEntries(): AutoUsePillViewEntry[] {
    const entries = new Map<string, AutoUsePillViewEntry>();
    const draft = this.syncAutoUsePillDraft();
    for (const item of this.p.previewPlayer?.inventory.items ?? []) {
      const previewItem = resolvePreviewItem(item);
      if (!isAutoUseConsumableCandidate(previewItem)) {
        continue;
      }
      const config = draft.find((entry) => entry.itemId === item.itemId);
      entries.set(item.itemId, {
        itemId: item.itemId,
        name: previewItem.name,
        desc: previewItem.desc || '',
        count: item.count,
        healAmount: previewItem.healAmount,
        healPercent: previewItem.healPercent,
        qiPercent: previewItem.qiPercent,
        consumeBuffs: previewItem.consumeBuffs?.map((buff) => ({ buffId: buff.buffId, name: buff.name })),
        selected: Boolean(config),
        conditions: config?.conditions ?? [],
      });
    }
    for (const config of draft) {
      if (entries.has(config.itemId)) {
        continue;
      }
      const template = getLocalItemTemplate(config.itemId);
      entries.set(config.itemId, {
        itemId: config.itemId,
        name: template?.name ?? UNKNOWN_AUTO_USE_PILL_NAME,
        desc: template?.desc ?? t('action.combat-settings.pill.missing-inventory-desc', undefined),
        count: 0,
        healAmount: template?.healAmount,
        healPercent: template?.healPercent,
        qiPercent: template?.qiPercent,
        consumeBuffs: template?.consumeBuffs?.map((buff) => ({ buffId: buff.buffId, name: buff.name })),
        selected: true,
        conditions: config.conditions,
      });
    }
    return [...entries.values()].sort((left, right) => {
      if (left.selected !== right.selected) {
        return left.selected ? -1 : 1;
      }
      if (left.count !== right.count) {
        return right.count - left.count;
      }
      return left.name.localeCompare(right.name, 'zh-Hans-CN');
    });
  }

  private buildDefaultAutoUsePillConditions(entry: AutoUsePillViewEntry): AutoUsePillCondition[] {
    if ((entry.consumeBuffs?.length ?? 0) > 0) {
      return [{ type: 'buff_missing' }];
    }
    if ((entry.qiPercent ?? 0) > 0) {
      return [{ type: 'resource_ratio', resource: 'qi', op: 'lt', thresholdPct: 60 }];
    }
    return [{ type: 'resource_ratio', resource: 'hp', op: 'lt', thresholdPct: 60 }];
  }

  private applyAutoUsePillDraftMutation(mutator: (draft: AutoUsePillConfig[]) => AutoUsePillConfig[]): void {
    this.resetCombatSettingsCloseConfirm();
    const next = this.normalizeAutoUsePillsLocal(mutator(this.cloneAutoUsePillConfigs(this.syncAutoUsePillDraft())));
    this.p.autoUsePillDraft = next;
    this.p.autoUsePillSelectedIndex = Math.max(0, Math.min(this.p.autoUsePillSelectedIndex, this.p.AUTO_USE_PILL_SLOT_LIMIT - 1));
    this.renderCombatSettingsModal();
  }

  private getSelectedAutoUsePillConfig(): AutoUsePillConfig | null {
    return this.syncAutoUsePillDraft()[this.p.autoUsePillSelectedIndex] ?? null;
  }

  openAutoUsePillPicker(slotIndex: number): void {
    this.syncAutoUsePillDraft();
    this.p.autoUsePillSelectedIndex = Math.max(0, Math.min(slotIndex, this.p.AUTO_USE_PILL_SLOT_LIMIT - 1));
    this.p.autoUsePillSubview = 'picker';
    this.renderCombatSettingsModal();
  }

  openAutoUsePillConditionSettings(slotIndex = this.p.autoUsePillSelectedIndex): void {
    this.p.autoUsePillSelectedIndex = Math.max(0, Math.min(slotIndex, this.p.AUTO_USE_PILL_SLOT_LIMIT - 1));
    if (!this.getSelectedAutoUsePillConfig()) {
      return;
    }
    this.p.autoUsePillSubview = 'conditions';
    this.renderCombatSettingsModal();
  }

  closeAutoUsePillSubview(): void {
    this.p.autoUsePillSubview = 'main';
    this.renderCombatSettingsModal();
  }

  getAutoUsePillPickerEntries(): AutoUsePillViewEntry[] {
    const draft = this.syncAutoUsePillDraft();
    const currentItemId = draft[this.p.autoUsePillSelectedIndex]?.itemId ?? null;
    return this.getAutoUsePillViewEntries().filter((entry) => !entry.selected || entry.itemId === currentItemId);
  }

  private buildAutoUsePillTooltipItem(itemId: string): ItemStack | null {
    const inventoryItem = this.p.previewPlayer?.inventory.items.find((item) => item.itemId === itemId);
    if (inventoryItem) {
      return resolvePreviewItem(inventoryItem);
    }
    const template = getLocalItemTemplate(itemId);
    if (!template) {
      return null;
    }
    return {
      ...template,
      count: 1,
      name: template.name?.trim() || UNKNOWN_AUTO_USE_PILL_NAME,
      desc: template.desc ?? '',
      type: template.type ?? 'consumable',
    } as ItemStack;
  }

  private buildAutoUsePillSlotTooltipPayload(itemId: string): ReturnType<typeof buildItemTooltipPayload> | null {
    const item = this.buildAutoUsePillTooltipItem(itemId);
    if (!item) {
      return null;
    }
    const payload = buildItemTooltipPayload(item, { playerRealmLv: this.p.previewPlayer?.realm?.realmLv ?? this.p.previewPlayer?.realmLv });
    const config = this.syncAutoUsePillDraft().find((entry) => entry.itemId === itemId);
    if (config) {
      payload.lines = [
        ...payload.lines,
        `<span class="skill-tooltip-detail">${escapeHtml(t('action.combat-settings.pill.tooltip.condition', {
          summary: this.renderAutoUsePillConditionSummary(config.conditions),
        }))}</span>`,
      ];
    }
    return payload;
  }

  assignAutoUsePillToSelectedSlot(itemId: string): void {
    const entry = this.getAutoUsePillViewEntries().find((candidate) => candidate.itemId === itemId);
    if (!entry) {
      return;
    }
    const selectedIndex = this.p.autoUsePillSelectedIndex;
    this.p.autoUsePillSubview = 'main';
    this.applyAutoUsePillDraftMutation((draft) => {
      const next = [...draft];
      const existingIndex = next.findIndex((candidate) => candidate.itemId === itemId);
      const existingConfig = existingIndex >= 0 ? next[existingIndex] : null;
      if (existingIndex >= 0) {
        next.splice(existingIndex, 1);
      }
      let insertIndex = Math.max(0, Math.min(selectedIndex, next.length));
      if (existingIndex >= 0 && existingIndex < selectedIndex) {
        insertIndex = Math.max(0, insertIndex - 1);
      }
      const replacement: AutoUsePillConfig = existingConfig
        ? this.cloneAutoUsePillConfigs([existingConfig])[0]!
        : {
          itemId,
          conditions: this.buildDefaultAutoUsePillConditions(entry),
        };
      if (insertIndex < next.length) {
        next.splice(insertIndex, 1, replacement);
      } else {
        next.push(replacement);
      }
      return next;
    });
  }

  clearSelectedAutoUsePillSlot(): void {
    const selectedIndex = this.p.autoUsePillSelectedIndex;
    this.p.autoUsePillSubview = 'main';
    this.applyAutoUsePillDraftMutation((draft) => draft.filter((_, index) => index !== selectedIndex));
  }

  updateAutoUsePillCondition(
    itemId: string,
    conditionIndex: number,
    updater: (condition: AutoUsePillCondition) => AutoUsePillCondition,
  ): void {
    this.applyAutoUsePillDraftMutation((draft) => draft.map((entry) => {
      if (entry.itemId !== itemId) {
        return entry;
      }
      return {
        ...entry,
        conditions: entry.conditions.map((condition, index) => (
          index === conditionIndex ? updater(condition) : condition
        )),
      };
    }));
  }

  removeAutoUsePillCondition(itemId: string, conditionIndex: number): void {
    this.applyAutoUsePillDraftMutation((draft) => draft.map((entry) => {
      if (entry.itemId !== itemId) {
        return entry;
      }
      return {
        ...entry,
        conditions: entry.conditions.filter((_, index) => index !== conditionIndex),
      };
    }));
  }

  addAutoUsePillCondition(itemId: string, kind: 'hp' | 'qi' | 'buff_missing'): void {
    this.applyAutoUsePillDraftMutation((draft) => draft.map((entry) => {
      if (entry.itemId !== itemId) {
        return entry;
      }
      const nextCondition: AutoUsePillCondition = kind === 'buff_missing'
        ? { type: 'buff_missing' }
        : { type: 'resource_ratio', resource: kind, op: 'lt', thresholdPct: 60 };
      return {
        ...entry,
        conditions: [...entry.conditions, nextCondition],
      };
    }));
  }

  renderAutoUsePillConditionRow(itemId: string, condition: AutoUsePillCondition, conditionIndex: number): string {
    if (condition.type === 'buff_missing') {
      return `
        <div class="auto-pill-condition-row auto-pill-condition-row--wide">
          <div class="auto-pill-condition-static">${t('action.combat-settings.auto-pills.condition.buff-missing', undefined)}</div>
          <button class="small-btn ghost" data-auto-pill-condition-remove="${escapeHtml(itemId)}" data-condition-index="${conditionIndex}" type="button">${t('action.combat-settings.auto-pills.condition.remove', undefined)}</button>
        </div>
      `;
    }
    return `
      <div class="auto-pill-condition-row">
        <select data-auto-pill-condition-resource="${escapeHtml(itemId)}" data-condition-index="${conditionIndex}">
          <option value="hp" ${condition.resource === 'hp' ? 'selected' : ''}>${t('action.combat-settings.auto-pills.condition.resource.hp', undefined)}</option>
          <option value="qi" ${condition.resource === 'qi' ? 'selected' : ''}>${t('action.combat-settings.auto-pills.condition.resource.qi', undefined)}</option>
        </select>
        <select data-auto-pill-condition-op="${escapeHtml(itemId)}" data-condition-index="${conditionIndex}">
          <option value="lt" ${condition.op === 'lt' ? 'selected' : ''}>${t('action.combat-settings.auto-pills.condition.op.lt', undefined)}</option>
          <option value="gt" ${condition.op === 'gt' ? 'selected' : ''}>${t('action.combat-settings.auto-pills.condition.op.gt', undefined)}</option>
        </select>
        <input type="number" min="0" max="100" step="1" value="${condition.thresholdPct}" data-auto-pill-condition-threshold="${escapeHtml(itemId)}" data-condition-index="${conditionIndex}" />
        <span class="auto-pill-condition-unit">%</span>
        <button class="small-btn ghost" data-auto-pill-condition-remove="${escapeHtml(itemId)}" data-condition-index="${conditionIndex}" type="button">${t('action.combat-settings.auto-pills.condition.remove', undefined)}</button>
      </div>
    `;
  }

  renderAutoUsePillConditionSummary(conditions: AutoUsePillCondition[]): string {
    if (conditions.length === 0) {
      return t('action.combat-settings.auto-pills.condition.none', undefined);
    }
    return conditions.map((condition) => {
      if (condition.type === 'buff_missing') {
        return t('action.combat-settings.auto-pills.condition.buff-missing', undefined);
      }
      return t('action.combat-settings.auto-pills.condition.resource-ratio', {
        resource: condition.resource === 'hp'
          ? t('action.combat-settings.auto-pills.condition.resource.hp', undefined)
          : t('action.combat-settings.auto-pills.condition.resource.qi', undefined),
        op: condition.op === 'lt'
          ? t('action.combat-settings.auto-pills.condition.op.lt', undefined)
          : t('action.combat-settings.auto-pills.condition.op.gt', undefined),
        thresholdPct: condition.thresholdPct,
      });
    }).join('；');
  }

  renderAutoUsePillEffectSummary(entry: AutoUsePillViewEntry): string {
    const parts: string[] = [];
    if ((entry.healAmount ?? 0) > 0) {
      parts.push(t('action.combat-settings.auto-pills.effect.heal-amount', { value: formatDisplayNumber(entry.healAmount ?? 0) }));
    }
    if ((entry.healPercent ?? 0) > 0) {
      parts.push(t('action.combat-settings.auto-pills.effect.heal-percent', { value: Math.round((entry.healPercent ?? 0) * 100) }));
    }
    if ((entry.qiPercent ?? 0) > 0) {
      parts.push(t('action.combat-settings.auto-pills.effect.qi-percent', { value: Math.round((entry.qiPercent ?? 0) * 100) }));
    }
    if ((entry.consumeBuffs?.length ?? 0) > 0) {
      parts.push(t('action.combat-settings.auto-pills.effect.buffs', {
        buffs: entry.consumeBuffs?.map((buff) => buff.name?.trim() || t('action.combat-settings.auto-pills.effect.buff-fallback', undefined)).join('、') ?? '',
      }));
    }
    return parts.join('；') || t('action.combat-settings.auto-pills.effect.fallback', undefined);
  }

  renderCombatTargetingSection(): string {
    const draft = this.syncCombatTargetingDraft();
    const hostileOptions: CombatTargetingCardOption[] = [
      { key: 'monster', scope: 'hostile', label: t('action.combat-settings.targeting.hostile.monster.label', undefined), summary: t('action.combat-settings.targeting.hostile.monster.summary', undefined), active: draft.hostile?.includes('monster') === true },
      { key: 'demonized_players', scope: 'hostile', label: t('action.combat-settings.targeting.hostile.demonized-players.label', undefined), summary: t('action.combat-settings.targeting.hostile.demonized-players.summary', undefined), active: draft.hostile?.includes('demonized_players') === true },
      { key: 'retaliators', scope: 'hostile', label: t('action.combat-settings.targeting.hostile.retaliators.label', undefined), summary: t('action.combat-settings.targeting.hostile.retaliators.summary', undefined), active: draft.hostile?.includes('retaliators') === true },
      { key: 'all_players', scope: 'hostile', label: t('action.combat-settings.targeting.hostile.all-players.label', undefined), summary: t('action.combat-settings.targeting.hostile.all-players.summary', undefined), active: draft.hostile?.includes('all_players') === true },
      { key: 'party', scope: 'hostile', label: t('action.combat-settings.targeting.hostile.party.label', undefined), summary: t('action.combat-settings.targeting.hostile.party.summary', undefined), disabled: true },
      { key: 'sect', scope: 'hostile', label: t('action.combat-settings.targeting.hostile.sect.label', undefined), summary: t('action.combat-settings.targeting.hostile.sect.summary', undefined), disabled: true },
      { key: 'terrain', scope: 'hostile', label: t('action.combat-settings.targeting.hostile.terrain.label', undefined), summary: t('action.combat-settings.targeting.hostile.terrain.summary', undefined), active: draft.hostile?.includes('terrain') === true },
    ];
    const friendlyOptions: CombatTargetingCardOption[] = [
      { key: 'non_hostile_players', scope: 'friendly', label: t('action.combat-settings.targeting.friendly.non-hostile-players.label', undefined), summary: t('action.combat-settings.targeting.friendly.non-hostile-players.summary', undefined), active: draft.friendly?.includes('non_hostile_players') === true },
      { key: 'all_players', scope: 'friendly', label: t('action.combat-settings.targeting.friendly.all-players.label', undefined), summary: t('action.combat-settings.targeting.friendly.all-players.summary', undefined), active: draft.friendly?.includes('all_players') === true },
      { key: 'retaliators', scope: 'friendly', label: t('action.combat-settings.targeting.friendly.retaliators.label', undefined), summary: t('action.combat-settings.targeting.friendly.retaliators.summary', undefined), active: draft.friendly?.includes('retaliators') === true },
      { key: 'party', scope: 'friendly', label: t('action.combat-settings.targeting.friendly.party.label', undefined), summary: t('action.combat-settings.targeting.friendly.party.summary', undefined), disabled: true },
      { key: 'sect', scope: 'friendly', label: t('action.combat-settings.targeting.friendly.sect.label', undefined), summary: t('action.combat-settings.targeting.friendly.sect.summary', undefined), disabled: true },
    ];
    return `
      <div class="combat-settings-targeting-shell">
        <div class="combat-settings-targeting-head">
          <div>
            <div class="skill-preset-card-title">${t('action.combat-settings.targeting.title', undefined)}</div>
            <div class="skill-preset-list-meta">${t('action.combat-settings.targeting.copy', undefined)}</div>
          </div>
          <span class="combat-settings-targeting-badge">${t('action.combat-settings.targeting.badge', undefined)}</span>
        </div>
        <div class="combat-settings-targeting-grid">
          <div class="combat-settings-targeting-card combat-settings-targeting-card--hostile">
            <div class="skill-preset-section-head">
              <div class="skill-preset-card-title">${t('action.combat-settings.targeting.hostile.title', undefined)}</div>
              <div class="skill-preset-list-meta">${t('action.combat-settings.targeting.hostile.copy', undefined)}</div>
            </div>
            <div class="combat-settings-toggle-grid">
              ${hostileOptions.map((option) => this.renderCombatTargetingOption(option)).join('')}
            </div>
          </div>
          <div class="combat-settings-targeting-card combat-settings-targeting-card--friendly">
            <div class="skill-preset-section-head">
              <div class="skill-preset-card-title">${t('action.combat-settings.targeting.friendly.title', undefined)}</div>
              <div class="skill-preset-list-meta">${t('action.combat-settings.targeting.friendly.copy', undefined)}</div>
            </div>
            <div class="combat-settings-toggle-grid">
              ${friendlyOptions.map((option) => this.renderCombatTargetingOption(option)).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderCombatTargetingOption(option: CombatTargetingCardOption): string {
    return `
      <button
        class="combat-settings-toggle-chip ${option.active ? 'active' : ''}"
        type="button"
        ${option.disabled ? 'disabled' : `data-combat-targeting-toggle="${escapeHtml(`${option.scope ?? 'hostile'}:${option.key ?? ''}`)}"`}
      >
        <span class="combat-settings-toggle-chip-box" aria-hidden="true"></span>
        <span class="combat-settings-toggle-chip-content">
          <span class="combat-settings-toggle-chip-title">
          ${escapeHtml(option.label)}
            ${option.disabled ? `<span class="combat-settings-toggle-chip-disabled-tag">${t('action.combat-settings.targeting.unavailable', undefined)}</span>` : ''}
          </span>
          <span class="combat-settings-toggle-chip-copy">${escapeHtml(option.summary)}</span>
        </span>
      </button>
    `;
  }

  renderCombatSettingsStatus(): string {
    if (!this.p.combatSettingsStatus) {
      return '';
    }
    return `<div class="skill-preset-status ui-status-text ${this.p.combatSettingsStatus.tone === 'error' ? 'error' : this.p.combatSettingsStatus.tone === 'success' ? 'success' : ''}">${escapeHtml(this.p.combatSettingsStatus.text)}</div>`;
  }

  // ─── 弹层生命周期 ───

  confirmDiscardCombatSettingsChanges(): boolean {
    if (this.areAutoUsePillConfigsEqual(this.p.autoUsePillDraft, this.getAutoUsePills())
      && this.areCombatTargetingRulesEqual(this.p.combatTargetingDraft, this.getCombatTargetingRules())) {
      return true;
    }
    return window.confirm(t('action.combat-settings.confirm-discard', undefined));
  }

  private resetCombatSettingsCloseConfirm(): void {
    if (this.p.combatSettingsStatus?.tone === 'info') {
      this.p.combatSettingsStatus = null;
    }
  }

  discardCombatSettingsDraft(): void {
    this.p.autoUsePillDraft = null;
    this.p.combatTargetingDraft = null;
    this.p.combatSettingsStatus = null;
    this.p.combatSettingsActiveTab = 'auto_pills';
    this.p.autoUsePillSelectedIndex = 0;
    this.p.autoUsePillSubview = 'main';
    this.p.autoUsePillTooltipNode = null;
    this.p.autoUsePillTooltip.hide(true);
    this.p.combatSettingsExternalRevision = null;
  }

  requestCombatSettingsClose(): void {
    if (!this.confirmDiscardCombatSettingsChanges()) {
      return;
    }
    this.discardCombatSettingsDraft();
    detailModalHost.close(this.p.COMBAT_SETTINGS_MODAL_OWNER);
  }

  applyCombatSettingsChanges(): void {
    const nextPills = this.syncAutoUsePillDraft();
    const nextRules = this.syncCombatTargetingDraft();
    const pillsChanged = !this.areAutoUsePillConfigsEqual(nextPills, this.getAutoUsePills());
    const rulesChanged = !this.areCombatTargetingRulesEqual(nextRules, this.getCombatTargetingRules());
    const allowAoeChanged = ((nextRules.hostile ?? []).includes('all_players')) !== this.p.allowAoePlayerHit;
    if (this.p.previewPlayer) {
      this.p.previewPlayer.autoUsePills = this.cloneAutoUsePillConfigs(nextPills);
      this.p.previewPlayer.combatTargetingRules = this.cloneCombatTargetingRules(nextRules);
      this.p.previewPlayer.allowAoePlayerHit = (nextRules.hostile ?? []).includes('all_players');
    }
    this.p.render(this.p.currentActions);
    this.discardCombatSettingsDraft();
    detailModalHost.close(this.p.COMBAT_SETTINGS_MODAL_OWNER);
    if (pillsChanged) {
      this.p.onUpdateAutoUsePills?.(nextPills);
    }
    if (rulesChanged) {
      this.p.onUpdateCombatTargetingRules?.(nextRules);
    }
    if (allowAoeChanged) {
      this.p.onAction?.('toggle:allow_aoe_player_hit', false, undefined, undefined, t('action.combat-settings.toggle-aoe', undefined));
    }
  }

  buildCombatSettingsExternalRevision(): string {
    return JSON.stringify({
      pills: this.getAutoUsePills(),
      rules: this.getCombatTargetingRules(),
      allowAoePlayerHit: this.p.allowAoePlayerHit,
    });
  }

  // ─── 私有辅助 ───

  private normalizeCombatTargetingScope(
    input: CombatTargetingRuleKey[] | null | undefined,
    allowed: ReadonlySet<CombatTargetingRuleKey>,
    fallback: CombatTargetingRuleKey[],
  ): CombatTargetingRuleKey[] {
    const source = Array.isArray(input) ? input : fallback;
    const normalized: CombatTargetingRuleKey[] = [];
    const seen = new Set<CombatTargetingRuleKey>();
    for (const raw of source) {
      if (!allowed.has(raw) || seen.has(raw)) {
        continue;
      }
      seen.add(raw);
      normalized.push(raw);
    }
    return normalized;
  }

  renderCombatSettingsModal(): void {
    this.p.autoUsePillTooltip.hide(true);
    this.p.autoUsePillTooltipNode = null;
    const pillDraft = this.syncAutoUsePillDraft();
    const entries = this.getAutoUsePillViewEntries();
    const currentConfig = pillDraft[this.p.autoUsePillSelectedIndex] ?? null;
    const currentEntry = currentConfig
      ? entries.find((entry) => entry.itemId === currentConfig.itemId) ?? null
      : null;
    const slotMarkup = Array.from({ length: this.p.AUTO_USE_PILL_SLOT_LIMIT }, (_, index) => {
      const slotConfig = pillDraft[index] ?? null;
      const slotEntry = slotConfig
        ? entries.find((entry) => entry.itemId === slotConfig.itemId) ?? null
        : null;
      const conditionSummary = slotConfig
        ? this.renderAutoUsePillConditionSummary(slotConfig.conditions)
        : t('action.combat-settings.auto-pills.slot.unset', undefined);
      return `
        <div class="auto-pill-slot-unit">
          <button
            class="auto-pill-slot ${index === this.p.autoUsePillSelectedIndex ? 'active' : ''} ${slotEntry ? 'filled' : 'empty'}"
            data-auto-pill-slot="${index}"
            ${slotEntry ? `data-auto-pill-slot-item-id="${escapeHtml(slotEntry.itemId)}"` : ''}
            type="button"
          >
            ${slotEntry
              ? `<span class="auto-pill-slot-name">${escapeHtml(slotEntry.name)}</span>
                <span class="auto-pill-slot-count">${slotEntry.count > 0 ? slotEntry.count : '-'}</span>`
              : `<span class="auto-pill-slot-empty">+</span>
                <span class="auto-pill-slot-label">${t('action.combat-settings.auto-pills.slot.empty', undefined)}</span>`}
          </button>
          <div class="auto-pill-slot-summary">${escapeHtml(conditionSummary)}</div>
          <button
            class="small-btn ghost auto-pill-slot-condition-btn"
            data-auto-pill-open-slot-conditions="${index}"
            type="button"
            ${slotEntry ? '' : 'disabled'}
          >${t('action.combat-settings.auto-pills.slot.conditions', undefined)}</button>
        </div>
      `;
    }).join('');
    const pickerEntries = this.getAutoUsePillPickerEntries();
    const pickerBody = pickerEntries.length === 0
      ? `<div class="empty-hint">${t('action.combat-settings.auto-pills.picker.empty', undefined)}</div>`
      : `<div class="auto-pill-picker-grid">
          ${pickerEntries.map((entry) => `
            <button
              class="auto-pill-picker-card ${currentEntry?.itemId === entry.itemId ? 'selected' : ''}"
              data-auto-pill-pick="${escapeHtml(entry.itemId)}"
              type="button"
            >
              <span class="auto-pill-picker-title">${escapeHtml(entry.name)}</span>
              <span class="auto-pill-picker-count">${entry.count > 0 ? entry.count : '-'}</span>
              <span class="auto-pill-picker-meta">${escapeHtml(this.renderAutoUsePillEffectSummary(entry))}</span>
            </button>
          `).join('')}
        </div>`;
    const conditionBody = currentEntry
      ? `<div class="auto-pill-condition-editor">
          <div class="auto-pill-condition-summary-card">
            <div class="auto-pill-card-title-row">
              <div class="auto-pill-card-title">${escapeHtml(currentEntry.name)}</div>
              <span class="auto-pill-card-count">${currentEntry.count > 0 ? currentEntry.count : '-'}</span>
            </div>
            <div class="auto-pill-card-meta">${escapeHtml(this.renderAutoUsePillEffectSummary(currentEntry))}</div>
            <div class="auto-pill-config-summary">${escapeHtml(this.renderAutoUsePillConditionSummary(currentConfig?.conditions ?? []))}</div>
          </div>
          <div class="auto-pill-condition-panel auto-pill-condition-panel--standalone">
            <div class="auto-pill-condition-head">
              <div class="skill-preset-card-title">${t('action.combat-settings.auto-pills.condition.title', undefined)}</div>
              <div class="skill-preset-list-meta">${t('action.combat-settings.auto-pills.condition.copy', undefined)}</div>
            </div>
            ${(currentConfig?.conditions.length ?? 0) > 0
              ? `<div class="auto-pill-condition-list">
                  ${currentConfig?.conditions.map((condition, conditionIndex) => this.renderAutoUsePillConditionRow(currentEntry.itemId, condition, conditionIndex)).join('')}
                </div>`
              : `<div class="empty-hint">${t('action.combat-settings.auto-pills.condition.empty', undefined)}</div>`}
            <div class="auto-pill-condition-actions">
              <button class="small-btn ghost" data-auto-pill-add-condition="${escapeHtml(currentEntry.itemId)}" data-condition-kind="hp" type="button">${t('action.combat-settings.auto-pills.condition.add-hp', undefined)}</button>
              <button class="small-btn ghost" data-auto-pill-add-condition="${escapeHtml(currentEntry.itemId)}" data-condition-kind="qi" type="button">${t('action.combat-settings.auto-pills.condition.add-qi', undefined)}</button>
              ${(currentEntry.consumeBuffs?.length ?? 0) > 0
                ? `<button class="small-btn ghost" data-auto-pill-add-condition="${escapeHtml(currentEntry.itemId)}" data-condition-kind="buff_missing" type="button">${t('action.combat-settings.auto-pills.condition.add-buff-missing', undefined)}</button>`
                : ''}
            </div>
          </div>
        </div>`
      : `<div class="empty-hint">${t('action.combat-settings.auto-pills.condition.no-item', undefined)}</div>`;
    const autoPillBody = `
      <div class="skill-preset-card auto-pill-hero-card">
        <div class="skill-preset-card-title">${t('action.combat-settings.auto-pills.title', undefined)}</div>
        <div class="skill-preset-card-copy">${t('action.combat-settings.auto-pills.copy', undefined)}</div>
      </div>
      <div class="auto-pill-slot-grid">${slotMarkup}</div>
    `;
    const targetingBody = this.renderCombatTargetingSection();
    const overviewBody = `
      <div class="auto-pill-shell">
        <div class="auto-pill-topbar">
          <div class="skill-preset-card auto-pill-hero-card combat-settings-hero-card">
            <div class="skill-preset-card-title">${t('action.combat-settings.hero.title', undefined)}</div>
            <div class="skill-preset-card-copy">${t('action.combat-settings.hero.copy', undefined)}</div>
          </div>
          <div class="auto-pill-toolbar">
            <button class="small-btn" data-combat-settings-apply type="button">${t('common.action.execute', undefined)}</button>
            <button class="small-btn ghost" data-combat-settings-cancel type="button">${t('common.action.cancel', undefined)}</button>
          </div>
        </div>
        <div class="action-skill-subtabs combat-settings-tabs">
          <button class="action-skill-subtab-btn ${this.p.combatSettingsActiveTab === 'auto_pills' ? 'active' : ''}" data-combat-settings-tab="auto_pills" type="button">${t('action.combat-settings.tab.auto-pills', undefined)}</button>
          <button class="action-skill-subtab-btn ${this.p.combatSettingsActiveTab === 'targeting' ? 'active' : ''}" data-combat-settings-tab="targeting" type="button">${t('action.combat-settings.tab.targeting', undefined)}</button>
        </div>
        <div class="combat-settings-panel-body">
          ${this.p.combatSettingsActiveTab === 'auto_pills' ? autoPillBody : targetingBody}
        </div>
        ${this.p.combatSettingsActiveTab === 'auto_pills' && this.p.autoUsePillSubview === 'picker'
          ? `<div class="auto-pill-subdialog-backdrop">
              <div class="auto-pill-subdialog auto-pill-subdialog--picker">
                <div class="auto-pill-subdialog-head">
                  <div>
                    <div class="skill-preset-card-title">${t('action.combat-settings.auto-pills.picker.title', undefined)}</div>
                    <div class="skill-preset-list-meta">${t('action.combat-settings.auto-pills.picker.copy', undefined)}</div>
                  </div>
                  <div class="auto-pill-toolbar">
                    ${currentConfig ? `<button class="small-btn ghost" data-auto-pill-clear-slot type="button">${t('action.combat-settings.auto-pills.picker.clear-slot', undefined)}</button>` : ''}
                    <button class="small-btn ghost" data-auto-pill-back type="button">${t('common.action.close', undefined)}</button>
                  </div>
                </div>
                ${pickerBody}
              </div>
            </div>`
          : ''}
        ${this.p.combatSettingsActiveTab === 'auto_pills' && this.p.autoUsePillSubview === 'conditions'
          ? `<div class="auto-pill-subdialog-backdrop">
              <div class="auto-pill-subdialog auto-pill-subdialog--condition">
                <div class="auto-pill-subdialog-head">
                  <div>
                    <div class="skill-preset-card-title">${t('action.combat-settings.auto-pills.condition.dialog-title', undefined)}</div>
                    <div class="skill-preset-list-meta">${t('action.combat-settings.auto-pills.condition.dialog-copy', { name: escapeHtml(currentEntry?.name ?? t('action.combat-settings.auto-pills.slot.current', undefined)) })}</div>
                  </div>
                  <div class="auto-pill-toolbar">
                    <button class="small-btn ghost" data-auto-pill-back type="button">${t('common.action.close', undefined)}</button>
                  </div>
                </div>
                ${conditionBody}
              </div>
            </div>`
          : ''}
      </div>
    `;
    detailModalHost.open({
      ownerId: this.p.COMBAT_SETTINGS_MODAL_OWNER,
      variantClass: 'detail-modal--combat-settings',
      title: t('action.combat-settings.title', undefined),
      subtitle: t('action.combat-settings.subtitle', {
        pillCount: pillDraft.length,
        tabLabel: this.p.combatSettingsActiveTab === 'auto_pills'
          ? t('action.combat-settings.tab.auto-pills', undefined)
          : t('action.combat-settings.tab.targeting', undefined),
      }),
      bodyHtml: overviewBody,
      onRequestClose: () => this.confirmDiscardCombatSettingsChanges(),
      onClose: () => this.discardCombatSettingsDraft(),
      onAfterRender: (body, signal) => this.bindCombatSettingsEvents(body, signal),
    });
    this.p.combatSettingsExternalRevision = this.buildCombatSettingsExternalRevision();
  }

  renderTargetingPlanModal(): void {
    const activeMode = this.getAutoBattleTargetingMode();
    const activeOption = AUTO_BATTLE_TARGETING_MODE_OPTIONS.find((entry) => entry.mode === activeMode)
      ?? AUTO_BATTLE_TARGETING_MODE_OPTIONS[0]!;
    detailModalHost.open({
      ownerId: this.p.TARGETING_PLAN_MODAL_OWNER,
      variantClass: 'detail-modal--targeting-plan',
      title: t('action.targeting-plan.title', undefined),
      subtitle: t('action.targeting-plan.subtitle', { label: activeOption.label }),
      bodyHtml: `
        <div class="targeting-plan-shell">
          <div class="targeting-plan-hero">
            <div class="targeting-plan-card">
              <div class="skill-preset-card-title">${t('action.targeting-plan.current.title', undefined)}</div>
              <div class="targeting-plan-current">${escapeHtml(activeOption.label)}</div>
              <div class="skill-preset-card-copy">${escapeHtml(activeOption.summary)}</div>
            </div>
          </div>
          <div class="targeting-plan-card targeting-plan-options">
            <div class="skill-preset-section-head">
              <div class="skill-preset-card-title">${t('action.targeting-plan.switch.title', undefined)}</div>
              <div class="skill-preset-list-meta">${t('action.targeting-plan.switch.copy', undefined)}</div>
            </div>
            <div class="targeting-plan-grid">
              ${AUTO_BATTLE_TARGETING_MODE_OPTIONS.map((entry) => `
                <button
                  class="targeting-plan-option ${entry.mode === activeMode ? 'active' : ''}"
                  data-targeting-plan-mode="${escapeHtml(entry.mode)}"
                  type="button"
                >
                  <span class="targeting-plan-option-title">${escapeHtml(entry.label)}</span>
                  <span class="targeting-plan-option-copy">${escapeHtml(entry.summary)}</span>
                </button>
              `).join('')}
            </div>
          </div>
        </div>
      `,
      onAfterRender: (body, signal) => {
        this.bindTargetingPlanEvents(body, signal);
      },
    });
    this.p.targetingPlanExternalRevision = activeMode;
  }

  bindCombatSettingsEvents(root: HTMLElement, signal: AbortSignal): void {
    root.querySelectorAll<HTMLElement>('[data-combat-settings-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.combatSettingsTab;
        this.p.combatSettingsActiveTab = tab === 'targeting' ? 'targeting' : 'auto_pills';
        this.renderCombatSettingsModal();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-combat-settings-apply]').forEach((button) => {
      button.addEventListener('click', () => this.applyCombatSettingsChanges(), { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-combat-settings-cancel]').forEach((button) => {
      button.addEventListener('click', () => this.requestCombatSettingsClose(), { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-auto-pill-slot]').forEach((button) => {
      button.addEventListener('click', () => {
        const slotIndex = Number(button.dataset.autoPillSlot);
        if (!Number.isInteger(slotIndex)) return;
        this.openAutoUsePillPicker(slotIndex);
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-auto-pill-open-slot-conditions]').forEach((button) => {
      button.addEventListener('click', () => {
        const slotIndex = Number(button.dataset.autoPillOpenSlotConditions);
        if (!Number.isInteger(slotIndex)) return;
        this.openAutoUsePillConditionSettings(slotIndex);
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-auto-pill-back]').forEach((button) => {
      button.addEventListener('click', () => this.closeAutoUsePillSubview(), { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-auto-pill-pick]').forEach((button) => {
      button.addEventListener('click', () => {
        const itemId = button.dataset.autoPillPick;
        if (!itemId) return;
        this.assignAutoUsePillToSelectedSlot(itemId);
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-auto-pill-clear-slot]').forEach((button) => {
      button.addEventListener('click', () => this.clearSelectedAutoUsePillSlot(), { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-auto-pill-add-condition]').forEach((button) => {
      button.addEventListener('click', () => {
        const itemId = button.dataset.autoPillAddCondition;
        const kind = button.dataset.conditionKind as 'hp' | 'qi' | 'buff_missing' | undefined;
        if (!itemId || !kind) return;
        this.addAutoUsePillCondition(itemId, kind);
      }, { signal });
    });
    root.querySelectorAll<HTMLSelectElement>('[data-auto-pill-condition-resource]').forEach((input) => {
      input.addEventListener('change', () => {
        const itemId = input.dataset.autoPillConditionResource;
        const conditionIndex = Number(input.dataset.conditionIndex);
        const resource = input.value === 'qi' ? 'qi' : 'hp';
        if (!itemId || !Number.isInteger(conditionIndex)) return;
        this.updateAutoUsePillCondition(itemId, conditionIndex, (condition) => (
          condition.type === 'resource_ratio' ? { ...condition, resource } : condition
        ));
      }, { signal });
    });
    root.querySelectorAll<HTMLSelectElement>('[data-auto-pill-condition-op]').forEach((input) => {
      input.addEventListener('change', () => {
        const itemId = input.dataset.autoPillConditionOp;
        const conditionIndex = Number(input.dataset.conditionIndex);
        const op = input.value === 'gt' ? 'gt' : 'lt';
        if (!itemId || !Number.isInteger(conditionIndex)) return;
        this.updateAutoUsePillCondition(itemId, conditionIndex, (condition) => (
          condition.type === 'resource_ratio' ? { ...condition, op } : condition
        ));
      }, { signal });
    });
    root.querySelectorAll<HTMLInputElement>('[data-auto-pill-condition-threshold]').forEach((input) => {
      input.addEventListener('change', () => {
        const itemId = input.dataset.autoPillConditionThreshold;
        const conditionIndex = Number(input.dataset.conditionIndex);
        const thresholdPct = Math.max(0, Math.min(100, Math.round(Number(input.value) || 0)));
        if (!itemId || !Number.isInteger(conditionIndex)) return;
        this.updateAutoUsePillCondition(itemId, conditionIndex, (condition) => (
          condition.type === 'resource_ratio' ? { ...condition, thresholdPct } : condition
        ));
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-auto-pill-condition-remove]').forEach((button) => {
      button.addEventListener('click', () => {
        const itemId = button.dataset.autoPillConditionRemove;
        const conditionIndex = Number(button.dataset.conditionIndex);
        if (!itemId || !Number.isInteger(conditionIndex)) return;
        this.removeAutoUsePillCondition(itemId, conditionIndex);
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-combat-targeting-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const raw = button.dataset.combatTargetingToggle;
        const [scopeRaw, keyRaw] = typeof raw === 'string' ? raw.split(':', 2) : [];
        const scope = scopeRaw === 'friendly' ? 'friendly' : scopeRaw === 'hostile' ? 'hostile' : null;
        const key = keyRaw as CombatTargetingRuleKey | undefined;
        if (!scope || !key) return;
        this.resetCombatSettingsCloseConfirm();
        const draft = this.syncCombatTargetingDraft();
        const current = new Set(draft[scope] ?? []);
        if (current.has(key)) {
          current.delete(key);
        } else {
          current.add(key);
        }
        this.p.combatTargetingDraft = this.cloneCombatTargetingRules({
          ...draft,
          [scope]: [...current],
        });
        this.renderCombatSettingsModal();
      }, { signal });
    });
    this.bindAutoUsePillSlotTooltipEvents(root, signal);
    this.bindAutoUsePillPickerTooltipEvents(root, signal);
  }

  bindTargetingPlanEvents(root: HTMLElement, signal: AbortSignal): void {
    root.querySelectorAll<HTMLElement>('[data-targeting-plan-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.targetingPlanMode as AutoBattleTargetingMode | undefined;
        if (!mode || mode === this.getAutoBattleTargetingMode()) return;
        if (this.p.previewPlayer) {
          this.p.previewPlayer.autoBattleTargetingMode = mode;
        }
        this.p.targetingPlanExternalRevision = null;
        this.p.render(this.p.currentActions);
        this.renderTargetingPlanModal();
        this.p.onUpdateAutoBattleTargetingMode?.(mode);
      }, { signal });
    });
  }

  bindAutoUsePillSlotTooltipEvents(root: HTMLElement, signal: AbortSignal): void {
    const slotButtons = root.querySelectorAll<HTMLElement>('[data-auto-pill-slot-item-id]');
    if (slotButtons.length === 0) return;
    root.addEventListener('pointermove', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const button = target.closest<HTMLElement>('[data-auto-pill-slot-item-id]');
      if (!button) {
        if (this.p.autoUsePillTooltipNode) {
          this.p.autoUsePillTooltipNode = null;
          this.p.autoUsePillTooltip.hide();
        }
        return;
      }
      const itemId = button.dataset.autoPillSlotItemId;
      if (!itemId) return;
      if (this.p.autoUsePillTooltipNode !== button) {
        const tooltip = this.buildAutoUsePillSlotTooltipPayload(itemId);
        if (!tooltip) return;
        this.p.autoUsePillTooltipNode = button;
        this.p.autoUsePillTooltip.show(tooltip.title, tooltip.lines, event.clientX, event.clientY, {
          allowHtml: tooltip.allowHtml,
          asideCards: tooltip.asideCards,
        });
        return;
      }
      this.p.autoUsePillTooltip.move(event.clientX, event.clientY);
    }, { signal });
  }

  bindAutoUsePillPickerTooltipEvents(root: HTMLElement, signal: AbortSignal): void {
    const pickerCards = root.querySelectorAll<HTMLElement>('[data-auto-pill-pick]');
    if (pickerCards.length === 0) {
      this.p.autoUsePillTooltipNode = null;
      this.p.autoUsePillTooltip.hide(true);
      return;
    }
    root.addEventListener('pointermove', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const card = target.closest<HTMLElement>('[data-auto-pill-pick]');
      if (!card) {
        if (this.p.autoUsePillTooltipNode) {
          this.p.autoUsePillTooltipNode = null;
          this.p.autoUsePillTooltip.hide();
        }
        return;
      }
      const itemId = card.dataset.autoPillPick;
      if (!itemId) return;
      if (this.p.autoUsePillTooltipNode !== card) {
        const item = this.buildAutoUsePillTooltipItem(itemId);
        if (!item) return;
        const tooltip = buildItemTooltipPayload(item, { playerRealmLv: this.p.previewPlayer?.realm?.realmLv ?? this.p.previewPlayer?.realmLv });
        this.p.autoUsePillTooltipNode = card;
        this.p.autoUsePillTooltip.show(tooltip.title, tooltip.lines, event.clientX, event.clientY, {
          allowHtml: tooltip.allowHtml,
          asideCards: tooltip.asideCards,
        });
        return;
      }
      this.p.autoUsePillTooltip.move(event.clientX, event.clientY);
    }, { signal });
    root.addEventListener('pointerleave', () => {
      this.p.autoUsePillTooltipNode = null;
      this.p.autoUsePillTooltip.hide();
    }, { signal });
    root.addEventListener('pointerdown', () => {
      if (this.p.autoUsePillTooltipNode) {
        this.p.autoUsePillTooltipNode = null;
        this.p.autoUsePillTooltip.hide();
      }
    }, { signal });
  }
}
