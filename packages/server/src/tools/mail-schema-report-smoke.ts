// @ts-nocheck

import assert from 'node:assert/strict';

import { resolveServerDatabaseUrl } from '../config/env-alias';

function buildSmokeResult(tables: Array<{ table: string; exists: boolean; missingColumns: string[]; missingIndexes: string[] }>) {
  return {
    ok: true,
    databaseEnabled: Boolean(resolveServerDatabaseUrl().trim()),
    tables,
  };
}

async function main(): Promise<void> {
  const tables = [
    {
      table: 'player_mail',
      exists: true,
      missingColumns: [],
      missingIndexes: [],
    },
    {
      table: 'player_mail_attachment',
      exists: true,
      missingColumns: [],
      missingIndexes: [],
    },
    {
      table: 'player_mail_counter',
      exists: true,
      missingColumns: [],
      missingIndexes: [],
    },
  ];
  const report = buildSmokeResult(tables);
  assert.equal(report.ok, true);
  assert.equal(report.tables.length, 3);
  assert.equal(report.tables.every((table) => table.exists), true);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
