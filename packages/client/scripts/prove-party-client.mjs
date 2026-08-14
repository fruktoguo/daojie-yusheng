/**
 * 组队客户端 proof：验证固定队伍主面板、紧凑队伍悬浮窗、成员/管理权限 Tab、状态隔离、late response 丢弃、
 * 成员 keyed patch、手机端结构与友伤双门槛说明文案。
 */
import assert from 'node:assert/strict';
import { delay, withClientBrowserProof } from './browser-proof-runtime.mjs';

const MARKER = 'REPAIR_PROOF:PARTY-CLIENT:PASS';
const MOBILE_VIEWPORT = { width: 390, height: 844 };

const fixtureExpression = String.raw`
  (async () => {
    document.getElementById('game-shell')?.classList.remove('hidden');
    document.getElementById('login-overlay')?.classList.add('hidden');

    localStorage.removeItem('mud:side-panel-state:v1');
    const currentGroup = document.querySelector('[data-tab-group="right-top"]');
    if (!(currentGroup instanceof HTMLElement)) throw new Error('缺少 right-top 固定面板分组');
    const groupClone = currentGroup.cloneNode(true);
    if (!(groupClone instanceof HTMLElement)) throw new Error('无法重建 right-top 固定面板分组');
    currentGroup.replaceWith(groupClone);
    for (let node = groupClone; node && node !== document.body; node = node.parentElement) {
      node.hidden = false;
      if (getComputedStyle(node).display === 'none') node.style.display = 'block';
    }

    const { SidePanel } = await import('/src/ui/side-panel.ts');
    const { PartyPanel } = await import('/src/ui/panels/party-panel.ts');
    const { PartyFloatingPanel } = await import('/src/ui/party-floating-panel.ts');
    const { updateFloatingPanelPreference } = await import('/src/ui/floating-panel-preferences.ts');
    const { createMainPartyStateSource } = await import('/src/main-party-state-source.ts');
    const { buildEntityNameplateBadges } = await import('/src/entity-nameplate-badges.ts');

    const host = document.getElementById('party-panel-fixed-host');
    if (!(host instanceof HTMLElement)) throw new Error('缺少固定队伍面板宿主');
    host.replaceChildren();
    const partyPane = document.getElementById('pane-party');
    if (!(partyPane instanceof HTMLElement)) throw new Error('缺少固定队伍面板');
    document.getElementById('floating-party-hud')?.remove();
    const sidePanel = new SidePanel();
    sidePanel.initializeTabs();
    sidePanel.switchTab('mobile-bag');
    updateFloatingPanelPreference('party', true);
    const partyPanel = new PartyPanel();
    partyPanel.mount(host);
    const partyHud = new PartyFloatingPanel();
    const hudRoot = partyHud.root;
    let fixedOpenCount = 0;

    const sent = [];
    const partyChromeStub = {
      unread: -1,
      available: false,
      setUnread(count) { this.unread = count; },
      setAvailable(available) { this.available = available; },
    };
    const source = createMainPartyStateSource({
      partyPanel,
      partyHud,
      openPartyPanel: () => {
        fixedOpenCount += 1;
        sidePanel.switchTab('party');
      },
      setPartyUnread: (count) => partyChromeStub.setUnread(count),
      setPartyPanelAvailable: (available) => partyChromeStub.setAvailable(available),
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
    source.openPanel();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.__partyProof = { source, partyPanel, partyHud, sidePanel, host, hudRoot, fixedOpenCount: () => fixedOpenCount, sent, partyChromeStub, party, emptyInvites, emptyApplications, emptyRecruitments, buildEntityNameplateBadges, updateFloatingPanelPreference };
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
        const { host, hudRoot } = window.__partyProof;
        return {
          hasFixedPanel: host.closest('#pane-party') !== null && !host.closest('#pane-party')?.classList.contains('floating-list-panel'),
          hasMemberTab: !!host.querySelector('[data-party-tab="members"]'),
          hasInviteTab: !!host.querySelector('[data-party-tab="invites"]'),
          hasManagementTab: !!host.querySelector('[data-party-tab="management"]'),
          hasMemberList: !!host.querySelector('[data-party-member-list="true"]'),
          memberCards: host.querySelectorAll('[data-party-member]').length,
          activeCount: document.querySelector('[data-tab-group="right-top"]')?.querySelectorAll('[data-pane].active').length ?? 0,
          recruitmentOnMemberTab: !!host.querySelector('.party-recruit-filter'),
          hasFriendlyFireHint: host.textContent.includes('双重门槛') && host.textContent.includes('默认互为友方'),
          hasLeaderOfflineHintText: window.__partyProof.host.innerHTML.includes('移交队长') === false,
          hudMounted: !hudRoot.hidden,
          hudMembers: hudRoot.querySelectorAll('[data-party-hud-member]').length,
        };
      })()
    `);
    assert.equal(structure.hasFixedPanel, true, '完整队伍页面未挂载到固定面板');
    assert.equal(structure.hasMemberTab, true, '队伍成员 Tab 缺失');
    assert.equal(structure.hasInviteTab, true, '队伍邀请 Tab 缺失');
    assert.equal(structure.hasManagementTab, false, '普通成员不应看到管理 Tab');
    assert.equal(structure.hasMemberList, true, '队伍成员列表未挂载');
    assert.equal(structure.memberCards, 2, '成员卡片数量不符');
    assert.equal(structure.activeCount, 1, '队伍固定面板未经过真实 SidePanel 互斥链路');
    assert.equal(structure.recruitmentOnMemberTab, false, '成员 Tab 不应混入招募大厅');
    assert.equal(structure.hasFriendlyFireHint, false, '非队长视图不应出现队长工具与友伤说明');
    assert.equal(structure.hudMounted, true, '队伍 HUD 未挂载');
    assert.equal(structure.hudMembers, 2, 'HUD 成员行数量不符');

    const inviteTabResult = await cdp.evaluate(String.raw`
      (() => {
        const { host } = window.__partyProof;
        host.querySelector('[data-party-tab="invites"]')?.click();
        const result = {
          recruitment: !!host.querySelector('.party-recruit-filter'),
          match: host.textContent.includes('自动匹配'),
          leaderOnlyHint: host.textContent.includes('仅队长可以直接邀请玩家'),
        };
        host.querySelector('[data-party-tab="members"]')?.click();
        return result;
      })()
    `);
    assert.deepEqual(inviteTabResult, { recruitment: true, match: false, leaderOnlyHint: true }, '普通成员邀请 Tab 权限提示或招募大厅不正确');

    const reopenResult = await cdp.evaluate(String.raw`
      (async () => {
        const { source, hudRoot, fixedOpenCount } = window.__partyProof;
        hudRoot.querySelector('[data-floating-list-close="true"]')?.click();
        const hudClosed = hudRoot.hidden;
        const settingsHost = document.createElement('div');
        settingsHost.id = 'party-settings-proof-host';
        document.body.appendChild(settingsHost);
        const { mountReactSettingsPanel } = await import('/src/react-ui/panels/settings/mount-settings-panel.tsx');
        mountReactSettingsPanel(settingsHost);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        settingsHost.querySelector('[data-settings-tab="ui"]')?.click();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const partyToggle = settingsHost.querySelector('[data-floating-panel-key="party"] [data-floating-panel-enabled="true"]');
        const reactTogglePresent = partyToggle instanceof HTMLButtonElement;
        partyToggle?.click();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const hudReopened = !hudRoot.hidden;
        const before = fixedOpenCount();
        source.openPanel();
        return {
          hudClosed, hudReopened, reactTogglePresent, fixedOpened: fixedOpenCount() === before + 1,
          partyActive: document.getElementById('pane-party')?.classList.contains('active') ?? false,
          activeCount: document.querySelector('[data-tab-group="right-top"]')?.querySelectorAll('[data-pane].active').length ?? 0,
        };
      })()
    `);
    assert.equal(reopenResult.hudClosed, true, '关闭按钮未隐藏队伍状态悬浮窗');
    assert.equal(reopenResult.reactTogglePresent, true, '默认 React 设置页缺少队伍状态开关');
    assert.equal(reopenResult.hudReopened, true, 'React 设置偏好未能重新开启队伍状态悬浮窗');
    assert.equal(reopenResult.fixedOpened, true, '队伍入口未打开固定队伍面板');
    assert.equal(reopenResult.partyActive, true, '固定队伍面板未进入互斥槽位');
    assert.equal(reopenResult.activeCount, 1, '队伍入口打开后同组出现多个 active 面板');

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
        const { source, hudRoot } = window.__partyProof;
        const staleRequestId = 'party-history:stale:1';
        source.handlePartyChatHistory({
          requestId: staleRequestId,
          partyId: 'party-old',
          messages: [{ messageId: 'm-stale', partyId: 'party-old', fromPlayerId: 'x', fromName: '旧队友', text: '旧消息', sentAt: 1 }],
        });
        source.handlePartyChatMessage({ messageId: 'm-cross', partyId: 'party-old', fromPlayerId: 'x', fromName: '旧队友', text: '跨队消息', sentAt: 2 });
        const hudText = hudRoot.textContent ?? '';
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
        const { source, partyChromeStub, hudRoot } = window.__partyProof;
        source.handlePartyChatMessage({ messageId: 'm-1', partyId: 'party-a', fromPlayerId: 'leader-1', fromName: '队长甲', text: '集合了', sentAt: Date.now() });
        source.handlePartyChatHistory({ requestId: undefined, partyId: 'party-a', messages: [] });
        const unreadBeforeOpen = partyChromeStub.unread;
        const hudBadgeBeforeOpen = hudRoot.querySelector('[data-party-hud-unread]')?.textContent ?? '';
        window.__partyProof.host.querySelector('[data-party-action="open-chat"]')?.click();
        return {
          unreadBeforeOpen,
          hudBadgeBeforeOpen,
          unreadAfterOpen: partyChromeStub.unread,
          chatOpened: hudRoot.querySelector('[data-party-hud-chat="true"]')?.hidden === false,
        };
      })()
    `);
    assert.equal(chatResult.unreadBeforeOpen, 1, '队伍未读角标未同步到悬浮窗标题状态');
    assert.equal(chatResult.hudBadgeBeforeOpen, '1', 'HUD 未读角标未更新');
    assert.equal(chatResult.unreadAfterOpen, 0, '打开队伍聊天后未清零未读角标');
    assert.equal(chatResult.chatOpened, true, '队伍面板聊天按钮未展开 HUD 聊天区');

    // 队长视图：设置表单、友伤说明、移交/移出按钮。
    const leaderResult = await cdp.evaluate(String.raw`
      (() => {
        const { source, host, party } = window.__partyProof;
        source.handlePartyPanel({
          party: { ...party, leaderPlayerId: 'self-player', members: party.members.map((m) => m.playerId === 'self-player' ? { ...m, role: 'leader' } : { ...m, role: 'member' }) },
          incomingInvites: [], incomingApplications: [{ applicationId: 'app-1', partyId: 'party-a', playerId: 'p-9', playerName: '申请者', realmLv: 2, createdAt: Date.now(), expiresAt: Date.now() + 60000 }],
          recruitments: [], matchQueue: { queued: false }, serverTime: Date.now(),
        });
        const managementTab = host.querySelector('[data-party-tab="management"]');
        managementTab?.click();
        const hasSettings = !!host.querySelector('[data-party-setting="expMode"]') && !!host.querySelector('[data-party-setting="friendlyFireEnabled"]');
        const hasFriendlyFireHint = host.textContent.includes('双重门槛') && host.textContent.includes('默认互为友方');
        const hasKick = !!host.querySelector('[data-party-action="kick"]');
        const hasTransfer = !!host.querySelector('[data-party-action="transfer"]');
        const hasDisband = !!host.querySelector('[data-party-action="disband"]');
        host.querySelector('[data-party-tab="invites"]')?.click();
        return {
          hasManagementTab: !!managementTab,
          hasSettings, hasFriendlyFireHint, hasKick, hasTransfer, hasDisband,
          hasApplication: !!host.querySelector('[data-party-action="application-accept"]'),
          recruitNoteMaxLength: host.querySelector('input[name="note"]')?.maxLength ?? 0,
        };
      })()
    `);
    assert.equal(leaderResult.hasManagementTab, true, '队长管理 Tab 缺失');
    assert.equal(leaderResult.hasSettings, true, '队长设置表单缺失');
    assert.equal(leaderResult.hasFriendlyFireHint, true, '友伤双门槛说明缺失');
    assert.equal(leaderResult.hasKick, true, '移出成员操作缺失');
    assert.equal(leaderResult.hasTransfer, true, '移交队长操作缺失');
    assert.equal(leaderResult.hasApplication, true, '入队申请审批缺失');
    assert.equal(leaderResult.hasDisband, true, '解散队伍操作缺失');
    assert.equal(leaderResult.recruitNoteMaxLength, 200, '招募说明输入上限不是 200 字');

    // 同 revision 的管理数据必须刷新；聊天/HP 更新不得打断招募表单输入。
    const continuityResult = await cdp.evaluate(String.raw`
      (() => {
        const { source, host, party } = window.__partyProof;
        const leaderParty = {
          ...party,
          leaderPlayerId: 'self-player',
          members: party.members.map((member) => member.playerId === 'self-player'
            ? { ...member, role: 'leader' }
            : { ...member, role: 'member' }),
        };
        source.handlePartyPanel({
          party: leaderParty, incomingInvites: [], incomingApplications: [], recruitments: [],
          matchQueue: { queued: false }, serverTime: Date.now(),
        });
        host.querySelector('[data-party-tab="invites"]')?.click();
        const noteBefore = host.querySelector('input[name="note"]');
        if (!(noteBefore instanceof HTMLInputElement)) throw new Error('未找到招募说明输入框');
        noteBefore.value = '保留这段尚未发布的招募说明';
        noteBefore.focus();
        noteBefore.setSelectionRange(2, 8);
        source.handlePartyChatMessage({
          messageId: 'm-continuity', partyId: 'party-a', fromPlayerId: 'leader-1',
          fromName: '队友甲', text: '不要打断输入', sentAt: Date.now(),
        });
        const noteAfterChat = host.querySelector('input[name="note"]');
        const chatPreserved = noteAfterChat === noteBefore
          && noteAfterChat?.value === '保留这段尚未发布的招募说明'
          && document.activeElement === noteAfterChat
          && noteAfterChat?.selectionStart === 2
          && noteAfterChat?.selectionEnd === 8;
        source.handlePartyPanel({
          party: {
            ...leaderParty,
            members: leaderParty.members.map((member) => member.playerId === 'leader-1' ? { ...member, hp: 33 } : member),
          },
          incomingInvites: [], incomingApplications: [], recruitments: [],
          matchQueue: { queued: false }, serverTime: Date.now(),
        });
        const noteAfterHp = host.querySelector('input[name="note"]');
        const hpPreserved = noteAfterHp === noteBefore
          && noteAfterHp?.value === '保留这段尚未发布的招募说明'
          && document.activeElement === noteAfterHp
          && noteAfterHp?.selectionStart === 2
          && noteAfterHp?.selectionEnd === 8;
        source.handlePartyPanel({
          party: leaderParty,
          incomingInvites: [],
          incomingApplications: [{
            applicationId: 'app-same-revision', partyId: 'party-a', playerId: 'p-10',
            playerName: '同修乙', realmLv: 4, createdAt: Date.now(), expiresAt: Date.now() + 60_000,
          }],
          recruitments: [], matchQueue: { queued: false }, serverTime: Date.now(),
        });
        const noteAfterApplication = host.querySelector('input[name="note"]');
        const structuralPreserved = noteAfterApplication !== noteBefore
          && noteAfterApplication?.value === '保留这段尚未发布的招募说明'
          && document.activeElement === noteAfterApplication
          && noteAfterApplication?.selectionStart === 2
          && noteAfterApplication?.selectionEnd === 8;
        const applicationVisible = !!host.querySelector('[data-application-id="app-same-revision"]')
          || host.textContent.includes('同修乙');
        host.querySelector('[data-party-tab="invites"]')?.click();
        source.handlePartyPanel({
          party: leaderParty, incomingInvites: [], incomingApplications: [],
          recruitments: [{
            listingId: 'listing-same-revision', partyId: 'party-b', leaderPlayerId: 'p-20',
            leaderName: '招募队长', purpose: 'boss', minRealmLv: 2, maxRealmLv: 8, note: '同 revision 新招募',
            memberCount: 3, maxMembers: 5, createdAt: Date.now(), expiresAt: Date.now() + 60_000,
          }],
          matchQueue: { queued: false }, serverTime: Date.now(),
        });
        return {
          chatPreserved,
          chatDebug: {
            sameNode: noteAfterChat === noteBefore,
            value: noteAfterChat?.value ?? null,
            focused: document.activeElement === noteAfterChat,
            activeTag: document.activeElement?.tagName ?? null,
            selectionStart: noteAfterChat?.selectionStart ?? null,
            selectionEnd: noteAfterChat?.selectionEnd ?? null,
          },
          hpPreserved, structuralPreserved, applicationVisible,
          recruitmentVisible: host.textContent.includes('同 revision 新招募'),
        };
      })()
    `);
    assert.equal(continuityResult.chatPreserved, true, `聊天未读更新打断了招募表单输入：${JSON.stringify(continuityResult.chatDebug)}`);
    assert.equal(continuityResult.hpPreserved, true, '成员 HP 更新打断了招募表单输入');
    assert.equal(continuityResult.structuralPreserved, true, '管理数据结构更新未恢复表单值、焦点与选区');
    assert.equal(continuityResult.applicationVisible, true, '同 revision 新申请未刷新到管理页');
    assert.equal(continuityResult.recruitmentVisible, true, '同 revision 招募列表变化未刷新');

    // 队长离线提示（普通成员视角）。
    const offlineResult = await cdp.evaluate(String.raw`
      (() => {
        const { source, host, party } = window.__partyProof;
        source.handlePartyPanel({
          party: { ...party, members: party.members.map((m) => m.playerId === 'leader-1' ? { ...m, online: false } : m) },
          incomingInvites: [], incomingApplications: [], recruitments: [], matchQueue: { queued: false }, serverTime: Date.now(),
        });
        host.querySelector('[data-party-tab="members"]')?.click();
        return { hint: host.textContent.includes('队长离线期间无法执行移交、解散等管理操作，请等待队长归来') };
      })()
    `);
    assert.equal(offlineResult.hint, true, '队长离线管理等待提示缺失');

    // 状态隔离：切换角色后视图被清空且请求面板刷新。
    const isolationResult = await cdp.evaluate(String.raw`
      (() => {
        const { source, host, sent, hudRoot } = window.__partyProof;
        source.syncPlayerContext('another-player');
        return {
          cleared: !host.querySelector('[data-party-member]'),
          hudHidden: hudRoot.hidden === true,
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
          panel.setCallbacks(new Proxy({}, { get: () => () => {} }));
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
          host.querySelector('[data-party-tab="invites"]')?.click();
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

    // 紧凑队伍悬浮窗沿用行动/交互同款外壳，并在手机视口内保持可操作。
    const hudBounds = await cdp.evaluate(String.raw`
      (async () => {
        const { source, party, hudRoot, updateFloatingPanelPreference, emptyInvites, emptyApplications, emptyRecruitments } = window.__partyProof;
        source.syncPlayerContext('self-player');
        source.handlePartyPanel({ party, incomingInvites: emptyInvites, incomingApplications: emptyApplications, recruitments: emptyRecruitments, matchQueue: { queued: false }, serverTime: Date.now() });
        updateFloatingPanelPreference('party', true);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const rect = hudRoot.getBoundingClientRect();
        return {
          shell: hudRoot.classList.contains('floating-list-panel--party-hud'),
          hasCollapse: !!hudRoot.querySelector('[data-floating-list-collapse="true"]'),
          hasClose: !!hudRoot.querySelector('[data-floating-list-close="true"]'),
          top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
          viewportWidth: innerWidth, viewportHeight: innerHeight,
        };
      })()
    `);
    assert.equal(hudBounds.shell, true, '队伍状态未复用通用悬浮面板外壳');
    assert.equal(hudBounds.hasCollapse, true, '队伍状态悬浮窗缺少折叠操作');
    assert.equal(hudBounds.hasClose, true, '队伍状态悬浮窗缺少关闭操作');
    assert(hudBounds.top >= 7 && hudBounds.bottom <= hudBounds.viewportHeight - 7, `队伍状态悬浮窗纵向越出视口：${JSON.stringify(hudBounds)}`);
    assert(hudBounds.left >= 7 && hudBounds.right <= hudBounds.viewportWidth - 7, `队伍状态悬浮窗横向越出视口：${JSON.stringify(hudBounds)}`);
  },
);

console.log(MARKER);
