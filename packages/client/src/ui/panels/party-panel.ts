/** 队伍悬浮窗内容：成员、管理、招募与匹配。只提交意图，不直接访问 socket。 */
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
type PartyPanelTab = 'members' | 'invites' | 'management';
type PartyFormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type PartyEditorSnapshot = {
  drafts: Array<{ key: string; value: string; checked: boolean | null }>;
  activeKey: string | null;
  selectionStart: number | null;
  selectionEnd: number | null;
  selectionDirection: 'forward' | 'backward' | 'none' | null;
};

export class PartyPanel {
  private host: HTMLElement | null = null;
  private callbacks: PartyStateSourceCallbacks | null = null;
  private state: PartyPanelRenderState | null = null;
  private activeTab: PartyPanelTab = 'members';

  mount(host: HTMLElement): void {
    this.host = host;
    this.host.addEventListener('click', (event) => this.handleClick(event));
    this.host.addEventListener('submit', (event) => this.handleSubmit(event));
    this.host.addEventListener('change', (event) => this.handleChange(event));
    this.host.addEventListener('keydown', (event) => this.handleKeyDown(event));
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
      this.patchChatUnread(state.chatUnreadCount);
      return;
    }
    const editorSnapshot = this.captureEditorState();
    this.host.innerHTML = this.renderAll(state);
    this.restoreEditorState(editorSnapshot);
  }

  /** 面板结构未变化时只更新成员状态与未读数，避免重建正在编辑的表单。 */
  private canPatchOnly(previous: PartyPanelRenderState | null, next: PartyPanelRenderState): boolean {
    if (!previous || !this.host) return false;
    if (previous.playerId !== next.playerId) return false;
    if (previous.recruitingPurpose !== next.recruitingPurpose) return false;
    if (previous.recruitmentLoaded !== next.recruitmentLoaded) return false;
    if (!hasSamePartyPanelStructure(previous.view, next.view)) return false;
    return this.activeTab === 'invites' || Boolean(this.host.querySelector('[data-party-member-list="true"]'));
  }

  patchMembers(state: PartyPanelRenderState): void {
    if (!this.host) return;
    this.state = state;
    const list = this.host.querySelector<HTMLElement>('[data-party-member-list="true"]');
    if (!list) return;
    const playerId = state.playerId;
    const view = state.view;
    const isLeaderView = Boolean(
      view.party
      && view.party.leaderPlayerId === playerId
      && this.activeTab === 'management',
    );
    const next = new Map(view.party?.members.map((member) => [member.playerId, member]) ?? []);
    for (const existing of Array.from(list.querySelectorAll<HTMLElement>('[data-party-member]'))) {
      const memberId = existing.dataset.partyMember ?? '';
      if (!next.has(memberId)) {
        existing.remove();
      }
    }
    for (const member of view.party?.members ?? []) {
      const html = renderPartyMemberCard(member, playerId, isLeaderView);
      const signature = buildMemberSignature(member, isLeaderView);
      const current = list.querySelector<HTMLElement>(`[data-party-member="${CSS.escape(member.playerId)}"]`);
      if (!current) {
        list.insertAdjacentHTML('beforeend', html);
        const inserted = list.querySelector<HTMLElement>(`[data-party-member="${CSS.escape(member.playerId)}"]`);
        if (inserted) inserted.dataset.partyMemberSignature = signature;
        continue;
      }
      if (current.dataset.partyMemberSignature !== signature) {
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

  private patchChatUnread(count: number): void {
    const unread = Math.max(0, Math.trunc(count));
    const badge = this.host?.querySelector<HTMLElement>('[data-party-chat-unread="true"]');
    if (!badge) return;
    badge.hidden = unread <= 0;
    badge.textContent = unread > 0 ? `（${unread} 条未读）` : '';
  }

  private captureEditorState(): PartyEditorSnapshot | null {
    if (!this.host) return null;
    const active = document.activeElement;
    const drafts: PartyEditorSnapshot['drafts'] = [];
    let activeKey: string | null = null;
    let selectionStart: number | null = null;
    let selectionEnd: number | null = null;
    let selectionDirection: PartyEditorSnapshot['selectionDirection'] = null;
    for (const control of this.host.querySelectorAll<PartyFormControl>('input, select, textarea')) {
      const key = buildPartyControlKey(control);
      if (!key) continue;
      if (control.closest('[data-party-form]')) {
        drafts.push({
          key,
          value: control.value,
          checked: control instanceof HTMLInputElement ? control.checked : null,
        });
      }
      if (active !== control) continue;
      activeKey = key;
      if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
        selectionStart = control.selectionStart;
        selectionEnd = control.selectionEnd;
        selectionDirection = control.selectionDirection;
      }
    }
    return { drafts, activeKey, selectionStart, selectionEnd, selectionDirection };
  }

  private restoreEditorState(snapshot: PartyEditorSnapshot | null): void {
    if (!this.host || !snapshot) return;
    const controls = Array.from(this.host.querySelectorAll<PartyFormControl>('input, select, textarea'));
    for (const draft of snapshot.drafts) {
      const control = controls.find((entry) => buildPartyControlKey(entry) === draft.key);
      if (!control) continue;
      control.value = draft.value;
      if (draft.checked !== null && control instanceof HTMLInputElement) {
        control.checked = draft.checked;
      }
    }
    const active = snapshot.activeKey
      ? controls.find((entry) => buildPartyControlKey(entry) === snapshot.activeKey)
      : null;
    if (!active) return;
    active.focus({ preventScroll: true });
    if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) return;
    if (snapshot.selectionStart === null || snapshot.selectionEnd === null) return;
    try {
      active.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd, snapshot.selectionDirection ?? 'none');
    } catch {
      // number/select 等控件不支持选区，恢复焦点即可。
    }
  }

  setRecruitingPurpose(purpose: PartyPurpose): void {
    if (!this.state) return;
    this.state = { ...this.state, recruitingPurpose: purpose };
  }

  private renderAll(state: PartyPanelRenderState): string {
    const isLeader = Boolean(state.view.party && state.view.party.leaderPlayerId === state.playerId);
    if (!isLeader && this.activeTab === 'management') {
      this.activeTab = 'members';
    }
    const content = this.activeTab === 'management' && isLeader
      ? this.renderManagementTab(state)
      : this.activeTab === 'invites'
        ? this.renderInvitationsTab(state)
        : this.renderMembersTab(state);
    return `
      <div class="party-panel" data-party-root="true">
        ${this.renderTabs(isLeader)}
        <div
          class="party-tab-content"
          role="tabpanel"
          id="party-panel-active-content"
          aria-labelledby="party-panel-tab-${this.activeTab}"
          data-party-tab-content="${this.activeTab}"
        >
          ${content}
        </div>
      </div>
    `;
  }

  private renderTabs(isLeader: boolean): string {
    return `
      <div class="party-tabs" role="tablist" aria-label="队伍功能">
        ${this.renderTabButton('members', '成员')}
        ${this.renderTabButton('invites', '邀请', this.getInvitationReminderCount())}
        ${isLeader ? this.renderTabButton('management', '管理') : ''}
      </div>
    `;
  }

  private renderTabButton(tab: PartyPanelTab, label: string, reminderCount = 0): string {
    const active = tab === this.activeTab;
    const reminder = Math.max(0, Math.trunc(reminderCount));
    return `
      <button
        class="party-tab ${active ? 'active' : ''}"
        type="button"
        role="tab"
        id="party-panel-tab-${tab}"
        data-party-action="tab"
        data-party-tab="${tab}"
        aria-selected="${active ? 'true' : 'false'}"
        aria-controls="party-panel-active-content"
        tabindex="${active ? '0' : '-1'}"
      >${label}${reminder > 0 ? `<span class="party-tab-badge" aria-label="${reminder} 项待处理">${reminder > 99 ? '99+' : reminder}</span>` : ''}</button>
    `;
  }

  private renderMembersTab(state: PartyPanelRenderState): string {
    return state.view.party
      ? this.renderPartySection(state, false)
      : this.renderNoPartySection();
  }

  private renderInvitationsTab(state: PartyPanelRenderState): string {
    const party = state.view.party;
    const isLeader = Boolean(party && party.leaderPlayerId === state.playerId);
    return `
      ${this.renderInvites(state.view)}
      ${!party || isLeader ? this.renderMatchSection(state) : ''}
      ${isLeader ? this.renderInviteByPlayerNo() : party ? '<div class="party-hint">仅队长可以直接邀请玩家、发布招募、审批入队申请或为现有队伍发起匹配。</div>' : ''}
      ${isLeader ? this.renderRecruitmentManagement(state) : ''}
      ${this.renderRecruitmentHall(state)}
    `;
  }

  private renderManagementTab(state: PartyPanelRenderState): string {
    if (!state.view.party || state.view.party.leaderPlayerId !== state.playerId) {
      return '';
    }
    return this.renderPartySection(state, true);
  }

  private getInvitationReminderCount(): number {
    if (!this.state) return 0;
    const isLeader = this.state.view.party?.leaderPlayerId === this.state.playerId;
    return this.state.view.incomingInvites.length + (isLeader ? this.state.view.incomingApplications.length : 0);
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

  private renderNoPartySection(): string {
    return `
      <section class="party-section">
        <div class="social-panel-section-head"><div class="social-panel-section-title">我的队伍</div></div>
        <div class="empty-hint compact">你还没有队伍。可以先创建队伍，或前往「邀请」页接受邀请、查看招募与自动匹配。</div>
        <div class="party-actions-row">
          <button class="small-btn" type="button" data-party-action="create">创建队伍</button>
        </div>
      </section>
    `;
  }

  private renderMatchSection(state: PartyPanelRenderState): string {
    const queued = state.view.matchQueue.queued === true;
    return `
      <section class="party-section">
        <div class="social-panel-section-head"><div class="social-panel-section-title">自动匹配</div></div>
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

  private renderInviteByPlayerNo(): string {
    return `
      <section class="party-section">
        <div class="social-panel-section-head"><div class="social-panel-section-title">直接邀请</div></div>
        <form class="party-inline-form" data-party-form="invite-no">
          <input class="party-input" type="number" min="1" step="1" name="playerNo" inputmode="numeric" placeholder="输入玩家序号邀请" aria-label="按玩家序号邀请" />
          <button class="small-btn ghost" type="submit">邀请</button>
        </form>
      </section>
    `;
  }

  private renderPartySection(state: PartyPanelRenderState, management: boolean): string {
    const party = state.view.party!;
    const playerId = state.playerId;
    const isLeader = party.leaderPlayerId === playerId;
    const leader = party.members.find((member) => member.playerId === party.leaderPlayerId);
    const leaderOffline = leader ? !leader.online : false;
    const sectionTitle = management ? '成员管理' : '我的队伍';
    return `
      <section class="party-section">
        <div class="social-panel-section-head">
          <div class="social-panel-section-title">${sectionTitle}</div>
          <div class="social-panel-section-meta"><span class="social-panel-count">${party.members.length}/${PARTY_MAX_MEMBERS}</span></div>
        </div>
        <div class="party-member-list" data-party-member-list="true">
          ${party.members.map((member) => this.decorateMemberCard(
            renderPartyMemberCard(member, playerId, management && isLeader),
            member,
            management && isLeader,
          )).join('')}
        </div>
        ${management ? this.renderLeaderTools(party) : `
          <div class="party-actions-row">
            <button class="small-btn" type="button" data-party-action="open-chat">
              打开队伍频道<span data-party-chat-unread="true" ${state.chatUnreadCount > 0 ? '' : 'hidden'}>${state.chatUnreadCount > 0 ? `（${state.chatUnreadCount} 条未读）` : ''}</span>
            </button>
          </div>
          ${!isLeader ? `
            <div class="party-actions-row">
              <button class="small-btn ghost danger" type="button" data-party-action="leave">退出队伍</button>
            </div>
            ${leaderOffline ? '<div class="party-hint">队长离线期间无法执行移交、解散等管理操作，请等待队长归来。</div>' : ''}
          ` : ''}
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
        <div class="party-actions-row">
          <button class="small-btn ghost danger" type="button" data-party-action="leave">退出队伍</button>
          <button class="small-btn ghost danger" type="button" data-party-action="disband">解散队伍</button>
        </div>
      </div>
    `;
  }

  private renderRecruitmentManagement(state: PartyPanelRenderState): string {
    const party = state.view.party;
    if (!party || party.leaderPlayerId !== state.playerId) return '';
    const applications = state.view.incomingApplications;
    return `
      <section class="party-section">
        <div class="social-panel-section-head">
          <div class="social-panel-section-title">招募与入队审批</div>
        </div>
        ${this.renderRecruitmentPublisher(party, party.recruitment ?? null)}
        ${applications.length > 0 ? `
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
        ` : '<div class="empty-hint compact">暂无待审批的入队申请</div>'}
      </section>
    `;
  }

  private renderRecruitmentHall(state: PartyPanelRenderState): string {
    return `
      <section class="party-section">
        <div class="social-panel-section-head">
          <div class="social-panel-section-title">招募大厅</div>
          <div class="social-panel-section-meta">
            <button class="small-btn ghost" type="button" data-party-action="recruit-refresh">刷新</button>
          </div>
        </div>
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
      case 'tab': {
        const tab = target.dataset.partyTab;
        if (tab === 'members' || tab === 'invites' || (tab === 'management' && this.state.view.party?.leaderPlayerId === this.state.playerId)) {
          this.activeTab = tab;
          if (this.host) {
            this.host.innerHTML = this.renderAll(this.state);
          }
        }
        break;
      }
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

  private handleKeyDown(event: KeyboardEvent): void {
    const target = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-party-tab]');
    if (!target || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return;
    }
    const tabs = Array.from(this.host?.querySelectorAll<HTMLButtonElement>('[data-party-tab]') ?? []);
    const currentIndex = tabs.indexOf(target);
    if (currentIndex < 0 || tabs.length === 0) {
      return;
    }
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault();
    tabs[nextIndex]?.click();
    this.host?.querySelector<HTMLButtonElement>(`[data-party-tab="${this.activeTab}"]`)?.focus();
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

function buildPartyControlKey(control: PartyFormControl): string | null {
  const form = control.closest<HTMLElement>('[data-party-form]')?.dataset.partyForm ?? '';
  const name = control.getAttribute('name') ?? '';
  const setting = control.dataset.partySetting ?? '';
  const field = control.dataset.partyField ?? '';
  if (!form && !name && !setting && !field) return null;
  return [form, name, setting, field, control.tagName, control instanceof HTMLInputElement ? control.type : ''].join(':');
}

function hasSamePartyPanelStructure(previous: PartyPanelView, next: PartyPanelView): boolean {
  return hasSamePartyStructure(previous.party, next.party)
    && hasSameArray(previous.incomingInvites, next.incomingInvites, (left, right) => (
      left.inviteId === right.inviteId
      && left.partyId === right.partyId
      && left.partyLabel === right.partyLabel
      && left.fromPlayerId === right.fromPlayerId
      && left.fromName === right.fromName
      && left.memberCount === right.memberCount
      && left.expiresAt === right.expiresAt
    ))
    && hasSameArray(previous.incomingApplications, next.incomingApplications, (left, right) => (
      left.applicationId === right.applicationId
      && left.partyId === right.partyId
      && left.playerId === right.playerId
      && left.playerNo === right.playerNo
      && left.playerName === right.playerName
      && left.realmLv === right.realmLv
      && left.createdAt === right.createdAt
      && left.expiresAt === right.expiresAt
    ))
    && hasSameArray(previous.recruitments, next.recruitments, hasSameRecruitment)
    && previous.matchQueue.queued === next.matchQueue.queued
    && previous.matchQueue.purpose === next.matchQueue.purpose
    && previous.matchQueue.joinedAt === next.matchQueue.joinedAt
    && previous.matchQueue.initialRealmTolerance === next.matchQueue.initialRealmTolerance
    && previous.matchQueue.currentRealmTolerance === next.matchQueue.currentRealmTolerance;
}

function hasSamePartyStructure(previous: PartyPanelView['party'], next: PartyPanelView['party']): boolean {
  if (previous === next) return true;
  if (!previous || !next) return false;
  return previous.partyId === next.partyId
    && previous.leaderPlayerId === next.leaderPlayerId
    && previous.revision === next.revision
    && previous.settings.revision === next.settings.revision
    && previous.settings.expMode === next.settings.expMode
    && previous.settings.lootMode === next.settings.lootMode
    && previous.settings.friendlyFireEnabled === next.settings.friendlyFireEnabled
    && hasSameRecruitment(previous.recruitment ?? null, next.recruitment ?? null)
    && hasSameArray(previous.members, next.members, (left, right) => (
      left.playerId === right.playerId && left.role === right.role
    ));
}

function hasSameRecruitment(
  previous: PartyPanelView['recruitments'][number] | null,
  next: PartyPanelView['recruitments'][number] | null,
 ): boolean {
  if (previous === next) return true;
  if (!previous || !next) return false;
  return previous.listingId === next.listingId
    && previous.partyId === next.partyId
    && previous.leaderPlayerId === next.leaderPlayerId
    && previous.leaderName === next.leaderName
    && previous.purpose === next.purpose
    && previous.minRealmLv === next.minRealmLv
    && previous.maxRealmLv === next.maxRealmLv
    && previous.note === next.note
    && previous.memberCount === next.memberCount
    && previous.maxMembers === next.maxMembers
    && previous.createdAt === next.createdAt
    && previous.expiresAt === next.expiresAt;
}

function hasSameArray<T>(previous: readonly T[], next: readonly T[], equals: (left: T, right: T) => boolean): boolean {
  return previous.length === next.length && previous.every((entry, index) => equals(entry, next[index]!));
}

function buildMemberSignature(member: NonNullable<PartyPanelView['party']>['members'][number], isLeaderView: boolean): string {
  return [
    member.playerId,
    member.playerNo ?? '',
    member.name,
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
