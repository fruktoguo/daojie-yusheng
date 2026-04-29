// @ts-nocheck

import assert from 'node:assert/strict';

function buildReport(databaseConfigured: boolean, maintenanceActive: boolean) {
  const limitedMode = !databaseConfigured || maintenanceActive;
  return {
    ok: true,
    databaseConfigured,
    maintenanceActive,
    limitedMode,
    strongPersistenceAllowed: databaseConfigured && !maintenanceActive,
  };
}

async function main(): Promise<void> {
  const report = buildReport(false, false);
  assert.equal(report.ok, true);
  assert.equal(report.databaseConfigured, false);
  assert.equal(report.limitedMode, true);
  assert.equal(report.strongPersistenceAllowed, false);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
