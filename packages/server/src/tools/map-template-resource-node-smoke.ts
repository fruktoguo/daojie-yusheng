import assert from 'node:assert/strict';

import { MapTemplateRepository } from '../runtime/map/map-template.repository';

function main(): void {
  const repository = new MapTemplateRepository();
  repository.onModuleInit();

  const yunlaiTown = repository.getOrThrow('yunlai_town');
  const moondewGrass = yunlaiTown.containers.find((entry) => entry.id === 'lm_yunlai_moondew_1_1');
  const greenSpiritStem = yunlaiTown.containers.find((entry) => entry.id === 'lm_yunlai_spirit_stem_26_1');

  assert.ok(moondewGrass, '云来镇月露草容器未生成');
  assert.equal(moondewGrass?.variant, 'herb');
  assert.equal(moondewGrass?.name, '月露草');
  assert.equal(moondewGrass?.x, 1);
  assert.equal(moondewGrass?.y, 1);

  assert.ok(greenSpiritStem, '云来镇青灵茎容器未生成');
  assert.equal(greenSpiritStem?.variant, 'herb');
  assert.equal(greenSpiritStem?.name, '青灵茎');
  assert.equal(greenSpiritStem?.x, 26);
  assert.equal(greenSpiritStem?.y, 1);

  const herbContainerCount = yunlaiTown.containers.filter((entry) => entry.variant === 'herb').length;
  assert.equal(herbContainerCount, 20);

  const darksoil = repository.getOrThrow('darksoil_abyss');
  const darksoilHerbs = darksoil.containers.filter((entry) => entry.variant === 'herb');
  assert.equal(darksoilHerbs.length, 9);
  const reachable = collectWalkableComponent(darksoil, darksoil.spawnX, darksoil.spawnY);
  const portal = darksoil.portals[0];
  assert.ok(portal, '玄壤深渊入口传送点缺失');
  assert.equal(reachable.has(tileKey(portal.x, portal.y)), true, '入口传送点必须连通入口厅');
  for (const herb of darksoilHerbs) {
    const standable = hasAdjacentReachableTile(darksoil, reachable, herb.x, herb.y);
    assert.equal(standable, true, `${herb.name} (${herb.x},${herb.y}) 必须从出生点可达`);
  }

  console.log(JSON.stringify({
    ok: true,
    case: 'map-template-resource-node',
    mapId: yunlaiTown.id,
    herbContainerCount,
    darksoilHerbContainerCount: darksoilHerbs.length,
    sampleContainers: [
      { id: moondewGrass.id, name: moondewGrass.name, x: moondewGrass.x, y: moondewGrass.y, variant: moondewGrass.variant },
      { id: greenSpiritStem.id, name: greenSpiritStem.name, x: greenSpiritStem.x, y: greenSpiritStem.y, variant: greenSpiritStem.variant },
    ],
  }, null, 2));
}

main();

function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

function collectWalkableComponent(
  template: { width: number; height: number; walkableMask: Uint8Array },
  originX: number,
  originY: number,
): Set<string> {
  const seen = new Set<string>();
  const queue = [{ x: originX, y: originY }];
  const width = template.width;
  if (template.walkableMask[originY * width + originX] !== 1) {
    return seen;
  }
  seen.add(tileKey(originX, originY));
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) {
          continue;
        }
        const x = current.x + dx;
        const y = current.y + dy;
        if (x < 0 || y < 0 || x >= template.width || y >= template.height) {
          continue;
        }
        const key = tileKey(x, y);
        if (seen.has(key) || template.walkableMask[y * width + x] !== 1) {
          continue;
        }
        seen.add(key);
        queue.push({ x, y });
      }
    }
  }
  return seen;
}

function hasAdjacentReachableTile(
  template: { width: number; height: number },
  reachable: Set<string>,
  x: number,
  y: number,
): boolean {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= template.width || ny >= template.height) {
        continue;
      }
      if (reachable.has(tileKey(nx, ny))) {
        return true;
      }
    }
  }
  return false;
}
