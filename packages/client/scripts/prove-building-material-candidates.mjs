/**
 * ISSUE-000016：通过正式营造工具栏验证合法背包材料不会被偏好项隐藏，并随 revision 刷新。
 */
import assert from 'node:assert/strict';
import { delay, withClientBrowserProof } from './browser-proof-runtime.mjs';

const MARKER = 'REPAIR_PROOF:ISSUE-000016:PASS';
const VIEWPORT = { width: 390, height: 844 };

const fixtureExpression = String.raw`
  (async () => {
    document.getElementById('login-overlay')?.classList.add('hidden');
    document.getElementById('game-shell')?.classList.remove('hidden');
    const { createMainBuildingFengShuiStateSource } = await import('/src/main-building-fengshui-state-source.ts');
    const player = {
      playerId: 'p_build_material_proof',
      mapId: 'proof-map',
      x: 0,
      y: 0,
      buildingSkill: { level: 1 },
      inventory: {
        revision: 1,
        capacity: 200,
        items: [
          {
            itemId: 'black_iron_chunk',
            itemInstanceId: 'proof-black-iron',
            name: '玄铁矿块',
            type: 'material',
            count: 3,
            materialCategory: 'ore',
            tags: ['石材', '金属', '矿石', '矿材'],
          },
          {
            itemId: 'cleft_iron_fragment',
            itemInstanceId: 'proof-cleft-iron',
            name: '残兵铁片',
            type: 'material',
            count: 2,
            materialCategory: 'ore',
            tags: ['石材', '金属', '矿石', '矿材'],
          },
        ],
      },
    };
    const source = createMainBuildingFengShuiStateSource({
      socket: {
        sendBuildPlaceIntent() {},
        sendBuildDeconstruct() {},
        sendRoomSetRole() {},
        sendFengShuiObserve() {},
      },
      setFengShuiOverlay() {},
      setBuildPreviewOverlay() {},
      getPlayer: () => player,
      getVisibleTileAt: () => ({}),
      showToast() {},
      beginTargeting(...args) {
        window.__buildingMaterialProof.targetingCalls.push(args);
      },
      cancelTargeting() {},
      getInfoRadius: () => 8,
      sidePanel: {
        getLayoutCollapseState: () => ({ leftCollapsed: false, rightCollapsed: false, bottomCollapsed: false }),
        setLayoutCollapseState() {},
        setBuildingModeActive() {},
        isMobileLayoutActive: () => true,
      },
    });
    window.__buildingMaterialProof = { source, player, targetingCalls: [] };
    source.openBuildingPanel();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return true;
  })()
`;

const measureExpression = String.raw`
  (() => {
    const toolbar = document.getElementById('building-mode-toolbar');
    const content = toolbar?.querySelector('.building-mode-content');
    const stage = toolbar?.querySelector('.building-mode-stage');
    const materialPanel = toolbar?.querySelector('.building-mode-material-panel');
    const cards = [...(toolbar?.querySelectorAll('.building-mode-material-card') ?? [])];
    const buildingItems = [...(toolbar?.querySelectorAll('.building-mode-item') ?? [])];
    const actions = [...(toolbar?.querySelectorAll('.building-mode-action, .building-mode-exit') ?? [])];
    if (!(toolbar instanceof HTMLElement)
      || !(content instanceof HTMLElement)
      || !(stage instanceof HTMLElement)
      || !(materialPanel instanceof HTMLElement)) {
      throw new Error('营造工具栏未按正式路径打开');
    }
    const contentRect = content.getBoundingClientRect();
    const measureTouchTarget = (element) => {
      if (!(element instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2);
      return {
        key: element.dataset.action ?? element.dataset.defId ?? '',
        width: rect.width,
        height: rect.height,
        fullyVisible: rect.top >= contentRect.top - 1 && rect.bottom <= contentRect.bottom + 1,
        centerHitsTarget: hit === element || element.contains(hit),
      };
    };
    return {
      visible: !toolbar.classList.contains('hidden'),
      contentOverflowY: getComputedStyle(content).overflowY,
      contentScrollTop: content.scrollTop,
      stageBeforeConfiguration: stage.getBoundingClientRect().top < materialPanel.getBoundingClientRect().top,
      strengthValue: toolbar.querySelector('[data-action="build-strength"]')?.value ?? '',
      strengthFocused: document.activeElement === toolbar.querySelector('[data-action="build-strength"]'),
      firstBuildingItem: measureTouchTarget(buildingItems[0]),
      actionTargets: actions.map(measureTouchTarget),
      cards: cards.map((card) => ({
        itemId: card.dataset.itemId ?? '',
        name: card.querySelector('.building-mode-material-card-name')?.textContent?.trim() ?? '',
        active: card.classList.contains('active'),
        disabled: card.disabled,
        stableProof: card.dataset.proofStable ?? '',
        textFits: card.querySelector('.building-mode-material-card-name') instanceof HTMLElement
          ? card.querySelector('.building-mode-material-card-name').scrollWidth <= card.querySelector('.building-mode-material-card-name').clientWidth + 1
          : false,
      })),
    };
  })()
`;

await withClientBrowserProof({ viewport: VIEWPORT, profilePrefix: 'building-material-proof-' }, async (cdp) => {
  assert.equal(await cdp.evaluate(fixtureExpression), true, '未能建立正式营造面板 fixture');
  const initial = await cdp.evaluate(measureExpression);
  assert.equal(initial.visible, true, '手机端营造工具栏不可见');
  assert.equal(initial.contentOverflowY, 'auto', '手机端营造内容没有纵向滚动路径');
  assert.equal(initial.contentScrollTop, 0, '营造工具栏首次打开不应依赖预设滚动位置');
  assert.equal(initial.stageBeforeConfiguration, true, '手机端造物与操作区没有置于配置区之前');
  assert(initial.firstBuildingItem, '手机端营造工具栏没有可选造物');
  assert.equal(initial.firstBuildingItem.fullyVisible, true, '手机端首个造物没有完整显示');
  assert.equal(initial.firstBuildingItem.centerHitsTarget, true, '手机端首个造物的触点被其他区域遮挡');
  assert(initial.firstBuildingItem.width >= 44 && initial.firstBuildingItem.height >= 44, '手机端造物触控面积不足 44px');
  assert.equal(initial.actionTargets.length, 4, '手机端营造主操作数量异常');
  assert(initial.actionTargets.every((target) => target?.fullyVisible && target.centerHitsTarget), '手机端营造主操作存在裁切或触点遮挡');
  assert(initial.actionTargets.every((target) => target && target.height >= 42), '手机端营造主操作触控高度不足');
  assert.deepEqual(
    initial.cards.map((card) => card.itemId),
    ['black_iron_chunk', 'cleft_iron_fragment'],
    '玄铁偏好不应隐藏其他合法石材候选',
  );
  assert(initial.cards.every((card) => !card.disabled && card.textFits), '合法材料卡片不可用或名称溢出');

  const placeTriggered = await cdp.evaluate(`
    (() => {
      const button = document.querySelector('[data-action="place"]');
      const rect = button.getBoundingClientRect();
      const hit = document.elementFromPoint((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2);
      hit?.click();
      return window.__buildingMaterialProof.targetingCalls.length;
    })()
  `);
  assert.equal(placeTriggered, 1, '手机端点击选择位置的触点没有进入地图选点流程');

  const prepared = await cdp.evaluate(`
    (() => {
      document.querySelector('[data-item-id="black_iron_chunk"]').dataset.proofStable = 'kept';
      const strengthInput = document.querySelector('[data-action="build-strength"]');
      strengthInput.value = '77';
      strengthInput.focus({ preventScroll: true });
      return {
        focused: document.activeElement === strengthInput,
        value: strengthInput.value,
      };
    })()
  `);
  assert.equal(prepared.focused, true, '浏览器 fixture 未能聚焦建造强度输入');
  assert.equal(prepared.value, '77', '浏览器 fixture 未能建立未提交建造强度');

  await cdp.evaluate(`
    (() => {
      const proof = window.__buildingMaterialProof;
      proof.player.inventory = {
        ...proof.player.inventory,
        revision: 2,
        items: [...proof.player.inventory.items, {
          itemId: 'earthbearing_stone',
          itemInstanceId: 'proof-earthbearing-stone',
          name: '承脉石',
          type: 'material',
          count: 4,
          materialCategory: 'ore',
          tags: ['石材', '矿石', '矿材'],
        }],
      };
    })()
  `);
  await delay(100);
  const refreshed = await cdp.evaluate(measureExpression);
  assert.deepEqual(
    refreshed.cards.map((card) => card.itemId),
    ['black_iron_chunk', 'earthbearing_stone', 'cleft_iron_fragment'],
    '背包 revision 推进后新增合法材料未刷新到营造面板',
  );
  assert.equal(refreshed.cards.find((card) => card.itemId === 'black_iron_chunk')?.stableProof, 'kept', '背包变化重建了已有材料卡片');
  assert.equal(refreshed.strengthValue, '77', '材料刷新覆盖了正在编辑的建造强度');
  assert.equal(refreshed.strengthFocused, true, '材料刷新打断了建造强度输入焦点');

  await cdp.evaluate(`document.querySelector('[data-item-id="cleft_iron_fragment"]').click()`);
  await delay(50);
  const selected = await cdp.evaluate(measureExpression);
  assert.equal(selected.cards.find((card) => card.itemId === 'cleft_iron_fragment')?.active, true, '手机端无法切换其他合法材料');

  await cdp.evaluate(`document.documentElement.dataset.colorMode = 'dark'`);
  await delay(50);
  const dark = await cdp.evaluate(measureExpression);
  assert.equal(dark.cards.length, 3, '深色模式切换后营造材料候选丢失');
  assert.equal(dark.firstBuildingItem?.centerHitsTarget, true, '深色模式下造物触点被其他区域遮挡');

  const buildingSelection = await cdp.evaluate(`
    (() => {
      const buttons = [...document.querySelectorAll('.building-mode-item[data-def-id]')];
      const target = buttons.find((button) => !button.classList.contains('active'));
      if (!(target instanceof HTMLElement)) return null;
      const targetDefId = target.dataset.defId;
      const rect = target.getBoundingClientRect();
      const hit = document.elementFromPoint((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2);
      hit?.click();
      return {
        targetDefId,
        activeDefId: document.querySelector('.building-mode-item.active')?.dataset.defId ?? '',
        contentScrollTop: document.querySelector('.building-mode-content')?.scrollTop ?? -1,
      };
    })()
  `);
  assert(buildingSelection, '手机端没有第二个造物可用于触控切换验证');
  assert.equal(buildingSelection.activeDefId, buildingSelection.targetDefId, '手机端造物触点没有切换选中项');
  assert.equal(buildingSelection.contentScrollTop, 0, '造物重绘后主操作区不再位于默认可见位置');
  await cdp.evaluate(`window.__buildingMaterialProof.source.clear()`);
});

console.log(MARKER);
