/**
 * 统法台手机端布局与交互连续性 proof。
 *
 * 使用正式 Vite 页面、CraftWorkbenchModal 和样式，验证权限双 Tab、品阶/境界筛选、
 * 法卷卡格分页、跨页全选及弹层正文在窄屏和短屏下均可纵向到达。
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
      onUpdateTechniqueAggregationPermissions: () => true,
      onLearnTechniqueAggregation: () => true,
    });
    modal.openTechniqueAggregation('building:mobile-proof');
    const mortalSources = Array.from({ length: 28 }, (_, index) => ({
        techId: 'gen_mobile_mortal_' + index,
        name: '凡阶归元功' + (index + 1),
        grade: 'mortal',
        category: 'internal',
        realmLv: index < 16 ? 1 : 2,
        strengthPercent: 80 + (index % 41),
        level: 9,
        maxLevel: 9,
        fullyMastered: true,
        covered: false,
      }));
    const yellowSources = Array.from({ length: 2 }, (_, index) => ({
      techId: 'gen_mobile_yellow_' + index,
      name: '黄阶守一经' + (index + 1),
      grade: 'yellow',
      category: 'internal',
      realmLv: 3,
      strengthPercent: 119 - index,
      level: 9,
      maxLevel: 9,
      fullyMastered: true,
      covered: false,
    }));
    modal.handleTechniqueAggregationPanel({
      revision: 7,
      buildingId: 'building:mobile-proof',
      eligibleSources: [...mortalSources, ...yellowSources],
      families: [],
      totalCoveredLeafCount: 0,
      learnedAggregateCount: 0,
      platform: {
        buildingId: 'building:mobile-proof',
        displayName: '玄门统法台',
        ownerPlayerId: 'player:owner',
        isOwner: true,
        permissions: {
          read: { unrestricted: false, friendLevels: ['close_friend'], sectRoles: ['elder', 'inner'] },
          revision: { unrestricted: false, friendLevels: [], sectRoles: ['inner'] },
        },
        canLearn: false,
        canRevise: true,
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
    const directory = document.querySelector('[data-technique-aggregation-directory="true"]');
    const list = document.querySelector('[data-technique-aggregation-source-list="true"]');
    const permissions = document.querySelector('[data-technique-aggregation-permissions="true"]');
    const editor = document.querySelector('[data-technique-aggregation-permission-editor="true"]');
    const grade = document.querySelector('[data-technique-aggregation-grade-filter="true"]');
    const realm = document.querySelector('[data-technique-aggregation-realm-filter="true"]');
    const name = document.querySelector('[data-technique-aggregation-name="true"]');
    if (!(card instanceof HTMLElement)
      || !(body instanceof HTMLElement)
      || !(panel instanceof HTMLElement)
      || !(directory instanceof HTMLElement)
      || !(list instanceof HTMLElement)
      || !(permissions instanceof HTMLElement)
      || !(editor instanceof HTMLElement)
      || !(grade instanceof HTMLSelectElement)
      || !(realm instanceof HTMLSelectElement)
      || !(name instanceof HTMLInputElement)) {
      throw new Error('统法台移动端 proof 结构不完整');
    }
    const cardRect = card.getBoundingClientRect();
    const sourceCards = Array.from(list.querySelectorAll('.technique-aggregation-source'))
      .filter((entry) => entry instanceof HTMLElement);
    const sourceRects = sourceCards.map((entry) => entry.getBoundingClientRect());
    const overflowNodes = [card, body, panel, ...Array.from(panel.querySelectorAll('*'))]
      .filter((entry) => entry instanceof HTMLElement && entry.scrollWidth > entry.clientWidth + 1)
      .map((entry) => entry.className || entry.tagName);
    const optionRects = Array.from(editor.querySelectorAll('.technique-aggregation-policy-option'))
      .map((entry) => entry.getBoundingClientRect());
    const tabRects = Array.from(permissions.querySelectorAll('.technique-aggregation-permission-tab'))
      .map((entry) => entry.getBoundingClientRect());
    return {
      viewportHeight: innerHeight,
      cardTop: cardRect.top,
      cardBottom: cardRect.bottom,
      cardClass: card.className,
      bodyOverflowY: getComputedStyle(body).overflowY,
      bodyClientHeight: body.clientHeight,
      bodyScrollHeight: body.scrollHeight,
      listOverflowY: getComputedStyle(list).overflowY,
      listClientHeight: list.clientHeight,
      listScrollHeight: list.scrollHeight,
      sourceCount: sourceCards.length,
      sourceGridColumns: getComputedStyle(list).gridTemplateColumns.split(' ').filter(Boolean).length,
      minSourceHeight: sourceRects.length > 0 ? Math.min(...sourceRects.map((rect) => rect.height)) : 0,
      maxSourceHeight: sourceRects.length > 0 ? Math.max(...sourceRects.map((rect) => rect.height)) : 0,
      maxSourceWidth: sourceRects.length > 0 ? Math.max(...sourceRects.map((rect) => rect.width)) : 0,
      inventoryCardCount: list.querySelectorAll('.technique-aggregation-source.inventory-cell').length,
      firstStrength: sourceCards[0]?.querySelector('.technique-aggregation-source-strength')?.textContent?.trim() ?? '',
      gradeValue: grade.value,
      gradeOptionCount: grade.options.length,
      realmOptionCount: realm.options.length,
      nameValue: name.value,
      pageText: directory.querySelector('.technique-aggregation-pagination span')?.textContent?.trim() ?? '',
      permissionTabLabels: Array.from(permissions.querySelectorAll('.technique-aggregation-permission-tab'))
        .map((entry) => entry.textContent?.trim() ?? ''),
      activePermissionTab: permissions.querySelector('.technique-aggregation-permission-tab.is-active')?.textContent?.trim() ?? '',
      minPolicyOptionHeight: optionRects.length > 0 ? Math.min(...optionRects.map((rect) => rect.height)) : 0,
      minPermissionTabHeight: tabRects.length > 0 ? Math.min(...tabRects.map((rect) => rect.height)) : 0,
      overflowNodes,
    };
  })()
`;

const interactionExpression = String.raw`
  (() => {
    const directory = document.querySelector('[data-technique-aggregation-directory="true"]');
    const permissions = document.querySelector('[data-technique-aggregation-permissions="true"]');
    const realm = document.querySelector('[data-technique-aggregation-realm-filter="true"]');
    const name = document.querySelector('[data-technique-aggregation-name="true"]');
    if (!(directory instanceof HTMLElement)
      || !(permissions instanceof HTMLElement)
      || !(realm instanceof HTMLSelectElement)
      || !(name instanceof HTMLInputElement)) {
      throw new Error('统法台交互结构不完整');
    }
    name.focus();
    name.value = '太玄归一真经';
    name.dispatchEvent(new Event('input', { bubbles: true }));

    realm.value = '2';
    realm.dispatchEvent(new Event('change', { bubbles: true }));
    const realmFilteredCards = document.querySelectorAll('.technique-aggregation-source');
    const realmPageText = document.querySelector('.technique-aggregation-pagination span')?.textContent?.trim() ?? '';
    const realmStrength = realmFilteredCards[0]?.querySelector('.technique-aggregation-source-strength')?.textContent?.trim() ?? '';

    const currentRealm = document.querySelector('[data-technique-aggregation-realm-filter="true"]');
    if (!(currentRealm instanceof HTMLSelectElement)) throw new Error('境界筛选器丢失');
    currentRealm.value = '';
    currentRealm.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('[data-craft-action="technique-aggregation-select-all"]')?.click();
    const firstPageSelected = document.querySelectorAll('.technique-aggregation-source.is-selected').length;
    const selectedSummary = document.querySelector('[data-technique-aggregation-selection-summary="true"]')?.textContent?.trim() ?? '';
    document.querySelector('[data-craft-action="technique-aggregation-page-next"]')?.click();
    const secondPageSelected = document.querySelectorAll('.technique-aggregation-source.is-selected').length;
    const secondPageText = document.querySelector('.technique-aggregation-pagination span')?.textContent?.trim() ?? '';
    document.querySelector('[data-craft-action="technique-aggregation-clear-selection"]')?.click();
    const selectedAfterClear = document.querySelectorAll('.technique-aggregation-source.is-selected').length;

    const grade = document.querySelector('[data-technique-aggregation-grade-filter="true"]');
    if (!(grade instanceof HTMLSelectElement)) throw new Error('品阶筛选器丢失');
    grade.value = 'yellow';
    grade.dispatchEvent(new Event('change', { bubbles: true }));
    const sparseCards = Array.from(document.querySelectorAll('.technique-aggregation-source'))
      .filter((entry) => entry instanceof HTMLElement);
    const sparseWidths = sparseCards.map((entry) => entry.getBoundingClientRect().width);

    const revisionTab = document.querySelector('[data-permission-scope="revision"]');
    if (!(revisionTab instanceof HTMLButtonElement)) throw new Error('修订权限 Tab 不存在');
    revisionTab.click();
    const currentName = document.querySelector('[data-technique-aggregation-name="true"]');
    const activeTab = document.querySelector('.technique-aggregation-permission-tab.is-active');
    const permissionEditor = document.querySelector('[data-technique-aggregation-permission-editor="true"]');
    return {
      directoryIdentityPreserved: document.querySelector('[data-technique-aggregation-directory="true"]') === directory,
      permissionsIdentityPreserved: document.querySelector('[data-technique-aggregation-permissions="true"]') === permissions,
      nameIdentityPreserved: currentName === name,
      nameValue: currentName instanceof HTMLInputElement ? currentName.value : '',
      realmFilteredCount: realmFilteredCards.length,
      realmPageText,
      realmStrength,
      firstPageSelected,
      selectedSummary,
      secondPageSelected,
      secondPageText,
      selectedAfterClear,
      gradeValue: document.querySelector('[data-technique-aggregation-grade-filter="true"]')?.value ?? '',
      sparseCount: sparseCards.length,
      maxSparseWidth: sparseWidths.length > 0 ? Math.max(...sparseWidths) : 0,
      activePermissionTab: activeTab?.textContent?.trim() ?? '',
      permissionEditorText: permissionEditor?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      checkedRevisionRoles: Array.from(permissionEditor?.querySelectorAll('[data-technique-aggregation-permission-sect-role]:checked') ?? [])
        .map((entry) => entry.dataset.techniqueAggregationPermissionSectRole),
    };
  })()
`;

const scrollBodyToPermissionsExpression = String.raw`
  (() => {
    const body = document.getElementById('detail-modal-body');
    const permissions = document.querySelector('[data-technique-aggregation-permissions="true"]');
    if (!(body instanceof HTMLElement) || !(permissions instanceof HTMLElement)) return false;
    body.scrollTop = body.scrollHeight;
    const bodyRect = body.getBoundingClientRect();
    const permissionsRect = permissions.getBoundingClientRect();
    return permissionsRect.top < bodyRect.bottom && permissionsRect.bottom <= bodyRect.bottom + 1;
  })()
`;

function assertLayout(measurement, label) {
  assert(measurement.cardTop >= 0, `${label}弹层顶部越出视口：${JSON.stringify(measurement)}`);
  assert(measurement.cardBottom <= measurement.viewportHeight, `${label}弹层底部越出视口：${JSON.stringify(measurement)}`);
  assert.match(measurement.cardClass, /detail-modal--technique-unification/, `${label}未应用统法台弹层变体`);
  assert.match(measurement.bodyOverflowY, /auto|scroll/, `${label}正文没有纵向滚动路径`);
  assert(measurement.bodyScrollHeight > measurement.bodyClientHeight, `${label}正文没有形成纵向滚动范围`);
  assert.equal(measurement.listOverflowY, 'visible', `${label}手机端法卷目录不应形成嵌套滚动`);
  assert(measurement.listScrollHeight <= measurement.listClientHeight + 1, `${label}法卷目录仍存在内部滚动范围`);
  assert(measurement.sourceCount > 0 && measurement.sourceCount <= 12, `${label}单页法卷数量超出 12 条`);
  assert.equal(measurement.inventoryCardCount, measurement.sourceCount, `${label}法卷未全部使用背包式卡格`);
  assert.equal(measurement.sourceGridColumns, 2, `${label}手机端法卷目录未保持双列`);
  assert(measurement.minSourceHeight >= 111.5, `${label}法卷卡高度不足`);
  assert(measurement.maxSourceHeight - measurement.minSourceHeight <= 1, `${label}同页法卷卡高度不稳定`);
  assert(measurement.maxSourceWidth <= 180, `${label}少量法卷被横向拉伸过宽`);
  assert.equal(measurement.gradeOptionCount, 2, `${label}品阶过滤项不完整`);
  assert(measurement.minPolicyOptionHeight >= 39.5, `${label}权限选项触控高度不足 40px`);
  assert(measurement.minPermissionTabHeight >= 41.5, `${label}权限 Tab 触控高度不足 42px`);
  assert.deepEqual(measurement.permissionTabLabels, ['参阅权限', '修订权限'], `${label}权限 Tab 不完整`);
  assert.deepEqual(measurement.overflowNodes, [], `${label}出现横向溢出：${JSON.stringify(measurement.overflowNodes)}`);
}

await withClientBrowserProof({ viewport: VIEWPORT, profilePrefix: 'technique-unification-mobile-proof-' }, async (cdp) => {
  assert.equal(await cdp.evaluate(initializeExpression), '统法台', '未打开正式统法台弹层');
  const initial = await cdp.evaluate(measureExpression);
  assertLayout(initial, '标准手机视口');
  assert.equal(initial.sourceCount, 12, '首页未限制为 12 部法卷');
  assert.equal(initial.realmOptionCount, 3, '境界过滤项不完整');
  assert.equal(initial.firstStrength, '强度 80%', '未显示服务端权威功法强度');
  assert.match(initial.pageText, /第 1 \/ 3 页 · 1-12 \/ 28/, '首页分页摘要错误');
  assert.equal(initial.activePermissionTab, '参阅权限', '默认未打开参阅权限 Tab');

  const interaction = await cdp.evaluate(interactionExpression);
  assert.equal(interaction.directoryIdentityPreserved, true, '筛选或分页时替换了法卷目录根节点');
  assert.equal(interaction.permissionsIdentityPreserved, true, '切换权限 Tab 时替换了权限根节点');
  assert.equal(interaction.nameIdentityPreserved, true, '筛选或切换权限时替换了法脉名输入框');
  assert.equal(interaction.nameValue, '太玄归一真经', '筛选、分页或切换权限后丢失法脉名草稿');
  assert.equal(interaction.realmFilteredCount, 12, '境界过滤结果数量错误');
  assert.match(interaction.realmPageText, /第 1 \/ 1 页 · 1-12 \/ 12/, '境界过滤后的分页摘要错误');
  assert.equal(interaction.realmStrength, '强度 96%', '境界过滤后强度显示错误');
  assert.equal(interaction.firstPageSelected, 12, '全选后当前页未全部呈现选中态');
  assert.match(interaction.selectedSummary, /已择 28 部/, '全选未覆盖当前筛选的全部分页');
  assert.equal(interaction.secondPageSelected, 12, '翻页后跨页全选状态未保留');
  assert.match(interaction.secondPageText, /第 2 \/ 3 页 · 13-24 \/ 28/, '下一页分页摘要错误');
  assert.equal(interaction.selectedAfterClear, 0, '全部取消后仍残留选中法卷');
  assert.equal(interaction.gradeValue, 'yellow', '品阶过滤未切换到黄阶');
  assert.equal(interaction.sparseCount, 2, '黄阶少量法卷筛选结果错误');
  assert(interaction.maxSparseWidth <= 180, '只有两部法卷时卡格被拉伸过宽');
  assert.equal(interaction.activePermissionTab, '修订权限', '修订权限 Tab 未切换');
  assert.match(interaction.permissionEditorText, /所有修士均可修订/, '修订权限编辑器文案错误');
  assert.deepEqual(interaction.checkedRevisionRoles, ['inner'], '修订权限草稿未独立保留');
  assert.equal(await cdp.evaluate(scrollBodyToPermissionsExpression), true, '标准手机视口无法滚动到权限底部');

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
  assert.equal(await cdp.evaluate(scrollBodyToPermissionsExpression), true, '短屏手机视口无法滚动到权限底部');

  await cdp.evaluate(`document.documentElement.dataset.colorMode = 'dark'`);
  await delay(80);
  assertLayout(await cdp.evaluate(measureExpression), '短屏深色模式');
});

console.log('technique unification mobile proof passed');
