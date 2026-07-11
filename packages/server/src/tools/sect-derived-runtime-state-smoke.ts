import assert from 'node:assert/strict';

import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { MapTemplateRepository } from '../runtime/map/map-template.repository';

function main(): void {
  const templates = new MapTemplateRepository();
  templates.registerRuntimeMapTemplate({
    id: 'sect_derived_state_smoke',
    name: '宗门派生态烟测图',
    width: 3,
    height: 3,
    routeDomain: 'system',
    tiles: ['...', '...', '...'],
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
    instanceId: 'real:sect-derived-state-smoke',
    template: templates.getOrThrow('sect_derived_state_smoke'),
    monsterSpawns: [],
    kind: 'public',
    persistent: true,
    createdAt: Date.now(),
    displayName: '宗门派生态烟测图',
    linePreset: 'real',
    lineIndex: 1,
    instanceOrigin: 'smoke',
    defaultEntry: true,
    canDamageTile: true,
  });

  instance.hydrateOverlayChunks([{
    patchKind: 'portal',
    patchPayload: {
      portals: [
        {
          id: 'portal:ordinary',
          x: 0,
          y: 0,
          targetMapId: 'sect_derived_state_smoke',
          targetX: 1,
          targetY: 1,
        },
        {
          id: 'portal:stale-sect',
          x: 2,
          y: 2,
          targetMapId: 'sect_derived_state_smoke',
          targetX: 1,
          targetY: 1,
          sectId: 'sect:stale',
        },
      ],
    },
  }]);
  assert.deepEqual(instance.runtimePortals.map((portal) => portal.id), ['portal:ordinary']);

  instance.addRuntimePortal({
    id: 'portal:current-sect',
    x: 2,
    y: 2,
    targetMapId: 'sect_derived_state_smoke',
    targetX: 1,
    targetY: 1,
    sectId: 'sect:current',
  });
  const chunks = instance.buildOverlayPersistenceChunks();
  const persistedPortals = chunks[0]?.patchPayload?.portals ?? [];
  assert.deepEqual(persistedPortals.map((portal: { id?: string }) => portal.id), ['portal:ordinary']);

  console.log('sect-derived-runtime-state-smoke: ok');
}

main();
