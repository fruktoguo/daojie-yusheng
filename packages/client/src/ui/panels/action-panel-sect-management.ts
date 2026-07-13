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
import {
  SECT_APPLICATION_PAGE_DEFAULT_LIMIT,
  isSectMemberRoleLowerThan,
  type ActionDef,
  type PlayerState,
  type S2C_SectApplicationPage,
} from '@mud/shared';
import { detailModalHost } from '../detail-modal-host';
import { t } from '../i18n';
import { getLocalRealmLevelEntry } from '../../content/local-templates';
import { formatDisplayNumber } from '../../utils/number';
import { escapeHtml } from './action-panel-helpers';
import {
  SectApplicationPageRequestState,
  normalizeSectApplicationPageLimit,
  normalizeSectApplicationPageOffset,
  normalizeSectApplicationPageSearch,
  normalizeSectApplicationRevision,
  resolveSectApplicationPageScopeSectId,
} from './sect-application-page-request-state';
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
const SECT_APPLICATION_SEARCH_DEBOUNCE_MS = 250;
const SECT_APPLICATION_REQUEST_TIMEOUT_MS = 8_000;

const DEFAULT_SECT_MANAGEMENT_ROLES: SectManagementRole[] = [
  { id: 'leader', label: t('action.sect.role.leader', undefined), assignable: false },
  { id: 'supreme_elder', label: t('action.sect.role.supreme-elder', undefined), assignable: true },
  { id: 'deputy', label: t('action.sect.role.deputy', undefined), assignable: true },
  { id: 'elder', label: t('action.sect.role.elder', undefined), assignable: true },
  { id: 'inner', label: t('action.sect.role.inner', undefined), assignable: true },
  { id: 'outer', label: t('action.sect.role.outer', undefined), assignable: true },
  { id: 'labor', label: t('action.sect.role.labor', undefined), assignable: true },
];

const DEFAULT_SECT_MANAGEMENT_PERMISSIONS: SectManagementPermission[] = [
  { id: 'guardian', label: t('action.sect.permission.guardian', undefined) },
  { id: 'member_remove', label: t('action.sect.permission.member-remove', undefined) },
  { id: 'member_approve', label: t('action.sect.permission.member-approve', undefined) },
  { id: 'member_role', label: t('action.sect.permission.member-role', undefined) },
  { id: 'building_create', label: t('action.sect.permission.building-create', undefined) },
  { id: 'building_remove', label: t('action.sect.permission.building-remove', undefined) },
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
    canChangeRole: typeof source.canChangeRole === 'boolean' ? source.canChangeRole : undefined,
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
      next[role.id][permission.id] = source?.[role.id]?.[permission.id] === true
        || role.id === 'leader'
        || role.id === 'supreme_elder';
    }
  }
  return next;
}

function normalizeSectManagementGuardianData(input: unknown): SectManagementGuardianData {
  const source = isRecord(input) ? input : {};
  const active = source.active === true;
  const strength = Math.max(1, Math.floor(Number(source.strength) || 1));
  const remainingQi = Math.max(0, Math.floor(Number(source.remainingQi) || 0));
  const remainingSpiritStone = Math.max(0, Math.floor(Number(source.remainingSpiritStone) || 0));
  const dailySpiritStoneCost = Math.max(0, Number(source.dailySpiritStoneCost) || 0);
  const damageReduction = Math.max(0, Math.min(0.999999, Number(source.damageReduction) || 0));
  const remainingDaysRaw = Number(source.remainingDays);
  const remainingDays = Number.isFinite(remainingDaysRaw) && remainingDaysRaw >= 0 ? remainingDaysRaw : null;
  return { active, strength, remainingQi, remainingSpiritStone, dailySpiritStoneCost, damageReduction, remainingDays };
}

function buildFallbackSectManagementData(player: PlayerState | null): SectManagementData {
  const playerId = player?.id ?? '';
  const name = player?.name || player?.displayName || t('action.sect.fallback.current-leader', undefined);
  const rolePermissions = normalizeSectManagementRolePermissions({}, DEFAULT_SECT_MANAGEMENT_ROLES, DEFAULT_SECT_MANAGEMENT_PERMISSIONS);
  return {
    sectId: typeof player?.sectId === 'string' ? player.sectId.trim() : '',
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
    applicationTotal: 0,
    applicationRevision: 0,
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
    return {
      sectId: typeof parsed.sectId === 'string' && parsed.sectId.trim() ? parsed.sectId.trim() : fallback.sectId,
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
      applicationTotal: Number.isFinite(Number(parsed.applicationTotal))
        ? Math.max(0, Math.trunc(Number(parsed.applicationTotal)))
        : fallback.applicationTotal,
      applicationRevision: normalizeSectApplicationRevision(parsed.applicationRevision),
    };
  } catch (_error) {
    return fallback;
  }
}

// ─── 子面板类 ───

export class SectManagementSubpanel {
  private readonly p: ActionPanelInternal;
  private applicationSearchDraft = '';
  private applicationPageOffset = 0;
  private applicationSectId = '';
  private applicationPage: S2C_SectApplicationPage | null = null;
  private readonly applicationPageRequestState = new SectApplicationPageRequestState();
  private applicationSearchTimer: number | null = null;
  private applicationRequestTimeout: number | null = null;

  constructor(parent: ActionPanel) {
    this.p = parent as unknown as ActionPanelInternal;
  }

  reset(): void {
    this.applicationSearchDraft = '';
    this.applicationPageOffset = 0;
    this.applicationSectId = '';
    this.applicationPage = null;
    this.applicationPageRequestState.reset();
    this.clearApplicationSearchTimer();
    this.clearApplicationRequestTimeout();
  }

  openSectManagementModal(): void {
    this.reset();
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
                <span data-sect-summary-field="guardian">${t('action.sect.manage.summary.guardian', { status: escapeHtml(summary.guardianStatusLabel) })}</span>
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
        this.ensureSectApplicationPageRequested(summary);
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
    this.setText(body, '[data-sect-summary-field="guardian"]', t('action.sect.manage.summary.guardian', { status: summary.guardianStatusLabel }));
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
    if (this.p.sectManagementTab === 'manage') {
      const managePanel = content.querySelector<HTMLElement>('[data-sect-manage-panel]');
      if (managePanel && this.patchSectManagementManagePanel(managePanel, summary)) {
        this.ensureSectApplicationPageRequested(summary);
        return true;
      }
    }
    replaceElementHtml(content, this.renderSectManagementTabPanel(summary));
    this.bindSectManagementActions(content);
    this.ensureSectApplicationPageRequested(summary);
    return true;
  }

  private setText(root: HTMLElement, selector: string, value: string): void {
    const node = root.querySelector<HTMLElement>(selector);
    if (node) {
      node.textContent = value;
    }
  }

  private bindSectActionButtons(root: HTMLElement, options?: AddEventListenerOptions): void {
    root.querySelectorAll<HTMLElement>('[data-sect-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const actionId = button.dataset.sectAction;
        if (!actionId) return;
        if (actionId === 'sect:dissolve' && !window.confirm(t('action.sect.manage.confirm.dissolve', undefined))) return;
        if (actionId === 'sect:leave' && !window.confirm(t('action.sect.manage.confirm.leave', undefined))) return;
        this.p.onAction?.(actionId, false, undefined, undefined, button.textContent?.trim() || '未知行动');
      }, options);
    });
  }

  private bindSectApplicationControls(root: HTMLElement, options?: AddEventListenerOptions): void {
    root.querySelector<HTMLInputElement>('[data-sect-application-search]')?.addEventListener('input', (event) => {
      const input = event.currentTarget as HTMLInputElement;
      this.applicationSearchDraft = input.value;
      this.applicationPageOffset = 0;
      this.clearApplicationSearchTimer();
      this.applicationSearchTimer = window.setTimeout(() => {
        this.applicationSearchTimer = null;
        const summary = this.resolveCurrentSectManagementSummary();
        if (summary) {
          this.requestSectApplicationPage(summary, 0);
        }
      }, SECT_APPLICATION_SEARCH_DEBOUNCE_MS);
      const summary = this.resolveCurrentSectManagementSummary();
      if (summary) {
        this.patchCurrentSectApplicationSection(summary);
      }
    }, options);

    root.querySelectorAll<HTMLButtonElement>('[data-sect-application-page]').forEach((button) => {
      button.addEventListener('click', () => {
        const direction = button.dataset.sectApplicationPage;
        if (direction === 'prev' || direction === 'next') {
          this.requestAdjacentSectApplicationPage(direction);
        }
      }, options);
    });

    root.querySelector<HTMLButtonElement>('[data-sect-application-retry]')?.addEventListener('click', () => {
      const summary = this.resolveCurrentSectManagementSummary();
      if (summary) {
        this.requestSectApplicationPage(summary, this.applicationPageOffset);
      }
    }, options);
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
    this.bindSectActionButtons(root, options);
    this.bindSectApplicationControls(root, options);
    root.querySelectorAll<HTMLElement>('button[data-sect-guardian-active]').forEach((button) => {
      button.addEventListener('click', () => {
        const active = button.dataset.sectGuardianActive === '1';
        const current = button.closest<HTMLElement>('[data-sect-guardian-panel]')?.dataset.sectGuardianState === '1';
        if (active === current) return;
        this.p.onAction?.(`sect:guardian:active:${active ? '1' : '0'}`, false, undefined, undefined, formatGuardianStateLabel(active));
      }, options);
    });
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
    const selfRoleId = summary.data.members.find((member) => member.self)?.roleId;
    const assignableRoles = summary.data.roles.filter(
      (role) => role.assignable && isSectMemberRoleLowerThan(role.id, selfRoleId),
    );
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
    const reviewCard = summary.data.canReviewApplications
      ? this.renderSectApplicationReviewCard(summary)
      : '';
    return `
      <div class="sect-detail-pane" data-sect-manage-panel>
        <div class="sect-pane-head">
          <div>
            <div class="panel-section-title">${t('action.sect.manage.manage.title', undefined)}</div>
          </div>
        </div>
        <div class="sect-manage-card-grid">
          ${reviewCard}
          <div class="sect-manage-secondary-cards" data-sect-manage-secondary-cards>
            ${this.renderSectManagementSecondaryCards(summary)}
          </div>
        </div>
      </div>
    `;
  }

  private renderSectApplicationReviewCard(summary: SectManagementSummary): string {
    const page = this.getActiveSectApplicationPage(summary);
    const pending = this.isSectApplicationPageLoading();
    const pagination = this.buildSectApplicationPagination(summary, page);
    return `
      <div class="sect-manage-card sect-manage-card--wide" data-sect-application-section aria-busy="${pending ? 'true' : 'false'}">
        <div class="sect-application-toolbar">
          <div class="sect-manage-card-title">${t('action.sect.manage.manage.review-title', undefined)}</div>
          <input
            class="ui-input sect-application-search"
            data-sect-application-search
            type="search"
            maxlength="64"
            autocomplete="off"
            value="${escapeHtml(this.applicationSearchDraft)}"
            aria-label="${t('action.sect.manage.manage.search-aria', undefined)}"
            placeholder="${t('action.sect.manage.manage.search-placeholder', undefined)}"
          >
        </div>
        <div class="sect-application-table">
          <div class="sect-application-table-head">
            <span>${t('action.sect.manage.manage.column.applicant', undefined)}</span>
            <span>${t('action.sect.manage.manage.column.type', undefined)}</span>
            <span>${t('action.sect.manage.manage.column.time', undefined)}</span>
            <span>${t('action.sect.manage.manage.column.actions', undefined)}</span>
          </div>
          <div data-sect-application-rows>
            ${this.renderSectApplicationRows(summary, page, pending)}
          </div>
        </div>
        <div class="sect-application-pagination">
          <button class="small-btn ghost" data-sect-application-page="prev" type="button"${pagination.canPrevious && !pending ? '' : ' disabled'}>${t('action.sect.manage.manage.page-prev', undefined)}</button>
          <span class="sect-application-page-status" data-sect-application-page-status aria-live="polite">${pagination.label}</span>
          <button class="small-btn ghost" data-sect-application-page="next" type="button"${pagination.canNext && !pending ? '' : ' disabled'}>${t('action.sect.manage.manage.page-next', undefined)}</button>
        </div>
      </div>
    `;
  }

  private renderSectManagementSecondaryCards(summary: SectManagementSummary): string {
    const transferTargets = summary.data.members.filter((member) => !member.self && !member.leader);
    const transferButtons = transferTargets.length > 0
      ? transferTargets.map((member) => `<button class="small-btn ghost" data-sect-action="sect:transfer:${escapeHtml(encodeURIComponent(member.playerId))}" type="button"${summary.data.canTransfer ? '' : ' disabled'}>${t('action.sect.manage.manage.transfer-to', { name: escapeHtml(member.name) })}</button>`).join('')
      : `<div class="sect-empty-note">${t('action.sect.manage.manage.transfer-empty', undefined)}</div>`;
    const cards: string[] = [];
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
    return cards.join('');
  }

  private renderSectApplicationRows(
    summary: SectManagementSummary,
    page: S2C_SectApplicationPage | null,
    pending: boolean,
  ): string {
    if (summary.data.applicationTotal <= 0 && !normalizeSectApplicationPageSearch(this.applicationSearchDraft)) {
      return `<div class="sect-empty-note">${t('action.sect.manage.manage.applications-empty', undefined)}</div>`;
    }
    if (!page) {
      return pending
        ? `<div class="sect-empty-note">${t('action.sect.manage.manage.applications-loading', undefined)}</div>`
        : `<div class="sect-empty-note sect-application-load-failed">
            <span>${t('action.sect.manage.manage.applications-load-failed', undefined)}</span>
            <button class="small-btn ghost" data-sect-application-retry type="button">${t('action.sect.manage.manage.retry', undefined)}</button>
          </div>`;
    }
    if (page.items.length <= 0) {
      const emptyKey = normalizeSectApplicationPageSearch(this.applicationSearchDraft)
        ? 'action.sect.manage.manage.applications-search-empty'
        : 'action.sect.manage.manage.applications-empty';
      return `<div class="sect-empty-note">${t(emptyKey, undefined)}</div>`;
    }
    return page.items.map((entry) => `
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
    `).join('');
  }

  private buildSectApplicationPagination(
    summary: SectManagementSummary,
    page: S2C_SectApplicationPage | null,
  ): { label: string; canPrevious: boolean; canNext: boolean } {
    if (!page) {
      if (summary.data.applicationTotal <= 0) {
        return {
          label: t('action.sect.manage.manage.page-meta', { total: 0, page: 1, totalPages: 1 }),
          canPrevious: false,
          canNext: false,
        };
      }
      return {
        label: t('action.sect.manage.manage.applications-loading', undefined),
        canPrevious: false,
        canNext: false,
      };
    }
    const totalPages = Math.max(1, Math.ceil(page.total / page.limit));
    const currentPage = Math.min(totalPages, Math.floor(page.offset / page.limit) + 1);
    return {
      label: t('action.sect.manage.manage.page-meta', {
        total: page.total,
        page: currentPage,
        totalPages,
      }),
      canPrevious: page.offset > 0,
      canNext: page.offset + page.items.length < page.total,
    };
  }

  private patchSectManagementManagePanel(root: HTMLElement, summary: SectManagementSummary): boolean {
    const applicationSection = root.querySelector<HTMLElement>('[data-sect-application-section]');
    if (Boolean(applicationSection) !== summary.data.canReviewApplications) {
      return false;
    }
    if (applicationSection) {
      this.patchSectApplicationSection(applicationSection, summary);
    }
    const secondaryCards = root.querySelector<HTMLElement>('[data-sect-manage-secondary-cards]');
    if (!secondaryCards) {
      return false;
    }
    replaceElementHtml(secondaryCards, this.renderSectManagementSecondaryCards(summary));
    this.bindSectManagementActions(secondaryCards);
    return true;
  }

  private patchSectApplicationSection(section: HTMLElement, summary: SectManagementSummary): void {
    const page = this.getActiveSectApplicationPage(summary);
    const pending = this.isSectApplicationPageLoading();
    const rows = section.querySelector<HTMLElement>('[data-sect-application-rows]');
    if (rows) {
      replaceElementHtml(rows, this.renderSectApplicationRows(summary, page, pending));
      this.bindSectActionButtons(rows);
      this.bindSectApplicationControls(rows);
    }
    const pagination = this.buildSectApplicationPagination(summary, page);
    this.setText(section, '[data-sect-application-page-status]', pagination.label);
    const previous = section.querySelector<HTMLButtonElement>('[data-sect-application-page="prev"]');
    const next = section.querySelector<HTMLButtonElement>('[data-sect-application-page="next"]');
    if (previous) {
      previous.disabled = pending || !pagination.canPrevious;
    }
    if (next) {
      next.disabled = pending || !pagination.canNext;
    }
    section.setAttribute('aria-busy', pending ? 'true' : 'false');
  }

  private getActiveSectApplicationPage(summary: SectManagementSummary): S2C_SectApplicationPage | null {
    const page = this.applicationPage;
    const sectId = this.resolveCurrentSectId(summary);
    if (
      !page
      || !sectId
      || page.sectId !== sectId
      || normalizeSectApplicationPageSearch(page.search) !== normalizeSectApplicationPageSearch(this.applicationSearchDraft)
      || normalizeSectApplicationPageOffset(page.offset) !== this.applicationPageOffset
      || normalizeSectApplicationPageLimit(page.limit) !== SECT_APPLICATION_PAGE_DEFAULT_LIMIT
      || normalizeSectApplicationRevision(page.revision) < summary.data.applicationRevision
    ) {
      return null;
    }
    return page;
  }

  private resolveCurrentSectId(summary: SectManagementSummary): string {
    return resolveSectApplicationPageScopeSectId(summary.data.sectId, this.p.previewPlayer?.sectId);
  }

  private isSectApplicationPageLoading(): boolean {
    return this.applicationSearchTimer !== null || this.applicationPageRequestState.isPending();
  }

  private resolveCurrentSectManagementSummary(): SectManagementSummary | null {
    const action = this.p.currentActions.find((entry) => entry.id === 'sect:manage');
    return action ? this.resolveSectManagementSummary(action) : null;
  }

  private syncSectApplicationPageVersion(summary: SectManagementSummary): void {
    const sectId = this.resolveCurrentSectId(summary);
    const revision = normalizeSectApplicationRevision(summary.data.applicationRevision);
    if (this.applicationSectId && sectId !== this.applicationSectId) {
      this.reset();
    }
    this.applicationSectId = sectId;

    const pending = this.applicationPageRequestState.getPending();
    if (pending && (pending.sectId !== sectId || pending.minimumRevision < revision)) {
      this.applicationPageRequestState.reset();
      this.clearApplicationRequestTimeout();
    }
    if (this.applicationPage && (
      this.applicationPage.sectId !== sectId
      || normalizeSectApplicationRevision(this.applicationPage.revision) < revision
    )) {
      this.applicationPage = null;
    }
    if (summary.data.applicationTotal <= 0 && !normalizeSectApplicationPageSearch(this.applicationSearchDraft)) {
      this.applicationPageOffset = 0;
    }
  }

  private ensureSectApplicationPageRequested(summary: SectManagementSummary, force = false): void {
    if (
      this.p.sectManagementTab !== 'manage'
      || !summary.data.canReviewApplications
      || !this.p.onRequestSectApplicationPage
      || !this.resolveCurrentSectId(summary)
    ) {
      return;
    }
    if (summary.data.applicationTotal <= 0 && !normalizeSectApplicationPageSearch(this.applicationSearchDraft)) {
      this.patchCurrentSectApplicationSection(summary);
      return;
    }
    if (this.applicationPageRequestState.isPending()) {
      return;
    }
    if (!force && this.getActiveSectApplicationPage(summary)) {
      return;
    }
    this.requestSectApplicationPage(summary, this.applicationPageOffset);
  }

  private requestSectApplicationPage(summary: SectManagementSummary, offset: number): void {
    const sectId = this.resolveCurrentSectId(summary);
    if (!summary.data.canReviewApplications || !sectId || !this.p.onRequestSectApplicationPage) {
      return;
    }
    if (summary.data.applicationTotal <= 0 && !normalizeSectApplicationPageSearch(this.applicationSearchDraft)) {
      this.applicationPage = null;
      this.applicationPageOffset = 0;
      this.applicationPageRequestState.reset();
      this.clearApplicationRequestTimeout();
      this.patchCurrentSectApplicationSection(summary);
      return;
    }
    this.clearApplicationRequestTimeout();
    const payload = this.applicationPageRequestState.begin({
      sectId,
      search: this.applicationSearchDraft,
      offset,
      limit: SECT_APPLICATION_PAGE_DEFAULT_LIMIT,
      minimumRevision: summary.data.applicationRevision,
    });
    this.applicationPageOffset = normalizeSectApplicationPageOffset(payload.offset);
    this.armApplicationRequestTimeout(payload.requestId);
    if (!this.p.onRequestSectApplicationPage(payload)) {
      this.applicationPageRequestState.cancel(payload.requestId);
      this.clearApplicationRequestTimeout();
    }
    this.patchCurrentSectApplicationSection(summary);
  }

  private requestAdjacentSectApplicationPage(direction: 'prev' | 'next'): void {
    if (this.applicationPageRequestState.isPending()) {
      return;
    }
    const summary = this.resolveCurrentSectManagementSummary();
    if (!summary) {
      return;
    }
    const page = this.getActiveSectApplicationPage(summary);
    if (!page) {
      this.requestSectApplicationPage(summary, this.applicationPageOffset);
      return;
    }
    const nextOffset = direction === 'prev'
      ? Math.max(0, page.offset - page.limit)
      : page.offset + page.limit;
    if (direction === 'next' && nextOffset >= page.total) {
      return;
    }
    this.requestSectApplicationPage(summary, nextOffset);
  }

  handleSectApplicationPage(page: S2C_SectApplicationPage): void {
    const decision = this.applicationPageRequestState.resolve(page);
    if (decision === 'ignored') {
      return;
    }
    this.clearApplicationRequestTimeout();
    const summary = this.resolveCurrentSectManagementSummary();
    if (!summary) {
      this.applicationPage = null;
      return;
    }
    if (decision === 'invalid-current') {
      this.applicationPage = null;
      this.patchCurrentSectApplicationSection(summary);
      this.ensureSectApplicationPageRequested(summary, true);
      return;
    }

    const total = Math.max(0, Math.trunc(Number(page.total) || 0));
    const limit = normalizeSectApplicationPageLimit(page.limit);
    const responseOffset = normalizeSectApplicationPageOffset(page.offset);
    if (total > 0 && responseOffset >= total) {
      this.applicationPage = null;
      this.applicationPageOffset = Math.floor((total - 1) / limit) * limit;
      this.requestSectApplicationPage(summary, this.applicationPageOffset);
      return;
    }

    const normalizedOffset = total <= 0 ? 0 : responseOffset;
    this.applicationPageOffset = normalizedOffset;
    this.applicationPage = {
      ...page,
      search: normalizeSectApplicationPageSearch(page.search),
      offset: normalizedOffset,
      limit,
      total,
      revision: normalizeSectApplicationRevision(page.revision),
      items: (Array.isArray(page.items) ? page.items : []).map((entry) => ({
        playerId: typeof entry?.playerId === 'string' ? entry.playerId.trim() : '',
        name: typeof entry?.name === 'string' && entry.name.trim()
          ? entry.name.trim()
          : t('action.sect.fallback.unknown-applicant', undefined),
        appliedAt: Number.isFinite(Number(entry?.appliedAt)) ? Math.max(0, Math.trunc(Number(entry.appliedAt))) : 0,
      })).filter((entry) => entry.playerId),
    };
    this.patchCurrentSectApplicationSection(summary);
  }

  private patchCurrentSectApplicationSection(summary: SectManagementSummary): void {
    if (
      this.p.sectManagementTab !== 'manage'
      || !detailModalHost.isOpenFor(this.p.SECT_MANAGEMENT_MODAL_OWNER)
    ) {
      return;
    }
    const body = document.getElementById('detail-modal-body');
    const section = body?.querySelector<HTMLElement>('[data-sect-application-section]');
    if (section) {
      this.patchSectApplicationSection(section, summary);
    }
  }

  private armApplicationRequestTimeout(requestId: string): void {
    this.clearApplicationRequestTimeout();
    this.applicationRequestTimeout = window.setTimeout(() => {
      this.applicationRequestTimeout = null;
      if (this.applicationPageRequestState.cancel(requestId)) {
        const summary = this.resolveCurrentSectManagementSummary();
        if (summary) {
          this.patchCurrentSectApplicationSection(summary);
        }
      }
    }, SECT_APPLICATION_REQUEST_TIMEOUT_MS);
  }

  private clearApplicationRequestTimeout(): void {
    if (this.applicationRequestTimeout !== null) {
      window.clearTimeout(this.applicationRequestTimeout);
      this.applicationRequestTimeout = null;
    }
  }

  private clearApplicationSearchTimer(): void {
    if (this.applicationSearchTimer !== null) {
      window.clearTimeout(this.applicationSearchTimer);
      this.applicationSearchTimer = null;
    }
  }

  renderSectMemberRow(summary: SectManagementSummary, member: SectManagementMember, assignableRoles: SectManagementRole[]): string {
    const selfRoleId = summary.data.members.find((entry) => entry.self)?.roleId;
    const canEditRole = summary.data.canChangeRoles
      && !member.leader
      && !member.self
      && (member.canChangeRole ?? isSectMemberRoleLowerThan(member.roleId, selfRoleId));
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
      const disabled = !summary.data.canEditPermissions
        || role.id === 'leader'
        || role.id === 'supreme_elder';
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
    const leaderName = data.members.find((member) => member.leader)?.name || this.p.previewPlayer?.name || this.p.previewPlayer?.displayName || t('action.sect.manage.fallback.leader', undefined);
    const realmLabel = this.p.previewPlayer?.realm?.displayName || this.p.previewPlayer?.realmName || this.p.previewPlayer?.realm?.name || t('action.sect.manage.fallback.realm', undefined);
    const memberCountLabel = String(data.members.length || 1);
    const notice = t('action.sect.manage.notice', { name });
    const summary = { name, mark, domainLabel, guardianStatusLabel, guardianAuraLabel, leaderName, realmLabel, memberCountLabel, notice, data };
    this.syncSectApplicationPageVersion(summary);
    return summary;
  }

  buildSectManagementRevision(summary: SectManagementSummary): string {
    const tabKeys = this.resolveSectManagementTabs(summary).map((entry) => entry.tab).join('|');
    const base = `${this.p.sectManagementTab}|${tabKeys}|${summary.name}|${summary.mark}|${summary.domainLabel}|${summary.guardianStatusLabel}|${summary.leaderName}|${summary.realmLabel}|${summary.memberCountLabel}`;
    switch (this.p.sectManagementTab) {
      case 'members':
        return `${base}|${summary.data.canRemoveMembers}|${summary.data.canChangeRoles}|${JSON.stringify(summary.data.members)}|${JSON.stringify(summary.data.roles)}`;
      case 'roles':
        return `${base}|${summary.data.canEditPermissions}|${JSON.stringify(summary.data.roles)}|${JSON.stringify(summary.data.permissions)}|${JSON.stringify(summary.data.rolePermissions)}`;
      case 'manage':
        return `${base}|${summary.data.canReviewApplications}|${summary.data.canTransfer}|${summary.data.canDissolve}|${summary.data.canLeave}|${summary.data.applicationTotal}|${summary.data.applicationRevision}|${JSON.stringify(summary.data.members)}`;
      case 'guardian':
        return `${base}|${summary.guardianStatusLabel}|${JSON.stringify(summary.data.guardian)}|${summary.data.canManageGuardian}`;
      case 'overview':
      case 'domain':
      default:
        return base;
    }
  }
}
