/** 通用权限编辑器、请求关联和手机/深色布局 proof。 */
import assert from 'node:assert/strict';

import { delay, withClientBrowserProof } from './browser-proof-runtime.mjs';

const VIEWPORT = { width: 390, height: 760 };

await withClientBrowserProof({ viewport: VIEWPORT, profilePrefix: 'mud-access-policy-proof-' }, async (cdp) => {
  const result = await cdp.evaluate(String.raw`
    (async () => {
      const [{ AccessPolicyEditor }, { AccessPolicySocketClient }, shared] = await Promise.all([
        import('/src/ui/access-policy-editor.ts'),
        import('/src/ui/access-policy-socket-client.ts'),
        import('/@fs/home/yuohira/mud-mmo-next/packages/shared/src/index.ts'),
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

      clickText('.access-policy-mode-group button', '按条件');
      let typeSelect = root.querySelector('.access-policy-condition select');
      const conditionTypeLabels = Array.from(typeSelect?.options ?? []).map((option) => option.textContent?.trim() ?? '');
      const relationLabels = Array.from(root.querySelectorAll('.access-policy-checkbox-options label'))
        .map((entry) => entry.textContent?.trim() ?? '');

      typeSelect.value = 'sect';
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      const allSectMembers = root.querySelector('.access-policy-condition-fields > div > .inline-check input');
      allSectMembers.click();
      const sectText = root.querySelector('.access-policy-condition-fields')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const checkedSectRole = Array.from(root.querySelectorAll('.access-policy-checkbox-field input[type="checkbox"]'))
        .find((entry) => entry.checked);
      checkedSectRole.click();
      const sectLastRoleProtected = Array.from(root.querySelectorAll('.access-policy-checkbox-field input[type="checkbox"]'))
        .some((entry) => entry.checked);
      const sectProtectionStatus = root.querySelector('.access-policy-status')?.textContent?.trim() ?? '';

      typeSelect = root.querySelector('.access-policy-condition select');
      typeSelect.value = 'role_name';
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      const roleNameMatchLabels = Array.from(root.querySelectorAll('.access-policy-condition-fields select option'))
        .map((entry) => entry.textContent?.trim() ?? '');

      typeSelect = root.querySelector('.access-policy-condition select');
      typeSelect.value = 'realm';
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      const realmComparisonLabels = Array.from(root.querySelectorAll('.access-policy-condition-fields select option'))
        .map((entry) => entry.textContent?.trim() ?? '');

      typeSelect = root.querySelector('.access-policy-condition select');
      typeSelect.value = 'attribute';
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      const attributeText = root.querySelector('.access-policy-condition-fields')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

      typeSelect = root.querySelector('.access-policy-condition select');
      typeSelect.value = 'players';
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      const playerInput = root.querySelector('.access-policy-player-controls input');
      playerInput.value = '10002';
      clickText('.access-policy-player-controls button', '查询并添加');
      await waitFor(() => root.querySelector('.access-policy-player-chip'));

      clickText('.access-policy-add-condition', '添加第二组条件');
      const typeSelects = root.querySelectorAll('.access-policy-condition select');
      const secondType = typeSelects[1];
      secondType.value = 'role_name';
      secondType.dispatchEvent(new Event('change', { bubbles: true }));
      const secondCard = root.querySelectorAll('.access-policy-condition')[1];
      const secondSelect = secondCard.querySelector('.access-policy-condition-fields select');
      secondSelect.value = 'contains';
      secondSelect.dispatchEvent(new Event('change', { bubbles: true }));
      const roleNameInput = secondCard.querySelector('input[type="text"]');
      roleNameInput.value = '剑客';
      roleNameInput.dispatchEvent(new Event('input', { bubbles: true }));
      clickText('.access-policy-operator button', '必须同时满足');
      clickText('.access-policy-footer button', '保存权限');
      await waitFor(() => root.querySelector('.access-policy-status')?.textContent?.includes('权限已保存'));

      const fakeHandlers = new Map();
      let requestPayload = null;
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
      const resolvedPlayer = await socketClient.resolvePlayerNo(10002);
      const saved = await socketClient.save(transportRef, loaded.policy, loaded.revision);
      const conflicted = await socketClient.save(transportRef, loaded.policy, 3);

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

      const shell = root.querySelector('.access-policy-editor');
      return {
        conditionTypeLabels,
        relationLabels,
        sectText,
        sectLastRoleProtected,
        sectProtectionStatus,
        roleNameMatchLabels,
        realmComparisonLabels,
        attributeText,
        playerInputType: playerInput.type,
        playerChipText: root.querySelector('.access-policy-player-chip')?.textContent?.replace('×', '').trim() ?? '',
        conditionCount: root.querySelectorAll('.access-policy-condition').length,
        hasThirdConditionButton: Boolean(root.querySelector('.access-policy-add-condition')),
        operatorLabels: Array.from(root.querySelectorAll('.access-policy-operator button')).map((entry) => entry.textContent?.trim() ?? ''),
        savedPolicy,
        status: root.querySelector('.access-policy-status')?.textContent?.trim() ?? '',
        shellWidth: shell?.getBoundingClientRect().width ?? 0,
        shellScrollWidth: shell?.scrollWidth ?? 0,
        requestResourceType: requestPayload?.ref?.resourceType ?? '',
        loadedRevision: loaded.revision,
        resolvedPlayer,
        transportSaveOk: saved.ok,
        transportConflictRevision: conflicted.currentPolicy?.revision ?? 0,
        conflictActiveMode,
        conflictStatus,
      };
    })()
  `);

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
  assert.equal(result.loadedRevision, 2, '请求客户端未关联 load 回包');
  assert.deepEqual(result.resolvedPlayer, { playerNo: 10002, roleName: '青云剑客' });
  assert.equal(result.transportSaveOk, true, '请求客户端未关联 save 回包');
  assert.equal(result.transportConflictRevision, 4, '请求客户端未透传冲突时的当前权威策略');
  assert.equal(result.conflictActiveMode, '仅所有者', '冲突后编辑器必须加载当前权威策略');
  assert.match(result.conflictStatus, /已加载最新配置/);

  await cdp.evaluate(`document.documentElement.dataset.colorMode = 'dark'`);
  await delay(80);
  const dark = await cdp.evaluate(`(() => {
    const editor = document.querySelector('.access-policy-editor');
    const card = document.querySelector('.access-policy-condition');
    return {
      color: editor ? getComputedStyle(editor).color : '',
      background: card ? getComputedStyle(card).backgroundColor : '',
      overflow: editor ? editor.scrollWidth > editor.clientWidth + 1 : true,
    };
  })()`);
  assert.notEqual(dark.color, '');
  assert.notEqual(dark.background, 'rgba(0, 0, 0, 0)');
  assert.equal(dark.overflow, false, '深色手机模式出现横向溢出');
});

console.log(JSON.stringify({ ok: true, case: 'access-policy-editor' }, null, 2));
