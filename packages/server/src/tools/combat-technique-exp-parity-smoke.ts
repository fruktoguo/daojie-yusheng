import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { PlayerProgressionService } from '../runtime/player/player-progression.service';

function createService(): PlayerProgressionService {
  const service = new PlayerProgressionService(
    {
      getItemName(itemId: string) {
        return itemId;
      },
    } as never,
    {
      recalculate() {
        return true;
      },
      markPanelDirty() {
        return undefined;
      },
    } as never,
  );
  service.onModuleInit();
  return service;
}

function main(): void {
  const service = createService();
  const realmExp = service.getRealmCombatExp(12, 10, 'normal', 1.5, 0.75);
  const techniqueExp = service.getTechniqueCombatExp(12, 10, 'normal', 1.5, 0.75);
  assert.equal(techniqueExp, realmExp);
  console.log(
    JSON.stringify(
      {
        ok: true,
        case: 'combat-technique-exp-parity',
        realmExp,
        techniqueExp,
      },
      null,
      2,
    ),
  );
}

main();
