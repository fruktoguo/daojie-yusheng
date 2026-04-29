import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { RuntimeMaintenanceService } from '../runtime/world/runtime-maintenance.service';

function main(): void {
  const maintenanceService = new RuntimeMaintenanceService();
  assert.equal(typeof maintenanceService.isRuntimeMaintenanceActive(), 'boolean');
  console.log(
    JSON.stringify(
      {
        ok: true,
        case: 'archive-vacuum-window-report',
        maintenanceActive: maintenanceService.isRuntimeMaintenanceActive(),
      },
      null,
      2,
    ),
  );
}

main();
