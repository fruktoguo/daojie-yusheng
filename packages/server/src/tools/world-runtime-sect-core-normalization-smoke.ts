import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { MapTemplateRepository } from '../runtime/map/map-template.repository';
import { WorldRuntimeSectService } from '../runtime/world/world-runtime-sect.service';

async function main(): Promise<void> {
  const sectId = 'sect:core-normalization-smoke';
  const publicInstanceId = 'real:sect_core_normalization_world';
  const sectInstanceId = `sect:${sectId}:main`;
  const templateRepository = new MapTemplateRepository();

  templateRepository.registerRuntimeMapTemplate({
    id: 'sect_core_normalization_world',
    name: '宗门核心归一主世界',
    width: 5,
    height: 5,
    routeDomain: 'system',
    tiles: [
      '.....',
      '.....',
      '.....',
      '.....',
      '.....',
    ],
    spawnPoint: { x: 2, y: 2 },
    portals: [],
    npcs: [],
    monsters: [],
    safeZones: [],
    landmarks: [],
    containers: [],
    auras: [],
  });
  templateRepository.registerRuntimeMapTemplate({
    id: `sect_domain:${sectId}`,
    name: '宗门核心归一宗门',
    width: 5,
    height: 5,
    routeDomain: `sect:${sectId}`,
    sectMap: true,
    sectId,
    sectCoreX: 0,
    sectCoreY: 0,
    tiles: [
      '.....',
      '.....',
      '.....',
      '.....',
      '.....',
    ],
    spawnPoint: { x: 0, y: 0 },
    portals: [],
    npcs: [],
    monsters: [],
    safeZones: [],
    landmarks: [],
    containers: [],
    auras: [],
  });

  const publicInstance = new MapInstanceRuntime({
    instanceId: publicInstanceId,
    template: templateRepository.getOrThrow('sect_core_normalization_world'),
    monsterSpawns: [],
    kind: 'public',
    persistent: true,
    createdAt: Date.now(),
    displayName: '宗门核心归一主世界',
    linePreset: 'real',
    lineIndex: 1,
    instanceOrigin: 'smoke',
    defaultEntry: true,
    canDamageTile: true,
  });
  const sectInstance = new MapInstanceRuntime({
    instanceId: sectInstanceId,
    template: templateRepository.getOrThrow(`sect_domain:${sectId}`),
    monsterSpawns: [],
    kind: 'sect',
    persistent: true,
    createdAt: Date.now(),
    displayName: '宗门核心归一宗门',
    linePreset: 'peaceful',
    lineIndex: 1,
    instanceOrigin: 'sect',
    defaultEntry: false,
    canDamageTile: true,
    ownerSectId: sectId,
  });

  const service = new WorldRuntimeSectService({}, templateRepository, {});
  const now = Date.now();
  const sect = {
    sectId,
    name: '归一宗',
    mark: '归',
    founderPlayerId: 'player:leader',
    leaderPlayerId: 'player:leader',
    status: 'active',
    entranceInstanceId: publicInstanceId,
    entranceTemplateId: 'sect_core_normalization_world',
    entranceX: 4,
    entranceY: 4,
    sectInstanceId,
    sectTemplateId: `sect_domain:${sectId}:x-2_2:y-2_2`,
    coreX: 2,
    coreY: 2,
    expansionRadius: 2,
    mapMinX: -2,
    mapMaxX: 2,
    mapMinY: -2,
    mapMaxY: 2,
    members: [{ playerId: 'player:leader', name: '宗主', roleId: 'leader', joinedAt: now }],
    rolePermissions: undefined,
    createdAt: now,
    updatedAt: now,
  };

  sectInstance.addRuntimePortal({
    x: 2,
    y: 2,
    kind: 'sect_core',
    trigger: 'manual',
    targetMapId: publicInstance.template.id,
    targetInstanceId: publicInstanceId,
    targetX: 4,
    targetY: 4,
    name: '旧宗门核心',
    char: '宗',
    sectId,
  });
  assert.equal(sectInstance.getPortalAtTile(2, 2)?.kind, 'sect_core');

  service.registerSectTemplate(sect);
  service.attachSectPortals(sect, publicInstance, sectInstance);

  assert.equal(sect.coreX, 0);
  assert.equal(sect.coreY, 0);
  assert.equal(sectInstance.getPortalAtTile(2, 2), null);
  assert.equal(sectInstance.getPortalAtTile(0, 0)?.kind, 'sect_core');
  assert.equal(sectInstance.runtimePortals.filter((portal: any) => portal.sectId === sectId && portal.kind === 'sect_core').length, 1);

  sect.coreX = 2;
  sect.coreY = 2;
  sect.sectTemplateId = `sect_domain:${sectId}:x-2_2:y-2_2`;
  (service as any).sectsById.set(sectId, sect);

  const persistedPayloads: Array<Record<string, unknown>> = [];
  (service as any).ensurePersistencePool = async () => ({
    connect() {
      return {
        async query(sql: string, params?: unknown[]) {
          if (sql.includes('INSERT INTO server_sect') && params) {
            persistedPayloads.push(JSON.parse(String(params[14])));
          }
        },
        release() {},
      };
    },
  });

  await service.saveSectDocument();
  assert.equal(persistedPayloads.length, 1);
  assert.equal(persistedPayloads[0]?.coreX, 0);
  assert.equal(persistedPayloads[0]?.coreY, 0);
  assert.equal(persistedPayloads[0]?.sectTemplateId, `sect_domain:${sectId}`);

  console.log('world-runtime-sect-core-normalization-smoke passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
