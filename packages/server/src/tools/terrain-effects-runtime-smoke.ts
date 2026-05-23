import assert from 'node:assert/strict';

import { ContentTemplateRepository } from '../content/content-template.repository';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { WorldRuntimeInstanceTickOrchestrationService } from '../runtime/world/world-runtime-instance-tick-orchestration.service';

function createPlayerRuntimeService(contentTemplateRepository: ContentTemplateRepository): PlayerRuntimeService {
  return new PlayerRuntimeService(
    contentTemplateRepository,
    {
      has() { return false; },
      list() { return []; },
    },
    {
      createInitialState() {
        return {
          revision: 1,
          stage: 'mortal',
          rawBaseAttrs: {},
          baseAttrs: {},
          finalAttrs: {},
          numericStats: { hpRegenRate: 0, qiRegenRate: 0 },
          ratioDivisors: {},
        };
      },
      recalculate() { return false; },
    },
    {
      initializePlayer() {},
      advanceCultivation() {
        return { changed: false, notices: [], actionsDirty: false, dirtyDomains: [] };
      },
    },
    undefined,
    undefined,
  );
}

function createMoltenPoolInstance() {
  return {
    meta: { instanceId: 'terrain-effect-instance', templateId: 'terrain_effect_test' },
    template: { id: 'terrain_effect_test' },
    tick: 0,
    playersById: new Map([['player:terrain-effect', true]]),
    tickOnce() {
      this.tick += 1;
      return { completedBuildings: [], transfers: [], monsterActions: [] };
    },
    listPlayerIds() {
      return ['player:terrain-effect'];
    },
    getPlayerPosition(playerId: string) {
      return playerId === 'player:terrain-effect' ? { x: 0, y: 0 } : null;
    },
    getTileLayerState(x: number, y: number) {
      return x === 0 && y === 0 ? { terrain: 'molten_pool' } : null;
    },
    getTileQiDrainPerTick() {
      return 0;
    },
  };
}

function createDeps(instance: ReturnType<typeof createMoltenPoolInstance>, playerRuntimeService: PlayerRuntimeService, contentTemplateRepository: ContentTemplateRepository) {
  const progress = new Map([[instance.meta.instanceId, 0]]);
  return {
    tick: 0,
    contentTemplateRepository,
    playerRuntimeService,
    listInstanceRuntimes() { return [instance]; },
    getInstanceRuntime(instanceId: string) { return instanceId === instance.meta.instanceId ? instance : null; },
    listConnectedPlayerIds() { return ['player:terrain-effect']; },
    getPlayerLocation(playerId: string) {
      return playerId === 'player:terrain-effect' ? { instanceId: instance.meta.instanceId, sessionId: 'session:terrain-effect' } : null;
    },
    worldRuntimeCombatEffectsService: { resetFrameEffects() {} },
    worldRuntimeTickProgressService: {
      getProgress(instanceId: string) { return progress.get(instanceId) ?? 0; },
      setProgress(instanceId: string, value: number) { progress.set(instanceId, value); },
    },
    worldRuntimeMetricsService: {
      recordIdleFrame() {},
      recordFrameResult() {},
    },
    worldRuntimeNavigationService: {
      getBlockedPlayerIds() { return new Set<string>(); },
      clearNavigationIntent() {},
      materializeNavigationCommandsForInstance() {},
    },
    worldRuntimeAutoCombatService: {},
    worldRuntimeCraftTickService: { advanceCraftJobs() {} },
    worldRuntimeLootContainerService: { advanceContainerSearches() {} },
    processPendingRespawns() {},
    materializeNavigationCommands() {},
    dispatchPendingCommands() {},
    dispatchPendingSystemCommands() {},
    refreshQuestStates() {},
  };
}

async function main() {
  const contentTemplateRepository = new ContentTemplateRepository();
  contentTemplateRepository.loadAll();

  const terrainEffects = contentTemplateRepository.getTerrainTickEffects('molten_pool');
  assert.equal(terrainEffects.length, 1);
  assert.equal(terrainEffects[0]?.applyBuff.buffId, 'terrain_molten_pool_burn');

  const playerRuntimeService = createPlayerRuntimeService(contentTemplateRepository);
  const player = playerRuntimeService.createFreshPlayer('player:terrain-effect', 'session:terrain-effect');
  player.hp = 100;
  player.maxHp = 100;
  player.qi = 100;
  player.maxQi = 100;
  player.combat.cultivationActive = false;
  player.vitalRecoveryDeferredUntilTick = 999;
  playerRuntimeService.players.set(player.playerId, player);

  const instance = createMoltenPoolInstance();
  const service = new WorldRuntimeInstanceTickOrchestrationService();
  await service.advanceFrame(createDeps(instance, playerRuntimeService, contentTemplateRepository), 1000);

  const burn = player.buffs.buffs.find((entry) => entry.buffId === 'terrain_molten_pool_burn');
  assert.ok(burn, 'expected molten pool terrain to apply configured buff');
  assert.equal(burn.stacks, 1);
  assert.equal(player.maxHp, 100);
  assert.equal(player.hp, 99);

  await service.advanceFrame(createDeps(instance, playerRuntimeService, contentTemplateRepository), 1000);
  assert.equal(burn.stacks, 2);
  assert.equal(player.hp, 97);

  console.log('terrain-effects-runtime-smoke ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
