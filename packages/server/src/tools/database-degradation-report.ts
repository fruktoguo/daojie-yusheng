import { RuntimeMaintenanceService } from '../runtime/world/runtime-maintenance.service';
import { resolveServerDatabaseUrl } from '../config/env-alias';

function main(): void {
  const databaseConfigured = resolveServerDatabaseUrl().trim().length > 0;
  const maintenanceService = new RuntimeMaintenanceService();
  const maintenanceActive = maintenanceService.isRuntimeMaintenanceActive();
  const limitedMode = !databaseConfigured || maintenanceActive;

  console.log(JSON.stringify({
    ok: true,
    databaseConfigured,
    maintenanceActive,
    limitedMode,
    strongPersistenceAllowed: databaseConfigured && !maintenanceActive,
    message: limitedMode
      ? '数据库不可用或维护窗口内：强持久化操作进入受限模式'
      : '数据库可用：强持久化操作保持开放',
  }, null, 2));
}

main();
