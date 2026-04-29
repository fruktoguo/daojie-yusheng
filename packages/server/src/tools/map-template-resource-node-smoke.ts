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

  console.log(JSON.stringify({
    ok: true,
    case: 'map-template-resource-node',
    mapId: yunlaiTown.id,
    herbContainerCount,
    sampleContainers: [
      { id: moondewGrass.id, name: moondewGrass.name, x: moondewGrass.x, y: moondewGrass.y, variant: moondewGrass.variant },
      { id: greenSpiritStem.id, name: greenSpiritStem.name, x: greenSpiritStem.x, y: greenSpiritStem.y, variant: greenSpiritStem.variant },
    ],
  }, null, 2));
}

main();
