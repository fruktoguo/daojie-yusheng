/** 道友启动器 proof：五入口复用坊市式固定窗口、全局互斥与私聊连续性。 */
import assert from 'node:assert/strict';
import { delay, withClientBrowserProof } from './browser-proof-runtime.mjs';

const MARKER = 'REPAIR_PROOF:ISSUE-000021:PASS';

const fixtureExpression = String.raw`
  (async () => {
    document.getElementById('game-shell')?.classList.remove('hidden');
    document.getElementById('login-overlay')?.classList.add('hidden');
    const modal = document.getElementById('detail-modal');
    if (modal && !modal.classList.contains('hidden')) modal.click();
    const currentPane = document.getElementById('pane-social');
    if (!(currentPane instanceof HTMLElement)) throw new Error('缺少右侧道友面板');
    const pane = currentPane.cloneNode(false);
    currentPane.replaceWith(pane);
    for (let node = pane; node && node !== document.body; node = node.parentElement) {
      node.hidden = false;
      if (getComputedStyle(node).display === 'none') node.style.display = 'block';
    }
    const { SocialPanel } = await import('/src/ui/panels/social-panel.ts');
    const { PartyPanel } = await import('/src/ui/panels/party-panel.ts');
    const { PartyWorkspacePanel } = await import('/src/ui/party-workspace-panel.ts');
    const { bindMainSocialPanelNavigation } = await import('/src/main-social-panel-navigation.ts');
    const socialPanel = new SocialPanel();
    socialPanel.setCallbacks({
      onRefresh() {}, onScanNearby() {}, onSendRequest() {}, onRespondRequest() {},
      onUpdateRelationLevel() {}, onRemoveRelation() {}, onSendMessage() {}, onOpenConversation() {},
    });
    const partyWorkspace = new PartyWorkspacePanel(new PartyPanel());
    bindMainSocialPanelNavigation({ socialPanel, partyPanel: partyWorkspace });
    partyWorkspace.setAvailable(true);
    socialPanel.setPartyAvailable(true);
    socialPanel.update({
      relations: [{ playerId: 'friend-1', name: '青衡', level: 'dao_friend', online: true, instanceId: 'map-1', instanceName: '云来镇' }],
      incomingRequests: [{ requestId: 'request-1', fromPlayerId: 'stranger-1', fromName: '远客' }],
      outgoingRequests: [],
      nearbyCandidates: [{ playerId: 'nearby-1', name: '近客', distance: 2, relationLevel: null, pendingRequest: false }],
      conversations: [{ peerPlayerId: 'friend-1', unreadCount: 7 }],
    });
    socialPanel.mergeConversationMessages('friend-1', Array.from({ length: 36 }, (_, index) => ({
      messageId: 'message-' + index, fromPlayerId: 'friend-1', fromName: '青衡',
      toPlayerId: 'self-player', text: '第 ' + (index + 1) + ' 条用于滚动恢复验证的长消息', sentAt: index + 1,
    })));
    window.__socialProof = { pane, socialPanel, partyWorkspace };
    return true;
  })()
`;

function assertWorkspaceState(state, expectedId, label) {
  assert.equal(state.open, true, `${label}未打开共享详情窗口`);
  assert.equal(state.ownerId, expectedId, `${label}内容宿主不正确`);
  assert.equal(state.ownerCount, 1, `${label}打开后共享宿主内不是单一功能页`);
  assert.equal(Math.abs(state.width - 800) <= 1, true, `${label}桌面宽度不是 800px`);
  assert.equal(Math.abs(state.height - 450) <= 1, true, `${label}桌面高度不是 450px`);
  assert.equal(state.bounded, true, `${label}越出视口`);
  assert.equal(state.variant, true, `${label}未使用坊市式固定窗口变体`);
}

await withClientBrowserProof(
  { viewport: { width: 1280, height: 900 }, profilePrefix: 'social-workspace-proof-' },
  async (cdp) => {
    await cdp.evaluate(fixtureExpression);
    await delay(60);
    const launcher = await cdp.evaluate(`(() => {
      const { pane } = window.__socialProof;
      const cards = Array.from(pane.querySelectorAll('[data-social-menu]'));
      return { count: cards.length, labels: cards.map((card) => card.textContent.trim()),
        directTabs: document.querySelectorAll('.social-feature-tab').length,
        embeddedPanes: document.querySelectorAll('#pane-party, [id^="pane-social-"]').length };
    })()`);
    assert.equal(launcher.count, 5, '道友面板不是五按钮启动器');
    for (const label of ['队伍', '道友名录', '道友申请', '附近修士', '私聊']) {
      assert.equal(launcher.labels.some((text) => text.includes(label)), true, `缺少${label}按钮`);
    }
    assert.equal(launcher.directTabs, 0, '五项仍被错误放进右侧 Tab');
    assert.equal(launcher.embeddedPanes, 0, '五项仍存在右侧内嵌内容面板');

    const mutual = await cdp.evaluate(String.raw`(async () => {
      const { pane } = window.__socialProof;
      const state = () => {
        const modal = document.getElementById('detail-modal');
        const card = document.getElementById('detail-modal-card');
        const owner = document.querySelector('#detail-modal-body [data-feature-workspace]');
        const rect = card?.getBoundingClientRect();
        return { open: !!modal && !modal.classList.contains('hidden'), ownerId: owner?.id ?? null,
          ownerCount: document.querySelectorAll('#detail-modal-body [data-feature-workspace]').length,
          width: rect?.width ?? 0, height: rect?.height ?? 0,
          bounded: !!rect && rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
          variant: !!card?.classList.contains('detail-modal--feature-workspace') };
      };
      const open = async (selector) => { const button = pane.querySelector(selector); button?.focus(); button?.click(); await new Promise(requestAnimationFrame); return state(); };
      return {
        relations: await open('[data-social-tab="relations"]'), requests: await open('[data-social-tab="requests"]'),
        party: await open('[data-social-action="party"]'), nearby: await open('[data-social-tab="nearby"]'),
      };
    })()`);
    assertWorkspaceState(mutual.relations, 'social-workspace-relations', '道友名录');
    assertWorkspaceState(mutual.requests, 'social-workspace-requests', '道友申请');
    assertWorkspaceState(mutual.party, 'party-workspace-panel', '队伍');
    assertWorkspaceState(mutual.nearby, 'social-workspace-nearby', '附近修士');

    const continuity = await cdp.evaluate(String.raw`(async () => {
      const { pane } = window.__socialProof;
      const messagesButton = pane.querySelector('[data-social-tab="messages"]');
      messagesButton?.focus(); messagesButton?.click(); await new Promise(requestAnimationFrame);
      let root = document.getElementById('social-workspace-messages');
      let input = root?.querySelector('[data-social-message-input]');
      let list = root?.querySelector('.social-message-list');
      if (!(input instanceof HTMLInputElement) || !(list instanceof HTMLElement)) throw new Error('私聊工作区未挂载');
      const unread = pane.querySelector('[data-social-tab-unread="true"]')?.textContent?.trim() === '7';
      input.value = '修订后的未发送草稿'; input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus(); input.setSelectionRange(3, 8, 'forward'); list.scrollTop = Math.max(0, list.scrollHeight - list.clientHeight - 40);
      const scrollTop = list.scrollTop;
      const partyButton = pane.querySelector('[data-social-action="party"]');
      partyButton?.focus(); partyButton?.click(); await new Promise(requestAnimationFrame);
      const partyFocused = document.activeElement instanceof HTMLElement && !!document.activeElement.closest('#party-workspace-panel');
      messagesButton?.focus(); messagesButton?.click(); await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      root = document.getElementById('social-workspace-messages'); input = root?.querySelector('[data-social-message-input]'); list = root?.querySelector('.social-message-list');
      const result = { unread, draft: input?.value === '修订后的未发送草稿', selection: input?.selectionStart === 3 && input?.selectionEnd === 8,
        scroll: list instanceof HTMLElement && Math.abs(list.scrollTop - scrollTop) <= 2, partyFocused };
      document.getElementById('detail-modal')?.click(); await new Promise((resolve) => requestAnimationFrame(resolve));
      return { ...result, focusReturned: document.activeElement === messagesButton,
        closed: document.getElementById('detail-modal')?.classList.contains('hidden') === true };
    })()`);
    assert.deepEqual(continuity, { unread: true, draft: true, selection: true, scroll: true, partyFocused: true, focusReturned: true, closed: true },
      '坊市式窗口切换破坏了私聊草稿/选区/滚动/焦点连续性');
  },
);

await withClientBrowserProof(
  { viewport: { width: 390, height: 740 }, profilePrefix: 'social-workspace-mobile-proof-' },
  async (cdp) => {
    await cdp.evaluate(fixtureExpression);
    await delay(60);
    const mobile = await cdp.evaluate(String.raw`(async () => {
      const { pane } = window.__socialProof;
      const read = async (selector) => { pane.querySelector(selector)?.click(); await new Promise(requestAnimationFrame);
        const rect = document.getElementById('detail-modal-card')?.getBoundingClientRect();
        return rect ? { width: rect.width, height: rect.height, bounded: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1 } : null; };
      return { relations: await read('[data-social-tab="relations"]'), party: await read('[data-social-action="party"]') };
    })()`);
    for (const rect of [mobile.relations, mobile.party]) {
      assert.equal(rect?.bounded, true, '窄屏固定窗口越出安全视口');
      assert.equal((rect?.width ?? 800) < 800, true, '窄屏固定窗口未收敛宽度');
      assert.equal((rect?.height ?? 450) <= 724, true, '窄屏固定窗口未收敛高度');
    }
  },
);

console.log(MARKER);
