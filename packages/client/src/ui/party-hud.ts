/**
 * 队伍 HUD：主界面紧凑队伍条 + 队伍聊天迷你窗口。
 * 仅在数据变化时重绘，成员行 keyed 局部 patch，不影响聊天输入与滚动。
 */
import type { PartyChatMessageView, PartyView } from '@mud/shared';

export type PartyHudCallbacks = {
  onOpenParty(): void;
  onOpenChat(): void;
  onSendChat(text: string): void;
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function memberSignature(member: PartyView['members'][number]): string {
  return [
    member.playerId,
    member.role,
    member.online ? 1 : 0,
    member.hp ?? -1,
    member.maxHp ?? -1,
    member.qi ?? -1,
    member.maxQi ?? -1,
  ].join('|');
}

export class PartyHud {
  private readonly root: HTMLElement;
  private callbacks: PartyHudCallbacks | null = null;
  private party: PartyView | null = null;
  private playerId: string | null = null;
  private unreadCount = 0;
  private messages: PartyChatMessageView[] = [];
  private chatOpen = false;

  constructor(host?: HTMLElement | null) {
    this.root = host ?? document.createElement('aside');
    this.root.classList.add('party-hud');
    this.root.setAttribute('aria-label', '队伍状态');
    this.root.hidden = true;
    if (!host) {
      document.body.appendChild(this.root);
    }
    this.root.addEventListener('click', (event) => this.handleClick(event));
    this.root.addEventListener('submit', (event) => this.handleSubmit(event));
  }

  setCallbacks(callbacks: PartyHudCallbacks): void {
    this.callbacks = callbacks;
  }

  isChatVisible(): boolean {
    return this.chatOpen && !this.root.hidden;
  }

  openChat(): void {
    if (!this.party) {
      return;
    }
    this.chatOpen = true;
    const chat = this.root.querySelector<HTMLElement>('[data-party-hud-chat="true"]');
    if (chat) {
      chat.hidden = false;
    }
    this.renderChatMessages();
  }

  setChatMessages(messages: readonly PartyChatMessageView[], playerId: string | null): void {
    this.messages = messages.slice(-100);
    this.playerId = playerId;
    if (this.chatOpen) {
      this.renderChatMessages();
    }
  }

  render(party: PartyView | null, playerId: string | null, unreadCount: number): void {
    this.party = party;
    this.playerId = playerId;
    this.unreadCount = Math.max(0, Math.trunc(unreadCount));
    if (!party) {
      this.root.hidden = true;
      this.root.replaceChildren();
      this.chatOpen = false;
      return;
    }
    this.root.hidden = false;
    this.renderFrame();
    this.patchMembers();
    if (this.chatOpen) {
      this.renderChatMessages();
    }
  }

  private renderFrame(): void {
    if (this.root.querySelector('[data-party-hud-frame="true"]')) {
      const toggle = this.root.querySelector<HTMLElement>('[data-party-hud-action="toggle-chat"]');
      if (toggle) {
        toggle.dataset.unread = String(this.unreadCount);
        const badge = toggle.querySelector<HTMLElement>('[data-party-hud-unread="true"]');
        if (badge) {
          badge.hidden = this.unreadCount <= 0;
          badge.textContent = this.unreadCount > 99 ? '99+' : String(this.unreadCount);
        }
      }
      return;
    }
    this.root.innerHTML = `
      <div class="party-hud-frame" data-party-hud-frame="true">
        <div class="party-hud-head">
          <button class="party-hud-title" type="button" data-party-hud-action="open-panel" aria-label="打开队伍面板">
            队伍 <span data-party-hud-count="true">${this.party?.members.length ?? 0}</span>
          </button>
          <button class="party-hud-chat-toggle" type="button" data-party-hud-action="toggle-chat" aria-label="队伍聊天">
            <span aria-hidden="true">言</span>
            <span class="party-hud-unread" data-party-hud-unread="true" ${this.unreadCount > 0 ? '' : 'hidden'}>${this.unreadCount > 99 ? '99+' : this.unreadCount}</span>
          </button>
        </div>
        <div class="party-hud-members" data-party-hud-members="true"></div>
        <div class="party-hud-chat" data-party-hud-chat="true" ${this.chatOpen ? '' : 'hidden'}>
          <div class="party-hud-chat-messages" data-party-hud-chat-messages="true"></div>
          <form class="party-hud-chat-form" data-party-hud-form="chat">
            <input class="party-input" type="text" name="text" maxlength="200" placeholder="发送队伍消息" aria-label="队伍消息输入" autocomplete="off" />
            <button class="small-btn" type="submit">发送</button>
          </form>
        </div>
      </div>
    `;
  }

  private patchMembers(): void {
    const list = this.root.querySelector<HTMLElement>('[data-party-hud-members="true"]');
    if (!list || !this.party) return;
    const countNode = this.root.querySelector<HTMLElement>('[data-party-hud-count="true"]');
    if (countNode && countNode.textContent !== String(this.party.members.length)) {
      countNode.textContent = String(this.party.members.length);
    }
    const next = new Map(this.party.members.map((member) => [member.playerId, member]));
    for (const row of Array.from(list.querySelectorAll<HTMLElement>('[data-party-hud-member]'))) {
      const memberId = row.dataset.partyHudMember ?? '';
      if (!next.has(memberId)) {
        row.remove();
      }
    }
    for (const member of this.party.members) {
      const signature = memberSignature(member);
      const current = list.querySelector<HTMLElement>(`[data-party-hud-member="${CSS.escape(member.playerId)}"]`);
      if (!current) {
        list.insertAdjacentHTML('beforeend', this.renderMemberRow(member));
        const inserted = list.querySelector<HTMLElement>(`[data-party-hud-member="${CSS.escape(member.playerId)}"]`);
        if (inserted) inserted.dataset.partyHudSignature = signature;
        continue;
      }
      if (current.dataset.partyHudSignature !== signature) {
        const template = document.createElement('template');
        template.innerHTML = this.renderMemberRow(member).trim();
        const nextNode = template.content.firstElementChild;
        if (nextNode instanceof HTMLElement) {
          nextNode.dataset.partyHudSignature = signature;
          current.replaceWith(nextNode);
        }
      }
    }
  }

  private renderMemberRow(member: PartyView['members'][number]): string {
    const hpPercent = typeof member.hp === 'number' && typeof member.maxHp === 'number' && member.maxHp > 0
      ? Math.min(100, Math.max(0, (member.hp / member.maxHp) * 100))
      : null;
    return `
      <div class="party-hud-member ${member.online ? '' : 'offline'}" data-party-hud-member="${escapeHtml(member.playerId)}">
        <span class="party-hud-member-name">${member.role === 'leader' ? '<i aria-label="队长">★</i>' : ''}${escapeHtml(member.name)}</span>
        ${hpPercent !== null ? `<span class="party-hud-member-hp"><span style="width:${hpPercent.toFixed(1)}%"></span></span>` : ''}
      </div>
    `;
  }

  private renderChatMessages(): void {
    const host = this.root.querySelector<HTMLElement>('[data-party-hud-chat-messages="true"]');
    if (!host) return;
    const stickToBottom = host.scrollHeight - host.scrollTop - host.clientHeight < 24;
    host.innerHTML = this.messages.map((message) => {
      const mine = message.fromPlayerId === this.playerId;
      return `
        <div class="party-hud-chat-message ${mine ? 'mine' : ''}">
          <span class="party-hud-chat-from">${mine ? '我' : escapeHtml(message.fromName)}</span>
          <span class="party-hud-chat-text">${escapeHtml(message.text)}</span>
        </div>
      `;
    }).join('') || '<div class="empty-hint compact">还没有队伍消息</div>';
    if (stickToBottom) {
      host.scrollTop = host.scrollHeight;
    }
  }

  private handleClick(event: MouseEvent): void {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-party-hud-action]');
    if (!target || !this.callbacks) return;
    const action = target.dataset.partyHudAction;
    if (action === 'open-panel') {
      this.unreadCount = 0;
      this.callbacks.onOpenParty();
      return;
    }
    if (action === 'toggle-chat') {
      this.chatOpen = !this.chatOpen;
      const chat = this.root.querySelector<HTMLElement>('[data-party-hud-chat="true"]');
      if (chat) chat.hidden = !this.chatOpen;
      if (this.chatOpen) {
        this.unreadCount = 0;
        this.callbacks.onOpenChat();
        this.renderChatMessages();
      }
    }
  }

  private handleSubmit(event: SubmitEvent): void {
    const form = (event.target as HTMLElement | null)?.closest<HTMLFormElement>('[data-party-hud-form="chat"]');
    if (!form || !this.callbacks) return;
    event.preventDefault();
    const input = form.querySelector<HTMLInputElement>('input[name="text"]');
    const text = (input?.value ?? '').trim();
    if (!text) return;
    this.callbacks.onSendChat(text);
    if (input) input.value = '';
  }
}
