import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { CraftPanelRuntimeService } from '../runtime/craft/craft-panel-runtime.service';

const TEST_REALM_EXP_TO_NEXT = 10000;

function createRuntimeHarness(playerStore: Map<string, ReturnType<typeof createPlayer>>) {
  return {
    walletDebits: [] as Array<[string, string, number]>,
    playerProgressionService: {
      refreshPreview() {
        return undefined;
      },
      getRealmRuntimeExpToNext(level: number) {
        return Math.max(1, Math.floor(Number(level) || 1)) > 0 ? TEST_REALM_EXP_TO_NEXT : 0;
      },
    },
    playerAttributesService: {
      recalculate() {
        return undefined;
      },
    },
    rebuildActionState() {
      return undefined;
    },
    markPersistenceDirtyDomains(player: { dirtyDomains?: Set<string> }, domains: Iterable<string>) {
      if (!(player.dirtyDomains instanceof Set)) {
        player.dirtyDomains = new Set<string>();
      }
      for (const domain of domains) {
        if (typeof domain === 'string' && domain.trim()) {
          player.dirtyDomains.add(domain.trim());
        }
      }
    },
    bumpPersistentRevision(player: { persistentRevision?: number }) {
      player.persistentRevision = Math.max(0, Math.trunc(Number(player.persistentRevision ?? 0))) + 1;
    },
    canAffordWallet(playerId: string, walletType: string, amount: number) {
      return getWalletBalance(playerStore.get(playerId), walletType) >= Math.max(0, Math.trunc(Number(amount ?? 0)));
    },
    debitWallet(playerId: string, walletType: string, amount: number) {
      const player = playerStore.get(playerId);
      const normalizedAmount = Math.max(0, Math.trunc(Number(amount ?? 0)));
      if (!player || normalizedAmount <= 0) {
        return player;
      }
      const entry = ensureWalletEntry(player, walletType);
      if (entry.balance < normalizedAmount) {
        throw new Error(`wallet ${walletType} insufficient`);
      }
      entry.balance -= normalizedAmount;
      entry.version += 1;
      this.walletDebits.push([playerId, walletType, normalizedAmount]);
      this.markPersistenceDirtyDomains(player, ['wallet']);
      this.bumpPersistentRevision(player);
      return player;
    },
  };
}

function createService() {
  const playerStore = new Map<string, ReturnType<typeof createPlayer>>();
  const runtimeHarness = createRuntimeHarness(playerStore);
  const enhancementRecordWrites: Array<{ playerId: string; rows: unknown[]; versionSeed?: number | null }> = [];
  const alchemyPresetWrites: Array<{ playerId: string; rows: unknown[]; versionSeed?: number | null }> = [];
  const activeJobWrites: Array<{ playerId: string; row: unknown; versionSeed?: number | null }> = [];
  const techniqueActivityQueueWrites: Array<{ playerId: string; rows: unknown[]; versionSeed?: number | null }> = [];
  const service = new CraftPanelRuntimeService(
    {
      normalizeItem(item: Record<string, unknown>) {
        return {
          count: 1,
          tags: [],
          ...item,
        };
      },
      getItemName(itemId: string) {
        return itemId;
      },
    } as never,
    runtimeHarness as never,
    {
      isEnabled() {
        return true;
      },
      async savePlayerAlchemyPresets(playerId: string, rows: readonly unknown[], options: { versionSeed?: number | null } = {}) {
        alchemyPresetWrites.push({ playerId, rows: [...rows], versionSeed: options.versionSeed ?? null });
      },
      async savePlayerEnhancementRecords(playerId: string, rows: readonly unknown[], options: { versionSeed?: number | null } = {}) {
        enhancementRecordWrites.push({ playerId, rows: [...rows], versionSeed: options.versionSeed ?? null });
      },
      async savePlayerActiveJob(playerId: string, row: unknown, options: { versionSeed?: number | null } = {}) {
        activeJobWrites.push({ playerId, row, versionSeed: options.versionSeed ?? null });
      },
      async savePlayerTechniqueActivityQueue(playerId: string, rows: readonly unknown[], options: { versionSeed?: number | null } = {}) {
        techniqueActivityQueueWrites.push({ playerId, rows: [...rows], versionSeed: options.versionSeed ?? null });
      },
    } as never,
    {} as never,
    {} as never,
  );

  (service as unknown as { alchemyCatalog: unknown[] }).alchemyCatalog = [
    {
      recipeId: 'qi_pill',
      outputItemId: 'qi_pill',
      outputName: '气丹',
      outputCount: 1,
      outputLevel: 1,
      baseBrewTicks: 2,
      ingredients: [{ itemId: 'moondew_grass', count: 1 }],
    },
  ];
  (service as unknown as { enhancementConfigs: Map<string, unknown> }).enhancementConfigs = new Map([
    ['iron_sword', {
      steps: [
        {
          targetEnhanceLevel: 1,
          materials: [{ itemId: 'iron_essence', count: 1 }],
        },
      ],
    }],
  ]);

  return { service, runtimeHarness, playerStore, enhancementRecordWrites, alchemyPresetWrites, activeJobWrites, techniqueActivityQueueWrites };
}

function createPlayer() {
  return {
    playerId: 'player:craft',
    persistentRevision: 1,
    dirtyDomains: new Set<string>(),
    inventory: {
      revision: 1,
      capacity: 24,
      items: [
        { itemId: 'iron_sword', itemInstanceId: 'item:iron-sword:craft-dirty', type: 'equipment', level: 1, count: 1, name: '铁剑', enhanceLevel: 0 },
        { itemId: 'moondew_grass', type: 'material', count: 3, name: '月露草' },
        { itemId: 'iron_essence', type: 'material', count: 2, name: '铁华' },
      ],
    },
    equipment: {
      revision: 1,
      slots: [
        {
          slot: 'weapon',
          item: {
            itemId: 'craft_tool',
            type: 'equipment',
            level: 1,
            count: 1,
            name: '百工锤炉',
            tags: ['alchemy_furnace', 'enhancement_hammer'],
            alchemySpeedRate: 0,
            alchemySuccessRate: 0,
            enhancementSpeedRate: 0,
            enhancementSuccessRate: 0,
          },
        },
      ],
    },
    alchemySkill: {
      level: 1,
      exp: 0,
      expToNext: TEST_REALM_EXP_TO_NEXT,
    },
    gatherSkill: null,
    enhancementSkill: {
      level: 1,
      exp: 0,
      expToNext: TEST_REALM_EXP_TO_NEXT,
    },
    enhancementSkillLevel: 1,
    alchemyPresets: [],
    enhancementRecords: [],
    alchemyJob: null,
    enhancementJob: null,
    wallet: {
      balances: [
        {
          walletType: 'spirit_stone',
          balance: 20,
          frozenBalance: 0,
          version: 1,
        },
      ],
    },
  };
}

function resetDirty(player: { dirtyDomains: Set<string>; persistentRevision: number }) {
  player.dirtyDomains.clear();
  player.persistentRevision = 1;
}

function assertDomains(player: { dirtyDomains: Set<string> }, expected: string[], absent: string[] = []) {
  for (const domain of expected) {
    assert.ok(player.dirtyDomains.has(domain), `expected dirty domain ${domain}, got ${Array.from(player.dirtyDomains).join(',')}`);
  }
  for (const domain of absent) {
    assert.ok(!player.dirtyDomains.has(domain), `did not expect dirty domain ${domain}, got ${Array.from(player.dirtyDomains).join(',')}`);
  }
}

function testSaveAlchemyPresetDirtyDomain() {
  const { service, playerStore, alchemyPresetWrites, activeJobWrites } = createService();
  const player = createPlayer();
  playerStore.set(player.playerId, player);

  const result = service.saveAlchemyPreset(player as never, {
    recipeId: 'qi_pill',
    name: '补气预设',
    ingredients: [{ itemId: 'moondew_grass', count: 1 }],
  });

  assert.equal(result.ok, true);
  assertDomains(player, ['alchemy_preset'], ['snapshot']);
  assert.equal(alchemyPresetWrites.length, 1);
  assert.equal(alchemyPresetWrites[0].playerId, player.playerId);
  assert.equal(activeJobWrites.length, 0);
}

function testTickAlchemyMarksActiveJob() {
  const { service, playerStore, activeJobWrites } = createService();
  const player = createPlayer();
  playerStore.set(player.playerId, player);

  const start = service.startAlchemy(player as never, {
    recipeId: 'qi_pill',
    quantity: 1,
    ingredients: [{ itemId: 'moondew_grass', count: 1 }],
  });
  assert.equal(start.ok, true);
  assert.equal(player.alchemyJob?.jobVersion, 2);
  resetDirty(player);
  activeJobWrites.length = 0;

  service.tickAlchemy(player as never);

  assertDomains(player, ['active_job'], ['snapshot']);
  assert.equal(player.alchemyJob?.jobVersion, 3);
  assert.equal(activeJobWrites.length, 1);
  assert.equal(activeJobWrites[0].playerId, player.playerId);
  assert.equal(activeJobWrites[0].versionSeed, player.persistentRevision);
  assert.equal((activeJobWrites[0].row as Record<string, unknown> | null)?.jobVersion, 3);
}

function testTickEnhancementMarksDomains() {
  const { service, runtimeHarness, playerStore, enhancementRecordWrites, activeJobWrites } = createService();
  const player = createPlayer();
  playerStore.set(player.playerId, player);

  const start = service.startEnhancement(player as never, {
    target: {
      source: 'inventory',
      itemInstanceId: 'item:iron-sword:craft-dirty',
      expectedItemInstanceId: 'item:iron-sword:craft-dirty',
    },
  });
  assert.equal(start.ok, true, start.error);
  assert.equal(player.enhancementJob?.jobVersion, 2);
  resetDirty(player);
  activeJobWrites.length = 0;
  const spiritStoneCost = player.enhancementJob.spiritStoneCost;
  player.enhancementJob.remainingTicks = 1;
  player.enhancementJob.totalTicks = 1;

  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    service.tickEnhancement(player as never);
  } finally {
    Math.random = originalRandom;
  }

  assertDomains(player, ['inventory', 'active_job', 'enhancement_record', 'profession', 'wallet'], ['snapshot']);
  assert.deepEqual(runtimeHarness.walletDebits, [[player.playerId, 'spirit_stone', spiritStoneCost]]);
  assert.equal(enhancementRecordWrites.length, 1);
  assert.equal(enhancementRecordWrites[0].playerId, player.playerId);
  assert.equal(enhancementRecordWrites[0].versionSeed, player.persistentRevision);
  assert.equal(activeJobWrites.length, 1);
  assert.equal(activeJobWrites[0].playerId, player.playerId);
  assert.equal(activeJobWrites[0].versionSeed, player.persistentRevision);
  assert.equal(activeJobWrites[0].row, null);
}

function testActiveJobVersionBumpHasSingleImplementation() {
  const files = [
    'packages/server/src/runtime/craft/technique-activity-runtime.helpers.ts',
    'packages/server/src/runtime/craft/craft-panel-runtime.service.ts',
    'packages/server/src/runtime/craft/pipeline/technique-activity-pipeline.service.ts',
    'packages/server/src/runtime/craft/pipeline/strategies/mining.strategy.ts',
  ];
  const joined = files
    .map((filePath) => readFileSync(resolve(process.cwd(), filePath), 'utf-8'))
    .join('\n');
  assert.equal(countMatches(joined, /jobVersion\s*=\s*Math\.max\(1,\s*Math\.trunc\(Number\([^)]*jobVersion[^)]*\)[\s\S]*?\)\s*\+\s*1/g), 1);
  assert.equal(countMatches(joined, /function bumpActiveJobVersion|bumpActiveJobVersion\(/g), 0);
  assert.equal(countMatches(joined, /bumpTechniqueActivityJobVersion\(/g), 4);
}

function ensureWalletEntry(player: ReturnType<typeof createPlayer>, walletType: string) {
  if (!player.wallet || !Array.isArray(player.wallet.balances)) {
    player.wallet = { balances: [] };
  }
  let entry = player.wallet.balances.find((row) => row.walletType === walletType);
  if (!entry) {
    entry = {
      walletType,
      balance: 0,
      frozenBalance: 0,
      version: 0,
    };
    player.wallet.balances.push(entry);
  }
  return entry;
}

function getWalletBalance(player: ReturnType<typeof createPlayer> | undefined, walletType: string) {
  if (!player?.wallet || !Array.isArray(player.wallet.balances)) {
    return 0;
  }
  return player.wallet.balances
    .filter((entry) => entry.walletType === walletType)
    .reduce((total, entry) => total + Math.max(0, Math.trunc(Number(entry.balance ?? 0))), 0);
}

function countMatches(source: string, pattern: RegExp): number {
  return source.match(pattern)?.length ?? 0;
}

function main() {
  testSaveAlchemyPresetDirtyDomain();
  testTickAlchemyMarksActiveJob();
  testTickEnhancementMarksDomains();
  testActiveJobVersionBumpHasSingleImplementation();

  console.log(
    JSON.stringify(
      {
        ok: true,
        answers: 'CraftPanelRuntimeService 现已把 alchemy_preset / active_job / enhancement_record / profession 显式接入 dirtyDomains，并让 active_job 的 jobVersion 随 craft 变更单调前进；active job version 递增实现只保留在 bumpTechniqueActivityJobVersion；同时强化灵石校验/扣费已切到 wallet，炼丹与强化不再只能退回 snapshot',
        completionMapping: 'release:proof:with-db.craft-persistence-dirty-domains',
      },
      null,
      2,
    ),
  );
}

main();
