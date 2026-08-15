/**
 * 队伍 HUD：主界面紧凑队伍状态与统一聊天面板快捷入口。
 * 成员行按 playerId 局部 patch，队伍消息统一由中下方「日志与聊天」展示。
 */
import type { PartyView } from '@mud/shared';

export type PartyHudCallbacks = {
  onOpenParty(opener: HTMLElement): void;
  onOpenChat(opener: HTMLElement): void;
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
  private unreadCount = 0;

  constructor(host?: HTMLElement | null) {
    this.root = host ?? document.createElement('aside');
    this.root.classList.add('party-hud');
    this.root.setAttribute('aria-label', '队伍状态');
    this.root.hidden = true;
    if (!host) {
      document.body.appendChild(this.root);
    }
    this.root.addEventListener('click', (event) => this.handleClick(event));
  }

  setCallbacks(callbacks: PartyHudCallbacks): void {
    this.callbacks = callbacks;
  }

  render(party: PartyView | null, _playerId: string | null, unreadCount: number): void {
    this.party = party;
    this.unreadCount = Math.max(0, Math.trunc(unreadCount));
    if (!party) {
      this.root.hidden = true;
      this.root.replaceChildren();
      return;
    }
    this.root.hidden = false;
    this.renderFrame();
    this.patchMembers();
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
          <button class="party-hud-chat-toggle" type="button" data-party-hud-action="toggle-chat" aria-label="在日志与聊天中打开队伍频道">
            <span aria-hidden="true">言</span>
            <span class="party-hud-unread" data-party-hud-unread="true" ${this.unreadCount > 0 ? '' : 'hidden'}>${this.unreadCount > 99 ? '99+' : this.unreadCount}</span>
          </button>
        </div>
        <div class="party-hud-members" data-party-hud-members="true"></div>
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

  private handleClick(event: MouseEvent): void {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-party-hud-action]');
    if (!target || !this.callbacks) return;
    const action = target.dataset.partyHudAction;
    if (action === 'open-panel') {
      this.callbacks.onOpenParty(target);
      return;
    }
    if (action === 'toggle-chat') {
      this.callbacks.onOpenChat(target);
    }
  }
}
