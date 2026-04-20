// @ts-nocheck

const pg = require("pg");
const core = require("@nestjs/core");

const { AppModule } = require("../app.module");
const { NextGmAdminService } = require("../http/next/next-gm-admin.service");
const { resolveServerNextDatabaseUrl } = require("../config/env-alias");

const NATIVE_CONFIG_SCOPE = "server_next_afdian_config_v1";
const LEGACY_CONFIG_SCOPE = "server_next_legacy_afdian_config_v1";
const CONFIG_KEY = "afdian";
const NATIVE_ORDER_SCOPE = "server_next_afdian_orders_v1";
const LEGACY_ORDER_SCOPE = "server_next_legacy_afdian_orders_v1";
/**
 * main：执行核心业务逻辑。
 * @returns 函数返回值。
 */


async function main() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const databaseUrl = resolveServerNextDatabaseUrl();
  if (!databaseUrl.trim()) {
    throw new Error("missing SERVER_NEXT_DATABASE_URL/DATABASE_URL");
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const app = await core.NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const client = await pool.connect();
    try {
      await client.query(
        "DELETE FROM persistent_documents WHERE scope = ANY($1::varchar[])",
        [[NATIVE_CONFIG_SCOPE, LEGACY_CONFIG_SCOPE, NATIVE_ORDER_SCOPE, LEGACY_ORDER_SCOPE]],
      );
      await client.query(
        'INSERT INTO persistent_documents(scope, key, payload, "updatedAt") VALUES ($1, $2, $3::jsonb, now())',
        [NATIVE_CONFIG_SCOPE, CONFIG_KEY, JSON.stringify({ userId: "native-user", apiBaseUrl: "https://native.example/api", publicBaseUrl: "https://native.example" })],
      );
      await client.query(
        'INSERT INTO persistent_documents(scope, key, payload, "updatedAt") VALUES ($1, $2, $3::jsonb, now())',
        [LEGACY_CONFIG_SCOPE, CONFIG_KEY, JSON.stringify({ userId: "legacy-user", apiBaseUrl: "https://legacy.example/api", publicBaseUrl: "https://legacy.example" })],
      );
      await client.query(
        'INSERT INTO persistent_documents(scope, key, payload, "updatedAt") VALUES ($1, $2, $3::jsonb, now())',
        [NATIVE_ORDER_SCOPE, "native-order", JSON.stringify({ outTradeNo: "native-order", userId: "native-user", status: 2, totalAmount: "10.00", showAmount: "10.00", discount: "0.00", skuDetail: [], createdAt: "2026-04-17T00:00:00.000Z", updatedAt: "2026-04-17T00:00:00.000Z", lastSource: "native" })],
      );
      await client.query(
        'INSERT INTO persistent_documents(scope, key, payload, "updatedAt") VALUES ($1, $2, $3::jsonb, now())',
        [LEGACY_ORDER_SCOPE, "legacy-order", JSON.stringify({ outTradeNo: "legacy-order", userId: "legacy-user", status: 1, totalAmount: "20.00", showAmount: "20.00", discount: "0.00", skuDetail: [], createdAt: "2026-04-17T00:00:00.000Z", updatedAt: "2026-04-17T00:00:00.000Z", lastSource: "legacy" })],
      );
    }
    finally {
      client.release();
    }

    const service = app.get(NextGmAdminService);
    await service.reloadPersistentCompatibilityState();

    const config = service.getAfdianConfig();
    const orders = await service.listAfdianOrders({ limit: 10, offset: 0 });

    if (config?.config?.userId !== "native-user") {
      throw new Error(`expected native afdian config, got ${JSON.stringify(config)}`);
    }
    if (typeof config?.status?.apiBaseUrl !== "string"
      || !config.status.apiBaseUrl.includes("native.example")
      || config.status.apiBaseUrl.includes("legacy.example")) {
      throw new Error(`expected native afdian apiBaseUrl, got ${JSON.stringify(config?.status)}`);
    }
    const orderIds = Array.isArray(orders?.items) ? orders.items.map((entry) => entry.outTradeNo) : [];
    if (!orderIds.includes("native-order") || orderIds.includes("legacy-order")) {
      throw new Error(`expected native-only afdian orders, got ${JSON.stringify(orderIds)}`);
    }

    console.log(JSON.stringify({
      ok: true,
      configUserId: config.config.userId,
      apiBaseUrl: config.status.apiBaseUrl,
      orderIds,
      completionMapping: "05.gm-afdian-scopes.next-only",
    }, null, 2));
  }
  finally {
    await app.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
