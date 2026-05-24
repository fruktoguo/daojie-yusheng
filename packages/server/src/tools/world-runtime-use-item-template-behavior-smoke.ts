/**
 * 本文件是可执行验证工具，覆盖服务端启动、持久化或运行时链路的最小回归场景。
 *
 * 维护时要让验证数据可控、可清理，并避免依赖线上外部服务。
 */
import assert from 'node:assert/strict';

import { ContentTemplateRepository } from '../content/content-template.repository';
import { WorldRuntimeUseItemService } from '../runtime/world/world-runtime-use-item.service';

const contentTemplateRepository = new ContentTemplateRepository();
contentTemplateRepository.onModuleInit();

const hydratedJadeSlip = contentTemplateRepository.normalizeItem({
  itemId: 'wudao_yujian',
  itemInstanceId: 'jade-slip-template-smoke',
  count: 1,
});

assert.equal(
  hydratedJadeSlip?.useBehavior,
  'open_technique_generation',
  '悟道玉简应能从物品模板恢复特殊使用行为',
);

let normalUseCalled = false;
const notices: Array<{
  playerId: string;
  message: string;
  tone: string;
  structured: { key?: string; vars?: Record<string, unknown> } | undefined;
}> = [];

const service = new WorldRuntimeUseItemService(
  contentTemplateRepository,
  {},
  {
    peekInventoryItemByInstanceId(playerId: string, itemInstanceId: string) {
      assert.equal(playerId, 'player:jade-slip-template-smoke');
      assert.equal(itemInstanceId, 'jade-slip-template-smoke');
      return {
        itemId: 'wudao_yujian',
        itemInstanceId,
        count: 1,
      };
    },
    useItemByInstanceId() {
      normalUseCalled = true;
      throw new Error('悟道玉简不应落入普通消耗品使用链路');
    },
  },
);

service.dispatchUseItem(
  'player:jade-slip-template-smoke',
  'jade-slip-template-smoke',
  {
    queuePlayerNotice(
      playerId: string,
      message: string,
      tone: string,
      _castId?: unknown,
      _combat?: unknown,
      structured?: { key?: string; vars?: Record<string, unknown> },
    ) {
      notices.push({ playerId, message, tone, structured });
    },
  },
);

assert.equal(normalUseCalled, false);
assert.deepEqual(notices, [
  {
    playerId: 'player:jade-slip-template-smoke',
    message: '打开功法领悟',
    tone: 'info',
    structured: {
      key: 'notice.item.open-panel',
      vars: { panel: 'technique_generation' },
    },
  },
]);

console.log(JSON.stringify({ ok: true, case: 'world-runtime-use-item-template-behavior' }, null, 2));
