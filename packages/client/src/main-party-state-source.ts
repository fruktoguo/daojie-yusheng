/**
 * 组队客户端状态来源：装配队伍面板、队伍 HUD 与队伍聊天，消费 S2C Party 事件。
 *
 * 所有玩家可见文案均由客户端拼接；requestId 按「角色 × 队伍」记代际，切队或重连后
 * 旧代际的历史响应会被丢弃，避免串数据。
 */
import type {
  PartyChatHistoryView,
  PartyChatMessageView,
  PartyOperationResultView,
  PartyPanelView,
  PartyPurpose,
} from '@mud/shared';
import type { SocketPartySender } from './network/socket-send-party';
import type { ToastKind } from './main-app-assembly-types';
import { PartyPanel } from './ui/panels/party-panel';
import { PartyHud } from './ui/party-hud';
import { PARTY_REASON_LABELS } from './ui/panels/party-panel-view';
import { appendPartyMessages, loadRecentPartyMessages } from './ui/party-message-storage';

type MainPartyStateSourceOptions = {
  partyPanel: PartyPanel;
  partyHud: PartyHud;
  openPartyPanel(): void;
  setPartyUnread(count: number): void;
  setPartyPanelAvailable(available: boolean): void;
  socket: Pick<
  SocketPartySender,
  | 'sendRequestPartyPanel'
  | 'sendCreateParty'
  | 'sendInvitePartyPlayer'
  | 'sendRespondPartyInvite'
  | 'sendLeaveParty'
  | 'sendRemovePartyMember'
  | 'sendTransferPartyLeader'
  | 'sendDisbandParty'
  | 'sendUpdatePartySettings'
  | 'sendPublishPartyRecruitment'
  | 'sendClosePartyRecruitment'
  | 'sendRequestPartyRecruitments'
  | 'sendApplyPartyRecruitment'
  | 'sendRespondPartyApplication'
  | 'sendJoinPartyMatch'
  | 'sendLeavePartyMatch'
  | 'sendSendPartyChat'
  | 'sendRequestPartyChatHistory'>;
  showToast(message: string, kind?: ToastKind): void;
  getPlayerId(): string | null;
};

export type MainPartyStateSource = ReturnType<typeof createMainPartyStateSource>;

const EMPTY_PANEL: PartyPanelView = {
  party: null,
  incomingInvites: [],
  incomingApplications: [],
  recruitments: [],
  matchQueue: { queued: false },
  serverTime: 0,
};

export function createMainPartyStateSource(options: MainPartyStateSourceOptions) {
  let view: PartyPanelView = { ...EMPTY_PANEL, incomingInvites: [], incomingApplications: [], recruitments: [] };
  let currentPlayerId: string | null = null;
  let currentPartyId: string | null = null;
  let chatUnreadCount = 0;
  let chatHistoryRequestId: string | null = null;
  let historySyncToken = 0;
  let recruitmentLoaded = false;
  let recruitingPurpose: PartyPurpose | undefined;
  let chatMessages: PartyChatMessageView[] = [];

  function syncRender(): void {
    options.partyPanel.render({
      view,
      playerId: currentPlayerId,
      chatUnreadCount,
      chatDraft: '',
      recruitingPurpose: recruitingPurpose ?? 'general',
      recruitmentLoaded,
    });
    options.partyHud.render(view.party, currentPlayerId, chatUnreadCount);
    options.setPartyUnread(chatUnreadCount);
  }

  function resetPartyScopedState(): void {
    chatUnreadCount = 0;
    chatMessages = [];
    chatHistoryRequestId = null;
    historySyncToken += 1;
  }

  function applyPanel(next: PartyPanelView): void {
    const nextPartyId = next.party?.partyId ?? null;
    if (nextPartyId !== currentPartyId) {
      currentPartyId = nextPartyId;
      resetPartyScopedState();
      if (nextPartyId) {
        void syncPartyChatHistory(nextPartyId);
      }
    }
    view = next;
    syncRender();
  }

  async function syncPartyChatHistory(partyId: string): Promise<void> {
    const playerId = currentPlayerId ?? options.getPlayerId();
    if (!playerId) return;
    const token = ++historySyncToken;
    const local = await loadRecentPartyMessages(playerId, partyId, 100);
    if (token !== historySyncToken || partyId !== currentPartyId) {
      return;
    }
    chatMessages = local.slice();
    options.partyHud.setChatMessages(chatMessages, playerId);
    const requestId = `party-history:${token}:${Date.now()}`;
    chatHistoryRequestId = requestId;
    const latest = local[local.length - 1];
    options.socket.sendRequestPartyChatHistory({
      requestId,
      ...(latest ? { cursor: { occurredAt: latest.sentAt, messageId: latest.messageId } } : {}),
    });
  }

  options.partyPanel.setCallbacks({
    onCreate: () => options.socket.sendCreateParty(),
    onInviteByPlayerId: (targetPlayerId) => options.socket.sendInvitePartyPlayer({ targetPlayerId }),
    onInviteByPlayerNo: (targetPlayerNo) => options.socket.sendInvitePartyPlayer({ targetPlayerNo }),
    onRespondInvite: (inviteId, accept) => options.socket.sendRespondPartyInvite(inviteId, accept),
    onLeave: () => options.socket.sendLeaveParty(),
    onRemoveMember: (targetPlayerId) => options.socket.sendRemovePartyMember(targetPlayerId),
    onTransferLeader: (targetPlayerId) => options.socket.sendTransferPartyLeader(targetPlayerId),
    onDisband: () => options.socket.sendDisbandParty(),
    onUpdateSettings: (next) => options.socket.sendUpdatePartySettings(next),
    onPublishRecruitment: (next) => options.socket.sendPublishPartyRecruitment(next),
    onCloseRecruitment: (expectedRevision) => options.socket.sendClosePartyRecruitment(expectedRevision),
    onRequestRecruitments: (purpose) => {
      recruitingPurpose = purpose;
      options.socket.sendRequestPartyRecruitments(purpose);
    },
    onApplyRecruitment: (listingId) => options.socket.sendApplyPartyRecruitment(listingId),
    onRespondApplication: (applicationId, accept) => options.socket.sendRespondPartyApplication(applicationId, accept),
    onJoinMatch: (purpose) => options.socket.sendJoinPartyMatch(purpose),
    onLeaveMatch: () => options.socket.sendLeavePartyMatch(),
    onSendChat: (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      options.socket.sendSendPartyChat(trimmed);
    },
    onOpenChat: () => {
      chatUnreadCount = 0;
      options.partyHud.openChat();
      syncRender();
    },
    onRequestRecruitmentCandidates: () => options.socket.sendRequestPartyRecruitments(recruitingPurpose),
  });

  function openPartyPanel(): void {
    chatUnreadCount = 0;
    options.openPartyPanel();
    syncRender();
  }

  options.partyHud.setCallbacks({
    onOpenParty: openPartyPanel,
    onOpenChat: () => {
      chatUnreadCount = 0;
      syncRender();
    },
    onSendChat: (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      options.socket.sendSendPartyChat(trimmed);
    },
  });

  return {
    init(): void {
      currentPlayerId = options.getPlayerId();
      options.setPartyPanelAvailable(currentPlayerId !== null);
      options.socket.sendRequestPartyPanel();
    },
    /** 队伍悬浮窗重新打开后重绘当前视图。 */
    refreshView(): void {
      syncRender();
    },
    openPanel: openPartyPanel,
    clear(): void {
      currentPlayerId = null;
      currentPartyId = null;
      options.setPartyPanelAvailable(false);
      view = { ...EMPTY_PANEL, incomingInvites: [], incomingApplications: [], recruitments: [] };
      recruitmentLoaded = false;
      resetPartyScopedState();
      syncRender();
    },
    handlePartyPanel(next: PartyPanelView): void {
      recruitmentLoaded = true;
      applyPanel(next);
    },
    handlePartyOperationResult(result: PartyOperationResultView): void {
      if (result.panel) {
        applyPanel(result.panel);
      }
      if (result.ok !== true && result.reason) {
        options.showToast(PARTY_REASON_LABELS[result.reason] ?? '操作失败，请稍后重试', 'warn');
      }
    },
    handlePartyChatMessage(message: PartyChatMessageView): void {
      const playerId = currentPlayerId ?? options.getPlayerId();
      if (!playerId || !currentPartyId || message.partyId !== currentPartyId) {
        return;
      }
      if (chatMessages.some((entry) => entry.messageId === message.messageId)) {
        return;
      }
      chatMessages = [...chatMessages, message].slice(-100);
      const incoming = message.fromPlayerId !== playerId;
      const chatVisible = options.partyHud.isChatVisible();
      if (incoming && !chatVisible) {
        chatUnreadCount += 1;
        options.showToast(`队伍消息 · ${message.fromName}：${message.text}`, 'chat');
      }
      void appendPartyMessages(playerId, currentPartyId, [message]);
      options.partyHud.setChatMessages(chatMessages, playerId);
      syncRender();
    },
    handlePartyChatHistory(history: PartyChatHistoryView): void {
      const playerId = currentPlayerId ?? options.getPlayerId();
      if (!playerId || !currentPartyId || history.partyId !== currentPartyId) {
        return;
      }
      if (!history.requestId || history.requestId !== chatHistoryRequestId) {
        return;
      }
      chatHistoryRequestId = null;
      const merged = new Map(chatMessages.map((entry) => [entry.messageId, entry]));
      for (const message of history.messages ?? []) {
        if (message.partyId === currentPartyId) {
          merged.set(message.messageId, message);
        }
      }
      chatMessages = Array.from(merged.values()).sort((a, b) => a.sentAt - b.sentAt).slice(-100);
      void appendPartyMessages(playerId, currentPartyId, history.messages ?? []);
      options.partyHud.setChatMessages(chatMessages, playerId);
      syncRender();
    },
    /** SelfDelta.pid 变化时同步展示层身份（权威状态仍以 PartyPanel 为准）。 */
    syncSelfPartyId(partyId: string | null): void {
      if (partyId && currentPartyId && partyId !== currentPartyId) {
        currentPartyId = partyId;
        resetPartyScopedState();
        options.socket.sendRequestPartyPanel();
      } else if (!partyId && currentPartyId) {
        currentPartyId = null;
        view = { ...view, party: null };
        resetPartyScopedState();
        syncRender();
      }
    },
    /** 切换角色时重置代际，避免旧角色的晚包污染。 */
    syncPlayerContext(playerId: string | null): void {
      options.setPartyPanelAvailable(playerId !== null);
      if (playerId !== currentPlayerId) {
        currentPlayerId = playerId;
        currentPartyId = null;
        view = { ...EMPTY_PANEL, incomingInvites: [], incomingApplications: [], recruitments: [] };
        recruitmentLoaded = false;
        resetPartyScopedState();
        syncRender();
      }
    },
  };
}
