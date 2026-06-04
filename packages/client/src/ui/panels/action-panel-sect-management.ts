/**
 * 本文件是客户端 DOM UI 的 action panel sect management 模块，负责具体面板、弹层或渲染片段。
 *
 * 维护时优先保持局部更新和原有交互状态，不在 UI 层裁定资产、战斗或移动合法性。
 */
/**
 * 宗门管理子面板
 * 负责宗门管理弹层的渲染和交互。
 * 从 action-panel.ts 拆分而来。
 */
import type { ActionDef, PlayerState } from '@mud/shared';
import { detailModalHost } from '../detail-modal-host';
import { t } from '../i18n';
import { getLocalRealmLevelEntry } from '../../content/local-templates';
import { formatDisplayNumber } from '../../utils/number';
import { escapeHtml } from './action-panel-helpers';
import type { ActionPanel } from './action-panel';
import type {
  ActionPanelInternal,
  SectManagementData,
  SectManagementGuardianData,
  SectManagementMember,
  SectManagementPermission,
  SectManagementRole,
  SectManagementSummary,
  SectManagementTab,
} from './action-panel-internal';

// ─── 本地常量 ───

const SECT_MANAGEMENT_DATA_PATTERN = /\n?@@sect:([^@\n]+)@@/;

const DEFAULT_SECT_MANAGEMENT_ROLES: SectManagementRole[] = [
  { id: 'leader', label: t('action.sect.role.leader', undefined), assignable: false },
  { id: 'deputy', label: t('action.sect.role.deputy', undefined), assignable: true },
  { id: 'elder', label: t('action.sect.role.elder', undefined), assignable: true },
  { id: 'inner', label: t('action.sect.role.inner', undefined), assignable: true },
  { id: 'outer', label: t('action.sect.role.outer', undefined), assignable: true },
  { id: 'labor', label: t('action.sect.role.labor', undefined), assignable: true },
  { id: 'supreme_elder', label: t('action.sect.role.supreme-elder', undefined), assignable: false },
];

const DEFAULT_SECT_MANAGEMENT_PERMISSIONS: SectManagementPermission[] = [
  { id: 'guardian', label: t('action.sect.permission.guardian', undefined) },
  { id: 'member_remove', label: t('action.sect.permission.member-remove', undefined) },
  { id: 'member_role', label: t('action.sect.permission.member-role', undefined) },
];

// ─── 本地工具函数 ───

function stripSectManagementData(desc: string | undefined): string {
  return (desc ?? '').replace(SECT_MANAGEMENT_DATA_PATTERN, '').trim();
}

function replaceElementHtml(root: HTMLElement, html: string): void {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  root.replaceChildren(template.content.cloneNode(true));
}

function formatSectTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return t('common.value.unknown', undefined);
  }
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

function formatSectMemberRealmLabel(member: SectManagementMember, fallback = t('common.value.unknown', undefined)): string {
  if (!Number.isFinite(Number(member.realmLv)) || Number(member.realmLv) <= 0) {
    return fallback;
  }
  const realmLv = Math.trunc(Number(member.realmLv));
  return getLocalRealmLevelEntry(realmLv)?.displayName ?? `Lv.${realmLv}`;
}

function formatGuardianPercent(value: number): string {
  return `${(Math.max(0, Math.min(0.999999, Number(value) || 0)) * 100).toFixed(2)}%`;
}

function formatGuardianDays(value: number | null): string {
  if (!Number.isFinite(Number(value)) || value === null) {
    return t('common.value.unknown', undefined);
  }
  return `${formatDisplayNumber(Number(value), { maximumFractionDigits: 2 })} 天`;
}

function formatGuardianStateLabel(active: boolean): string {
  return active ? t('action.sect.manage.guardian.state-on', undefined) : t('action.sect.manage.guardian.state-off', undefined);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeSectManagementRole(input: unknown): SectManagementRole {
  const source = input && typeof input === 'object' ? input as Partial<SectManagementRole> : {};
  const id = typeof source.id === 'string' && source.id.trim() ? source.id.trim() : 'outer';
  const fallback = DEFAULT_SECT_MANAGEMENT_ROLES.find((role) => role.id === id);
  return {
    id,
    label: typeof source.label === 'string' && source.label.trim() ? source.label.trim() : fallback?.label ?? '未知角色',
    assignable: source.assignable === true,
  };
}

function normalizeSectManagementPermission(input: unknown): SectManagementPermission {
  const source = input && typeof input === 'object' ? input as Partial<SectManagementPermission> : {};
  const id = typeof source.id === 'string' && source.id.trim() ? source.id.trim() : 'guardian';
  const fallback = DEFAULT_SECT_MANAGEMENT_PERMISSIONS.find((permission) => permission.id === id);
  return {
    id,
    label: typeof source.label === 'string' && source.label.trim() ? source.label.trim() : fallback?.label ?? '未知权限',
  };
}

function normalizeSectManagementMember(input: unknown): SectManagementMember {
  const source = input && typeof input === 'object' ? input as Partial<SectManagementMember> : {};
  const playerId = typeof source.playerId === 'string' && source.playerId.trim() ? source.playerId.trim() : '';
  const roleId = typeof source.roleId === 'string' && source.roleId.trim() ? source.roleId.trim() : 'outer';
  const role = DEFAULT_SECT_MANAGEMENT_ROLES.find((entry) => entry.id === roleId);
  return {
    playerId,
    name: typeof source.name === 'string' && source.name.trim() ? source.name.trim() : t('action.sect.fallback.unknown-member', undefined),
    roleId,
    roleLabel: typeof source.roleLabel === 'string' && source.roleLabel.trim() ? source.roleLabel.trim() : role?.label ?? '未知角色',
    realmLv: Number.isFinite(Number(source.realmLv)) && Number(source.realmLv) > 0 ? Math.trunc(Number(source.realmLv)) : null,
    statusLabel: typeof source.statusLabel === 'string' && source.statusLabel.trim() ? source.statusLabel.trim() : t('action.sect.status.offline', undefined),
    self: source.self === true,
    leader: source.leader === true,
  };
}

function normalizeSectManagementApplication(input: unknown): { playerId: string; name: string; appliedAt: number } {
  const source = input && typeof input === 'object' ? input as Partial<{ playerId: string; name: string; appliedAt: number }> : {};
  const playerId = typeof source.playerId === 'string' && source.playerId.trim() ? source.playerId.trim() : '';
  return {
    playerId,
    name: typeof source.name === 'string' && source.name.trim() ? source.name.trim() : t('action.sect.fallback.unknown-applicant', undefined),
    appliedAt: Number.isFinite(Number(source.appliedAt)) ? Math.trunc(Number(source.appliedAt)) : 0,
  };
}

function normalizeSectManagementRolePermissions(
  input: unknown,
  roles: SectManagementRole[],
  permissions: SectManagementPermission[],
): Record<string, Record<string, boolean>> {
  const source = input && typeof input === 'object' ? input as Record<string, Record<string, boolean>> : {};
  const next: Record<string, Record<string, boolean>> = {};
  for (const role of roles) {
    next[role.id] = {};
    for (const permission of permissions) {
      next[role.id][permission.id] = source?.[role.id]?.[permission.id] === true || role.id === 'leader';
    }
  }
  return next;
}

function normalizeSectManagementGuardianData(input: unknown): SectManagementGuardianData {
  const source = isRecord(input) ? input : {};
  const active = source.active === true;
  const maintaining = source.maintaining === true;
  const strength = Math.max(1, Math.floor(Number(source.strength) || 1));
  const remainingQi = Math.max(0, Math.floor(Number(source.remainingQi) || 0));
  const remainingSpiritStone = Math.max(0, Math.floor(Number(source.remainingSpiritStone) || 0));
  const dailySpiritStoneCost = Math.max(0, Number(source.dailySpiritStoneCost) || 0);
  const damageReduction = Math.max(0, Math.min(0.999999, Number(source.damageReduction) || 0));
  const remainingDaysRaw = Number(source.remainingDays);
  const remainingDays = Number.isFinite(remainingDaysRaw) && remainingDaysRaw >= 0 ? remainingDaysRaw : null;
  return { active, maintaining, strength, remainingQi, remainingSpiritStone, dailySpiritStoneCost, damageReduction, remainingDays };
}

function buildFallbackSectManagementData(player: PlayerState | null): SectManagementData {
  const playerId = player?.id ?? '';
  const name = player?.name || player?.displayName || t('action.sect.fallback.current-leader', undefined);
  const rolePermissions = normalizeSectManagementRolePermissions({}, DEFAULT_SECT_MANAGEMENT_ROLES, DEFAULT_SECT_MANAGEMENT_PERMISSIONS);
  return {
    selfPlayerId: playerId,
    canEditPermissions: true,
    canTransfer: true,
    canDissolve: true,
    canLeave: false,
    canReviewApplications: true,
    canManageGuardian: true,
    guardian: normalizeSectManagementGuardianData(null),
    canRemoveMembers: true,
    canChangeRoles: true,
    roles: DEFAULT_SECT_MANAGEMENT_ROLES,
    permissions: DEFAULT_SECT_MANAGEMENT_PERMISSIONS,
    rolePermissions,
    members: [{
      playerId,
      name,
      roleId: 'leader',
      roleLabel: t('action.sect.role.leader', undefined),
      realmLv: Number.isFinite(Number(player?.realm?.realmLv ?? player?.realmLv)) ? Math.trunc(Number(player?.realm?.realmLv ?? player?.realmLv)) : null,
      statusLabel: t('action.sect.status.online', undefined),
      self: true,
      leader: true,
    }],
    applications: [],
  };
}

function parseSectManagementData(desc: string | undefined, player: PlayerState | null): SectManagementData {
  const fallback = buildFallbackSectManagementData(player);
  const match = SECT_MANAGEMENT_DATA_PATTERN.exec(desc ?? '');
  if (!match?.[1]) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(decodeURIComponent(match[1])) as Partial<SectManagementData>;
    const roles = Array.isArray(parsed.roles) && parsed.roles.length > 0
      ? parsed.roles.map(normalizeSectManagementRole)
      : fallback.roles;
    const permissions = Array.isArray(parsed.permissions) && parsed.permissions.length > 0
      ? parsed.permissions.map(normalizeSectManagementPermission)
      : fallback.permissions;
    const members = Array.isArray(parsed.members) && parsed.members.length > 0
      ? parsed.members.map(normalizeSectManagementMember)
      : fallback.members;
    const applications = Array.isArray(parsed.applications)
      ? parsed.applications.map(normalizeSectManagementApplication).filter((entry) => entry.playerId)
      : fallback.applications;
    return {
      selfPlayerId: typeof parsed.selfPlayerId === 'string' ? parsed.selfPlayerId : fallback.selfPlayerId,
      canEditPermissions: parsed.canEditPermissions === true,
      canTransfer: parsed.canTransfer === true,
      canDissolve: parsed.canDissolve === true,
      canLeave: parsed.canLeave === true,
      canReviewApplications: parsed.canReviewApplications === true,
      canManageGuardian: parsed.canManageGuardian === true,
      guardian: normalizeSectManagementGuardianData(parsed.guardian),
      canRemoveMembers: parsed.canRemoveMembers === true,
      canChangeRoles: parsed.canChangeRoles === true,
      roles,
      permissions,
      rolePermissions: normalizeSectManagementRolePermissions(parsed.rolePermissions, roles, permissions),
      members,
      applications,
    };
  } catch (_error) {
    return fallback;
  }
}

// ─── 子面板类 ───

export class SectManagementSubpanel {
  private readonly p: ActionPanelInternal;

  constructor(parent: ActionPanel) {
    this.p = parent as unknown as ActionPanelInternal;
  }

  openSectManagementModal(): void {
    this.p.sectManagementTab = 'overview';
    this.p.sectManagementExternalRevision = '';
    this.renderSectManagementModal();
  }

  renderSectManagementModalIfOpen(): void {
    if (!detailModalHost.isOpenFor(this.p.SECT_MANAGEMENT_MODAL_OWNER)) {
      return;
    }
    const action = this.p.currentActions.find((entry) => entry.id === 'sect:manage');
    if (!action) {
      detailModalHost.close(this.p.SECT_MANAGEMENT_MODAL_OWNER);
      return;
    }
    const summary = this.resolveSectManagementSummary(action);
    const nextRevision = this.buildSectManagementRevision(summary);
    if (this.p.sectManagementExternalRevision === nextRevision) {
      return;
    }
    const body = document.getElementById('detail-modal-body');
    if (body && this.patchSectManagementModal(body, summary)) {
      this.p.sectManagementExternalRevision = nextRevision;
      return;
    }
    this.renderSectManagementModal();
  }

  renderSectManagementModal(): void {
    const action = this.p.currentActions.find((entry) => entry.id === 'sect:manage');
    const summary = this.resolveSectManagementSummary(action);
    const tabs = this.resolveSectManagementTabs(summary);
    if (!tabs.some((entry) => entry.tab === this.p.sectManagementTab)) {
      this.p.sectManagementTab = tabs[0]?.tab ?? 'overview';
    }
    this.p.sectManagementExternalRevision = this.buildSectManagementRevision(summary);
    detailModalHost.open({
      ownerId: this.p.SECT_MANAGEMENT_MODAL_OWNER,
      variantClass: 'detail-modal--sect-management',
      title: t('action.sect.manage.title', undefined),
      subtitle: t('action.sect.manage.subtitle', { name: summary.name, mark: summary.mark }),
      renderBody: (body) => {
        replaceElementHtml(body, `
          <div class="sect-manage-shell">
            <aside class="sect-manage-sidebar" aria-label="${t('action.sect.manage.sidebar.aria', undefined)}">
              <div class="sect-manage-sidebar-title">${t('action.sect.manage.sidebar.title', undefined)}</div>
              <div class="action-skill-subtabs sect-manage-subtabs" role="tablist" aria-label="${t('action.sect.manage.aria', undefined)}">
                ${tabs.map((entry) => this.renderSectManagementTabButton(entry.tab, entry.label)).join('')}
              </div>
            </aside>
            <main class="sect-manage-main">
              <div class="skill-manage-summary sect-manage-summary">
                <span data-sect-summary-field="name">${escapeHtml(summary.name)}</span>
                <span data-sect-summary-field="mark">${t('action.sect.manage.summary.mark', { mark: escapeHtml(summary.mark) })}</span>
                <span data-sect-summary-field="domain">${t('action.sect.manage.summary.domain', { domain: escapeHtml(summary.domainLabel) })}</span>
                <span data-sect-summary-field="sectId">${escapeHtml(summary.sectIdLabel)}</span>
              </div>
              <div class="sect-manage-content">
                ${this.renderSectManagementTabPanel(summary)}
              </div>
            </main>
          </div>
        `);
      },
      onAfterRender: (body, signal) => {
        this.bindSectManagementActions(body, signal);
      },
    });
  }

  private patchSectManagementModal(body: HTMLElement, summary: SectManagementSummary): boolean {
    const tabs = this.resolveSectManagementTabs(summary);
    if (!tabs.some((entry) => entry.tab === this.p.sectManagementTab)) {
      return false;
    }
    const existingTabs = Array.from(body.querySelectorAll<HTMLElement>('.sect-manage-subtabs [data-sect-manage-tab]')).map((entry) => entry.dataset.sectManageTab).filter(Boolean).join('|');
    const nextTabs = tabs.map((entry) => entry.tab).join('|');
    if (existingTabs && existingTabs !== nextTabs) {
      return false;
    }
    this.setText(body, '[data-sect-summary-field="name"]', summary.name);
    this.setText(body, '[data-sect-summary-field="mark"]', t('action.sect.manage.summary.mark', { mark: summary.mark }));
    this.setText(body, '[data-sect-summary-field="domain"]', t('action.sect.manage.summary.domain', { domain: summary.domainLabel }));
    this.setText(body, '[data-sect-summary-field="sectId"]', summary.sectIdLabel);
    const content = body.querySelector<HTMLElement>('.sect-manage-content');
    if (!content) {
      return false;
    }
    if (this.p.sectManagementTab === 'guardian' && summary.data.canManageGuardian) {
      const guardianPanel = content.querySelector<HTMLElement>('[data-sect-guardian-panel]');
      if (guardianPanel) {
        this.patchSectGuardianPanel(guardianPanel, summary);
        return true;
      }
    }
    replaceElementHtml(content, this.renderSectManagementTabPanel(summary));
    this.bindSectManagementActions(content);
    return true;
  }

  private setText(root: HTMLElement, selector: string, value: string): void {
    const node = root.querySelector<HTMLElement>(selector);
    if (node) {
      node.textContent = value;
    }
  }

  private bindSectManagementActions(root: HTMLElement, signal?: AbortSignal): void {
    const options = signal ? { signal } : undefined;
    root.querySelectorAll<HTMLElement>('[data-sect-manage-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.sectManageTab as SectManagementTab | undefined;
        if (!tab || tab === this.p.sectManagementTab) return;
        this.p.sectManagementTab = tab;
        this.renderSectManagementModal();
      }, options);
    });
    root.querySelectorAll<HTMLElement>('[data-sect-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const actionId = button.dataset.sectAction;
        if (!actionId) return;
        if (actionId === 'sect:dissolve' && !window.confirm(t('action.sect.manage.confirm.dissolve', undefined))) return;
        if (actionId === 'sect:leave' && !window.confirm(t('action.sect.manage.confirm.leave', undefined))) return;
        this.p.onAction?.(actionId, false, undefined, undefined, button.textContent?.trim() || '未知行动');
      }, options);
    });
    root.querySelectorAll<HTMLElement>('button[data-sect-guardian-active]').forEach((button) => {
      button.addEventListener('click', () => {
        const active = button.dataset.sectGuardianActive === '1';
        const current = button.closest<HTMLElement>('[data-sect-guardian-panel]')?.dataset.sectGuardianState === '1';
        if (active === current) return;
        this.p.onAction?.(`sect:guardian:active:${active ? '1' : '0'}`, false, undefined, undefined, formatGuardianStateLabel(active));
      }, options);
    });
    root.querySelector<HTMLElement>('[data-sect-guardian-maintain]')?.addEventListener('click', (event) => {
      const button = event.currentTarget as HTMLElement;
      const actionId = button.dataset.sectGuardianMaintain === '1'
        ? 'sect:guardian:cancel_maintain'
        : 'sect:guardian:maintain';
      this.p.onAction?.(actionId, false, undefined, undefined, button.textContent?.trim() || t('action.sect.manage.guardian.maintain', undefined));
    }, options);
    root.querySelectorAll<HTMLSelectElement>('[data-sect-member-role-select]').forEach((select) => {
      select.addEventListener('change', () => {
        const playerId = select.dataset.sectMemberRoleSelect;
        const roleId = select.value;
        if (!playerId || !roleId) return;
        this.p.onAction?.(`sect:member:role:${encodeURIComponent(playerId)}:${roleId}`, false, undefined, undefined, t('action.sect.manage.action.update-role', undefined));
      }, options);
    });
    root.querySelector<HTMLElement>('[data-sect-guardian-strength-apply]')?.addEventListener('click', () => {
      const scope = root.closest<HTMLElement>('[data-sect-guardian-panel]') ?? root;
      const strength = this.readSectGuardianStrengthValue(scope);
      this.p.onAction?.(`sect:guardian:strength:${strength}`, false, undefined, undefined, t('action.sect.manage.guardian.control-strength', undefined));
    }, options);
    this.syncSectGuardianStrengthControl(root);
  }

  resolveSectManagementTabs(summary: SectManagementSummary): Array<{ tab: SectManagementTab; label: string }> {
    const tabs: Array<{ tab: SectManagementTab; label: string }> = [
      { tab: 'overview', label: t('action.sect.manage.tab.overview', undefined) },
      { tab: 'members', label: t('action.sect.manage.tab.members', undefined) },
    ];
    if (summary.data.canEditPermissions) {
      tabs.push({ tab: 'roles', label: t('action.sect.manage.tab.roles', undefined) });
    }
    if (
      summary.data.canReviewApplications
      || summary.data.canManageGuardian
      || summary.data.canTransfer
      || summary.data.canDissolve
      || summary.data.canLeave
    ) {
      tabs.push({ tab: 'manage', label: t('action.sect.manage.tab.manage', undefined) });
    }
    if (summary.data.canManageGuardian) {
      tabs.push({ tab: 'guardian', label: t('action.sect.manage.tab.guardian', undefined) });
    }
    tabs.push({ tab: 'domain', label: t('action.sect.manage.tab.domain', undefined) });
    return tabs;
  }

  renderSectManagementTabButton(tab: SectManagementTab, label: string): string {
    const active = this.p.sectManagementTab === tab;
    return `<button class="action-skill-subtab-btn sect-manage-tab-btn ${active ? 'active' : ''}" data-sect-manage-tab="${tab}" type="button" role="tab" aria-selected="${active ? 'true' : 'false'}">${label}</button>`;
  }

  renderSectManagementTabPanel(summary: SectManagementSummary): string {
    switch (this.p.sectManagementTab) {
      case 'overview':
        return this.renderSectManagementOverviewPanel(summary);
      case 'members':
        return this.renderSectManagementMembersPanel(summary);
      case 'roles':
        return summary.data.canEditPermissions ? this.renderSectManagementRolesPanel(summary) : this.renderSectManagementOverviewPanel(summary);
      case 'manage':
        return this.renderSectManagementManagePanel(summary);
      case 'guardian':
        if (!summary.data.canManageGuardian) {
          return this.renderSectManagementOverviewPanel(summary);
        }
        return this.renderSectGuardianPanel(summary);
      case 'domain':
      default:
        return `
          <div class="panel-section">
            <div class="panel-section-head">
              <div class="panel-section-title">${t('action.sect.manage.domain.title', undefined)}</div>
            </div>
            <div class="skill-manage-summary">
              <span>${escapeHtml(summary.name)}</span>
              <span>${t('action.sect.manage.summary.mark', { mark: escapeHtml(summary.mark) })}</span>
              <span>${t('action.sect.manage.domain.region', { region: escapeHtml(summary.domainLabel) })}</span>
            </div>
            <div class="action-section-hint">${t('action.sect.manage.domain.copy', undefined)}</div>
          </div>`;
    }
  }

  private renderSectGuardianPanel(summary: SectManagementSummary): string {
    const active = summary.data.guardian.active;
    const maintaining = summary.data.guardian.maintaining;
    return `
      <div class="panel-section" data-sect-guardian-panel data-sect-guardian-state="${active ? '1' : '0'}">
        <div class="panel-section-head">
          <div class="panel-section-title">${t('action.sect.manage.guardian.title', undefined)}</div>
          <div class="sect-guardian-tab-toggle" data-sect-guardian-toggle data-guardian-active="${active ? '1' : '0'}" role="tablist" aria-label="${t('action.sect.manage.guardian.toggle', undefined)}">
            <button class="sect-guardian-tab-toggle-btn ${active ? '' : 'active'}" data-sect-guardian-active="0" type="button" role="tab" aria-selected="${active ? 'false' : 'true'}"${summary.data.canManageGuardian ? '' : ' disabled'}>${t('action.sect.manage.guardian.state-off', undefined)}</button>
            <button class="sect-guardian-tab-toggle-btn ${active ? 'active' : ''}" data-sect-guardian-active="1" type="button" role="tab" aria-selected="${active ? 'true' : 'false'}"${summary.data.canManageGuardian ? '' : ' disabled'}>${t('action.sect.manage.guardian.state-on', undefined)}</button>
          </div>
        </div>
        <div class="skill-manage-summary" data-sect-guardian-summary>
          <span data-sect-guardian-stat="status">${t('action.sect.manage.guardian.status', { status: escapeHtml(summary.guardianStatusLabel) })}</span>
          <span data-sect-guardian-stat="qi">${t('action.sect.manage.guardian.current-qi', { qi: formatDisplayNumber(summary.data.guardian.remainingQi) })}</span>
          <span data-sect-guardian-stat="reduction">${t('action.sect.manage.guardian.current-reduction', { reduction: formatGuardianPercent(summary.data.guardian.damageReduction) })}</span>
          <span data-sect-guardian-stat="stones">${t('action.sect.manage.guardian.current-stones', { stones: formatDisplayNumber(summary.data.guardian.remainingSpiritStone) })}</span>
          <span data-sect-guardian-stat="days">${t('action.sect.manage.guardian.remaining-days', { days: formatGuardianDays(summary.data.guardian.remainingDays) })}</span>
        </div>
        <div class="formation-config-grid">
          <label class="formation-config-field ui-detail-field">
            <strong>${t('action.sect.manage.guardian.control-strength', undefined)}</strong>
            <input class="ui-input formation-config-input" data-sect-guardian-strength-input type="number" min="1" step="1" value="${summary.data.guardian.strength}">
          </label>
          <div class="formation-cost-card ui-detail-field" data-sect-guardian-strength-cost>
            <strong>${t('action.sect.manage.guardian.daily-stone-cost', undefined)}</strong>
            <output data-sect-guardian-daily-cost>${formatDisplayNumber(summary.data.guardian.dailySpiritStoneCost)} / 天</output>
          </div>
          <button class="small-btn" data-sect-guardian-strength-apply data-sect-guardian-allowed="${summary.data.canManageGuardian ? '1' : '0'}" type="button"${summary.data.canManageGuardian ? '' : ' disabled'}>${t('action.sect.manage.guardian.apply-strength', undefined)}</button>
          <button class="small-btn ghost" data-sect-guardian-maintain="${maintaining ? '1' : '0'}" data-sect-guardian-allowed="${summary.data.canManageGuardian ? '1' : '0'}" type="button"${summary.data.canManageGuardian ? '' : ' disabled'}>${maintaining ? t('action.sect.manage.guardian.stop-maintain', undefined) : t('action.sect.manage.guardian.maintain', undefined)}</button>
        </div>
        <div class="action-section-hint">${t('action.sect.manage.guardian.copy', undefined)}</div>
      </div>`;
  }

  private patchSectGuardianPanel(root: HTMLElement, summary: SectManagementSummary): void {
    const active = summary.data.guardian.active;
    root.dataset.sectGuardianState = active ? '1' : '0';
    const toggle = root.querySelector<HTMLElement>('[data-sect-guardian-toggle]');
    if (toggle) {
      toggle.dataset.guardianActive = active ? '1' : '0';
    }
    root.querySelectorAll<HTMLButtonElement>('button[data-sect-guardian-active]').forEach((button) => {
      const buttonActive = button.dataset.sectGuardianActive === (active ? '1' : '0');
      button.classList.toggle('active', buttonActive);
      button.setAttribute('aria-selected', buttonActive ? 'true' : 'false');
      button.disabled = !summary.data.canManageGuardian;
    });
    this.setText(root, '[data-sect-guardian-stat="status"]', t('action.sect.manage.guardian.status', { status: summary.guardianStatusLabel }));
    this.setText(root, '[data-sect-guardian-stat="qi"]', t('action.sect.manage.guardian.current-qi', { qi: formatDisplayNumber(summary.data.guardian.remainingQi) }));
    this.setText(root, '[data-sect-guardian-stat="reduction"]', t('action.sect.manage.guardian.current-reduction', { reduction: formatGuardianPercent(summary.data.guardian.damageReduction) }));
    this.setText(root, '[data-sect-guardian-stat="stones"]', t('action.sect.manage.guardian.current-stones', { stones: formatDisplayNumber(summary.data.guardian.remainingSpiritStone) }));
    this.setText(root, '[data-sect-guardian-stat="days"]', t('action.sect.manage.guardian.remaining-days', { days: formatGuardianDays(summary.data.guardian.remainingDays) }));
    this.setText(root, '[data-sect-guardian-daily-cost]', `${formatDisplayNumber(summary.data.guardian.dailySpiritStoneCost)} / 天`);
    const maintainButton = root.querySelector<HTMLButtonElement>('[data-sect-guardian-maintain]');
    if (maintainButton) {
      maintainButton.dataset.sectGuardianMaintain = summary.data.guardian.maintaining ? '1' : '0';
      maintainButton.textContent = summary.data.guardian.maintaining
        ? t('action.sect.manage.guardian.stop-maintain', undefined)
        : t('action.sect.manage.guardian.maintain', undefined);
      maintainButton.disabled = !summary.data.canManageGuardian;
    }
    const input = root.querySelector<HTMLInputElement>('[data-sect-guardian-strength-input]');
    if (input && document.activeElement !== input) {
      input.value = String(summary.data.guardian.strength);
    }
    this.syncSectGuardianStrengthControl(root);
  }

  readSectGuardianStrengthValue(root: HTMLElement): number {
    const input = root.querySelector<HTMLInputElement>('[data-sect-guardian-strength-input]');
    const strength = Math.trunc(Number(input?.value ?? 1));
    return Number.isFinite(strength) ? Math.max(1, strength) : 1;
  }

  syncSectGuardianStrengthControl(root: HTMLElement): void {
    const input = root.querySelector<HTMLInputElement>('[data-sect-guardian-strength-input]');
    if (input) {
      input.min = '1';
      input.step = '1';
    }
    const button = root.querySelector<HTMLButtonElement>('[data-sect-guardian-strength-apply]');
    if (button) {
      const allowed = button.dataset.sectGuardianAllowed !== '0';
      button.disabled = !allowed;
      button.textContent = allowed ? t('action.sect.manage.guardian.apply-strength', undefined) : t('action.sect.manage.guardian.no-permission', undefined);
    }
  }

  renderSectManagementOverviewPanel(summary: SectManagementSummary): string {
    return `
      <div class="sect-detail-pane">
        <div class="sect-detail-card sect-detail-card--hero">
          <div class="sect-detail-card-main">
            <div class="sect-detail-name">${escapeHtml(summary.name)}</div>
            <div class="sect-detail-tag-row">
              <span class="sect-detail-tag">${t('action.sect.manage.overview.level', undefined)}</span>
              <span class="sect-detail-tag">${t('action.sect.manage.overview.leader', { leaderName: escapeHtml(summary.leaderName) })}</span>
              <span class="sect-detail-tag">${t('action.sect.manage.overview.members', { memberCount: escapeHtml(summary.memberCountLabel) })}</span>
              <span class="sect-detail-tag">${t('action.sect.manage.overview.mark', { mark: escapeHtml(summary.mark) })}</span>
            </div>
            <div class="sect-detail-notice">${escapeHtml(summary.notice)}</div>
          </div>
          <div class="sect-detail-card-actions">
            <button class="small-btn ghost" data-sect-manage-tab="manage" type="button">${t('action.sect.manage.overview.manage', undefined)}</button>
          </div>
        </div>
        <div class="sect-detail-stat-grid">
          ${this.renderSectStatCard(t('action.sect.manage.stat.mark', undefined), summary.mark)}
          ${this.renderSectStatCard(t('action.sect.manage.stat.domain', undefined), summary.domainLabel)}
          ${this.renderSectStatCard(t('action.sect.manage.stat.members', undefined), summary.memberCountLabel)}
          ${this.renderSectStatCard(t('action.sect.manage.stat.leader', undefined), summary.leaderName)}
        </div>
        <div class="sect-detail-action-grid">
          <button class="sect-detail-action-card" data-sect-manage-tab="members" type="button">
            <span class="sect-detail-action-title">${t('action.sect.manage.overview.actions.members', undefined)}</span>
          </button>
          <button class="sect-detail-action-card" data-sect-manage-tab="roles" type="button">
            <span class="sect-detail-action-title">${t('action.sect.manage.overview.actions.roles', undefined)}</span>
          </button>
          <button class="sect-detail-action-card" data-sect-manage-tab="guardian" type="button">
            <span class="sect-detail-action-title">${t('action.sect.manage.overview.actions.guardian', undefined)}</span>
          </button>
          <button class="sect-detail-action-card" data-sect-manage-tab="domain" type="button">
            <span class="sect-detail-action-title">${t('action.sect.manage.overview.actions.domain', undefined)}</span>
          </button>
        </div>
      </div>
    `;
  }

  renderSectManagementMembersPanel(summary: SectManagementSummary): string {
    const assignableRoles = summary.data.roles.filter((role) => role.assignable);
    const rows = summary.data.members.map((member) => this.renderSectMemberRow(summary, member, assignableRoles)).join('');
    return `
      <div class="sect-detail-pane">
        <div class="sect-pane-head">
          <div>
            <div class="panel-section-title">${t('action.sect.manage.members.title', undefined)}</div>
          </div>
          <div class="sect-detail-count">${escapeHtml(summary.memberCountLabel)}</div>
        </div>
        <div class="sect-member-table">
          <div class="sect-member-table-head">
            <span>${t('action.sect.manage.members.column.member', undefined)}</span>
            <span>${t('action.sect.manage.members.column.role', undefined)}</span>
            <span>${t('action.sect.manage.members.column.realm', undefined)}</span>
            <span>${t('action.sect.manage.members.column.contrib', undefined)}</span>
            <span>${t('action.sect.manage.members.column.week-contrib', undefined)}</span>
            <span>${t('action.sect.manage.members.column.status', undefined)}</span>
          </div>
          ${rows}
        </div>
        ${summary.data.members.length <= 1 ? `<div class="sect-empty-note">${t('action.sect.manage.members.empty', undefined)}</div>` : ''}
      </div>
    `;
  }

  renderSectManagementRolesPanel(summary: SectManagementSummary): string {
    const cards = summary.data.roles.map((role) => this.renderSectRolePermissionCard(summary, role)).join('');
    return `
      <div class="sect-detail-pane">
        <div class="sect-pane-head">
          <div>
            <div class="panel-section-title">${t('action.sect.manage.roles.title', undefined)}</div>
          </div>
        </div>
        <div class="sect-role-grid">
          ${cards}
        </div>
        <div class="sect-current-role">${t('action.sect.manage.roles.copy', undefined)}</div>
      </div>
    `;
  }

  renderSectManagementManagePanel(summary: SectManagementSummary): string {
    const transferTargets = summary.data.members.filter((member) => !member.self && !member.leader);
    const transferButtons = transferTargets.length > 0
      ? transferTargets.map((member) => `<button class="small-btn ghost" data-sect-action="sect:transfer:${escapeHtml(encodeURIComponent(member.playerId))}" type="button"${summary.data.canTransfer ? '' : ' disabled'}>${t('action.sect.manage.manage.transfer-to', { name: escapeHtml(member.name) })}</button>`).join('')
      : `<div class="sect-empty-note">${t('action.sect.manage.manage.transfer-empty', undefined)}</div>`;
    const applicationRows = summary.data.applications.length > 0
      ? summary.data.applications.map((entry) => `
        <div class="sect-application-table-row">
          <span class="sect-member-name-cell">
            <span class="sect-member-name-main">${escapeHtml(entry.name)}</span>
            <span class="sect-member-name-sub">${t('action.sect.manage.manage.pending', undefined)}</span>
          </span>
          <span>${t('action.sect.manage.manage.application-type', undefined)}</span>
          <span>${escapeHtml(formatSectTimestamp(entry.appliedAt))}</span>
          <span class="action-section-actions">
            <button class="small-btn" data-sect-action="sect:application:approve:${escapeHtml(encodeURIComponent(entry.playerId))}" type="button"${summary.data.canReviewApplications ? '' : ' disabled'}>${t('action.sect.manage.manage.approve', undefined)}</button>
            <button class="small-btn ghost" data-sect-action="sect:application:reject:${escapeHtml(encodeURIComponent(entry.playerId))}" type="button"${summary.data.canReviewApplications ? '' : ' disabled'}>${t('action.sect.manage.manage.reject', undefined)}</button>
          </span>
        </div>
      `).join('')
      : `<div class="sect-empty-note">${t('action.sect.manage.manage.applications-empty', undefined)}</div>`;
    const cards: string[] = [];
    if (summary.data.canReviewApplications) {
      cards.push(`
        <div class="sect-manage-card sect-manage-card--wide">
          <div class="sect-manage-card-title">${t('action.sect.manage.manage.review-title', undefined)}</div>
          <div class="sect-application-table">
            <div class="sect-application-table-head">
              <span>${t('action.sect.manage.manage.column.applicant', undefined)}</span>
              <span>${t('action.sect.manage.manage.column.type', undefined)}</span>
              <span>${t('action.sect.manage.manage.column.time', undefined)}</span>
              <span>${t('action.sect.manage.manage.column.actions', undefined)}</span>
            </div>
            ${applicationRows}
          </div>
        </div>
      `);
    }
    if (summary.data.canManageGuardian) {
      cards.push(`
        <div class="sect-manage-card">
          <div class="sect-manage-card-title">${t('action.sect.manage.manage.guardian-title', undefined)}</div>
          <button class="small-btn" data-sect-manage-tab="guardian" type="button">${t('action.sect.manage.manage.go-guardian', undefined)}</button>
        </div>
      `);
    }
    if (summary.data.canTransfer) {
      cards.push(`
        <div class="sect-manage-card">
          <div class="sect-manage-card-title">${t('action.sect.manage.manage.transfer-title', undefined)}</div>
          <div class="action-section-actions">${transferButtons}</div>
        </div>
      `);
    }
    if (summary.data.canDissolve) {
      cards.push(`
        <div class="sect-manage-card">
          <div class="sect-manage-card-title">${t('action.sect.manage.manage.dissolve-title', undefined)}</div>
          <button class="small-btn ghost" data-sect-action="sect:dissolve" type="button">${t('action.sect.manage.action.dissolve', undefined)}</button>
        </div>
      `);
    }
    if (summary.data.canLeave) {
      cards.push(`
        <div class="sect-manage-card">
          <div class="sect-manage-card-title">${t('action.sect.manage.manage.leave-title', undefined)}</div>
          <button class="small-btn ghost" data-sect-action="sect:leave" type="button">${t('action.sect.manage.action.leave', undefined)}</button>
        </div>
      `);
    }
    return `
      <div class="sect-detail-pane">
        <div class="sect-pane-head">
          <div>
            <div class="panel-section-title">${t('action.sect.manage.manage.title', undefined)}</div>
          </div>
        </div>
        <div class="sect-manage-card-grid">
          ${cards.join('')}
        </div>
      </div>
    `;
  }

  renderSectMemberRow(summary: SectManagementSummary, member: SectManagementMember, assignableRoles: SectManagementRole[]): string {
    const canEditRole = summary.data.canChangeRoles && !member.leader;
    const roleControl = canEditRole
      ? `<select class="ui-input formation-config-input" data-sect-member-role-select="${escapeHtml(member.playerId)}">
          ${assignableRoles.map((role) => `<option value="${escapeHtml(role.id)}"${role.id === member.roleId ? ' selected' : ''}>${escapeHtml(role.label)}</option>`).join('')}
        </select>`
      : `<span class="sect-detail-tag ${member.leader ? 'strong' : ''}">${escapeHtml(member.roleLabel)}</span>`;
    const canRemove = summary.data.canRemoveMembers && !member.leader && !member.self;
    const removeButton = canRemove
      ? `<button class="small-btn ghost" data-sect-action="sect:member:remove:${escapeHtml(encodeURIComponent(member.playerId))}" type="button">${t('action.sect.manage.member.remove', undefined)}</button>`
      : '';
    const statusClass = member.statusLabel === t('action.sect.status.online', undefined) ? 'sect-online-text' : 'sect-detail-tag';
    return `
      <div class="sect-member-table-row">
        <span class="sect-member-name-cell">
          <span class="sect-member-name-main">${escapeHtml(member.name)}</span>
          <span class="sect-member-name-sub">${member.self ? t('action.sect.manage.member.self-role', undefined) : escapeHtml(member.roleLabel)}</span>
        </span>
        <span>${roleControl}</span>
        <span>${escapeHtml(formatSectMemberRealmLabel(member, member.self ? summary.realmLabel : t('common.value.unknown', undefined)))}</span>
        <span>0</span>
        <span>0</span>
        <span>
          <span class="${statusClass}">${escapeHtml(member.statusLabel)}</span>
          ${removeButton}
        </span>
      </div>
    `;
  }

  renderSectRolePermissionCard(summary: SectManagementSummary, role: SectManagementRole): string {
    const permissions = summary.data.permissions.map((permission) => {
      const checked = summary.data.rolePermissions[role.id]?.[permission.id] === true;
      const disabled = !summary.data.canEditPermissions || role.id === 'leader';
      return `
        <button class="skill-manage-toggle-chip ${checked ? 'active' : ''}" data-sect-action="sect:permission:toggle:${escapeHtml(role.id)}:${escapeHtml(permission.id)}" type="button"${disabled ? ' disabled' : ''}>
          ${escapeHtml(permission.label)}
        </button>
      `;
    }).join('');
    return `
      <div class="sect-role-card ${role.assignable ? '' : 'is-muted'}">
        <div class="sect-role-card-head">
          <div class="sect-role-card-title">${escapeHtml(role.label)}</div>
          <span class="sect-detail-tag ${role.assignable ? 'strong' : ''}">${role.assignable ? t('action.sect.manage.role.assignable', undefined) : t('action.sect.manage.role.unassignable', undefined)}</span>
        </div>
        <div class="sect-role-permissions">${permissions}</div>
      </div>
    `;
  }

  renderSectStatCard(label: string, value: string): string {
    return `
      <div class="sect-stat-card">
        <div class="sect-stat-card-label">${escapeHtml(label)}</div>
        <div class="sect-stat-card-value">${escapeHtml(value)}</div>
      </div>
    `;
  }

  renderSectRoleCard(title: string, badge: string, permissions: string[], disabled: boolean): string {
    return `
      <div class="sect-role-card ${disabled ? 'is-muted' : ''}">
        <div class="sect-role-card-head">
          <div class="sect-role-card-title">${escapeHtml(title)}</div>
          <span class="sect-detail-tag ${disabled ? '' : 'strong'}">${escapeHtml(badge)}</span>
        </div>
        <div class="sect-role-permissions">
          ${permissions.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}
        </div>
      </div>
    `;
  }

  resolveSectManagementSummary(action?: ActionDef): SectManagementSummary {
    const rawDesc = action?.desc ?? '';
    const data = parseSectManagementData(rawDesc, this.p.previewPlayer ?? null);
    const desc = stripSectManagementData(rawDesc);
    const name = desc.split('·')[0]?.trim() || action?.name || t('action.sect.manage.fallback.name', undefined);
    const mark = /印记\s*([^·\s]+)/.exec(desc)?.[1] ?? t('action.sect.manage.fallback.mark', undefined);
    const domainLabel = /地域\s*([^·\s。]+)/.exec(desc)?.[1] ?? t('action.sect.manage.fallback.domain', undefined);
    const guardianStatusLabel = /大阵\s*([^·\s。]+)/.exec(desc)?.[1] ?? t('action.sect.manage.fallback.guardian-status', undefined);
    const guardianAuraLabel = /灵力\s*([^·\s。]+)/.exec(desc)?.[1] ?? t('action.sect.manage.fallback.guardian-aura', undefined);
    const sectIdLabel = this.p.previewPlayer?.sectId ? t('action.sect.manage.summary.sect-id', { sectId: this.p.previewPlayer.sectId }) : t('action.sect.manage.summary.bound', undefined);
    const leaderName = data.members.find((member) => member.leader)?.name || this.p.previewPlayer?.name || this.p.previewPlayer?.displayName || t('action.sect.manage.fallback.leader', undefined);
    const realmLabel = this.p.previewPlayer?.realm?.displayName || this.p.previewPlayer?.realmName || this.p.previewPlayer?.realm?.name || t('action.sect.manage.fallback.realm', undefined);
    const memberCountLabel = String(data.members.length || 1);
    const notice = t('action.sect.manage.notice', { name });
    return { name, mark, domainLabel, guardianStatusLabel, guardianAuraLabel, sectIdLabel, leaderName, realmLabel, memberCountLabel, notice, data };
  }

  buildSectManagementRevision(summary: SectManagementSummary): string {
    const tabKeys = this.resolveSectManagementTabs(summary).map((entry) => entry.tab).join('|');
    const base = `${this.p.sectManagementTab}|${tabKeys}|${summary.name}|${summary.mark}|${summary.domainLabel}|${summary.sectIdLabel}|${summary.leaderName}|${summary.realmLabel}|${summary.memberCountLabel}`;
    switch (this.p.sectManagementTab) {
      case 'members':
        return `${base}|${summary.data.canRemoveMembers}|${summary.data.canChangeRoles}|${JSON.stringify(summary.data.members)}|${JSON.stringify(summary.data.roles)}`;
      case 'roles':
        return `${base}|${summary.data.canEditPermissions}|${JSON.stringify(summary.data.roles)}|${JSON.stringify(summary.data.permissions)}|${JSON.stringify(summary.data.rolePermissions)}`;
      case 'manage':
        return `${base}|${summary.data.canReviewApplications}|${summary.data.canTransfer}|${summary.data.canDissolve}|${summary.data.canLeave}|${JSON.stringify(summary.data.applications)}|${JSON.stringify(summary.data.members)}`;
      case 'guardian':
        return `${base}|${summary.guardianStatusLabel}|${JSON.stringify(summary.data.guardian)}|${summary.data.canManageGuardian}`;
      case 'overview':
      case 'domain':
      default:
        return base;
    }
  }
}
