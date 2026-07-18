import assert from 'node:assert/strict';

import type { ProjectorViewLike } from '../network/projector-types';
import { buildFullWorldDelta } from '../network/world-projector.helpers';

const view: ProjectorViewLike = {
  playerId: 'player:time-chamber-reconnect',
  tick: 42,
  worldRevision: 7,
  selfRevision: 3,
  instance: {
    instanceId: 'time-chamber:test',
    templateId: 'time-chamber-template:test',
    name: '测试密室',
    kind: 'time_chamber',
    width: 7,
    height: 7,
  },
  self: {
    name: '测试玩家',
    displayName: '测试玩家',
    x: 3,
    y: 3,
    facing: 1,
  },
  visiblePlayers: [],
  localNpcs: [],
  localMonsters: [],
  localPortals: [],
  localGroundPiles: [],
  localContainers: [],
  localBuildings: [{
    id: 'build:meditation-mat',
    x: 1,
    y: 1,
    name: '蒲团',
    char: '蒲',
    color: '#8b5e34',
  }],
  localFormations: [],
};

const delta = buildFullWorldDelta(view);

assert.equal(delta.full, 1);
assert.equal(delta.reset, 1);
assert.equal(delta.mid, view.instance.templateId, '全量世界包必须携带地图模板 ID');
assert.equal(delta.iid, view.instance.instanceId, '全量世界包必须携带实例 ID');
assert.deepEqual(delta.bd, [{
  id: 'build:meditation-mat',
  x: 1,
  y: 1,
  n: '蒲团',
  ch: '蒲',
  c: '#8b5e34',
  rt: undefined,
  tt: undefined,
}]);

console.log(JSON.stringify({ ok: true, case: 'world-projector-full-context' }, null, 2));
