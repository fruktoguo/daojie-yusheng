/** ISSUE-000021：验证五入口走真实 SidePanel 固定槽位、全局互斥与私聊连续性。 */
import assert from 'node:assert/strict';
import { delay, withClientBrowserProof } from './browser-proof-runtime.mjs';

const MARKER = 'REPAIR_PROOF:ISSUE-000021:PASS';
const MOBILE_VIEWPORT = { width: 390, height: 844 };

const fixtureExpression = String.raw`
  (async () => {
    document.getElementById('game-shell')?.classList.remove('hidden');
    document.getElementById('login-overlay')?.classList.add('hidden');
    localStorage.setItem('mud:side-panel-state:v1', JSON.stringify({
      version: 1,
      activeTabs: { 'right-top': 'social-messages' },
    }));
    const currentGroup = document.querySelector('[data-tab-group="right-top"]');
    if (!(currentGroup instanceof HTMLElement)) throw new Error('缺少 right-top 固定面板分组');
    const groupClone = currentGroup.cloneNode(true);
    if (!(groupClone instanceof HTMLElement)) throw new Error('无法重建 right-top 固定面板分组');
    currentGroup.replaceWith(groupClone);
    for (const id of ['pane-social', 'pane-party', 'pane-social-relations', 'pane-social-requests', 'pane-social-nearby', 'pane-social-messages']) {
      const current = document.getElementById(id);
      if (!(current instanceof HTMLElement)) throw new Error('缺少固定面板宿主：' + id);
      const clone = current.cloneNode(id === 'pane-party');
      if (!(clone instanceof HTMLElement)) throw new Error('无法重建固定面板宿主：' + id);
      current.replaceWith(clone);
    }
    for (let node = groupClone; node && node !== document.body; node = node.parentElement) {
      node.hidden = false;
      if (getComputedStyle(node).display === 'none') node.style.display = 'block';
    }
    const style = document.createElement('style');
    style.textContent = '#pane-social-messages .social-message-list{height:80px!important;overflow:auto!important;}';
    document.head.appendChild(style);

    const { SidePanel } = await import('/src/ui/side-panel.ts');
    const { SocialPanel } = await import('/src/ui/panels/social-panel.ts');
    const { bindMainSocialPanelNavigation } = await import('/src/main-social-panel-navigation.ts');
    const sidePanel = new SidePanel();
    const panel = new SocialPanel();
    const openedConversations = [];
    const transitions = [];
    let partyOpenCount = 0;
    panel.setCallbacks({
      onRefresh() {}, onScanNearby() {}, onSendRequest() {}, onRespondRequest() {},
      onUpdateRelationLevel() {}, onRemoveRelation() {}, onSendMessage() {},
      onOpenConversation(playerId) { openedConversations.push(playerId); },
    });
    panel.setPartyAvailable(true);
    const now = Date.now();
    const view = {
      relations: [
        { playerId: 'friend-1', name: '青禾', level: 'dao_friend', online: true, instanceId: 'map-1', instanceName: '青云山', createdAt: now, updatedAt: now },
        { playerId: 'friend-2', name: '玄渡', level: 'close_friend', online: false, createdAt: now, updatedAt: now },
      ],
      incomingRequests: [{ requestId: 'request-1', fromPlayerId: 'asker-1', fromName: '问道者', createdAt: now }],
      outgoingRequests: [],
      nearbyCandidates: [{ playerId: 'near-1', name: '近客', distance: 2, relationLevel: null, pendingRequest: false }],
      conversations: [{ peerPlayerId: 'friend-1', unreadCount: 2 }],
    };
    panel.update(view);
    panel.mergeConversationMessages('friend-1', Array.from({ length: 32 }, (_, index) => ({
      messageId: 'message-' + index, fromPlayerId: 'friend-1', fromName: '青禾',
      toPlayerId: 'self-player', toName: '我', text: '往来消息 ' + index, sentAt: now + index,
    })));
    bindMainSocialPanelNavigation({
      documentRef: document,
      sidePanel,
      socialPanel: panel,
      openPartyPanel() { partyOpenCount += 1; sidePanel.switchTab('party'); },
    });
    sidePanel.addTabTransitionListener({
      afterTabChange(transition) { if (transition.groupId === 'right-top') transitions.push(transition); },
    });
    sidePanel.initializeTabs();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const persistedGroup = document.querySelector('[data-tab-group="right-top"]');
    const persistedRestore = {
      active: document.getElementById('pane-social-messages')?.classList.contains('active') ?? false,
      activeCount: persistedGroup?.querySelectorAll('[data-pane].active').length ?? 0,
      lifecycle: transitions.some((entry) => entry.tabName === 'social-messages' && entry.initializing === true),
      openedPeer: openedConversations.at(-1),
    };
    sidePanel.switchTab('social');
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.__socialFixedProof = { panel, sidePanel, view, openedConversations, transitions, persistedRestore, getPartyOpenCount: () => partyOpenCount };
    return true;
  })()
`;

await withClientBrowserProof(
  { viewport: MOBILE_VIEWPORT, profilePrefix: 'social-fixed-proof-' },
  async (cdp) => {
    await cdp.evaluate(fixtureExpression);
    await delay(80);

    const persistedRestore = await cdp.evaluate('window.__socialFixedProof.persistedRestore');
    assert.deepEqual(
      persistedRestore,
      { active: true, activeCount: 1, lifecycle: true, openedPeer: 'friend-1' },
      '持久化恢复未经过显式 SidePanel 初始化与统一生命周期',
    );

    const launcher = await cdp.evaluate(String.raw`
      (() => {
        const root = document.querySelector('[data-social-menu-launcher="true"]');
        const tab = document.querySelector('[data-tab="social-relations"]');
        return {
          count: root?.querySelectorAll('[data-social-menu]').length ?? 0,
          party: !!root?.querySelector('[data-social-menu="party"]'),
          unread: root?.querySelector('[data-social-menu="messages"]')?.textContent?.includes('2') ?? false,
          fixedRoots: ['party', 'social-relations', 'social-requests', 'social-nearby', 'social-messages'].filter((id) => document.querySelector('[data-pane="' + id + '"]')).length,
          tabSemantics: tab?.getAttribute('role') === 'tab' && tab.getAttribute('aria-controls') === 'pane-social-relations',
        };
      })()
    `);
    assert.deepEqual(launcher, { count: 5, party: true, unread: true, fixedRoots: 5, tabSemantics: true }, '五个固定入口、未读或公共 Tab 语义缺失');

    const openRelations = await cdp.evaluate(String.raw`
      (async () => {
        document.querySelector('[data-social-menu="relations"]')?.click();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const root = document.getElementById('pane-social-relations');
        return {
          active: root?.classList.contains('active') ?? false,
          launcherClosed: !document.getElementById('pane-social')?.classList.contains('active'),
          tabpanel: root?.getAttribute('role') === 'tabpanel',
          content: root?.textContent?.includes('青禾') ?? false,
        };
      })()
    `);
    assert.deepEqual(openRelations, { active: true, launcherClosed: true, tabpanel: true, content: true }, '道友名录未进入真实固定互斥面板');

    const globalSwitch = await cdp.evaluate(String.raw`
      (async () => {
        document.querySelector('[data-tab="social-requests"]')?.click();
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const group = document.querySelector('[data-tab-group="right-top"]');
        return {
          relationsClosed: !document.getElementById('pane-social-relations')?.classList.contains('active'),
          requestsOpen: document.getElementById('pane-social-requests')?.classList.contains('active') ?? false,
          requestVisible: document.getElementById('pane-social-requests')?.textContent?.includes('问道者') ?? false,
          activeCount: group?.querySelectorAll('[data-pane].active').length ?? 0,
        };
      })()
    `);
    assert.deepEqual(globalSwitch, { relationsClosed: true, requestsOpen: true, requestVisible: true, activeCount: 1 }, '真实 SidePanel 未保持全局互斥');

    const draftContinuity = await cdp.evaluate(String.raw`
      (async () => {
        const { panel, sidePanel, view } = window.__socialFixedProof;
        sidePanel.switchTab('social-messages');
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const input = document.querySelector('#pane-social-messages [data-social-message-input]');
        const list = document.querySelector('#pane-social-messages [data-social-conversation-peer="friend-1"]');
        if (!(input instanceof HTMLInputElement) || !(list instanceof HTMLElement)) throw new Error('私聊控件缺失');
        input.value = '保留中的私聊草稿';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
        input.setSelectionRange(3, 8, 'forward');
        list.scrollTop = 60;
        const partyTab = document.querySelector('[data-tab="party"]');
        if (!(partyTab instanceof HTMLButtonElement)) throw new Error('队伍 Tab 缺失');
        partyTab.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 71, isPrimary: true }));
        partyTab.focus();
        partyTab.click();
        panel.update(view);
        const messagesTab = document.querySelector('[data-tab="social-messages"]');
        if (!(messagesTab instanceof HTMLButtonElement)) throw new Error('私聊 Tab 缺失');
        messagesTab.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 72, isPrimary: true }));
        messagesTab.focus();
        messagesTab.click();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const restored = document.querySelector('#pane-social-messages [data-social-message-input]');
        const restoredList = document.querySelector('#pane-social-messages [data-social-conversation-peer="friend-1"]');
        return {
          draft: restored instanceof HTMLInputElement ? restored.value : '',
          selection: restored instanceof HTMLInputElement ? [restored.selectionStart, restored.selectionEnd] : [],
          focused: document.activeElement === restored,
          scrollTop: restoredList instanceof HTMLElement ? restoredList.scrollTop : -1,
          openedPeer: window.__socialFixedProof.openedConversations.at(-1),
        };
      })()
    `);
    assert.deepEqual(draftContinuity, { draft: '保留中的私聊草稿', selection: [3, 8], focused: true, scrollTop: 60, openedPeer: 'friend-1' }, '私聊→队伍→更新→私聊后草稿、选区、焦点或滚动丢失');

    const partyFocus = await cdp.evaluate(String.raw`
      (async () => {
        const { sidePanel } = window.__socialFixedProof;
        sidePanel.switchTab('social');
        await new Promise((resolve) => requestAnimationFrame(resolve));
        document.querySelector('[data-social-menu="party"]')?.click();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const entryFocus = document.activeElement?.matches('[data-party-fixed-back="true"]') ?? false;
        document.querySelector('[data-party-fixed-back="true"]')?.click();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return {
          count: window.__socialFixedProof.getPartyOpenCount(),
          entryFocus,
          returned: document.getElementById('pane-social')?.classList.contains('active') ?? false,
          returnFocus: document.activeElement === document.querySelector('[data-social-menu="party"]'),
        };
      })()
    `);
    assert.deepEqual(partyFocus, { count: 1, entryFocus: true, returned: true, returnFocus: true }, '队伍固定面板进入或返回焦点不完整');

    const keyboardNavigation = await cdp.evaluate(String.raw`
      (async () => {
        const { sidePanel } = window.__socialFixedProof;
        sidePanel.switchTab('social');
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const socialTab = document.querySelector('[data-tab="social"]');
        if (!(socialTab instanceof HTMLButtonElement)) throw new Error('道友 Tab 缺失');
        socialTab.focus();
        socialTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const partyTab = document.querySelector('[data-tab="party"]');
        const arrowActivated = document.getElementById('pane-party')?.classList.contains('active') === true
          && document.activeElement === partyTab;
        partyTab?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const marketTab = document.querySelector('[data-tab="market"]');
        const endActivated = document.getElementById('pane-market')?.classList.contains('active') === true
          && document.activeElement === marketTab;
        marketTab?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return {
          arrowActivated,
          endActivated,
          homeActivated: document.getElementById('pane-inventory')?.classList.contains('active') === true
            && document.activeElement === document.querySelector('[data-tab="inventory"]'),
        };
      })()
    `);
    assert.deepEqual(keyboardNavigation, { arrowActivated: true, endActivated: true, homeActivated: true }, '固定面板 Tab 键盘导航不符合 ARIA Tabs 行为');

    const ordinaryPanelSwitch = await cdp.evaluate(String.raw`
      (() => {
        window.__socialFixedProof.sidePanel.switchTab('inventory');
        const group = document.querySelector('[data-tab-group="right-top"]');
        return {
          inventory: document.getElementById('pane-inventory')?.classList.contains('active') ?? false,
          activeCount: group?.querySelectorAll('[data-pane].active').length ?? 0,
          lifecycleTransitions: window.__socialFixedProof.transitions.length,
        };
      })()
    `);
    assert.equal(ordinaryPanelSwitch.inventory, true, '切换普通固定面板失败');
    assert.equal(ordinaryPanelSwitch.activeCount, 1, '五入口与普通固定面板未全局互斥');
    assert.ok(ordinaryPanelSwitch.lifecycleTransitions >= 6, '真实统一切换生命周期未覆盖程序化与点击入口');
  },
);

console.log(MARKER);
