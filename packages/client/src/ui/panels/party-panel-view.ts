/** 本文件是客户端 DOM UI 的队伍面板主体，仅负责展示服务端视图和提交意图。 */
import type {
  PartyExpMode,
  PartyLootMode,
  PartyMemberView,
  PartyPanelView,
  PartyPurpose,
} from '@mud/shared';
import { PARTY_MAX_MEMBERS } from '@mud/shared';

export const PARTY_PURPOSE_LABELS: Record<PartyPurpose, string> = {
  general: '不限',
  leveling: '刷怪升级',
  boss: '讨伐首领',
  tower: '挑战高塔',
  exploration: '秘境探索',
};

export const PARTY_EXP_MODE_LABELS: Record<PartyExpMode, string> = {
  contribution: '按贡献分配',
  equal: '全员平分',
};

export const PARTY_LOOT_MODE_LABELS: Record<PartyLootMode, string> = {
  killer: '击杀者拾取',
  round_robin: '轮流拾取',
};

export const PARTY_REASON_LABELS: Record<string, string> = {
  party_not_found: '队伍不存在或已解散',
  already_in_party: '你已在队伍中',
  not_in_party: '你当前不在队伍中',
  not_leader: '只有队长可以执行此操作',
  leader_offline: '队长离线期间无法执行管理操作，请等待队长归来',
  party_full: `队伍已满，最多 ${PARTY_MAX_MEMBERS} 人`,
  target_not_nearby: '目标不在附近',
  target_already_in_party: '对方已加入其他队伍',
  invite_not_found: '邀请已失效',
  invite_expired: '邀请已过期',
  invite_already_sent: '已向对方发出邀请',
  invite_blocked: '对方暂不愿被打扰',
  revision_mismatch: '队伍状态已变化，请刷新后重试',
  invalid_settings: '设置无效',
  invalid_purpose: '招募目的无效',
  invalid_realm_range: '境界范围无效',
  invalid_note: '招募说明超长或无效',
  recruitment_not_found: '招募信息不存在或已关闭',
  recruitment_already_open: '已有进行中的招募',
  application_not_found: '申请不存在或已处理',
  application_expired: '申请已过期',
  already_applied: '已向该队伍提交申请',
  match_not_available: '自动匹配暂不可用',
  not_in_match_queue: '你当前不在匹配队列中',
  invalid_message: '消息为空或过长',
  message_channel_busy: '队伍消息较多，请稍后再试',
  party_persistence_disabled: '组队系统暂不可用',
};

export type PartyStateSourceCallbacks = {
  onCreate(): void;
  onInviteByPlayerId(targetPlayerId: string): void;
  onInviteByPlayerNo(targetPlayerNo: number): void;
  onRespondInvite(inviteId: string, accept: boolean): void;
  onLeave(): void;
  onRemoveMember(targetPlayerId: string): void;
  onTransferLeader(targetPlayerId: string): void;
  onDisband(): void;
  onUpdateSettings(next: { expectedRevision: number; expMode?: PartyExpMode; lootMode?: PartyLootMode; friendlyFireEnabled?: boolean }): void;
  onPublishRecruitment(next: { expectedRevision: number; purpose: PartyPurpose; minRealmLv: number; maxRealmLv: number; note?: string }): void;
  onCloseRecruitment(expectedRevision: number): void;
  onRequestRecruitments(purpose?: PartyPurpose): void;
  onApplyRecruitment(listingId: string): void;
  onRespondApplication(applicationId: string, accept: boolean): void;
  onJoinMatch(purpose: PartyPurpose): void;
  onLeaveMatch(): void;
  onSendChat(text: string): void;
  onOpenChat(): void;
  onRequestRecruitmentCandidates(): void;
};

export type PartyPanelRenderState = {
  view: PartyPanelView;
  playerId: string | null;
  chatUnreadCount: number;
  chatDraft: string;
  recruitingPurpose: PartyPurpose;
  recruitmentLoaded: boolean;
};

function isPartyPurpose(value: string | undefined): value is PartyPurpose {
  return value === 'general' || value === 'leveling' || value === 'boss' || value === 'tower' || value === 'exploration';
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatRealm(realmLv: number): string {
  const lv = Math.max(0, Math.trunc(Number(realmLv) || 0));
  return lv > 0 ? `境界 ${lv} 层` : '境界未知';
}

function formatRatio(current: number | undefined, max: number | undefined): { text: string; percent: number } | null {
  if (typeof current !== 'number' || typeof max !== 'number' || max <= 0) {
    return null;
  }
  return { text: `${Math.max(0, Math.trunc(current))}/${Math.max(1, Math.trunc(max))}`, percent: Math.min(100, Math.max(0, (current / max) * 100)) };
}

export function renderPartyMemberCard(member: PartyMemberView, playerId: string | null, isLeaderView: boolean): string {
  const hp = formatRatio(member.hp, member.maxHp);
  const qi = formatRatio(member.qi, member.maxQi);
  const isSelf = member.playerId === playerId;
  const isLeader = member.role === 'leader';
  return `
    <div class="party-member-card ${member.online ? '' : 'offline'}" data-party-member="${escapeHtml(member.playerId)}">
      <div class="party-member-main">
        <div class="party-member-name">
          <span class="party-member-name-text">${escapeHtml(member.name)}</span>
          ${isLeader ? '<span class="party-member-badge leader">队长</span>' : ''}
          ${isSelf ? '<span class="party-member-badge self">我</span>' : ''}
          ${member.online
            ? '<span class="party-member-status online">在线</span>'
            : '<span class="party-member-status offline">离线</span>'}
        </div>
        <div class="party-member-meta">${escapeHtml(formatRealm(member.realmLv))}${member.mapName ? ` · ${escapeHtml(member.mapName)}` : ''}</div>
        ${hp ? `<div class="party-member-bar hp" data-party-member-hp="true"><span style="width:${hp.percent.toFixed(1)}%"></span><em>${hp.text}</em></div>` : ''}
        ${qi ? `<div class="party-member-bar qi" data-party-member-qi="true"><span style="width:${qi.percent.toFixed(1)}%"></span><em>${qi.text}</em></div>` : ''}
      </div>
      ${isLeaderView && !isSelf && !isLeader ? `
        <div class="party-member-actions">
          <button class="small-btn ghost" type="button" data-party-action="transfer" data-player-id="${escapeHtml(member.playerId)}">移交队长</button>
          <button class="small-btn ghost danger" type="button" data-party-action="kick" data-player-id="${escapeHtml(member.playerId)}">移出队伍</button>
        </div>
      ` : ''}
    </div>
  `;
}
