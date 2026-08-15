/** 道友启动器 proof：验证右侧五按钮、固定尺寸独立面板、全局互斥与私聊连续性。 */
import assert from 'node:assert/strict';
import { delay, withClientBrowserProof } from './browser-proof-runtime.mjs';

const MARKER = 'REPAIR_PROOF:ISSUE-000021:PASS';
const VIEWPORT = { width: 1280, height: 900 };

const fixtureExpression = String.raw`
  (async () => {
    document.getElementById('game-shell')?.classList.remove('hidden');
    document.getElementById('login-overlay')?.classList.add('hidden');
    for (const selector of ['#floating-party-panel', '[id^="floating-social-"]']) {
      document.querySelectorAll(selector).forEach((node) => node.remove());
    }
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
    const partyPanel = new PartyPanel();
    const partyWorkspace = new PartyWorkspacePanel(partyPanel);
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
      messageId: 'message-' + index,
      fromPlayerId: 'friend-1',
      fromName: '青衡',
      toPlayerId: 'self-player',
      text: '第 ' + (index + 1) + ' 条用于滚动恢复验证的长消息',
      sentAt: index + 1,
    })));
    window.__socialProof = { pane, socialPanel, partyWorkspace };
    return true;
  })()
`;

await withClientBrowserProof(
  { viewport: VIEWPORT, profilePrefix: 'social-launcher-proof-' },
  async (cdp) => {
    await cdp.evaluate(fixtureExpression);
    await delay(60);

    const launcher = await cdp.evaluate(String.raw`
      (() => {
        const { pane } = window.__socialProof;
        const cards = Array.from(pane.querySelectorAll('[data-social-menu]'));
        return {
          cardCount: cards.length,
          labels: cards.map((card) => card.textContent.trim()),
          directRightTabs: document.querySelectorAll('.social-feature-tab').length,
          embeddedFeaturePanes: document.querySelectorAll('#pane-party, [id^="pane-social-"]').length,
        };
      })()
    `);
    assert.equal(launcher.cardCount, 5, '道友面板不是五按钮启动器');
    assert.equal(launcher.labels.some((label) => label.includes('队伍')), true, '缺少队伍按钮');
    assert.equal(launcher.labels.some((label) => label.includes('道友名录')), true, '缺少道友名录按钮');
    assert.equal(launcher.labels.some((label) => label.includes('道友申请')), true, '缺少道友申请按钮');
    assert.equal(launcher.labels.some((label) => label.includes('附近修士')), true, '缺少附近修士按钮');
    assert.equal(launcher.labels.some((label) => label.includes('私聊')), true, '缺少私聊按钮');
    assert.equal(launcher.directRightTabs, 0, '五项仍被错误放进右侧 Tab');
    assert.equal(launcher.embeddedFeaturePanes, 0, '五项仍存在右侧内嵌内容面板');

    const mutual = await cdp.evaluate(String.raw`
      (async () => {
        const { pane } = window.__socialProof;
        const roots = () => Array.from(document.querySelectorAll('#floating-party-panel, [id^="floating-social-"]'));
        const state = () => {
          const openRoot = roots().find((root) => !root.hidden);
          const rect = openRoot?.getBoundingClientRect();
          return {
            openCount: roots().filter((root) => !root.hidden).length,
            openId: openRoot?.id ?? null,
            width: rect?.width ?? 0,
            height: rect?.height ?? 0,
            bounded: !!rect && rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
          };
        };
        pane.querySelector('[data-social-tab="relations"]')?.click();
        const relations = state();
        pane.querySelector('[data-social-tab="requests"]')?.click();
        const requests = state();
        pane.querySelector('[data-social-action="party"]')?.click();
        const party = state();
        pane.querySelector('[data-social-tab="nearby"]')?.click();
        const nearby = state();
        const fixedSizes = roots().every((root) => (
          root.style.getPropertyValue('--floating-list-panel-width') === '800px'
          && root.style.getPropertyValue('--floating-list-panel-height') === '450px'
        ));
        return { relations, requests, party, nearby, fixedSizes };
      })()
    `);
    assert.equal(mutual.relations.openCount, 1, '名录独立面板未正确打开');
    assert.equal(mutual.relations.openId, 'floating-social-relations', '名录独立面板 ID 不正确');
    assert.equal(mutual.requests.openCount, 1, '申请面板未关闭名录面板');
    assert.equal(mutual.requests.openId, 'floating-social-requests', '申请独立面板 ID 不正确');
    assert.equal(mutual.party.openCount, 1, '队伍面板未与道友子面板互斥');
    assert.equal(mutual.party.openId, 'floating-party-panel', '队伍独立面板 ID 不正确');
    assert.equal(mutual.nearby.openCount, 1, '附近面板未关闭队伍面板');
    assert.equal(mutual.nearby.openId, 'floating-social-nearby', '附近独立面板 ID 不正确');
    for (const panelState of [mutual.relations, mutual.requests, mutual.party, mutual.nearby]) {
      assert.equal(Math.abs(panelState.width - 800) <= 1, true, '桌面独立面板实际宽度不是 800px');
      assert.equal(Math.abs(panelState.height - 450) <= 1, true, '桌面独立面板实际高度不是 450px');
      assert.equal(panelState.bounded, true, '桌面独立面板越出视口');
    }
    assert.equal(mutual.fixedSizes, true, '五个独立面板未统一声明为 800×450');

    const continuity = await cdp.evaluate(String.raw`
      (async () => {
        const { pane } = window.__socialProof;
        const messagesButton = pane.querySelector('[data-social-tab="messages"]');
        messagesButton?.click();
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const messagesRoot = document.getElementById('floating-social-messages');
        let input = messagesRoot?.querySelector('[data-social-message-input]');
        const scrollBody = messagesRoot?.querySelector('[data-floating-list-body="true"]');
        if (!(input instanceof HTMLInputElement) || !(scrollBody instanceof HTMLElement)) throw new Error('私聊工作区未挂载');
        const unreadBefore = pane.querySelector('[data-social-tab-unread="true"]')?.textContent?.trim() === '7';
        input.value = '初版草稿';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
        input.setSelectionRange(1, 3, 'forward');

        messagesButton?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
        messagesButton?.focus();
        messagesButton?.click();
        input = messagesRoot?.querySelector('[data-social-message-input]');
        if (!(input instanceof HTMLInputElement)) throw new Error('同 Tab 激活后私聊输入框丢失');
        input.value = '修订后的未发送草稿';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
        input.setSelectionRange(2, 7, 'forward');
        scrollBody.scrollTop = scrollBody.scrollHeight;
        const latestScrollTop = scrollBody.scrollTop;

        const partyButton = pane.querySelector('[data-social-action="party"]');
        partyButton?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 2 }));
        partyButton?.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 2 }));
        input.focus();
        input.setSelectionRange(3, 8, 'forward');
        scrollBody.scrollTop = latestScrollTop;

        partyButton?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 3 }));
        partyButton?.focus();
        partyButton?.click();
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const partyFocused = document.activeElement === document.querySelector('#floating-party-panel [data-floating-list-close="true"]');
        messagesButton?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 4 }));
        messagesButton?.focus();
        messagesButton?.click();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const restored = document.querySelector('#floating-social-messages [data-social-message-input]');
        const restoredBody = document.querySelector('#floating-social-messages [data-floating-list-body="true"]');
        const draftKept = restored instanceof HTMLInputElement && restored.value === '修订后的未发送草稿';
        const selectionKept = restored instanceof HTMLInputElement && restored.selectionStart === 3 && restored.selectionEnd === 8;
        const scrollKept = restoredBody instanceof HTMLElement && Math.abs(restoredBody.scrollTop - latestScrollTop) <= 2;
        const messagesRect = messagesRoot?.getBoundingClientRect();
        document.querySelector('#floating-social-messages [data-floating-list-close="true"]')?.click();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return {
          unreadBefore, draftKept, selectionKept, scrollKept, partyFocused,
          messagesSized: !!messagesRect && Math.abs(messagesRect.width - 800) <= 1 && Math.abs(messagesRect.height - 450) <= 1,
          focusReturned: document.activeElement === messagesButton,
          allClosed: Array.from(document.querySelectorAll('#floating-party-panel, [id^="floating-social-"]')).every((root) => root.hidden),
        };
      })()
    `);
    assert.equal(continuity.unreadBefore, true, '私聊启动按钮未保留服务端未读数');
    assert.equal(continuity.draftKept, true, '同 Tab/取消激活后切换独立面板丢失最新草稿');
    assert.equal(continuity.selectionKept, true, '同 Tab/取消激活后恢复了陈旧选区');
    assert.equal(continuity.scrollKept, true, '同 Tab/取消激活后恢复了陈旧滚动位置');
    assert.equal(continuity.partyFocused, true, '打开队伍独立面板后焦点未迁入可见面板');
    assert.equal(continuity.messagesSized, true, '私聊独立面板实际尺寸不是 800×450');
    assert.equal(continuity.focusReturned, true, '关闭独立面板后焦点未返回真实入口');
    assert.equal(continuity.allClosed, true, '关闭当前独立面板后仍有其它五项面板显示');

  },
);

await withClientBrowserProof(
  { viewport: { width: 390, height: 740 }, profilePrefix: 'social-launcher-narrow-proof-' },
  async (cdp) => {
    await cdp.evaluate(fixtureExpression);
    await delay(60);
    const narrow = await cdp.evaluate(String.raw`
      (async () => {
        const { pane } = window.__socialProof;
        const readRect = (selector) => {
          const root = document.querySelector(selector);
          const rect = root?.getBoundingClientRect();
          return rect ? {
            width: rect.width, height: rect.height,
            bounded: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
          } : null;
        };
        pane.querySelector('[data-social-tab="relations"]')?.click();
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const relations = readRect('#floating-social-relations');
        pane.querySelector('[data-social-action="party"]')?.click();
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const party = readRect('#floating-party-panel');
        return { relations, party };
      })()
    `);
    for (const panelRect of [narrow.relations, narrow.party]) {
      assert.equal(panelRect?.bounded, true, '窄屏独立面板越出安全视口');
      assert.equal((panelRect?.width ?? 800) < 800, true, '窄屏独立面板未降级为视口安全宽度');
      assert.equal((panelRect?.height ?? 450) <= 724, true, '窄屏独立面板未降级为视口安全高度');
    }
  },
);

console.log(MARKER);
