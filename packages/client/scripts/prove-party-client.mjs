/**
 * 组队客户端 proof：验证队伍 Tab、状态隔离、late response 丢弃、成员 keyed patch、
 * 手机端基本结构与友伤双门槛说明文案。
 */
import assert from 'node:assert/strict';
import { delay, withClientBrowserProof } from './browser-proof-runtime.mjs';

const MARKER = 'REPAIR_PROOF:PARTY-CLIENT:PASS';
const MOBILE_VIEWPORT = { width: 390, height: 844 };

const fixtureExpression = String.raw`
  (async () => {
    document.getElementById('game-shell')?.classList.remove('hidden');
    document.getElementById('login-overlay')?.classList.add('hidden');

    const { PartyPanel } = await import('/src/ui/panels/party-panel.ts');
    const { PartyHud } = await import('/src/ui/party-hud.ts');
    const { createMainPartyStateSource } = await import('/src/main-party-state-source.ts');
    const { buildEntityNameplateBadges } = await import('/src/entity-nameplate-badges.ts');

    const host = document.createElement('div');
    document.body.appendChild(host);
    const partyPanel = new PartyPanel();
    partyPanel.mount(host);
    const partyHud = new PartyHud(document.getElementById('party-hud'));

    const sent = [];
    const socialPanelStub = { unread: -1, setPartyTabUnread(count) { this.unread = count; }, openPartyTab() {} };
    const source = createMainPartyStateSource({
      partyPanel,
      partyHud,
      socialPanel: socialPanelStub,
      sidePanel: { switchTab() {} },
      socket: Object.fromEntries([
        'sendRequestPartyPanel','sendCreateParty','sendInvitePartyPlayer','sendRespondPartyInvite','sendLeaveParty',
        'sendRemovePartyMember','sendTransferPartyLeader','sendDisbandParty','sendUpdatePartySettings',
        'sendPublishPartyRecruitment','sendClosePartyRecruitment','sendRequestPartyRecruitments','sendApplyPartyRecruitment',
        'sendRespondPartyApplication','sendJoinPartyMatch','sendLeavePartyMatch','sendSendPartyChat','sendRequestPartyChatHistory',
      ].map((name) => [name, (payload) => sent.push({ name, payload })])),
      showToast() {},
      getPlayerId: () => 'self-player',
    });

    const member = (id, name, role, online, hp, maxHp) => ({
      playerId: id, name, role, realmLv: 3, online, mapName: '青云山',
      hp, maxHp, qi: 50, maxQi: 100, joinedAt: Date.now(),
    });
    const party = {
      partyId: 'party-a',
      leaderPlayerId: 'leader-1',
      members: [member('leader-1', '队长甲', 'leader', true, 80, 100), member('self-player', '我自己', 'member', true, 60, 100)],
      settings: { expMode: 'contribution', lootMode: 'killer', friendlyFireEnabled: false, revision: 1 },
      createdAt: Date.now(),
      revision: 1,
    };
    source.syncPlayerContext('self-player');
    const emptyInvites = [];
    const emptyApplications = [];
    const emptyRecruitments = [];
    source.handlePartyPanel({ party, incomingInvites: emptyInvites, incomingApplications: emptyApplications, recruitments: emptyRecruitments, matchQueue: { queued: false }, serverTime: Date.now() });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.__partyProof = { source, partyPanel, partyHud, host, sent, socialPanelStub, party, emptyInvites, emptyApplications, emptyRecruitments, buildEntityNameplateBadges };
    return { ok: true };
  })()
`;

await withClientBrowserProof(
  { viewport: MOBILE_VIEWPORT, profilePrefix: 'party-client-proof-' },
  async (cdp) => {
    await cdp.evaluate(fixtureExpression);
    await delay(80);

    const structure = await cdp.evaluate(String.raw`
      (() => {
        const { host } = window.__partyProof;
        return {
          hasMemberList: !!host.querySelector('[data-party-member-list="true"]'),
          memberCards: host.querySelectorAll('[data-party-member]').length,
          hasRecruitment: !!host.querySelector('.party-recruit-filter'),
          hasFriendlyFireHint: host.textContent.includes('双重门槛') && host.textContent.includes('默认互为友方'),
          hasLeaderOfflineHintText: window.__partyProof.host.innerHTML.includes('移交队长') === false,
          hudMounted: !document.getElementById('party-hud')?.hidden,
          hudMembers: document.querySelectorAll('#party-hud [data-party-hud-member]').length,
        };
      })()
    `);
    assert.equal(structure.hasMemberList, true, '队伍成员列表未挂载');
    assert.equal(structure.memberCards, 2, '成员卡片数量不符');
    assert.equal(structure.hasRecruitment, true, '招募大厅未挂载');
    assert.equal(structure.hasFriendlyFireHint, false, '非队长视图不应出现队长工具与友伤说明');
    assert.equal(structure.hudMounted, true, '队伍 HUD 未挂载');
    assert.equal(structure.hudMembers, 2, 'HUD 成员行数量不符');

    // 成员 keyed patch：仅 HP 变化时行节点应被原位替换且其它成员节点保持。
    const patchResult = await cdp.evaluate(String.raw`
      (() => {
        const { source, host, party, emptyInvites, emptyApplications, emptyRecruitments } = window.__partyProof;
        const beforeRow = host.querySelector('[data-party-member="leader-1"]');
        const otherRow = host.querySelector('[data-party-member="self-player"]');
        source.handlePartyPanel({
          party: { ...party, members: party.members.map((m) => m.playerId === 'leader-1' ? { ...m, hp: 40 } : m) },
          incomingInvites: emptyInvites, incomingApplications: emptyApplications, recruitments: emptyRecruitments, matchQueue: { queued: false }, serverTime: Date.now(),
        });
        const afterRow = host.querySelector('[data-party-member="leader-1"]');
        const otherAfter = host.querySelector('[data-party-member="self-player"]');
        return {
          changedReplaced: beforeRow !== afterRow,
          otherKept: otherRow === otherAfter,
          hpUpdated: afterRow?.textContent.includes('40/100'),
        };
      })()
    `);
    assert.equal(patchResult.changedReplaced, true, '成员变化未触发 keyed 局部替换');
    assert.equal(patchResult.otherKept, true, '未变化成员节点被误替换');
    assert.equal(patchResult.hpUpdated, true, '成员 HP 文本未更新');

    // late response：切换队伍后旧 partyId 的历史响应必须被丢弃。
    const lateResult = await cdp.evaluate(String.raw`
      (() => {
        const { source } = window.__partyProof;
        const staleRequestId = 'party-history:stale:1';
        source.handlePartyChatHistory({
          requestId: staleRequestId,
          partyId: 'party-old',
          messages: [{ messageId: 'm-stale', partyId: 'party-old', fromPlayerId: 'x', fromName: '旧队友', text: '旧消息', sentAt: 1 }],
        });
        source.handlePartyChatMessage({ messageId: 'm-cross', partyId: 'party-old', fromPlayerId: 'x', fromName: '旧队友', text: '跨队消息', sentAt: 2 });
        const hudText = document.querySelector('#party-hud')?.textContent ?? '';
        return { leaked: hudText.includes('旧消息') || hudText.includes('跨队消息') };
      })()
    `);
    assert.equal(lateResult.leaked, false, '旧队伍/旧 requestId 的晚包未被隔离');

    // 同队名牌只对“自己当前队伍”派生，不泄露或误标其它队伍。
    const badgeResult = await cdp.evaluate(String.raw`
      (() => {
        const { buildEntityNameplateBadges } = window.__partyProof;
        const ownParty = buildEntityNameplateBadges({ kind: 'player', partyMark: 'party-a' }, 'party-a') ?? [];
        const otherParty = buildEntityNameplateBadges({ kind: 'player', partyMark: 'party-b' }, 'party-a') ?? [];
        return {
          ownPartyMarked: ownParty.some((badge) => badge.tone === 'party' && badge.text === '队'),
          otherPartyMarked: otherParty.some((badge) => badge.tone === 'party'),
        };
      })()
    `);
    assert.equal(badgeResult.ownPartyMarked, true, '同队玩家名牌未派生队伍徽记');
    assert.equal(badgeResult.otherPartyMarked, false, '其它队伍玩家被误标为同队');

    // 队伍聊天未读角标与面板打开后的清零。
    const chatResult = await cdp.evaluate(String.raw`
      (() => {
        const { source, sent, socialPanelStub, party } = window.__partyProof;
        source.handlePartyChatMessage({ messageId: 'm-1', partyId: 'party-a', fromPlayerId: 'leader-1', fromName: '队长甲', text: '集合了', sentAt: Date.now() });
        source.handlePartyChatHistory({ requestId: undefined, partyId: 'party-a', messages: [] });
        const unreadBeforeOpen = socialPanelStub.unread;
        const hudBadgeBeforeOpen = document.querySelector('#party-hud [data-party-hud-unread]')?.textContent ?? '';
        window.__partyProof.host.querySelector('[data-party-action="open-chat"]')?.click();
        return {
          unreadBeforeOpen,
          hudBadgeBeforeOpen,
          unreadAfterOpen: socialPanelStub.unread,
        };
      })()
    `);
    assert.equal(chatResult.unreadBeforeOpen, 1, '队伍未读角标未同步到社交 Tab');
    assert.equal(chatResult.hudBadgeBeforeOpen, '1', 'HUD 未读角标未更新');
    assert.equal(chatResult.unreadAfterOpen, 0, '打开队伍聊天后未清零未读角标');

    // 队长视图：设置表单、友伤说明、移交/移出按钮。
    const leaderResult = await cdp.evaluate(String.raw`
      (() => {
        const { source, host, party } = window.__partyProof;
        source.handlePartyPanel({
          party: { ...party, leaderPlayerId: 'self-player', members: party.members.map((m) => m.playerId === 'self-player' ? { ...m, role: 'leader' } : { ...m, role: 'member' }) },
          incomingInvites: [], incomingApplications: [{ applicationId: 'app-1', partyId: 'party-a', playerId: 'p-9', playerName: '申请者', realmLv: 2, createdAt: Date.now(), expiresAt: Date.now() + 60000 }],
          recruitments: [], matchQueue: { queued: false }, serverTime: Date.now(),
        });
        return {
          hasSettings: !!host.querySelector('[data-party-setting="expMode"]') && !!host.querySelector('[data-party-setting="friendlyFireEnabled"]'),
          hasFriendlyFireHint: host.textContent.includes('双重门槛') && host.textContent.includes('默认互为友方'),
          hasKick: !!host.querySelector('[data-party-action="kick"]'),
          hasTransfer: !!host.querySelector('[data-party-action="transfer"]'),
          hasApplication: !!host.querySelector('[data-party-action="application-accept"]'),
          hasDisband: !!host.querySelector('[data-party-action="disband"]'),
          recruitNoteMaxLength: host.querySelector('input[name="note"]')?.maxLength ?? 0,
        };
      })()
    `);
    assert.equal(leaderResult.hasSettings, true, '队长设置表单缺失');
    assert.equal(leaderResult.hasFriendlyFireHint, true, '友伤双门槛说明缺失');
    assert.equal(leaderResult.hasKick, true, '移出成员操作缺失');
    assert.equal(leaderResult.hasTransfer, true, '移交队长操作缺失');
    assert.equal(leaderResult.hasApplication, true, '入队申请审批缺失');
    assert.equal(leaderResult.hasDisband, true, '解散队伍操作缺失');
    assert.equal(leaderResult.recruitNoteMaxLength, 200, '招募说明输入上限不是 200 字');

    // 队长离线提示（普通成员视角）。
    const offlineResult = await cdp.evaluate(String.raw`
      (() => {
        const { source, host, party } = window.__partyProof;
        source.handlePartyPanel({
          party: { ...party, members: party.members.map((m) => m.playerId === 'leader-1' ? { ...m, online: false } : m) },
          incomingInvites: [], incomingApplications: [], recruitments: [], matchQueue: { queued: false }, serverTime: Date.now(),
        });
        return { hint: host.textContent.includes('队长离线期间无法执行移交、解散等管理操作，请等待队长归来') };
      })()
    `);
    assert.equal(offlineResult.hint, true, '队长离线管理等待提示缺失');

    // 状态隔离：切换角色后视图被清空且请求面板刷新。
    const isolationResult = await cdp.evaluate(String.raw`
      (() => {
        const { source, host, sent } = window.__partyProof;
        source.syncPlayerContext('another-player');
        return {
          cleared: !host.querySelector('[data-party-member]'),
          hudHidden: document.getElementById('party-hud')?.hidden === true,
        };
      })()
    `);
    assert.equal(isolationResult.cleared, true, '切换角色后队伍视图未清空');
    assert.equal(isolationResult.hudHidden, true, '切换角色后队伍 HUD 未隐藏');

    // 手机端结构：面板内容不越出视口。
    const mobile = await cdp.evaluate(String.raw`
      (() => {
        const host = document.createElement('div');
        host.style.width = '100%';
        document.body.appendChild(host);
        return import('/src/ui/panels/party-panel.ts').then(({ PartyPanel }) => {
          const panel = new PartyPanel();
          panel.mount(host);
          panel.render({
            view: {
              party: null,
              incomingInvites: [{ inviteId: 'inv-1', partyId: 'p', partyLabel: '测试队伍', fromPlayerId: 'x', fromName: '邀请者', memberCount: 2, expiresAt: Date.now() + 60000 }],
              incomingApplications: [],
              recruitments: [],
              matchQueue: { queued: true, purpose: 'leveling' },
              serverTime: Date.now(),
            },
            playerId: 'self-player',
            chatUnreadCount: 0,
            chatDraft: '',
            recruitingPurpose: 'general',
            recruitmentLoaded: true,
          });
          const rect = host.getBoundingClientRect();
          const matchButton = host.querySelector('[data-party-action="match-leave"]');
          const matchRect = matchButton?.getBoundingClientRect();
          return {
            widthOk: rect.width <= innerWidth,
            inviteVisible: !!host.querySelector('[data-party-action="invite-accept"]'),
            matchWaiting: host.textContent.includes('正在等待匹配'),
            matchHitOk: matchRect ? matchRect.width >= 40 && matchRect.height >= 24 : false,
          };
        });
      })()
    `);
    assert.equal(mobile.widthOk, true, '手机端队伍面板横向越界');
    assert.equal(mobile.inviteVisible, true, '手机端邀请操作缺失');
    assert.equal(mobile.matchWaiting, true, '自动匹配等待状态缺失');
    assert.equal(mobile.matchHitOk, true, '手机端取消匹配按钮触控命中不足');
  },
);

console.log(MARKER);
