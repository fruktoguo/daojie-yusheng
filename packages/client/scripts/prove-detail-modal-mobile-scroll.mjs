/**
 * 手机端详情弹层滚动可达性 proof。
 *
 * 通过正式 ActionPanel 和 detailModalHost 验证固定高度弹层在窄屏下存在连续的纵向滚动路径。
 */
import assert from 'node:assert/strict';
import { delay, withClientBrowserProof } from './browser-proof-runtime.mjs';

const VIEWPORT = { width: 390, height: 844 };
const SHORT_VIEWPORT = { width: 390, height: 640 };
const BODY_CONSTRAINED_VARIANTS = [
  'detail-modal--inventory-bulk-discard',
  'detail-modal--attr-special',
  'detail-modal--technique',
  'detail-modal--technique-generation',
  'detail-modal--market',
  'detail-modal--skill-management',
  'detail-modal--sect-management',
  'detail-modal--skill-preset',
  'detail-modal--targeting-plan',
  'detail-modal--combat-settings',
  'detail-modal--leaderboard',
  'detail-modal--tutorial',
  'detail-modal--mail',
  'detail-modal--craft',
  'detail-modal--alchemy',
  'detail-modal--enhancement',
  'detail-modal--auto-pill-picker',
  'detail-modal--auto-pill-condition',
];

function buildMeasureExpression(targetSelector) {
  return String.raw`
    (() => {
      const card = document.getElementById('detail-modal-card');
      const body = document.getElementById('detail-modal-body');
      const target = document.querySelector(${JSON.stringify(targetSelector)});
      if (!(card instanceof HTMLElement)
        || !(body instanceof HTMLElement)
        || !(target instanceof HTMLElement)) {
        throw new Error('详情弹层滚动 proof 结构不完整');
      }
      const bodyRect = body.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      let scrollHost = null;
      let current = target.parentElement;
      while (current instanceof HTMLElement) {
        const overflowY = getComputedStyle(current).overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll')
          && current.scrollHeight > current.clientHeight + 1) {
          scrollHost = current;
          break;
        }
        if (current === body) break;
        current = current.parentElement;
      }
      return {
        viewportHeight: innerHeight,
        cardTop: cardRect.top,
        cardBottom: cardRect.bottom,
        cardOverflowY: getComputedStyle(card).overflowY,
        bodyOverflowY: getComputedStyle(body).overflowY,
        bodyClientHeight: body.clientHeight,
        bodyScrollHeight: body.scrollHeight,
        bodyScrollTop: body.scrollTop,
        targetTop: targetRect.top,
        targetBottom: targetRect.bottom,
        targetVisible: targetRect.top >= bodyRect.top - 1 && targetRect.bottom <= bodyRect.bottom + 1,
        scrollHostFound: scrollHost instanceof HTMLElement,
        scrollHostLabel: scrollHost instanceof HTMLElement
          ? (scrollHost.id || scrollHost.className || scrollHost.tagName)
          : '',
        scrollHostClientHeight: scrollHost instanceof HTMLElement ? scrollHost.clientHeight : 0,
        scrollHostScrollHeight: scrollHost instanceof HTMLElement ? scrollHost.scrollHeight : 0,
        horizontalOverflow: card.scrollWidth > card.clientWidth + 1,
      };
    })()
  `;
}

function buildScrollExpression(targetSelector) {
  return String.raw`
    (() => {
      const body = document.getElementById('detail-modal-body');
      const target = document.querySelector(${JSON.stringify(targetSelector)});
      if (!(body instanceof HTMLElement) || !(target instanceof HTMLElement)) {
        throw new Error('详情弹层滚动目标不存在');
      }
      let current = target.parentElement;
      while (current instanceof HTMLElement) {
        const overflowY = getComputedStyle(current).overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll')
          && current.scrollHeight > current.clientHeight + 1) {
          current.scrollTop = current.scrollHeight;
          return true;
        }
        if (current === body) break;
        current = current.parentElement;
      }
      return false;
    })()
  `;
}

const measureSkillPresetLayoutExpression = String.raw`
  (() => {
    const card = document.getElementById('detail-modal-card');
    const body = document.getElementById('detail-modal-body');
    const hero = document.querySelector('.skill-preset-hero');
    const layout = document.querySelector('.skill-preset-layout');
    const heroCards = Array.from(document.querySelectorAll('.skill-preset-hero > .skill-preset-card'));
    const layoutCards = Array.from(document.querySelectorAll('.skill-preset-layout > *'));
    const cards = [...heroCards, ...layoutCards];
    const buttons = Array.from(document.querySelectorAll('.skill-preset-shell .small-btn'));
    if (!(card instanceof HTMLElement)
      || !(body instanceof HTMLElement)
      || !(hero instanceof HTMLElement)
      || !(layout instanceof HTMLElement)
      || heroCards.some((item) => !(item instanceof HTMLElement))
      || layoutCards.some((item) => !(item instanceof HTMLElement))
      || buttons.some((item) => !(item instanceof HTMLElement))) {
      throw new Error('技能方案移动端布局 proof 结构不完整');
    }
    const heroRect = hero.getBoundingClientRect();
    const layoutRect = layout.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    const getGap = (items) => {
      if (items.length < 2) return Number.POSITIVE_INFINITY;
      return items[1].getBoundingClientRect().top - items[0].getBoundingClientRect().bottom;
    };
    const overflowingCards = cards
      .filter((item) => item.scrollHeight > item.clientHeight + 1)
      .map((item) => item.className);
    const childOverflowCards = cards
      .filter((item) => {
        const itemRect = item.getBoundingClientRect();
        return Array.from(item.children).some((child) => child.getBoundingClientRect().bottom > itemRect.bottom + 1);
      })
      .map((item) => item.className);
    const buttonRects = buttons.map((button) => button.getBoundingClientRect());
    return {
      cardZoom: Number.parseFloat(getComputedStyle(card).zoom || '1'),
      heroLayoutGap: layoutRect.top - heroRect.bottom,
      heroCardGap: getGap(heroCards),
      layoutCardGap: getGap(layoutCards),
      overflowingCards,
      childOverflowCards,
      minButtonHeight: Math.min(...buttonRects.map((rect) => rect.height)),
      buttonsOutsideBody: buttonRects.filter((rect) => rect.left < bodyRect.left - 1 || rect.right > bodyRect.right + 1).length,
    };
  })()
`;

function assertSkillPresetLayout(layout, label) {
  assert.equal(layout.cardZoom, 1, `${label}不应通过 zoom 压缩触控界面：${JSON.stringify(layout)}`);
  assert(layout.heroLayoutGap >= -1, `${label}顶部卡片与下方布局发生重叠：${JSON.stringify(layout)}`);
  assert(layout.heroCardGap >= -1, `${label}顶部两张卡片发生重叠：${JSON.stringify(layout)}`);
  assert(layout.layoutCardGap >= -1, `${label}列表与导入卡片发生重叠：${JSON.stringify(layout)}`);
  assert.deepEqual(layout.overflowingCards, [], `${label}卡片内容超出自身高度：${JSON.stringify(layout)}`);
  assert.deepEqual(layout.childOverflowCards, [], `${label}卡片子内容越过边界：${JSON.stringify(layout)}`);
  assert(layout.minButtonHeight >= 43.5, `${label}按钮实际触控高度不足 44px：${JSON.stringify(layout)}`);
  assert.equal(layout.buttonsOutsideBody, 0, `${label}按钮超出正文横向边界：${JSON.stringify(layout)}`);
}

async function assertTargetReachable(cdp, { label, targetSelector, requireScroll = true }) {
  const initial = await cdp.evaluate(buildMeasureExpression(targetSelector));
  assert(initial.cardTop >= 0 && initial.cardBottom <= initial.viewportHeight, `${label}弹层超出手机安全视口`);
  assert.equal(initial.horizontalOverflow, false, `${label}弹层出现横向溢出`);
  if (initial.targetVisible && !requireScroll) {
    return initial;
  }
  assert.equal(
    initial.scrollHostFound,
    true,
    `${label}底部内容不可见且没有纵向滚动容器：${JSON.stringify(initial)}`,
  );
  assert(
    initial.scrollHostScrollHeight > initial.scrollHostClientHeight + 1,
    `${label}滚动容器没有形成有效滚动范围`,
  );
  assert.equal(await cdp.evaluate(buildScrollExpression(targetSelector)), true, `${label}未找到可推进的滚动容器`);
  await delay(80);
  const scrolled = await cdp.evaluate(buildMeasureExpression(targetSelector));
  assert.equal(scrolled.targetVisible, true, `${label}滚动到底后底部内容仍不可达`);
  return scrolled;
}

const initializeActionPanelExpression = String.raw`
  (async () => {
    const { ActionPanel } = await import('/src/ui/panels/action-panel.ts');
    const panel = new ActionPanel();
    panel.skillPresets = Array.from({ length: 12 }, (_, index) => ({
      id: 'mobile-scroll-preset-' + index,
      name: '手机方案 ' + (index + 1),
      skills: [{ skillId: 'proof-skill-' + index, enabled: index % 2 === 0, skillEnabled: true }],
    }));
    panel.selectedSkillPresetId = panel.skillPresets[0].id;
    window.__detailModalMobileScrollPanel = panel;
    return {
      hasCombatSettings: Boolean(panel.combatSettings),
      hasSkillManagement: Boolean(panel.skillMgmt),
    };
  })()
`;

const openTargetingPlanExpression = String.raw`
  (async () => {
    window.__detailModalMobileScrollPanel.combatSettings.openTargetingPlanModal();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return document.getElementById('detail-modal-title')?.textContent?.trim() ?? '';
  })()
`;

const openSkillPresetExpression = String.raw`
  (async () => {
    window.__detailModalMobileScrollPanel.skillMgmt.openSkillPresetModal();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return document.getElementById('detail-modal-title')?.textContent?.trim() ?? '';
  })()
`;

const openEmptySkillPresetExpression = String.raw`
  (async () => {
    const panel = window.__detailModalMobileScrollPanel;
    panel.skillPresets = [];
    panel.selectedSkillPresetId = null;
    panel.skillPresetNameDraft = '';
    panel.skillPresetImportText = '';
    panel.skillMgmt.openSkillPresetModal();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return document.getElementById('detail-modal-title')?.textContent?.trim() ?? '';
  })()
`;

const openCombatSettingsExpression = String.raw`
  (async () => {
    window.__detailModalMobileScrollPanel.combatSettings.openCombatSettingsModal();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return document.getElementById('detail-modal-title')?.textContent?.trim() ?? '';
  })()
`;

function buildOpenFallbackVariantExpression(variant) {
  return String.raw`
    (async () => {
      const { detailModalHost } = await import('/src/ui/detail-modal-host.ts');
      detailModalHost.open({
        ownerId: 'mobile-scroll-proof-' + ${JSON.stringify(variant)},
        variantClass: ${JSON.stringify(variant)},
        title: '移动端滚动检查',
        bodyHtml: '<div class="ui-list">'
          + Array.from({ length: 60 }, (_, index) => '<div class="ui-list-row" data-modal-proof-row="' + index + '"><span>检查项 ' + (index + 1) + '</span></div>').join('')
          + '</div>',
      });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return document.getElementById('detail-modal-card')?.className ?? '';
    })()
  `;
}

await withClientBrowserProof({ viewport: VIEWPORT, profilePrefix: 'detail-modal-mobile-scroll-proof-' }, async (cdp) => {
  const initialized = await cdp.evaluate(initializeActionPanelExpression);
  assert.equal(initialized.hasCombatSettings, true, '未加载正式战斗设置子面板');
  assert.equal(initialized.hasSkillManagement, true, '未加载正式技能方案子面板');

  assert.equal(await cdp.evaluate(openTargetingPlanExpression), '索敌方案', '未打开正式索敌方案弹层');
  await assertTargetReachable(cdp, {
    label: '索敌方案',
    targetSelector: '[data-targeting-plan-mode]:last-of-type',
  });

  assert.equal(await cdp.evaluate(openSkillPresetExpression), '技能方案', '未打开正式技能方案弹层');
  await assertTargetReachable(cdp, {
    label: '技能方案',
    targetSelector: '[data-skill-preset-import-clear]',
  });

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: SHORT_VIEWPORT.width,
    height: SHORT_VIEWPORT.height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: SHORT_VIEWPORT.width,
    screenHeight: SHORT_VIEWPORT.height,
  });
  await delay(50);
  assert.equal(await cdp.evaluate(openEmptySkillPresetExpression), '技能方案', '未打开短视口空技能方案弹层');
  assertSkillPresetLayout(await cdp.evaluate(measureSkillPresetLayoutExpression), '短视口技能方案');
  await cdp.evaluate(`document.documentElement.dataset.colorMode = 'dark'`);
  await delay(50);
  assertSkillPresetLayout(await cdp.evaluate(measureSkillPresetLayoutExpression), '短视口深色技能方案');
  await cdp.evaluate(`document.documentElement.dataset.colorMode = 'light'`);
  await delay(50);
  await assertTargetReachable(cdp, {
    label: '短视口技能方案',
    targetSelector: '[data-skill-preset-import-clear]',
  });
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: VIEWPORT.width,
    screenHeight: VIEWPORT.height,
  });
  await delay(50);

  assert.equal(await cdp.evaluate(openCombatSettingsExpression), '战斗设置', '未打开正式战斗设置弹层');
  const combatSettings = await assertTargetReachable(cdp, {
    label: '战斗设置',
    targetSelector: '[data-auto-pill-open-slot-conditions="7"]',
  });
  assert.match(combatSettings.scrollHostLabel, /auto-pill-slot-grid/, '战斗设置应保留内部列表滚动路径');

  for (const variant of BODY_CONSTRAINED_VARIANTS) {
    const cardClass = await cdp.evaluate(buildOpenFallbackVariantExpression(variant));
    assert.match(cardClass, new RegExp(`\\b${variant}\\b`), `${variant} 未应用到正式弹层卡片`);
    await assertTargetReachable(cdp, {
      label: variant,
      targetSelector: '[data-modal-proof-row="59"]',
    });
  }

  await cdp.evaluate(`document.documentElement.dataset.colorMode = 'dark'`);
  await delay(50);
  await assertTargetReachable(cdp, {
    label: '深色模式详情弹层',
    targetSelector: '[data-modal-proof-row="59"]',
    requireScroll: false,
  });
});

console.log('detail modal mobile scroll proof passed');
