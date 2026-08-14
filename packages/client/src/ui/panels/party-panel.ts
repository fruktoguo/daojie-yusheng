/** 队伍面板：队伍 Tab 的整段渲染与局部更新。由 social-panel 挂载，不直接访问 socket。 */
import type { PartyPanelView, PartyPurpose } from '@mud/shared';
import { PARTY_MAX_MEMBERS } from '@mud/shared';
import {
  PARTY_EXP_MODE_LABELS,
  PARTY_LOOT_MODE_LABELS,
  PARTY_PURPOSE_LABELS,
  type PartyPanelRenderState,
  type PartyStateSourceCallbacks,
  renderPartyMemberCard,
} from './party-panel-view';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const PURPOSE_ORDER: readonly PartyPurpose[] = ['general', 'leveling', 'boss', 'tower', 'exploration'];

export class PartyPanel {
  private host: HTMLElement | null = null;
  private callbacks: PartyStateSourceCallbacks | null = null;
  private state: PartyPanelRenderState | null = null;

  mount(host: HTMLElement): void {
    this.host = host;
    this.host.addEventListener('click', (event) => this.handleClick(event));
    this.host.addEventListener('submit', (event) => this.handleSubmit(event));
    this.host.addEventListener('change', (event) => this.handleChange(event));
  }

  setCallbacks(callbacks: PartyStateSourceCallbacks): void {
    this.callbacks = callbacks;
  }

  render(state: PartyPanelRenderState): void {
    if (!this.host) return;
    const previous = this.state;
    this.state = state;
    if (this.canPatchOnly(previous, state)) {
      this.patchMembers(state);
      return;
    }
    this.host.innerHTML = this.renderAll(state);
  }

  /** 仅当成员字段变化且用户未在编辑表单时走 keyed 局部 patch，避免打断输入。 */
  private canPatchOnly(previous: PartyPanelRenderState | null, next: PartyPanelRenderState): boolean {
    if (!previous || !this.host) return false;
    if (!this.host.querySelector('[data-party-member-list="true"]')) return false;
    if (previous.view.party?.partyId !== next.view.party?.partyId) return false;
    if (previous.view.party?.leaderPlayerId !== next.view.party?.leaderPlayerId) return false;
    if (previous.view.party?.settings.revision !== next.view.party?.settings.revision) return false;
    if (previous.view.party?.revision !== next.view.party?.revision) return false;
    if (previous.playerId !== next.playerId) return false;
    if (previous.view.incomingInvites !== next.view.incomingInvites) return false;
    if (previous.view.incomingApplications !== next.view.incomingApplications) return false;
    if (previous.view.recruitments !== next.view.recruitments) return false;
    const active = document.activeElement as HTMLElement | null;
    if (active && this.host.contains(active) && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA')) {
      return false;
    }
    return true;
  }

  patchMembers(state: PartyPanelRenderState): void {
    if (!this.host) return;
    this.state = state;
    const list = this.host.querySelector<HTMLElement>('[data-party-member-list="true"]');
    if (!list) return;
    const playerId = state.playerId;
    const view = state.view;
    const isLeaderView = Boolean(view.party && view.party.leaderPlayerId === playerId);
    const active = document.activeElement as HTMLElement | null;
    const editing = Boolean(active && this.host.contains(active) && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA'));
    const next = new Map(view.party?.members.map((member) => [member.playerId, member]) ?? []);
    for (const existing of Array.from(list.querySelectorAll<HTMLElement>('[data-party-member]'))) {
      const memberId = existing.dataset.partyMember ?? '';
      if (!next.has(memberId)) {
        if (editing) return;
        existing.remove();
      }
    }
    for (const member of view.party?.members ?? []) {
      const html = renderPartyMemberCard(member, playerId, isLeaderView);
      const signature = buildMemberSignature(member, isLeaderView);
      const current = list.querySelector<HTMLElement>(`[data-party-member="${CSS.escape(member.playerId)}"]`);
      if (!current) {
        if (editing) return;
        list.insertAdjacentHTML('beforeend', html);
        const inserted = list.querySelector<HTMLElement>(`[data-party-member="${CSS.escape(member.playerId)}"]`);
        if (inserted) inserted.dataset.partyMemberSignature = signature;
        continue;
      }
      if (current.dataset.partyMemberSignature !== signature) {
        if (editing) return;
        const template = document.createElement('template');
        template.innerHTML = html.trim();
        const nextNode = template.content.firstElementChild;
        if (nextNode instanceof HTMLElement) {
          nextNode.dataset.partyMemberSignature = signature;
          current.replaceWith(nextNode);
        }
      }
    }
  }

  setRecruitingPurpose(purpose: PartyPurpose): void {
    if (!this.state) return;
    this.state = { ...this.state, recruitingPurpose: purpose };
  }

  private renderAll(state: PartyPanelRenderState): string {
    const view = state.view;
    return `
      <div class="party-panel" data-party-root="true">
        ${this.renderInvites(view)}
        ${view.party ? this.renderPartySection(state) : this.renderNoPartySection(state)}
        ${this.renderRecruitmentSection(state)}
      </div>
    `;
  }

  private renderInvites(view: PartyPanelView): string {
    if (view.incomingInvites.length === 0) return '';
    return `
      <section class="party-section">
        <div class="social-panel-section-head"><div class="social-panel-section-title">收到的组队邀请</div></div>
        <div class="ui-list">
          ${view.incomingInvites.map((invite) => `
            <div class="ui-list-row">
              <div class="ui-list-main">
                <div class="ui-list-title">${escapeHtml(invite.fromName)} 邀请你加入队伍</div>
                <div class="ui-list-subtitle">${escapeHtml(invite.partyLabel)} · 已有 ${invite.memberCount} 人</div>
              </div>
              <div class="social-row-actions">
                <button class="small-btn" type="button" data-party-action="invite-accept" data-invite-id="${escapeHtml(invite.inviteId)}">接受</button>
                <button class="small-btn ghost" type="button" data-party-action="invite-reject" data-invite-id="${escapeHtml(invite.inviteId)}">拒绝</button>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  private renderNoPartySection(state: PartyPanelRenderState): string {
    const queued = state.view.matchQueue.queued === true;
    return `
      <section class="party-section">
        <div class="social-panel-section-head"><div class="social-panel-section-title">我的队伍</div></div>
        <div class="empty-hint compact">你还没有队伍。创建一个队伍邀请道友同行，或发布招募寻找同伴。</div>
        <div class="party-actions-row">
          <button class="small-btn" type="button" data-party-action="create">创建队伍</button>
        </div>
        <form class="party-inline-form" data-party-form="invite-no">
          <input class="party-input" type="number" min="1" step="1" name="playerNo" inputmode="numeric" placeholder="输入玩家序号邀请" aria-label="按玩家序号邀请" />
          <button class="small-btn ghost" type="submit">邀请</button>
        </form>
        <div class="party-actions-row">
          ${queued
            ? `<span class="party-match-waiting">正在等待匹配（${escapeHtml(PARTY_PURPOSE_LABELS[state.view.matchQueue.purpose ?? 'general'])}）</span>
               <button class="small-btn ghost" type="button" data-party-action="match-leave">取消匹配</button>`
            : `
              <select class="party-select" data-party-field="match-purpose" aria-label="匹配目的">
                ${PURPOSE_ORDER.map((purpose) => `<option value="${purpose}">${PARTY_PURPOSE_LABELS[purpose]}</option>`).join('')}
              </select>
              <button class="small-btn ghost" type="button" data-party-action="match-join">自动匹配</button>
            `}
        </div>
      </section>
    `;
  }

  private renderPartySection(state: PartyPanelRenderState): string {
    const view = state.view;
    const party = view.party!;
    const playerId = state.playerId;
    const isLeader = party.leaderPlayerId === playerId;
    const leader = party.members.find((member) => member.playerId === party.leaderPlayerId);
    const leaderOffline = leader ? !leader.online : false;
    return `
      <section class="party-section">
        <div class="social-panel-section-head">
          <div class="social-panel-section-title">我的队伍</div>
          <div class="social-panel-section-meta"><span class="social-panel-count">${party.members.length}/${PARTY_MAX_MEMBERS}</span></div>
        </div>
        <div class="party-member-list" data-party-member-list="true">
          ${party.members.map((member) => this.decorateMemberCard(renderPartyMemberCard(member, playerId, isLeader), member, isLeader)).join('')}
        </div>
        <div class="party-actions-row">
          <button class="small-btn" type="button" data-party-action="open-chat">队伍聊天${state.chatUnreadCount > 0 ? `（${state.chatUnreadCount} 条未读）` : ''}</button>
        </div>
        ${isLeader ? this.renderLeaderTools(party) : `
          <div class="party-actions-row">
            <form class="party-inline-form" data-party-form="invite-no">
              <input class="party-input" type="number" min="1" step="1" name="playerNo" inputmode="numeric" placeholder="输入玩家序号邀请" aria-label="按玩家序号邀请" />
              <button class="small-btn ghost" type="submit">邀请</button>
            </form>
            <button class="small-btn ghost danger" type="button" data-party-action="leave">退出队伍</button>
          </div>
          ${leaderOffline ? '<div class="party-hint">队长离线期间无法执行移交、解散等管理操作，请等待队长归来。</div>' : ''}
        `}
      </section>
    `;
  }

  private renderLeaderTools(party: NonNullable<PartyPanelView['party']>): string {
    const revision = party.settings.revision;
    return `
      <div class="party-leader-tools">
        <div class="party-settings-grid">
          <label class="party-setting">
            <span>经验分配</span>
            <select class="party-select" data-party-setting="expMode" data-revision="${revision}">
              ${(Object.keys(PARTY_EXP_MODE_LABELS) as Array<keyof typeof PARTY_EXP_MODE_LABELS>).map((key) =>
                `<option value="${key}" ${party.settings.expMode === key ? 'selected' : ''}>${PARTY_EXP_MODE_LABELS[key]}</option>`).join('')}
            </select>
          </label>
          <label class="party-setting">
            <span>拾取方式</span>
            <select class="party-select" data-party-setting="lootMode" data-revision="${revision}">
              ${(Object.keys(PARTY_LOOT_MODE_LABELS) as Array<keyof typeof PARTY_LOOT_MODE_LABELS>).map((key) =>
                `<option value="${key}" ${party.settings.lootMode === key ? 'selected' : ''}>${PARTY_LOOT_MODE_LABELS[key]}</option>`).join('')}
            </select>
          </label>
          <label class="party-setting party-setting-toggle">
            <input type="checkbox" data-party-setting="friendlyFireEnabled" data-revision="${revision}" ${party.settings.friendlyFireEnabled ? 'checked' : ''} />
            <span>开启全队友伤</span>
          </label>
        </div>
        <div class="party-hint">友伤是双重门槛：队长在此开启全队友伤后，成员还需在自己的战斗设置里把「队伍」加入敌对目标，主动攻击或自动战斗才会对队友生效；默认互为友方，不会误伤。</div>
        <form class="party-inline-form" data-party-form="invite-no">
          <input class="party-input" type="number" min="1" step="1" name="playerNo" inputmode="numeric" placeholder="输入玩家序号邀请" aria-label="按玩家序号邀请" />
          <button class="small-btn ghost" type="submit">邀请</button>
        </form>
        <div class="party-actions-row">
          <button class="small-btn ghost danger" type="button" data-party-action="leave">退出队伍</button>
          <button class="small-btn ghost danger" type="button" data-party-action="disband">解散队伍</button>
        </div>
      </div>
    `;
  }

  private renderRecruitmentSection(state: PartyPanelRenderState): string {
    const view = state.view;
    const party = view.party;
    const isLeader = Boolean(party && party.leaderPlayerId === state.playerId);
    const myRecruitment = party?.recruitment ?? null;
    const applications = view.incomingApplications;
    return `
      <section class="party-section">
        <div class="social-panel-section-head">
          <div class="social-panel-section-title">招募大厅</div>
          <div class="social-panel-section-meta">
            <button class="small-btn ghost" type="button" data-party-action="recruit-refresh">刷新</button>
          </div>
        </div>
        ${isLeader ? this.renderRecruitmentPublisher(party!, myRecruitment) : ''}
        ${isLeader && applications.length > 0 ? `
          <div class="party-applications">
            <div class="party-subheading">入队申请</div>
            <div class="ui-list">
              ${applications.map((entry) => `
                <div class="ui-list-row">
                  <div class="ui-list-main">
                    <div class="ui-list-title">${escapeHtml(entry.playerName)}</div>
                    <div class="ui-list-subtitle">${entry.realmLv > 0 ? `境界 ${entry.realmLv} 层` : '境界未知'}</div>
                  </div>
                  <div class="social-row-actions">
                    <button class="small-btn" type="button" data-party-action="application-accept" data-application-id="${escapeHtml(entry.applicationId)}">同意</button>
                    <button class="small-btn ghost" type="button" data-party-action="application-reject" data-application-id="${escapeHtml(entry.applicationId)}">拒绝</button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
        <div class="party-recruit-filter">
          <select class="party-select" data-party-field="recruit-purpose" aria-label="按目的筛选招募">
            <option value="">全部目的</option>
            ${PURPOSE_ORDER.map((purpose) => `<option value="${purpose}" ${state.recruitingPurpose === purpose ? 'selected' : ''}>${PARTY_PURPOSE_LABELS[purpose]}</option>`).join('')}
          </select>
        </div>
        ${this.renderRecruitmentList(state)}
      </section>
    `;
  }

  private renderRecruitmentPublisher(party: NonNullable<PartyPanelView['party']>, recruitment: PartyPanelView['recruitments'][number] | null): string {
    if (recruitment) {
      return `
        <div class="party-my-recruitment">
          <div class="party-subheading">我的招募</div>
          <div class="ui-list-row">
            <div class="ui-list-main">
              <div class="ui-list-title">${escapeHtml(PARTY_PURPOSE_LABELS[recruitment.purpose])} · ${recruitment.memberCount}/${recruitment.maxMembers} 人</div>
              <div class="ui-list-subtitle">境界 ${recruitment.minRealmLv} - ${recruitment.maxRealmLv} 层${recruitment.note ? ` · ${escapeHtml(recruitment.note)}` : ''}</div>
            </div>
            <div class="social-row-actions">
              <button class="small-btn ghost danger" type="button" data-party-action="recruit-close" data-revision="${party.revision}">关闭招募</button>
            </div>
          </div>
        </div>
      `;
    }
    return `
      <form class="party-recruit-form" data-party-form="recruit-publish" data-revision="${party.revision}">
        <div class="party-recruit-form-grid">
          <select class="party-select" name="purpose" aria-label="招募目的">
            ${PURPOSE_ORDER.map((purpose) => `<option value="${purpose}">${PARTY_PURPOSE_LABELS[purpose]}</option>`).join('')}
          </select>
          <input class="party-input" type="number" name="minRealmLv" min="1" step="1" placeholder="最低境界" aria-label="最低境界" />
          <input class="party-input" type="number" name="maxRealmLv" min="1" step="1" placeholder="最高境界" aria-label="最高境界" />
        </div>
        <input class="party-input" type="text" name="note" maxlength="200" placeholder="招募说明（可选，200 字以内）" aria-label="招募说明" />
        <button class="small-btn" type="submit">发布招募</button>
      </form>
    `;
  }

  private renderRecruitmentList(state: PartyPanelRenderState): string {
    const view = state.view;
    const filtered = view.recruitments.filter((entry) => entry.partyId !== view.party?.partyId);
    if (!state.recruitmentLoaded) {
      return `<div class="empty-hint compact">正在加载招募信息…</div>`;
    }
    if (filtered.length === 0) {
      return `<div class="empty-hint compact">暂时没有符合条件的招募，可以发布自己的招募或稍后再看。</div>`;
    }
    return `
      <div class="ui-list party-recruitment-list">
        ${filtered.map((entry) => `
          <div class="ui-list-row">
            <div class="ui-list-main">
              <div class="ui-list-title">${escapeHtml(PARTY_PURPOSE_LABELS[entry.purpose])} · ${escapeHtml(entry.leaderName)} 的队伍（${entry.memberCount}/${entry.maxMembers}）</div>
              <div class="ui-list-subtitle">境界 ${entry.minRealmLv} - ${entry.maxRealmLv} 层${entry.note ? ` · ${escapeHtml(entry.note)}` : ''}</div>
            </div>
            <div class="social-row-actions">
              <button class="small-btn" type="button" data-party-action="recruit-apply" data-listing-id="${escapeHtml(entry.listingId)}">申请加入</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  private decorateMemberCard(html: string, member: NonNullable<PartyPanelView['party']>['members'][number], isLeaderView: boolean): string {
    const signature = buildMemberSignature(member, isLeaderView);
    return html.replace('data-party-member="', `data-party-member-signature="${escapeHtml(signature)}" data-party-member="`);
  }

  private handleClick(event: MouseEvent): void {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-party-action]');
    if (!target || !this.callbacks || !this.state) {
      return;
    }
    const action = target.dataset.partyAction;
    switch (action) {
      case 'create':
        this.callbacks.onCreate();
        break;
      case 'open-chat':
        this.callbacks.onOpenChat();
        break;
      case 'invite-accept':
        if (target.dataset.inviteId) this.callbacks.onRespondInvite(target.dataset.inviteId, true);
        break;
      case 'invite-reject':
        if (target.dataset.inviteId) this.callbacks.onRespondInvite(target.dataset.inviteId, false);
        break;
      case 'leave':
        this.callbacks.onLeave();
        break;
      case 'disband':
        this.callbacks.onDisband();
        break;
      case 'kick':
        if (target.dataset.playerId) this.callbacks.onRemoveMember(target.dataset.playerId);
        break;
      case 'transfer':
        if (target.dataset.playerId) this.callbacks.onTransferLeader(target.dataset.playerId);
        break;
      case 'recruit-refresh':
        this.callbacks.onRequestRecruitments();
        break;
      case 'recruit-close': {
        const revision = Number(target.dataset.revision ?? this.state.view.party?.revision ?? 0);
        this.callbacks.onCloseRecruitment(revision);
        break;
      }
      case 'recruit-apply':
        if (target.dataset.listingId) this.callbacks.onApplyRecruitment(target.dataset.listingId);
        break;
      case 'application-accept':
        if (target.dataset.applicationId) this.callbacks.onRespondApplication(target.dataset.applicationId, true);
        break;
      case 'application-reject':
        if (target.dataset.applicationId) this.callbacks.onRespondApplication(target.dataset.applicationId, false);
        break;
      case 'match-join': {
        const select = this.host?.querySelector<HTMLSelectElement>('[data-party-field="match-purpose"]');
        const purpose = select?.value;
        this.callbacks.onJoinMatch(isPartyPurposeValue(purpose) ? purpose : 'general');
        break;
      }
      case 'match-leave':
        this.callbacks.onLeaveMatch();
        break;
      default:
        break;
    }
  }

  private handleSubmit(event: SubmitEvent): void {
    const form = (event.target as HTMLElement | null)?.closest<HTMLFormElement>('[data-party-form]');
    if (!form || !this.callbacks || !this.state) {
      return;
    }
    event.preventDefault();
    const kind = form.dataset.partyForm;
    if (kind === 'invite-no') {
      const input = form.querySelector<HTMLInputElement>('input[name="playerNo"]');
      const value = Number(input?.value ?? '');
      if (!Number.isInteger(value) || value <= 0) {
        return;
      }
      this.callbacks.onInviteByPlayerNo(value);
      if (input) input.value = '';
      return;
    }
    if (kind === 'recruit-publish') {
      const party = this.state.view.party;
      if (!party) return;
      const purposeValue = (form.querySelector<HTMLSelectElement>('select[name="purpose"]')?.value) ?? 'general';
      const minRealmLv = Number(form.querySelector<HTMLInputElement>('input[name="minRealmLv"]')?.value ?? 1);
      const maxRealmLv = Number(form.querySelector<HTMLInputElement>('input[name="maxRealmLv"]')?.value ?? 0);
      const note = (form.querySelector<HTMLInputElement>('input[name="note"]')?.value ?? '').trim();
      this.callbacks.onPublishRecruitment({
        expectedRevision: party.revision,
        purpose: isPartyPurposeValue(purposeValue) ? purposeValue : 'general',
        minRealmLv: Math.max(1, Math.trunc(minRealmLv) || 1),
        maxRealmLv: Math.max(1, Math.trunc(maxRealmLv) || 1),
        ...(note ? { note } : {}),
      });
    }
  }

  private handleChange(event: Event): void {
    if (!this.callbacks || !this.state) {
      return;
    }
    const target = event.target as HTMLElement | null;
    const setting = target?.closest<HTMLElement>('[data-party-setting]');
    if (setting) {
      const party = this.state.view.party;
      if (!party) return;
      const key = setting.dataset.partySetting;
      if (key === 'expMode' && setting instanceof HTMLSelectElement) {
        this.callbacks.onUpdateSettings({
          expectedRevision: party.settings.revision,
          expMode: setting.value === 'equal' ? 'equal' : 'contribution',
        });
      } else if (key === 'lootMode' && setting instanceof HTMLSelectElement) {
        this.callbacks.onUpdateSettings({
          expectedRevision: party.settings.revision,
          lootMode: setting.value === 'round_robin' ? 'round_robin' : 'killer',
        });
      } else if (key === 'friendlyFireEnabled' && setting instanceof HTMLInputElement) {
        this.callbacks.onUpdateSettings({
          expectedRevision: party.settings.revision,
          friendlyFireEnabled: setting.checked,
        });
      }
      return;
    }
    const field = target?.closest<HTMLElement>('[data-party-field]');
    if (field?.dataset.partyField === 'recruit-purpose' && field instanceof HTMLSelectElement) {
      const value = field.value;
      this.callbacks.onRequestRecruitments(isPartyPurposeValue(value) ? value : undefined);
    }
  }
}

function isPartyPurposeValue(value: string | undefined | null): value is PartyPurpose {
  return value === 'general' || value === 'leveling' || value === 'boss' || value === 'tower' || value === 'exploration';
}

function buildMemberSignature(member: NonNullable<PartyPanelView['party']>['members'][number], isLeaderView: boolean): string {
  return [
    member.playerId,
    member.role,
    member.realmLv,
    member.online ? 1 : 0,
    member.mapName ?? '',
    member.hp ?? -1,
    member.maxHp ?? -1,
    member.qi ?? -1,
    member.maxQi ?? -1,
    isLeaderView ? 1 : 0,
  ].join('|');
}
