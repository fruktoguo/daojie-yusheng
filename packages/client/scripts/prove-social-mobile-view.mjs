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
    const button = [...(bagSection?.querySelectorAll('button') ?? [])]
      .find((entry) => entry.textContent?.trim() === '道友' && entry.getBoundingClientRect().width > 0);
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error('未找到正式手机端道友入口');
    }
    const rect = button.getBoundingClientRect();
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
    assert(socialEntry.left >= 0 && socialEntry.right <= MOBILE_VIEWPORT.width, '手机端道友入口横向超出视口');
    assert(socialEntry.top >= 0 && socialEntry.bottom <= MOBILE_VIEWPORT.height, '手机端道友入口纵向超出视口');
    assert.equal(socialEntry.hit, true, '手机端道友入口被其他界面遮挡');
    await dispatchClick(cdp, socialEntry);
    await delay(100);

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
