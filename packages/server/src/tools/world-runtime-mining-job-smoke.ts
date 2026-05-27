import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { TileType } from '@mud/shared';
import { TechniqueActivityPipelineService } from '../runtime/craft/pipeline/technique-activity-pipeline.service';
import type { PipelineContext } from '../runtime/craft/pipeline/technique-activity-strategy';
import { MiningStrategy } from '../runtime/craft/pipeline/strategies/mining.strategy';
import { buildTechniqueActivityTaskListView } from '../runtime/craft/technique-activity-task-view.helpers';

type SmokePlayer = {
  playerId: string;
  instanceId: string;
  x: number;
  y: number;
  attrs: { numericStats: { physAtk: number } };
  realm: { realmLv: number };
  miningSkill: { level: number; exp: number; expToNext: number };
  equipment: { slots: unknown[] };
  miningJob?: unknown;
  dirtyDomains: Set<string>;
  persistentRevision: number;
};

class SmokeMiningInstance {
  hp: number;
  readonly maxHp: number;
  damageCalls = 0;

  constructor(hp: number) {
    this.hp = hp;
    this.maxHp = hp;
  }

  getTileCombatState(x: number, y: number) {
    assert.equal(x, 1);
    assert.equal(y, 0);
    if (this.hp <= 0) {
      return {
        tileType: TileType.BlackIronOre,
        hp: 0,
        maxHp: this.maxHp,
        destroyed: true,
      };
    }
    return {
      tileType: TileType.BlackIronOre,
      hp: this.hp,
      maxHp: this.maxHp,
      destroyed: false,
    };
  }

  damageTile(x: number, y: number, damage: number) {
    assert.equal(x, 1);
    assert.equal(y, 0);
    this.damageCalls += 1;
    const appliedDamage = Math.min(this.hp, Math.max(0, Math.trunc(Number(damage) || 0)));
    this.hp = Math.max(0, this.hp - appliedDamage);
    return {
      appliedDamage,
      hp: this.hp,
      maxHp: this.maxHp,
      destroyed: this.hp <= 0,
      tileDrops: appliedDamage > 0 ? [{ itemId: 'mat.black_iron_ore', count: 1 }] : [],
    };
  }
}

function createPlayer(): SmokePlayer {
  return {
    playerId: 'player:mining-job-smoke',
    instanceId: 'instance:mining-job-smoke',
    x: 0,
    y: 0,
    attrs: { numericStats: { physAtk: 1 } },
    realm: { realmLv: 11 },
    miningSkill: { level: 11, exp: 0, expToNext: 10_000 },
    equipment: { slots: [] },
    dirtyDomains: new Set<string>(),
    persistentRevision: 0,
  };
}

function createPipeline(): TechniqueActivityPipelineService {
  const pipeline = new TechniqueActivityPipelineService();
  pipeline.register(new MiningStrategy());
  return pipeline;
}

function createContext(
  instance: SmokeMiningInstance,
  inventory: unknown[],
  sectExpansions: unknown[],
  pendingCommands: unknown[] = [],
  location: { instanceId: string; x: number; y: number } = { instanceId: 'instance:mining-job-smoke', x: 0, y: 0 },
): PipelineContext {
  const playerRuntimeService = {
    receiveInventoryItem(_playerId: string, item: unknown) {
      inventory.push(item);
    },
    markPersistenceDirtyDomains(player: SmokePlayer, domains: string[]) {
      for (const domain of domains) {
        player.dirtyDomains.add(domain);
      }
    },
    bumpPersistentRevision(player: SmokePlayer) {
      player.persistentRevision += 1;
    },
  };

  const deps = {
    getInstanceRuntime(instanceId: string) {
      assert.equal(instanceId, 'instance:mining-job-smoke');
      return instance;
    },
    getPlayerLocation(playerId: string) {
      assert.equal(playerId, 'player:mining-job-smoke');
      return location;
    },
    hasPendingCommand() {
      return pendingCommands.length > 0;
    },
    enqueuePendingCommand(playerId: string, command: unknown) {
      assert.equal(playerId, 'player:mining-job-smoke');
      pendingCommands.push(command);
    },
    playerRuntimeService,
    contentTemplateRepository: {
      createItem(itemId: string, count: number) {
        return { itemId, count, source: 'smoke' };
      },
    },
    worldRuntimeFormationService: {
      mitigateTerrainDamage(_instanceId: string, _x: number, _y: number, damage: number) {
        return damage;
      },
    },
    worldRuntimeSectService: {
      expandSectForDestroyedTile(instanceId: string, x: number, y: number) {
        sectExpansions.push({ instanceId, x, y });
        return true;
      },
    },
  };

  return {
    contentTemplateRepository: {
      getItemName(itemId: string) {
        return itemId;
      },
      normalizeItem(item: { itemId: string; count: number }) {
        return item;
      },
    },
    resolveExpToNextByLevel() {
      return 10_000;
    },
    getInstanceRuntime(instanceId: string) {
      assert.equal(instanceId, 'instance:mining-job-smoke');
      return instance;
    },
    deps,
  };
}

function main(): void {
  const pipeline = createPipeline();

  const visiblePlayer = createPlayer();
  const visibleInstance = new SmokeMiningInstance(5);
  const visibleInventory: unknown[] = [];
  const visibleSectExpansions: unknown[] = [];
  const visibleContext = createContext(visibleInstance, visibleInventory, visibleSectExpansions);
  const startResult = pipeline.startLifecycle(visiblePlayer, 'mining', { targetRef: 'tile:1:0' }, visibleContext);
  assert.equal(startResult.lifecycle, 'start');
  assert.equal(startResult.ok, true);
  assert.equal(startResult.started, true);
  assert.ok(visiblePlayer.miningJob);

  const view = buildTechniqueActivityTaskListView(visiblePlayer);
  const miningTask = view.tasks.find((task) => task.kind === 'mining');
  assert.equal(miningTask?.state, 'running');
  assert.equal(miningTask?.targetLabel, '玄铁矿');
  assert.equal(miningTask?.canCancel, true);
  assert.equal(miningTask?.workTotalTicks, 5);
  assert.equal(miningTask?.workRemainingTicks, 5);

  const beforeInterruptRemaining = miningTask?.workRemainingTicks;
  const interruptResult = pipeline.interrupt(visiblePlayer, 'mining', 'attack', visibleContext);
  assert.equal(interruptResult.ok, true);
  assert.equal(interruptResult.messages?.[0]?.key, 'notice.craft.activity-interrupted-wait-generic');
  assert.equal(interruptResult.messages?.[0]?.vars?.activityLabel, '挖矿');
  assert.equal(interruptResult.messages?.[0]?.vars?.reasonLabel, '出手');
  assert.equal(interruptResult.messages?.[0]?.vars?.ticks, 10);
  assert.equal(interruptResult.messages?.[0]?.text, undefined);
  const interruptedTask = buildTechniqueActivityTaskListView(visiblePlayer).tasks.find((task) => task.kind === 'mining');
  assert.equal(interruptedTask?.state, 'interrupt_wait');
  assert.equal(interruptedTask?.workRemainingTicks, beforeInterruptRemaining);
  assert.equal(interruptedTask?.interruptWaitRemainingTicks, 10);
  const pauseTickResult = pipeline.tickLifecycle(visiblePlayer, 'mining', visibleContext) as any;
  assert.equal(pauseTickResult.lifecycle, 'tick');
  assert.equal(pauseTickResult.ok, true);
  const pauseTickTask = buildTechniqueActivityTaskListView(visiblePlayer).tasks.find((task) => task.kind === 'mining');
  assert.equal(pauseTickTask?.workRemainingTicks, beforeInterruptRemaining);
  assert.equal(pauseTickTask?.interruptWaitRemainingTicks, 9);

  const cancelResult = pipeline.cancelLifecycle(visiblePlayer, 'mining', visibleContext);
  assert.equal(cancelResult.lifecycle, 'cancel');
  assert.equal(cancelResult.ok, true);
  assert.equal(cancelResult.cancelled, true);
  assert.equal(visiblePlayer.miningJob, null);
  assert.equal(buildTechniqueActivityTaskListView(visiblePlayer).tasks.some((task) => task.kind === 'mining'), false);
  assert.equal(visibleInstance.damageCalls, 0);
  assert.equal(visibleInventory.length, 0);
  assert.equal(visiblePlayer.miningSkill.exp, 0);

  const tickPlayer = createPlayer();
  const tickInstance = new SmokeMiningInstance(1);
  const inventory: unknown[] = [];
  const sectExpansions: unknown[] = [];
  const pendingCommands: unknown[] = [];
  const tickContext = createContext(tickInstance, inventory, sectExpansions, pendingCommands);
  assert.equal(pipeline.start(tickPlayer, 'mining', { targetX: 1, targetY: 0 }, tickContext).ok, true);
  const beforeExp = tickPlayer.miningSkill.exp;
  const tickResult = pipeline.tickLifecycle(tickPlayer, 'mining', tickContext) as any;
  assert.equal(tickResult.lifecycle, 'tick');
  assert.equal(tickResult.ok, true);
  assert.equal(tickResult.inventoryChanged, false);
  assert.equal(tickResult.attrChanged, false);
  assert.equal(tickInstance.damageCalls, 0);
  assert.equal(inventory.length, 0);
  assert.equal(tickPlayer.miningSkill.exp, beforeExp);
  assert.ok(tickPlayer.miningJob);
  const tickMiningJob = tickPlayer.miningJob as { jobRunId?: string };
  assert.deepEqual(pendingCommands, [{
    kind: 'engageBattle',
    targetPlayerId: null,
    targetMonsterId: null,
    targetX: 1,
    targetY: 0,
    locked: true,
    miningJobRunId: tickMiningJob.jobRunId,
    miningTargetRef: 'tile:1:0',
  }]);
  assert.deepEqual(sectExpansions, []);
  assert.equal(tickPlayer.dirtyDomains.has('active_job'), true);
  assert.equal(tickPlayer.dirtyDomains.has('profession'), false);

  const retaliatingPlayer = {
    ...createPlayer(),
    combat: { retaliatePlayerTargetId: 'player:attacker' },
  } as SmokePlayer & { combat: { retaliatePlayerTargetId: string } };
  const retaliatingInstance = new SmokeMiningInstance(3);
  const retaliatingPendingCommands: unknown[] = [];
  const retaliatingContext = createContext(retaliatingInstance, [], [], retaliatingPendingCommands);
  assert.equal(pipeline.start(retaliatingPlayer, 'mining', { targetX: 1, targetY: 0 }, retaliatingContext).ok, true);
  const retaliatingTickResult = pipeline.tickLifecycle(retaliatingPlayer, 'mining', retaliatingContext) as any;
  assert.equal(retaliatingTickResult.ok, true);
  assert.deepEqual(retaliatingPendingCommands, []);
  assert.equal(retaliatingInstance.damageCalls, 0);

  const farPlayer = createPlayer();
  farPlayer.x = 9;
  farPlayer.y = 9;
  const farInstance = new SmokeMiningInstance(3);
  const farPendingCommands: unknown[] = [];
  const farContext = createContext(
    farInstance,
    [],
    [],
    farPendingCommands,
    { instanceId: 'instance:mining-job-smoke', x: 9, y: 9 },
  );
  assert.equal(pipeline.start(farPlayer, 'mining', { targetX: 1, targetY: 0 }, createContext(farInstance, [], [])).ok, true);
  const farJob = farPlayer.miningJob as { phase?: string; pausedTicks?: number; jobRunId?: string };
  farJob.phase = 'paused';
  farJob.pausedTicks = 1;
  const farPauseResult = pipeline.tickLifecycle(farPlayer, 'mining', farContext) as any;
  assert.equal(farPauseResult.ok, true);
  assert.equal((farPlayer.miningJob as { phase?: string } | null)?.phase, 'mining');
  const farResumeResult = pipeline.tickLifecycle(farPlayer, 'mining', farContext) as any;
  assert.equal(farResumeResult.ok, true);
  assert.deepEqual(farPendingCommands, [{
    kind: 'engageBattle',
    targetPlayerId: null,
    targetMonsterId: null,
    targetX: 1,
    targetY: 0,
    locked: true,
    miningJobRunId: farJob.jobRunId,
    miningTargetRef: 'tile:1:0',
  }]);
  assert.ok(farPlayer.miningJob);

  console.log(JSON.stringify({
    ok: true,
    answers: '挖矿已能作为统一技艺 job 启动、显示、打断等待独立展示、取消，并在 tick 中持续发起地块战斗攻击；地块伤害/掉落/挖矿经验仍由战斗链路结算。',
  }, null, 2));
}

main();
