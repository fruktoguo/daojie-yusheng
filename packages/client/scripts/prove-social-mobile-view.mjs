/**
 * ISSUE-000021：验证道友五入口、四个独立浮窗、窄屏边界与私聊连续性。
 */
import assert from 'node:assert/strict';
import { delay, withClientBrowserProof } from './browser-proof-runtime.mjs';

const MARKER = 'REPAIR_PROOF:ISSUE-000021:PASS';
const MOBILE_VIEWPORT = { width: 390, height: 844 };

const fixtureExpression = String.raw`
  (async () => {
    document.getElementById('game-shell')?.classList.remove('hidden');
    document.getElementById('login-overlay')?.classList.add('hidden');
    const existingPane = document.getElementById('pane-social');
    if (!(existingPane instanceof HTMLElement)) throw new Error('缺少道友面板宿主');
    document.querySelectorAll('[data-social-floating-panel]').forEach((node) => node.remove());
    const pane = existingPane.cloneNode(false);
    if (!(pane instanceof HTMLElement)) throw new Error('无法重建道友面板宿主');
    existingPane.replaceWith(pane);
    for (let node = pane; node && node !== document.body; node = node.parentElement) {
      node.hidden = false;
      if (getComputedStyle(node).display === 'none') node.style.display = 'block';
    }
    pane.hidden = false;
    pane.style.display = 'block';

    const { SocialPanel } = await import('/src/ui/panels/social-panel.ts');
    const panel = new SocialPanel();
    const openedConversations = [];
    let partyOpenCount = 0;
    panel.setCallbacks({
      onRefresh() {}, onScanNearby() {}, onSendRequest() {}, onRespondRequest() {},
      onUpdateRelationLevel() {}, onRemoveRelation() {}, onSendMessage() {},
      onOpenConversation(playerId) { openedConversations.push(playerId); },
    });
    panel.setPartyOpenHandler(() => { partyOpenCount += 1; });
    const now = Date.now();
    panel.update({
      relations: [
        { playerId: 'friend-1', name: '青禾', level: 'dao_friend', online: true, instanceId: 'map-1', instanceName: '青云山', createdAt: now, updatedAt: now },
        { playerId: 'friend-2', name: '玄渡', level: 'close_friend', online: false, createdAt: now, updatedAt: now },
      ],
      incomingRequests: [{ requestId: 'request-1', fromPlayerId: 'asker-1', fromName: '问道者', createdAt: now }],
      outgoingRequests: [],
      nearbyCandidates: [{ playerId: 'near-1', name: '近客', distance: 2, relationLevel: null, pendingRequest: false }],
      conversations: [{ peerPlayerId: 'friend-1', unreadCount: 2 }],
    });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.__socialFloatingProof = { panel, openedConversations, getPartyOpenCount: () => partyOpenCount };
    return true;
  })()
`;

await withClientBrowserProof(
  { viewport: MOBILE_VIEWPORT, profilePrefix: 'social-floating-proof-' },
  async (cdp) => {
    await cdp.evaluate(fixtureExpression);
    await delay(60);

    const launcher = await cdp.evaluate(String.raw`
      (() => {
        const root = document.querySelector('[data-social-menu-launcher="true"]');
        return {
          count: root?.querySelectorAll('[data-social-menu]').length ?? 0,
          party: !!root?.querySelector('[data-social-menu="party"]'),
          unread: root?.querySelector('[data-social-menu="messages"]')?.textContent?.includes('2') ?? false,
          floatingRoots: document.querySelectorAll('[data-social-floating-panel]').length,
        };
      })()
    `);
    assert.equal(launcher.count, 5, '道友启动器必须提供五个独立入口');
    assert.equal(launcher.party, true, '队伍独立浮窗入口缺失');
    assert.equal(launcher.unread, true, '私聊入口未显示未读提醒');
    assert.equal(launcher.floatingRoots, 4, '四个道友子功能未创建独立浮窗');

    const openRelations = await cdp.evaluate(String.raw`
      (() => {
        document.querySelector('[data-social-menu="relations"]')?.click();
        const root = document.getElementById('floating-social-relations');
        const rect = root?.getBoundingClientRect();
        const list = root?.querySelector('.social-panel-tab-pane > .ui-list');
        if (list instanceof HTMLElement) list.scrollTop = 17;
        return {
          visible: root instanceof HTMLElement && !root.hidden,
          dialog: root?.getAttribute('role') === 'dialog',
          workspaceClass: root?.classList.contains('floating-list-panel--workspace') ?? false,
          widthOk: rect ? rect.width <= innerWidth - 16 : false,
          heightOk: rect ? rect.height <= innerHeight - 16 : false,
          content: root?.textContent?.includes('青禾') ?? false,
        };
      })()
    `);
    assert.deepEqual(openRelations, {
      visible: true, dialog: true, workspaceClass: true, widthOk: true, heightOk: true, content: true,
    }, '道友名录独立浮窗或窄屏边界不正确');

    const narrowSwitch = await cdp.evaluate(String.raw`
      (() => {
        document.querySelector('[data-social-menu="requests"]')?.click();
        return {
          relationsClosed: document.getElementById('floating-social-relations')?.hidden === true,
          requestsOpen: document.getElementById('floating-social-requests')?.hidden === false,
          requestVisible: document.getElementById('floating-social-requests')?.textContent?.includes('问道者') ?? false,
        };
      })()
    `);
    assert.deepEqual(narrowSwitch, { relationsClosed: true, requestsOpen: true, requestVisible: true }, '窄屏浮窗未互斥或申请内容缺失');

    const draftContinuity = await cdp.evaluate(String.raw`
      (async () => {
        document.querySelector('[data-social-menu="messages"]')?.click();
        const input = document.querySelector('#floating-social-messages [data-social-message-input]');
        if (!(input instanceof HTMLInputElement)) throw new Error('私聊输入框缺失');
        input.value = '保留中的私聊草稿';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        document.querySelector('[data-social-menu="nearby"]')?.click();
        document.querySelector('[data-social-menu="messages"]')?.click();
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const restored = document.querySelector('#floating-social-messages [data-social-message-input]');
        return {
          draft: restored instanceof HTMLInputElement ? restored.value : '',
          nearbyClosed: document.getElementById('floating-social-nearby')?.hidden === true,
          openedPeer: window.__socialFloatingProof.openedConversations.at(-1),
        };
      })()
    `);
    assert.deepEqual(draftContinuity, { draft: '保留中的私聊草稿', nearbyClosed: true, openedPeer: 'friend-1' }, '私聊浮窗重开后草稿或会话状态丢失');

    const focusReturn = await cdp.evaluate(String.raw`
      (async () => {
        document.querySelector('#floating-social-messages [data-floating-list-close="true"]')?.click();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const launcher = document.querySelector('[data-social-menu="messages"]');
        return {
          closed: document.getElementById('floating-social-messages')?.hidden === true,
          focusReturned: document.activeElement === launcher,
        };
      })()
    `);
    assert.deepEqual(focusReturn, { closed: true, focusReturned: true }, '关闭私聊浮窗后未归还入口焦点');

    const partyOpen = await cdp.evaluate(String.raw`
      (() => {
        document.querySelector('[data-social-menu="party"]')?.click();
        return window.__socialFloatingProof.getPartyOpenCount();
      })()
    `);
    assert.equal(partyOpen, 1, '队伍入口未调用独立浮窗打开回调');
  },
);

console.log(MARKER);
