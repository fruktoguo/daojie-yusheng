import assert from 'node:assert/strict';

import { TileType } from '@mud/shared';

import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { MapTemplateRepository } from '../runtime/map/map-template.repository';
import { WorldRuntimeCombatActionService } from '../runtime/world/combat/world-runtime-combat-action.service';
import { WorldRuntimePlayerSkillDispatchService } from '../runtime/world/combat/world-runtime-player-skill-dispatch.service';
import { WorldRuntimeThreatService } from '../runtime/world/combat/world-runtime-threat.service';

const SKILL_ID = 'skill.yi_kunlun_point_stone';

function createInstance(): MapInstanceRuntime {
  const templateRepository = new MapTemplateRepository();
  templateRepository.registerRuntimeMapTemplate({
    id: 'temporary_tile_skill_smoke',
    name: '临时地块技能 Smoke',
    width: 3,
    height: 3,
    routeDomain: 'system',
    tiles: [
      '...',
      '...',
      '...',
    ],
    spawnPoint: { x: 1, y: 1 },
    portals: [],
    npcs: [],
    monsters: [],
    safeZones: [],
    landmarks: [],
    containers: [],
    auras: [],
  });

  const instance = new MapInstanceRuntime({
    instanceId: 'public:temporary_tile_skill_smoke',
    template: templateRepository.getOrThrow('temporary_tile_skill_smoke'),
    monsterSpawns: [],
    kind: 'public',
    persistent: true,
    createdAt: Date.now(),
    displayName: '临时地块技能 Smoke',
    linePreset: 'peaceful',
    lineIndex: 1,
    instanceOrigin: 'smoke',
    defaultEntry: true,
    canDamageTile: true,
  });
  instance.tick = 10;
  return instance;
}

function main(): void {
  const instance = createInstance();
  const skill = {
    id: SKILL_ID,
    name: '叩地成岳',
    cost: 0,
    cooldown: 1,
    range: 6,
    targeting: {
      shape: 'single',
      range: 6,
      targetMode: 'tile',
      maxTargets: 1,
    },
    effects: [
      {
        type: 'temporary_tile',
        tileType: TileType.Stone,
        durationTicks: 60,
        hpFormula: 10,
      },
    ],
  };
  const attacker = {
    playerId: 'player:temporary-tile-smoke',
    x: 1,
    y: 1,
    hp: 100,
    maxHp: 100,
    qi: 100,
    maxQi: 100,
    instanceId: instance.meta.instanceId,
    lifeElapsedTicks: 5000,
    realmLv: 1,
    realm: { realmLv: 1 },
    attrs: {
      numericStats: {
        maxQiOutputPerTick: 100,
        extraRange: 0,
        extraArea: 0,
      },
      ratioDivisors: {},
      finalAttrs: {},
    },
    combat: {
      cooldownReadyTickBySkillId: {} as Record<string, number>,
    },
    techniques: {
      techniques: [
        {
          id: 'yi_kunlun',
          level: 1,
          skills: [skill],
        },
      ],
    },
  };
  const playerRuntimeService = {
    spendQi(): void {},
    setSkillCooldownReadyTick(_playerId: string, skillId: string, readyTick: number): void {
      attacker.combat.cooldownReadyTickBySkillId[skillId] = readyTick;
    },
  };
  const dispatch = new WorldRuntimePlayerSkillDispatchService(
    playerRuntimeService,
    {},
    new WorldRuntimeCombatActionService(),
    new WorldRuntimeThreatService(),
  );

  dispatch.dispatchTemporaryTileSkill(attacker, skill, 2, 1, attacker.lifeElapsedTicks, {
    getInstanceRuntimeOrThrow(): MapInstanceRuntime {
      return instance;
    },
    worldRuntimeCombatEffectsService: {
      pushActionLabelEffect(): void {},
      pushAttackEffect(): void {},
    },
  });

  const entries = instance.buildTemporaryTilePersistenceEntries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.expiresAtTick, 70);
  assert.equal(attacker.combat.cooldownReadyTickBySkillId[SKILL_ID], 5001);
  assert.equal(instance.advanceTemporaryTiles(69), false);
  assert.equal(instance.getEffectiveTileType(2, 1), TileType.Stone);
  assert.equal(instance.advanceTemporaryTiles(70), true);
  assert.equal(instance.getEffectiveTileType(2, 1), TileType.Floor);

  console.log(JSON.stringify({ ok: true, case: 'world-runtime-temporary-tile-skill' }, null, 2));
}

main();
