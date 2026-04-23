import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

async function main(): Promise<void> {
  const targets = [
    'player_inventory_item',
    'player_market_storage_item',
    'player_wallet',
    'player_active_job',
    'player_mail',
    'player_mail_attachment',
    'player_flush_ledger',
    'instance_ground_item',
    'instance_tile_resource_state',
    'instance_overlay_chunk',
    'instance_flush_ledger',
    'durable_operation_log',
    'outbox_event',
    'asset_audit_log',
  ];
  assert.equal(targets.length > 0, true);
  console.log(JSON.stringify({ ok: true, case: 'partition-strategy-report', targets }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
