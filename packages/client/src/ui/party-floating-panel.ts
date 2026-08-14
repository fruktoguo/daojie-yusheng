/** 紧凑队伍悬浮窗：复用行动队列/交互列表的拖拽、折叠、关闭与本地偏好。 */
import type { PartyChatMessageView, PartyView } from '@mud/shared';
import { FloatingListPanel } from './floating-list-panel';
import {
  FLOATING_PANEL_PREFERENCES_CHANGED_EVENT,
  isFloatingPanelEnabled,
  updateFloatingPanelPreference,
} from './floating-panel-preferences';
import { PartyHud, type PartyHudCallbacks } from './party-hud';

const PARTY_HUD_STORAGE_KEY = 'mud:floating-party-hud:v1';

export class PartyFloatingPanel {
  readonly root: HTMLElement;

  private readonly floatingPanel: FloatingListPanel;
  private readonly hud: PartyHud;
  private party: PartyView | null = null;
  private readonly handlePreferenceChange = () => this.refreshVisibility();

  constructor() {
    this.floatingPanel = new FloatingListPanel({
      id: 'floating-party-hud',
      title: '队伍状态',
      storageKey: PARTY_HUD_STORAGE_KEY,
      className: 'floating-list-panel--party-hud',
      defaultLeft: 12,
      defaultTop: 128,
      minWidth: 220,
      maxWidth: 320,
      onClose: () => updateFloatingPanelPreference('party', false),
    });
    this.root = this.floatingPanel.root;
    this.hud = new PartyHud(this.floatingPanel.body);
    window.addEventListener(FLOATING_PANEL_PREFERENCES_CHANGED_EVENT, this.handlePreferenceChange);
    this.refreshVisibility();
  }

  setCallbacks(callbacks: PartyHudCallbacks): void {
    this.hud.setCallbacks(callbacks);
  }

  isChatVisible(): boolean {
    return !this.root.hidden && this.hud.isChatVisible();
  }

  openChat(): void {
    if (!this.party) return;
    if (!isFloatingPanelEnabled('party')) updateFloatingPanelPreference('party', true);
    this.refreshVisibility();
    this.floatingPanel.setClosed(false);
    this.hud.openChat();
  }

  setChatMessages(messages: readonly PartyChatMessageView[], playerId: string | null): void {
    this.hud.setChatMessages(messages, playerId);
  }

  render(party: PartyView | null, playerId: string | null, unreadCount: number): void {
    this.party = party;
    this.hud.render(party, playerId, unreadCount);
    const count = party?.members.length ?? 0;
    const unread = Math.max(0, Math.trunc(unreadCount));
    this.floatingPanel.setTitle(unread > 0
      ? `队伍 ${count}/5 · ${unread > 99 ? '99+' : unread} 条未读`
      : `队伍 ${count}/5`);
    this.refreshVisibility();
  }

  destroy(): void {
    window.removeEventListener(FLOATING_PANEL_PREFERENCES_CHANGED_EVENT, this.handlePreferenceChange);
    this.floatingPanel.destroy();
  }

  private refreshVisibility(): void {
    const visible = this.party !== null && isFloatingPanelEnabled('party');
    this.floatingPanel.setTransientHidden(!visible);
    if (visible) this.floatingPanel.setClosed(false);
  }
}
