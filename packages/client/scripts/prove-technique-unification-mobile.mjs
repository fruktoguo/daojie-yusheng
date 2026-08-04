/**
 * 统法台手机端布局与交互连续性 proof。
 *
 * 使用正式 Vite 页面、CraftWorkbenchModal 和样式，验证品阶过滤、名称草稿、
 * 候选列表独立滚动及门规区域在窄屏和短屏下均可到达。
 */
import assert from 'node:assert/strict';
import { delay, withClientBrowserProof } from './browser-proof-runtime.mjs';

const VIEWPORT = { width: 390, height: 844 };
const SHORT_VIEWPORT = { width: 390, height: 640 };

const initializeExpression = String.raw`
  (async () => {
    const { CraftWorkbenchModal } = await import('/src/ui/craft-workbench-modal.ts');
    const modal = new CraftWorkbenchModal();
    modal.setCallbacks({
      onRequestTechniqueAggregation: () => true,
      onPublishTechniqueAggregation: () => true,
      onUpdateTechniqueAggregationAccess: () => true,
      onLearnTechniqueAggregation: () => true,
    });
    modal.openTechniqueAggregation('building:mobile-proof');
    const grades = ['mortal', 'yellow'];
    const sources = Array.from({ length: 48 }, (_, index) => {
      const grade = grades[index % grades.length];
      return {
        techId: 'gen_mobile_' + grade + '_' + index,
        name: (grade === 'mortal' ? '凡阶归元功' : '黄阶守一经') + (index + 1),
        grade,
        category: 'internal',
        realmLv: 1,
        level: 9,
        maxLevel: 9,
        fullyMastered: true,
        covered: false,
      };
    });
    modal.handleTechniqueAggregationPanel({
      revision: 7,
      buildingId: 'building:mobile-proof',
      eligibleSources: sources,
      families: [],
      totalCoveredLeafCount: 0,
      learnedAggregateCount: 0,
      platform: {
        buildingId: 'building:mobile-proof',
        displayName: '玄门统法台',
        ownerPlayerId: 'player:owner',
        isOwner: true,
        accessPolicy: { unrestricted: false, friendLevels: ['close_friend'], sectRoles: ['elder', 'inner'] },
        canLearn: true,
        learnerState: 'unbound',
      },
    });
    window.__techniqueUnificationProofModal = modal;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return document.getElementById('detail-modal-title')?.textContent?.trim() ?? '';
  })()
`;

const measureExpression = String.raw`
  (() => {
    const card = document.getElementById('detail-modal-card');
    const body = document.getElementById('detail-modal-body');
    const panel = document.querySelector('[data-technique-aggregation-panel="true"]');
    const list = document.querySelector('[data-technique-aggregation-source-list="true"]');
    const policy = document.querySelector('[data-technique-aggregation-policy="true"]');
    const grade = document.querySelector('[data-technique-aggregation-grade-filter="true"]');
    const name = document.querySelector('[data-technique-aggregation-name="true"]');
    if (!(card instanceof HTMLElement)
      || !(body instanceof HTMLElement)
      || !(panel instanceof HTMLElement)
      || !(list instanceof HTMLElement)
      || !(policy instanceof HTMLElement)
      || !(grade instanceof HTMLSelectElement)
      || !(name instanceof HTMLInputElement)) {
      throw new Error('统法台移动端 proof 结构不完整');
    }
    const cardRect = card.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const visibleSources = Array.from(list.querySelectorAll('.technique-aggregation-source'))
      .filter((entry) => entry instanceof HTMLElement && !entry.hidden);
    const overflowNodes = [card, body, panel, list, policy, ...Array.from(policy.querySelectorAll('*'))]
      .filter((entry) => entry instanceof HTMLElement && entry.scrollWidth > entry.clientWidth + 1)
      .map((entry) => entry.className || entry.tagName);
    const optionRects = Array.from(policy.querySelectorAll('.technique-aggregation-policy-option'))
      .map((entry) => entry.getBoundingClientRect());
    return {
      viewportHeight: innerHeight,
      cardTop: cardRect.top,
      cardBottom: cardRect.bottom,
      cardClass: card.className,
      bodyOverflowY: getComputedStyle(body).overflowY,
      listOverflowY: getComputedStyle(list).overflowY,
      listClientHeight: list.clientHeight,
      listScrollHeight: list.scrollHeight,
      listTop: listRect.top,
      listBottom: listRect.bottom,
      visibleSourceCount: visibleSources.length,
      visibleSourceGrades: [...new Set(visibleSources.map((entry) => entry.querySelector('small')?.textContent?.split(' · ')[0] ?? ''))],
      gradeValue: grade.value,
      gradeOptionCount: grade.options.length,
      nameValue: name.value,
      policyBottom: policy.getBoundingClientRect().bottom,
      minPolicyOptionHeight: optionRects.length > 0 ? Math.min(...optionRects.map((rect) => rect.height)) : 0,
      overflowNodes,
    };
  })()
`;

const scrollListExpression = String.raw`
  (() => {
    const list = document.querySelector('[data-technique-aggregation-source-list="true"]');
    if (!(list instanceof HTMLElement)) throw new Error('候选列表不存在');
    list.scrollTop = list.scrollHeight;
    const visible = Array.from(list.querySelectorAll('.technique-aggregation-source'))
      .filter((entry) => entry instanceof HTMLElement && !entry.hidden);
    const last = visible.at(-1);
    if (!(last instanceof HTMLElement)) throw new Error('没有可见候选');
    const listRect = list.getBoundingClientRect();
    const lastRect = last.getBoundingClientRect();
    return {
      scrollTop: list.scrollTop,
      lastVisible: lastRect.bottom <= listRect.bottom + 1 && lastRect.top >= listRect.top - 1,
    };
  })()
`;

const interactionExpression = String.raw`
  (() => {
    const list = document.querySelector('[data-technique-aggregation-source-list="true"]');
    const grade = document.querySelector('[data-technique-aggregation-grade-filter="true"]');
    const name = document.querySelector('[data-technique-aggregation-name="true"]');
    if (!(list instanceof HTMLElement) || !(grade instanceof HTMLSelectElement) || !(name instanceof HTMLInputElement)) {
      throw new Error('统法台交互结构不完整');
    }
    list.dataset.proofIdentity = 'preserved';
    name.focus();
    name.value = '太玄归一真经';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    grade.value = 'yellow';
    grade.dispatchEvent(new Event('change', { bubbles: true }));
    const currentList = document.querySelector('[data-technique-aggregation-source-list="true"]');
    const visible = Array.from(currentList.querySelectorAll('.technique-aggregation-source'))
      .filter((entry) => entry instanceof HTMLElement && !entry.hidden);
    visible[0]?.click();
    const currentName = document.querySelector('[data-technique-aggregation-name="true"]');
    return {
      listIdentityPreserved: currentList === list && currentList.dataset.proofIdentity === 'preserved',
      nameValue: currentName instanceof HTMLInputElement ? currentName.value : '',
      gradeValue: grade.value,
      visibleCount: visible.length,
      selectedCount: currentList.querySelectorAll('.technique-aggregation-source.is-selected').length,
    };
  })()
`;

const scrollBodyToPolicyExpression = String.raw`
  (() => {
    const body = document.getElementById('detail-modal-body');
    const policy = document.querySelector('[data-technique-aggregation-policy="true"]');
    if (!(body instanceof HTMLElement) || !(policy instanceof HTMLElement)) return false;
    body.scrollTop = body.scrollHeight;
    const bodyRect = body.getBoundingClientRect();
    const policyRect = policy.getBoundingClientRect();
    return policyRect.top < bodyRect.bottom && policyRect.bottom <= bodyRect.bottom + 1;
  })()
`;

function assertLayout(measurement, label) {
  assert(measurement.cardTop >= 0, `${label}弹层顶部越出视口：${JSON.stringify(measurement)}`);
  assert(measurement.cardBottom <= measurement.viewportHeight, `${label}弹层底部越出视口：${JSON.stringify(measurement)}`);
  assert.match(measurement.cardClass, /detail-modal--technique-unification/, `${label}未应用统法台弹层变体`);
  assert.match(measurement.bodyOverflowY, /auto|scroll/, `${label}正文没有纵向滚动路径`);
  assert.match(measurement.listOverflowY, /auto|scroll/, `${label}候选区没有独立纵向滚动`);
  assert(measurement.listClientHeight >= 200, `${label}候选区未纵向展开：${JSON.stringify(measurement)}`);
  assert(measurement.listScrollHeight > measurement.listClientHeight + 1, `${label}长候选列表没有形成滚动范围`);
  assert.equal(measurement.visibleSourceCount, 24, `${label}品阶页候选数量错误`);
  assert.equal(measurement.gradeOptionCount, 2, `${label}品阶过滤项不完整`);
  assert(measurement.minPolicyOptionHeight >= 39.5, `${label}门规触控高度不足 40px`);
  assert.deepEqual(measurement.overflowNodes, [], `${label}出现横向溢出：${JSON.stringify(measurement.overflowNodes)}`);
}

await withClientBrowserProof({ viewport: VIEWPORT, profilePrefix: 'technique-unification-mobile-proof-' }, async (cdp) => {
  assert.equal(await cdp.evaluate(initializeExpression), '统法台', '未打开正式统法台弹层');
  const initial = await cdp.evaluate(measureExpression);
  assertLayout(initial, '标准手机视口');
  const listScrolled = await cdp.evaluate(scrollListExpression);
  assert(listScrolled.scrollTop > 0, '候选列表未实际滚动');
  assert.equal(listScrolled.lastVisible, true, '候选列表滚动到底后末项仍不可见');

  const interaction = await cdp.evaluate(interactionExpression);
  assert.equal(interaction.listIdentityPreserved, true, '切换品阶时重建了候选列表节点');
  assert.equal(interaction.nameValue, '太玄归一真经', '切换品阶或择取源法后丢失法脉名草稿');
  assert.equal(interaction.gradeValue, 'yellow', '品阶过滤未切换到黄阶');
  assert.equal(interaction.visibleCount, 24, '黄阶页候选数量错误');
  assert.equal(interaction.selectedCount, 1, '择取源法后局部选中态错误');
  assert.equal(await cdp.evaluate(scrollBodyToPolicyExpression), true, '标准手机视口无法滚动到门规底部');

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: SHORT_VIEWPORT.width,
    height: SHORT_VIEWPORT.height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: SHORT_VIEWPORT.width,
    screenHeight: SHORT_VIEWPORT.height,
  });
  await delay(80);
  assertLayout(await cdp.evaluate(measureExpression), '短屏手机视口');
  assert.equal(await cdp.evaluate(scrollBodyToPolicyExpression), true, '短屏手机视口无法滚动到门规底部');

  await cdp.evaluate(`document.documentElement.dataset.colorMode = 'dark'`);
  await delay(80);
  assertLayout(await cdp.evaluate(measureExpression), '短屏深色模式');
});

console.log('technique unification mobile proof passed');
