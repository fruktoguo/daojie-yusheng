import assert from 'node:assert/strict';
import { resolvePlayerFacingContentName } from '@mud/shared';
import { ContentTemplateRepository } from '../content/content-template.repository';
import * as playerDomainPersistence from '../persistence/player-domain-persistence.service';
import { CraftPanelEnhancementQueryService } from '../runtime/craft/craft-panel-enhancement-query.service';

const MARKER = 'REPAIR_PROOF:ISSUE-000003:PASS';
const ITEM_ID = 'repair-proof:legacy-enhancement-item';
const ITEM_NAME = '玄铁旧剑';

type PersistenceModule = typeof playerDomainPersistence & {
  projectEnhancementRecordsFromPersistenceRows?: (rows: readonly unknown[]) => Array<Record<string, unknown>>;
};

function main(): void {
  const persistedRows = playerDomainPersistence.buildEnhancementRecordRowsFromEntries('repair-proof-player', [{
    recordId: 'repair-proof:enhancement-record',
    itemId: ITEM_ID,
    itemName: ITEM_NAME,
    highestLevel: 1,
    levels: [{ targetLevel: 1, successCount: 1, failureCount: 0 }],
    actionStartedAt: 1_700_000_000_000,
    actionEndedAt: 1_700_000_001_000,
    startLevel: 0,
    initialTargetLevel: 1,
    desiredTargetLevel: 1,
    status: 'completed',
  }]);
  const persistedRow = persistedRows[0] as unknown as (Record<string, unknown> | undefined);
  assert.equal(persistedRow?.itemName, ITEM_NAME, '强化记录写入行必须保留玩家看到的物品名称');

  const projectRows = (playerDomainPersistence as PersistenceModule).projectEnhancementRecordsFromPersistenceRows;
  assert.equal(typeof projectRows, 'function', '强化记录必须使用生产回读投影恢复名称');
  const restartedRecords = projectRows!(JSON.parse(JSON.stringify(persistedRows)) as unknown[]);
  assert.equal(restartedRecords[0]?.itemName, ITEM_NAME, '重启回读后的强化记录必须保留物品名称');

  const contentRepository = new ContentTemplateRepository();
  const queryService = new CraftPanelEnhancementQueryService(contentRepository);
  const panelPayload = queryService.buildEnhancementPanelPayload({
    enhancementRecords: restartedRecords,
    enhancementJob: null,
    enhancementSkillLevel: 1,
    inventory: { items: [] },
    equipment: { slots: [] },
    artifacts: { slots: [] },
    attrs: { craftEffectStats: null },
    techniqueActivityQueue: [],
  }, new Map());
  const wirePayload = JSON.parse(JSON.stringify(panelPayload)) as {
    state?: { records?: Array<{ itemId?: string; itemName?: string }> };
  };
  const wireRecord = wirePayload.state?.records?.[0];
  assert.equal(wireRecord?.itemName, ITEM_NAME, '强化面板网络载荷必须携带回读后的物品名称');
  assert.equal(
    resolvePlayerFacingContentName(wireRecord?.itemId, '未知物品', wireRecord?.itemName),
    ITEM_NAME,
    '客户端共享显示名解析不得把持久化名称回退为未知物品',
  );

  console.log(MARKER);
}

main();
