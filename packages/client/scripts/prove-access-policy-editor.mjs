/** 通用权限编辑器、请求关联和手机/深色布局 proof。 */
import assert from 'node:assert/strict';

import { delay, withClientBrowserProof } from './browser-proof-runtime.mjs';

const VIEWPORT = { width: 390, height: 760 };

await withClientBrowserProof({ viewport: VIEWPORT, profilePrefix: 'mud-access-policy-proof-' }, async (cdp) => {
  const result = await cdp.evaluate(String.raw`
    (async () => {
      const [{ AccessPolicyEditor }, { AccessPolicyResourceEditor }, { AccessPolicySocketClient }, shared] = await Promise.all([
        import('/src/ui/access-policy-editor.ts'),
        import('/src/ui/access-policy-resource-editor.ts'),
        import('/src/ui/access-policy-socket-client.ts'),
        import('/@id/@mud/shared'),
      ]);
      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.inset = '0';
      overlay.style.zIndex = '99999';
      overlay.style.overflow = 'auto';
      overlay.style.padding = '12px';
      overlay.style.background = 'var(--surface-base)';
      const root = document.createElement('div');
      root.style.width = '100%';
      root.style.maxWidth = '680px';
      root.style.margin = '0 auto';
      overlay.append(root);
      document.body.append(overlay);

      let savedPolicy = null;
      const editor = new AccessPolicyEditor({
        root,
        policy: shared.cloneAccessPolicy(shared.OWNER_ONLY_ACCESS_POLICY),
        async resolvePlayerNo(playerNo) {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return playerNo === 10002
            ? { playerNo, playerId: 'player:visitor', roleName: '青云剑客' }
            : null;
        },
        async save(policy) {
          savedPolicy = structuredClone(policy);
          return { ok: true, policy: { ...structuredClone(policy), revision: 2 } };
        },
      });

      const clickText = (selector, text) => {
        const target = Array.from(root.querySelectorAll(selector)).find((entry) => entry.textContent?.trim() === text);
        if (!(target instanceof HTMLElement)) throw new Error('未找到控件：' + text);
        target.click();
      };
      const waitFor = async (probe) => {
        const deadline = Date.now() + 2_000;
        while (Date.now() < deadline) {
          const value = probe();
          if (value) return value;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        throw new Error('权限编辑器交互等待超时');
      };

      const modeLabels = Array.from(root.querySelectorAll('.access-policy-mode-group button'))
        .map((entry) => entry.textContent?.trim() ?? '');
      clickText('.access-policy-mode-group button', '自定义策略');
      const customPanel = await waitFor(() => document.querySelector('.access-policy-panel-layer:not(.hidden)'));
      const customRoot = customPanel.querySelector('.access-policy-panel-body');
      if (!(customRoot instanceof HTMLElement)) throw new Error('自定义权限策略面板未挂载');
      const clickCustomText = (selector, text) => {
        const target = Array.from(customRoot.querySelectorAll(selector)).find((entry) => entry.textContent?.trim() === text);
        if (!(target instanceof HTMLElement)) throw new Error('自定义权限面板未找到控件：' + text);
        target.click();
      };
      const customPanelIndependent = customPanel.parentElement === document.body && !root.contains(customPanel);
      const customPanelTitle = customPanel.querySelector('.access-policy-panel-title')?.textContent?.trim() ?? '';
      const selectorHasInlineConditions = Boolean(root.querySelector('.access-policy-condition'));
      let typeSelect = customRoot.querySelector('.access-policy-condition select');
      const conditionTypeLabels = Array.from(typeSelect?.options ?? []).map((option) => option.textContent?.trim() ?? '');
      const relationLabels = Array.from(customRoot.querySelectorAll('.access-policy-checkbox-options label'))
        .map((entry) => entry.textContent?.trim() ?? '');

      typeSelect.value = 'sect';
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      const allSectMembers = customRoot.querySelector('.access-policy-condition-fields > div > .inline-check input');
      allSectMembers.click();
      const sectText = customRoot.querySelector('.access-policy-condition-fields')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const checkedSectRole = Array.from(customRoot.querySelectorAll('.access-policy-checkbox-field input[type="checkbox"]'))
        .find((entry) => entry.checked);
      checkedSectRole.click();
      const sectLastRoleProtected = Array.from(customRoot.querySelectorAll('.access-policy-checkbox-field input[type="checkbox"]'))
        .some((entry) => entry.checked);
      const sectProtectionStatus = customRoot.querySelector('.access-policy-status')?.textContent?.trim() ?? '';

      typeSelect = customRoot.querySelector('.access-policy-condition select');
      typeSelect.value = 'role_name';
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      const roleNameMatchLabels = Array.from(customRoot.querySelectorAll('.access-policy-condition-fields select option'))
        .map((entry) => entry.textContent?.trim() ?? '');

      typeSelect = customRoot.querySelector('.access-policy-condition select');
      typeSelect.value = 'realm';
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      const realmComparisonLabels = Array.from(customRoot.querySelectorAll('.access-policy-condition-fields select option'))
        .map((entry) => entry.textContent?.trim() ?? '');

      typeSelect = customRoot.querySelector('.access-policy-condition select');
      typeSelect.value = 'attribute';
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      const attributeText = customRoot.querySelector('.access-policy-condition-fields')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

      typeSelect = customRoot.querySelector('.access-policy-condition select');
      typeSelect.value = 'players';
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      const playerInput = customRoot.querySelector('.access-policy-player-controls input');
      playerInput.value = '10002';
      clickCustomText('.access-policy-player-controls button', '查询并添加');
      await waitFor(() => customRoot.querySelector('.access-policy-player-chip'));

      clickCustomText('.access-policy-add-condition', '添加第二组条件');
      const typeSelects = customRoot.querySelectorAll('.access-policy-condition select');
      const secondType = typeSelects[1];
      secondType.value = 'role_name';
      secondType.dispatchEvent(new Event('change', { bubbles: true }));
      const secondCard = customRoot.querySelectorAll('.access-policy-condition')[1];
      const secondSelect = secondCard.querySelector('.access-policy-condition-fields select');
      secondSelect.value = 'contains';
      secondSelect.dispatchEvent(new Event('change', { bubbles: true }));
      const roleNameInput = secondCard.querySelector('input[type="text"]');
      roleNameInput.value = '剑客';
      roleNameInput.dispatchEvent(new Event('input', { bubbles: true }));
      clickCustomText('.access-policy-operator button', '必须同时满足');
      const playerChipText = customRoot.querySelector('.access-policy-player-chip')?.textContent?.replace('×', '').trim() ?? '';
      const conditionCount = customRoot.querySelectorAll('.access-policy-condition').length;
      const hasThirdConditionButton = Boolean(customRoot.querySelector('.access-policy-add-condition'));
      const operatorLabels = Array.from(customRoot.querySelectorAll('.access-policy-operator button'))
        .map((entry) => entry.textContent?.trim() ?? '');
      const customPanelShell = customPanel.querySelector('.access-policy-panel');
      const customPanelWidth = customPanelShell?.getBoundingClientRect().width ?? 0;
      const customPanelScrollWidth = customPanelShell?.scrollWidth ?? 0;
      clickCustomText('.access-policy-footer button', '保存权限');
      await waitFor(() => root.querySelector('.access-policy-status')?.textContent?.includes('权限已保存'));
      const parentConnectedAfterCustomSave = root.isConnected;
      const activeModeAfterCustomSave = root.querySelector('.access-policy-mode-group button.active')?.textContent?.trim() ?? '';
      await Promise.resolve();
      const focusedModeAfterCustomSave = document.activeElement?.textContent?.trim() ?? '';

      const fakeHandlers = new Map();
      let requestPayload = null;
      let requestSetPayload = null;
      const fakeSocket = {
        on(event, callback) {
          fakeHandlers.set(event, callback);
        },
        accessPolicy: {
          request(payload) {
            requestPayload = payload;
            queueMicrotask(() => fakeHandlers.get(shared.S2C.AccessPolicyResourceResult)?.({
              requestId: payload.requestId,
              operation: 'load',
              ok: true,
              snapshot: {
                ...payload.ref,
                revision: 2,
                policy: { ...shared.cloneAccessPolicy(shared.OWNER_ONLY_ACCESS_POLICY), revision: 2 },
              },
            }));
            return { accepted: true };
          },
          requestSet(payload) {
            requestSetPayload = payload;
            queueMicrotask(() => fakeHandlers.get(shared.S2C.AccessPolicyResourceSetResult)?.({
              requestId: payload.requestId,
              ok: true,
              snapshot: {
                ...payload.ref,
                title: '测试宝箱',
                slots: [
                  {
                    slot: 'view_deposit',
                    label: '可看和可放',
                    description: '查看内容并放入物品。',
                    defaultPolicy: shared.cloneAccessPolicy(shared.EVERYONE_ACCESS_POLICY),
                    policy: shared.cloneAccessPolicy(shared.EVERYONE_ACCESS_POLICY),
                    revision: 1,
                  },
                  {
                    slot: 'withdraw',
                    label: '可拿',
                    description: '从资源中取出物品。',
                    defaultPolicy: shared.cloneAccessPolicy(shared.OWNER_ONLY_ACCESS_POLICY),
                    policy: shared.cloneAccessPolicy(shared.OWNER_ONLY_ACCESS_POLICY),
                    revision: 1,
                  },
                ],
              },
            }));
            return { accepted: true };
          },
          resolvePlayer(payload) {
            queueMicrotask(() => fakeHandlers.get(shared.S2C.AccessPolicyPlayerResult)?.({
              requestId: payload.requestId,
              ok: true,
              player: { playerNo: payload.playerNo, roleName: '青云剑客' },
            }));
            return { accepted: true };
          },
          save(payload) {
            queueMicrotask(() => fakeHandlers.get(shared.S2C.AccessPolicyResourceResult)?.({
              requestId: payload.requestId,
              operation: 'save',
              ...(payload.expectedRevision === 3
                ? {
                    ok: false,
                    reason: 'access_policy_revision_conflict',
                    snapshot: {
                      ...payload.ref,
                      revision: 4,
                      policy: { ...shared.cloneAccessPolicy(shared.OWNER_ONLY_ACCESS_POLICY), revision: 4 },
                    },
                  }
                : {
                    ok: true,
                    snapshot: { ...payload.ref, revision: payload.expectedRevision + 1, policy: { ...payload.policy, revision: payload.expectedRevision + 1 } },
                  }),
            }));
            return { accepted: true };
          },
        },
      };
      const socketClient = new AccessPolicySocketClient(fakeSocket, 500);
      const transportRef = { resourceType: 'proof', resourceId: 'resource:1', slot: 'use' };
      const loaded = await socketClient.load(transportRef);
      const loadedSet = await socketClient.loadSet({ resourceType: 'proof', resourceId: 'resource:1' });
      const resolvedPlayer = await socketClient.resolvePlayerNo(10002);
      const saved = await socketClient.save(transportRef, loaded.policy, loaded.revision);
      const conflicted = await socketClient.save(transportRef, loaded.policy, 3);

      const resourceRoot = document.createElement('div');
      resourceRoot.style.marginTop = '16px';
      overlay.append(resourceRoot);
      const resourceEditor = new AccessPolicyResourceEditor({
        root: resourceRoot,
        snapshot: loadedSet,
        resolvePlayerNo: (playerNo) => socketClient.resolvePlayerNo(playerNo),
        save: (ref, policy, expectedRevision) => socketClient.save(ref, policy, expectedRevision),
      });
      const resourceTabLabels = Array.from(resourceRoot.querySelectorAll('.access-policy-resource-tabs button'))
        .map((entry) => entry.textContent?.trim() ?? '');
      const resourceModeLabels = Array.from(resourceRoot.querySelectorAll('.access-policy-resource-panel:not([hidden]) .access-policy-mode-group button'))
        .map((entry) => entry.textContent?.trim() ?? '');
      const firstDefaultMode = resourceRoot.querySelector('.access-policy-resource-panel:not([hidden]) .access-policy-mode-group button.active')?.textContent?.trim() ?? '';
      Array.from(resourceRoot.querySelectorAll('.access-policy-resource-panel:not([hidden]) .access-policy-mode-group button'))
        .find((entry) => entry.textContent?.trim() === '仅所有者')?.click();
      const firstDraftBeforeSwitch = resourceEditor.getPolicy('view_deposit')?.mode ?? '';
      Array.from(resourceRoot.querySelectorAll('.access-policy-resource-tabs button'))
        .find((entry) => entry.textContent?.trim() === '可拿')?.click();
      const secondDefaultMode = resourceRoot.querySelector('.access-policy-resource-panel:not([hidden]) .access-policy-mode-group button.active')?.textContent?.trim() ?? '';
      Array.from(resourceRoot.querySelectorAll('.access-policy-resource-tabs button'))
        .find((entry) => entry.textContent?.trim() === '可看和可放')?.click();
      const firstDraftAfterSwitch = resourceEditor.getPolicy('view_deposit')?.mode ?? '';
      resourceRoot.querySelector('.access-policy-resource-panel:not([hidden]) .access-policy-footer button')?.click();
      await waitFor(() => resourceRoot.querySelector('.access-policy-resource-panel:not([hidden]) .access-policy-status')?.textContent?.includes('权限已保存'));
      const resourceSlotModesAfterSave = [
        resourceEditor.getPolicy('view_deposit')?.mode ?? '',
        resourceEditor.getPolicy('withdraw')?.mode ?? '',
      ];

      const compatibilityRoot = document.createElement('div');
      overlay.append(compatibilityRoot);
      const compatibilityEditor = new AccessPolicyEditor({
        root: compatibilityRoot,
        policy: {
          schemaVersion: 1,
          mode: 'conditional',
          operator: 'any',
          conditions: [{ type: 'party' }],
          revision: 1,
        },
        async resolvePlayerNo() {
          return null;
        },
        async save() {
          return { ok: false, reason: 'unused' };
        },
      });
      Array.from(compatibilityRoot.querySelectorAll('.access-policy-mode-group button'))
        .find((entry) => entry.textContent?.trim() === '自定义策略')?.click();
      const compatibilityPanel = await waitFor(() => document.querySelector('.access-policy-panel-layer:not(.hidden)'));
      const compatibilityTypeSelect = compatibilityPanel.querySelector('.access-policy-condition select');
      const compatibilityConditionType = compatibilityTypeSelect?.value ?? '';
      const compatibilityConditionLabel = compatibilityTypeSelect?.selectedOptions[0]?.textContent?.trim() ?? '';
      compatibilityEditor.destroy();

      const conflictRoot = document.createElement('div');
      overlay.append(conflictRoot);
      const conflictEditor = new AccessPolicyEditor({
        root: conflictRoot,
        policy: { ...shared.cloneAccessPolicy(shared.OWNER_ONLY_ACCESS_POLICY), revision: 3 },
        async resolvePlayerNo() {
          return null;
        },
        async save() {
          return {
            ok: false,
            reason: 'access_policy_revision_conflict',
            currentPolicy: { ...shared.cloneAccessPolicy(shared.OWNER_ONLY_ACCESS_POLICY), revision: 4 },
          };
        },
      });
      const conflictEveryone = Array.from(conflictRoot.querySelectorAll('.access-policy-mode-group button'))
        .find((entry) => entry.textContent?.trim() === '所有人');
      conflictEveryone.click();
      conflictRoot.querySelector('.access-policy-footer button').click();
      await waitFor(() => conflictRoot.querySelector('.access-policy-status')?.textContent?.includes('已加载最新配置'));
      const conflictActiveMode = conflictRoot.querySelector('.access-policy-mode-group button.active')?.textContent?.trim() ?? '';
      const conflictStatus = conflictRoot.querySelector('.access-policy-status')?.textContent?.trim() ?? '';
      conflictEditor.destroy();

      clickText('.access-policy-mode-group button', '自定义策略');
      await waitFor(() => document.querySelector('.access-policy-panel-layer:not(.hidden)'));

      const shell = root.querySelector('.access-policy-editor');
      return {
        modeLabels,
        customPanelIndependent,
        customPanelTitle,
        selectorHasInlineConditions,
        customPanelWidth,
        customPanelScrollWidth,
        parentConnectedAfterCustomSave,
        activeModeAfterCustomSave,
        focusedModeAfterCustomSave,
        conditionTypeLabels,
        relationLabels,
        sectText,
        sectLastRoleProtected,
        sectProtectionStatus,
        roleNameMatchLabels,
        realmComparisonLabels,
        attributeText,
        playerInputType: playerInput.type,
        playerChipText,
        conditionCount,
        hasThirdConditionButton,
        operatorLabels,
        savedPolicy,
        status: root.querySelector('.access-policy-status')?.textContent?.trim() ?? '',
        shellWidth: shell?.getBoundingClientRect().width ?? 0,
        shellScrollWidth: shell?.scrollWidth ?? 0,
        requestResourceType: requestPayload?.ref?.resourceType ?? '',
        requestSetResourceType: requestSetPayload?.ref?.resourceType ?? '',
        loadedRevision: loaded.revision,
        resourceTabLabels,
        resourceModeLabels,
        firstDefaultMode,
        secondDefaultMode,
        firstDraftBeforeSwitch,
        firstDraftAfterSwitch,
        resourceSlotModesAfterSave,
        resourceShellWidth: resourceRoot.querySelector('.access-policy-resource-editor')?.getBoundingClientRect().width ?? 0,
        resourceShellScrollWidth: resourceRoot.querySelector('.access-policy-resource-editor')?.scrollWidth ?? 0,
        compatibilityConditionType,
        compatibilityConditionLabel,
        resolvedPlayer,
        transportSaveOk: saved.ok,
        transportConflictRevision: conflicted.currentPolicy?.revision ?? 0,
        conflictActiveMode,
        conflictStatus,
      };
    })()
  `);

  assert.deepEqual(result.modeLabels, ['所有人', '仅所有者', '自定义策略'], '权限入口必须固定为三种模式');
  assert.equal(result.customPanelIndependent, true, '自定义策略必须挂载到独立权限面板');
  assert.equal(result.customPanelTitle, '自定义权限策略');
  assert.equal(result.selectorHasInlineConditions, false, '资源权限页不得内嵌自定义条件表单');
  assert(result.customPanelScrollWidth <= result.customPanelWidth + 1, '自定义权限面板在手机视口出现横向溢出');
  assert.equal(result.parentConnectedAfterCustomSave, true, '自定义策略保存不得销毁父权限面板');
  assert.equal(result.activeModeAfterCustomSave, '自定义策略', '保存自定义条件后未切换为自定义策略');
  assert.equal(result.focusedModeAfterCustomSave, '自定义策略', '保存后键盘焦点未回到当前权限模式');
  assert.deepEqual(result.conditionTypeLabels, ['好友关系', '同宗门', '指定玩家', '角色名字', '境界', '属性']);
  assert.deepEqual(result.relationLabels, ['道友', '至交', '师父', '徒弟', '仇家']);
  for (const role of ['同宗门全部成员', '宗主', '太上长老', '副宗主', '长老', '内门弟子', '外门弟子', '杂役弟子']) {
    assert.match(result.sectText, new RegExp(role), `宗门权限缺少 ${role}`);
  }
  assert.equal(result.sectLastRoleProtected, true, '精确职位最后一项不得被无意取消为全部成员');
  assert.match(result.sectProtectionStatus, /至少保留一项/);
  assert.deepEqual(result.roleNameMatchLabels, ['完全匹配', '包含', '前缀匹配', '后缀匹配']);
  assert.deepEqual(result.realmComparisonLabels, ['大于', '小于', '等于']);
  assert.match(result.attributeText, /大于/);
  assert.match(result.attributeText, /小于/);
  assert.equal(result.playerInputType, 'number', '指定玩家入口必须只能输入序号');
  assert.equal(result.playerChipText, '#10002 青云剑客', '序号解析后必须展示对应玩家名称');
  assert.equal(result.conditionCount, 2, '权限最多允许两组条件');
  assert.equal(result.hasThirdConditionButton, false, '两组条件后不得继续添加');
  assert.deepEqual(result.operatorLabels, ['满足任一', '必须同时满足']);
  assert.equal(result.savedPolicy?.operator, 'all');
  assert.deepEqual(result.savedPolicy?.conditions?.map((entry) => entry.type), ['players', 'role_name']);
  assert.equal(result.status, '权限已保存。');
  assert(result.shellScrollWidth <= result.shellWidth + 1, '手机视口出现横向溢出');
  assert.equal(result.requestResourceType, 'proof', '请求客户端未透传资源键');
  assert.equal(result.requestSetResourceType, 'proof', '资源组请求未透传资源键');
  assert.equal(result.loadedRevision, 2, '请求客户端未关联 load 回包');
  assert.deepEqual(result.resourceTabLabels, ['可看和可放', '可拿'], '多权限资源必须按声明顺序展示槽位');
  assert.deepEqual(result.resourceModeLabels, ['所有人', '仅所有者', '自定义策略'], '多权限资源槽位未使用固定三态');
  assert.equal(result.firstDefaultMode, '所有人', '资源默认开放策略必须显示为所有人');
  assert.equal(result.secondDefaultMode, '仅所有者', '不同槽位必须支持不同默认策略');
  assert.equal(result.firstDraftBeforeSwitch, 'owner_only');
  assert.equal(result.firstDraftAfterSwitch, 'owner_only', '切换权限页签不得丢失未保存草稿');
  assert.deepEqual(result.resourceSlotModesAfterSave, ['owner_only', 'owner_only'], '保存一个槽位不得改变其他槽位');
  assert.equal(result.compatibilityConditionType, 'party', '旧宝库同队条件必须在编辑器中保持真实类型');
  assert.equal(result.compatibilityConditionLabel, '同队伍', '旧宝库同队条件必须提供可辨识回显');
  assert(result.resourceShellScrollWidth <= result.resourceShellWidth + 1, '多权限资源编辑器在手机视口出现横向溢出');
  assert.deepEqual(result.resolvedPlayer, { playerNo: 10002, roleName: '青云剑客' });
  assert.equal(result.transportSaveOk, true, '请求客户端未关联 save 回包');
  assert.equal(result.transportConflictRevision, 4, '请求客户端未透传冲突时的当前权威策略');
  assert.equal(result.conflictActiveMode, '仅所有者', '冲突后编辑器必须加载当前权威策略');
  assert.match(result.conflictStatus, /已加载最新配置/);

  await cdp.evaluate(`document.documentElement.dataset.colorMode = 'dark'`);
  await delay(80);
  const dark = await cdp.evaluate(`(() => {
    const panel = document.querySelector('.access-policy-panel-layer:not(.hidden) .access-policy-panel');
    const editor = panel?.querySelector('.access-policy-editor--custom');
    const card = panel?.querySelector('.access-policy-condition');
    const resourceEditor = document.querySelector('.access-policy-resource-editor');
    return {
      color: editor ? getComputedStyle(editor).color : '',
      background: card ? getComputedStyle(card).backgroundColor : '',
      overflow: editor ? editor.scrollWidth > editor.clientWidth + 1 : true,
      panelOverflow: panel ? panel.scrollWidth > panel.clientWidth + 1 : true,
      resourceOverflow: resourceEditor ? resourceEditor.scrollWidth > resourceEditor.clientWidth + 1 : true,
    };
  })()`);
  assert.notEqual(dark.color, '');
  assert.notEqual(dark.background, 'rgba(0, 0, 0, 0)');
  assert.equal(dark.overflow, false, '深色手机模式出现横向溢出');
  assert.equal(dark.panelOverflow, false, '深色手机模式自定义权限面板出现横向溢出');
  assert.equal(dark.resourceOverflow, false, '深色手机模式多权限资源编辑器出现横向溢出');

  const closeGuard = await cdp.evaluate(`(() => {
    const layer = document.querySelector('.access-policy-panel-layer:not(.hidden)');
    const any = Array.from(layer?.querySelectorAll('.access-policy-operator button') ?? [])
      .find((entry) => entry.textContent?.trim() === '满足任一');
    const close = layer?.querySelector('.access-policy-panel-close');
    if (!(layer instanceof HTMLElement) || !(any instanceof HTMLButtonElement) || !(close instanceof HTMLButtonElement)) {
      throw new Error('自定义权限关闭保护结构不完整');
    }
    any.click();
    const originalConfirm = window.confirm;
    window.confirm = () => false;
    close.click();
    const blocked = !layer.classList.contains('hidden');
    window.confirm = () => true;
    close.click();
    const closed = layer.classList.contains('hidden');
    window.confirm = originalConfirm;
    return { blocked, closed };
  })()`);
  assert.equal(closeGuard.blocked, true, '拒绝放弃未保存策略时弹层仍被关闭');
  assert.equal(closeGuard.closed, true, '确认放弃未保存策略后弹层未关闭');
});

console.log(JSON.stringify({ ok: true, case: 'access-policy-editor' }, null, 2));
