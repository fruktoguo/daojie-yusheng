/**
 * 背包卡片元数据分区与手机端功法星图纵向可达性 proof。
 */
import assert from 'node:assert/strict';
import { delay, withClientBrowserProof } from './browser-proof-runtime.mjs';

const MOBILE_VIEWPORT = { width: 360, height: 640 };
const DESKTOP_VIEWPORT = { width: 1280, height: 900 };

const mountItemCardFixtureExpression = String.raw`
  (() => {
    document.getElementById('item-card-layout-proof')?.remove();
    const host = document.createElement('section');
    host.id = 'item-card-layout-proof';
    host.style.cssText = 'position:fixed;left:8px;top:8px;width:96px;z-index:10000;';
    host.innerHTML = '<div class="inventory-grid">'
      + '<div class="inventory-cell inventory-cell--grade inventory-cell--grade-mystic" data-item-type="material">'
      + '<div class="inventory-cell-head"><span class="inventory-cell-type">药材</span>'
      + '<span class="inventory-cell-count" data-item-count="true">x136万</span></div>'
      + '<div class="inventory-cell-name" data-item-name="true">千年玄霜五蕴灵芝凝露精华材料</div>'
      + '<span class="item-card-chip item-card-chip--level" data-item-level="true">Lv.127</span>'
      + '</div></div>';
    document.body.appendChild(host);
    return true;
  })()
`;

const measureItemCardExpression = String.raw`
  (() => {
    const cell = document.querySelector('#item-card-layout-proof .inventory-cell');
    const level = cell?.querySelector('[data-item-level="true"]');
    const count = cell?.querySelector('[data-item-count="true"]');
    const name = cell?.querySelector('[data-item-name="true"]');
    if (!(cell instanceof HTMLElement)
      || !(level instanceof HTMLElement)
      || !(count instanceof HTMLElement)
      || !(name instanceof HTMLElement)) {
      throw new Error('背包卡片布局 proof 结构不完整');
    }
    const cellRect = cell.getBoundingClientRect();
    const levelRect = level.getBoundingClientRect();
    const countRect = count.getBoundingClientRect();
    const nameRect = name.getBoundingClientRect();
    const nameRange = document.createRange();
    nameRange.selectNodeContents(name);
    const nameTextWidth = nameRange.getBoundingClientRect().width;
    const intersects = (left, right) => left.left < right.right - 0.5
      && left.right > right.left + 0.5
      && left.top < right.bottom - 0.5
      && left.bottom > right.top + 0.5;
    const inside = (rect) => rect.left >= cellRect.left - 1
      && rect.right <= cellRect.right + 1
      && rect.top >= cellRect.top - 1
      && rect.bottom <= cellRect.bottom + 1;
    return {
      levelCountOverlap: intersects(levelRect, countRect),
      levelInside: inside(levelRect),
      countInside: inside(countRect),
      nameInside: inside(nameRect),
      nameClippedByCard: nameTextWidth > name.clientWidth && getComputedStyle(name).overflow === 'hidden',
      cellWidth: cellRect.width,
      cellHeight: cellRect.height,
      levelPosition: getComputedStyle(level).position,
      countPosition: getComputedStyle(count).position,
      levelRect: { top: levelRect.top, right: levelRect.right, bottom: levelRect.bottom, left: levelRect.left },
      countRect: { top: countRect.top, right: countRect.right, bottom: countRect.bottom, left: countRect.left },
      levelText: level.textContent?.trim() ?? '',
      countText: count.textContent?.trim() ?? '',
    };
  })()
`;

const openConstellationFixtureExpression = String.raw`
  (async () => {
    const { detailModalHost } = await import('/src/ui/detail-modal-host.ts');
    const { TechniqueConstellationCanvas } = await import('/src/ui/panels/technique-constellation-canvas.ts');
    const focusRows = Array.from({ length: 18 }, (_, index) => (
      '<div class="ui-list-row"><span>第 ' + (index + 1) + ' 层注解</span><span>完整层级信息</span></div>'
    )).join('');
    detailModalHost.open({
      ownerId: 'constellation-layout-proof',
      size: 'wide',
      variantClass: 'detail-modal--technique',
      title: '周天星图布局检查',
      subtitle: '手机端完整节点链可达',
      bodyHtml: '<div class="tech-modal-stack tech-modal-stack--with-strength">'
        + '<section class="tech-modal-strength" data-tech-modal-strength="true"><span>功法强度</span><strong>118%</strong></section>'
        + '<section class="tech-modal-summary">'
        + '<div class="tech-modal-stat"><span class="tech-modal-label">当前经验</span><span>123456</span></div>'
        + '<div class="tech-modal-stat"><span class="tech-modal-label">总经验</span><span>987654</span></div>'
        + '<div class="tech-modal-stat"><span class="tech-modal-label">当前加成</span><span>完整投影</span></div>'
        + '</section>'
        + '<section class="tech-modal-pane tech-modal-pane--constellation">'
        + '<div class="tech-modal-section-title">周天星图</div>'
        + '<div class="tech-modal-pane-body" data-tech-modal-constellation-shell="true">'
        + '<div class="tech-starfield-shell"><div class="tech-starfield-canvas-shell" data-tech-constellation-root="true">'
        + '<canvas class="tech-starfield-canvas" data-tech-starfield-canvas="true"></canvas>'
        + '<svg class="tech-starfield-skill-lines" data-tech-starfield-skill-lines="true"></svg>'
        + '<div class="tech-starfield-skill-layer"></div></div>'
        + '<div class="tech-starfield-note">完整节点链应在纵向滚动中可达</div></div></div>'
        + '</section>'
        + '<section class="tech-modal-pane tech-modal-pane--focus">'
        + '<div class="tech-modal-section-title">星位注解</div>'
        + '<div class="tech-modal-pane-body"><div class="ui-list">' + focusRows + '</div></div>'
        + '</section>'
        + '<section class="ui-modal-footer-actions"><button class="small-btn danger" data-constellation-proof-footer="true">遗忘功法</button></section>'
        + '</div>',
    });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const root = document.querySelector('[data-tech-constellation-root="true"]');
    if (!(root instanceof HTMLElement)) throw new Error('星图画布根节点不存在');
    window.__constellationLayoutProof?.destroy?.();
    window.__constellationLayoutProof = new TechniqueConstellationCanvas(
      root,
      {
        techniqueName: '四十九重周天图',
        maxLevels: 49,
        currentLevel: 9,
        expPercent: 0.5,
        selectedLevel: 9,
        nodes: Array.from({ length: 49 }, (_, index) => ({
          level: index + 1,
          hoverTitle: '第 ' + (index + 1) + ' 层',
          hoverLines: ['层级节点 ' + (index + 1)],
          ...(index === 15 ? { milestone: '小成' } : {}),
          ...(index === 32 ? { milestone: '大成' } : {}),
          ...(index === 48 ? { milestone: '圆满' } : {}),
        })),
      },
      () => {},
      () => {},
      () => {},
      () => {},
    );
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return document.getElementById('detail-modal-title')?.textContent?.trim() ?? '';
  })()
`;

const measureConstellationExpression = String.raw`
  (() => {
    const card = document.getElementById('detail-modal-card');
    const body = document.getElementById('detail-modal-body');
    const stack = document.querySelector('.tech-modal-stack');
    const strength = document.querySelector('[data-tech-modal-strength="true"]');
    const summary = document.querySelector('.tech-modal-summary');
    const constellationBody = document.querySelector('.tech-modal-pane--constellation .tech-modal-pane-body');
    const root = document.querySelector('[data-tech-constellation-root="true"]');
    const footer = document.querySelector('[data-constellation-proof-footer="true"]');
    const nodes = window.__constellationLayoutProof?.currentNodes ?? [];
    if (!(card instanceof HTMLElement)
      || !(body instanceof HTMLElement)
      || !(stack instanceof HTMLElement)
      || !(strength instanceof HTMLElement)
      || !(summary instanceof HTMLElement)
      || !(constellationBody instanceof HTMLElement)
      || !(root instanceof HTMLElement)
      || !(footer instanceof HTMLElement)) {
      throw new Error('星图布局 proof 结构不完整');
    }
    const bodyRect = body.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const strengthRect = strength.getBoundingClientRect();
    const summaryRect = summary.getBoundingClientRect();
    const constellationBodyRect = constellationBody.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    return {
      bodyOverflowY: getComputedStyle(body).overflowY,
      bodyClientHeight: body.clientHeight,
      bodyScrollHeight: body.scrollHeight,
      bodyScrollTop: body.scrollTop,
      stackHeight: stack.getBoundingClientRect().height,
      strengthText: strength.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      strengthAboveSummary: strengthRect.bottom <= summaryRect.top + 1,
      constellationBodyOverflowY: getComputedStyle(constellationBody).overflowY,
      canvasClientWidth: root.clientWidth,
      canvasClientHeight: root.clientHeight,
      canvasUnclippedBySection: rootRect.top >= constellationBodyRect.top - 1
        && rootRect.bottom <= constellationBodyRect.bottom + 1,
      canvasVisibleInScrollport: rootRect.top >= bodyRect.top - 1 && rootRect.bottom <= bodyRect.bottom + 1,
      footerVisible: footerRect.top >= bodyRect.top - 1 && footerRect.bottom <= bodyRect.bottom + 1,
      nodeCount: nodes.length,
      allNodesInsideCanvas: nodes.every((node) => node.x >= 0 && node.x <= root.clientWidth
        && node.y >= 0 && node.y <= root.clientHeight),
      firstLevel: nodes[0]?.level ?? null,
      lastLevel: nodes.at(-1)?.level ?? null,
      horizontalOverflow: card.scrollWidth > card.clientWidth + 1,
      scrollPoint: { x: bodyRect.left + bodyRect.width / 2, y: bodyRect.top + Math.min(80, bodyRect.height / 2) },
    };
  })()
`;

function assertItemCardLayout(layout, label) {
  assert.equal(layout.levelCountOverlap, false, `${label}等级与数量发生遮挡：${JSON.stringify(layout)}`);
  assert.equal(layout.levelInside, true, `${label}等级超出卡片：${JSON.stringify(layout)}`);
  assert.equal(layout.countInside, true, `${label}数量超出卡片：${JSON.stringify(layout)}`);
  assert.equal(layout.nameInside, true, `${label}长名称超出卡片：${JSON.stringify(layout)}`);
  assert.equal(layout.nameClippedByCard, true, `${label}长名称未按卡片宽度稳定截断：${JSON.stringify(layout)}`);
  assert.equal(layout.levelText, 'Lv.127', `${label}等级文本缺失`);
  assert.equal(layout.countText, 'x136万', `${label}数量文本缺失`);
}

await withClientBrowserProof({ viewport: MOBILE_VIEWPORT, profilePrefix: 'item-card-constellation-proof-' }, async (cdp) => {
  assert.equal(await cdp.evaluate(mountItemCardFixtureExpression), true, '未建立背包卡片布局 fixture');
  assertItemCardLayout(await cdp.evaluate(measureItemCardExpression), '手机浅色背包卡片');
  await cdp.evaluate(`document.documentElement.dataset.colorMode = 'dark'`);
  await delay(50);
  assertItemCardLayout(await cdp.evaluate(measureItemCardExpression), '手机深色背包卡片');
  await cdp.evaluate(`document.documentElement.dataset.colorMode = 'light'; document.getElementById('item-card-layout-proof')?.remove()`);

  assert.equal(await cdp.evaluate(openConstellationFixtureExpression), '周天星图布局检查', '未打开正式功法详情弹层');
  const initial = await cdp.evaluate(measureConstellationExpression);
  assert.equal(initial.bodyOverflowY, 'auto', `手机功法详情未建立单一纵向滚动：${JSON.stringify(initial)}`);
  assert.equal(initial.strengthText, '功法强度118%', '手机功法详情顶部未显示自创功法强度');
  assert.equal(initial.strengthAboveSummary, true, '手机功法强度未位于详情摘要上方');
  assert(initial.bodyScrollHeight > initial.bodyClientHeight + 1, '手机功法详情没有形成有效纵向滚动范围');
  assert.equal(initial.constellationBodyOverflowY, 'visible', '手机星图仍被内层容器裁切');
  assert(initial.canvasClientHeight >= 360, `手机星图纵向空间不足：${initial.canvasClientHeight}`);
  assert.equal(initial.canvasUnclippedBySection, true, '完整星图仍超出所属区块');
  assert.equal(initial.nodeCount, 49, '星图未生成完整 49 节点链');
  assert.equal(initial.allNodesInsideCanvas, true, '星图存在超出画布的不可达节点');
  assert.equal(initial.firstLevel, 1, '星图首个节点缺失');
  assert.equal(initial.lastLevel, 49, '星图末尾节点缺失');
  assert.equal(initial.horizontalOverflow, false, '手机功法弹层出现横向溢出');

  await cdp.evaluate(`document.getElementById('detail-modal-body').scrollTop = 0`);
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x: initial.scrollPoint.x,
    y: initial.scrollPoint.y,
    deltaX: 0,
    deltaY: 900,
  });
  await delay(120);
  assert((await cdp.evaluate(measureConstellationExpression)).bodyScrollTop > 0, '手机触控等价滚动未推进功法详情');

  await cdp.evaluate(`document.querySelector('[data-tech-constellation-root="true"]').scrollIntoView({ block: 'start' })`);
  await delay(80);
  assert.equal((await cdp.evaluate(measureConstellationExpression)).canvasVisibleInScrollport, true, '滚动后完整星图仍不可见');
  await cdp.evaluate(`document.getElementById('detail-modal-body').scrollTop = document.getElementById('detail-modal-body').scrollHeight`);
  await delay(80);
  assert.equal((await cdp.evaluate(measureConstellationExpression)).footerVisible, true, '滚动到底后功法底部操作仍不可达');

  await cdp.evaluate(`document.documentElement.dataset.colorMode = 'dark'`);
  await delay(50);
  const dark = await cdp.evaluate(measureConstellationExpression);
  assert.equal(dark.nodeCount, 49, '深色模式切换后星图节点丢失');
  assert.equal(dark.horizontalOverflow, false, '深色模式功法弹层出现横向溢出');

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: DESKTOP_VIEWPORT.width,
    height: DESKTOP_VIEWPORT.height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: DESKTOP_VIEWPORT.width,
    screenHeight: DESKTOP_VIEWPORT.height,
  });
  await delay(150);
  const desktop = await cdp.evaluate(measureConstellationExpression);
  assert.equal(desktop.bodyOverflowY, 'hidden', '桌面功法详情不应改为整页滚动');
  assert.equal(desktop.strengthText, '功法强度118%', '桌面功法详情顶部未显示自创功法强度');
  assert.equal(desktop.strengthAboveSummary, true, '桌面功法强度未位于详情摘要上方');
  assert.equal(desktop.constellationBodyOverflowY, 'hidden', '桌面星图内部布局行为发生变化');
  assert(desktop.stackHeight <= desktop.bodyClientHeight + 1, '桌面功法栈超出固定详情区域');
  assert.equal(desktop.nodeCount, 49, '桌面布局切换后星图节点丢失');
  assert.equal(desktop.horizontalOverflow, false, '桌面功法弹层出现横向溢出');

  await cdp.evaluate(`
    document.documentElement.dataset.colorMode = 'light';
    window.__constellationLayoutProof?.destroy?.();
    document.getElementById('detail-modal')?.classList.add('hidden');
  `);
  assert.equal(await cdp.evaluate(mountItemCardFixtureExpression), true, '未建立桌面背包卡片 fixture');
  assertItemCardLayout(await cdp.evaluate(measureItemCardExpression), '桌面浅色背包卡片');
});

console.log('REPAIR_PROOF:ISSUE-000058:PASS');
console.log('REPAIR_PROOF:ISSUE-000063:PASS');
