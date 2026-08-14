/**
 * ISSUE-000021：通过正式道友面板验证手机端入口、渲染与单一纵向滚动路径。
 */
import assert from 'node:assert/strict';
import { delay, withClientBrowserProof } from './browser-proof-runtime.mjs';

const MARKER = 'REPAIR_PROOF:ISSUE-000021:PASS';
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const DESKTOP_VIEWPORT = { width: 1280, height: 900 };

const fixtureExpression = String.raw`
  (async () => {
    document.getElementById('game-shell')?.classList.remove('hidden');
    document.getElementById('login-overlay')?.classList.add('hidden');

    const { SocialPanel } = await import('/src/ui/panels/social-panel.ts');
    const panel = new SocialPanel();
    const now = Date.now();
    panel.update({
      relations: Array.from({ length: 12 }, (_, index) => ({
        playerId: 'social-mobile-proof-' + index,
        name: '道友测试角色' + (index + 1),
        level: index % 2 === 0 ? 'dao_friend' : 'close_friend',
        online: index % 3 !== 0,
        instanceId: 'social-mobile-proof-instance',
        instanceName: '青云山',
        createdAt: now - index * 60_000,
        updatedAt: now - index * 30_000,
      })),
      incomingRequests: [],
      outgoingRequests: [],
      nearbyCandidates: [],
    });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.__socialMobileProofPanel = panel;

    const mobileBagButton = [...document.querySelectorAll('#mobile-ui-shell button')]
      .find((entry) => entry.textContent?.trim() === '行囊' && entry.getBoundingClientRect().width > 0);
    if (!(mobileBagButton instanceof HTMLButtonElement)) {
      throw new Error('未找到正式手机端行囊入口');
    }
    const rect = mobileBagButton.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  })()
`;

const resolveSocialEntryExpression = String.raw`
  (() => {
    const bagSection = document.querySelector('[data-mobile-section="bag"]');
    const bagPane = bagSection?.closest('.mobile-ui-pane');
    const tabBar = bagSection?.querySelector('.section-tabs');
    const button = [...(bagSection?.querySelectorAll('button') ?? [])]
      .find((entry) => entry.textContent?.trim() === '道友' && entry.getBoundingClientRect().width > 0);
    if (!(bagSection instanceof HTMLElement)
      || !(bagPane instanceof HTMLElement)
      || !(tabBar instanceof HTMLElement)
      || !(button instanceof HTMLButtonElement)) {
      throw new Error('未找到正式手机端道友入口');
    }
    const rect = button.getBoundingClientRect();
    const sectionRect = bagSection.getBoundingClientRect();
    const paneRect = bagPane.getBoundingClientRect();
    const tabBarRect = tabBar.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    return {
      x,
      y,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      hit: hit === button || button.contains(hit),
      viewport: { width: innerWidth, height: innerHeight },
      bagPane: { top: paneRect.top, bottom: paneRect.bottom, height: paneRect.height },
      bagSection: { top: sectionRect.top, bottom: sectionRect.bottom, height: sectionRect.height },
      tabBar: {
        top: tabBarRect.top,
        bottom: tabBarRect.bottom,
        height: tabBarRect.height,
        clientHeight: tabBar.clientHeight,
        scrollHeight: tabBar.scrollHeight,
      },
    };
  })()
`;

const resolveRelationsMenuExpression = String.raw`
  (() => {
    const launcher = document.querySelector('[data-social-menu-launcher="true"]');
    const button = document.querySelector('[data-social-menu="relations"]');
    if (!(launcher instanceof HTMLElement) || !(button instanceof HTMLButtonElement)) {
      throw new Error('道友功能入口卡片未渲染');
    }
    const rect = button.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      cardCount: launcher.querySelectorAll('[data-social-menu]').length,
      partyEntry: !!launcher.querySelector('[data-social-menu="party"]'),
    };
  })()
`;

const mobileMeasureExpression = String.raw`
  (() => {
    const pane = document.getElementById('pane-social');
    const body = pane?.closest('.section-body');
    const panel = pane?.querySelector('.social-panel');
    const list = pane?.querySelector('.social-panel-section--relations .ui-list');
    const rows = [...(pane?.querySelectorAll('[data-social-relation-row]') ?? [])];
    const lastRow = rows.at(-1);
    const lastAction = lastRow?.querySelector('[data-social-action="remove"]');
    if (!(pane instanceof HTMLElement)
      || !(body instanceof HTMLElement)
      || !(panel instanceof HTMLElement)
      || !(list instanceof HTMLElement)
      || !(lastRow instanceof HTMLElement)
      || !(lastAction instanceof HTMLButtonElement)) {
      throw new Error('正式道友面板结构不完整');
    }
    const bodyRect = body.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const lastRect = lastRow.getBoundingClientRect();
    const actionRect = lastAction.getBoundingClientRect();
    const actionX = actionRect.left + actionRect.width / 2;
    const actionY = actionRect.top + actionRect.height / 2;
    const actionHit = actionX >= 0 && actionX <= innerWidth && actionY >= 0 && actionY <= innerHeight
      ? document.elementFromPoint(actionX, actionY)
      : null;
    return {
      paneActive: pane.classList.contains('active'),
      rowCount: rows.length,
      body: {
        top: bodyRect.top,
        bottom: bodyRect.bottom,
        clientHeight: body.clientHeight,
        scrollHeight: body.scrollHeight,
        scrollTop: body.scrollTop,
        overflowY: getComputedStyle(body).overflowY,
      },
      panel: {
        top: panelRect.top,
        bottom: panelRect.bottom,
        height: panelRect.height,
      },
      list: {
        top: listRect.top,
        bottom: listRect.bottom,
        clientHeight: list.clientHeight,
        scrollHeight: list.scrollHeight,
        scrollTop: list.scrollTop,
        overflowY: getComputedStyle(list).overflowY,
      },
      last: {
        top: lastRect.top,
        bottom: lastRect.bottom,
        visibleInBody: lastRect.top >= bodyRect.top && lastRect.bottom <= bodyRect.bottom,
      },
      lastAction: {
        top: actionRect.top,
        bottom: actionRect.bottom,
        hit: actionHit === lastAction || lastAction.contains(actionHit),
      },
      scrollPoint: {
        x: Math.max(listRect.left + 2, Math.min(listRect.right - 2, listRect.left + listRect.width / 2)),
        y: Math.max(bodyRect.top + 2, Math.min(bodyRect.bottom - 2, listRect.top + 12)),
      },
    };
  })()
`;

const desktopMeasureExpression = String.raw`
  (() => {
    const pane = document.getElementById('pane-social');
    const body = pane?.closest('.section-body');
    const list = pane?.querySelector('.social-panel-section--relations .ui-list');
    const bagSection = document.querySelector('[data-mobile-section="bag"]');
    if (!(pane instanceof HTMLElement) || !(body instanceof HTMLElement) || !(list instanceof HTMLElement)) {
      throw new Error('桌面道友面板结构不完整');
    }
    return {
      bagMountedInMobile: bagSection?.parentElement?.classList.contains('mobile-ui-pane') ?? false,
      paneActive: pane.classList.contains('active'),
      bodyOverflowY: getComputedStyle(body).overflowY,
      listOverflowY: getComputedStyle(list).overflowY,
      listClientHeight: list.clientHeight,
      listScrollHeight: list.scrollHeight,
    };
  })()
`;

function dispatchClick(cdp, point) {
  return Promise.all([
    cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: point.x,
      y: point.y,
      button: 'left',
      clickCount: 1,
    }),
    cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: point.x,
      y: point.y,
      button: 'left',
      clickCount: 1,
    }),
  ]);
}

await withClientBrowserProof(
  { viewport: MOBILE_VIEWPORT, profilePrefix: 'social-mobile-proof-' },
  async (cdp) => {
    const bagEntry = await cdp.evaluate(fixtureExpression);
    await dispatchClick(cdp, bagEntry);
    await delay(100);

    const socialEntry = await cdp.evaluate(resolveSocialEntryExpression);
    const socialEntryGeometry = JSON.stringify(socialEntry);
    assert(
      socialEntry.left >= 0 && socialEntry.right <= MOBILE_VIEWPORT.width,
      `手机端道友入口横向超出视口：${socialEntryGeometry}`,
    );
    assert(
      socialEntry.top >= 0 && socialEntry.bottom <= MOBILE_VIEWPORT.height,
      `手机端道友入口纵向超出视口：${socialEntryGeometry}`,
    );
    assert.equal(socialEntry.hit, true, '手机端道友入口被其他界面遮挡');
    await dispatchClick(cdp, socialEntry);
    await delay(100);

    const relationsMenuEntry = await cdp.evaluate(resolveRelationsMenuExpression);
    assert.equal(relationsMenuEntry.cardCount, 5, '道友面板未渲染五个独立功能入口');
    assert.equal(relationsMenuEntry.partyEntry, true, '道友面板缺少队伍悬浮窗入口');
    await dispatchClick(cdp, relationsMenuEntry);
    await delay(100);

    const focusAfterMenuOpen = await cdp.evaluate(String.raw`
      (() => ({
        closeFocused: document.activeElement?.getAttribute('data-social-action') === 'menu-close',
        menuControls: document.querySelector('[data-social-menu="relations"]')?.getAttribute('aria-controls'),
        closeControls: document.querySelector('[data-social-action="menu-close"]')?.getAttribute('aria-controls'),
      }))()
    `);
    assert.equal(focusAfterMenuOpen.closeFocused, true, '打开道友子菜单后焦点未迁移到返回按钮');
    assert.equal(focusAfterMenuOpen.menuControls, 'social-menu-shell', '道友入口缺少子菜单 aria-controls');
    assert.equal(focusAfterMenuOpen.closeControls, 'social-menu-launcher', '返回按钮缺少入口 aria-controls');

    const initial = await cdp.evaluate(mobileMeasureExpression);
    assert.equal(initial.paneActive, true, '点击手机端道友入口后未激活正式面板');
    assert.equal(initial.rowCount, 12, '服务端视图未完整进入正式道友列表渲染');
    assert.equal(initial.body.overflowY, 'auto', '手机端道友面板外层必须承担纵向滚动');
    assert(initial.body.scrollHeight > initial.body.clientHeight + 1, '手机端道友内容未形成外层滚动范围');
    assert.equal(initial.list.overflowY, 'visible', '手机端道友列表不应抢占外层滚动手势');
    assert.equal(initial.list.scrollHeight, initial.list.clientHeight, '手机端道友列表仍存在独立滚动范围');

    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: initial.scrollPoint.x,
      y: initial.scrollPoint.y,
      deltaX: 0,
      deltaY: 600,
    });
    await delay(150);
    const scrolled = await cdp.evaluate(mobileMeasureExpression);
    assert(scrolled.body.scrollTop > 0, '道友列表上的触控等价滚动未推进可见外层');
    assert.equal(scrolled.list.scrollTop, 0, '手机端道友列表仍在内部消耗滚动手势');

    await cdp.evaluate(`
      (() => {
        const pane = document.getElementById('pane-social');
        const body = pane?.closest('.section-body');
        if (!(body instanceof HTMLElement)) throw new Error('未找到道友面板外层');
        body.scrollTop = body.scrollHeight;
      })()
    `);
    await delay(50);
    const bottom = await cdp.evaluate(mobileMeasureExpression);
    assert.equal(bottom.last.visibleInBody, true, '滚动到底后最后一位道友仍不可见');
    assert.equal(bottom.lastAction.hit, true, '滚动到底后最后一位道友操作仍不可命中');

    await cdp.evaluate(`document.documentElement.dataset.colorMode = 'dark'`);
    await delay(50);
    const dark = await cdp.evaluate(mobileMeasureExpression);
    assert.equal(dark.rowCount, 12, '深色模式切换后道友列表内容丢失');
    assert.equal(dark.last.visibleInBody, true, '深色模式下道友列表底部不可达');

    await cdp.evaluate(`document.documentElement.dataset.colorMode = 'light'`);

    const menuContinuity = await cdp.evaluate(String.raw`
      (async () => {
        const panel = window.__socialMobileProofPanel;
        const pane = document.getElementById('pane-social');
        const body = pane?.closest('.section-body');
        if (!(pane instanceof HTMLElement) || !(body instanceof HTMLElement)) {
          throw new Error('道友菜单连续性 proof 缺少容器');
        }
        const mobilePane = pane.closest('.mobile-ui-pane');
        if (mobilePane instanceof HTMLElement) {
          for (const entry of mobilePane.parentElement?.querySelectorAll('.mobile-ui-pane.active') ?? []) {
            entry.classList.remove('active');
          }
          mobilePane.classList.add('active');
        }
        const waitFrames = (count) => new Promise((resolve) => {
          const next = () => count-- <= 0 ? resolve() : requestAnimationFrame(next);
          requestAnimationFrame(next);
        });
        await waitFrames(2);
        panel.closeActiveMenu();
        await waitFrames(5);
        const focusReturned = document.activeElement?.getAttribute('data-social-menu') === 'relations';
        const launcherVisible = pane.querySelector('[data-social-menu-launcher="true"]')?.hidden === false;
        const launcherScrollTop = body.scrollTop;
        pane.querySelector('[data-social-menu="messages"]')?.click();
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const peerId = 'social-mobile-proof-0';
        for (let index = 0; index < 48; index += 1) {
          panel.appendMessage({
            messageId: 'continuity-' + index, fromPlayerId: peerId, toPlayerId: 'self-player',
            text: '滚动连续性消息 ' + index, sentAt: Date.now() + index,
          }, 'self-player');
        }
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const root = pane.querySelector('[data-social-conversation-peer="' + peerId + '"]');
        const input = root?.querySelector('[data-social-message-input]');
        if (!(root instanceof HTMLElement) || !(input instanceof HTMLInputElement)) {
          throw new Error('私聊连续性 proof 缺少会话 DOM');
        }
        input.value = '尚未发送的私聊草稿';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const scrollContainer = root.scrollHeight > root.clientHeight + 1 ? root : body;
        const scrollContainerKind = scrollContainer === root ? 'messages' : 'pane';
        const scrollRange = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
        scrollContainer.scrollTop = Math.max(1, Math.floor(scrollRange / 2));
        const savedScrollTop = scrollContainer.scrollTop;
        panel.closeActiveMenu();
        await waitFrames(5);
        const focusReturnedFromMessages = document.activeElement?.getAttribute('data-social-menu') === 'messages';
        const hiddenRoot = pane.querySelector('[data-social-conversation-peer="' + peerId + '"]');
        const hiddenRowCount = hiddenRoot?.querySelectorAll('[data-social-message-id]').length ?? -1;
        panel.appendMessage({
          messageId: 'continuity-hidden', fromPlayerId: peerId, toPlayerId: 'self-player',
          text: '菜单隐藏期间收到的消息', sentAt: Date.now() + 1000,
        }, 'self-player');
        const hiddenDomUntouched = (hiddenRoot?.querySelectorAll('[data-social-message-id]').length ?? -2) === hiddenRowCount;
        pane.querySelector('[data-social-menu="messages"]')?.click();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const restoredRoot = pane.querySelector('[data-social-conversation-peer="' + peerId + '"]');
        const restoredInput = restoredRoot?.querySelector('[data-social-message-input]');
        const restoredContainer = restoredRoot && restoredRoot.scrollHeight > restoredRoot.clientHeight + 1 ? restoredRoot : body;
        const restoredContainerKind = restoredContainer === restoredRoot ? 'messages' : 'pane';
        const restoredScrollTop = restoredContainer.scrollTop;
        const focusOnReturn = document.activeElement?.getAttribute('data-social-action') === 'menu-close';
        panel.closeActiveMenu();
        pane.querySelector('[data-social-menu="relations"]')?.click();
        return {
          focusReturned, launcherVisible, launcherScrollTop, focusReturnedFromMessages, hiddenDomUntouched,
          draftRestored: restoredInput?.value === '尚未发送的私聊草稿',
          scrollRestored: savedScrollTop <= 1 || (scrollContainerKind === restoredContainerKind && Math.abs(restoredScrollTop - savedScrollTop) <= 8),
          scrollDebug: {
            savedScrollTop, restoredScrollTop, scrollRange, scrollContainerKind, restoredContainerKind,
            restoredScrollRange: Math.max(0, restoredContainer.scrollHeight - restoredContainer.clientHeight),
            mobilePaneActive: pane.closest('.mobile-ui-pane')?.classList.contains('active') ?? null,
          },
          focusOnReturn, hiddenMessageVisible: restoredRoot?.textContent.includes('菜单隐藏期间收到的消息') === true,
        };
      })()
    `);
    assert.equal(menuContinuity.focusReturned, true, '返回入口页后焦点未回到原入口卡片');
    assert.equal(menuContinuity.launcherVisible, true, '返回后道友入口页未显示');
    assert(menuContinuity.launcherScrollTop <= 1, '入口页继承了子菜单的深滚动位置');
    assert.equal(menuContinuity.focusReturnedFromMessages, true, '关闭私聊后焦点未回到私聊入口');
    assert.equal(menuContinuity.hiddenDomUntouched, true, '私聊菜单隐藏期间仍重建了隐藏 DOM');
    assert.equal(menuContinuity.draftRestored, true, '私聊菜单重开后草稿丢失');
    assert.equal(menuContinuity.scrollRestored, true, `私聊菜单重开后滚动位置丢失：${JSON.stringify(menuContinuity.scrollDebug)}`);
    assert.equal(menuContinuity.focusOnReturn, true, '重开私聊后焦点未迁移到返回按钮');
    assert.equal(menuContinuity.hiddenMessageVisible, true, '私聊菜单重开后未呈现隐藏期间收到的消息');

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: DESKTOP_VIEWPORT.width,
      height: DESKTOP_VIEWPORT.height,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: DESKTOP_VIEWPORT.width,
      screenHeight: DESKTOP_VIEWPORT.height,
    });
    await delay(150);
    const desktop = await cdp.evaluate(desktopMeasureExpression);
    assert.equal(desktop.bagMountedInMobile, false, '桌面宽度恢复后行囊区域仍滞留手机容器');
    assert.equal(desktop.paneActive, true, '桌面宽度恢复后道友面板激活态丢失');
    assert.equal(desktop.listOverflowY, 'auto', '桌面道友列表未保留独立滚动');
    assert(desktop.listScrollHeight > desktop.listClientHeight, '桌面道友长列表未形成独立滚动范围');
  },
);

console.log(MARKER);
