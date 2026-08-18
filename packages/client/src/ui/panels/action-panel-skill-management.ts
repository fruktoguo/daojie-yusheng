/**
 * 本文件负责客户端侧的配置、视图、网络或运行态辅助逻辑，服务于正式前端主线的展示与意图收集。
 *
 * 维护时要保持前端只处理表现和派生状态，避免复制服务端权威真源或让多套 UI 状态互相分叉。
 */
import type {
  ActionDef,
  AutoBattleSkillConfig,
} from '@mud/shared';
import { detailModalHost } from '../detail-modal-host';
import { type SkillPreviewMetrics, summarizeSkillPreviewMetrics } from '../skill-tooltip';
import { t } from '../i18n';
import { formatDisplayInteger, formatDisplayNumber } from '../../utils/number';
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
} from './action-panel-internal';

// ─── 本地常量 ───

const SKILL_PRESET_NAME_MAX_LENGTH = 24;
const SKILL_PRESET_EXPORT_VERSION = 2;
const SECT_MANAGEMENT_DATA_PATTERN = /\n?@@sect:([^@\n]+)@@/;

function stripSectManagementData(desc: string | undefined): string {
  return (desc ?? '').replace(SECT_MANAGEMENT_DATA_PATTERN, '').trim();
}

function replaceElementHtml(root: HTMLElement, html: string): void {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  root.replaceChildren(template.content.cloneNode(true));
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
    this.p.skillManagementTab = this.p.activeSkillTab;
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
        enabled: action.passiveOnly === true ? false : action.autoBattleEnabled !== false,
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
            return { ...action, autoBattleEnabled: action.passiveOnly === true ? false : action.autoBattleEnabled !== false, skillEnabled: action.skillEnabled !== false };
          }
          return { ...action, autoBattleEnabled: action.passiveOnly === true ? false : draftEntry.entry.enabled !== false, skillEnabled: draftEntry.entry.skillEnabled !== false, autoBattleOrder: draftEntry.index };
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
    this.p.skillManagementStatus = { tone: 'success', text: t('action.skill.manage.bulk.done', { count: formatDisplayInteger(filteredSkillIds.size), label }) };
    this.applySkillManagementDraftMutation((skills) => skills.map((action) => {
      if (!filteredSkillIds.has(action.id)) {
        return action;
      }
      if (mode === 'enabled') {
        return { ...action, skillEnabled: true };
      }
      if (mode === 'disabled') {
        return { ...action, skillEnabled: false };
      }
      return { ...action, autoBattleEnabled: action.passiveOnly === true ? false : mode === 'auto' };
    }));
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
    this.applySkillManagementDraftMutation(
      (skills) => this.reorderSkillManagementSubset(skills, orderedIds),
      rerender,
    );
    return true;
  }

  private getSortedSkillManagementActionIds(): string[] {
    const previewActions = this.getSkillManagementPreviewActions();
    const skillEntries = this.getFilteredSkillManagementEntries(this.getSkillManagementEntries(previewActions));
    const visibleEntries = this.p.skillManagementTab === 'auto'
      ? skillEntries.filter((entry) => entry.action.skillEnabled !== false && entry.action.passiveOnly !== true && entry.action.autoBattleEnabled !== false)
      : this.p.skillManagementTab === 'manual'
        ? skillEntries.filter((entry) => entry.action.skillEnabled !== false && (entry.action.passiveOnly === true || entry.action.autoBattleEnabled === false))
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
    this.p.skillPresetStatus = { tone: 'success', text: t('action.skill-preset.status.exported-all', { count: formatDisplayInteger(this.p.skillPresets.length) }) };
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
      this.p.skillPresetStatus = { tone: 'success', text: t('action.skill-preset.status.imported', { count: formatDisplayInteger(imported.length) }) };
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
      const action = currentMap.get(skill.skillId);
      if (seen.has(skill.skillId) || !action) continue;
      next.push({ skillId: skill.skillId, enabled: action.passiveOnly === true ? false : skill.enabled !== false, skillEnabled: true });
      seen.add(skill.skillId);
    }
    for (const action of currentSkillActions) {
      if (seen.has(action.id)) continue;
      const enabled = action.passiveOnly === true ? false : action.autoBattleEnabled !== false;
      next.push({ skillId: action.id, enabled, skillEnabled: false });
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

  /** 切换技能管理弹层里的自动战斗开关。 */
  private toggleSkillManagementAutoBattleSkill(actionId: string): void {
    this.applySkillManagementDraftMutation((skills) => skills.map((action) => (
      action.id === actionId
        ? { ...action, autoBattleEnabled: action.passiveOnly === true ? false : action.autoBattleEnabled === false }
        : action
    )));
  }

  /** 切换技能管理弹层里的技能启用开关。 */
  private toggleSkillManagementSkillEnabled(actionId: string): void {
    this.applySkillManagementDraftMutation((skills) => skills.map((action) => (
      action.id === actionId
        ? { ...action, skillEnabled: action.skillEnabled === false }
        : action
    )));
  }


  /** 在技能管理草稿里调整技能顺位。 */
  private moveSkillManagementSkill(actionId: string, targetId: string, position: 'before' | 'after'): void {
    if (actionId === targetId) return;
    this.applySkillManagementDraftMutation((skills) => {
      const sourceIndex = skills.findIndex((action) => action.id === actionId);
      const targetIndex = skills.findIndex((action) => action.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) {
        return skills;
      }
      const next = [...skills];
      const [moved] = next.splice(sourceIndex, 1);
      const baseIndex = next.findIndex((action) => action.id === targetId);
      const insertIndex = position === 'before' ? baseIndex : baseIndex + 1;
      next.splice(insertIndex, 0, moved);
      return next;
    });
  }


  /** 把技能管理草稿的改动写回预览态并刷新弹层。 */
  private applySkillManagementDraftMutation(
    mutator: (skills: ActionDef[]) => ActionDef[],
    rerender = true,
  ): void {
    this.resetSkillManagementCloseConfirm();
    const orderedIds = this.p.skillManagementSortField === 'custom'
      ? []
      : this.getSortedSkillManagementActionIds();
    const skillActions = this.p.getSkillActions(this.getSkillManagementPreviewActions())
      .map((action) => ({
        ...action,
        autoBattleEnabled: action.passiveOnly === true ? false : action.autoBattleEnabled !== false,
        skillEnabled: action.skillEnabled !== false,
      }));
    const orderedSkillActions = orderedIds.length > 1
      ? this.reorderSkillManagementSubset(skillActions, orderedIds)
      : skillActions;
    const mutated = this.p.normalizeSkillActions(mutator(orderedSkillActions));
    this.p.skillManagementDraft = this.p.normalizeSkillConfigs(this.p.getAutoBattleSkillConfigs(mutated));
    if (rerender) {
      this.renderSkillManagementModal();
    }
  }


  /** 绑定技能管理弹层里的自动开关。 */
  private bindSkillManagementAutoToggleEvents(root: HTMLElement, signal: AbortSignal): void {
    root.querySelectorAll<HTMLElement>('[data-skill-manage-auto-toggle]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const actionId = button.dataset.skillManageAutoToggle;
        if (!actionId) return;
        this.toggleSkillManagementAutoBattleSkill(actionId);
      }, { signal });
    });
  }


  /** 绑定技能管理弹层里的启用开关。 */
  private bindSkillManagementEnabledToggleEvents(root: HTMLElement, signal: AbortSignal): void {
    root.querySelectorAll<HTMLElement>('[data-skill-manage-enabled-toggle]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const actionId = button.dataset.skillManageEnabledToggle;
        if (!actionId) return;
        this.toggleSkillManagementSkillEnabled(actionId);
      }, { signal });
    });
  }


  /** 绑定技能管理弹层的拖拽排序交互。 */
  private bindSkillManagementDragEvents(root: HTMLElement, signal: AbortSignal): void {
    root.querySelectorAll<HTMLElement>('[data-skill-manage-drag]').forEach((handle) => {
      handle.addEventListener('dragstart', (event) => {
        const actionId = handle.dataset.skillManageDrag;
        if (!actionId || !(event.dataTransfer instanceof DataTransfer)) return;
        this.p.draggingSkillId = actionId;
        this.p.dragOverSkillId = null;
        this.p.dragOverPosition = null;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', actionId);
        this.p.updateDragIndicators();
      }, { signal });
      handle.addEventListener('dragend', () => {
        this.p.clearDragState();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-manage-skill-row]').forEach((row) => {
      row.addEventListener('dragover', (event) => {
        event.preventDefault();
        const actionId = row.dataset.skillManageSkillRow;
        if (!actionId || !this.p.draggingSkillId || actionId === this.p.draggingSkillId) return;
        const rect = row.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        this.p.dragOverSkillId = actionId;
        this.p.dragOverPosition = event.clientY < midpoint ? 'before' : 'after';
        this.p.updateDragIndicators();
      }, { signal });
      row.addEventListener('dragleave', (event) => {
        const related = event.relatedTarget;
        if (related instanceof Node && row.contains(related)) {
          return;
        }
        if (this.p.dragOverSkillId === row.dataset.skillManageSkillRow) {
          this.p.dragOverSkillId = null;
          this.p.dragOverPosition = null;
          this.p.updateDragIndicators();
        }
      }, { signal });
      row.addEventListener('drop', (event) => {
        event.preventDefault();
        const targetId = row.dataset.skillManageSkillRow;
        if (!this.p.draggingSkillId || !targetId || !this.p.dragOverPosition) {
          this.p.clearDragState();
          return;
        }
        this.moveSkillManagementSkill(this.p.draggingSkillId, targetId, this.p.dragOverPosition);
        this.p.clearDragState();
      }, { signal });
    });
  }


  /** 关闭技能管理前确认是否放弃本地草稿。 */
  private confirmDiscardSkillManagementChanges(): boolean {
    if (!this.hasPendingSkillManagementChanges()) {
      return true;
    }
    return window.confirm(t('action.skill.manage.confirm-discard', undefined));
  }


  /** 生成技能管理空态文案。 */
  private getSkillManagementEmptyStateText(): string {
    const base = this.p.skillManagementTab === 'auto'
      ? t('action.skill.manage.empty.auto', undefined)
      : this.p.skillManagementTab === 'manual'
        ? t('action.skill.manage.empty.manual', undefined)
        : t('action.skill.manage.empty.disabled', undefined);
    if (this.p.skillManagementFilterToggles.size === 0) {
      return base;
    }
    return t('action.skill.manage.empty.with-filter', { base });
  }


  /** 关闭方案弹层后，把输入草稿和状态提示清空。 */
  private resetSkillPresetModalState(): void {
    this.p.skillPresetNameDraft = '';
    this.p.skillPresetImportText = '';
    this.p.skillPresetStatus = null;
    if (!this.p.skillPresets.some((preset) => preset.id === this.p.selectedSkillPresetId)) {
      this.p.selectedSkillPresetId = this.p.skillPresets[0]?.id ?? null;
    }
  }


  /** 清理技能方案删除二次确认状态。 */
  private resetSkillPresetDeleteConfirm(): void {
    if (this.p.skillPresetStatus?.tone === 'info') {
      this.p.skillPresetStatus = null;
    }
  }


  /** 汇总一份方案里自动和手动技能的数量。 */
  private getSkillPresetSummaryLine(skills: SkillPresetSkillState[]): string {
    const auto = skills.filter((skill) => skill.enabled !== false).length;
    const manual = skills.length - auto;
    return t('action.skill-preset.summary.recorded', { count: formatDisplayInteger(skills.length), auto: formatDisplayInteger(auto), manual: formatDisplayInteger(manual) });
  }


  /** 对比方案与当前技能列表，给出命中和缺失的摘要。 */
  private getSkillPresetCompatibilitySummary(preset: SkillPresetRecord): string {
    const currentSkillIds = new Set(this.p.getSkillActions(this.p.currentActions).map((action) => action.id));
    const presetSkillIds = new Set(preset.skills.map((skill) => skill.skillId));
    let matched = 0;
    for (const skill of preset.skills) {
      if (currentSkillIds.has(skill.skillId)) {
        matched += 1;
      }
    }
    let currentOnly = 0;
    for (const action of this.p.getSkillActions(this.p.currentActions)) {
      if (!presetSkillIds.has(action.id)) {
        currentOnly += 1;
      }
    }
    return t('action.skill-preset.summary.compatibility', {
      matched,
      total: preset.skills.length,
      currentOnly,
    });
  }


  /** 把方案弹层里的结果提示渲染成状态条。 */
  private renderSkillPresetStatus(): string {
    if (!this.p.skillPresetStatus) {
      return '';
    }
    return `<div class="skill-preset-status ui-status-text ${this.p.skillPresetStatus.tone === 'error' ? 'error' : this.p.skillPresetStatus.tone === 'success' ? 'success' : ''}">${escapeHtml(this.p.skillPresetStatus.text)}</div>`;
  }


  /** 渲染技能方案弹层，包含保存、导入、导出和列表。 */
  private renderSkillPresetModal(): void {
    const currentSkills = this.getCurrentSkillPresetSnapshot();
    const selected = this.getSelectedSkillPreset();
    const currentSummary = this.getSkillPresetSummaryLine(currentSkills);
    const selectedSummary = selected ? this.getSkillPresetSummaryLine(selected.skills) : t('action.skill-preset.selected.none', undefined);
    const compatibilitySummary = selected ? this.getSkillPresetCompatibilitySummary(selected) : t('action.skill-preset.compatibility.none', undefined);

    detailModalHost.open({
      ownerId: this.p.SKILL_PRESET_MODAL_OWNER,
      variantClass: 'detail-modal--skill-preset',
      title: t('action.skill-preset.title', undefined),
      subtitle: t('action.skill-preset.subtitle', { presetCount: this.p.skillPresets.length, skillCount: currentSkills.length }),
      renderBody: (body) => {
        replaceElementHtml(body, `
        <div class="skill-preset-shell ui-card-list">
          <div class="skill-preset-hero">
            <div class="skill-preset-card">
              <div class="skill-preset-card-title">${t('action.skill-preset.save-layout.title', undefined)}</div>
              <div class="skill-preset-card-copy">${t('action.skill-preset.save-layout.copy', undefined)}</div>
              <div class="skill-manage-summary">
                <span>${escapeHtml(currentSummary)}</span>
                <span>${t('action.skill-preset.enabled-summary', { slotSummary: this.p.getSkillSlotSummary(this.p.currentActions) })}</span>
              </div>
              <div class="skill-preset-save-row">
                <input
                  class="skill-preset-name-input ui-input"
                  data-skill-preset-name-input
                  type="text"
                  maxlength="${SKILL_PRESET_NAME_MAX_LENGTH}"
                  placeholder="${t('action.skill-preset.name.placeholder', undefined)}"
                  value="${escapeHtml(this.p.skillPresetNameDraft)}"
                />
                <button class="small-btn" data-skill-preset-save type="button"${currentSkills.length > 0 ? '' : ' disabled'}>${t('action.skill-preset.action.save-current', undefined)}</button>
                <button class="small-btn ghost" data-skill-preset-overwrite type="button"${selected && currentSkills.length > 0 ? '' : ' disabled'}>${t('action.skill-preset.action.overwrite-selected', undefined)}</button>
              </div>
            </div>
            <div class="skill-preset-card">
              <div class="skill-preset-card-title">${t('action.skill-preset.selected.title', undefined)}</div>
              <div class="skill-preset-card-copy">${selected ? escapeHtml(selectedSummary) : t('action.skill-preset.selected.empty', undefined)}</div>
              <div class="skill-manage-summary">
                <span>${escapeHtml(compatibilitySummary)}</span>
                <span>${selected ? t('action.skill-preset.export.selected-copy', undefined) : t('action.skill-preset.export.list-copy', undefined)}</span>
              </div>
              <div class="skill-preset-actions">
                <button class="small-btn" data-skill-preset-apply type="button"${selected ? '' : ' disabled'}>${t('action.skill-preset.action.apply-selected', undefined)}</button>
                <button class="small-btn ghost" data-skill-preset-copy type="button"${selected ? '' : ' disabled'}>${t('action.skill-preset.action.copy-selected', undefined)}</button>
                <button class="small-btn ghost" data-skill-preset-export-selected type="button"${selected ? '' : ' disabled'}>${t('action.skill-preset.action.export-selected', undefined)}</button>
                <button class="small-btn ghost" data-skill-preset-export-all type="button"${this.p.skillPresets.length > 0 ? '' : ' disabled'}>${t('action.skill-preset.action.export-all', undefined)}</button>
                <button class="small-btn danger" data-skill-preset-delete type="button"${selected ? '' : ' disabled'}>${t('action.skill-preset.action.delete-selected', undefined)}</button>
              </div>
            </div>
          </div>
          ${this.renderSkillPresetStatus()}
          <div class="skill-preset-layout">
            <div class="skill-preset-list-card">
              <div class="skill-preset-section-head">
                <div class="skill-preset-card-title">${t('action.skill-preset.list.title', undefined)}</div>
                <div class="skill-preset-list-meta">${this.p.skillPresets.length > 0 ? t('action.skill-preset.list.sorted-copy', undefined) : t('action.skill-preset.list.empty-meta', undefined)}</div>
              </div>
              ${this.p.skillPresets.length === 0
                ? `<div class="empty-hint">${t('action.skill-preset.list.empty-hint', undefined)}</div>`
                : `<div class="skill-preset-list">
                    ${this.p.skillPresets.map((preset) => `
                      <button
                        class="skill-preset-item ${preset.id === this.p.selectedSkillPresetId ? 'active' : ''}"
                        data-skill-preset-select="${escapeHtml(preset.id)}"
                        type="button"
                      >
                        <span class="skill-preset-item-name">${escapeHtml(preset.name)}</span>
                        <span class="skill-preset-item-meta">${escapeHtml(this.getSkillPresetSummaryLine(preset.skills))}</span>
                        <span class="skill-preset-item-meta">${escapeHtml(this.getSkillPresetCompatibilitySummary(preset))}</span>
                      </button>
                    `).join('')}
                  </div>`}
            </div>
            <div class="skill-preset-import-card">
              <div class="skill-preset-section-head">
                <div class="skill-preset-card-title">${t('action.skill-preset.import.title', undefined)}</div>
                <button class="small-btn ghost" data-skill-preset-import-file-open type="button">${t('action.skill-preset.action.read-file', undefined)}</button>
              </div>
              <div class="skill-preset-card-copy">${t('action.skill-preset.import.copy', undefined)}</div>
              <textarea
                class="skill-preset-import-input ui-textarea"
                data-skill-preset-import-input
                placeholder="${t('action.skill-preset.import.placeholder', undefined)}"
              >${escapeHtml(this.p.skillPresetImportText)}</textarea>
              <input class="hidden" data-skill-preset-import-file type="file" accept="text/plain,.txt,.preset,application/json,.json" />
              <div class="skill-preset-actions">
                <button class="small-btn" data-skill-preset-import type="button"${this.p.skillPresetImportText.trim() ? '' : ' disabled'}>${t('action.skill-preset.action.import-local', undefined)}</button>
                <button class="small-btn ghost" data-skill-preset-import-clear type="button"${this.p.skillPresetImportText.trim() ? '' : ' disabled'}>${t('action.skill-preset.action.clear-input', undefined)}</button>
              </div>
            </div>
          </div>
        </div>
      `);
      },
      onClose: () => {
        this.resetSkillPresetModalState();
      },
      onAfterRender: (body, signal) => {
        this.bindSkillPresetEvents(body, signal);
      },
    });
    this.p.skillPresetExternalRevision = this.buildSkillPresetExternalRevision();
  }


  /** 给技能方案弹层装配输入、保存、导入和导出事件。 */
  bindSkillPresetEvents(root: HTMLElement, signal: AbortSignal): void {
    root.querySelectorAll<HTMLInputElement>('[data-skill-preset-name-input]').forEach((input) => {
      input.addEventListener('input', () => {
        this.resetSkillPresetDeleteConfirm();
        this.p.skillPresetNameDraft = input.value.slice(0, SKILL_PRESET_NAME_MAX_LENGTH);
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-save]').forEach((button) => {
      button.addEventListener('click', () => {
        this.resetSkillPresetDeleteConfirm();
        this.saveCurrentSkillPreset(false);
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-overwrite]').forEach((button) => {
      button.addEventListener('click', () => {
        this.resetSkillPresetDeleteConfirm();
        this.saveCurrentSkillPreset(true);
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-select]').forEach((button) => {
      button.addEventListener('click', () => {
        const presetId = button.dataset.skillPresetSelect;
        if (!presetId) {
          return;
        }
        this.resetSkillPresetDeleteConfirm();
        this.p.selectedSkillPresetId = presetId;
        const preset = this.getSelectedSkillPreset();
        this.p.skillPresetNameDraft = preset?.name ?? this.p.skillPresetNameDraft;
        this.p.skillPresetStatus = null;
        this.renderSkillPresetModal();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-apply]').forEach((button) => {
      button.addEventListener('click', () => {
        this.resetSkillPresetDeleteConfirm();
        this.applySelectedSkillPreset();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-copy]').forEach((button) => {
      button.addEventListener('click', () => {
        this.resetSkillPresetDeleteConfirm();
        this.copySelectedSkillPreset();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-export-selected]').forEach((button) => {
      button.addEventListener('click', () => {
        this.resetSkillPresetDeleteConfirm();
        this.exportSelectedSkillPreset();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-export-all]').forEach((button) => {
      button.addEventListener('click', () => {
        this.resetSkillPresetDeleteConfirm();
        this.exportAllSkillPresets();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-delete]').forEach((button) => {
      button.addEventListener('click', () => {
        this.deleteSelectedSkillPreset();
      }, { signal });
    });
    root.querySelectorAll<HTMLTextAreaElement>('[data-skill-preset-import-input]').forEach((input) => {
      input.addEventListener('input', () => {
        this.resetSkillPresetDeleteConfirm();
        this.p.skillPresetImportText = input.value;
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-import-clear]').forEach((button) => {
      button.addEventListener('click', () => {
        this.resetSkillPresetDeleteConfirm();
        this.p.skillPresetImportText = '';
        this.p.skillPresetStatus = null;
        this.renderSkillPresetModal();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-import]').forEach((button) => {
      button.addEventListener('click', () => {
        this.resetSkillPresetDeleteConfirm();
        this.importSkillPresetsFromText(this.p.skillPresetImportText);
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-preset-import-file-open]').forEach((button) => {
      button.addEventListener('click', () => {
        root.querySelector<HTMLInputElement>('[data-skill-preset-import-file]')?.click();
      }, { signal });
    });
    root.querySelectorAll<HTMLInputElement>('[data-skill-preset-import-file]').forEach((input) => {
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) {
          return;
        }
        try {
          this.p.skillPresetImportText = await file.text();
          this.p.skillPresetStatus = {
            tone: 'info',
            text: t('action.skill-preset.status.file-read', { fileName: file.name }),
          };
          this.renderSkillPresetModal();
        } catch {
          this.p.skillPresetStatus = {
            tone: 'error',
            text: t('action.skill-preset.status.file-read-failed', undefined),
          };
          this.renderSkillPresetModal();
        } finally {
          input.value = '';
        }
      }, { signal });
    });
  }


  /** 渲染技能管理弹层，包含分组、筛选、排序和批量操作。 */
  private renderSkillManagementModal(): void {
    if (detailModalHost.isOpenFor(this.p.SKILL_MANAGEMENT_MODAL_OWNER)) {
      this.captureSkillManagementListScroll();
    }
    const previewActions = this.getSkillManagementPreviewActions();
    const skillEntries = this.getSkillManagementEntries(previewActions);
    const filteredEntries = this.getFilteredSkillManagementEntries(skillEntries);
    const autoBattleDisplayOrders = this.p.buildAutoBattleDisplayOrderMap(previewActions);
    const autoEntries = filteredEntries.filter((entry) => entry.action.skillEnabled !== false && entry.action.passiveOnly !== true && entry.action.autoBattleEnabled !== false);
    const manualEntries = filteredEntries.filter((entry) => entry.action.skillEnabled !== false && (entry.action.passiveOnly === true || entry.action.autoBattleEnabled === false));
    const disabledEntries = filteredEntries.filter((entry) => entry.action.skillEnabled === false);
    const slotSummary = this.p.getSkillSlotSummary(previewActions);
    const visibleEntries = this.sortSkillManagementEntries(
      this.p.skillManagementTab === 'auto'
        ? autoEntries
        : this.p.skillManagementTab === 'manual'
          ? manualEntries
          : disabledEntries,
    );
    const dragSortEnabled = this.p.skillManagementTab === 'auto'
      && this.p.skillManagementSortField === 'custom'
      && visibleEntries.length > 1;
    const hint = this.buildSkillManagementHint(dragSortEnabled, slotSummary);

    detailModalHost.open({
      ownerId: this.p.SKILL_MANAGEMENT_MODAL_OWNER,
      variantClass: 'detail-modal--skill-management',
      title: t('action.skill.manage', undefined),
      subtitle: t('action.skill.manage.subtitle', {
        skillCount: skillEntries.length,
        slotSummary,
        filteredCount: filteredEntries.length,
      }),
      renderBody: (body) => {
        replaceElementHtml(body, `
        <div class="skill-manage-shell ui-card-list">
          <div class="skill-manage-topbar">
            <div class="action-skill-subtabs skill-manage-subtabs">
              <button class="action-skill-subtab-btn ${this.p.skillManagementTab === 'auto' ? 'active' : ''}" data-skill-manage-tab="auto" type="button">
                ${t('action.skill.tab.auto', undefined)}
                <span class="action-skill-subtab-count">${autoEntries.length}</span>
              </button>
              <button class="action-skill-subtab-btn ${this.p.skillManagementTab === 'manual' ? 'active' : ''}" data-skill-manage-tab="manual" type="button">
                ${t('action.skill.tab.manual', undefined)}
                <span class="action-skill-subtab-count">${manualEntries.length}</span>
              </button>
              <button class="action-skill-subtab-btn ${this.p.skillManagementTab === 'disabled' ? 'active' : ''}" data-skill-manage-tab="disabled" type="button">
                ${t('action.skill.manage.tab.disabled', undefined)}
                <span class="action-skill-subtab-count">${disabledEntries.length}</span>
              </button>
            </div>
            <div class="skill-manage-toolbar">
              <button class="small-btn" data-skill-manage-apply type="button">${t('common.action.execute', undefined)}</button>
              <button class="small-btn ghost" data-skill-manage-cancel type="button">${t('common.action.cancel', undefined)}</button>
              <button class="small-btn ghost ${this.p.skillManagementSortOpen ? 'active' : ''}" data-skill-manage-sort-toggle type="button">
                ${this.p.skillManagementSortOpen ? t('action.skill.manage.sort.close', undefined) : t('action.skill.manage.sort.open', undefined)}
              </button>
              <button class="small-btn ghost ${this.p.skillManagementFilterOpen ? 'active' : ''}" data-skill-manage-filter-toggle type="button">
                ${this.p.skillManagementFilterOpen ? t('action.skill.manage.filter.close', undefined) : t('action.skill.manage.filter.open', undefined)}
              </button>
            </div>
          </div>
          <div class="skill-manage-summary">
            <span>${t('action.skill.manage.summary.enabled', { slotSummary })}</span>
            <span>${t('action.skill.manage.summary.filtered', { count: formatDisplayInteger(filteredEntries.length) })}</span>
            <span>${t('action.skill.manage.summary.auto', { count: formatDisplayInteger(autoEntries.length) })}</span>
            <span>${t('action.skill.manage.summary.manual', { count: formatDisplayInteger(manualEntries.length) })}</span>
            <span>${t('action.skill.manage.summary.disabled', { count: formatDisplayInteger(disabledEntries.length) })}</span>
          </div>
          ${this.p.skillManagementSortOpen ? this.renderSkillManagementSortPanel() : ''}
          ${this.p.skillManagementFilterOpen ? `
            <div class="skill-manage-filter-panel">
              <div class="skill-manage-filter-head">
                <div class="skill-manage-filter-title">${t('action.skill.manage.filter.title', undefined)}</div>
                <button class="small-btn ghost" data-skill-manage-filter-all type="button">${t('action.skill.manage.filter.all', undefined)}</button>
              </div>
              <div class="skill-manage-chip-group">
                <span class="skill-manage-chip-group-title">${t('action.skill.manage.filter.tags', undefined)}</span>
                <div class="skill-manage-chip-row">
                  ${this.renderSkillManagementChipToggle('melee', t('action.skill.manage.filter.melee', undefined))}
                  ${this.renderSkillManagementChipToggle('ranged', t('action.skill.manage.filter.ranged', undefined))}
                  ${this.renderSkillManagementChipToggle('physical', t('action.skill.manage.filter.physical', undefined))}
                  ${this.renderSkillManagementChipToggle('spell', t('action.skill.manage.filter.spell', undefined))}
                  ${this.renderSkillManagementChipToggle('single', t('action.skill.manage.filter.single', undefined))}
                  ${this.renderSkillManagementChipToggle('aoe', t('action.skill.manage.filter.aoe', undefined))}
                </div>
              </div>
              <div class="skill-manage-filter-copy">${t('action.skill.manage.filter.copy', undefined)}</div>
            </div>
          ` : ''}
          <div class="skill-manage-batch">
            <button class="small-btn" data-skill-manage-bulk="auto" type="button"${filteredEntries.length > 0 ? '' : ' disabled'}>${t('action.skill.manage.bulk.auto', undefined)}</button>
            <button class="small-btn ghost" data-skill-manage-bulk="manual" type="button"${filteredEntries.length > 0 ? '' : ' disabled'}>${t('action.skill.manage.bulk.manual', undefined)}</button>
            <button class="small-btn ghost" data-skill-manage-bulk="enabled" type="button"${filteredEntries.length > 0 ? '' : ' disabled'}>${t('action.skill.manage.bulk.enabled', undefined)}</button>
            <button class="small-btn ghost" data-skill-manage-bulk="disabled" type="button"${filteredEntries.length > 0 ? '' : ' disabled'}>${t('action.skill.manage.bulk.disabled', undefined)}</button>
          </div>
          <div class="action-section-hint">${hint}</div>
          ${visibleEntries.length === 0
            ? `<div class="empty-hint">${escapeHtml(this.getSkillManagementEmptyStateText())}</div>`
            : `<div class="action-skill-list skill-manage-list">
              ${visibleEntries.map((entry) => this.renderSkillManagementItem(entry.action, {
                showDragHandle: dragSortEnabled,
                autoBattleDisplayOrder: this.p.skillManagementTab === 'auto'
                  ? (autoBattleDisplayOrders.get(entry.action.id) ?? null)
                  : null,
                canMoveUp: this.p.skillManagementSortField === 'custom' && visibleEntries.indexOf(entry) > 0,
                canMoveDown: this.p.skillManagementSortField === 'custom' && visibleEntries.indexOf(entry) < visibleEntries.length - 1,
              }, entry.metrics)).join('')}
            </div>`}
        </div>
      `);
      },
      onRequestClose: () => this.confirmDiscardSkillManagementChanges(),
      onClose: () => {
        this.discardSkillManagementDraft();
      },
      onAfterRender: (body, signal) => {
        this.bindSkillManagementEvents(body, signal);
        this.p.bindTooltips(body, signal);
        this.restoreSkillManagementListScroll(body);
      },
    });
    this.p.skillManagementExternalRevision = this.buildSkillManagementExternalRevision();
  }


  /** 给技能管理弹层装配分组切换、筛选、排序和应用事件。 */
  private bindSkillManagementEvents(root: HTMLElement, signal: AbortSignal): void {
    root.querySelectorAll<HTMLElement>('[data-skill-manage-apply]').forEach((button) => {
      button.addEventListener('click', () => {
        this.applySkillManagementChanges();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-manage-cancel]').forEach((button) => {
      button.addEventListener('click', () => {
        this.cancelSkillManagementChanges();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-manage-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.skillManageTab as SkillManagementTab | undefined;
        if (!tab) return;
        this.p.skillManagementTab = tab;
        this.renderSkillManagementModal();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-manage-sort-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        this.p.skillManagementSortOpen = !this.p.skillManagementSortOpen;
        this.renderSkillManagementModal();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-manage-sort-field-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.dataset.skillManageSortFieldToggle as SkillManagementSortField | undefined;
        if (!value) return;
        if (value === this.p.skillManagementSortField) {
          return;
        }
        if (value === 'custom' && this.p.skillManagementSortField !== 'custom') {
          this.applySkillManagementSortOrder(false, false);
        }
        this.p.skillManagementSortField = value;
        this.renderSkillManagementModal();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-manage-sort-direction-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.dataset.skillManageSortDirectionToggle as SkillManagementSortDirection | undefined;
        if (!value) return;
        this.p.skillManagementSortDirection = value;
        this.renderSkillManagementModal();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-manage-filter-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        this.p.skillManagementFilterOpen = !this.p.skillManagementFilterOpen;
        this.renderSkillManagementModal();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-manage-filter-toggle-chip]').forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.dataset.skillManageFilterToggleChip as SkillManagementFilterToggle | undefined;
        if (!value) return;
        if (this.p.skillManagementFilterToggles.has(value)) {
          this.p.skillManagementFilterToggles.delete(value);
        } else {
          this.p.skillManagementFilterToggles.add(value);
        }
        this.renderSkillManagementModal();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-manage-filter-all]').forEach((button) => {
      button.addEventListener('click', () => {
        this.resetSkillManagementFilters();
        this.renderSkillManagementModal();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-manage-move-up], [data-skill-manage-move-down]').forEach((button) => {
      button.addEventListener('click', () => {
        const actionId = button.dataset.skillManageMoveUp ?? button.dataset.skillManageMoveDown;
        if (!actionId) {
          return;
        }
        const position = button.dataset.skillManageMoveUp ? 'before' : 'after';
        const visibleEntries = this.sortSkillManagementEntries(
          this.getFilteredSkillManagementEntries(this.getSkillManagementEntries(this.getSkillManagementPreviewActions())),
        ).filter((entry) => (
          this.p.skillManagementTab === 'disabled'
            ? entry.action.skillEnabled === false
            : this.p.skillManagementTab === 'auto'
              ? entry.action.skillEnabled !== false && entry.action.passiveOnly !== true && entry.action.autoBattleEnabled !== false
              : entry.action.skillEnabled !== false && (entry.action.passiveOnly === true || entry.action.autoBattleEnabled === false)
        ));
        const currentIndex = visibleEntries.findIndex((entry) => entry.action.id === actionId);
        if (currentIndex < 0) {
          return;
        }
        const targetId = position === 'before'
          ? (visibleEntries[currentIndex - 1]?.action.id ?? null)
          : (visibleEntries[currentIndex + 1]?.action.id ?? null);
        if (!targetId) {
          return;
        }
        this.moveSkillManagementSkill(actionId, targetId, position);
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-skill-manage-bulk]').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.skillManageBulk as SkillManagementBulkMode | undefined;
        if (!mode || !['auto', 'manual', 'enabled', 'disabled'].includes(mode)) {
          return;
        }
        this.applySkillManagementBulkMode(mode);
      }, { signal });
    });
    this.bindSkillManagementAutoToggleEvents(root, signal);
    this.bindSkillManagementEnabledToggleEvents(root, signal);
    this.bindSkillManagementDragEvents(root, signal);
  }

  /** 渲染技能管理里的排序面板、方向和应用说明。 */
  private renderSkillManagementSortPanel(): string {
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


  /** 生成技能管理列表上方的操作提示。 */
  private buildSkillManagementHint(dragSortEnabled: boolean, slotSummary: string): string {
    if (this.p.skillManagementTab === 'disabled') {
      return t('action.skill.manage.hint.disabled', { slotSummary });
    }
    if (this.p.skillManagementSortField !== 'custom') {
      return t('action.skill.manage.hint.sorted', { slotSummary });
    }
    if (dragSortEnabled) {
      return t('action.skill.manage.hint.drag', { slotSummary });
    }
    return this.p.skillManagementTab === 'auto'
      ? t('action.skill.manage.hint.auto', { slotSummary })
      : t('action.skill.manage.hint.manual', { slotSummary });
  }


  /** 渲染当前排序字段对应的指标读数。 */
  private renderSkillManagementMetricReadout(metrics: SkillPreviewMetrics): string | null {
    switch (this.p.skillManagementSortField) {
      case 'actualDamage':
        return metrics.actualDamage === null
          ? t('action.skill.manage.metric.damage-unknown', undefined)
          : t('action.skill.manage.metric.damage', { value: formatDisplayNumber(metrics.actualDamage) });
      case 'qiCost':
        return t('action.skill.manage.metric.qi-cost', { value: formatDisplayNumber(metrics.actualQiCost) });
      default:
        return null;
    }
  }


  /** 渲染筛选标签按钮。 */
  private renderSkillManagementChipToggle(value: SkillManagementFilterToggle, label: string): string {
    return `<button class="skill-manage-toggle-chip ${this.p.skillManagementFilterToggles.has(value) ? 'active' : ''}" data-skill-manage-filter-toggle-chip="${escapeHtml(value)}" type="button">${escapeHtml(label)}</button>`;
  }


  /** 渲染技能管理弹层里的单条技能。 */
  private renderSkillManagementItem(
    action: ActionDef,
    options?: {
      showDragHandle?: boolean;
      autoBattleDisplayOrder?: number | null;
      canMoveUp?: boolean;
      canMoveDown?: boolean;
    },
    metrics?: SkillPreviewMetrics,
  ): string {
    const skillContext = this.p.skillLookup.get(action.id);
    const tooltipAttrs = skillContext
      ? ` data-action-tooltip-title="${escapeHtml(skillContext.skill.name)}" data-action-tooltip-skill-id="${escapeHtml(skillContext.skill.id)}" data-action-tooltip-rich="1"`
      : '';
    const autoBattleEnabled = action.autoBattleEnabled !== false;
    const passiveOnly = action.passiveOnly === true;
    const skillEnabled = action.skillEnabled !== false;
    const autoBattleOrder = typeof options?.autoBattleDisplayOrder === 'number'
      ? options.autoBattleDisplayOrder + 1
      : undefined;
    const rowAttrs = options?.showDragHandle ? ` data-skill-manage-skill-row="${action.id}"` : '';
    const canMoveUp = options?.canMoveUp === true;
    const canMoveDown = options?.canMoveDown === true;
    const metricReadout = metrics ? this.renderSkillManagementMetricReadout(metrics) : '';
    const affinityChip = skillContext ? this.p.renderActionSkillAffinityChip(skillContext.skill) : '';

    return `<div class="action-item action-item-draggable" data-action-row="${action.id}"${rowAttrs}>
      <div class="action-copy ${skillContext ? 'action-copy-tooltip' : ''} ${affinityChip ? 'action-copy--with-affinity' : ''}"${tooltipAttrs}>
        <div>
          <span class="action-name">${escapeHtml(action.name)}</span>
          <span class="action-type">${t('action.card.skill-type', undefined)}</span>
          ${typeof action.range === 'number' ? `<span class="action-type">${t('action.range', { range: formatDisplayNumber(action.range) })}</span>` : ''}
          ${passiveOnly ? `<span class="action-type">被动</span>` : ''}
          <span class="action-type ${autoBattleEnabled ? 'auto-battle-enabled' : 'auto-battle-disabled'}">${autoBattleEnabled ? t('action.skill.auto-state.enabled', undefined) : t('action.skill.auto-state.disabled', undefined)}</span>
          <span class="action-type ${skillEnabled ? 'auto-battle-enabled' : 'auto-battle-disabled'}">${skillEnabled ? t('action.skill.manage.skill-enabled.enabled', undefined) : t('action.skill.manage.skill-enabled.disabled', undefined)}</span>
          ${autoBattleOrder ? `<span class="action-type">${t('action.skill.order', { order: formatDisplayInteger(autoBattleOrder) })}</span>` : ''}
        </div>
        <div class="action-desc">${escapeHtml(stripSectManagementData(action.desc))}</div>
        ${affinityChip}
      </div>
      <div class="action-cta">
        ${metricReadout ? `<span class="skill-manage-metric-readout">${escapeHtml(metricReadout)}</span>` : ''}
        ${passiveOnly ? '' : `<button class="small-btn ghost ${autoBattleEnabled ? 'active' : ''}" data-skill-manage-auto-toggle="${action.id}" type="button">${t('action.skill.manage.toggle.auto', { state: autoBattleEnabled ? t('common.state.on') : t('common.state.off') })}</button>`}
        <button class="small-btn ghost ${skillEnabled ? 'active' : ''}" data-skill-manage-enabled-toggle="${action.id}" type="button">${t('action.skill.manage.toggle.enabled', { state: skillEnabled ? t('common.state.on') : t('common.state.off') })}</button>
        <button class="small-btn ghost" data-skill-manage-move-up="${action.id}" type="button"${canMoveUp ? '' : ' disabled'}>${t('action.skill.manage.move-up', undefined)}</button>
        <button class="small-btn ghost" data-skill-manage-move-down="${action.id}" type="button"${canMoveDown ? '' : ' disabled'}>${t('action.skill.manage.move-down', undefined)}</button>
        ${options?.showDragHandle ? `<button class="small-btn ghost action-drag-handle" data-skill-manage-drag="${action.id}" draggable="true" type="button">${t('common.action.drag', undefined)}</button>` : ''}
      </div>
    </div>`;
  }
}
