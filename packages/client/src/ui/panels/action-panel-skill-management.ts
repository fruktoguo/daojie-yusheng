/**
 * 本文件负责客户端侧的配置、视图、网络或运行态辅助逻辑，服务于正式前端主线的展示与意图收集。
 *
 * 维护时要保持前端只处理表现和派生状态，避免复制服务端权威真源或让多套 UI 状态互相分叉。
 */
import type {
  ActionDef,
  AutoBattleSkillConfig,
  AutoUsePillCondition,
  AutoUsePillConfig,
  PlayerState,
  SkillDef,
} from '@mud/shared';
import { detailModalHost } from '../detail-modal-host';
import { buildSkillTooltipContent, type SkillPreviewMetrics, summarizeSkillPreviewMetrics } from '../skill-tooltip';
import { t } from '../i18n';
import { formatDisplayNumber } from '../../utils/number';
import { ACTION_SKILL_PRESETS_KEY } from '../../constants/ui/action';
import {
  decodePresetTextValue,
  escapeHtml,
  isRecord,
  readBoolean,
} from './action-panel-helpers';
import type { ActionPanel } from './action-panel';
import type {
  ActionPanelInternal,
  SkillManagementBulkMode,
  SkillManagementEntry,
  SkillManagementFilterToggle,
  SkillManagementSortDirection,
  SkillManagementSortField,
  SkillManagementTab,
  SkillPresetLibrary,
  SkillPresetRecord,
  SkillPresetSkillState,
  SkillPresetStatus,
} from './action-panel-internal';

// ─── 本地常量 ───

const SKILL_PRESET_NAME_MAX_LENGTH = 24;
const SKILL_PRESET_EXPORT_VERSION = 2;
const SECT_MANAGEMENT_DATA_PATTERN = /\n?@@sect:([^@\n]+)@@/;

function stripSectManagementData(desc: string | undefined): string {
  return (desc ?? '').replace(SECT_MANAGEMENT_DATA_PATTERN, '').trim();
}

// ─── 子面板类 ───

export class SkillManagementSubpanel {
  private readonly p: ActionPanelInternal;

  constructor(parent: ActionPanel) {
    this.p = parent as unknown as ActionPanelInternal;
  }

  // ─── 技能预设持久化 ───

  loadSkillPresets(): SkillPresetRecord[] {
    try {
      const raw = localStorage.getItem(ACTION_SKILL_PRESETS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      return this.parseSkillPresetCollection(parsed, { preserveIds: true });
    } catch {
      return [];
    }
  }

  saveSkillPresets(): void {
    localStorage.setItem(ACTION_SKILL_PRESETS_KEY, JSON.stringify(this.buildSkillPresetExportPayload(this.p.skillPresets)));
  }

  parseSkillPresetCollection(
    payload: unknown,
    options?: { preserveIds?: boolean; existingNames?: Set<string> },
  ): SkillPresetRecord[] {
    const preserveIds = options?.preserveIds === true;
    const existingNames = options?.existingNames ?? new Set<string>();
    const source = Array.isArray(payload)
      ? payload
      : isRecord(payload) && Array.isArray(payload.p)
        ? payload.p
        : isRecord(payload) && Array.isArray(payload.presets)
          ? payload.presets
          : isRecord(payload) && (Array.isArray(payload.skills) || Array.isArray(payload.s))
            ? [payload]
            : [];
    const result: SkillPresetRecord[] = [];
    const usedNames = new Set(existingNames);
    for (const [index, value] of source.entries()) {
      const preset = this.parseSkillPresetRecord(value, index, { preserveIds });
      if (!preset) continue;
      const uniqueName = this.resolveUniqueSkillPresetName(preset.name, usedNames);
      result.push({ ...preset, name: uniqueName });
      usedNames.add(uniqueName);
    }
    return result;
  }

  parseSkillPresetRecord(
    value: unknown,
    index: number,
    options?: { preserveIds?: boolean },
  ): SkillPresetRecord | null {
    if (!isRecord(value)) return null;
    const rawSkills = Array.isArray(value.s)
      ? value.s
      : Array.isArray(value.skills)
        ? value.skills
        : Array.isArray(value.entries)
          ? value.entries
          : null;
    if (!rawSkills || rawSkills.length === 0) return null;
    const skills: SkillPresetSkillState[] = [];
    const seen = new Set<string>();
    for (const entry of rawSkills) {
      if (Array.isArray(entry)) {
        const skillId = typeof entry[0] === 'string' ? entry[0].trim() : '';
        const auto = entry[1] === 1;
        if (!skillId || seen.has(skillId)) continue;
        skills.push({ skillId, enabled: auto, skillEnabled: true });
        seen.add(skillId);
        continue;
      }
      if (!isRecord(entry)) continue;
      const skillId = typeof entry.skillId === 'string'
        ? entry.skillId.trim()
        : typeof entry.id === 'string'
          ? entry.id.trim()
          : '';
      const skillEnabled = readBoolean(entry.skillEnabled);
      if (!skillId || seen.has(skillId) || skillEnabled === false) continue;
      skills.push({
        skillId,
        enabled: readBoolean(entry.enabled, entry.autoBattleEnabled),
        skillEnabled: true,
      });
      seen.add(skillId);
    }
    if (skills.length === 0) return null;
    const fallbackName = t('action.skill-preset.default-indexed-name', { index: index + 1 });
    const name = this.sanitizeSkillPresetName(
      typeof value.n === 'string'
        ? value.n
        : typeof value.name === 'string'
          ? value.name
          : typeof value.title === 'string'
            ? value.title
            : fallbackName,
    ) || fallbackName;
    return {
      id: options?.preserveIds === true && typeof value.id === 'string' && value.id
        ? value.id
        : this.generateSkillPresetId(),
      name,
      skills,
    };
  }

  sanitizeSkillPresetName(value: string): string {
    return value.replace(/\s+/g, ' ').trim().slice(0, SKILL_PRESET_NAME_MAX_LENGTH);
  }

  resolveUniqueSkillPresetName(name: string, usedNames: Set<string>): string {
    const base = this.sanitizeSkillPresetName(name) || t('action.skill-preset.default-base-name', undefined);
    if (!usedNames.has(base)) return base;
    let suffix = 2;
    while (usedNames.has(`${base} (${suffix})`)) {
      suffix += 1;
    }
    return `${base} (${suffix})`;
  }

  generateSkillPresetId(): string {
    return `skill-preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  getCurrentSkillPresetSnapshot(): SkillPresetSkillState[] {
    return this.p.getAutoBattleSkillConfigs(this.p.currentActions)
      .filter((entry) => entry.skillEnabled !== false)
      .map((entry) => ({
        skillId: entry.skillId,
        enabled: entry.enabled !== false,
        skillEnabled: true,
      }));
  }

  buildSkillPresetExportPayload(presets: SkillPresetRecord[]): SkillPresetLibrary {
    return {
      v: SKILL_PRESET_EXPORT_VERSION,
      p: presets.map((preset) => ({
        n: preset.name,
        s: preset.skills
          .filter((skill) => skill.skillEnabled !== false)
          .map((skill) => [skill.skillId, skill.enabled !== false ? 1 : 0] as [string, 0 | 1]),
      })),
    };
  }

  buildSkillPresetExportText(presets: SkillPresetRecord[]): string {
    const lines = [`v=${SKILL_PRESET_EXPORT_VERSION + 1}`];
    for (const preset of presets) {
      lines.push(`p=${encodeURIComponent(preset.name)}`);
      for (const skill of preset.skills) {
        if (skill.skillEnabled === false) continue;
        lines.push(`s=${encodeURIComponent(skill.skillId)},${skill.enabled !== false ? '1' : '0'}`);
      }
    }
    return `${lines.join('\n')}\n`;
  }

  parseSkillPresetText(
    text: string,
    options?: { preserveIds?: boolean; existingNames?: Set<string> },
  ): SkillPresetRecord[] {
    const parsedPresets: Array<{ n: string; s: Array<[string, 0 | 1]> }> = [];
    let current: { n: string; s: Array<[string, 0 | 1]> } | null = null;
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const separatorIndex = line.indexOf('=');
      if (separatorIndex <= 0) continue;
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      if (key === 'v') continue;
      if (key === 'p') {
        if (current && current.s.length > 0) parsedPresets.push(current);
        current = { n: decodePresetTextValue(value), s: [] };
        continue;
      }
      if (key === 's' && current) {
        const commaIndex = value.lastIndexOf(',');
        if (commaIndex <= 0) continue;
        const skillId = decodePresetTextValue(value.slice(0, commaIndex).trim());
        const autoFlag = value.slice(commaIndex + 1).trim() === '1' ? 1 : 0;
        if (!skillId) continue;
        current.s.push([skillId, autoFlag]);
      }
    }
    if (current && current.s.length > 0) parsedPresets.push(current);
    if (parsedPresets.length === 0) return [];
    return this.parseSkillPresetCollection({ p: parsedPresets }, options);
  }

  private downloadSkillPresetPayload(fileName: string, text: string): void {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  private buildDefaultSkillPresetName(): string {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    return t('action.skill-preset.default-datetime-name', { month, day, hour, minute });
  }

  buildSkillPresetExternalRevision(): string {
    const parts: string[] = [String(this.p.getSkillSlotLimit())];
    for (const action of this.p.getSkillActions(this.p.currentActions)) {
      parts.push(action.id);
      parts.push(action.autoBattleEnabled !== false ? '1' : '0');
      parts.push(action.skillEnabled !== false ? '1' : '0');
    }
    return parts.join('\u0001');
  }

  // ─── 技能管理弹层 ───

  openSkillManagement(): void {
    this.p.skillManagementTab = (this.p as unknown as { activeSkillTab: 'auto' | 'manual' }).activeSkillTab;
    this.p.skillManagementListScrollTop = 0;
    this.p.skillManagementStatus = null;
    this.syncSkillManagementDraft();
    this.renderSkillManagementModal();
  }

  renderSkillManagementModalIfOpen(): void {
    if (!detailModalHost.isOpenFor(this.p.SKILL_MANAGEMENT_MODAL_OWNER)) {
      return;
    }
    const nextRevision = this.buildSkillManagementExternalRevision();
    if (this.p.skillManagementExternalRevision === nextRevision) {
      return;
    }
    this.renderSkillManagementModal();
  }

  renderSkillPresetModalIfOpen(): void {
    if (!detailModalHost.isOpenFor(this.p.SKILL_PRESET_MODAL_OWNER)) {
      return;
    }
    const nextRevision = this.buildSkillPresetExternalRevision();
    if (this.p.skillPresetExternalRevision === nextRevision) {
      return;
    }
    this.renderSkillPresetModal();
  }

  hasPendingSkillManagementChanges(): boolean {
    return !this.p.areAutoBattleSkillConfigsEqual(
      this.p.skillManagementDraft,
      this.p.getAutoBattleSkillConfigs(this.p.currentActions),
    );
  }

  discardSkillManagementDraft(): void {
    this.resetSkillManagementCloseConfirm();
    this.p.skillManagementDraft = null;
    this.p.skillManagementExternalRevision = null;
    this.p.skillManagementListScrollTop = 0;
    this.p.bindingActionId = null;
    this.p.clearDragState();
  }

  private resetSkillManagementCloseConfirm(): void {
    if (this.p.skillManagementStatus?.tone === 'info') {
      this.p.skillManagementStatus = null;
    }
  }

  renderSkillManagementStatus(): string {
    if (!this.p.skillManagementStatus) return '';
    return `<div class="skill-preset-status ui-status-text ${this.p.skillManagementStatus.tone === 'error' ? 'error' : this.p.skillManagementStatus.tone === 'success' ? 'success' : ''}">${escapeHtml(this.p.skillManagementStatus.text)}</div>`;
  }

  syncSkillManagementDraft(): AutoBattleSkillConfig[] {
    const currentSkillActions = this.p.getSkillActions(this.p.currentActions);
    const availableIds = new Set(currentSkillActions.map((action) => action.id));
    const source = this.p.skillManagementDraft ?? this.p.getAutoBattleSkillConfigs(this.p.currentActions);
    const normalized: AutoBattleSkillConfig[] = [];
    const seen = new Set<string>();
    for (const entry of source) {
      if (seen.has(entry.skillId) || !availableIds.has(entry.skillId)) continue;
      normalized.push({
        skillId: entry.skillId,
        enabled: entry.enabled !== false,
        skillEnabled: entry.skillEnabled !== false,
      });
      seen.add(entry.skillId);
    }
    for (const action of currentSkillActions) {
      if (seen.has(action.id)) continue;
      normalized.push({
        skillId: action.id,
        enabled: action.autoBattleEnabled !== false,
        skillEnabled: action.skillEnabled !== false,
      });
      seen.add(action.id);
    }
    const nextDraft = this.p.normalizeSkillConfigs(normalized);
    this.p.skillManagementDraft = nextDraft;
    return nextDraft;
  }

  getSkillManagementPreviewActions(): ActionDef[] {
    const draft = this.syncSkillManagementDraft();
    const draftMap = new Map(draft.map((entry, index) => [entry.skillId, { entry, index }]));
    const skillActions = this.p.normalizeSkillActions(
      this.p.getSkillActions(this.p.currentActions)
        .map((action) => {
          const draftEntry = draftMap.get(action.id);
          if (!draftEntry) {
            return { ...action, autoBattleEnabled: action.autoBattleEnabled !== false, skillEnabled: action.skillEnabled !== false };
          }
          return { ...action, autoBattleEnabled: draftEntry.entry.enabled !== false, skillEnabled: draftEntry.entry.skillEnabled !== false, autoBattleOrder: draftEntry.index };
        })
        .sort((left, right) => (left.autoBattleOrder ?? Number.MAX_SAFE_INTEGER) - (right.autoBattleOrder ?? Number.MAX_SAFE_INTEGER)),
    );
    return this.p.replaceSkillActions(skillActions);
  }

  buildSkillManagementExternalRevision(): string {
    const parts = [
      String(this.p.getSkillSlotLimit()),
      this.p.skillManagementSortField,
      this.p.skillManagementSortDirection,
      [...this.p.skillManagementFilterToggles].sort().join(','),
    ];
    const includeMeleeRanged = this.p.skillManagementFilterToggles.has('melee') || this.p.skillManagementFilterToggles.has('ranged');
    const includeDamageKind = this.p.skillManagementFilterToggles.has('physical') || this.p.skillManagementFilterToggles.has('spell');
    const includeTargetKind = this.p.skillManagementFilterToggles.has('single') || this.p.skillManagementFilterToggles.has('aoe');
    const needsMetrics = includeMeleeRanged || includeDamageKind || includeTargetKind || this.p.skillManagementSortField !== 'custom';
    for (const action of this.p.getSkillActions(this.p.currentActions)) {
      parts.push(action.id);
      parts.push(action.name);
      parts.push(stripSectManagementData(action.desc));
      parts.push(typeof action.range === 'number' ? String(action.range) : '');
      parts.push(action.autoBattleEnabled !== false ? '1' : '0');
      parts.push(action.skillEnabled !== false ? '1' : '0');
      if (!needsMetrics) continue;
      const metrics = this.buildSkillManagementMetrics(action);
      if (includeMeleeRanged) { parts.push(metrics.isMelee ? '1' : '0'); parts.push(metrics.isRanged ? '1' : '0'); }
      if (includeDamageKind) { parts.push(metrics.hasPhysicalDamage ? '1' : '0'); parts.push(metrics.hasSpellDamage ? '1' : '0'); }
      if (includeTargetKind) { parts.push(metrics.isSingleTarget ? '1' : '0'); parts.push(metrics.isAreaTarget ? '1' : '0'); }
      switch (this.p.skillManagementSortField) {
        case 'actualDamage': parts.push(String(metrics.actualDamage ?? '')); break;
        case 'qiCost': parts.push(String(metrics.actualQiCost)); break;
        case 'range': parts.push(String(metrics.range)); break;
        case 'targetCount': parts.push(String(metrics.targetCount)); break;
        case 'cooldown': parts.push(String(metrics.cooldown)); break;
        default: break;
      }
    }
    return parts.join('\u0001');
  }

  captureSkillManagementListScroll(): void {
    const list = document.querySelector<HTMLElement>('.skill-manage-list');
    if (!list) return;
    this.p.skillManagementListScrollTop = list.scrollTop;
  }

  restoreSkillManagementListScroll(root: HTMLElement): void {
    const list = root.querySelector<HTMLElement>('.skill-manage-list');
    if (!list) return;
    list.scrollTop = this.p.skillManagementListScrollTop;
  }

  resetSkillManagementFilters(): void {
    this.p.skillManagementFilterToggles.clear();
  }

  // ─── 条目、指标、筛选、排序 ───

  getSkillManagementEntries(actions: ActionDef[]): SkillManagementEntry[] {
    return this.p.getSkillActions(actions).map((action) => ({
      action,
      metrics: this.buildSkillManagementMetrics(action),
    }));
  }

  buildSkillManagementMetrics(action: ActionDef): SkillPreviewMetrics {
    const context = this.p.skillLookup.get(action.id);
    if (!context) {
      const range = Number.isFinite(action.range) ? Number(action.range) : 0;
      return {
        actualDamage: null,
        actualQiCost: 0,
        range,
        targetCount: 1,
        cooldown: action.cooldownLeft,
        hasPhysicalDamage: false,
        hasSpellDamage: false,
        isSingleTarget: true,
        isAreaTarget: false,
        isMelee: range <= 1,
        isRanged: range > 1,
      };
    }
    return summarizeSkillPreviewMetrics(context.skill, {
      techLevel: context.techLevel,
      player: this.p.previewPlayer,
      knownSkills: context.knownSkills,
    });
  }

  getFilteredSkillManagementEntries(entries: SkillManagementEntry[]): SkillManagementEntry[] {
    return entries.filter((entry) => {
      if (!this.matchesSkillManagementToggleGroup(entry, ['single', 'aoe'])) return false;
      if (!this.matchesSkillManagementToggleGroup(entry, ['physical', 'spell'])) return false;
      if (!this.matchesSkillManagementToggleGroup(entry, ['melee', 'ranged'])) return false;
      return true;
    });
  }

  private matchesSkillManagementToggleGroup(entry: SkillManagementEntry, group: SkillManagementFilterToggle[]): boolean {
    const active = group.filter((value) => this.p.skillManagementFilterToggles.has(value));
    if (active.length === 0) return true;
    return active.some((value) => this.matchesSkillManagementToggle(entry.metrics, value));
  }

  private matchesSkillManagementToggle(metrics: SkillPreviewMetrics, toggle: SkillManagementFilterToggle): boolean {
    switch (toggle) {
      case 'melee': return metrics.isMelee;
      case 'ranged': return metrics.isRanged;
      case 'physical': return metrics.hasPhysicalDamage;
      case 'spell': return metrics.hasSpellDamage;
      case 'single': return metrics.isSingleTarget;
      case 'aoe': return metrics.isAreaTarget;
      default: return true;
    }
  }

  sortSkillManagementEntries(entries: SkillManagementEntry[]): SkillManagementEntry[] {
    if (this.p.skillManagementSortField === 'custom') return entries;
    const factor = this.p.skillManagementSortDirection === 'asc' ? 1 : -1;
    const next = [...entries];
    next.sort((left, right) => {
      const valueDiff = this.compareSkillManagementEntry(left, right);
      if (valueDiff !== 0) return valueDiff * factor;
      return left.action.name.localeCompare(right.action.name, 'zh-Hans-CN');
    });
    return next;
  }

  private compareSkillManagementEntry(left: SkillManagementEntry, right: SkillManagementEntry): number {
    const leftValue = this.getSkillManagementSortValue(left.metrics);
    const rightValue = this.getSkillManagementSortValue(right.metrics);
    const leftMissing = leftValue === null || !Number.isFinite(leftValue);
    const rightMissing = rightValue === null || !Number.isFinite(rightValue);
    if (leftMissing && rightMissing) return 0;
    if (leftMissing) return 1;
    if (rightMissing) return -1;
    if (leftValue === rightValue) return 0;
    return leftValue < rightValue ? -1 : 1;
  }

  private getSkillManagementSortValue(metrics: SkillPreviewMetrics): number | null {
    switch (this.p.skillManagementSortField) {
      case 'actualDamage': return metrics.actualDamage;
      case 'qiCost': return metrics.actualQiCost;
      case 'range': return metrics.range;
      case 'targetCount': return metrics.targetCount;
      case 'cooldown': return metrics.cooldown;
      default: return null;
    }
  }

  applySkillManagementBulkMode(mode: SkillManagementBulkMode): void {
    const filteredSkillIds = new Set(
      this.getFilteredSkillManagementEntries(this.getSkillManagementEntries(this.getSkillManagementPreviewActions()))
        .map((entry) => entry.action.id),
    );
    if (filteredSkillIds.size === 0) {
      this.p.skillManagementStatus = { tone: 'error', text: t('action.skill.manage.bulk.empty', undefined) };
      this.renderSkillManagementModal();
      return;
    }
    const label = ({
      auto: t('action.skill.manage.bulk.auto-label', undefined),
      manual: t('action.skill.manage.bulk.manual-label', undefined),
      enabled: t('action.skill.manage.bulk.enabled-label', undefined),
      disabled: t('action.skill.manage.bulk.disabled-label', undefined),
    } satisfies Record<SkillManagementBulkMode, string>)[mode];
    this.p.skillManagementStatus = { tone: 'success', text: t('action.skill.manage.bulk.done', { count: filteredSkillIds.size, label }) };
    this.p.applySkillManagementDraftMutation((skills) => skills.map((action) => (
      filteredSkillIds.has(action.id)
        ? mode === 'enabled'
          ? { ...action, skillEnabled: true }
          : mode === 'disabled'
            ? { ...action, skillEnabled: false }
            : { ...action, autoBattleEnabled: mode === 'auto' }
        : action
    )));
  }

  applySkillManagementChanges(): void {
    if (this.p.skillManagementSortField !== 'custom') {
      this.applySkillManagementSortOrder(false, false);
    }
    const nextActions = this.getSkillManagementPreviewActions();
    const nextAutoBattleSkills = this.p.getAutoBattleSkillConfigs(nextActions);
    this.p.currentActions = nextActions;
    if (this.p.previewPlayer) {
      this.p.previewPlayer.actions = this.p.currentActions.filter((action) => action.id !== 'client:observe');
      this.p.previewPlayer.autoBattleSkills = nextAutoBattleSkills;
    }
    this.p.skillManagementDraft = null;
    this.p.skillManagementExternalRevision = null;
    this.p.skillManagementListScrollTop = 0;
    this.p.bindingActionId = null;
    this.p.clearDragState();
    detailModalHost.close(this.p.SKILL_MANAGEMENT_MODAL_OWNER);
    this.p.render(this.p.currentActions);
    this.p.onUpdateAutoBattleSkills?.(nextAutoBattleSkills);
  }

  cancelSkillManagementChanges(): void {
    this.discardSkillManagementDraft();
    detailModalHost.close(this.p.SKILL_MANAGEMENT_MODAL_OWNER);
  }

  applySkillManagementSortOrder(rerender = true, notify = true): boolean {
    if (this.p.skillManagementTab === 'disabled' || this.p.skillManagementSortField === 'custom') {
      if (notify) {
        this.p.skillManagementStatus = { tone: 'error', text: t('action.skill.manage.sort.error.unsupported', undefined) };
        this.renderSkillManagementModal();
      }
      return false;
    }
    const orderedIds = this.getSortedSkillManagementActionIds();
    if (orderedIds.length <= 1) {
      if (notify) {
        this.p.skillManagementStatus = { tone: 'error', text: t('action.skill.manage.sort.error.not-enough', undefined) };
        this.renderSkillManagementModal();
      }
      return false;
    }
    if (notify) {
      const sortLabel = ({
        actualDamage: t('action.skill.manage.sort.field.actual-damage', undefined),
        qiCost: t('action.skill.manage.sort.field.qi-cost', undefined),
        range: t('action.skill.manage.sort.field.range', undefined),
        targetCount: t('action.skill.manage.sort.field.target-count', undefined),
        cooldown: t('action.skill.manage.sort.field.cooldown', undefined),
        custom: t('action.skill.manage.sort.field.custom', undefined),
      } satisfies Record<SkillManagementSortField, string>)[this.p.skillManagementSortField];
      this.p.skillManagementStatus = {
        tone: 'success',
        text: t('action.skill.manage.sort.done', {
          sortLabel,
          sortDirection: this.p.skillManagementSortDirection === 'asc'
            ? t('action.skill.manage.sort.direction.asc', undefined)
            : t('action.skill.manage.sort.direction.desc', undefined),
        }),
      };
    }
    this.p.applySkillManagementDraftMutation(
      (skills) => this.reorderSkillManagementSubset(skills, orderedIds),
      rerender,
    );
    return true;
  }

  private getSortedSkillManagementActionIds(): string[] {
    const previewActions = this.getSkillManagementPreviewActions();
    const skillEntries = this.getFilteredSkillManagementEntries(this.getSkillManagementEntries(previewActions));
    const visibleEntries = this.p.skillManagementTab === 'auto'
      ? skillEntries.filter((entry) => entry.action.skillEnabled !== false && entry.action.autoBattleEnabled !== false)
      : this.p.skillManagementTab === 'manual'
        ? skillEntries.filter((entry) => entry.action.skillEnabled !== false && entry.action.autoBattleEnabled === false)
        : skillEntries.filter((entry) => entry.action.skillEnabled === false);
    return this.sortSkillManagementEntries(visibleEntries).map((entry) => entry.action.id);
  }

  private reorderSkillManagementSubset(skills: ActionDef[], orderedIds: string[]): ActionDef[] {
    const subset = new Set(orderedIds);
    const orderedActions = orderedIds
      .map((id) => skills.find((action) => action.id === id))
      .filter((action): action is ActionDef => Boolean(action));
    let nextIndex = 0;
    return skills.map((action) => (
      subset.has(action.id) ? (orderedActions[nextIndex++] ?? action) : action
    ));
  }

  // ─── 技能预设弹层 ───

  openSkillPresetModal(): void {
    if (!this.p.skillPresetNameDraft) {
      this.p.skillPresetNameDraft = this.buildDefaultSkillPresetName();
    }
    if (!this.p.selectedSkillPresetId) {
      this.p.selectedSkillPresetId = this.p.skillPresets[0]?.id ?? null;
    }
    this.p.skillPresetStatus = null;
    this.renderSkillPresetModal();
  }

  saveCurrentSkillPreset(overwriteSelected: boolean): void {
    const snapshot = this.getCurrentSkillPresetSnapshot();
    if (snapshot.length === 0) {
      this.p.skillPresetStatus = { tone: 'error', text: t('action.skill-preset.status.no-savable-skills', undefined) };
      this.renderSkillPresetModal();
      return;
    }
    const selected = this.getSelectedSkillPreset();
    const inputName = this.sanitizeSkillPresetName(this.p.skillPresetNameDraft);
    if (!inputName && !overwriteSelected) {
      this.p.skillPresetStatus = { tone: 'error', text: t('action.skill-preset.status.name-required', undefined) };
      this.renderSkillPresetModal();
      return;
    }
    if (overwriteSelected && selected) {
      const nextName = inputName || selected.name;
      const updatedPreset: SkillPresetRecord = { ...selected, name: nextName, skills: snapshot };
      this.p.skillPresets = [updatedPreset, ...this.p.skillPresets.filter((preset) => preset.id !== selected.id)];
      this.p.selectedSkillPresetId = selected.id;
      this.p.skillPresetNameDraft = nextName;
      this.p.skillPresetStatus = { tone: 'success', text: t('action.skill-preset.status.overwritten', { name: nextName }) };
    } else {
      const usedNames = new Set(this.p.skillPresets.map((preset) => preset.name));
      const nextName = this.resolveUniqueSkillPresetName(inputName || this.buildDefaultSkillPresetName(), usedNames);
      const preset: SkillPresetRecord = { id: this.generateSkillPresetId(), name: nextName, skills: snapshot };
      this.p.skillPresets = [preset, ...this.p.skillPresets];
      this.p.selectedSkillPresetId = preset.id;
      this.p.skillPresetNameDraft = nextName;
      this.p.skillPresetStatus = { tone: 'success', text: t('action.skill-preset.status.saved', { name: nextName }) };
    }
    this.saveSkillPresets();
    this.renderSkillPresetModal();
  }

  applySelectedSkillPreset(): void {
    const preset = this.getSelectedSkillPreset();
    if (!preset) {
      this.p.skillPresetStatus = { tone: 'error', text: t('action.skill-preset.status.select-first', undefined) };
      this.renderSkillPresetModal();
      return;
    }
    const previousDraft = this.p.skillManagementDraft;
    this.p.skillManagementDraft = this.resolveAppliedSkillPresetConfigs(preset);
    const nextActions = this.getSkillManagementPreviewActions();
    this.p.skillManagementDraft = previousDraft;
    this.commitSkillPresetActions(nextActions);
    this.p.skillPresetStatus = { tone: 'success', text: t('action.skill-preset.status.applied', { name: preset.name }) };
    this.renderSkillPresetModal();
  }

  async copySelectedSkillPreset(): Promise<void> {
    const preset = this.getSelectedSkillPreset();
    if (!preset) {
      this.p.skillPresetStatus = { tone: 'error', text: t('action.skill-preset.status.select-first', undefined) };
      this.renderSkillPresetModal();
      return;
    }
    const text = this.buildSkillPresetExportText([preset]);
    if (!navigator.clipboard?.writeText) {
      this.p.skillPresetStatus = { tone: 'error', text: t('action.skill-preset.status.clipboard-unsupported', undefined) };
      this.renderSkillPresetModal();
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      this.p.skillPresetStatus = { tone: 'success', text: t('action.skill-preset.status.copied', { name: preset.name }) };
    } catch {
      this.p.skillPresetStatus = { tone: 'error', text: t('action.skill-preset.status.copy-failed', undefined) };
    }
    this.renderSkillPresetModal();
  }

  exportSelectedSkillPreset(): void {
    const preset = this.getSelectedSkillPreset();
    if (!preset) return;
    this.downloadSkillPresetPayload(`${preset.name}.txt`, this.buildSkillPresetExportText([preset]));
    this.p.skillPresetStatus = { tone: 'success', text: t('action.skill-preset.status.exported', { name: preset.name }) };
    this.renderSkillPresetModal();
  }

  exportAllSkillPresets(): void {
    if (this.p.skillPresets.length === 0) return;
    this.downloadSkillPresetPayload('skill-presets.txt', this.buildSkillPresetExportText(this.p.skillPresets));
    this.p.skillPresetStatus = { tone: 'success', text: t('action.skill-preset.status.exported-all', { count: this.p.skillPresets.length }) };
    this.renderSkillPresetModal();
  }

  deleteSelectedSkillPreset(): void {
    const preset = this.getSelectedSkillPreset();
    if (!preset) return;
    if (!window.confirm(t('action.skill-preset.confirm.delete', { name: preset.name }))) return;
    this.p.skillPresets = this.p.skillPresets.filter((entry) => entry.id !== preset.id);
    this.p.selectedSkillPresetId = this.p.skillPresets[0]?.id ?? null;
    this.p.skillPresetNameDraft = this.getSelectedSkillPreset()?.name ?? this.buildDefaultSkillPresetName();
    this.p.skillPresetStatus = { tone: 'success', text: t('action.skill-preset.status.deleted', { name: preset.name }) };
    this.saveSkillPresets();
    this.renderSkillPresetModal();
  }

  importSkillPresetsFromText(rawText: string): void {
    const text = rawText.trim();
    if (!text) {
      this.p.skillPresetStatus = { tone: 'error', text: t('action.skill-preset.status.import-empty', undefined) };
      this.renderSkillPresetModal();
      return;
    }
    try {
      const importOptions = { existingNames: new Set(this.p.skillPresets.map((preset) => preset.name)) };
      const imported = this.parseSkillPresetText(text, importOptions);
      if (imported.length === 0) {
        const parsed = JSON.parse(text) as unknown;
        imported.push(...this.parseSkillPresetCollection(parsed, importOptions));
      }
      if (imported.length === 0) {
        this.p.skillPresetStatus = { tone: 'error', text: t('action.skill-preset.status.import-no-valid', undefined) };
        this.renderSkillPresetModal();
        return;
      }
      this.p.skillPresets = [...imported, ...this.p.skillPresets];
      this.p.selectedSkillPresetId = imported[0]?.id ?? this.p.selectedSkillPresetId;
      this.p.skillPresetNameDraft = imported[0]?.name ?? this.buildDefaultSkillPresetName();
      this.p.skillPresetStatus = { tone: 'success', text: t('action.skill-preset.status.imported', { count: imported.length }) };
      this.saveSkillPresets();
      this.renderSkillPresetModal();
    } catch {
      this.p.skillPresetStatus = { tone: 'error', text: t('action.skill-preset.status.import-invalid', undefined) };
      this.renderSkillPresetModal();
    }
  }

  private getSelectedSkillPreset(): SkillPresetRecord | null {
    if (!this.p.selectedSkillPresetId) return null;
    return this.p.skillPresets.find((preset) => preset.id === this.p.selectedSkillPresetId) ?? null;
  }

  private resolveAppliedSkillPresetConfigs(preset: SkillPresetRecord): AutoBattleSkillConfig[] {
    const currentSkillActions = this.p.getSkillActions(this.p.currentActions);
    const currentMap = new Map(currentSkillActions.map((action) => [action.id, action] as const));
    const next: AutoBattleSkillConfig[] = [];
    const seen = new Set<string>();
    for (const skill of preset.skills) {
      if (seen.has(skill.skillId) || !currentMap.has(skill.skillId)) continue;
      next.push({ skillId: skill.skillId, enabled: skill.enabled !== false, skillEnabled: true });
      seen.add(skill.skillId);
    }
    for (const action of currentSkillActions) {
      if (seen.has(action.id)) continue;
      next.push({ skillId: action.id, enabled: action.autoBattleEnabled !== false, skillEnabled: false });
      seen.add(action.id);
    }
    return next;
  }

  private commitSkillPresetActions(nextActions: ActionDef[]): void {
    const nextAutoBattleSkills = this.p.getAutoBattleSkillConfigs(nextActions);
    this.p.currentActions = nextActions;
    if (this.p.previewPlayer) {
      this.p.previewPlayer.actions = this.p.currentActions.filter((action) => action.id !== 'client:observe');
      this.p.previewPlayer.autoBattleSkills = nextAutoBattleSkills;
    }
    this.p.skillManagementDraft = null;
    this.p.skillManagementExternalRevision = null;
    this.p.skillPresetExternalRevision = null;
    this.p.skillManagementListScrollTop = 0;
    this.p.bindingActionId = null;
    this.p.clearDragState();
    this.p.render(this.p.currentActions);
    this.p.onUpdateAutoBattleSkills?.(nextAutoBattleSkills);
  }

  // ─── 渲染方法（大型模板方法，保留在主面板中通过委托调用） ───

  renderSkillManagementSortPanel(): string {
    return `
      <div class="skill-manage-sort-panel">
        <div class="skill-manage-filter-head">
          <div class="skill-manage-filter-title">${t('action.skill.manage.sort.title', undefined)}</div>
        </div>
        <div class="skill-manage-chip-group">
          <span class="skill-manage-chip-group-title">${t('action.skill.manage.sort.field-title', undefined)}</span>
          <div class="skill-manage-chip-row">
            ${this.renderSkillManagementSortChip('custom', t('action.skill.manage.sort.field.custom', undefined))}
            ${this.renderSkillManagementSortChip('actualDamage', t('action.skill.manage.sort.field.actual-damage', undefined))}
            ${this.renderSkillManagementSortChip('qiCost', t('action.skill.manage.sort.field.qi-cost', undefined))}
            ${this.renderSkillManagementSortChip('range', t('action.skill.manage.sort.field.range', undefined))}
            ${this.renderSkillManagementSortChip('targetCount', t('action.skill.manage.sort.field.target-count', undefined))}
            ${this.renderSkillManagementSortChip('cooldown', t('action.skill.manage.sort.field.cooldown', undefined))}
          </div>
        </div>
        <div class="skill-manage-chip-group">
          <span class="skill-manage-chip-group-title">${t('action.skill.manage.sort.direction-title', undefined)}</span>
          <div class="skill-manage-chip-row">
            ${this.renderSkillManagementDirectionChip('desc', t('action.skill.manage.sort.direction.desc', undefined))}
            ${this.renderSkillManagementDirectionChip('asc', t('action.skill.manage.sort.direction.asc', undefined))}
          </div>
        </div>
        <div class="skill-manage-filter-copy ui-form-copy">${this.p.skillManagementTab === 'disabled'
          ? t('action.skill.manage.sort.copy.disabled', undefined)
          : this.p.skillManagementSortField === 'custom'
            ? t('action.skill.manage.sort.copy.custom', undefined)
            : t('action.skill.manage.sort.copy.sorted', undefined)}</div>
      </div>
    `;
  }

  private renderSkillManagementSortChip(value: SkillManagementSortField, label: string): string {
    return `<button class="skill-manage-toggle-chip ${this.p.skillManagementSortField === value ? 'active' : ''}" data-skill-manage-sort-field-toggle="${escapeHtml(value)}" type="button">${escapeHtml(label)}</button>`;
  }

  private renderSkillManagementDirectionChip(value: SkillManagementSortDirection, label: string): string {
    return `<button class="skill-manage-toggle-chip ${this.p.skillManagementSortDirection === value ? 'active' : ''}" data-skill-manage-sort-direction-toggle="${escapeHtml(value)}" type="button">${escapeHtml(label)}</button>`;
  }

  /**
   * renderSkillManagementModal 和 renderSkillPresetModal 是大型模板方法，
   * 由于与主面板的 DOM 绑定和 tooltip 系统紧密耦合，
   * 当前阶段保留在主面板中，通过主面板调用子面板的逻辑方法实现委托。
   * 后续可进一步迁移。
   */
  renderSkillManagementModal(): void {
    // 委托回主面板的原始实现
    (this.p as unknown as { _renderSkillManagementModal(): void })._renderSkillManagementModal();
  }

  renderSkillPresetModal(): void {
    // 委托回主面板的原始实现
    (this.p as unknown as { _renderSkillPresetModal(): void })._renderSkillPresetModal();
  }

  bindSkillManagementEvents(root: HTMLElement, signal: AbortSignal): void {
    // 委托回主面板的原始实现
    (this.p as unknown as { _bindSkillManagementEvents(root: HTMLElement, signal: AbortSignal): void })._bindSkillManagementEvents(root, signal);
  }

  bindSkillPresetEvents(root: HTMLElement, signal: AbortSignal): void {
    // 委托回主面板的原始实现
    (this.p as unknown as { _bindSkillPresetEvents(root: HTMLElement, signal: AbortSignal): void })._bindSkillPresetEvents(root, signal);
  }
}
